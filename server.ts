import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  clearSessionCookie,
  extractTokenFromRequest,
  hashPassword,
  setSessionCookie,
  signSessionToken,
  verifyCsrfProtection,
  verifyPassword,
  verifySessionToken,
} from './server/auth.ts';
import { getDb, parseUserRow } from './server/db.ts';
import {
  evaluateIssueValidation,
  hasUserPermission,
  isDueWithinDays,
  isIssueOverdue,
  resolveVerifiedReturnStatus,
  SELF_REGISTERED_VIEW_ONLY_PERMISSIONS,
  validateStudentSignupUsername,
} from './src/shared/rules.ts';
import {
  ADMIN_PERMISSIONS,
  DEFAULT_STUDENT_PERMISSIONS,
  type EquipmentCondition,
  type EquipmentStatus,
  type PermissionKey,
  type UserPermissions,
  type UserPublic,
} from './src/shared/types.ts';

interface AuthedRequest extends Request {
  user?: UserPublic;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTimestamp(): string {
  return new Date().toISOString();
}

function getValidatedPermissions(raw: unknown): UserPermissions {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    canViewInventory:
      typeof obj.canViewInventory === 'boolean'
        ? obj.canViewInventory
        : DEFAULT_STUDENT_PERMISSIONS.canViewInventory,
    canViewMaintenance:
      typeof obj.canViewMaintenance === 'boolean'
        ? obj.canViewMaintenance
        : DEFAULT_STUDENT_PERMISSIONS.canViewMaintenance,
    canSubmitKitReturn:
      typeof obj.canSubmitKitReturn === 'boolean'
        ? obj.canSubmitKitReturn
        : DEFAULT_STUDENT_PERMISSIONS.canSubmitKitReturn,
    canReportFault:
      typeof obj.canReportFault === 'boolean'
        ? obj.canReportFault
        : DEFAULT_STUDENT_PERMISSIONS.canReportFault,
    canViewReports:
      typeof obj.canViewReports === 'boolean'
        ? obj.canViewReports
        : DEFAULT_STUDENT_PERMISSIONS.canViewReports,
  };
}

function logAudit(
  actorUserId: number,
  action: string,
  targetType: string,
  targetId: string,
  details: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)`
  ).run(actorUserId, action, targetType, targetId, details);
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!verifyCsrfProtection(req)) {
    res.status(403).json({ error: 'Cross-site request rejected.' });
    return;
  }
  const token = extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid.' });
    return;
  }
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE user_id = ?')
    .get(payload.uid) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(401).json({ error: 'User account not found.' });
    return;
  }
  const user = parseUserRow(row);
  if (!user.active_status) {
    res.status(403).json({ error: 'Account is deactivated. Contact laboratory administrator.' });
    return;
  }
  req.user = user;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({
      error: 'Administrator access required. Students cannot access or modify this module.',
    });
    return;
  }
  next();
}

function requirePermission(perm: PermissionKey) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!hasUserPermission(req.user.role, req.user.active_status, req.user.permissions, perm)) {
      res.status(403).json({
        error: `Permission denied (${perm}). Ask the administrator to enable this permission.`,
      });
      return;
    }
    next();
  };
}

async function startServer(): Promise<void> {
  // Initialize SQLite database and seed data on boot
  getDb();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  // =========================================================
  // AUTHENTICATION ENDPOINTS
  // =========================================================
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      res.status(400).json({ error: 'Username / User ID and password are required.' });
      return;
    }

    const db = getDb();
    const row = db
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
      .get(username) as Record<string, unknown> | undefined;

    if (!row || !verifyPassword(password, String(row.password_hash))) {
      res.status(401).json({ error: 'Invalid user ID or password.' });
      return;
    }

    const user = parseUserRow(row);
    if (!user.active_status) {
      res.status(403).json({ error: 'This account has been suspended by the administrator.' });
      return;
    }

    const token = signSessionToken({
      uid: user.user_id,
      username: user.username,
      role: user.role,
    });
    setSessionCookie(res, token);
    res.json({ user, token });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const rollNo = req.body?.roll_no ? String(req.body.roll_no).trim() : null;
    const enrollmentNo = req.body?.enrollment_no ? String(req.body.enrollment_no).trim() : null;
    const department =
      typeof req.body?.department === 'string' && req.body.department.trim()
        ? req.body.department.trim()
        : 'CSE (IoT)';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const idCheck = validateStudentSignupUsername(username);
    if (!idCheck.valid) {
      res.status(400).json({ error: idCheck.reason });
      return;
    }

    if (!fullName || !email || password.length < 4) {
      res.status(400).json({
        error: 'Full name, valid email, and password (minimum 4 characters) are required.',
      });
      return;
    }

    const db = getDb();
    const dup = db
      .prepare('SELECT user_id FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE')
      .get(username, email);
    if (dup) {
      res.status(409).json({ error: 'An account with this User ID or email already exists.' });
      return;
    }

    const passwordHash = hashPassword(password);
    const result = db
      .prepare(
        `INSERT INTO users (
          username, full_name, email, roll_no, enrollment_no,
          password_hash, role, department, active_status, permissions_json
        ) VALUES (?, ?, ?, ?, ?, ?, 'STUDENT', ?, 1, ?)`
      )
      .run(
        username,
        fullName,
        email,
        rollNo,
        enrollmentNo,
        passwordHash,
        department,
        JSON.stringify(SELF_REGISTERED_VIEW_ONLY_PERMISSIONS)
      );

    const newUserId = Number(result.lastInsertRowid);
    const createdRow = db
      .prepare('SELECT * FROM users WHERE user_id = ?')
      .get(newUserId) as Record<string, unknown>;
    const user = parseUserRow(createdRow);

    logAudit(
      newUserId,
      'STUDENT_SELF_REGISTERED',
      'USER',
      user.username,
      `Self-registered student ${user.full_name} (${user.username}) with view-only access`
    );

    const token = signSessionToken({
      uid: user.user_id,
      username: user.username,
      role: user.role,
    });
    setSessionCookie(res, token);
    res.status(201).json({ user, token });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  app.get('/api/auth/session', (req: Request, res: Response) => {
    const token = extractTokenFromRequest(req);
    if (!token) {
      res.json({ user: null });
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload) {
      res.json({ user: null });
      return;
    }
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM users WHERE user_id = ?')
      .get(payload.uid) as Record<string, unknown> | undefined;
    if (!row) {
      res.json({ user: null });
      return;
    }
    const user = parseUserRow(row);
    res.json({ user: user.active_status ? user : null });
  });

  // =========================================================
  // OVERVIEW (ROLE-SCOPED: NO ISSUED KITS DATA FOR STUDENTS)
  // =========================================================
  app.get('/api/overview', requireAuth, (req: AuthedRequest, res: Response) => {
    const db = getDb();
    const user = req.user!;

    const counts = db
      .prepare(
        `SELECT
          COUNT(*) as totalEquipment,
          SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as availableCount,
          SUM(CASE WHEN status = 'ISSUED' THEN 1 ELSE 0 END) as issuedCount,
          SUM(CASE WHEN status = 'UNDER_MAINTENANCE' THEN 1 ELSE 0 END) as underMaintenanceCount,
          SUM(CASE WHEN status = 'RETIRED' THEN 1 ELSE 0 END) as retiredCount
         FROM equipment`
      )
      .get() as Record<string, number>;

    const labRow = db.prepare('SELECT COUNT(*) as labCount FROM labs').get() as {
      labCount: number;
    };

    if (user.role !== 'ADMIN') {
      res.json({
        role: user.role,
        totalEquipment: counts.totalEquipment || 0,
        availableCount: counts.availableCount || 0,
        underMaintenanceCount: counts.underMaintenanceCount || 0,
        retiredCount: counts.retiredCount || 0,
        labCount: labRow.labCount || 0,
      });
      return;
    }

    const today = todayIso();
    const overdueRow = db
      .prepare(
        `SELECT COUNT(*) as overdueCount FROM issue_log WHERE return_date IS NULL AND due_date < ?`
      )
      .get(today) as { overdueCount: number };

    const pendingRow = db
      .prepare(
        `SELECT COUNT(*) as pendingCount FROM kit_submissions WHERE submission_status = 'PENDING_VERIFICATION'`
      )
      .get() as { pendingCount: number };

    const maintRow = db
      .prepare(`SELECT COUNT(*) as openMaint FROM maintenance WHERE status != 'RESOLVED'`)
      .get() as { openMaint: number };

    const calRows = db
      .prepare(`SELECT next_due_date FROM calibration`)
      .all() as Array<{ next_due_date: string }>;
    const calibrationDueCount = calRows.filter((c) => {
      const check = isDueWithinDays(c.next_due_date, today, 30);
      return check.isOverdue || check.isDueSoon;
    }).length;

    const usersRow = db
      .prepare(`SELECT COUNT(*) as totalUsers FROM users WHERE role = 'STUDENT'`)
      .get() as { totalUsers: number };

    res.json({
      role: user.role,
      totalEquipment: counts.totalEquipment || 0,
      availableCount: counts.availableCount || 0,
      issuedCount: counts.issuedCount || 0,
      underMaintenanceCount: counts.underMaintenanceCount || 0,
      retiredCount: counts.retiredCount || 0,
      labCount: labRow.labCount || 0,
      overdueCount: overdueRow.overdueCount || 0,
      pendingVerificationsCount: pendingRow.pendingCount || 0,
      openMaintenanceCount: maintRow.openMaint || 0,
      calibrationDueCount,
      totalUsersCount: usersRow.totalUsers || 0,
    });
  });

  // =========================================================
  // LABS
  // =========================================================
  app.get('/api/labs', requireAuth, (_req: AuthedRequest, res: Response) => {
    const db = getDb();
    const labs = db
      .prepare(
        `SELECT l.*, u.full_name as in_charge_name
         FROM labs l
         LEFT JOIN users u ON l.in_charge_id = u.user_id
         ORDER BY l.lab_id ASC`
      )
      .all();
    res.json({ labs });
  });

  app.post('/api/labs', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const labName = String(req.body?.lab_name || '').trim();
    const roomNo = String(req.body?.room_no || '').trim();
    const building = String(req.body?.building || '').trim();
    const contactDetails = String(req.body?.contact_details || '').trim();

    if (!labName || !roomNo || !building) {
      res.status(400).json({ error: 'Lab name, room number, and building are required.' });
      return;
    }

    const db = getDb();
    try {
      const result = db
        .prepare(
          `INSERT INTO labs (lab_name, room_no, building, in_charge_id, contact_details)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(labName, roomNo, building, req.user!.user_id, contactDetails || 'Department Office');
      const created = db
        .prepare('SELECT * FROM labs WHERE lab_id = ?')
        .get(Number(result.lastInsertRowid));
      logAudit(req.user!.user_id, 'LAB_CREATED', 'LAB', String(result.lastInsertRowid), labName);
      res.status(201).json({ lab: created });
    } catch {
      res.status(409).json({ error: 'A laboratory with this name already exists.' });
    }
  });

  // =========================================================
  // EQUIPMENT INVENTORY & QR/ASSET LOOKUP
  // =========================================================
  app.get(
    '/api/equipment',
    requireAuth,
    requirePermission('canViewInventory'),
    (req: AuthedRequest, res: Response) => {
      const db = getDb();
      const search = String(req.query.search || '').trim().toLowerCase();
      const statusFilter = String(req.query.status || '').trim();
      const labFilter = String(req.query.lab_id || '').trim();

      let sql = `
        SELECT e.*, l.lab_name, l.room_no
        FROM equipment e
        JOIN labs l ON e.lab_id = l.lab_id
        WHERE 1=1
      `;
      const params: Array<string | number> = [];

      if (search) {
        sql += ` AND (LOWER(e.asset_tag) LIKE ? OR LOWER(e.name) LIKE ? OR LOWER(e.category) LIKE ? OR LOWER(e.serial_no) LIKE ?)`;
        const pat = `%${search}%`;
        params.push(pat, pat, pat, pat);
      }
      if (statusFilter && statusFilter !== 'ALL') {
        sql += ` AND e.status = ?`;
        params.push(statusFilter);
      }
      if (labFilter && labFilter !== 'ALL') {
        sql += ` AND e.lab_id = ?`;
        params.push(Number(labFilter));
      }

      sql += ` ORDER BY e.asset_tag ASC`;
      const equipment = db.prepare(sql).all(...params);
      res.json({ equipment });
    }
  );

  app.get(
    '/api/equipment/lookup/:tag',
    requireAuth,
    requirePermission('canViewInventory'),
    (req: AuthedRequest, res: Response) => {
      const tag = String(req.params.tag || '').trim();
      if (!tag) {
        res.status(400).json({ error: 'Asset tag is required.' });
        return;
      }

      const db = getDb();
      const item = db
        .prepare(
          `SELECT e.*, l.lab_name, l.room_no, l.building
           FROM equipment e
           JOIN labs l ON e.lab_id = l.lab_id
           WHERE e.asset_tag = ? COLLATE NOCASE`
        )
        .get(tag) as Record<string, unknown> | undefined;

      if (!item) {
        res.status(404).json({ error: `No equipment found with asset tag "${tag}".` });
        return;
      }

      const equipmentId = Number(item.equipment_id);
      const latestCalibration = db
        .prepare(
          `SELECT * FROM calibration WHERE equipment_id = ? ORDER BY calibration_date DESC LIMIT 1`
        )
        .get(equipmentId);
      const maintenanceHistory = db
        .prepare(
          `SELECT maintenance_id, issue_description, reported_date, service_date, vendor, status
           FROM maintenance WHERE equipment_id = ? ORDER BY reported_date DESC LIMIT 5`
        )
        .all(equipmentId);

      // Strictly only Admin sees active issue/borrower details!
      let activeIssue: Record<string, unknown> | null = null;
      if (req.user!.role === 'ADMIN') {
        activeIssue =
          (db
            .prepare(
              `SELECT i.*, u.full_name as borrower_name, u.username as borrower_username, u.roll_no as borrower_roll_no
               FROM issue_log i
               JOIN users u ON i.borrower_id = u.user_id
               WHERE i.equipment_id = ? AND i.return_date IS NULL
               ORDER BY i.issue_id DESC LIMIT 1`
            )
            .get(equipmentId) as Record<string, unknown> | undefined) ?? null;
      }

      res.json({
        equipment: item,
        latestCalibration: latestCalibration || null,
        maintenanceHistory,
        activeIssue,
      });
    }
  );

  app.post('/api/equipment', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const labId = Number(req.body?.lab_id);
    const assetTag = String(req.body?.asset_tag || '')
      .trim()
      .toUpperCase();
    const name = String(req.body?.name || '').trim();
    const category = String(req.body?.category || '').trim();
    const manufacturer = String(req.body?.manufacturer || '').trim();
    const serialNo = String(req.body?.serial_no || '').trim();
    const purchaseDate = String(req.body?.purchase_date || todayIso()).trim();
    const condition = (req.body?.condition || 'Good') as EquipmentCondition;
    const status = (req.body?.status || 'AVAILABLE') as EquipmentStatus;

    if (!labId || !assetTag || !name || !category || !manufacturer || !serialNo) {
      res.status(400).json({
        error: 'Lab, unique asset tag, name, category, manufacturer, and serial number are required.',
      });
      return;
    }

    const validConditions: EquipmentCondition[] = ['Good', 'Minor Wear', 'Fair', 'Faulty'];
    const validStatuses: EquipmentStatus[] = [
      'AVAILABLE',
      'ISSUED',
      'UNDER_MAINTENANCE',
      'RETIRED',
    ];
    if (!validConditions.includes(condition) || !validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid equipment condition or status.' });
      return;
    }

    const db = getDb();
    const labExists = db.prepare('SELECT lab_id FROM labs WHERE lab_id = ?').get(labId);
    if (!labExists) {
      res.status(400).json({ error: 'Selected laboratory does not exist.' });
      return;
    }

    const existingTag = db
      .prepare('SELECT equipment_id FROM equipment WHERE asset_tag = ? COLLATE NOCASE')
      .get(assetTag);
    if (existingTag) {
      res.status(409).json({
        error: `Duplicate asset tag "${assetTag}". Asset tags must be unique (TC-03).`,
      });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO equipment (
          lab_id, asset_tag, name, category, manufacturer, serial_no, purchase_date, status, condition
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(labId, assetTag, name, category, manufacturer, serialNo, purchaseDate, status, condition);

    const created = db
      .prepare(
        `SELECT e.*, l.lab_name, l.room_no FROM equipment e JOIN labs l ON e.lab_id = l.lab_id WHERE e.equipment_id = ?`
      )
      .get(Number(result.lastInsertRowid));

    logAudit(
      req.user!.user_id,
      'EQUIPMENT_REGISTERED',
      'EQUIPMENT',
      assetTag,
      `Registered ${name} (${assetTag})`
    );
    res.status(201).json({ equipment: created });
  });

  app.patch(
    '/api/equipment/:id',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid equipment ID.' });
        return;
      }

      const db = getDb();
      const existing = db
        .prepare('SELECT * FROM equipment WHERE equipment_id = ?')
        .get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Equipment record not found.' });
        return;
      }

      const name = String(req.body?.name ?? existing.name).trim();
      const category = String(req.body?.category ?? existing.category).trim();
      const manufacturer = String(req.body?.manufacturer ?? existing.manufacturer).trim();
      const labId = Number(req.body?.lab_id ?? existing.lab_id);
      const condition = String(req.body?.condition ?? existing.condition) as EquipmentCondition;
      const status = String(req.body?.status ?? existing.status) as EquipmentStatus;

      db.prepare(
        `UPDATE equipment SET name = ?, category = ?, manufacturer = ?, lab_id = ?, condition = ?, status = ? WHERE equipment_id = ?`
      ).run(name, category, manufacturer, labId, condition, status, id);

      const updated = db
        .prepare(
          `SELECT e.*, l.lab_name, l.room_no FROM equipment e JOIN labs l ON e.lab_id = l.lab_id WHERE e.equipment_id = ?`
        )
        .get(id);

      logAudit(
        req.user!.user_id,
        'EQUIPMENT_UPDATED',
        'EQUIPMENT',
        String(existing.asset_tag),
        `Updated status=${status}, condition=${condition}`
      );
      res.json({ equipment: updated });
    }
  );

  app.delete(
    '/api/equipment/:id',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid equipment ID.' });
        return;
      }
      const db = getDb();
      const existing = db
        .prepare('SELECT * FROM equipment WHERE equipment_id = ?')
        .get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Equipment record not found.' });
        return;
      }
      if (existing.status === 'ISSUED') {
        res.status(409).json({
          error: 'Cannot retire an equipment item while it is currently issued.',
        });
        return;
      }
      db.prepare(`UPDATE equipment SET status = 'RETIRED' WHERE equipment_id = ?`).run(id);
      logAudit(
        req.user!.user_id,
        'EQUIPMENT_RETIRED',
        'EQUIPMENT',
        String(existing.asset_tag),
        `Deactivated / retired ${String(existing.name)}`
      );
      res.json({ ok: true });
    }
  );

  // =========================================================
  // ISSUED KITS & RETURN VERIFICATION (STRICTLY ADMIN-ONLY!)
  // =========================================================
  app.get('/api/issues', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const db = getDb();
    const today = todayIso();
    const statusFilter = String(req.query.status || 'ALL').trim();

    const rows = db
      .prepare(
        `SELECT
           i.*,
           e.asset_tag,
           e.name as equipment_name,
           e.category,
           b.username as borrower_username,
           b.full_name as borrower_name,
           b.roll_no as borrower_roll_no,
           issuer.full_name as issued_by_name,
           verifier.full_name as verified_by_name
         FROM issue_log i
         JOIN equipment e ON i.equipment_id = e.equipment_id
         JOIN users b ON i.borrower_id = b.user_id
         JOIN users issuer ON i.issued_by = issuer.user_id
         LEFT JOIN users verifier ON i.verified_by = verifier.user_id
         ORDER BY
           CASE WHEN i.return_date IS NULL THEN 0 ELSE 1 END ASC,
           i.issue_id DESC`
      )
      .all() as Array<Record<string, unknown>>;

    const enriched = rows
      .map((r) => {
        const returnDate = r.return_date ? String(r.return_date) : null;
        const overdue = isIssueOverdue(String(r.due_date), returnDate, today);
        return {
          ...r,
          return_date: returnDate,
          is_overdue: overdue,
          transaction_status: overdue ? 'OVERDUE' : String(r.transaction_status),
        };
      })
      .filter((r) => {
        if (statusFilter === 'ACTIVE') return !r.return_date;
        if (statusFilter === 'OVERDUE') return r.is_overdue;
        if (statusFilter === 'RETURNED') return Boolean(r.return_date);
        return true;
      });

    res.json({ issues: enriched });
  });

  app.post('/api/issues', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const equipmentId = Number(req.body?.equipment_id);
    const borrowerId = Number(req.body?.borrower_id);
    const dueDate = String(req.body?.due_date || '').trim();
    const conditionOut = (req.body?.condition_out || 'Good') as EquipmentCondition;

    if (!equipmentId || !borrowerId || !dueDate) {
      res.status(400).json({ error: 'Equipment, borrower, and due date are required.' });
      return;
    }

    const db = getDb();
    const equip = db
      .prepare('SELECT * FROM equipment WHERE equipment_id = ?')
      .get(equipmentId) as Record<string, unknown> | undefined;
    if (!equip) {
      res.status(404).json({ error: 'Equipment record not found.' });
      return;
    }

    const borrowerRow = db
      .prepare('SELECT * FROM users WHERE user_id = ?')
      .get(borrowerId) as Record<string, unknown> | undefined;
    if (!borrowerRow) {
      res.status(404).json({ error: 'Borrower user account not found.' });
      return;
    }
    const borrower = parseUserRow(borrowerRow);

    const today = todayIso();
    const overdueRow = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM issue_log WHERE borrower_id = ? AND return_date IS NULL AND due_date < ?`
      )
      .get(borrowerId, today) as { cnt: number };

    const validation = evaluateIssueValidation({
      actorRole: req.user!.role,
      actorActive: req.user!.active_status,
      equipmentStatus: String(equip.status) as EquipmentStatus,
      borrowerActive: borrower.active_status,
      borrowerOverdueCount: overdueRow.cnt || 0,
    });

    if (!validation.allowed) {
      res.status(409).json({
        error: validation.reason,
        validation,
      });
      return;
    }

    const issueRes = db
      .prepare(
        `INSERT INTO issue_log (
          equipment_id, borrower_id, issued_by, issue_date, due_date, condition_out, transaction_status
        ) VALUES (?, ?, ?, ?, ?, ?, 'ISSUED')`
      )
      .run(equipmentId, borrowerId, req.user!.user_id, today, dueDate, conditionOut);

    db.prepare(`UPDATE equipment SET status = 'ISSUED' WHERE equipment_id = ?`).run(equipmentId);

    logAudit(
      req.user!.user_id,
      'KIT_ISSUED',
      'ISSUE_LOG',
      String(issueRes.lastInsertRowid),
      `Issued ${String(equip.asset_tag)} to ${borrower.full_name} (${borrower.username}), due ${dueDate}`
    );

    res.status(201).json({
      issue_id: Number(issueRes.lastInsertRowid),
      validation,
    });
  });

  // Direct Admin Return / Verification on an active issue record
  app.post(
    '/api/issues/:id/return',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const issueId = Number(req.params.id);
      const verifiedCondition = (req.body?.condition_in || 'Good') as EquipmentCondition;
      const remarks = String(req.body?.remarks || '').trim();

      const validConditions: EquipmentCondition[] = ['Good', 'Minor Wear', 'Fair', 'Faulty'];
      if (!validConditions.includes(verifiedCondition)) {
        res.status(400).json({ error: 'Invalid return condition.' });
        return;
      }

      const db = getDb();
      const issue = db
        .prepare('SELECT * FROM issue_log WHERE issue_id = ?')
        .get(issueId) as Record<string, unknown> | undefined;
      if (!issue) {
        res.status(404).json({ error: 'Issue record not found.' });
        return;
      }
      if (issue.return_date) {
        res.status(409).json({ error: 'This issue record is already returned and closed.' });
        return;
      }

      const today = todayIso();
      const now = nowTimestamp();
      const nextStatus = resolveVerifiedReturnStatus(verifiedCondition);

      db.prepare(
        `UPDATE issue_log
         SET return_date = ?, condition_in = ?, transaction_status = 'RETURNED',
             verified_by = ?, verified_at = ?
         WHERE issue_id = ?`
      ).run(today, verifiedCondition, req.user!.user_id, now, issueId);

      db.prepare(`UPDATE equipment SET status = ?, condition = ? WHERE equipment_id = ?`).run(
        nextStatus,
        verifiedCondition,
        Number(issue.equipment_id)
      );

      // Mark any pending student submission for this issue as verified
      db.prepare(
        `UPDATE kit_submissions
         SET submission_status = 'VERIFIED', verified_by_user_id = ?, verified_condition = ?,
             resulting_equipment_status = ?, admin_remarks = ?, verified_at = ?
         WHERE equipment_id = ? AND submission_status = 'PENDING_VERIFICATION'`
      ).run(
        req.user!.user_id,
        verifiedCondition,
        nextStatus,
        remarks || 'Verified directly by administrator during kit return.',
        now,
        Number(issue.equipment_id)
      );

      if (verifiedCondition === 'Faulty') {
        db.prepare(
          `INSERT INTO maintenance (
            equipment_id, reported_by, issue_description, reported_date, vendor, cost, status
          ) VALUES (?, ?, ?, ?, 'Internal Lab Bench', 0, 'OPEN')`
        ).run(
          Number(issue.equipment_id),
          req.user!.user_id,
          remarks || 'Flagged faulty during administrator return verification.',
          today
        );
      }

      logAudit(
        req.user!.user_id,
        'ADMIN_RETURN_VERIFIED',
        'ISSUE_LOG',
        String(issueId),
        `Verified return condition=${verifiedCondition}, updated status=${nextStatus}`
      );

      res.json({ ok: true, nextStatus });
    }
  );

  // =========================================================
  // STUDENT KIT SUBMISSIONS & ADMIN VERIFICATION QUEUE
  // =========================================================
  // Student submits a kit return (no access to Issued Kits table!)
  app.post(
    '/api/submissions',
    requireAuth,
    requirePermission('canSubmitKitReturn'),
    (req: AuthedRequest, res: Response) => {
      const assetTag = String(req.body?.asset_tag || '')
        .trim()
        .toUpperCase();
      const claimedCondition = (req.body?.claimed_condition || 'Good') as EquipmentCondition;
      const studentNotes = String(req.body?.student_notes || '').trim();

      if (!assetTag) {
        res.status(400).json({ error: 'Asset tag is required to submit a kit return.' });
        return;
      }

      const validConditions: EquipmentCondition[] = ['Good', 'Minor Wear', 'Fair', 'Faulty'];
      if (!validConditions.includes(claimedCondition)) {
        res.status(400).json({ error: 'Invalid condition selection.' });
        return;
      }

      const db = getDb();
      const equip = db
        .prepare('SELECT * FROM equipment WHERE asset_tag = ? COLLATE NOCASE')
        .get(assetTag) as Record<string, unknown> | undefined;
      if (!equip) {
        res.status(404).json({ error: `No equipment found with asset tag "${assetTag}".` });
        return;
      }
      if (equip.status !== 'ISSUED') {
        res.status(409).json({
          error: `Equipment "${assetTag}" is currently ${String(equip.status).replace('_', ' ')} and is not awaiting return.`,
        });
        return;
      }

      const equipId = Number(equip.equipment_id);
      const existingPending = db
        .prepare(
          `SELECT submission_id FROM kit_submissions WHERE equipment_id = ? AND submission_status = 'PENDING_VERIFICATION'`
        )
        .get(equipId);
      if (existingPending) {
        res.status(409).json({
          error: `A return submission for "${assetTag}" is already queued for administrator verification.`,
        });
        return;
      }

      // Link internally to open issue record without exposing borrower list to student
      const openIssue = db
        .prepare(
          `SELECT issue_id FROM issue_log WHERE equipment_id = ? AND return_date IS NULL ORDER BY issue_id DESC LIMIT 1`
        )
        .get(equipId) as { issue_id: number } | undefined;

      const subRes = db
        .prepare(
          `INSERT INTO kit_submissions (
            equipment_id, issue_id, submitted_by_user_id, claimed_condition,
            student_notes, submission_status, submitted_at
          ) VALUES (?, ?, ?, ?, ?, 'PENDING_VERIFICATION', ?)`
        )
        .run(
          equipId,
          openIssue ? openIssue.issue_id : null,
          req.user!.user_id,
          claimedCondition,
          studentNotes || 'Submitted by student for physical inspection and admin verification.',
          nowTimestamp()
        );

      logAudit(
        req.user!.user_id,
        'STUDENT_KIT_SUBMITTED',
        'KIT_SUBMISSION',
        String(subRes.lastInsertRowid),
        `Submitted ${assetTag} (${claimedCondition}) awaiting Admin verification`
      );

      res.status(201).json({
        submission: {
          submission_id: Number(subRes.lastInsertRowid),
          asset_tag: String(equip.asset_tag),
          equipment_name: String(equip.name),
          claimed_condition: claimedCondition,
          submission_status: 'PENDING_VERIFICATION',
          submitted_at: nowTimestamp(),
        },
      });
    }
  );

  // Student views ONLY their own submission receipts (never global issued kits)
  app.get('/api/my-submissions', requireAuth, (req: AuthedRequest, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT
           s.submission_id,
           s.equipment_id,
           e.asset_tag,
           e.name as equipment_name,
           s.claimed_condition,
           s.student_notes,
           s.submission_status,
           s.submitted_at,
           s.verified_condition,
           s.resulting_equipment_status,
           s.admin_remarks,
           s.verified_at,
           v.full_name as verified_by_name
         FROM kit_submissions s
         JOIN equipment e ON s.equipment_id = e.equipment_id
         LEFT JOIN users v ON s.verified_by_user_id = v.user_id
         WHERE s.submitted_by_user_id = ?
         ORDER BY s.submission_id DESC`
      )
      .all(req.user!.user_id);

    res.json({ submissions: rows });
  });

  // ADMIN-ONLY: View all student kit return submissions
  app.get('/api/submissions', requireAuth, requireAdmin, (_req: AuthedRequest, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT
           s.*,
           e.asset_tag,
           e.name as equipment_name,
           sub.username as submitted_by_username,
           sub.full_name as submitted_by_name,
           sub.roll_no as submitted_by_roll_no,
           ver.full_name as verified_by_name
         FROM kit_submissions s
         JOIN equipment e ON s.equipment_id = e.equipment_id
         JOIN users sub ON s.submitted_by_user_id = sub.user_id
         LEFT JOIN users ver ON s.verified_by_user_id = ver.user_id
         ORDER BY
           CASE WHEN s.submission_status = 'PENDING_VERIFICATION' THEN 0 ELSE 1 END ASC,
           s.submission_id DESC`
      )
      .all();

    res.json({ submissions: rows });
  });

  // ADMIN-ONLY: Verify or Reject a student kit submission and update equipment status
  app.post(
    '/api/submissions/:id/verify',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const submissionId = Number(req.params.id);
      const decision = String(req.body?.decision || 'VERIFY').toUpperCase();
      const verifiedCondition = (req.body?.verified_condition || 'Good') as EquipmentCondition;
      const adminRemarks = String(req.body?.admin_remarks || '').trim();

      if (decision !== 'VERIFY' && decision !== 'REJECT') {
        res.status(400).json({ error: 'Decision must be VERIFY or REJECT.' });
        return;
      }

      const validConditions: EquipmentCondition[] = ['Good', 'Minor Wear', 'Fair', 'Faulty'];
      if (!validConditions.includes(verifiedCondition)) {
        res.status(400).json({ error: 'Invalid verified condition.' });
        return;
      }

      const db = getDb();
      const submission = db
        .prepare(
          `SELECT s.*, e.asset_tag FROM kit_submissions s JOIN equipment e ON s.equipment_id = e.equipment_id WHERE s.submission_id = ?`
        )
        .get(submissionId) as Record<string, unknown> | undefined;

      if (!submission) {
        res.status(404).json({ error: 'Kit submission not found.' });
        return;
      }
      if (submission.submission_status !== 'PENDING_VERIFICATION') {
        res.status(409).json({ error: 'This submission has already been processed.' });
        return;
      }

      const now = nowTimestamp();
      const today = todayIso();

      if (decision === 'REJECT') {
        db.prepare(
          `UPDATE kit_submissions
           SET submission_status = 'REJECTED', verified_by_user_id = ?,
               admin_remarks = ?, verified_at = ?
           WHERE submission_id = ?`
        ).run(
          req.user!.user_id,
          adminRemarks || 'Physical kit incomplete or damaged; return rejected by admin.',
          now,
          submissionId
        );
        logAudit(
          req.user!.user_id,
          'SUBMISSION_REJECTED',
          'KIT_SUBMISSION',
          String(submissionId),
          `Rejected return of ${String(submission.asset_tag)}: ${adminRemarks}`
        );
        res.json({ ok: true, submission_status: 'REJECTED' });
        return;
      }

      const nextStatus = resolveVerifiedReturnStatus(verifiedCondition);

      db.prepare(
        `UPDATE kit_submissions
         SET submission_status = 'VERIFIED', verified_by_user_id = ?, verified_condition = ?,
             resulting_equipment_status = ?, admin_remarks = ?, verified_at = ?
         WHERE submission_id = ?`
      ).run(
        req.user!.user_id,
        verifiedCondition,
        nextStatus,
        adminRemarks || 'Physically inspected and verified by administrator.',
        now,
        submissionId
      );

      db.prepare(`UPDATE equipment SET status = ?, condition = ? WHERE equipment_id = ?`).run(
        nextStatus,
        verifiedCondition,
        Number(submission.equipment_id)
      );

      // Close matching open issue record
      db.prepare(
        `UPDATE issue_log
         SET return_date = ?, condition_in = ?, transaction_status = 'RETURNED',
             verified_by = ?, verified_at = ?
         WHERE equipment_id = ? AND return_date IS NULL`
      ).run(
        today,
        verifiedCondition,
        req.user!.user_id,
        now,
        Number(submission.equipment_id)
      );

      if (verifiedCondition === 'Faulty') {
        db.prepare(
          `INSERT INTO maintenance (
            equipment_id, reported_by, issue_description, reported_date, vendor, cost, status
          ) VALUES (?, ?, ?, ?, 'Internal Lab Bench', 0, 'OPEN')`
        ).run(
          Number(submission.equipment_id),
          req.user!.user_id,
          adminRemarks || 'Marked Faulty during Admin kit return verification.',
          today
        );
      }

      logAudit(
        req.user!.user_id,
        'SUBMISSION_VERIFIED',
        'KIT_SUBMISSION',
        String(submissionId),
        `Verified ${String(submission.asset_tag)} -> status=${nextStatus}, condition=${verifiedCondition}`
      );

      res.json({ ok: true, submission_status: 'VERIFIED', nextStatus });
    }
  );

  // =========================================================
  // MAINTENANCE & CALIBRATION
  // =========================================================
  app.get(
    '/api/maintenance',
    requireAuth,
    requirePermission('canViewMaintenance'),
    (_req: AuthedRequest, res: Response) => {
      const db = getDb();
      const maintenance = db
        .prepare(
          `SELECT m.*, e.asset_tag, e.name as equipment_name, u.full_name as reported_by_name
           FROM maintenance m
           JOIN equipment e ON m.equipment_id = e.equipment_id
           JOIN users u ON m.reported_by = u.user_id
           ORDER BY m.maintenance_id DESC`
        )
        .all();

      const calibration = db
        .prepare(
          `SELECT c.*, e.asset_tag, e.name as equipment_name
           FROM calibration c
           JOIN equipment e ON c.equipment_id = e.equipment_id
           ORDER BY c.next_due_date ASC`
        )
        .all();

      res.json({ maintenance, calibration });
    }
  );

  app.post('/api/maintenance', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const allowed =
      user.role === 'ADMIN' ||
      hasUserPermission(user.role, user.active_status, user.permissions, 'canReportFault');

    if (!allowed) {
      res.status(403).json({
        error: 'Permission denied. You do not have permission to report faults or create tickets.',
      });
      return;
    }

    const equipmentId = Number(req.body?.equipment_id);
    const description = String(req.body?.issue_description || '').trim();
    const vendor =
      user.role === 'ADMIN'
        ? String(req.body?.vendor || 'Internal Lab Bench').trim()
        : 'Reported by Student';
    const cost = user.role === 'ADMIN' ? Math.max(0, Number(req.body?.cost || 0)) : 0;

    if (!equipmentId || !description) {
      res.status(400).json({ error: 'Equipment and issue description are required.' });
      return;
    }

    const db = getDb();
    const equip = db
      .prepare('SELECT equipment_id, asset_tag FROM equipment WHERE equipment_id = ?')
      .get(equipmentId) as { equipment_id: number; asset_tag: string } | undefined;
    if (!equip) {
      res.status(404).json({ error: 'Equipment not found.' });
      return;
    }

    const ticketRes = db
      .prepare(
        `INSERT INTO maintenance (
          equipment_id, reported_by, issue_description, reported_date, vendor, cost, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN')`
      )
      .run(equipmentId, user.user_id, description, todayIso(), vendor, cost);

    // Only Admin directly moves equipment to UNDER_MAINTENANCE
    if (user.role === 'ADMIN' && req.body?.mark_under_maintenance) {
      db.prepare(`UPDATE equipment SET status = 'UNDER_MAINTENANCE' WHERE equipment_id = ?`).run(
        equipmentId
      );
    }

    logAudit(
      user.user_id,
      'MAINTENANCE_LOGGED',
      'MAINTENANCE',
      String(ticketRes.lastInsertRowid),
      `Logged fault on ${equip.asset_tag}: ${description}`
    );

    res.status(201).json({ maintenance_id: Number(ticketRes.lastInsertRowid) });
  });

  app.patch(
    '/api/maintenance/:id',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const id = Number(req.params.id);
      const status = String(req.body?.status || '').toUpperCase();
      const vendor = req.body?.vendor !== undefined ? String(req.body.vendor).trim() : undefined;
      const cost = req.body?.cost !== undefined ? Math.max(0, Number(req.body.cost)) : undefined;

      if (!['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
        res.status(400).json({ error: 'Invalid maintenance status.' });
        return;
      }

      const db = getDb();
      const ticket = db
        .prepare('SELECT * FROM maintenance WHERE maintenance_id = ?')
        .get(id) as Record<string, unknown> | undefined;
      if (!ticket) {
        res.status(404).json({ error: 'Maintenance ticket not found.' });
        return;
      }

      const serviceDate = status === 'RESOLVED' ? todayIso() : (ticket.service_date as string | null);
      db.prepare(
        `UPDATE maintenance SET status = ?, service_date = ?, vendor = ?, cost = ? WHERE maintenance_id = ?`
      ).run(
        status,
        serviceDate,
        vendor ?? String(ticket.vendor),
        cost ?? Number(ticket.cost),
        id
      );

      if (status === 'RESOLVED' && req.body?.restore_available) {
        db.prepare(
          `UPDATE equipment SET status = 'AVAILABLE', condition = 'Good' WHERE equipment_id = ? AND status = 'UNDER_MAINTENANCE'`
        ).run(Number(ticket.equipment_id));
      }

      logAudit(
        req.user!.user_id,
        'MAINTENANCE_UPDATED',
        'MAINTENANCE',
        String(id),
        `Updated ticket status=${status}`
      );
      res.json({ ok: true });
    }
  );

  app.post('/api/calibration', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const equipmentId = Number(req.body?.equipment_id);
    const calibrationDate = String(req.body?.calibration_date || todayIso()).trim();
    const nextDueDate = String(req.body?.next_due_date || '').trim();
    const certificateRef = String(req.body?.certificate_ref || '').trim();
    const result = String(req.body?.result || 'PASS').toUpperCase();
    const remarks = String(req.body?.remarks || '').trim();

    if (!equipmentId || !nextDueDate || !certificateRef) {
      res
        .status(400)
        .json({ error: 'Equipment, next due date, and certificate reference are required.' });
      return;
    }

    if (!['PASS', 'ADJUSTED', 'FAIL'].includes(result)) {
      res.status(400).json({ error: 'Invalid calibration result.' });
      return;
    }

    const db = getDb();
    const calRes = db
      .prepare(
        `INSERT INTO calibration (
          equipment_id, calibration_date, next_due_date, certificate_ref, result, remarks
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(equipmentId, calibrationDate, nextDueDate, certificateRef, result, remarks);

    logAudit(
      req.user!.user_id,
      'CALIBRATION_RECORDED',
      'CALIBRATION',
      String(calRes.lastInsertRowid),
      `Recorded calibration ${certificateRef} (${result}), next due ${nextDueDate}`
    );
    res.status(201).json({ calibration_id: Number(calRes.lastInsertRowid) });
  });

  // =========================================================
  // REPORTS & ALERTS
  // =========================================================
  app.get(
    '/api/reports',
    requireAuth,
    requirePermission('canViewReports'),
    (req: AuthedRequest, res: Response) => {
      const db = getDb();
      const today = todayIso();

      const categorySummary = db
        .prepare(
          `SELECT
             category,
             COUNT(*) as total,
             SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available,
             SUM(CASE WHEN status = 'UNDER_MAINTENANCE' THEN 1 ELSE 0 END) as maintenance
           FROM equipment
           GROUP BY category
           ORDER BY total DESC`
        )
        .all();

      const calibrationRows = db
        .prepare(
          `SELECT c.*, e.asset_tag, e.name as equipment_name
           FROM calibration c
           JOIN equipment e ON c.equipment_id = e.equipment_id
           ORDER BY c.next_due_date ASC`
        )
        .all() as Array<Record<string, unknown>>;

      const calibrationAlerts = calibrationRows
        .map((c) => {
          const check = isDueWithinDays(String(c.next_due_date), today, 30);
          return { ...c, ...check };
        })
        .filter((c) => c.isOverdue || c.isDueSoon);

      const openMaintenance = db
        .prepare(
          `SELECT m.*, e.asset_tag, e.name as equipment_name
           FROM maintenance m
           JOIN equipment e ON m.equipment_id = e.equipment_id
           WHERE m.status != 'RESOLVED'
           ORDER BY m.reported_date ASC`
        )
        .all();

      // Strictly omit overdue borrower issues for non-admin users
      let overdueIssues: Array<Record<string, unknown>> = [];
      if (req.user!.role === 'ADMIN') {
        overdueIssues = db
          .prepare(
            `SELECT i.*, e.asset_tag, e.name as equipment_name, b.full_name as borrower_name, b.username as borrower_username, b.roll_no as borrower_roll_no
             FROM issue_log i
             JOIN equipment e ON i.equipment_id = e.equipment_id
             JOIN users b ON i.borrower_id = b.user_id
             WHERE i.return_date IS NULL AND i.due_date < ?
             ORDER BY i.due_date ASC`
          )
          .all(today) as Array<Record<string, unknown>>;
      }

      res.json({
        categorySummary,
        calibrationAlerts,
        openMaintenance,
        overdueIssues,
        generatedAt: nowTimestamp(),
      });
    }
  );

  // =========================================================
  // CENTRALIZED USER & PERMISSION MANAGEMENT (STRICTLY ADMIN-ONLY)
  // =========================================================
  app.get('/api/users', requireAuth, requireAdmin, (_req: AuthedRequest, res: Response) => {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM users ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, user_id ASC")
      .all() as Array<Record<string, unknown>>;
    const users = rows.map(parseUserRow);

    const auditLogs = db
      .prepare(
        `SELECT a.*, u.full_name as actor_name
         FROM audit_log a
         JOIN users u ON a.actor_user_id = u.user_id
         ORDER BY a.audit_id DESC
         LIMIT 25`
      )
      .all();

    res.json({ users, auditLogs });
  });

  app.post('/api/users', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const username = String(req.body?.username || '').trim();
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim();
    const rollNo = req.body?.roll_no ? String(req.body.roll_no).trim() : null;
    const enrollmentNo = req.body?.enrollment_no ? String(req.body.enrollment_no).trim() : null;
    const department = String(req.body?.department || 'CSE (IoT)').trim();
    const password = String(req.body?.password || '');

    if (!username || !fullName || !email || password.length < 4) {
      res.status(400).json({
        error: 'User ID, full name, email, and a password (min 4 characters) are required.',
      });
      return;
    }

    const permissions = getValidatedPermissions(req.body?.permissions);
    const db = getDb();

    const dup = db
      .prepare('SELECT user_id FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE')
      .get(username, email);
    if (dup) {
      res.status(409).json({ error: 'A user with this User ID or email already exists.' });
      return;
    }

    const passwordHash = hashPassword(password);
    const result = db
      .prepare(
        `INSERT INTO users (
          username, full_name, email, roll_no, enrollment_no,
          password_hash, role, department, active_status, permissions_json
        ) VALUES (?, ?, ?, ?, ?, ?, 'STUDENT', ?, 1, ?)`
      )
      .run(
        username,
        fullName,
        email,
        rollNo,
        enrollmentNo,
        passwordHash,
        department,
        JSON.stringify(permissions)
      );

    const createdRow = db
      .prepare('SELECT * FROM users WHERE user_id = ?')
      .get(Number(result.lastInsertRowid)) as Record<string, unknown>;

    logAudit(
      req.user!.user_id,
      'STUDENT_CREATED',
      'USER',
      username,
      `Created student account ${fullName} (${username}) with custom permissions`
    );
    res.status(201).json({ user: parseUserRow(createdRow) });
  });

  app.patch(
    '/api/users/:id/permissions',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const id = Number(req.params.id);
      const db = getDb();
      const targetRow = db
        .prepare('SELECT * FROM users WHERE user_id = ?')
        .get(id) as Record<string, unknown> | undefined;

      if (!targetRow) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      if (targetRow.role === 'ADMIN') {
        res.status(400).json({ error: 'Administrator permissions are locked to full access.' });
        return;
      }

      const permissions = getValidatedPermissions(req.body?.permissions);
      db.prepare('UPDATE users SET permissions_json = ? WHERE user_id = ?').run(
        JSON.stringify(permissions),
        id
      );

      const updatedRow = db
        .prepare('SELECT * FROM users WHERE user_id = ?')
        .get(id) as Record<string, unknown>;

      logAudit(
        req.user!.user_id,
        'PERMISSIONS_UPDATED',
        'USER',
        String(targetRow.username),
        `Updated permissions for ${String(targetRow.full_name)}: ${JSON.stringify(permissions)}`
      );
      res.json({ user: parseUserRow(updatedRow) });
    }
  );

  app.patch(
    '/api/users/:id/status',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const id = Number(req.params.id);
      if (id === req.user!.user_id) {
        res.status(400).json({ error: 'You cannot deactivate your own administrator account.' });
        return;
      }

      const db = getDb();
      const targetRow = db
        .prepare('SELECT * FROM users WHERE user_id = ?')
        .get(id) as Record<string, unknown> | undefined;
      if (!targetRow) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const active = req.body?.active_status ? 1 : 0;
      db.prepare('UPDATE users SET active_status = ? WHERE user_id = ?').run(active, id);

      const updatedRow = db
        .prepare('SELECT * FROM users WHERE user_id = ?')
        .get(id) as Record<string, unknown>;

      logAudit(
        req.user!.user_id,
        'USER_STATUS_CHANGED',
        'USER',
        String(targetRow.username),
        `${active ? 'Activated' : 'Suspended'} account ${String(targetRow.username)}`
      );
      res.json({ user: parseUserRow(updatedRow) });
    }
  );

  app.patch(
    '/api/users/:id/password',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const id = Number(req.params.id);
      const newPassword = String(req.body?.password || '');
      if (newPassword.length < 4) {
        res.status(400).json({ error: 'New password must be at least 4 characters.' });
        return;
      }

      const db = getDb();
      const targetRow = db
        .prepare('SELECT * FROM users WHERE user_id = ?')
        .get(id) as Record<string, unknown> | undefined;
      if (!targetRow) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      db.prepare('UPDATE users SET password_hash = ? WHERE user_id = ?').run(
        hashPassword(newPassword),
        id
      );

      logAudit(
        req.user!.user_id,
        'PASSWORD_RESET',
        'USER',
        String(targetRow.username),
        `Administrator reset password for ${String(targetRow.username)}`
      );
      res.json({ ok: true });
    }
  );

  // =========================================================
  // VITE MIDDLEWARE (DEV) OR STATIC DIST (PROD)
  // =========================================================
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Laboratory Equipment Tracker listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

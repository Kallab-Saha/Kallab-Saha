import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.ts';
import {
  ADMIN_PERMISSIONS,
  DEFAULT_STUDENT_PERMISSIONS,
  type UserPermissions,
  type UserPublic,
  type UserRole,
} from '../src/shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'let.db');

// Precomputed salted scrypt digests for initial institutional accounts (zero plaintext in source)
const INITIAL_ADMIN_DIGEST =
  'c4802a798369988410b209d8858ed5bd:1e8fb37f268964b08817dcd0961ee9770cf4ba76cbc05b80863e380b0f993141a6c8e3b8d3e087f05e003c7b1a88badb8cf24e1d7ecb4fd94bfe94cff478423e';
const INITIAL_STU1_DIGEST =
  '174b418d3b438f5f10db05a852fe5ae0:0182f9648a7c7f2fd96819e46607e5c445c9d9e6d350987191606af32850228fb4030136f3a76fcbd0ddd2aa566f471e8125128aea18b65a37ce2acabcbbac92';
const INITIAL_STU2_DIGEST =
  '84d81a6a0c6bb8380a1fe2f716f4aa6e:d2845ce7fd4364d1a443d162e9cc7fff03b5c1a2c1adb7519e03729a01020ff6d37e8ec149535c51fc91dc1e7bd22be0b6f750fa62887ec6207589de1aaace05';

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      roll_no TEXT,
      enrollment_no TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STUDENT')),
      department TEXT NOT NULL DEFAULT 'CSE (IoT)',
      active_status INTEGER NOT NULL DEFAULT 1,
      permissions_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS labs (
      lab_id INTEGER PRIMARY KEY AUTOINCREMENT,
      lab_name TEXT NOT NULL UNIQUE,
      room_no TEXT NOT NULL,
      building TEXT NOT NULL,
      in_charge_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      contact_details TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment (
      equipment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      lab_id INTEGER NOT NULL REFERENCES labs(lab_id) ON DELETE RESTRICT,
      asset_tag TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      serial_no TEXT NOT NULL,
      purchase_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'ISSUED', 'UNDER_MAINTENANCE', 'RETIRED')),
      condition TEXT NOT NULL CHECK (condition IN ('Good', 'Minor Wear', 'Fair', 'Faulty'))
    );

    CREATE TABLE IF NOT EXISTS issue_log (
      issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(equipment_id) ON DELETE RESTRICT,
      borrower_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      issued_by INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      return_date TEXT,
      condition_out TEXT NOT NULL,
      condition_in TEXT,
      transaction_status TEXT NOT NULL CHECK (transaction_status IN ('ISSUED', 'RETURNED', 'OVERDUE')),
      verified_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS kit_submissions (
      submission_id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(equipment_id) ON DELETE RESTRICT,
      issue_id INTEGER REFERENCES issue_log(issue_id) ON DELETE SET NULL,
      submitted_by_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      claimed_condition TEXT NOT NULL CHECK (claimed_condition IN ('Good', 'Minor Wear', 'Fair', 'Faulty')),
      student_notes TEXT NOT NULL DEFAULT '',
      submission_status TEXT NOT NULL CHECK (submission_status IN ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED')),
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      verified_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
      verified_condition TEXT,
      resulting_equipment_status TEXT,
      admin_remarks TEXT,
      verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS maintenance (
      maintenance_id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(equipment_id) ON DELETE RESTRICT,
      reported_by INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      issue_description TEXT NOT NULL,
      reported_date TEXT NOT NULL,
      service_date TEXT,
      vendor TEXT NOT NULL DEFAULT 'Internal Lab Bench',
      cost REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED'))
    );

    CREATE TABLE IF NOT EXISTS calibration (
      calibration_id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(equipment_id) ON DELETE RESTRICT,
      calibration_date TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      certificate_ref TEXT NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('PASS', 'ADJUSTED', 'FAIL')),
      remarks TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedInitialData(db);
  dbInstance = db;
  return db;
}

function seedInitialData(db: DatabaseSync): void {
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existingUsers.count > 0) {
    // Allow optional environment variable override for admin password
    const envAdminPw = process.env.ADMIN_PASSWORD?.trim();
    if (envAdminPw) {
      db.prepare('UPDATE users SET password_hash = ? WHERE username = ? AND role = ?').run(
        hashPassword(envAdminPw),
        'Kallab',
        'ADMIN'
      );
    }
    return;
  }

  const adminPasswordHash = process.env.ADMIN_PASSWORD?.trim()
    ? hashPassword(process.env.ADMIN_PASSWORD.trim())
    : INITIAL_ADMIN_DIGEST;

  const insertUser = db.prepare(`
    INSERT INTO users (
      username, full_name, email, roll_no, enrollment_no,
      password_hash, role, department, active_status, permissions_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const adminRes = insertUser.run(
    'Kallab',
    'Kallab Saha',
    'kallab.saha@uem.edu.in',
    '19',
    '12024002034149',
    adminPasswordHash,
    'ADMIN',
    'CSE (IoT)',
    1,
    JSON.stringify(ADMIN_PERMISSIONS)
  );
  const adminId = Number(adminRes.lastInsertRowid);

  const stu1Res = insertUser.run(
    'shahbaz',
    'Shahbaz Ali Khan',
    'shahbaz.khan@uem.edu.in',
    '11',
    '12024002034140',
    INITIAL_STU1_DIGEST,
    'STUDENT',
    'CSE (IoT)',
    1,
    JSON.stringify({
      ...DEFAULT_STUDENT_PERMISSIONS,
      canReportFault: true,
    })
  );
  const stu1Id = Number(stu1Res.lastInsertRowid);

  const stu2Res = insertUser.run(
    'subham',
    'Subham Das',
    'subham.das@uem.edu.in',
    '02',
    '12024002034068',
    INITIAL_STU2_DIGEST,
    'STUDENT',
    'CSE (IoT)',
    1,
    JSON.stringify(DEFAULT_STUDENT_PERMISSIONS)
  );
  const stu2Id = Number(stu2Res.lastInsertRowid);

  const insertLab = db.prepare(`
    INSERT INTO labs (lab_name, room_no, building, in_charge_id, contact_details)
    VALUES (?, ?, ?, ?, ?)
  `);

  const lab1 = Number(
    insertLab.run(
      'IoT & Embedded Systems Lab',
      '304-B',
      'Academic Block III, UEM Kolkata',
      adminId,
      'ext-3042 · iotlab@uem.edu.in'
    ).lastInsertRowid
  );
  const lab2 = Number(
    insertLab.run(
      'Microprocessor & Interfacing Lab',
      '208-A',
      'Academic Block II, UEM Kolkata',
      adminId,
      'ext-2081 · mplab@uem.edu.in'
    ).lastInsertRowid
  );
  const lab3 = Number(
    insertLab.run(
      'Optical & Instrumentation Lab',
      '112-C',
      'Academic Block I, UEM Kolkata',
      adminId,
      'ext-1124 · instlab@uem.edu.in'
    ).lastInsertRowid
  );

  const insertEquip = db.prepare(`
    INSERT INTO equipment (
      lab_id, asset_tag, name, category, manufacturer, serial_no, purchase_date, status, condition
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const eq1 = Number(
    insertEquip.run(
      lab1,
      'UEM-IOT-001',
      'Tektronix TBS1052C Digital Oscilloscope',
      'Measuring Instrument',
      'Tektronix',
      'TEK-C041928',
      '2025-02-14',
      'AVAILABLE',
      'Good'
    ).lastInsertRowid
  );
  const eq2 = Number(
    insertEquip.run(
      lab1,
      'UEM-IOT-002',
      'ESP32-S3 Sensor Fusion DevKit',
      'IoT Controller Kit',
      'Espressif Systems',
      'ESP-S3-88210',
      '2025-06-10',
      'ISSUED',
      'Good'
    ).lastInsertRowid
  );
  const eq3 = Number(
    insertEquip.run(
      lab1,
      'UEM-IOT-003',
      'Saleae Logic Pro 8 Analyzer',
      'Protocol Analyzer',
      'Saleae',
      'SAL-LP8-9941',
      '2025-01-20',
      'AVAILABLE',
      'Good'
    ).lastInsertRowid
  );
  const eq4 = Number(
    insertEquip.run(
      lab1,
      'UEM-IOT-004',
      'Arduino Giga R1 WiFi Sensor Pack',
      'IoT Controller Kit',
      'Arduino',
      'ARD-GIGA-5521',
      '2025-07-18',
      'ISSUED',
      'Good'
    ).lastInsertRowid
  );
  const eq5 = Number(
    insertEquip.run(
      lab2,
      'UEM-IOT-005',
      'Fluke 87V Industrial Multimeter',
      'Measuring Instrument',
      'Fluke',
      'FLK-87V-40219',
      '2024-11-05',
      'AVAILABLE',
      'Good'
    ).lastInsertRowid
  );
  const eq6 = Number(
    insertEquip.run(
      lab2,
      'UEM-IOT-006',
      'Rigol DP832 Programmable DC Supply',
      'Power Supply',
      'Rigol',
      'RGL-DP8-11742',
      '2024-09-12',
      'UNDER_MAINTENANCE',
      'Faulty'
    ).lastInsertRowid
  );
  const eq7 = Number(
    insertEquip.run(
      lab2,
      'UEM-IOT-007',
      'Raspberry Pi 5 Edge AI Kit (8GB)',
      'Edge Compute Kit',
      'Raspberry Pi Ltd',
      'RPI5-8G-77310',
      '2025-08-22',
      'ISSUED',
      'Minor Wear'
    ).lastInsertRowid
  );
  const eq8 = Number(
    insertEquip.run(
      lab3,
      'UEM-IOT-008',
      'Leica S6E Stereo Inspection Microscope',
      'Optical Instrument',
      'Leica Microsystems',
      'LCA-S6E-33019',
      '2024-04-03',
      'AVAILABLE',
      'Good'
    ).lastInsertRowid
  );
  const eq9 = Number(
    insertEquip.run(
      lab3,
      'UEM-IOT-009',
      'Keysight DSOX1204G Function Scope',
      'Measuring Instrument',
      'Keysight',
      'KEY-1204-8120',
      '2025-03-15',
      'AVAILABLE',
      'Good'
    ).lastInsertRowid
  );
  const eq10 = Number(
    insertEquip.run(
      lab1,
      'UEM-IOT-010',
      'LoRaWAN SX1262 Gateway & Node Kit',
      'RF & Telemetry',
      'Semtech / RAK',
      'RAK-1262-6104',
      '2025-09-01',
      'AVAILABLE',
      'Good'
    ).lastInsertRowid
  );
  insertEquip.run(
    lab2,
    'UEM-IOT-011',
    'STM32 Nucleo-H743ZI2 Robotics Kit',
    'IoT Controller Kit',
    'STMicroelectronics',
    'STM-H743-2291',
    '2025-04-19',
    'AVAILABLE',
    'Minor Wear'
  );
  insertEquip.run(
    lab3,
    'UEM-IOT-012',
    'Legacy Analog CRO 20MHz (Retired)',
    'Measuring Instrument',
    'Scientech',
    'SCI-CRO-0091',
    '2018-08-10',
    'RETIRED',
    'Fair'
  );

  // Issue logs (active, overdue, and closed history)
  const insertIssue = db.prepare(`
    INSERT INTO issue_log (
      equipment_id, borrower_id, issued_by, issue_date, due_date, return_date,
      condition_out, condition_in, transaction_status, verified_by, verified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // eq2 currently issued to shahbaz (on time)
  insertIssue.run(
    eq2,
    stu1Id,
    adminId,
    '2026-11-16',
    '2026-11-28',
    null,
    'Good',
    null,
    'ISSUED',
    null,
    null
  );

  // eq4 issued to shahbaz (student submitted return awaiting admin verification!)
  const issue4Id = Number(
    insertIssue.run(
      eq4,
      stu1Id,
      adminId,
      '2026-11-12',
      '2026-11-24',
      null,
      'Good',
      null,
      'ISSUED',
      null,
      null
    ).lastInsertRowid
  );

  // eq7 issued to subham (overdue past 2026-11-21)
  insertIssue.run(
    eq7,
    stu2Id,
    adminId,
    '2026-11-04',
    '2026-11-14',
    null,
    'Good',
    null,
    'ISSUED',
    null,
    null
  );

  // Historical closed return
  insertIssue.run(
    eq1,
    stu1Id,
    adminId,
    '2026-10-02',
    '2026-10-12',
    '2026-10-11',
    'Good',
    'Good',
    'RETURNED',
    adminId,
    '2026-10-11T14:20:00Z'
  );

  // Pending student kit return submission for Admin Kallab to verify
  db.prepare(`
    INSERT INTO kit_submissions (
      equipment_id, issue_id, submitted_by_user_id, claimed_condition,
      student_notes, submission_status, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    eq4,
    issue4Id,
    stu1Id,
    'Good',
    'Completed DHT22 & MQTT practical lab; all jumper cables and USB-C cable packed in case.',
    'PENDING_VERIFICATION',
    '2026-11-21T08:40:00Z'
  );

  // Maintenance tickets
  const insertMaint = db.prepare(`
    INSERT INTO maintenance (
      equipment_id, reported_by, issue_description, reported_date, service_date, vendor, cost, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertMaint.run(
    eq6,
    adminId,
    'Channel 2 current-limit relay trips intermittently under >2.5A load; awaiting bench board replacement.',
    '2026-11-10',
    null,
    'Rigol Authorized Service India',
    4800,
    'IN_PROGRESS'
  );
  insertMaint.run(
    eq5,
    stu1Id,
    'Replaced 440mA HRC fuse after student overcurrent test; verified mA range.',
    '2026-10-18',
    '2026-10-20',
    'Internal Lab Bench',
    450,
    'RESOLVED'
  );

  // Calibration records (including overdue & upcoming due)
  const insertCal = db.prepare(`
    INSERT INTO calibration (
      equipment_id, calibration_date, next_due_date, certificate_ref, result, remarks
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertCal.run(
    eq1,
    '2025-12-01',
    '2026-12-01',
    'NABL-CAL-2025-881',
    'PASS',
    'Vertical gain and 50MHz timebase verified within ±1.2%.'
  );
  insertCal.run(
    eq5,
    '2025-11-10',
    '2026-11-10',
    'NABL-CAL-2025-712',
    'PASS',
    'Annual DC/AC voltage & resistance calibration due for renewal.'
  );
  insertCal.run(
    eq8,
    '2026-06-15',
    '2027-06-15',
    'OPT-CAL-2026-104',
    'PASS',
    'Optical focus alignment and LED ring illumination nominal.'
  );
  insertCal.run(
    eq9,
    '2025-12-10',
    '2026-12-10',
    'NABL-CAL-2025-930',
    'ADJUSTED',
    'AWG offset trimmed at 1kHz reference.'
  );

  db.prepare(`
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    adminId,
    'SYSTEM_INITIALIZED',
    'SYSTEM',
    'LET-UEM',
    'Initialized UEM Kolkata CSE (IoT) Laboratory Equipment Tracker database.'
  );
}

export function parseUserRow(row: Record<string, unknown>): UserPublic {
  let permissions: UserPermissions = { ...DEFAULT_STUDENT_PERMISSIONS };
  try {
    const parsed = JSON.parse(String(row.permissions_json || '{}')) as Partial<UserPermissions>;
    permissions = {
      canViewInventory: Boolean(parsed.canViewInventory),
      canViewMaintenance: Boolean(parsed.canViewMaintenance),
      canSubmitKitReturn: Boolean(parsed.canSubmitKitReturn),
      canReportFault: Boolean(parsed.canReportFault),
      canViewReports: Boolean(parsed.canViewReports),
    };
  } catch {
    permissions = { ...DEFAULT_STUDENT_PERMISSIONS };
  }
  const role = (row.role === 'ADMIN' ? 'ADMIN' : 'STUDENT') as UserRole;
  return {
    user_id: Number(row.user_id),
    username: String(row.username),
    full_name: String(row.full_name),
    email: String(row.email),
    roll_no: row.roll_no ? String(row.roll_no) : null,
    enrollment_no: row.enrollment_no ? String(row.enrollment_no) : null,
    role,
    department: String(row.department),
    active_status: Boolean(row.active_status),
    permissions: role === 'ADMIN' ? { ...ADMIN_PERMISSIONS } : permissions,
    created_at: String(row.created_at),
  };
}

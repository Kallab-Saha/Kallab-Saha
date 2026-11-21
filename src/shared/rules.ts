import type {
  EquipmentCondition,
  EquipmentStatus,
  PermissionKey,
  UserPermissions,
  UserRole,
} from './types';

export interface IssueValidationInput {
  actorRole: UserRole;
  actorActive: boolean;
  equipmentStatus: EquipmentStatus;
  borrowerActive: boolean;
  borrowerOverdueCount: number;
}

export interface IssueValidationResult {
  allowed: boolean;
  outcome: 'REJECTED' | 'UNAVAILABLE' | 'BLOCKED' | 'SUCCESS';
  cfgPath: string;
  reason: string;
}

/**
 * Implements Section 6.2 McCabe Cyclomatic Complexity Control Flow Graph (V(G) = 4):
 * - N1 -> N2 (Authorised?) -> No -> N3 (Reject) -> N9
 * - N1 -> N2 -> Yes -> N4 (Asset available?) -> No -> N5 (Unavailable) -> N9
 * - N1 -> N2 -> Yes -> N4 -> Yes -> N6 (No overdue items?) -> No -> N7 (Block) -> N9
 * - N1 -> N2 -> Yes -> N4 -> Yes -> N6 -> Yes -> N8 (Create issue) -> N9
 */
export function evaluateIssueValidation(
  input: IssueValidationInput
): IssueValidationResult {
  if (input.actorRole !== 'ADMIN' || !input.actorActive || !input.borrowerActive) {
    return {
      allowed: false,
      outcome: 'REJECTED',
      cfgPath: 'N1 -> N2 -> N3 -> N9',
      reason:
        input.actorRole !== 'ADMIN'
          ? 'Only an active administrator can issue laboratory kits.'
          : 'User account is inactive and not authorized for checkout.',
    };
  }

  if (input.equipmentStatus !== 'AVAILABLE') {
    return {
      allowed: false,
      outcome: 'UNAVAILABLE',
      cfgPath: 'N1 -> N2 -> N4 -> N5 -> N9',
      reason: `Equipment is currently ${input.equipmentStatus.replace('_', ' ').toLowerCase()} and cannot be issued.`,
    };
  }

  if (input.borrowerOverdueCount > 0) {
    return {
      allowed: false,
      outcome: 'BLOCKED',
      cfgPath: 'N1 -> N2 -> N4 -> N6 -> N7 -> N9',
      reason: `Borrower has ${input.borrowerOverdueCount} overdue item(s); clear overdue returns first.`,
    };
  }

  return {
    allowed: true,
    outcome: 'SUCCESS',
    cfgPath: 'N1 -> N2 -> N4 -> N6 -> N8 -> N9',
    reason: 'All validation gates passed; issue record approved.',
  };
}

/**
 * Maps an Admin-verified kit condition to the updated equipment lifecycle status.
 * Only administrators invoke this during kit return verification.
 */
export function resolveVerifiedReturnStatus(
  verifiedCondition: EquipmentCondition
): EquipmentStatus {
  if (verifiedCondition === 'Faulty') {
    return 'UNDER_MAINTENANCE';
  }
  return 'AVAILABLE';
}

/**
 * Enforces strict RBAC rules:
 * - Issued Kits registry & Verification are strictly ADMIN-only.
 * - User & Permission management is strictly ADMIN-only.
 * - Students receive only the granular permissions granted by the Admin.
 */
export function canAccessIssuedKits(role: UserRole): boolean {
  return role === 'ADMIN';
}

export function canVerifyAndUpdateKit(role: UserRole): boolean {
  return role === 'ADMIN';
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'ADMIN';
}

export function hasUserPermission(
  role: UserRole,
  activeStatus: boolean,
  permissions: UserPermissions,
  required: PermissionKey
): boolean {
  if (!activeStatus) {
    return false;
  }
  if (role === 'ADMIN') {
    return true;
  }
  return Boolean(permissions[required]);
}

/**
 * Checks whether an unreturned issue record is overdue relative to referenceDate (YYYY-MM-DD).
 */
export function isIssueOverdue(
  dueDate: string,
  returnDate: string | null,
  referenceDate: string
): boolean {
  if (returnDate) {
    return false;
  }
  return dueDate < referenceDate;
}

/**
 * Checks whether a calibration or maintenance due date is overdue or within windowDays.
 */
export function isDueWithinDays(
  nextDueDate: string,
  referenceDate: string,
  windowDays = 30
): { isOverdue: boolean; isDueSoon: boolean; daysRemaining: number } {
  const dueMs = Date.parse(`${nextDueDate}T00:00:00Z`);
  const refMs = Date.parse(`${referenceDate}T00:00:00Z`);
  if (Number.isNaN(dueMs) || Number.isNaN(refMs)) {
    return { isOverdue: false, isDueSoon: false, daysRemaining: 0 };
  }
  const daysRemaining = Math.round((dueMs - refMs) / 86_400_000);
  return {
    isOverdue: daysRemaining < 0,
    isDueSoon: daysRemaining >= 0 && daysRemaining <= windowDays,
    daysRemaining,
  };
}

/**
 * Section 4.1 Basic COCOMO Organic Mode Estimation:
 * a = 2.4, b = 1.05, c = 2.5, d = 0.38
 */
export function computeCocomoOrganic(kloc: number): {
  effortPersonMonths: number;
  developmentMonths: number;
  averageTeamSize: number;
} {
  const safeKloc = Math.max(0.1, kloc);
  const effort = 2.4 * Math.pow(safeKloc, 1.05);
  const devTime = 2.5 * Math.pow(effort, 0.38);
  const teamSize = effort / devTime;
  return {
    effortPersonMonths: Number(effort.toFixed(2)),
    developmentMonths: Number(devTime.toFixed(2)),
    averageTeamSize: Number(teamSize.toFixed(2)),
  };
}

export const SELF_REGISTERED_VIEW_ONLY_PERMISSIONS: UserPermissions = {
  canViewInventory: true,
  canViewMaintenance: true,
  canSubmitKitReturn: false,
  canReportFault: false,
  canViewReports: false,
};

/**
 * Validates self-registered student User IDs:
 * - Blocks reserved administrator username ('kallab') and 'admin' so Admin stays fixed.
 * - Requires 3-32 safe identifier characters.
 */
export function validateStudentSignupUsername(username: string): {
  valid: boolean;
  reason?: string;
} {
  const trimmed = username.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 32) {
    return { valid: false, reason: 'User ID must be between 3 and 32 characters.' };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return {
      valid: false,
      reason: 'User ID may only contain letters, numbers, dots, underscores, or hyphens.',
    };
  }
  if (lower === 'kallab' || lower === 'admin' || lower === 'administrator') {
    return {
      valid: false,
      reason: 'This User ID is reserved for the fixed laboratory administrator.',
    };
  }
  return { valid: true };
}


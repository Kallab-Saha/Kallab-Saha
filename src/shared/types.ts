export type UserRole = 'ADMIN' | 'STUDENT';

export type EquipmentStatus =
  | 'AVAILABLE'
  | 'ISSUED'
  | 'UNDER_MAINTENANCE'
  | 'RETIRED';

export type EquipmentCondition = 'Good' | 'Minor Wear' | 'Fair' | 'Faulty';

export type TransactionStatus = 'ISSUED' | 'RETURNED' | 'OVERDUE';

export type SubmissionStatus =
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED';

export type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export type CalibrationResult = 'PASS' | 'ADJUSTED' | 'FAIL';

export interface UserPermissions {
  canViewInventory: boolean;
  canViewMaintenance: boolean;
  canSubmitKitReturn: boolean;
  canReportFault: boolean;
  canViewReports: boolean;
}

export type PermissionKey = keyof UserPermissions;

export const DEFAULT_STUDENT_PERMISSIONS: UserPermissions = {
  canViewInventory: true,
  canViewMaintenance: true,
  canSubmitKitReturn: true,
  canReportFault: false,
  canViewReports: false,
};

export const ADMIN_PERMISSIONS: UserPermissions = {
  canViewInventory: true,
  canViewMaintenance: true,
  canSubmitKitReturn: true,
  canReportFault: true,
  canViewReports: true,
};

export interface UserPublic {
  user_id: number;
  username: string;
  full_name: string;
  email: string;
  roll_no: string | null;
  enrollment_no: string | null;
  role: UserRole;
  department: string;
  active_status: boolean;
  permissions: UserPermissions;
  created_at: string;
}

export interface LabRecord {
  lab_id: number;
  lab_name: string;
  room_no: string;
  building: string;
  in_charge_id: number | null;
  in_charge_name?: string;
  contact_details: string;
}

export interface EquipmentRecord {
  equipment_id: number;
  lab_id: number;
  lab_name?: string;
  room_no?: string;
  asset_tag: string;
  name: string;
  category: string;
  manufacturer: string;
  serial_no: string;
  purchase_date: string;
  status: EquipmentStatus;
  condition: EquipmentCondition;
}

export interface IssueLogRecord {
  issue_id: number;
  equipment_id: number;
  asset_tag?: string;
  equipment_name?: string;
  category?: string;
  borrower_id: number;
  borrower_username?: string;
  borrower_name?: string;
  borrower_roll_no?: string | null;
  issued_by: number;
  issued_by_name?: string;
  issue_date: string;
  due_date: string;
  return_date: string | null;
  condition_out: EquipmentCondition;
  condition_in: EquipmentCondition | null;
  transaction_status: TransactionStatus;
  verified_by_name?: string | null;
  verified_at?: string | null;
  is_overdue?: boolean;
}

export interface KitSubmissionRecord {
  submission_id: number;
  equipment_id: number;
  asset_tag: string;
  equipment_name: string;
  submitted_by_user_id: number;
  submitted_by_username?: string;
  submitted_by_name?: string;
  submitted_by_roll_no?: string | null;
  claimed_condition: EquipmentCondition;
  student_notes: string;
  submission_status: SubmissionStatus;
  submitted_at: string;
  verified_by_user_id: number | null;
  verified_by_name?: string | null;
  verified_condition: EquipmentCondition | null;
  resulting_equipment_status: EquipmentStatus | null;
  admin_remarks: string | null;
  verified_at: string | null;
}

export interface MaintenanceRecord {
  maintenance_id: number;
  equipment_id: number;
  asset_tag?: string;
  equipment_name?: string;
  reported_by: number;
  reported_by_name?: string;
  issue_description: string;
  reported_date: string;
  service_date: string | null;
  vendor: string;
  cost: number;
  status: MaintenanceStatus;
}

export interface CalibrationRecord {
  calibration_id: number;
  equipment_id: number;
  asset_tag?: string;
  equipment_name?: string;
  calibration_date: string;
  next_due_date: string;
  certificate_ref: string;
  result: CalibrationResult;
  remarks: string;
}

export interface AuditLogRecord {
  audit_id: number;
  actor_user_id: number;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export interface OverviewStats {
  role: UserRole;
  totalEquipment: number;
  availableCount: number;
  underMaintenanceCount: number;
  retiredCount: number;
  labCount: number;
  // Admin-only fields (null/omitted for students so issued kits are never exposed)
  issuedCount?: number;
  overdueCount?: number;
  pendingVerificationsCount?: number;
  openMaintenanceCount?: number;
  calibrationDueCount?: number;
  totalUsersCount?: number;
}

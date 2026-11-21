import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessIssuedKits,
  canManageUsers,
  canVerifyAndUpdateKit,
  computeCocomoOrganic,
  evaluateIssueValidation,
  hasUserPermission,
  isDueWithinDays,
  isIssueOverdue,
  resolveVerifiedReturnStatus,
  SELF_REGISTERED_VIEW_ONLY_PERMISSIONS,
  validateStudentSignupUsername,
} from './rules';
import { DEFAULT_STUDENT_PERMISSIONS } from './types';

test('McCabe CFG Path 1: non-admin or inactive actor is REJECTED (N1->N2->N3->N9)', () => {
  const result = evaluateIssueValidation({
    actorRole: 'STUDENT',
    actorActive: true,
    equipmentStatus: 'AVAILABLE',
    borrowerActive: true,
    borrowerOverdueCount: 0,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.outcome, 'REJECTED');
  assert.equal(result.cfgPath, 'N1 -> N2 -> N3 -> N9');
});

test('McCabe CFG Path 2: unavailable equipment is UNAVAILABLE (N1->N2->N4->N5->N9)', () => {
  const result = evaluateIssueValidation({
    actorRole: 'ADMIN',
    actorActive: true,
    equipmentStatus: 'ISSUED',
    borrowerActive: true,
    borrowerOverdueCount: 0,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.outcome, 'UNAVAILABLE');
  assert.equal(result.cfgPath, 'N1 -> N2 -> N4 -> N5 -> N9');
});

test('McCabe CFG Path 3: borrower with overdue items is BLOCKED (N1->N2->N4->N6->N7->N9)', () => {
  const result = evaluateIssueValidation({
    actorRole: 'ADMIN',
    actorActive: true,
    equipmentStatus: 'AVAILABLE',
    borrowerActive: true,
    borrowerOverdueCount: 2,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.outcome, 'BLOCKED');
  assert.equal(result.cfgPath, 'N1 -> N2 -> N4 -> N6 -> N7 -> N9');
});

test('McCabe CFG Path 4: valid admin, available asset, zero overdue is SUCCESS (N1->N2->N4->N6->N8->N9)', () => {
  const result = evaluateIssueValidation({
    actorRole: 'ADMIN',
    actorActive: true,
    equipmentStatus: 'AVAILABLE',
    borrowerActive: true,
    borrowerOverdueCount: 0,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.cfgPath, 'N1 -> N2 -> N4 -> N6 -> N8 -> N9');
});

test('RBAC isolation: only ADMIN can access issued kits, verify submissions, or manage users', () => {
  assert.equal(canAccessIssuedKits('ADMIN'), true);
  assert.equal(canAccessIssuedKits('STUDENT'), false);
  assert.equal(canVerifyAndUpdateKit('ADMIN'), true);
  assert.equal(canVerifyAndUpdateKit('STUDENT'), false);
  assert.equal(canManageUsers('ADMIN'), true);
  assert.equal(canManageUsers('STUDENT'), false);
});

test('Granular student permissions honor admin-configured flags and active status', () => {
  const customPerms = {
    ...DEFAULT_STUDENT_PERMISSIONS,
    canReportFault: true,
    canViewReports: false,
  };
  assert.equal(hasUserPermission('STUDENT', true, customPerms, 'canViewInventory'), true);
  assert.equal(hasUserPermission('STUDENT', true, customPerms, 'canReportFault'), true);
  assert.equal(hasUserPermission('STUDENT', true, customPerms, 'canViewReports'), false);
  assert.equal(hasUserPermission('STUDENT', false, customPerms, 'canViewInventory'), false);
  assert.equal(hasUserPermission('ADMIN', true, DEFAULT_STUDENT_PERMISSIONS, 'canViewReports'), true);
});

test('Verified return condition maps Faulty to UNDER_MAINTENANCE and Good/Minor Wear to AVAILABLE', () => {
  assert.equal(resolveVerifiedReturnStatus('Good'), 'AVAILABLE');
  assert.equal(resolveVerifiedReturnStatus('Minor Wear'), 'AVAILABLE');
  assert.equal(resolveVerifiedReturnStatus('Fair'), 'AVAILABLE');
  assert.equal(resolveVerifiedReturnStatus('Faulty'), 'UNDER_MAINTENANCE');
});

test('Overdue and calibration due date helpers compute correctly', () => {
  assert.equal(isIssueOverdue('2026-11-10', null, '2026-11-21'), true);
  assert.equal(isIssueOverdue('2026-11-10', '2026-11-12', '2026-11-21'), false);
  assert.equal(isIssueOverdue('2026-11-25', null, '2026-11-21'), false);

  const overdueCal = isDueWithinDays('2026-11-15', '2026-11-21', 30);
  assert.equal(overdueCal.isOverdue, true);
  assert.equal(overdueCal.daysRemaining, -6);

  const soonCal = isDueWithinDays('2026-12-05', '2026-11-21', 30);
  assert.equal(soonCal.isOverdue, false);
  assert.equal(soonCal.isDueSoon, true);
  assert.equal(soonCal.daysRemaining, 14);
});

test('Basic COCOMO Organic estimation matches report values for 1.0 KLOC', () => {
  const est = computeCocomoOrganic(1.0);
  assert.equal(est.effortPersonMonths, 2.4);
  assert.equal(est.developmentMonths, 3.49);
  assert.equal(est.averageTeamSize, 0.69);
});

test('Student self-registration blocks reserved admin ID Kallab and grants strict view-only defaults', () => {
  assert.equal(validateStudentSignupUsername('Kallab').valid, false);
  assert.equal(validateStudentSignupUsername('kallab').valid, false);
  assert.equal(validateStudentSignupUsername('admin').valid, false);
  assert.equal(validateStudentSignupUsername('ab').valid, false);
  assert.equal(validateStudentSignupUsername('ananya_24').valid, true);

  assert.equal(SELF_REGISTERED_VIEW_ONLY_PERMISSIONS.canViewInventory, true);
  assert.equal(SELF_REGISTERED_VIEW_ONLY_PERMISSIONS.canViewMaintenance, true);
  assert.equal(SELF_REGISTERED_VIEW_ONLY_PERMISSIONS.canSubmitKitReturn, false);
  assert.equal(SELF_REGISTERED_VIEW_ONLY_PERMISSIONS.canReportFault, false);
  assert.equal(SELF_REGISTERED_VIEW_ONLY_PERMISSIONS.canViewReports, false);
});

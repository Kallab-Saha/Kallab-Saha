import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Lock, ShieldCheck, UserPlus, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  DEFAULT_STUDENT_PERMISSIONS,
  type AuditLogRecord,
  type PermissionKey,
  type UserPermissions,
  type UserPublic,
} from '../shared/types';

const PERMISSION_LABELS: Array<{ key: PermissionKey; label: string; desc: string }> = [
  {
    key: 'canViewInventory',
    label: 'Inventory & QR',
    desc: 'View catalog & lookup tags',
  },
  {
    key: 'canViewMaintenance',
    label: 'Maintenance View',
    desc: 'View service & calibration',
  },
  {
    key: 'canSubmitKitReturn',
    label: 'Submit Return',
    desc: 'Submit kit for admin check',
  },
  {
    key: 'canReportFault',
    label: 'Report Fault',
    desc: 'Log open fault tickets',
  },
  {
    key: 'canViewReports',
    label: 'View Reports',
    desc: 'View summary reports',
  },
];

export function UserManagementView() {
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserPublic | null>(null);
  const [newPasswordReset, setNewPasswordReset] = useState('');

  // Add student state
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [enrollmentNo, setEnrollmentNo] = useState('');
  const [department, setDepartment] = useState('CSE (IoT)');
  const [password, setPassword] = useState('');
  const [permissions, setPermissions] = useState<UserPermissions>({
    ...DEFAULT_STUDENT_PERMISSIONS,
  });
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ users: UserPublic[]; auditLogs: AuditLogRecord[] }>(
        '/api/users'
      );
      setUsers(res.users);
      setAuditLogs(res.auditLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleAddStudent(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ user: UserPublic }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          full_name: fullName.trim(),
          email: email.trim(),
          roll_no: rollNo.trim() || null,
          enrollment_no: enrollmentNo.trim() || null,
          department: department.trim(),
          password,
          permissions,
        }),
      });
      setShowAddModal(false);
      setUsername('');
      setFullName('');
      setEmail('');
      setRollNo('');
      setEnrollmentNo('');
      setPassword('');
      setPermissions({ ...DEFAULT_STUDENT_PERMISSIONS });
      setFeedback(`Added student "${res.user.full_name}" (ID: ${res.user.username}).`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create student account.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTogglePermission(target: UserPublic, key: PermissionKey) {
    const nextPermissions: UserPermissions = {
      ...target.permissions,
      [key]: !target.permissions[key],
    };
    setError(null);
    try {
      const res = await apiRequest<{ user: UserPublic }>(
        `/api/users/${target.user_id}/permissions`,
        {
          method: 'PATCH',
          body: JSON.stringify({ permissions: nextPermissions }),
        }
      );
      setUsers((prev) =>
        prev.map((u) => (u.user_id === target.user_id ? res.user : u))
      );
      setFeedback(
        `Updated "${key}" permission for ${target.full_name} (${target.username}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission.');
    }
  }

  async function handleToggleActive(target: UserPublic) {
    setError(null);
    try {
      const res = await apiRequest<{ user: UserPublic }>(`/api/users/${target.user_id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active_status: !target.active_status }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.user_id === target.user_id ? res.user : u))
      );
      setFeedback(
        `${res.user.active_status ? 'Activated' : 'Suspended'} account ${target.username}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setError(null);
    try {
      await apiRequest(`/api/users/${resetTarget.user_id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPasswordReset }),
      });
      setFeedback(`Password updated for ${resetTarget.full_name} (${resetTarget.username}).`);
      setResetTarget(null);
      setNewPasswordReset('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-900">
            <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="text-xs font-semibold">Centralized Admin Access Control</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 mt-1">
            Student Accounts &amp; Granular Permissions
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Create student login credentials and toggle view-only or submission permissions per user. Issued Kits remain strictly locked to Administrator.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          Add Student
        </button>
      </div>

      {feedback && (
        <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-3 font-medium">User ID / Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Issued Kits</th>
                {PERMISSION_LABELS.map((p) => (
                  <th key={p.key} className="px-3 py-3 font-medium text-center">
                    {p.label}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium text-right">Account Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    Loading user permissions...
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isAdm = u.role === 'ADMIN';
                  return (
                    <tr key={u.user_id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{u.full_name}</p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          ID: {u.username} {u.roll_no ? `· Roll ${u.roll_no}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            isAdm ? 'text-blue-900' : 'text-slate-700'
                          }`}
                        >
                          {isAdm ? 'Administrator' : 'Student'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isAdm ? (
                          <span className="text-emerald-700 font-medium">Full Access</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <Lock className="w-3 h-3" aria-hidden="true" />
                            Denied
                          </span>
                        )}
                      </td>
                      {PERMISSION_LABELS.map((perm) => (
                        <td key={perm.key} className="px-3 py-3 text-center">
                          {isAdm ? (
                            <span className="text-slate-400 text-[11px]">Locked On</span>
                          ) : (
                            <input
                              type="checkbox"
                              aria-label={`${perm.label} for ${u.username}`}
                              checked={Boolean(u.permissions[perm.key])}
                              onChange={() => handleTogglePermission(u, perm.key)}
                              className="w-4 h-4 accent-blue-900 cursor-pointer"
                            />
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isAdm ? (
                          <span className="text-[11px] text-slate-400">Primary Admin</span>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setResetTarget(u);
                                setNewPasswordReset('');
                              }}
                              aria-label={`Reset password for ${u.username}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                            >
                              <KeyRound className="w-3 h-3" aria-hidden="true" />
                              Password
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(u)}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer ${
                                u.active_status
                                  ? 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                  : 'text-red-800 bg-red-50 border-red-200 hover:bg-red-100'
                              }`}
                            >
                              {u.active_status ? 'Active' : 'Suspended'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Recent Custody &amp; Access Audit Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-2.5 font-medium">Timestamp</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.slice(0, 10).map((log) => (
                <tr key={log.audit_id}>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {log.created_at}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                    {log.actor_name}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-student-title"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 id="add-student-title" className="text-base font-semibold text-slate-900">
                  Add Student Account
                </h2>
                <p className="text-xs text-slate-500">
                  Create login credentials and assign specific view-only permissions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close add student dialog"
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddStudent} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="stu-uid" className="block text-xs font-medium text-slate-700 mb-1">
                    Student User ID (Login)
                  </label>
                  <input
                    id="stu-uid"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. priyam"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="stu-pw" className="block text-xs font-medium text-slate-700 mb-1">
                    Initial Password
                  </label>
                  <input
                    id="stu-pw"
                    type="password"
                    required
                    minLength={4}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 4 characters"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="stu-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    id="stu-name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Priyam Saha"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="stu-email" className="block text-xs font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    id="stu-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@uem.edu.in"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="stu-roll" className="block text-xs font-medium text-slate-700 mb-1">
                    Roll No
                  </label>
                  <input
                    id="stu-roll"
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    placeholder="18"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="stu-enroll" className="block text-xs font-medium text-slate-700 mb-1">
                    Enrollment No
                  </label>
                  <input
                    id="stu-enroll"
                    value={enrollmentNo}
                    onChange={(e) => setEnrollmentNo(e.target.value)}
                    placeholder="12024002034040"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="stu-dept" className="block text-xs font-medium text-slate-700 mb-1">
                    Department
                  </label>
                  <input
                    id="stu-dept"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold text-slate-900 mb-2">
                  Assigned Student Permissions (Issued Kits remain Admin-Only)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PERMISSION_LABELS.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex items-start gap-2 p-2 border border-slate-200 rounded text-xs cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={permissions[perm.key]}
                        onChange={(e) =>
                          setPermissions((prev) => ({ ...prev, [perm.key]: e.target.checked }))
                        }
                        className="mt-0.5 accent-blue-900"
                      />
                      <span>
                        <span className="font-medium text-slate-900 block">{perm.label}</span>
                        <span className="text-[11px] text-slate-500">{perm.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-60"
                >
                  {submitting ? 'Creating...' : 'Create Student Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-pw-title"
        >
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="reset-pw-title" className="text-base font-semibold text-slate-900">
                Reset Password: {resetTarget.username}
              </h2>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                aria-label="Close password reset dialog"
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="p-5 space-y-4">
              <div>
                <label htmlFor="reset-pw-input" className="block text-xs font-medium text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  id="reset-pw-input"
                  type="password"
                  required
                  minLength={4}
                  value={newPasswordReset}
                  onChange={(e) => setNewPasswordReset(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

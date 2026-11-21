import { useEffect, useState } from 'react';
import { ArrowRight, Check, Lock, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  KitSubmissionRecord,
  LabRecord,
  OverviewStats,
  UserPublic,
} from '../shared/types';
import type { NavTab } from './Sidebar';
import { StatusText } from './StatusText';

interface OverviewViewProps {
  user: UserPublic;
  onNavigate: (tab: NavTab) => void;
}

export function OverviewView({ user, onNavigate }: OverviewViewProps) {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [labs, setLabs] = useState<LabRecord[]>([]);
  const [mySubmissions, setMySubmissions] = useState<KitSubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user.role === 'ADMIN';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [ov, labsRes] = await Promise.all([
          apiRequest<OverviewStats>('/api/overview'),
          apiRequest<{ labs: LabRecord[] }>('/api/labs'),
        ]);
        if (!cancelled) {
          setStats(ov);
          setLabs(labsRes.labs);
        }
        if (!isAdmin) {
          const mySub = await apiRequest<{ submissions: KitSubmissionRecord[] }>(
            '/api/my-submissions'
          );
          if (!cancelled) {
            setMySubmissions(mySub.submissions);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load overview.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-56 bg-white border border-slate-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
        {error || 'Unable to load laboratory summary.'}
      </div>
    );
  }

  const permissionMatrix = [
    {
      label: 'Equipment Catalog & QR Lookup',
      granted: isAdmin || user.permissions.canViewInventory,
    },
    {
      label: 'Maintenance & Calibration Health',
      granted: isAdmin || user.permissions.canViewMaintenance,
    },
    {
      label: 'Submit Kit Return (Admin Verified)',
      granted: isAdmin || user.permissions.canSubmitKitReturn,
    },
    {
      label: 'Report Equipment Fault',
      granted: isAdmin || user.permissions.canReportFault,
    },
    {
      label: 'View Summary Reports',
      granted: isAdmin || user.permissions.canViewReports,
    },
    {
      label: 'Issued Kits Ledger & Verification',
      granted: isAdmin,
      adminOnly: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">Total Registered Assets</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {stats.totalEquipment}
          </p>
          <p className="text-xs text-slate-500 mt-1">Across {stats.labCount} laboratories</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <p className="text-xs font-medium text-slate-500">Available for Use</p>
          <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-1">
            {stats.availableCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">Ready &amp; serviceable in bench</p>
        </div>

        {isAdmin ? (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">Currently Issued Kits</p>
            <p className="text-2xl font-bold text-blue-900 font-mono tabular-nums mt-1">
              {stats.issuedCount ?? 0}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {stats.overdueCount ?? 0} overdue · {stats.pendingVerificationsCount ?? 0} awaiting verification
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">Under Maintenance</p>
            <p className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-1">
              {stats.underMaintenanceCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">Temporarily offline for servicing</p>
          </div>
        )}

        {isAdmin ? (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">Service &amp; Cal. Attention</p>
            <p className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-1">
              {(stats.openMaintenanceCount ?? 0) + (stats.calibrationDueCount ?? 0)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {stats.openMaintenanceCount ?? 0} open tickets · {stats.calibrationDueCount ?? 0} cal. due
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">Issued Kits Registry</p>
            <p className="text-sm font-semibold text-slate-900 mt-2 inline-flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-slate-500" aria-hidden="true" />
              Administrator Only
            </p>
            <p className="text-xs text-slate-500 mt-1">Restricted from student view</p>
          </div>
        )}
      </div>

      {isAdmin ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Pending Kit Return Verification
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                {stats.pendingVerificationsCount ?? 0} student kit return submission(s) await physical inspection and status update.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('issued-kits')}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900 hover:text-blue-700 cursor-pointer self-start"
            >
              Open Verification Queue
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Centralized Student Permissions
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                {stats.totalUsersCount ?? 0} student account(s) registered. Create student IDs, assign passwords, and toggle permissions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('users')}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900 hover:text-blue-700 cursor-pointer self-start"
            >
              Manage Users &amp; Permissions
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Equipment &amp; QR Asset Register
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Register new instruments, inspect calibration schedules, or print ISO/IEC 18004 QR tags.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('catalog')}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900 hover:text-blue-700 cursor-pointer self-start"
            >
              Open Equipment Catalog
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Your Assigned Access Permissions
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Configured by the Laboratory Administrator ({user.department})
            </p>
            <ul className="mt-4 divide-y divide-slate-100">
              {permissionMatrix.map((perm) => (
                <li
                  key={perm.label}
                  className="py-2.5 flex items-center justify-between gap-4 text-xs"
                >
                  <span className="text-slate-700 font-medium">{perm.label}</span>
                  {perm.granted ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium whitespace-nowrap">
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      Permitted (View-Only)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-500 whitespace-nowrap">
                      <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                      {perm.adminOnly ? 'Admin Only' : 'Not Permitted'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Your Kit Return Submissions
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Only the administrator can verify and update submitted kits.
                </p>
              </div>
              {user.permissions.canSubmitKitReturn && (
                <button
                  type="button"
                  onClick={() => onNavigate('submit-return')}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Submit Kit Return
                </button>
              )}
            </div>

            {mySubmissions.length === 0 ? (
              <div className="mt-6 py-8 text-center border border-dashed border-slate-200 rounded-md">
                <p className="text-xs text-slate-600">No kit return submissions recorded yet.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 font-medium">Asset Tag</th>
                      <th className="py-2 font-medium">Equipment</th>
                      <th className="py-2 font-medium">Verification Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mySubmissions.slice(0, 5).map((sub) => (
                      <tr key={sub.submission_id}>
                        <td className="py-2.5 font-mono text-slate-900 whitespace-nowrap">
                          {sub.asset_tag}
                        </td>
                        <td className="py-2.5 text-slate-700">{sub.equipment_name}</td>
                        <td className="py-2.5">
                          <StatusText status={sub.submission_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Registered Laboratories</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Academic laboratories connected to the centralized asset register
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-5 py-2.5 font-medium">Laboratory</th>
                <th className="px-5 py-2.5 font-medium">Room</th>
                <th className="px-5 py-2.5 font-medium">Building</th>
                <th className="px-5 py-2.5 font-medium">In-Charge</th>
                <th className="px-5 py-2.5 font-medium">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {labs.map((lab) => (
                <tr key={lab.lab_id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-medium text-slate-900">{lab.lab_name}</td>
                  <td className="px-5 py-3 font-mono text-slate-700">{lab.room_no}</td>
                  <td className="px-5 py-3 text-slate-600">{lab.building}</td>
                  <td className="px-5 py-3 text-slate-700">{lab.in_charge_name || 'Assigned'}</td>
                  <td className="px-5 py-3 text-slate-500">{lab.contact_details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

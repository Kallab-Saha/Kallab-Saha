import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { IssueLogRecord, MaintenanceRecord, UserPublic } from '../shared/types';
import { StatusText } from './StatusText';

interface ReportsViewProps {
  user: UserPublic;
}

interface ReportsPayload {
  categorySummary: Array<{
    category: string;
    total: number;
    available: number;
    maintenance: number;
  }>;
  calibrationAlerts: Array<{
    calibration_id: number;
    asset_tag: string;
    equipment_name: string;
    next_due_date: string;
    certificate_ref: string;
    isOverdue: boolean;
    isDueSoon: boolean;
    daysRemaining: number;
  }>;
  openMaintenance: MaintenanceRecord[];
  overdueIssues: IssueLogRecord[];
  generatedAt: string;
}

export function ReportsView({ user }: ReportsViewProps) {
  const isAdmin = user.role === 'ADMIN';
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest<ReportsPayload>('/api/reports');
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load reports.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function exportCsv() {
    if (!data) return;
    const rows = [
      ['Category', 'Total Assets', 'Available', 'Under Maintenance'],
      ...data.categorySummary.map((c) => [
        c.category,
        String(c.total),
        String(c.available),
        String(c.maintenance),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uem-let-inventory-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="p-8 bg-white border border-slate-200 rounded-lg text-xs text-slate-500">Generating reports...</div>;
  }

  if (error || !data) {
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
        {error || 'Reports unavailable.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Inventory Summaries &amp; Due-Date Alerts
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Generated <span className="font-mono">{data.generatedAt.slice(0, 16).replace('T', ' ')}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 cursor-pointer whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Download Category CSV
        </button>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Equipment Category Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Total Assets</th>
                <th className="px-4 py-3 font-medium text-right">Available</th>
                <th className="px-4 py-3 font-medium text-right">Under Maintenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.categorySummary.map((row) => (
                <tr key={row.category}>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.category}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-right text-slate-900">
                    {row.total}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-right text-emerald-700">
                    {row.available}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-right text-amber-700">
                    {row.maintenance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Calibration Due &amp; Overdue Alerts (Next 30 Days)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-3 font-medium">Asset Tag</th>
                <th className="px-4 py-3 font-medium">Equipment</th>
                <th className="px-4 py-3 font-medium">Certificate Ref</th>
                <th className="px-4 py-3 font-medium">Next Due Date</th>
                <th className="px-4 py-3 font-medium">Window</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.calibrationAlerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No calibrations overdue or due within 30 days.
                  </td>
                </tr>
              ) : (
                data.calibrationAlerts.map((cal) => (
                  <tr key={cal.calibration_id}>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                      {cal.asset_tag}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{cal.equipment_name}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{cal.certificate_ref}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-900">
                      {cal.next_due_date}
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={cal.isOverdue ? 'OVERDUE' : 'IN_PROGRESS'} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              Overdue Issued Kits (Admin-Only Alert)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="px-4 py-3 font-medium">Asset Tag</th>
                  <th className="px-4 py-3 font-medium">Equipment</th>
                  <th className="px-4 py-3 font-medium">Borrower</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.overdueIssues.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      Zero overdue issued kits.
                    </td>
                  </tr>
                ) : (
                  data.overdueIssues.map((iss) => (
                    <tr key={iss.issue_id}>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {iss.asset_tag}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{iss.equipment_name}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {iss.borrower_name} (Roll {iss.borrower_roll_no || '—'})
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-red-700 font-semibold">
                        {iss.due_date}
                      </td>
                      <td className="px-4 py-3">
                        <StatusText status="OVERDUE" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

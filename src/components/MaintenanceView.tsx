import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Wrench, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  CalibrationRecord,
  EquipmentRecord,
  MaintenanceRecord,
  UserPublic,
} from '../shared/types';
import { StatusText } from './StatusText';

interface MaintenanceViewProps {
  user: UserPublic;
}

export function MaintenanceView({ user }: MaintenanceViewProps) {
  const isAdmin = user.role === 'ADMIN';
  const canReport = isAdmin || user.permissions.canReportFault;

  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [calibration, setCalibration] = useState<CalibrationRecord[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showCalModal, setShowCalModal] = useState(false);

  // Ticket form
  const [ticketEquipId, setTicketEquipId] = useState<number>(0);
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketVendor, setTicketVendor] = useState('Internal Lab Bench');
  const [ticketCost, setTicketCost] = useState('0');
  const [markMaint, setMarkMaint] = useState(false);

  // Calibration form
  const [calEquipId, setCalEquipId] = useState<number>(0);
  const [calDate, setCalDate] = useState('2026-11-21');
  const [calNextDue, setCalNextDue] = useState('2027-11-21');
  const [calCert, setCalCert] = useState('');
  const [calResult, setCalResult] = useState<'PASS' | 'ADJUSTED' | 'FAIL'>('PASS');
  const [calRemarks, setCalRemarks] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [maintRes, eqRes] = await Promise.all([
        apiRequest<{ maintenance: MaintenanceRecord[]; calibration: CalibrationRecord[] }>(
          '/api/maintenance'
        ),
        apiRequest<{ equipment: EquipmentRecord[] }>('/api/equipment'),
      ]);
      setMaintenance(maintRes.maintenance);
      setCalibration(maintRes.calibration);
      setEquipment(eqRes.equipment);
      if (eqRes.equipment.length > 0) {
        setTicketEquipId((prev) => prev || eqRes.equipment[0].equipment_id);
        setCalEquipId((prev) => prev || eqRes.equipment[0].equipment_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load maintenance records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleTicketSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          equipment_id: ticketEquipId,
          issue_description: ticketDesc.trim(),
          vendor: ticketVendor.trim(),
          cost: Number(ticketCost) || 0,
          mark_under_maintenance: isAdmin && markMaint,
        }),
      });
      setShowTicketModal(false);
      setTicketDesc('');
      setFeedback('Maintenance / fault report logged.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log ticket.');
    }
  }

  async function handleResolveTicket(ticket: MaintenanceRecord) {
    try {
      await apiRequest(`/api/maintenance/${ticket.maintenance_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED', restore_available: true }),
      });
      setFeedback(`Resolved ticket #${ticket.maintenance_id} and restored availability.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket.');
    }
  }

  async function handleCalSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/calibration', {
        method: 'POST',
        body: JSON.stringify({
          equipment_id: calEquipId,
          calibration_date: calDate,
          next_due_date: calNextDue,
          certificate_ref: calCert.trim(),
          result: calResult,
          remarks: calRemarks.trim(),
        }),
      });
      setShowCalModal(false);
      setCalCert('');
      setCalRemarks('');
      setFeedback('Calibration record saved.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save calibration record.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Maintenance Tickets &amp; Calibration Schedule
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track fault logs, vendor repairs, and NABL calibration certificate due dates
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canReport && (
            <button
              type="button"
              onClick={() => setShowTicketModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 cursor-pointer whitespace-nowrap"
            >
              <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
              {isAdmin ? 'Log Service Ticket' : 'Report Fault'}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCalModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Record Calibration
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
          {feedback}
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Service &amp; Fault Tickets</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-3 font-medium">Asset Tag</th>
                <th className="px-4 py-3 font-medium">Equipment</th>
                <th className="px-4 py-3 font-medium">Issue Description</th>
                <th className="px-4 py-3 font-medium">Reported</th>
                <th className="px-4 py-3 font-medium">Vendor / Cost</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Loading tickets...
                  </td>
                </tr>
              ) : maintenance.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No maintenance tickets logged.
                  </td>
                </tr>
              ) : (
                maintenance.map((m) => (
                  <tr key={m.maintenance_id}>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {m.asset_tag}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{m.equipment_name}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-sm">{m.issue_description}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {m.reported_date}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {m.vendor} · <span className="font-mono tabular-nums">₹{m.cost}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={m.status} />
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {m.status !== 'RESOLVED' ? (
                          <button
                            type="button"
                            onClick={() => handleResolveTicket(m)}
                            className="px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 cursor-pointer"
                          >
                            Mark Resolved
                          </button>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-500">
                            Serviced {m.service_date || '—'}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Calibration Certificates</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-3 font-medium">Asset Tag</th>
                <th className="px-4 py-3 font-medium">Equipment</th>
                <th className="px-4 py-3 font-medium">Certificate Ref</th>
                <th className="px-4 py-3 font-medium">Calibrated</th>
                <th className="px-4 py-3 font-medium">Next Due</th>
                <th className="px-4 py-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {calibration.map((c) => (
                <tr key={c.calibration_id}>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                    {c.asset_tag}
                  </td>
                  <td className="px-4 py-3 text-slate-900 font-medium">{c.equipment_name}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{c.certificate_ref}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-slate-600">
                    {c.calibration_date}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-slate-900 font-medium">
                    {c.next_due_date}
                  </td>
                  <td className="px-4 py-3">
                    <StatusText status={c.result} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showTicketModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-modal-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="ticket-modal-title" className="text-base font-semibold text-slate-900">
                {isAdmin ? 'Log Maintenance Ticket' : 'Report Equipment Fault'}
              </h2>
              <button
                type="button"
                onClick={() => setShowTicketModal(false)}
                aria-label="Close maintenance dialog"
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleTicketSubmit} className="p-5 space-y-4">
              <div>
                <label htmlFor="t-equip" className="block text-xs font-medium text-slate-700 mb-1">
                  Equipment
                </label>
                <select
                  id="t-equip"
                  value={ticketEquipId}
                  onChange={(e) => setTicketEquipId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                >
                  {equipment.map((eq) => (
                    <option key={eq.equipment_id} value={eq.equipment_id}>
                      {eq.asset_tag} — {eq.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="t-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  Fault / Service Description
                </label>
                <textarea
                  id="t-desc"
                  required
                  rows={3}
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>
              {isAdmin && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="t-vendor" className="block text-xs font-medium text-slate-700 mb-1">
                        Service Vendor
                      </label>
                      <input
                        id="t-vendor"
                        value={ticketVendor}
                        onChange={(e) => setTicketVendor(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label htmlFor="t-cost" className="block text-xs font-medium text-slate-700 mb-1">
                        Estimated Cost (INR)
                      </label>
                      <input
                        id="t-cost"
                        type="number"
                        min={0}
                        value={ticketCost}
                        onChange={(e) => setTicketCost(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={markMaint}
                      onChange={(e) => setMarkMaint(e.target.checked)}
                    />
                    Set equipment status to Under Maintenance
                  </label>
                </>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTicketModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAdmin && showCalModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cal-modal-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="cal-modal-title" className="text-base font-semibold text-slate-900">
                Record Calibration Certificate
              </h2>
              <button
                type="button"
                onClick={() => setShowCalModal(false)}
                aria-label="Close calibration dialog"
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCalSubmit} className="p-5 space-y-4">
              <div>
                <label htmlFor="c-equip" className="block text-xs font-medium text-slate-700 mb-1">
                  Equipment
                </label>
                <select
                  id="c-equip"
                  value={calEquipId}
                  onChange={(e) => setCalEquipId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                >
                  {equipment.map((eq) => (
                    <option key={eq.equipment_id} value={eq.equipment_id}>
                      {eq.asset_tag} — {eq.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="c-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Calibration Date
                  </label>
                  <input
                    id="c-date"
                    type="date"
                    required
                    value={calDate}
                    onChange={(e) => setCalDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="c-due" className="block text-xs font-medium text-slate-700 mb-1">
                    Next Due Date
                  </label>
                  <input
                    id="c-due"
                    type="date"
                    required
                    value={calNextDue}
                    onChange={(e) => setCalNextDue(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="c-cert" className="block text-xs font-medium text-slate-700 mb-1">
                    Certificate Ref
                  </label>
                  <input
                    id="c-cert"
                    required
                    value={calCert}
                    onChange={(e) => setCalCert(e.target.value)}
                    placeholder="NABL-CAL-2026-..."
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="c-res" className="block text-xs font-medium text-slate-700 mb-1">
                    Result
                  </label>
                  <select
                    id="c-res"
                    value={calResult}
                    onChange={(e) => setCalResult(e.target.value as 'PASS' | 'ADJUSTED' | 'FAIL')}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  >
                    <option value="PASS">PASS</option>
                    <option value="ADJUSTED">ADJUSTED</option>
                    <option value="FAIL">FAIL</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="c-rem" className="block text-xs font-medium text-slate-700 mb-1">
                  Remarks
                </label>
                <input
                  id="c-rem"
                  value={calRemarks}
                  onChange={(e) => setCalRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCalModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800"
                >
                  Save Certificate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

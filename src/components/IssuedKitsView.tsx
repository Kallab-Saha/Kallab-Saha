import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardCheck, Plus, ShieldCheck, X, XCircle } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  EquipmentCondition,
  EquipmentRecord,
  IssueLogRecord,
  KitSubmissionRecord,
  UserPublic,
} from '../shared/types';
import { StatusText } from './StatusText';

interface IssuedKitsViewProps {
  onPendingCountChange?: (count: number) => void;
}

export function IssuedKitsView({ onPendingCountChange }: IssuedKitsViewProps) {
  const [subTab, setSubTab] = useState<'verification' | 'ledger' | 'issue'>('verification');
  const [issues, setIssues] = useState<IssueLogRecord[]>([]);
  const [submissions, setSubmissions] = useState<KitSubmissionRecord[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [students, setStudents] = useState<UserPublic[]>([]);
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'ACTIVE' | 'OVERDUE' | 'RETURNED'>('ALL');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Issue form state
  const [selectedEquipId, setSelectedEquipId] = useState<number>(0);
  const [selectedBorrowerId, setSelectedBorrowerId] = useState<number>(0);
  const [dueDate, setDueDate] = useState('2026-11-30');
  const [conditionOut, setConditionOut] = useState<EquipmentCondition>('Good');
  const [issueResultMsg, setIssueResultMsg] = useState<{
    type: 'success' | 'error';
    text: string;
    cfgPath?: string;
  } | null>(null);
  const [issuing, setIssuing] = useState(false);

  // Verification modal state
  const [verifyTarget, setVerifyTarget] = useState<KitSubmissionRecord | null>(null);
  const [directReturnTarget, setDirectReturnTarget] = useState<IssueLogRecord | null>(null);
  const [verifiedCondition, setVerifiedCondition] = useState<EquipmentCondition>('Good');
  const [adminRemarks, setAdminRemarks] = useState('');
  const [verifying, setVerifying] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [issueRes, subRes, eqRes, usrRes] = await Promise.all([
        apiRequest<{ issues: IssueLogRecord[] }>(`/api/issues?status=${ledgerFilter}`),
        apiRequest<{ submissions: KitSubmissionRecord[] }>('/api/submissions'),
        apiRequest<{ equipment: EquipmentRecord[] }>('/api/equipment'),
        apiRequest<{ users: UserPublic[] }>('/api/users'),
      ]);
      setIssues(issueRes.issues);
      setSubmissions(subRes.submissions);
      setEquipment(eqRes.equipment);
      const stuList = usrRes.users.filter((u) => u.role === 'STUDENT' && u.active_status);
      setStudents(stuList);

      const pendingCount = subRes.submissions.filter(
        (s) => s.submission_status === 'PENDING_VERIFICATION'
      ).length;
      onPendingCountChange?.(pendingCount);

      const firstAvail = eqRes.equipment.find((e) => e.status === 'AVAILABLE');
      if (firstAvail && !selectedEquipId) {
        setSelectedEquipId(firstAvail.equipment_id);
      }
      if (stuList.length > 0 && !selectedBorrowerId) {
        setSelectedBorrowerId(stuList[0].user_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issued kits workspace.');
    } finally {
      setLoading(false);
    }
  }, [ledgerFilter, onPendingCountChange, selectedEquipId, selectedBorrowerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleIssueSubmit(e: FormEvent) {
    e.preventDefault();
    setIssueResultMsg(null);
    setIssuing(true);
    try {
      const res = await apiRequest<{
        issue_id: number;
        validation: { cfgPath: string; reason: string };
      }>('/api/issues', {
        method: 'POST',
        body: JSON.stringify({
          equipment_id: selectedEquipId,
          borrower_id: selectedBorrowerId,
          due_date: dueDate,
          condition_out: conditionOut,
        }),
      });
      setIssueResultMsg({
        type: 'success',
        text: `Issue #${res.issue_id} recorded. ${res.validation.reason}`,
        cfgPath: res.validation.cfgPath,
      });
      setSelectedEquipId(0);
      await loadData();
    } catch (err) {
      setIssueResultMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Issue blocked by validation rules.',
      });
    } finally {
      setIssuing(false);
    }
  }

  async function handleVerifySubmission(decision: 'VERIFY' | 'REJECT') {
    if (!verifyTarget) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await apiRequest<{ nextStatus?: string; submission_status: string }>(
        `/api/submissions/${verifyTarget.submission_id}/verify`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            verified_condition: verifiedCondition,
            admin_remarks: adminRemarks.trim(),
          }),
        }
      );
      setFeedback(
        decision === 'VERIFY'
          ? `Verified ${verifyTarget.asset_tag} return. Equipment status updated to ${res.nextStatus}.`
          : `Rejected return submission for ${verifyTarget.asset_tag}.`
      );
      setVerifyTarget(null);
      setAdminRemarks('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleDirectReturn(e: FormEvent) {
    e.preventDefault();
    if (!directReturnTarget) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await apiRequest<{ nextStatus: string }>(
        `/api/issues/${directReturnTarget.issue_id}/return`,
        {
          method: 'POST',
          body: JSON.stringify({
            condition_in: verifiedCondition,
            remarks: adminRemarks.trim(),
          }),
        }
      );
      setFeedback(
        `Verified direct return for ${directReturnTarget.asset_tag}. Status updated to ${res.nextStatus}.`
      );
      setDirectReturnTarget(null);
      setAdminRemarks('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Return verification failed.');
    } finally {
      setVerifying(false);
    }
  }

  const pendingSubmissions = submissions.filter(
    (s) => s.submission_status === 'PENDING_VERIFICATION'
  );

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
          <button
            type="button"
            onClick={() => setSubTab('verification')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'verification'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Verification Queue ({pendingSubmissions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ledger')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'ledger'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Issued Kits Ledger ({issues.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('issue')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'issue'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Issue New Kit
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <ShieldCheck className="w-4 h-4 text-blue-900 shrink-0" aria-hidden="true" />
          <span>Administrator Custody &amp; Verification Only</span>
        </div>
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

      {subTab === 'verification' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Student Kit Submissions Awaiting Admin Verification
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspect submitted hardware physically before confirming condition and updating asset availability.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="px-4 py-3 font-medium">Asset Tag</th>
                  <th className="px-4 py-3 font-medium">Equipment</th>
                  <th className="px-4 py-3 font-medium">Submitted By</th>
                  <th className="px-4 py-3 font-medium">Claimed Condition</th>
                  <th className="px-4 py-3 font-medium">Student Notes</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Loading verification queue...
                    </td>
                  </tr>
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No student kit submissions recorded yet.
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => (
                    <tr key={sub.submission_id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {sub.asset_tag}
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-medium">{sub.equipment_name}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <span>{sub.submitted_by_name}</span>
                        <span className="text-slate-400 font-mono">
                          {' '}
                          · {sub.submitted_by_username}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{sub.claimed_condition}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                        {sub.student_notes}
                      </td>
                      <td className="px-4 py-3">
                        <StatusText status={sub.submission_status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {sub.submission_status === 'PENDING_VERIFICATION' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setVerifyTarget(sub);
                              setVerifiedCondition(sub.claimed_condition);
                              setAdminRemarks('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded hover:bg-blue-800 cursor-pointer"
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            Verify &amp; Update
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[11px]">
                            {sub.verified_by_name ? `Verified by ${sub.verified_by_name}` : 'Processed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'ledger' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Issued Kits Ledger</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete checkout history, due dates, and direct administrator return verification
              </p>
            </div>
            <select
              aria-label="Filter issued kits ledger"
              value={ledgerFilter}
              onChange={(e) =>
                setLedgerFilter(e.target.value as 'ALL' | 'ACTIVE' | 'OVERDUE' | 'RETURNED')
              }
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
            >
              <option value="ALL">All Records</option>
              <option value="ACTIVE">Currently Issued</option>
              <option value="OVERDUE">Overdue Only</option>
              <option value="RETURNED">Returned History</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="px-4 py-3 font-medium">Asset Tag</th>
                  <th className="px-4 py-3 font-medium">Equipment</th>
                  <th className="px-4 py-3 font-medium">Borrower</th>
                  <th className="px-4 py-3 font-medium">Issue / Due Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issues.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No issue records match this filter.
                    </td>
                  </tr>
                ) : (
                  issues.map((item) => (
                    <tr key={item.issue_id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {item.asset_tag}
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        {item.equipment_name}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <span>{item.borrower_name}</span>
                        <span className="text-slate-400 font-mono">
                          {' '}
                          · Roll {item.borrower_roll_no || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {item.issue_date} → {item.due_date}
                      </td>
                      <td className="px-4 py-3">
                        <StatusText status={item.transaction_status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {!item.return_date ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDirectReturnTarget(item);
                              setVerifiedCondition('Good');
                              setAdminRemarks('');
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer"
                          >
                            Verify Return
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[11px] font-mono">
                            Returned {item.return_date}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'issue' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-2xl">
          <h2 className="text-sm font-semibold text-slate-900">
            Issue Laboratory Equipment (McCabe V(G)=4 Validation)
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Enforces three decision gates prior to checkout: authorized admin &amp; active borrower, asset availability, and zero overdue items on the borrower&apos;s record.
          </p>

          <form onSubmit={handleIssueSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="issue-equip" className="block text-xs font-medium text-slate-700 mb-1">
                Equipment Item
              </label>
              <select
                id="issue-equip"
                value={selectedEquipId}
                onChange={(e) => setSelectedEquipId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              >
                <option value={0}>Select equipment...</option>
                {equipment.map((eq) => (
                  <option key={eq.equipment_id} value={eq.equipment_id}>
                    {eq.asset_tag} — {eq.name} ({eq.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="issue-borrower"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Student Borrower
                </label>
                <select
                  id="issue-borrower"
                  value={selectedBorrowerId}
                  onChange={(e) => setSelectedBorrowerId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                >
                  <option value={0}>Select student...</option>
                  {students.map((stu) => (
                    <option key={stu.user_id} value={stu.user_id}>
                      {stu.full_name} ({stu.username} · Roll {stu.roll_no || '—'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="issue-due" className="block text-xs font-medium text-slate-700 mb-1">
                  Return Due Date
                </label>
                <input
                  id="issue-due"
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div>
              <label htmlFor="issue-cond" className="block text-xs font-medium text-slate-700 mb-1">
                Condition at Checkout
              </label>
              <select
                id="issue-cond"
                value={conditionOut}
                onChange={(e) => setConditionOut(e.target.value as EquipmentCondition)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              >
                <option value="Good">Good</option>
                <option value="Minor Wear">Minor Wear</option>
                <option value="Fair">Fair</option>
              </select>
            </div>

            {issueResultMsg && (
              <div
                role="alert"
                className={`p-3 text-xs rounded-md border ${
                  issueResultMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <p className="font-medium">{issueResultMsg.text}</p>
                {issueResultMsg.cfgPath && (
                  <p className="font-mono text-[11px] mt-1">CFG Path: {issueResultMsg.cfgPath}</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={issuing || !selectedEquipId || !selectedBorrowerId}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-60 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {issuing ? 'Validating & Issuing...' : 'Validate & Issue Kit'}
            </button>
          </form>
        </div>
      )}

      {verifyTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-sub-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 id="verify-sub-title" className="text-base font-semibold text-slate-900">
                  Verify Submitted Kit: {verifyTarget.asset_tag}
                </h2>
                <p className="text-xs text-slate-500">
                  Submitted by {verifyTarget.submitted_by_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVerifyTarget(null)}
                aria-label="Close verification dialog"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                <p className="font-medium text-slate-900">{verifyTarget.equipment_name}</p>
                <p className="text-slate-600">
                  Student claimed condition: <span className="font-semibold">{verifyTarget.claimed_condition}</span>
                </p>
                <p className="text-slate-600">Student notes: {verifyTarget.student_notes}</p>
              </div>

              <div>
                <label
                  htmlFor="verify-cond"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Admin-Verified Physical Condition
                </label>
                <select
                  id="verify-cond"
                  value={verifiedCondition}
                  onChange={(e) => setVerifiedCondition(e.target.value as EquipmentCondition)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                >
                  <option value="Good">Good (Update status → Available)</option>
                  <option value="Minor Wear">Minor Wear (Update status → Available)</option>
                  <option value="Fair">Fair (Update status → Available)</option>
                  <option value="Faulty">Faulty (Update status → Under Maintenance + Ticket)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="verify-remarks"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Administrator Inspection Remarks
                </label>
                <textarea
                  id="verify-remarks"
                  rows={2}
                  value={adminRemarks}
                  onChange={(e) => setAdminRemarks(e.target.value)}
                  placeholder="Optional inspection notes..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={verifying}
                  onClick={() => handleVerifySubmission('REJECT')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  Reject
                </button>
                <button
                  type="button"
                  disabled={verifying}
                  onClick={() => handleVerifySubmission('VERIFY')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {verifying ? 'Updating...' : 'Verify & Update Status'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {directReturnTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="direct-ret-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="direct-ret-title" className="text-base font-semibold text-slate-900">
                Verify Return: {directReturnTarget.asset_tag}
              </h2>
              <button
                type="button"
                onClick={() => setDirectReturnTarget(null)}
                aria-label="Close return dialog"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleDirectReturn} className="p-5 space-y-4">
              <p className="text-xs text-slate-600">
                Borrower: <span className="font-semibold text-slate-900">{directReturnTarget.borrower_name}</span>
              </p>
              <div>
                <label
                  htmlFor="direct-cond"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Verified Condition In
                </label>
                <select
                  id="direct-cond"
                  value={verifiedCondition}
                  onChange={(e) => setVerifiedCondition(e.target.value as EquipmentCondition)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                >
                  <option value="Good">Good (Available)</option>
                  <option value="Minor Wear">Minor Wear (Available)</option>
                  <option value="Fair">Fair (Available)</option>
                  <option value="Faulty">Faulty (Under Maintenance)</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="direct-notes"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Verification Remarks
                </label>
                <textarea
                  id="direct-notes"
                  rows={2}
                  value={adminRemarks}
                  onChange={(e) => setAdminRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDirectReturnTarget(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifying}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800"
                >
                  Confirm Return &amp; Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

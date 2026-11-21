import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Send, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { EquipmentCondition, KitSubmissionRecord } from '../shared/types';
import { StatusText } from './StatusText';

export function SubmitReturnView() {
  const [assetTag, setAssetTag] = useState('');
  const [claimedCondition, setClaimedCondition] = useState<EquipmentCondition>('Good');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mySubmissions, setMySubmissions] = useState<KitSubmissionRecord[]>([]);

  const loadMine = useCallback(async () => {
    try {
      const res = await apiRequest<{ submissions: KitSubmissionRecord[] }>('/api/my-submissions');
      setMySubmissions(res.submissions);
    } catch {
      // handled silently if empty
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        submission: { asset_tag: string; equipment_name: string };
      }>('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          asset_tag: assetTag.trim(),
          claimed_condition: claimedCondition,
          student_notes: notes.trim(),
        }),
      });
      setFeedback(
        `Submitted return for ${res.submission.asset_tag} (${res.submission.equipment_name}). Awaiting Administrator verification and status update.`
      );
      setAssetTag('');
      setNotes('');
      await loadMine();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit kit return.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center gap-2 text-blue-900 mb-2">
          <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold">Admin-Verified Return Intake</span>
        </div>
        <h2 className="text-base font-semibold text-slate-900">Submit Kit Return</h2>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          Enter the Asset Tag on the laboratory kit you are returning. Only the laboratory administrator can physically verify your submission and update equipment availability.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="sub-tag" className="block text-xs font-medium text-slate-700 mb-1">
              Kit Asset Tag
            </label>
            <input
              id="sub-tag"
              required
              value={assetTag}
              onChange={(e) => setAssetTag(e.target.value)}
              placeholder="e.g. UEM-IOT-002"
              className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
            />
          </div>

          <div>
            <label htmlFor="sub-cond" className="block text-xs font-medium text-slate-700 mb-1">
              Reported Condition
            </label>
            <select
              id="sub-cond"
              value={claimedCondition}
              onChange={(e) => setClaimedCondition(e.target.value as EquipmentCondition)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            >
              <option value="Good">Good — All accessories intact</option>
              <option value="Minor Wear">Minor Wear — Functional</option>
              <option value="Fair">Fair — Functional with notes</option>
              <option value="Faulty">Faulty — Needs inspection</option>
            </select>
          </div>

          <div>
            <label htmlFor="sub-notes" className="block text-xs font-medium text-slate-700 mb-1">
              Return &amp; Accessory Notes
            </label>
            <textarea
              id="sub-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="List cables, sensors, or any issue observed during lab session..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>

          {error && (
            <div role="alert" className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          {feedback && (
            <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
              {feedback}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-60 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            {submitting ? 'Submitting...' : 'Submit for Admin Verification'}
          </button>
        </form>
      </section>

      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Your Submission Receipts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track whether the administrator has verified your returned equipment
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-3 font-medium">Asset Tag</th>
                <th className="px-4 py-3 font-medium">Equipment</th>
                <th className="px-4 py-3 font-medium">Reported</th>
                <th className="px-4 py-3 font-medium">Verification Status</th>
                <th className="px-4 py-3 font-medium">Admin Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mySubmissions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    You have not submitted any kit returns yet.
                  </td>
                </tr>
              ) : (
                mySubmissions.map((sub) => (
                  <tr key={sub.submission_id}>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {sub.asset_tag}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{sub.equipment_name}</td>
                    <td className="px-4 py-3 text-slate-600">{sub.claimed_condition}</td>
                    <td className="px-4 py-3">
                      <StatusText status={sub.submission_status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {sub.admin_remarks || 'Awaiting administrator inspection'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

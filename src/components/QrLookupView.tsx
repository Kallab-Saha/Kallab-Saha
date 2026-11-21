import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { QrCode, Search } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  CalibrationRecord,
  EquipmentRecord,
  IssueLogRecord,
  MaintenanceRecord,
  UserPublic,
} from '../shared/types';
import { StatusText } from './StatusText';

interface QrLookupViewProps {
  user: UserPublic;
}

interface LookupResponse {
  equipment: EquipmentRecord & { building?: string };
  latestCalibration: CalibrationRecord | null;
  maintenanceHistory: MaintenanceRecord[];
  activeIssue: IssueLogRecord | null;
}

const SAMPLE_TAGS = ['UEM-IOT-001', 'UEM-IOT-004', 'UEM-IOT-005', 'UEM-IOT-008'];

export function QrLookupView({ user }: QrLookupViewProps) {
  const isAdmin = user.role === 'ADMIN';
  const [tagInput, setTagInput] = useState('UEM-IOT-001');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [qrUrl, setQrUrl] = useState<string>('');

  async function lookupTag(tag: string) {
    const clean = tag.trim();
    if (!clean) {
      setError('Enter an asset tag or QR identifier.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<LookupResponse>(
        `/api/equipment/lookup/${encodeURIComponent(clean)}`
      );
      setResult(data);
      const qr = await QRCode.toDataURL(
        JSON.stringify({
          system: 'UEM-LET',
          asset_tag: data.equipment.asset_tag,
          name: data.equipment.name,
        }),
        { width: 180, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } }
      );
      setQrUrl(qr);
    } catch (err) {
      setResult(null);
      setQrUrl('');
      setError(err instanceof Error ? err.message : 'Asset lookup failed.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    lookupTag('UEM-IOT-001');
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    lookupTag(tagInput);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          QR Code &amp; Unique Asset Tag Lookup
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Enter an equipment asset tag or decoded QR payload identifier to inspect live status, laboratory location, and calibration history.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <QrCode
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Enter asset tag to look up"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g. UEM-IOT-001"
              className="w-full pl-9 pr-3 py-2 text-xs font-mono uppercase text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <Search className="w-3.5 h-3.5" aria-hidden="true" />
            {loading ? 'Looking up...' : 'Lookup Asset'}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Quick tags:</span>
          {SAMPLE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setTagInput(tag);
                lookupTag(tag);
              }}
              className="font-mono text-blue-900 hover:underline cursor-pointer px-1.5 py-0.5 bg-slate-100 rounded"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-6 flex flex-col items-center text-center">
            {qrUrl && (
              <img
                src={qrUrl}
                alt={`QR label for ${result.equipment.asset_tag}`}
                className="w-40 h-40 border border-slate-200 rounded p-2"
                referrerPolicy="no-referrer"
              />
            )}
            <p className="mt-4 font-mono text-base font-bold text-slate-900">
              {result.equipment.asset_tag}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-800">{result.equipment.name}</p>
            <div className="mt-2">
              <StatusText
                status={
                  !isAdmin && result.equipment.status === 'ISSUED'
                    ? 'In Use'
                    : result.equipment.status
                }
              />
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-slate-900">Asset Specifications</h3>
              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <dt className="text-slate-500">Category</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{result.equipment.category}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Manufacturer / Serial No</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {result.equipment.manufacturer} ·{' '}
                    <span className="font-mono">{result.equipment.serial_no}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Laboratory &amp; Room</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {result.equipment.lab_name} · Room {result.equipment.room_no}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Physical Condition &amp; Purchase</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {result.equipment.condition} · Purchased{' '}
                    <span className="font-mono">{result.equipment.purchase_date}</span>
                  </dd>
                </div>
              </dl>
            </div>

            {isAdmin && result.activeIssue && (
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Current Custody (Admin-Only)
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Issued to <span className="font-semibold text-slate-900">{result.activeIssue.borrower_name}</span>{' '}
                  (Roll {result.activeIssue.borrower_roll_no || '—'} ·{' '}
                  <span className="font-mono">{result.activeIssue.borrower_username}</span>) on{' '}
                  <span className="font-mono">{result.activeIssue.issue_date}</span> · Due{' '}
                  <span className="font-mono">{result.activeIssue.due_date}</span>.
                </p>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-slate-900">
                Latest Calibration &amp; Service Notes
              </h3>
              {result.latestCalibration ? (
                <div className="mt-2 text-xs text-slate-700 space-y-1">
                  <p>
                    Certificate{' '}
                    <span className="font-mono font-medium">
                      {result.latestCalibration.certificate_ref}
                    </span>{' '}
                    · Calibrated{' '}
                    <span className="font-mono">{result.latestCalibration.calibration_date}</span> ·
                    Next Due{' '}
                    <span className="font-mono">{result.latestCalibration.next_due_date}</span>
                  </p>
                  <p className="text-slate-500">{result.latestCalibration.remarks}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  No calibration certificate logged for this asset.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

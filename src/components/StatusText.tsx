import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  MinusCircle,
  Wrench,
  XCircle,
} from 'lucide-react';

interface StatusTextProps {
  status: string;
}

export function StatusText({ status }: StatusTextProps) {
  const normalized = status.toUpperCase();

  if (normalized === 'AVAILABLE' || normalized === 'PASS' || normalized === 'RESOLVED' || normalized === 'VERIFIED' || normalized === 'RETURNED') {
    const label =
      normalized === 'AVAILABLE'
        ? 'Available'
        : normalized === 'PASS'
          ? 'Pass'
          : normalized === 'RESOLVED'
            ? 'Resolved'
            : normalized === 'VERIFIED'
              ? 'Verified'
              : 'Returned';
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  if (normalized === 'ISSUED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-800 whitespace-nowrap">
        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Issued</span>
      </span>
    );
  }

  if (normalized === 'PENDING_VERIFICATION' || normalized === 'IN_PROGRESS' || normalized === 'ADJUSTED') {
    const label =
      normalized === 'PENDING_VERIFICATION'
        ? 'Pending Admin Verification'
        : normalized === 'IN_PROGRESS'
          ? 'In Progress'
          : 'Adjusted';
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  if (normalized === 'UNDER_MAINTENANCE' || normalized === 'OPEN') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 whitespace-nowrap">
        <Wrench className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{normalized === 'OPEN' ? 'Open Ticket' : 'Under Maintenance'}</span>
      </span>
    );
  }

  if (normalized === 'OVERDUE' || normalized === 'FAIL' || normalized === 'REJECTED') {
    const label =
      normalized === 'OVERDUE' ? 'Overdue' : normalized === 'FAIL' ? 'Failed' : 'Rejected';
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        {normalized === 'OVERDUE' ? (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        )}
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
      <MinusCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{normalized === 'RETIRED' ? 'Retired' : status}</span>
    </span>
  );
}

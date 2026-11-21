import { useState } from 'react';
import { computeCocomoOrganic, evaluateIssueValidation } from '../shared/rules';
import { StatusText } from './StatusText';

const SRS_REQUIREMENTS = [
  {
    id: 'FR-01',
    module: 'User Authentication & Roles',
    spec: 'Salted-hash sign-in separating Administrator (Kallab) custody from Student view-only permissions.',
  },
  {
    id: 'FR-02',
    module: 'Equipment Registration',
    spec: 'Administrators add, edit, view, and retire equipment records with unique asset tags, serial numbers, and conditions.',
  },
  {
    id: 'FR-03',
    module: 'QR / Asset Tag Lookup',
    spec: 'Instant lookup using unique asset tag or ISO/IEC 18004 QR code label with live equipment & calibration status.',
  },
  {
    id: 'FR-04',
    module: 'Issue and Return Verification',
    spec: 'Admin issues kits after 3-gate validation; students submit kit returns that only Admin can verify and update.',
  },
  {
    id: 'FR-05',
    module: 'Maintenance & Calibration',
    spec: 'Track fault tickets, service vendors, repair costs, NABL calibration certificates, and next due dates.',
  },
  {
    id: 'FR-06',
    module: 'Search, Alerts & Reports',
    spec: 'Filter inventory by name, category, lab, or status; generate overdue lists, calibration due alerts, and CSV exports.',
  },
];

const TEST_CASES = [
  {
    id: 'TC-01',
    name: 'Valid user sign-in',
    input: 'Registered user ID & correct password',
    expected: 'User is authenticated and shown permitted dashboard.',
    status: 'PASS',
  },
  {
    id: 'TC-02',
    name: 'Invalid credentials',
    input: 'Incorrect password',
    expected: 'Sign-in rejected with explicit error message.',
    status: 'PASS',
  },
  {
    id: 'TC-03',
    name: 'Duplicate asset tag',
    input: 'Register existing asset_tag again',
    expected: 'System blocks duplicate (409 Conflict) and preserves original.',
    status: 'PASS',
  },
  {
    id: 'TC-04',
    name: 'Equipment search',
    input: 'Search by name, category, or asset tag',
    expected: 'Matching equipment records and current status displayed.',
    status: 'PASS',
  },
  {
    id: 'TC-05',
    name: 'Issue available item',
    input: 'Admin actor, active borrower, status = AVAILABLE, 0 overdue',
    expected: 'Issue record created and status changes to ISSUED.',
    status: 'PASS',
  },
  {
    id: 'TC-06',
    name: 'Issue unavailable item',
    input: 'Equipment status = ISSUED or UNDER_MAINTENANCE',
    expected: 'New issue blocked and current status displayed.',
    status: 'PASS',
  },
  {
    id: 'TC-07',
    name: 'Return verification',
    input: 'Student submits kit; Admin verifies condition',
    expected: 'Return date & condition saved; status updated by Admin only.',
    status: 'PASS',
  },
  {
    id: 'TC-08',
    name: 'Calibration / maintenance due',
    input: 'Next due date in past or within 30 days',
    expected: 'Item appears in Calibration Due & Overdue Alerts report.',
    status: 'PASS',
  },
  {
    id: 'TC-09',
    name: 'Role restriction',
    input: 'Non-admin attempts to access Issued Kits or retire asset',
    expected: 'Operation denied (403 Forbidden) and record unchanged.',
    status: 'PASS',
  },
];

const GANTT_PHASES = [
  { phase: 'Requirements & SRS', weeks: 'W1–2', start: 0, span: 2 },
  { phase: 'ER / DFD / UML Design', weeks: 'W3–4', start: 2, span: 2 },
  { phase: 'Database & Authentication', weeks: 'W5–6', start: 4, span: 2 },
  { phase: 'Inventory & Issue/Verify Modules', weeks: 'W7–8', start: 6, span: 2 },
  { phase: 'Integration & Testing', weeks: 'W9–10', start: 8, span: 2 },
  { phase: 'Documentation & Demonstration', weeks: 'W11–12', start: 10, span: 2 },
];

export function ReportSpecsView() {
  const [simAdmin, setSimAdmin] = useState(true);
  const [simAvail, setSimAvail] = useState(true);
  const [simNoOverdue, setSimNoOverdue] = useState(true);
  const [kloc, setKloc] = useState(1.0);

  const cfgResult = evaluateIssueValidation({
    actorRole: simAdmin ? 'ADMIN' : 'STUDENT',
    actorActive: true,
    equipmentStatus: simAvail ? 'AVAILABLE' : 'ISSUED',
    borrowerActive: true,
    borrowerOverdueCount: simNoOverdue ? 0 : 1,
  });

  const cocomo = computeCocomoOrganic(kloc);

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-blue-900">
              University of Engineering &amp; Management, Kolkata · Software Engineering Laboratory
            </p>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
              Laboratory Equipment Tracker — Project Specification &amp; Engineering Models
            </h2>
            <p className="text-xs text-slate-600 mt-2 max-w-3xl leading-relaxed">
              Department of Computer Science &amp; Engineering (Internet of Things) · 5th Semester, Section C, Batch 2024–2028. Guided by Prof. (Dr.) Arpita Biswas and HOD Prof. (Dr.) Abir Mukherjee.
            </p>
          </div>
          <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-4 shrink-0 space-y-1 font-mono">
            <p className="font-sans font-semibold text-slate-900 mb-1.5">Submitted By</p>
            <p>Kallab Saha · Roll 19 · 12024002034149</p>
            <p>Shahbaz Ali Khan · Roll 11 · 12024002034140</p>
            <p>Subham Das · Roll 02 · 12024002034068</p>
            <p>Priyam Saha · Roll 18 · 12024002034040</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            Interactive McCabe Cyclomatic Complexity Simulator (V(G) = 4)
          </h3>
          <p className="text-xs text-slate-600 mt-1">
            Section 6.2 Control Flow Graph: 9 Nodes (N), 11 Directed Edges (E), 3 Predicate Nodes (P). V(G) = E - N + 2 = 4.
          </p>

          <div className="mt-4 space-y-2.5">
            <label className="flex items-center justify-between p-2.5 border border-slate-200 rounded text-xs cursor-pointer">
              <span className="font-medium text-slate-800">N2: User Authorised (Admin Role)?</span>
              <input
                type="checkbox"
                checked={simAdmin}
                onChange={(e) => setSimAdmin(e.target.checked)}
                className="w-4 h-4 accent-blue-900"
              />
            </label>
            <label className="flex items-center justify-between p-2.5 border border-slate-200 rounded text-xs cursor-pointer">
              <span className="font-medium text-slate-800">N4: Equipment Available?</span>
              <input
                type="checkbox"
                checked={simAvail}
                onChange={(e) => setSimAvail(e.target.checked)}
                className="w-4 h-4 accent-blue-900"
              />
            </label>
            <label className="flex items-center justify-between p-2.5 border border-slate-200 rounded text-xs cursor-pointer">
              <span className="font-medium text-slate-800">N6: Borrower Has No Overdue Items?</span>
              <input
                type="checkbox"
                checked={simNoOverdue}
                onChange={(e) => setSimNoOverdue(e.target.checked)}
                className="w-4 h-4 accent-blue-900"
              />
            </label>
          </div>

          <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1">
            <p className="font-semibold text-slate-900">
              Outcome: <span className="font-mono">{cfgResult.outcome}</span>
            </p>
            <p className="font-mono text-blue-900">Basis Path: {cfgResult.cfgPath}</p>
            <p className="text-slate-600">{cfgResult.reason}</p>
          </div>
        </section>

        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            Basic COCOMO Cost &amp; Schedule Estimator (Organic Mode)
          </h3>
          <p className="text-xs text-slate-600 mt-1">
            Coefficients: a = 2.4, b = 1.05, c = 2.5, d = 0.38. Default report prototype size = 1.0 KLOC.
          </p>

          <div className="mt-4">
            <label htmlFor="kloc-range" className="flex justify-between text-xs font-medium text-slate-700 mb-1">
              <span>Estimated Code Size (KLOC)</span>
              <span className="font-mono font-semibold text-blue-900">{kloc.toFixed(1)} KLOC</span>
            </label>
            <input
              id="kloc-range"
              type="range"
              min={0.5}
              max={8.0}
              step={0.5}
              value={kloc}
              onChange={(e) => setKloc(Number(e.target.value))}
              className="w-full accent-blue-900"
            />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded">
              <p className="text-[11px] text-slate-500">Effort (E)</p>
              <p className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {cocomo.effortPersonMonths.toFixed(2)} PM
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded">
              <p className="text-[11px] text-slate-500">Dev Time (D)</p>
              <p className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {cocomo.developmentMonths.toFixed(2)} mo
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded">
              <p className="text-[11px] text-slate-500">Avg Team Size</p>
              <p className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {cocomo.averageTeamSize.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold text-slate-900 mb-2">12-Week Academic Project Schedule</p>
            <div className="space-y-1.5">
              {GANTT_PHASES.map((g) => (
                <div key={g.phase} className="grid grid-cols-12 items-center gap-2 text-[11px]">
                  <span className="col-span-5 text-slate-700 truncate">{g.phase}</span>
                  <div className="col-span-7 bg-slate-100 h-4 rounded relative overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 bg-blue-900 rounded text-[10px] text-white font-mono flex items-center justify-center"
                      style={{
                        left: `${(g.start / 12) * 100}%`,
                        width: `${(g.span / 12) * 100}%`,
                      }}
                    >
                      {g.weeks}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            SRS Functional Requirements (FR-01 – FR-06)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-2.5 font-medium">Req. ID</th>
                <th className="px-4 py-2.5 font-medium">Module</th>
                <th className="px-4 py-2.5 font-medium">Implemented Specification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SRS_REQUIREMENTS.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-mono font-semibold text-blue-900 whitespace-nowrap">
                    {r.id}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                    {r.module}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{r.spec}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Functional Test Case Suite (TC-01 – TC-09)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-2.5 font-medium">TC ID</th>
                <th className="px-4 py-2.5 font-medium">Test Case</th>
                <th className="px-4 py-2.5 font-medium">Test Input</th>
                <th className="px-4 py-2.5 font-medium">Expected Result</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TEST_CASES.map((tc) => (
                <tr key={tc.id}>
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                    {tc.id}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{tc.name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{tc.input}</td>
                  <td className="px-4 py-2.5 text-slate-600">{tc.expected}</td>
                  <td className="px-4 py-2.5">
                    <StatusText status={tc.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useAuth } from '../../store/auth';

type PanchayatOption = { _id: string; name: string; district?: string };
type Row = Record<string, any>;
type Report = {
  generatedAt: string;
  filters: { panchayatId: string; panchayatName: string; infrastructureType: string; startDate: string; endDate: string; budget: number; dateScope: string };
  analyzedCounts: { infrastructure: number; complaints: number; complaintsWithCoordinates: number; maintenanceAssignments: number; routes: number };
  infrastructure: { total: number; byType: Record<string, number>; maintenanceNeeded: number; conditionDistribution: { condition: string; count: number }[] };
  priority: { averageScore: number; distribution: Record<string, number>; ranking: Row[]; topCritical: Row[] };
  complaints: { total: number; open: number; closed: number; withCoordinates: number; byCategory: Row[]; byPriority: Row[]; byStatus: Row[]; hotspots: Row[] };
  maintenance: { total: number; statusCounts: Record<string, number>; allocatedBudget: number; actualCost: number };
  routes: { count: number; activeCount: number; totalDistanceKm: number; totalStops: number; routes: Row[] };
  gaps: { analyzedAreas: number; underservedAreas: number; affectedPopulation: number; totalPopulation: number; criticalCount: number; highCount: number; topGaps: Row[] };
  budget: { ceiling: number; recommendedCost: number; remainingBudget: number; utilizationPercent: number; selectedCount: number; candidatesAnalyzed: number; excludedMissingCost: number; projects: Row[] };
};

const TYPES = ['Road', 'School', 'Healthcare', 'WaterFacility', 'Other'];
const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const title = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase());
const csvCell = (value: unknown) => {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

function makeCsv(report: Report) {
  const rows: unknown[][] = [
    ['RDMT Analytical Report'],
    ['Generated at', new Date(report.generatedAt).toLocaleString()],
    ['Panchayat', report.filters.panchayatName],
    ['Infrastructure type', report.filters.infrastructureType],
    ['Date range', report.filters.startDate || 'Any', report.filters.endDate || 'Any'],
    ['Infrastructure analyzed', report.analyzedCounts.infrastructure],
    ['Complaints analyzed', report.analyzedCounts.complaints],
    ['Maintenance assignments analyzed', report.analyzedCounts.maintenanceAssignments],
    ['Saved routes analyzed', report.analyzedCounts.routes],
    [], ['Infrastructure by type'], ['Type', 'Records'],
    ...Object.entries(report.infrastructure.byType),
    [], ['Condition distribution'], ['Condition', 'Records'],
    ...report.infrastructure.conditionDistribution.map((item) => [item.condition, item.count]),
    [], ['Priority ranking'], ['Name', 'Type', 'Ward', 'Score', 'Level', 'Condition'],
    ...report.priority.ranking.map((item) => [item.name, item.type, item.ward, item.score, item.level, item.condition]),
    [], ['Top critical infrastructure'], ['Name', 'Type', 'Ward', 'Score', 'Condition', 'Explanation'],
    ...report.priority.topCritical.map((item) => [item.name, item.type, item.ward, item.score, item.condition, item.explanation]),
    [], ['Complaint categories'], ['Category', 'Count'], ...report.complaints.byCategory.map((item) => [item.category, item.count]),
    [], ['Complaint priority'], ['Priority', 'Count'], ...report.complaints.byPriority.map((item) => [item.priority, item.count]),
    [], ['Complaint hotspots'], ['Area', 'Complaints', 'Critical', 'Top category', 'Latitude', 'Longitude'],
    ...report.complaints.hotspots.map((item) => [item.name, item.complaintCount, item.criticalCount, item.topCategory, item.center?.lat, item.center?.lng]),
    [], ['Maintenance statuses'], ['Status', 'Count'], ...Object.entries(report.maintenance.statusCounts),
    ['Maintenance total', report.maintenance.total], ['Allocated maintenance budget', report.maintenance.allocatedBudget], ['Actual maintenance cost', report.maintenance.actualCost],
    [], ['Routes'], ['Name', 'Status', 'Distance km', 'Duration minutes', 'Stops', 'Generated'],
    ...report.routes.routes.map((item) => [item.name, item.status, item.distanceKm, item.durationMinutes, item.stopCount, item.generatedAt]),
    ['Route count', report.routes.count], ['Active routes', report.routes.activeCount], ['Total route distance km', report.routes.totalDistanceKm], ['Total route stops', report.routes.totalStops],
    [], ['Infrastructure gaps'], ['Area', 'Ward', 'Severity', 'Affected population', 'Nearest school km', 'Nearest road km'],
    ...report.gaps.topGaps.map((item) => [item.name, item.ward, item.severity, item.affectedPopulation, item.distanceToNearestSchoolKm, item.distanceToNearestRoadKm]),
    ['Analyzed areas', report.gaps.analyzedAreas], ['Underserved areas', report.gaps.underservedAreas], ['Affected population', report.gaps.affectedPopulation],
    [], ['Budget recommendations'], ['Project', 'Type', 'Ward', 'Priority', 'Score', 'Estimated cost', 'Reason'],
    ...report.budget.projects.map((item) => [item.name, item.type, item.ward, item.priority, item.score, item.estimatedCost, item.reason]),
    ['Budget ceiling', report.budget.ceiling], ['Recommended spend', report.budget.recommendedCost], ['Remaining budget', report.budget.remainingBudget],
    ['Budget utilization percent', report.budget.utilizationPercent], ['Selected projects', report.budget.selectedCount], ['Excluded assets missing recorded costs', report.budget.excludedMissingCost]
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function Section({ title: heading, children }: { title: string; children: ReactNode }) {
  return <section className="report-section rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="mb-4 text-lg font-bold text-slate-900">{heading}</h2>{children}
  </section>;
}

function Table({ headers, rows, empty = 'No matching records.' }: { headers: string[]; rows: (string | number | ReactNode)[][]; empty?: string }) {
  if (!rows.length) return <p className="py-4 text-sm text-slate-500">{empty}</p>;
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{headers.map((header) => <th key={header} className="border-b px-3 py-2 font-semibold text-slate-600">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top text-slate-700">{cell}</td>)}</tr>)}</tbody></table></div>;
}

export default function ReportsPage() {
  const { token } = useAuth();
  const [panchayats, setPanchayats] = useState<PanchayatOption[]>([]);
  const [panchayatId, setPanchayatId] = useState('');
  const [type, setType] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('1000000');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/panchayats').then((response) => response.ok ? response.json() : []).then((items) => setPanchayats(items)).catch(() => setPanchayats([]));
  }, []);

  const generate = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (panchayatId) params.set('panchayatId', panchayatId);
    if (type !== 'All') params.set('infrastructureType', type);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (budget) params.set('budget', budget);
    try {
      const response = await fetch(`/api/reports/analytical?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not generate report.');
      setReport(payload.data);
    } catch (err: any) {
      setReport(null);
      setError(err.message || 'Could not generate report.');
    } finally {
      setLoading(false);
    }
  }, [panchayatId, type, startDate, endDate, budget, token]);

  useEffect(() => { void generate(); }, []);

  const exportCsv = () => {
    if (!report) return;
    const blob = new Blob([makeCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rdmt-report-${new Date(report.generatedAt).toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <main className="report-page mx-auto max-w-6xl space-y-5 pb-12">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">RDMT · Decision Support</p><h1 className="mt-1 text-3xl font-bold text-slate-950">Analytical Report</h1><p className="mt-1 text-sm text-slate-600">A database-backed snapshot of infrastructure, service requests and maintenance activity.</p></div>
      <div className="no-print flex gap-2">
        <button className="btn border border-slate-300 bg-white text-slate-800" disabled={!report} onClick={exportCsv}>Export CSV</button>
        <button className="btn btn-primary" disabled={!report} onClick={() => window.print()}>Print / Save PDF</button>
      </div>
    </header>

    <form onSubmit={generate} className="no-print grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6">
      <label className="text-xs font-semibold text-slate-700">Panchayat<select className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm" value={panchayatId} onChange={(e) => setPanchayatId(e.target.value)}><option value="">All Panchayats</option>{panchayats.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700">Infrastructure type<select className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}><option>All</option>{TYPES.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700">From date<input className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-700">To date<input className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      <label className="text-xs font-semibold text-slate-700">Recommendation budget<input className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm" type="number" min="0" step="1000" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
      <div className="flex items-end"><button className="btn btn-primary w-full" disabled={loading}>{loading ? 'Generating…' : 'Generate report'}</button></div>
    </form>

    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading && !report && <div className="rounded-xl border bg-white p-10 text-center text-slate-500">Calculating report from stored Panchayat data…</div>}

    {report && <article className="report-content space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900">{report.filters.panchayatName}</h2><p className="text-sm text-slate-600">{report.filters.infrastructureType === 'All' ? 'All infrastructure types' : title(report.filters.infrastructureType)} · {report.filters.startDate || 'Any start'} to {report.filters.endDate || 'Any end'}</p></div><p className="text-sm text-slate-600">Generated {new Date(report.generatedAt).toLocaleString()}</p></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[[report.analyzedCounts.infrastructure, 'Infrastructure records analyzed'], [report.analyzedCounts.complaints, 'Complaints analyzed'], [report.analyzedCounts.maintenanceAssignments, 'Maintenance assignments in period'], [report.analyzedCounts.routes, 'Saved routes in period']].map(([value, label]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><div className="text-2xl font-bold text-slate-900">{value}</div><div className="text-xs text-slate-600">{label}</div></div>)}
        </div>
        <p className="mt-3 text-xs text-slate-500">{report.filters.dateScope}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="1. Infrastructure summary"><div className="mb-3 text-3xl font-bold text-slate-900">{report.infrastructure.total}<span className="ml-2 text-sm font-normal text-slate-500">records analyzed</span></div><div className="grid grid-cols-2 gap-2 text-sm">{Object.entries(report.infrastructure.byType).filter(([, count]) => count > 0).map(([kind, count]) => <div key={kind} className="flex justify-between rounded bg-slate-50 px-3 py-2"><span>{title(kind)}</span><b>{count}</b></div>)}</div><p className="mt-3 text-sm text-slate-600">Assets marked for maintenance or repair: <b>{report.infrastructure.maintenanceNeeded}</b></p></Section>
        <Section title="2. Condition distribution"><Table headers={['Condition', 'Records']} rows={report.infrastructure.conditionDistribution.map((item) => [title(item.condition), item.count])} /></Section>
      </div>

      <Section title="3. Priority ranking"><p className="mb-3 text-sm text-slate-600">Calculated average score: <b>{report.priority.averageScore.toFixed(1)} / 100</b> · {Object.entries(report.priority.distribution).map(([level, count]) => `${level}: ${count}`).join(' · ')}</p><Table headers={['Rank', 'Infrastructure', 'Type', 'Ward', 'Score', 'Level', 'Condition']} rows={report.priority.ranking.map((item, index) => [index + 1, item.name, title(item.type), item.ward, item.score, item.level, title(item.condition)])} /></Section>

      <Section title="4. Top 10 critical infrastructure"><Table headers={['Infrastructure', 'Type', 'Ward', 'Score', 'Condition', 'Score drivers']} rows={report.priority.topCritical.map((item) => [item.name, title(item.type), item.ward, item.score, title(item.condition), item.explanation])} empty="No infrastructure currently scores in the Critical band." /></Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="5. Complaint statistics"><div className="mb-3 flex flex-wrap gap-4 text-sm"><span>Total <b>{report.complaints.total}</b></span><span>Open <b>{report.complaints.open}</b></span><span>Closed / verified <b>{report.complaints.closed}</b></span><span>With coordinates <b>{report.complaints.withCoordinates}</b></span></div><h3 className="mb-2 text-sm font-semibold">By category</h3><Table headers={['Category', 'Count']} rows={report.complaints.byCategory.map((item) => [title(item.category), item.count])} /><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold">By priority</h3><Table headers={['Priority', 'Count']} rows={report.complaints.byPriority.map((item) => [title(item.priority), item.count])} /></div><div><h3 className="mb-2 text-sm font-semibold">By status</h3><Table headers={['Status', 'Count']} rows={report.complaints.byStatus.map((item) => [title(item.status), item.count])} /></div></div></Section>
        <Section title="6. Complaint hotspots"><p className="mb-3 text-sm text-slate-500">Nearby complaint locations grouped within approximately 250 metres. {report.analyzedCounts.complaints - report.analyzedCounts.complaintsWithCoordinates} records have no usable coordinates.</p><Table headers={['Area', 'Reports', 'Critical', 'Top category', 'Coordinates']} rows={report.complaints.hotspots.map((item) => [item.name, item.complaintCount, item.criticalCount, title(item.topCategory), `${item.center.lat}, ${item.center.lng}`])} /></Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="7. Maintenance status"><div className="mb-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded bg-slate-50 p-3">Assignments <b>{report.maintenance.total}</b></div><div className="rounded bg-slate-50 p-3">Allocated <b>{money(report.maintenance.allocatedBudget)}</b></div><div className="rounded bg-slate-50 p-3">Actual cost <b>{money(report.maintenance.actualCost)}</b></div></div><Table headers={['Status', 'Assignments']} rows={Object.entries(report.maintenance.statusCounts).map(([status, count]) => [title(status), count])} /></Section>
        <Section title="8. Route summary"><div className="mb-3 flex flex-wrap gap-4 text-sm"><span>Routes <b>{report.routes.count}</b></span><span>Active <b>{report.routes.activeCount}</b></span><span>Distance <b>{report.routes.totalDistanceKm.toFixed(2)} km</b></span><span>Stops <b>{report.routes.totalStops}</b></span></div><Table headers={['Route', 'Status', 'Distance', 'Stops', 'Generated']} rows={report.routes.routes.map((item) => [item.name, title(item.status), `${item.distanceKm} km`, item.stopCount, new Date(item.generatedAt).toLocaleDateString()])} /></Section>
      </div>

      <Section title="9. Infrastructure gaps"><p className="mb-3 text-sm text-slate-600">Analyzed {report.gaps.analyzedAreas} inhabited areas · {report.gaps.underservedAreas} underserved · population affected {report.gaps.affectedPopulation.toLocaleString()} of {report.gaps.totalPopulation.toLocaleString()} · critical {report.gaps.criticalCount} · high {report.gaps.highCount}</p><Table headers={['Area', 'Ward', 'Severity', 'Population', 'Nearest school', 'Nearest road']} rows={report.gaps.topGaps.map((item) => [item.name, item.ward || '—', title(item.severity), item.affectedPopulation, item.distanceToNearestSchoolKm == null ? '—' : `${Number(item.distanceToNearestSchoolKm).toFixed(2)} km`, item.distanceToNearestRoadKm == null ? '—' : `${Number(item.distanceToNearestRoadKm).toFixed(2)} km`])} empty="No underserved areas found in the current spatial analysis." /><p className="mt-3 text-xs text-slate-500">Current school/road coverage analysis (3 km school and 1 km road thresholds); date and infrastructure-type filters do not alter network coverage.</p></Section>

      <Section title="10. Budget recommendations"><div className="mb-3 flex flex-wrap gap-4 text-sm"><span>Budget <b>{money(report.budget.ceiling)}</b></span><span>Recommended <b>{money(report.budget.recommendedCost)}</b></span><span>Remaining <b>{money(report.budget.remainingBudget)}</b></span><span>Utilization <b>{report.budget.utilizationPercent}%</b></span><span>Projects <b>{report.budget.selectedCount}</b> / {report.budget.candidatesAnalyzed} cost-recorded candidates</span></div>{report.budget.excludedMissingCost > 0 && <p className="mb-3 text-xs text-slate-500">{report.budget.excludedMissingCost} asset(s) without a recorded maintenance/repair cost were excluded from recommendations.</p>}<Table headers={['Project', 'Type', 'Ward', 'Priority', 'Score', 'Estimated cost', 'Selection rationale']} rows={report.budget.projects.map((item) => [item.name, title(item.type), item.ward, item.priority, item.score, money(item.estimatedCost), item.reason])} /></Section>
    </article>}
  </main>;
}

import React from 'react';
import { NavLink } from 'react-router-dom';
import { GapMetrics, GapSummaryItem } from '../../../types/adminDashboard';

interface Props {
  metrics: GapMetrics;
}

export function GapAnalysisSection({ metrics }: Props) {
  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'Critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'High':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Moderate':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
  };

  return (
    <div className="space-y-4" id="section-gaps">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>📐</span> Section 6: Infrastructure Gap Detection & Equity Analysis
          </h2>
          <p className="text-xs text-slate-500">
            Answers: <em>"Where are infrastructure gaps?"</em> — Detects habitations isolated from schools (&gt;3 km RTE) or roads (&gt;1 km PMGSY).
          </p>
        </div>
        <NavLink
          to="/gaps"
          className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200 transition shrink-0"
        >
          Open Spatial Gap Analysis →
        </NavLink>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium block">Underserved Habitations</span>
          <div className="text-2xl font-black text-red-600 mt-1">
            {metrics.underservedHabitationsCount}{' '}
            <span className="text-xs font-semibold text-slate-400">/ {metrics.totalHabitationsCount}</span>
          </div>
          <span className="text-[11px] text-red-500 mt-0.5 block">Isolated community settlements</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium block">Affected Population</span>
          <div className="text-2xl font-black text-amber-600 mt-1">
            {metrics.affectedPopulation.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Out of {metrics.totalPopulation.toLocaleString()} total residents
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium block">School Accessibility</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{metrics.schoolCoveragePercent}%</div>
          <span className="text-[11px] text-emerald-600 mt-0.5 block">Compliant with 3 km RTE threshold</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium block">Critical Priority Gaps</span>
          <div className="text-2xl font-black text-purple-700 mt-1">{metrics.criticalGapsCount} Sectors</div>
          <span className="text-[11px] text-purple-600 mt-0.5 block">&gt; 2.0x spatial threshold deficit</span>
        </div>
      </div>

      {/* Underserved Habitations Detail Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>🏘️</span> Detected Underserved Rural Sectors ({metrics.topGaps.length})
          </h3>
          <span className="text-xs text-slate-500">RTE (3 km) and PMGSY (1 km) spatial buffers</span>
        </div>

        <div className="divide-y divide-slate-100">
          {metrics.topGaps.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              ✓ All recorded settlements lie within statutory school and road accessibility limits.
            </div>
          ) : (
            metrics.topGaps.map((gap, idx) => (
              <div
                key={idx}
                className="p-4 hover:bg-slate-50 transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{gap.name}</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-medium text-[11px]">
                      {gap.ward || 'Rural Sector'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-bold border text-[10px] ${getSeverityBadge(gap.severity)}`}>
                      {gap.severity} Deficit
                    </span>
                  </div>

                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {gap.issues.join('; ')}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-slate-600 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Nearest School</span>
                    <span className="font-bold text-slate-800">{gap.distanceToNearestSchoolKm} km</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Nearest Road</span>
                    <span className="font-bold text-slate-800">{gap.distanceToNearestRoadKm} km</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Affected Pop.</span>
                    <span className="font-bold text-purple-700">{gap.affectedPopulation.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

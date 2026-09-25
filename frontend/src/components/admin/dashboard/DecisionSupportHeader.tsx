import React from 'react';
import { AdminDashboardData } from '../../../types/adminDashboard';

interface Props {
  data: AdminDashboardData | null;
  refreshing: boolean;
  onRefresh: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export function DecisionSupportHeader({
  data,
  refreshing,
  onRefresh,
  activeTab,
  onSelectTab
}: Props) {
  const sections = [
    { id: 'overview', label: '1. Overview', icon: '🏛️' },
    { id: 'priority', label: '2. Priorities', icon: '🚨' },
    { id: 'map', label: '3. GIS Map', icon: '🗺️' },
    { id: 'maintenance', label: '4. Maintenance', icon: '🛠️' },
    { id: 'routes', label: '5. Routes', icon: '📍' },
    { id: 'gaps', label: '6. Gap Analysis', icon: '📐' },
    { id: 'budget', label: '7. Budget Allocation', icon: '💰' },
    { id: 'analytics', label: '8. Analytics', icon: '📈' }
  ];

  return (
    <div className="space-y-4">
      {/* Main Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-6 shadow-xl border border-indigo-800/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Panchayat GIS
              </span>
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                Executive Decision Support
              </span>
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                {data?.overview.panchayatName || 'Gram Panchayat'}
              </span>
            </div>

            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">
              Panchayat Infrastructure Decision-Support Dashboard
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-3xl">
              Real-time spatial decision system transforming infrastructure data into actionable priorities, worker dispatch orders, gap detections, and budget optimization.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium rounded-xl text-sm transition shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
              {refreshing ? 'Refreshing...' : 'Refresh Telemetry'}
            </button>
          </div>
        </div>

        {/* 6 Core Decision-Support Questions Answered */}
        {data && (
          <div className="mt-5 pt-4 border-t border-indigo-800/40 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
            <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
              <span className="text-slate-400 block font-medium">1. What requires attention?</span>
              <span className="text-red-400 font-bold text-sm block mt-0.5">
                {data.priority.criticalCount} Critical Assets
              </span>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
              <span className="text-slate-400 block font-medium">2. Where are problems?</span>
              <span className="text-amber-400 font-bold text-sm block mt-0.5">
                {data.overview.openComplaints} Open Grievances
              </span>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
              <span className="text-slate-400 block font-medium">3. What to repair first?</span>
              <span className="text-emerald-400 font-bold text-sm block mt-0.5 truncate" title={data.priority.top10Attention[0]?.name}>
                {data.priority.top10Attention[0]?.name ? `${data.priority.top10Attention[0].name.slice(0, 16)}...` : 'N/A'}
              </span>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
              <span className="text-slate-400 block font-medium">4. Where workers go?</span>
              <span className="text-blue-400 font-bold text-sm block mt-0.5">
                {data.routes.totalStops} Stops ({data.routes.totalDistanceKm} km)
              </span>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
              <span className="text-slate-400 block font-medium">5. Where are gaps?</span>
              <span className="text-purple-400 font-bold text-sm block mt-0.5">
                {data.gapAnalysis.underservedHabitationsCount} Underserved Areas
              </span>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
              <span className="text-slate-400 block font-medium">6. How to allocate budget?</span>
              <span className="text-indigo-300 font-bold text-sm block mt-0.5">
                {data.budget.selectedProjectsCount} Projects Funded
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Jump Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold scrollbar-thin">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelectTab(s.id)}
            className={`px-3 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 border ${
              activeTab === s.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

import React from 'react';
import { OverviewMetrics } from '../../../types/adminDashboard';

interface Props {
  metrics: OverviewMetrics;
}

export function OverviewSection({ metrics }: Props) {
  const cards = [
    {
      title: 'Total Infrastructure',
      value: metrics.totalInfrastructure,
      subtitle: `${metrics.panchayatDistrict || 'Panchayat'} Geo-Assets`,
      icon: '🏛️',
      gradient: 'from-blue-600 to-indigo-700',
      badge: 'All Categories'
    },
    {
      title: 'Road Network',
      value: metrics.roadsCount,
      subtitle: 'PMGSY & Village Connectivity',
      icon: '🛣️',
      gradient: 'from-emerald-600 to-teal-700',
      badge: `${metrics.roadsCount} Segments`
    },
    {
      title: 'Educational Institutions',
      value: metrics.schoolsCount,
      subtitle: 'Primary, Secondary & High Schools',
      icon: '🏫',
      gradient: 'from-amber-600 to-orange-700',
      badge: 'RTE Coverage'
    },
    {
      title: 'Other Rural Facilities',
      value: metrics.otherCount + metrics.healthcareCount + metrics.waterFacilityCount,
      subtitle: `${metrics.waterFacilityCount} Water Points, ${metrics.healthcareCount} Health Centers`,
      icon: '🏥',
      gradient: 'from-purple-600 to-indigo-800',
      badge: 'Basic Amenities'
    },
    {
      title: 'Open Citizen Grievances',
      value: metrics.openComplaints,
      subtitle: 'Requires Field Inspection',
      icon: '🚨',
      gradient: 'from-red-600 to-rose-700',
      badge: `${metrics.openComplaints} Pending Resolution`
    },
    {
      title: 'Active Maintenance Tasks',
      value: metrics.activeMaintenanceTasks,
      subtitle: 'Work Orders in Execution',
      icon: '🛠️',
      gradient: 'from-sky-600 to-cyan-700',
      badge: `${metrics.activeMaintenanceTasks} Dispatched Crew`
    }
  ];

  return (
    <div className="space-y-3" id="section-overview">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>🏛️</span> Section 1: Panchayat Infrastructure Overview
        </h2>
        <span className="text-xs text-slate-500 font-medium">Aggregated across all administrative wards</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div
            key={c.title}
            className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{c.icon}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                  {c.badge}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-500 block leading-tight">{c.title}</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{c.value}</div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400 font-medium truncate">
              {c.subtitle}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
        <div><strong>Infrastructure provenance:</strong> {metrics.sourceInfrastructureCount} source-derived · {metrics.legacyInfrastructureCount} legacy/demo inventory records.</div>
        <div><strong>Synthetic demo activity:</strong> {metrics.syntheticComplaintCount} complaints · {metrics.syntheticAssignmentCount} assignments · {metrics.syntheticRouteCount} routes. These are not real-world incident or maintenance statistics.</div>
      </div>
    </div>
  );
}

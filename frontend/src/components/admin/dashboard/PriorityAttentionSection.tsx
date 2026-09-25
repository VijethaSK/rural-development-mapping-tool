import React from 'react';
import { NavLink } from 'react-router-dom';
import { PriorityMetrics, PriorityLevel } from '../../../types/adminDashboard';

interface Props {
  metrics: PriorityMetrics;
}

export function PriorityAttentionSection({ metrics }: Props) {
  const getBadgeClass = (level: PriorityLevel) => {
    switch (level) {
      case 'Critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'High':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Medium':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Low':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Road':
        return '🛣️';
      case 'School':
        return '🏫';
      case 'Healthcare':
        return '🏥';
      case 'WaterFacility':
        return '💧';
      default:
        return '🏛️';
    }
  };

  const formatCost = (val: number) => {
    if (!val) return '₹50,000';
    return '₹' + val.toLocaleString('en-IN');
  };

  return (
    <div className="space-y-4" id="section-priority">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>🚨</span> Section 2: Priority Intelligence & Assets Requiring Attention
          </h2>
          <p className="text-xs text-slate-500">
            Answers: <em>"What requires immediate attention?"</em> and <em>"What should be repaired first?"</em>
          </p>
        </div>
        <NavLink
          to="/priorities"
          className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200 transition shrink-0"
        >
          Open Priority Engine →
        </NavLink>
      </div>

      {/* Top Priority Cards & Distribution Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Critical & High Summary Alert Cards */}
        <div className="space-y-3">
          <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-2xl p-4 shadow-md flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-red-200 block">Critical Urgent Tier</span>
              <div className="text-3xl font-black mt-0.5">{metrics.criticalCount} Assets</div>
              <span className="text-[11px] text-red-100">Score &gt;= 80 (Immediate safety hazard)</span>
            </div>
            <div className="text-4xl opacity-80">🚨</div>
          </div>

          <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl p-4 shadow-md flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-amber-200 block">High Priority Tier</span>
              <div className="text-3xl font-black mt-0.5">{metrics.highCount} Assets</div>
              <span className="text-[11px] text-amber-100">Score 60-79 (Severe service degradation)</span>
            </div>
            <div className="text-4xl opacity-80">⚠️</div>
          </div>
        </div>

        {/* Priority Distribution Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-bold text-slate-800">Priority Distribution Breakdown</h3>
              <span className="text-xs font-bold text-slate-600">
                Panchayat Mean Score: <strong className="text-blue-600">{metrics.averageScore}/100</strong>
              </span>
            </div>

            {/* Segmented Bar */}
            <div className="h-6 bg-slate-100 rounded-xl overflow-hidden flex shadow-inner border border-slate-200 mb-3">
              {metrics.distribution.map((d) => (
                <div
                  key={d.level}
                  style={{ width: `${Math.max(2, d.percentage)}%`, backgroundColor: d.color }}
                  className="h-full transition-all duration-500 flex items-center justify-center text-white text-[10px] font-bold"
                  title={`${d.level}: ${d.count} assets (${d.percentage}%)`}
                >
                  {d.percentage >= 12 ? `${d.percentage}%` : ''}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              {metrics.distribution.map((d) => (
                <div key={d.level} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <div>
                    <span className="font-bold text-slate-700 block leading-tight">{d.level}</span>
                    <span className="text-[11px] text-slate-500">{d.count} assets ({d.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 text-[11px] text-slate-500 italic">
            * Multi-criteria SAW model evaluates physical condition, active citizen complaints, population served, traffic, and repair age.
          </div>
        </div>
      </div>

      {/* Top 10 Assets Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>📋</span> Top 10 Infrastructure Assets Requiring Urgent Action
          </h3>
          <span className="text-xs text-slate-500">Sorted descending by priority urgency</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">Rank</th>
                <th className="p-3">Infrastructure Asset</th>
                <th className="p-3">Location</th>
                <th className="p-3">Condition</th>
                <th className="p-3">Complaints</th>
                <th className="p-3">Pop. Served</th>
                <th className="p-3">Priority Score</th>
                <th className="p-3">Est. Repair Cost</th>
                <th className="p-3">Key Attention Driver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.top10Attention.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-500">
                    No high priority infrastructure currently logged.
                  </td>
                </tr>
              ) : (
                metrics.top10Attention.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-blue-50/40 transition">
                    <td className="p-3 font-bold text-slate-500">#{idx + 1}</td>
                    <td className="p-3 font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{getTypeIcon(item.type)}</span>
                      <span>{item.name}</span>
                    </td>
                    <td className="p-3 text-slate-600">
                      {item.ward} {item.village ? `• ${item.village}` : ''}
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-700">{item.condition}</span>
                    </td>
                    <td className="p-3">
                      <span className={`font-bold ${item.complaintsCount > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        {item.complaintsCount} reports
                      </span>
                    </td>
                    <td className="p-3 text-slate-700">{item.populationServed.toLocaleString()}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full font-bold border text-[11px] ${getBadgeClass(item.priorityLevel)}`}>
                        {item.priorityLevel} ({item.priorityScore})
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-800">{formatCost(item.estimatedMaintenanceCost)}</td>
                    <td className="p-3 text-slate-500 max-w-xs truncate" title={item.explanation?.summary}>
                      {item.explanation?.summary || 'Multiple risk factors aggregated.'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

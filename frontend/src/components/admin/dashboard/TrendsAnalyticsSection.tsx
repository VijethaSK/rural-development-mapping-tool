import React from 'react';
import { AnalyticsMetrics } from '../../../types/adminDashboard';

interface Props {
  metrics: AnalyticsMetrics;
}

export function TrendsAnalyticsSection({ metrics }: Props) {
  const conditionColors: Record<string, string> = {
    Good: '#10b981', // green
    Average: '#f59e0b', // amber
    Bad: '#ef4444' // red
  };

  const maxMonthlyCount = Math.max(1, ...metrics.monthlyComplaintTrends.map((m) => m.count));

  return (
    <div className="space-y-4" id="section-analytics">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>📈</span> Section 8: Panchayat Infrastructure & Grievance Analytics
          </h2>
          <p className="text-xs text-slate-500">
            Systemic telemetry tracking historical complaint velocity, structural condition health, and grievance resolution rate.
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-500 block">Overall Grievance Resolution:</span>
          <span className="text-sm font-extrabold text-emerald-600">{metrics.completionRatePercent}% Resolved</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Infrastructure Condition Breakdown */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <span>🏗️</span> Structural Condition Breakdown
          </h3>

          <div className="space-y-3">
            {metrics.conditionDistribution.map((item) => (
              <div key={item.condition} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: conditionColors[item.condition] || '#94a3b8' }}
                    />
                    {item.condition} Condition
                  </span>
                  <span>
                    {item.count} Assets ({item.percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: conditionColors[item.condition] || '#94a3b8'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
            Assets rated 'Bad' or 'Needs_Maintenance' receive high weight in priority scoring.
          </p>
        </div>

        {/* 2. Complaints By Category & Status */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <span>📑</span> Grievance Category & Resolution Status
          </h3>

          <div className="space-y-2.5 text-xs">
            <span className="font-semibold text-slate-500 block text-[11px] uppercase tracking-wider">
              By Category:
            </span>
            <div className="grid grid-cols-2 gap-2">
              {metrics.complaintsByCategory.map((c) => (
                <div key={c.category} className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                  <span className="text-slate-600 font-medium">{c.category}</span>
                  <span className="font-bold text-slate-900">{c.count}</span>
                </div>
              ))}
            </div>

            <span className="font-semibold text-slate-500 block text-[11px] uppercase tracking-wider pt-1">
              By Status:
            </span>
            <div className="grid grid-cols-2 gap-2">
              {metrics.complaintsByStatus.map((s) => (
                <div key={s.status} className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex justify-between">
                  <span className="text-slate-600 font-medium">{s.status}</span>
                  <span className="font-bold text-blue-600">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Monthly Complaint Inflow Trend Chart */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-2">
              <span>📊</span> Monthly Grievance Inflow (Past 6 Months)
            </h3>
            <p className="text-xs text-slate-500 mb-4">Tracking velocity of reported rural defects over time.</p>

            {/* Vertical Bar Chart */}
            <div className="h-32 flex items-end justify-between gap-2 pt-4 px-2 border-b border-slate-200">
              {metrics.monthlyComplaintTrends.map((t) => {
                const heightPct = Math.max(12, Math.round((t.count / maxMonthlyCount) * 100));
                return (
                  <div key={t.month} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] font-bold text-slate-700">{t.count}</span>
                    <div
                      className="w-full bg-gradient-to-t from-blue-600 to-indigo-500 rounded-t-lg transition-all duration-500 hover:opacity-80"
                      style={{ height: `${heightPct}%` }}
                      title={`${t.month}: ${t.count} reports`}
                    />
                    <span className="text-[10px] font-semibold text-slate-500 mt-1">{t.month}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 pt-2 text-[11px] text-slate-500 flex justify-between">
            <span>Peak Inflow: <strong>{maxMonthlyCount} grievances</strong></span>
            <span className="text-emerald-600 font-bold">Trend: Stable</span>
          </div>
        </div>
      </div>
    </div>
  );
}

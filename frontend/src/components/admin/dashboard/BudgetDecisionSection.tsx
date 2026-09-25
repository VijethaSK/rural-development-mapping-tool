import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BudgetSummaryMetrics } from '../../../types/adminDashboard';

interface Props {
  metrics: BudgetSummaryMetrics;
  onUpdateBudget: (budget: number) => void;
}

const PRESET_BUDGETS = [
  { label: '₹5L', value: 500000 },
  { label: '₹10L', value: 1000000 },
  { label: '₹25L', value: 2500000 },
  { label: '₹50L', value: 5000000 }
];

export function BudgetDecisionSection({ metrics, onUpdateBudget }: Props) {
  const [localBudget, setLocalBudget] = useState<number>(metrics.budget);

  const handleSliderChange = (val: number) => {
    setLocalBudget(val);
    onUpdateBudget(val);
  };

  const formatRupee = (num: number) => {
    return '₹' + num.toLocaleString('en-IN');
  };

  return (
    <div className="space-y-4" id="section-budget">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>💰</span> Section 7: Budget-Constrained Project Recommendations
          </h2>
          <p className="text-xs text-slate-500">
            Answers: <em>"How should a limited budget be allocated?"</em> — Maximizes community benefit-cost efficiency within fiscal bounds.
          </p>
        </div>
        <NavLink
          to="/budget"
          className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200 transition shrink-0"
        >
          Open Full Budget Planner →
        </NavLink>
      </div>

      {/* Interactive Budget Controller & Metrics */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Available Maintenance Budget Envelope
            </label>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-blue-700">{formatRupee(metrics.budget)}</span>
              <div className="flex items-center gap-1.5">
                {PRESET_BUDGETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handleSliderChange(p.value)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition border ${
                      metrics.budget === p.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right text-xs">
            <span className="text-slate-400 block">Total Infrastructure Backlog:</span>
            <span className="font-extrabold text-slate-800 text-sm">{formatRupee(metrics.totalBacklogCost)}</span>
          </div>
        </div>

        {/* Range Slider */}
        <div className="space-y-1">
          <input
            type="range"
            min={100000}
            max={5000000}
            step={50000}
            value={localBudget}
            onChange={(e) => setLocalBudget(Number(e.target.value))}
            onMouseUp={() => onUpdateBudget(localBudget)}
            onTouchEnd={() => onUpdateBudget(localBudget)}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
            <span>₹1 Lakh (Min)</span>
            <span>₹10 Lakhs</span>
            <span>₹25 Lakhs</span>
            <span>₹50 Lakhs (Max)</span>
          </div>
        </div>

        {/* Utilization Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs text-slate-600 font-medium">
            <span>Allocated: {formatRupee(metrics.allocatedCost)} ({metrics.budgetUtilizationPercent}%)</span>
            <span>Surplus Buffer: {formatRupee(metrics.remainingBuffer)}</span>
          </div>
          <div className="h-4 bg-slate-100 rounded-xl overflow-hidden flex shadow-inner border border-slate-200">
            <div
              className="bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300"
              style={{ width: `${Math.min(100, metrics.budgetUtilizationPercent)}%` }}
            />
            <div
              className="bg-emerald-500/25 transition-all duration-300"
              style={{ width: `${Math.max(0, 100 - metrics.budgetUtilizationPercent)}%` }}
            />
          </div>
        </div>

        {/* Summary Metric Chips */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 block text-[11px]">Recommended Projects</span>
            <span className="font-extrabold text-slate-900 text-sm mt-0.5 block">{metrics.selectedProjectsCount} Assets</span>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 block text-[11px]">Population Benefited</span>
            <span className="font-extrabold text-purple-700 text-sm mt-0.5 block">{metrics.populationBenefited.toLocaleString()}</span>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 block text-[11px]">Grievances Addressed</span>
            <span className="font-extrabold text-amber-700 text-sm mt-0.5 block">{metrics.complaintsResolved} Reports</span>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 block text-[11px]">Surplus Buffer</span>
            <span className="font-extrabold text-emerald-700 text-sm mt-0.5 block">{formatRupee(metrics.remainingBuffer)}</span>
          </div>
        </div>
      </div>

      {/* Recommended Projects Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>✅</span> Optimized Allocation Projects ({metrics.recommendedProjects.length})
          </h3>
          <span className="text-xs text-slate-500">Selected via Value-Per-Rupee Heuristic</span>
        </div>

        <div className="divide-y divide-slate-100">
          {metrics.recommendedProjects.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              No projects funded within current budget. Adjust slider to allocate capital.
            </div>
          ) : (
            metrics.recommendedProjects.map((p, idx) => (
              <div
                key={p.infrastructureId}
                className="p-4 hover:bg-slate-50 transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px]">
                      {p.ward}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        p.priorityLevel === 'Critical'
                          ? 'bg-red-100 text-red-800'
                          : p.priorityLevel === 'High'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {p.priorityLevel} ({p.priorityScore})
                    </span>
                  </div>

                  <div className="p-2 bg-emerald-50/70 border border-emerald-200/80 rounded-lg text-emerald-900 text-[11px] leading-relaxed">
                    💡 <strong>Selection Rationale:</strong> {p.selectionReason}
                  </div>
                </div>

                <div className="text-right shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                  <span className="text-[11px] text-slate-400 block">Repair Cost</span>
                  <span className="text-sm font-extrabold text-slate-900">{formatRupee(p.estimatedRepairCost)}</span>
                  <span className="text-[10px] font-semibold text-blue-600 block mt-0.5">
                    {p.costSharePercent}% of budget
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

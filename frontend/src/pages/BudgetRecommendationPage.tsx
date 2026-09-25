import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';
import {
  BudgetRecommendationResult,
  RecommendedProject,
  UnselectedProject,
  BudgetOverview,
  CategoryExpenditure,
  PriorityLevel
} from '../types/budget';

const PRESET_BUDGETS = [
  { label: '₹5 Lakhs', value: 500000, desc: 'Emergency Repairs' },
  { label: '₹10 Lakhs', value: 1000000, desc: 'Quarterly Maintenance' },
  { label: '₹25 Lakhs', value: 2500000, desc: 'Annual Grama Nidhi' },
  { label: '₹50 Lakhs', value: 5000000, desc: 'Special Dev Grant' },
  { label: '₹1 Crore', value: 10000000, desc: 'Comprehensive Overhaul' }
];

export default function BudgetRecommendationPage() {
  const [budget, setBudget] = useState<number>(1000000); // ₹10,00,000 default
  const [budgetInputStr, setBudgetInputStr] = useState<string>('1000000');
  const [strategy, setStrategy] = useState<'greedy' | 'knapsack'>('greedy');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [minPriority, setMinPriority] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [calculating, setCalculating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<BudgetRecommendationResult | null>(null);
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [showUnselected, setShowUnselected] = useState<boolean>(false);
  const [unselectedSearch, setUnselectedSearch] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');

  // Load high-level overview once
  useEffect(() => {
    api<BudgetOverview>('/budget/overview')
      .then((data) => setOverview(data))
      .catch((err) => console.warn('Could not load budget overview:', err));
  }, []);

  // Fetch recommendation
  const fetchRecommendations = async (customBudget?: number) => {
    const activeBudget = customBudget !== undefined ? customBudget : budget;
    setCalculating(true);
    setError(null);
    try {
      const data = await api<BudgetRecommendationResult>('/budget/recommend', {
        method: 'POST',
        body: JSON.stringify({
          budget: activeBudget,
          strategy,
          type: typeFilter !== 'All' ? typeFilter : undefined,
          minPriorityScore: minPriority > 0 ? minPriority : undefined
        })
      });
      setResult(data);
    } catch (err: any) {
      console.error('Error fetching budget recommendations:', err);
      setError(err.message || 'Failed to calculate recommendations.');
    } finally {
      setCalculating(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [strategy, typeFilter, minPriority]);

  const handleBudgetChange = (val: number) => {
    const clamped = Math.max(0, val);
    setBudget(clamped);
    setBudgetInputStr(String(clamped));
    fetchRecommendations(clamped);
  };

  const handleInputBlur = () => {
    const parsed = parseInt(budgetInputStr.replace(/[^0-9]/g, ''), 10);
    const valid = isNaN(parsed) ? 1000000 : parsed;
    handleBudgetChange(valid);
  };

  const formatRupee = (num: number) => {
    return '₹' + num.toLocaleString('en-IN');
  };

  const getPriorityBadgeClass = (level: PriorityLevel) => {
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

  // Filtered lists
  const filteredSelected = useMemo(() => {
    if (!result) return [];
    if (selectedCategoryFilter === 'All') return result.selectedProjects;
    return result.selectedProjects.filter((p) => p.type === selectedCategoryFilter);
  }, [result, selectedCategoryFilter]);

  const filteredUnselected = useMemo(() => {
    if (!result) return [];
    let list = result.unselectedProjects;
    if (unselectedSearch.trim()) {
      const q = unselectedSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.ward.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q) ||
          p.rejectionReason.toLowerCase().includes(q)
      );
    }
    return list;
  }, [result, unselectedSearch]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-indigo-700/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                Panchayat Decision Support
              </span>
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                Optimization Engine
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
              Budget-Constrained Infrastructure Recommendations
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-3xl">
              Maximize systemic community impact within fixed fiscal constraints. Balances multi-criteria priority scores,
              citizen complaints, and population served using transparent cost-efficiency heuristics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => fetchRecommendations()}
              disabled={calculating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium rounded-xl text-sm transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              <span className={calculating ? 'animate-spin' : ''}>🔄</span>
              {calculating ? 'Optimizing...' : 'Recalculate'}
            </button>
            <button
              onClick={() => handleBudgetChange(1000000)}
              className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-sm transition"
            >
              Reset (₹10L)
            </button>
          </div>
        </div>

        {/* Quick Backlog Indicators */}
        {overview && (
          <div className="mt-5 pt-4 border-t border-indigo-700/30 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block">Total Infrastructure Backlog:</span>
              <span className="text-white font-semibold text-sm">{formatRupee(overview.totalBacklogCost)}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Critical Urgent Deficit:</span>
              <span className="text-red-400 font-semibold text-sm">{formatRupee(overview.criticalBacklogCost)}</span>
            </div>
            <div>
              <span className="text-slate-400 block">High Priority Need:</span>
              <span className="text-amber-400 font-semibold text-sm">{formatRupee(overview.highBacklogCost)}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Total Registered Assets:</span>
              <span className="text-indigo-300 font-semibold text-sm">{overview.totalInfrastructureCount} Assets</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Interactive Budget Configuration & Controls */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>💰</span> Maintenance Budget Allocation
            </label>
            <span className="text-xl font-extrabold text-blue-700">{formatRupee(budget)}</span>
          </div>

          {/* Slider */}
          <div className="space-y-2">
            <input
              type="range"
              min={100000}
              max={5000000}
              step={50000}
              value={budget}
              onChange={(e) => handleBudgetChange(Number(e.target.value))}
              className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-[11px] text-slate-500 font-medium">
              <span>₹1 Lakh (Min)</span>
              <span>₹10 Lakhs</span>
              <span>₹25 Lakhs</span>
              <span>₹50 Lakhs (Max)</span>
            </div>
          </div>

          {/* Manual Input & Presets */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center border border-slate-300 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 bg-slate-50">
              <span className="text-slate-500 text-sm font-medium mr-1.5">₹</span>
              <input
                type="text"
                value={budgetInputStr}
                onChange={(e) => setBudgetInputStr(e.target.value)}
                onBlur={handleInputBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleInputBlur()}
                className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none w-32"
                placeholder="Enter budget..."
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {PRESET_BUDGETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handleBudgetChange(preset.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all border ${
                    budget === preset.value
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                  title={preset.desc}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Advanced Optimization & Filter Controls */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Optimization Strategy Switcher */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Optimization Algorithm</label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setStrategy('greedy')}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  strategy === 'greedy'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Greedy Cost-Efficiency (Value per Rupee) heuristic"
              >
                Cost-Efficiency Heuristic
              </button>
              <button
                type="button"
                onClick={() => setStrategy('knapsack')}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  strategy === 'knapsack'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="0/1 Knapsack Dynamic Programming optimal impact subset"
              >
                0/1 Knapsack DP
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {strategy === 'greedy'
                ? 'Heuristic prioritizes highest benefit-cost ratio while ensuring auditable sequential allocation.'
                : 'Dynamic programming finds theoretical maximum total impact within exact budget constraint.'}
            </p>
          </div>

          {/* Infrastructure Type Filter */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Infrastructure Category Filter</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="All">All Categories</option>
              <option value="Road">Roads Only</option>
              <option value="School">Schools Only</option>
              <option value="Healthcare">Healthcare Centers Only</option>
              <option value="WaterFacility">Drinking Water Only</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">Restrict candidate recommendations to a specific department.</p>
          </div>

          {/* Min Priority Score Filter */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-slate-700">Minimum Priority Threshold</label>
              <span className="text-xs font-bold text-blue-700">{minPriority > 0 ? `>= ${minPriority} pts` : 'No filter'}</span>
            </div>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={minPriority}
              onChange={(e) => setMinPriority(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">Filter out low-urgency assets from competing for the budget.</p>
          </div>
        </div>
      </div>

      {/* 3. High-Impact KPI Summary Cards */}
      {result && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Card 1: Budget */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-slate-500 text-xs font-medium block">Total Budget</span>
            <div className="text-lg lg:text-xl font-extrabold text-slate-900 mt-1">
              {formatRupee(result.budget)}
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">100% allocation pool</span>
          </div>

          {/* Card 2: Allocated Cost */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-slate-500 text-xs font-medium block">Allocated Cost</span>
            <div className="text-lg lg:text-xl font-extrabold text-blue-700 mt-1">
              {formatRupee(result.totalEstimatedCost)}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, result.budgetUtilizationPercent)}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-blue-600">{result.budgetUtilizationPercent}%</span>
            </div>
          </div>

          {/* Card 3: Remaining Buffer */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-slate-500 text-xs font-medium block">Remaining Buffer</span>
            <div className="text-lg lg:text-xl font-extrabold text-emerald-700 mt-1">
              {formatRupee(result.remainingBudget)}
            </div>
            <span className="text-[11px] text-emerald-600 block mt-1">Available surplus</span>
          </div>

          {/* Card 4: Projects Funded */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-slate-500 text-xs font-medium block">Projects Funded</span>
            <div className="text-lg lg:text-xl font-extrabold text-indigo-700 mt-1">
              {result.selectedCount} <span className="text-xs font-medium text-slate-500">/ {result.candidateCount}</span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">
              {result.candidateCount > 0
                ? `${Math.round((result.selectedCount / result.candidateCount) * 100)}% candidate coverage`
                : 'No candidates'}
            </span>
          </div>

          {/* Card 5: Population Benefited */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-slate-500 text-xs font-medium block">Population Benefited</span>
            <div className="text-lg lg:text-xl font-extrabold text-purple-700 mt-1">
              {result.totalPopulationBenefited.toLocaleString()}
            </div>
            <span className="text-[11px] text-purple-600 block mt-1">Direct rural citizens</span>
          </div>

          {/* Card 6: Complaints Addressed */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-slate-500 text-xs font-medium block">Complaints Resolved</span>
            <div className="text-lg lg:text-xl font-extrabold text-amber-700 mt-1">
              {result.totalComplaintsResolved}
            </div>
            <span className="text-[11px] text-amber-600 block mt-1">Active grievance reports</span>
          </div>
        </div>
      )}

      {/* 4. Budget Utilization & Category Distribution Visualizations */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Budget Progress & Category Breakdown */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
            <h3 className="text-sm font-bold text-slate-800 flex items-center justify-between">
              <span>📊 Fiscal Allocation & Category Breakdown</span>
              <span className="text-xs font-medium text-slate-500">
                Strategy: <strong className="text-blue-600 capitalize">{result.strategy}</strong>
              </span>
            </h3>

            {/* Visual Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-600 font-medium">
                <span>Allocated Expenditure: {formatRupee(result.totalEstimatedCost)}</span>
                <span>Unallocated Buffer: {formatRupee(result.remainingBudget)}</span>
              </div>
              <div className="h-5 bg-slate-100 rounded-xl overflow-hidden flex shadow-inner border border-slate-200">
                <div
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500 flex items-center justify-center text-white text-[11px] font-bold"
                  style={{ width: `${Math.min(100, result.budgetUtilizationPercent)}%` }}
                >
                  {result.budgetUtilizationPercent >= 15 ? `${result.budgetUtilizationPercent}% Utilized` : ''}
                </div>
                <div
                  className="bg-emerald-500/30 transition-all duration-500 flex items-center justify-center text-emerald-800 text-[11px] font-semibold"
                  style={{ width: `${Math.max(0, 100 - result.budgetUtilizationPercent)}%` }}
                >
                  {100 - result.budgetUtilizationPercent >= 15
                    ? `${(100 - result.budgetUtilizationPercent).toFixed(1)}% Surplus`
                    : ''}
                </div>
              </div>
            </div>

            {/* Category Cards */}
            <div>
              <span className="text-xs font-semibold text-slate-600 block mb-2">Expenditure by Asset Category:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {result.categoryBreakdown.length === 0 ? (
                  <div className="col-span-4 p-3 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
                    No infrastructure assets funded under current budget allocation.
                  </div>
                ) : (
                  result.categoryBreakdown.map((cat) => (
                    <div
                      key={cat.type}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{getTypeIcon(cat.type)}</span>
                        <span className="text-xs font-bold text-slate-700">{cat.type}</span>
                      </div>
                      <div className="mt-2">
                        <span className="text-sm font-extrabold text-slate-900 block">{formatRupee(cat.totalCost)}</span>
                        <span className="text-[11px] text-slate-500">
                          {cat.count} project{cat.count > 1 ? 's' : ''} ({cat.percentageOfAllocated}%)
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right 1 Col: Knapsack vs Heuristic Benchmark Insight */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-sm border border-indigo-800/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Algorithmic Benchmark</span>
                <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-400/30">
                  0/1 Knapsack DP
                </span>
              </div>
              <h4 className="text-base font-bold text-white mb-2">Heuristic vs Optimal Benchmark</h4>

              {result.comparison ? (
                <div className="space-y-3 text-xs">
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Heuristic Impact:</span>
                      <span className="font-bold text-blue-400">{result.comparison.greedyTotalImpact} pts</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Theoretical DP Max:</span>
                      <span className="font-bold text-emerald-400">{result.comparison.knapsackTotalImpact} pts</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-700">
                      <span className="text-slate-300">Solution Quality:</span>
                      <span className="font-extrabold text-amber-300">{result.comparison.impactRatioPercent}% Optimal</span>
                    </div>
                  </div>

                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {result.comparison.explanation}
                  </p>
                </div>
              ) : (
                <p className="text-slate-400 text-xs">Comparison benchmark available with multiple candidates.</p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-indigo-800/50 text-[11px] text-indigo-300">
              💡 <em>Transparent decision support ensures every Rupee spent is justifiable to the Gram Sabha.</em>
            </div>
          </div>
        </div>
      )}

      {/* 5. Recommended Projects List (Selected Assets) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>✅</span> Recommended Infrastructure Projects
              {result && (
                <span className="ml-2 text-xs font-semibold px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                  {result.selectedProjects.length} Selected
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ranked by cost-efficiency and social impact score within available budget ceiling.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {['All', 'Road', 'School', 'Healthcare', 'WaterFacility'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategoryFilter(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition ${
                  selectedCategoryFilter === cat
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                {cat === 'All' ? 'All' : `${getTypeIcon(cat)} ${cat}`}
              </button>
            ))}
          </div>
        </div>

        {/* Projects List */}
        {loading || calculating ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <div className="inline-block animate-spin text-3xl">⚙️</div>
            <p className="text-sm font-medium">Running budget optimization engine...</p>
          </div>
        ) : filteredSelected.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <span className="text-4xl">🏷️</span>
            <p className="text-sm font-semibold text-slate-700">No projects recommended under current parameters.</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Try increasing the budget allocation or lowering the minimum priority threshold to fund candidate assets.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSelected.map((project) => (
              <div
                key={project.infrastructureId}
                className="p-5 hover:bg-blue-50/30 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Left: Project Details */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold flex items-center justify-center">
                      #{project.rank}
                    </span>
                    <span className="text-base">{getTypeIcon(project.type)}</span>
                    <h3 className="text-base font-bold text-slate-900">{project.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                      {project.ward} {project.village ? `• ${project.village}` : ''}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getPriorityBadgeClass(
                        project.priorityLevel
                      )}`}
                    >
                      {project.priorityLevel} ({project.priorityScore}/100)
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200">
                      Condition: <strong>{project.condition}</strong>
                    </span>
                  </div>

                  {/* Why Selected Rationale Box */}
                  <div className="p-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-xs text-emerald-900 leading-relaxed flex items-start gap-2">
                    <span className="text-emerald-600 font-bold mt-0.5">💡 Why Selected:</span>
                    <span>{project.selectionReason}</span>
                  </div>

                  {/* Demographics / Quick stats */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                    <span>👥 <strong>{project.populationServed.toLocaleString()}</strong> residents served</span>
                    <span>🚨 <strong>{project.complaintsCount}</strong> citizen complaints</span>
                    <span>⚡ Impact Score: <strong className="text-indigo-600">{project.impactScore}</strong></span>
                    <span>📈 Cost-Efficiency: <strong className="text-blue-600">{project.valuePerLakh} impact/₹1L</strong></span>
                  </div>
                </div>

                {/* Right: Cost & Budget Share */}
                <div className="flex lg:flex-col items-center lg:items-end justify-between lg:justify-center border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100 min-w-[170px]">
                  <span className="text-xs text-slate-500 block">Estimated Repair Cost</span>
                  <span className="text-lg font-extrabold text-slate-900">
                    {formatRupee(project.estimatedRepairCost)}
                  </span>
                  <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 mt-0.5">
                    {project.costSharePercent}% of budget
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Unselected Projects Section (Collapsible Drawer) */}
      {result && result.unselectedProjects.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div
            onClick={() => setShowUnselected(!showUnselected)}
            className="p-5 cursor-pointer hover:bg-slate-50 transition flex items-center justify-between border-b border-slate-200"
          >
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>⏸️</span> Unselected Infrastructure Candidates ({result.unselectedProjects.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Assets excluded due to budget cap limitations or lower benefit-cost ratios.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-600">
              <span>{showUnselected ? 'Hide Excluded Assets' : 'View Excluded Assets'}</span>
              <span>{showUnselected ? '▲' : '▼'}</span>
            </div>
          </div>

          {showUnselected && (
            <div className="p-5 space-y-4 bg-slate-50/50">
              {/* Filter unselected search */}
              <div className="flex items-center justify-between gap-4">
                <input
                  type="text"
                  placeholder="Search excluded assets by name, ward, or reason..."
                  value={unselectedSearch}
                  onChange={(e) => setUnselectedSearch(e.target.value)}
                  className="w-full max-w-md text-xs p-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-xs text-slate-500">
                  Showing {filteredUnselected.length} of {result.unselectedProjects.length}
                </span>
              </div>

              {/* Table / List */}
              <div className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200 overflow-hidden">
                {filteredUnselected.map((item) => (
                  <div key={item.infrastructureId} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base">{getTypeIcon(item.type)}</span>
                        <span className="font-bold text-slate-900 text-sm">{item.name}</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-medium">
                          {item.ward}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold border ${getPriorityBadgeClass(
                            item.priorityLevel
                          )}`}
                        >
                          {item.priorityLevel} ({item.priorityScore})
                        </span>
                        <span className="text-slate-500">
                          Cost: <strong className="text-slate-800">{formatRupee(item.estimatedRepairCost)}</strong>
                        </span>
                      </div>

                      <div className="p-2 bg-amber-50/70 border border-amber-200/80 rounded-lg text-amber-900 flex items-start gap-1.5">
                        <span className="font-bold text-amber-700">⚠️ Why Not Selected:</span>
                        <span>{item.rejectionReason}</span>
                      </div>
                    </div>

                    <div className="text-right text-slate-500 shrink-0">
                      <span>Efficiency: <strong>{item.valuePerLakh} impact/₹1L</strong></span>
                      {item.costDeficit && item.costDeficit > 0 && (
                        <div className="text-red-600 font-semibold text-[11px] mt-0.5">
                          Deficit: {formatRupee(item.costDeficit)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. Decision-Support Methodology & Mathematical Formulation */}
      {result && (
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 text-xs text-slate-700 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">📐</span>
            <h4 className="text-sm font-bold text-slate-900">Optimization Model & Methodology Formulation</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <span className="font-bold text-slate-900 block">1. Demographic Impact Scaling</span>
              <p className="text-slate-600 font-mono text-[11px] bg-slate-50 p-2 rounded border border-slate-100">
                {result.methodology.formulaImpact}
              </p>
              <p className="text-slate-500 text-[11px]">
                Scales engineering priority by population reach (+35% max) and active citizen complaints (+25% max).
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <span className="font-bold text-slate-900 block">2. Benefit-Cost Ratio Heuristic</span>
              <p className="text-slate-600 font-mono text-[11px] bg-slate-50 p-2 rounded border border-slate-100">
                {result.methodology.formulaValuePerRupee}
              </p>
              <p className="text-slate-500 text-[11px]">
                Greedy selection prioritizes assets offering highest societal returns per Lakh Rupee invested.
              </p>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-[11px] leading-relaxed flex items-start gap-2">
            <span className="text-blue-600 font-bold text-base">ℹ️</span>
            <div>
              <strong>Panchayat Governance Advisory:</strong> {result.methodology.disclaimer}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState, useMemo } from 'react';
import { RankedInfrastructure, PriorityStats, PriorityLevel, RankedPriorityLevel } from '../types/priority';
import { api } from '../api/client';
import ScoreExplanationModal from '../components/ScoreExplanationModal';
import PriorityConfigModal from '../components/PriorityConfigModal';

export default function PriorityDashboardPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [recalculating, setRecalculating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [assets, setAssets] = useState<RankedInfrastructure[]>([]);
  const [stats, setStats] = useState<PriorityStats | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<'score' | 'complaints' | 'population'>('score');

  // Modals
  const [selectedAsset, setSelectedAsset] = useState<RankedInfrastructure | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);

  const fetchPriorities = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{
        data: RankedInfrastructure[];
        stats: PriorityStats;
      }>('/api/priorities');
      setAssets(data.data || []);
      setStats(data.stats || null);
    } catch (err: any) {
      console.error('Failed to load priority data', err);
      setError(err.message || 'Could not fetch ranked infrastructure priorities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPriorities();
  }, []);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await api('/api/priorities/recalculate', { method: 'POST' });
      await fetchPriorities();
    } catch (err: any) {
      alert('Recalculation error: ' + err.message);
    } finally {
      setRecalculating(false);
    }
  };

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => asset.priorityScore != null && asset.priorityLevel !== 'Unavailable').filter((asset) => {
      if (typeFilter !== 'All' && asset.type.toLowerCase() !== typeFilter.toLowerCase()) {
        return false;
      }
      if (priorityFilter !== 'All' && asset.priorityLevel !== priorityFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = asset.name?.toLowerCase().includes(term);
        const matchHabitation = asset.habitationName?.toLowerCase().includes(term);
        const matchType = asset.type?.toLowerCase().includes(term);
        if (!matchName && !matchHabitation && !matchType) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'score') return (b.priorityScore ?? -1) - (a.priorityScore ?? -1);
      if (sortBy === 'complaints') return (b.complaintsCount ?? -1) - (a.complaintsCount ?? -1);
      if (sortBy === 'population') return (b.populationServed ?? -1) - (a.populationServed ?? -1);
      return 0;
    });
  }, [assets, typeFilter, priorityFilter, searchTerm, sortBy]);

  const topCriticalAssets = useMemo(() => {
    return assets.filter((asset) => asset.priorityScore != null && asset.priorityLevel !== 'Unavailable').slice(0, 3);
  }, [assets]);

  const getPriorityBadge = (level: RankedPriorityLevel) => {
    switch (level) {
      case 'Critical':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800">
            ● Critical
          </span>
        );
      case 'High':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800">
            ● High
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
            ● Medium
          </span>
        );
      default:
        if (level === 'Unavailable') return <span className="inline-flex items-center rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-bold text-slate-600">● Unscored</span>;
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
            ● Low
          </span>
        );
    }
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 80) return 'bg-red-600';
    if (score >= 60) return 'bg-orange-500';
    if (score >= 40) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300">
              Phase 3 Intelligence
            </span>
            <span className="text-xs text-slate-500">MCDA Simple Additive Weighting</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            Infrastructure Priority & Decision Engine
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Objective, data-driven prioritization ranking rural infrastructure across physical condition,
            citizen complaints, population served, traffic, maintenance age, and isolation distance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsConfigOpen(true)}
            className="px-3.5 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition shadow-sm flex items-center gap-2"
          >
            <span>⚙️</span>
            <span>Configure Weights</span>
          </button>
          <button
            disabled={recalculating}
            onClick={handleRecalculate}
            className={`px-4 py-2 text-sm font-semibold rounded-lg text-white transition shadow-sm flex items-center gap-2 ${
              recalculating
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
            }`}
          >
            <span>🔄</span>
            <span>{recalculating ? 'Recalculating...' : 'Recalculate Priorities'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
              Total Assets
            </div>
            <div className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">
              {stats.total}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Scored & indexed</div>
          </div>

          <div className="p-4 bg-red-50/60 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/40 shadow-sm">
            <div className="text-xs font-bold text-red-700 dark:text-red-400 uppercase">
              Critical
            </div>
            <div className="text-2xl font-bold mt-1 text-red-800 dark:text-red-300">
              {stats.critical}
            </div>
            <div className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">Score &ge; 80</div>
          </div>

          <div className="p-4 bg-orange-50/60 dark:bg-orange-950/20 rounded-xl border border-orange-200 dark:border-orange-900/40 shadow-sm">
            <div className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase">
              High
            </div>
            <div className="text-2xl font-bold mt-1 text-orange-800 dark:text-orange-300">
              {stats.high}
            </div>
            <div className="text-xs text-orange-600/80 dark:text-orange-400/80 mt-0.5">Score 60–79</div>
          </div>

          <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/40 shadow-sm">
            <div className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase">
              Medium
            </div>
            <div className="text-2xl font-bold mt-1 text-amber-800 dark:text-amber-300">
              {stats.medium}
            </div>
            <div className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">Score 40–59</div>
          </div>

          <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/40 shadow-sm">
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase">
              Low
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-800 dark:text-emerald-300">
              {stats.low}
            </div>
            <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Score &lt; 40</div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
              Avg Priority
            </div>
            <div className="text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400">
              {stats.averageScore.toFixed(1)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Scale 0–100</div>
          </div>
        </div>
      )}

      {/* Top 3 High Priority Attention Banner */}
      {topCriticalAssets.length > 0 && (
        <div className="bg-gradient-to-r from-red-500/10 via-orange-500/10 to-amber-500/10 border border-red-200 dark:border-red-900/50 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚨</span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Top Infrastructure Requiring Immediate Attention
              </h2>
            </div>
            <span className="text-xs text-slate-500">Highest Multi-Factor Urgency</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topCriticalAssets.map((asset, idx) => (
              <div
                key={asset._id}
                className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-extrabold text-xs">
                      #{idx + 1}
                    </span>
                    {getPriorityBadge(asset.priorityLevel)}
                  </div>
                  <h3 className="font-bold text-base mt-2 text-slate-900 dark:text-white line-clamp-1">
                    {asset.name}
                  </h3>
                  <div className="text-xs text-slate-500 mt-0.5 flex gap-2">
                    <span>{asset.type}</span>
                    {asset.habitationName && <span>• {asset.habitationName}</span>}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-slate-400 block">Condition</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {asset.condition}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Complaints</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {asset.complaintsCount ?? 'Unavailable'} active
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Population</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {asset.populationServed?.toLocaleString() ?? 'Unavailable'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Score</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {asset.priorityScore?.toFixed(1) ?? 'Unavailable'}{asset.priorityScore != null ? ' / 100' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedAsset(asset)}
                  className="mt-3 w-full py-1.5 px-3 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-semibold transition text-center"
                >
                  View Score Rationale →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Control Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search by asset name, habitation or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border rounded-lg dark:bg-slate-900 dark:border-slate-700"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="All">All Types</option>
              <option value="Road">Roads</option>
              <option value="School">Schools</option>
              <option value="Healthcare">Healthcare (PHC)</option>
              <option value="WaterFacility">Water Facility</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="All">All Urgencies</option>
              <option value="Critical">Critical (80+)</option>
              <option value="High">High (60-79)</option>
              <option value="Medium">Medium (40-59)</option>
              <option value="Low">Low (0-39)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-lg border dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="score">Priority Score (Highest first)</option>
              <option value="complaints">Complaints (Highest first)</option>
              <option value="population">Population (Highest first)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Ranking Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin text-3xl mb-2">⚙️</div>
            Evaluating multi-criteria normalization & rankings...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 dark:text-red-400">{error}</div>
        ) : filteredAssets.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No infrastructure assets match the active filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase border-b dark:border-slate-700">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">Rank</th>
                  <th className="py-3 px-4">Infrastructure Asset</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Condition</th>
                  <th className="py-3 px-4 text-center">Complaints</th>
                  <th className="py-3 px-4 text-right">Population</th>
                  <th className="py-3 px-4 text-center">Urgency</th>
                  <th className="py-3 px-4 w-44">Priority Score</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredAssets.map((asset, index) => (
                  <tr
                    key={asset._id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition"
                  >
                    <td className="py-3 px-4 text-center font-bold text-slate-500 text-xs">
                      #{index + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {asset.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {asset.habitationName ? `Habitation: ${asset.habitationName}` : 'General Panchayat'}
                        {asset.wardNumber != null && ` • Ward ${asset.wardNumber}`}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {asset.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          asset.condition === 'Bad'
                            ? 'text-red-600 font-bold'
                            : asset.condition === 'Average'
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {asset.condition}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          (asset.complaintsCount ?? 0) > 0
                            ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {asset.complaintsCount ?? 'Unavailable'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs">
                      {asset.populationServed?.toLocaleString() ?? 'Unavailable'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {getPriorityBadge(asset.priorityLevel)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${getScoreBarColor(
                              asset.priorityScore ?? 0
                            )}`}
                            style={{ width: `${Math.min(100, Math.max(3, asset.priorityScore ?? 0))}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-bold w-10 text-right">
                          {asset.priorityScore?.toFixed(1) ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedAsset(asset)}
                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-900 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition"
                      >
                        Explain
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <ScoreExplanationModal
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
      />

      <PriorityConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onConfigSaved={fetchPriorities}
      />
    </div>
  );
}

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RankedInfrastructure, PriorityStats, RankedPriorityLevel } from '../types/priority';
import { api, apiAuth } from '../api/client';
import { useAuth } from '../store/auth';
import ScoreExplanationModal from '../components/ScoreExplanationModal';
import PriorityAvailabilityDetails from '../components/PriorityAvailabilityDetails';
import PriorityConfigModal from '../components/PriorityConfigModal';
import {
  applyPriorityResultIfCurrent,
  buildPriorityRequestPath,
  createPriorityRequestGate,
  filterAndSortPriorityItems,
  getUnavailablePriorityItems,
  shouldShowUnavailablePrioritySection,
  getPriorityDisplaySummary,
  getPriorityEmptyState,
  parsePriorityResponse,
  resolveInitialPriorityPanchayat,
  updatePrioritySearchParams,
} from '../utils/priorityDashboardScope.mjs';

interface PanchayatOption {
  _id: string;
  name: string;
}

export default function PriorityDashboardPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPanchayatIdRef = useRef(searchParams.get('panchayatId'));
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const requestGateRef = useRef(createPriorityRequestGate());
  const [panchayats, setPanchayats] = useState<PanchayatOption[]>([]);
  const [panchayatsLoading, setPanchayatsLoading] = useState<boolean>(true);
  const [panchayatError, setPanchayatError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selectedPanchayatId, setSelectedPanchayatId] = useState<string>('');
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

  useEffect(() => {
    const lifecycleId = requestGateRef.current.activate();
    return () => {
      requestGateRef.current.deactivate(lifecycleId);
    };
  }, []);

  useEffect(() => {
    let active = true;
    requestGateRef.current.select(null);
    setSelectedPanchayatId('');
    setAssets([]);
    setStats(null);
    setError(null);
    setSelectionError(null);
    setPanchayatError(null);
    setPanchayatsLoading(true);
    setLoading(true);

    const loadPanchayats = async () => {
      try {
        const list = token
          ? await apiAuth<PanchayatOption[]>('/panchayats', token)
          : await api<PanchayatOption[]>('/panchayats');
        if (!Array.isArray(list) || list.some((item) => !item || typeof item._id !== 'string' || typeof item.name !== 'string')) {
          throw new Error('The Panchayat list response was invalid.');
        }
        if (!active) return;

        setPanchayats(list);
        const initial = resolveInitialPriorityPanchayat(list, initialPanchayatIdRef.current);
        setSelectionError(initial.error);
        requestGateRef.current.select(initial.selectedId || null);
        setSelectedPanchayatId(initial.selectedId);
        if (initial.selectedId && !initialPanchayatIdRef.current) {
          initialPanchayatIdRef.current = initial.selectedId;
          setSearchParams((current) => updatePrioritySearchParams(current, initial.selectedId), { replace: true });
        }
        if (!initial.selectedId) setLoading(false);
      } catch (loadError: unknown) {
        if (!active) return;
        setPanchayatError(loadError instanceof Error ? loadError.message : 'Failed to load Panchayats.');
        setLoading(false);
      } finally {
        if (active) setPanchayatsLoading(false);
      }
    };

    void loadPanchayats();
    return () => {
      active = false;
    };
  }, [token, setSearchParams]);

  const loadPriorities = useCallback((panchayatId: string) => {
    const request = requestGateRef.current.begin(panchayatId);
    if (!request) return null;
    setLoading(true);
    setError(null);
    setAssets([]);
    setStats(null);

    void (async () => {
      try {
        const url = buildPriorityRequestPath(panchayatId);
        const response = tokenRef.current
          ? await apiAuth<{ items: RankedInfrastructure[]; stats: PriorityStats }>(url, tokenRef.current)
          : await api<{ items: RankedInfrastructure[]; stats: PriorityStats }>(url);
        const data = parsePriorityResponse(response);
        applyPriorityResultIfCurrent(requestGateRef.current, request, () => {
          setAssets(data.items);
          setStats(data.stats);
          setError(null);
        });
      } catch (loadError: unknown) {
        applyPriorityResultIfCurrent(requestGateRef.current, request, () => {
          setAssets([]);
          setStats(null);
          setError(loadError instanceof Error ? loadError.message : 'Could not fetch ranked infrastructure priorities.');
        });
      } finally {
        applyPriorityResultIfCurrent(requestGateRef.current, request, () => setLoading(false));
      }
    })();
    return request;
  }, []);

  useEffect(() => {
    if (!selectedPanchayatId) {
      setLoading(false);
      return;
    }
    const request = loadPriorities(selectedPanchayatId);
    return () => {
      if (request) requestGateRef.current.invalidateIfCurrent(request);
    };
  }, [selectedPanchayatId, loadPriorities]);

  const selectPanchayat = (panchayatId: string) => {
    if (panchayatId && !panchayats.some((panchayat) => panchayat._id === panchayatId)) return;
    requestGateRef.current.select(panchayatId || null);
    setSelectedPanchayatId(panchayatId);
    setAssets([]);
    setStats(null);
    setError(null);
    setSelectionError(null);
    setSelectedAsset(null);
    setIsConfigOpen(false);
    setLoading(Boolean(panchayatId));
    initialPanchayatIdRef.current = panchayatId || null;
    setSearchParams((current) => updatePrioritySearchParams(current, panchayatId), { replace: true });
  };

  const handleRecalculate = async () => {
    if (!selectedPanchayatId) return;
    setRecalculating(true);
    try {
      const params = new URLSearchParams({ panchayatId: selectedPanchayatId });
      const url = `/api/priorities/recalculate?${params.toString()}`;
      const options = { method: 'POST' };
      if (tokenRef.current) await apiAuth(url, tokenRef.current, options);
      else await api(url, options);
      loadPriorities(selectedPanchayatId);
    } catch (err: any) {
      alert('Recalculation error: ' + err.message);
    } finally {
      setRecalculating(false);
    }
  };

  const filteredAssets = useMemo(() => filterAndSortPriorityItems(assets, {
    typeFilter, priorityFilter, searchTerm, sortBy
  }), [assets, typeFilter, priorityFilter, searchTerm, sortBy]);
  const unavailableAssets = useMemo(() => getUnavailablePriorityItems(assets), [assets]);
  const showUnavailableSection = shouldShowUnavailablePrioritySection({ loading, error, items: assets });

  const displaySummary = useMemo(() => stats ? getPriorityDisplaySummary(assets, stats) : null, [assets, stats]);
  const emptyState = getPriorityEmptyState({
    selectedPanchayat: Boolean(selectedPanchayatId),
    panchayatCount: panchayats.length,
    selectionError,
    items: assets,
    stats,
    scoredCount: displaySummary?.scored ?? 0,
    filteredCount: filteredAssets.length,
  });

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
            disabled={!selectedPanchayatId || panchayatsLoading}
            onClick={() => setIsConfigOpen(true)}
            className="px-3.5 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>⚙️</span>
            <span>Configure Weights</span>
          </button>
          <button
            disabled={recalculating || !selectedPanchayatId || panchayatsLoading}
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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <label htmlFor="priority-panchayat" className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Panchayat for this analysis
        </label>
        <select
          id="priority-panchayat"
          value={selectedPanchayatId}
          onChange={(event) => selectPanchayat(event.target.value)}
          disabled={panchayatsLoading || Boolean(panchayatError) || panchayats.length === 0}
          className="min-w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Select Panchayat</option>
          {panchayats.map((panchayat) => (
            <option key={panchayat._id} value={panchayat._id}>{panchayat.name}</option>
          ))}
        </select>
        {panchayatsLoading && <span className="text-sm text-slate-500">Loading available Panchayats…</span>}
        {panchayatError && <span role="alert" className="text-sm text-red-600 dark:text-red-400">{panchayatError}</span>}
        {!panchayatsLoading && !panchayatError && panchayats.length === 0 && (
          <span className="text-sm text-slate-500">No Panchayats are available to this account.</span>
        )}
        {selectionError && <span role="alert" className="text-sm text-amber-700 dark:text-amber-400">{selectionError}</span>}
        {!panchayatsLoading && panchayats.length > 1 && !selectedPanchayatId && !selectionError && (
          <span className="text-sm text-slate-500">Select a Panchayat to view its priority analysis.</span>
        )}
      </div>

      {/* KPI Cards */}
      {displaySummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
              Total Assets
            </div>
            <div className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">
              {displaySummary.total}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{displaySummary.scored} scored · {displaySummary.unscored} unscored</div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Unscored</div>
            <div className="text-2xl font-bold mt-1 text-slate-700 dark:text-slate-200">{displaySummary.unscored}</div>
            <div className="text-xs text-slate-400 mt-0.5">Not included in urgency</div>
          </div>

          <div className="p-4 bg-red-50/60 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/40 shadow-sm">
            <div className="text-xs font-bold text-red-700 dark:text-red-400 uppercase">
              Critical
            </div>
            <div className="text-2xl font-bold mt-1 text-red-800 dark:text-red-300">
              {displaySummary.critical}
            </div>
            <div className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">Score &ge; 80</div>
          </div>

          <div className="p-4 bg-orange-50/60 dark:bg-orange-950/20 rounded-xl border border-orange-200 dark:border-orange-900/40 shadow-sm">
            <div className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase">
              High
            </div>
            <div className="text-2xl font-bold mt-1 text-orange-800 dark:text-orange-300">
              {displaySummary.high}
            </div>
            <div className="text-xs text-orange-600/80 dark:text-orange-400/80 mt-0.5">Score 60–79</div>
          </div>

          <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/40 shadow-sm">
            <div className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase">
              Medium
            </div>
            <div className="text-2xl font-bold mt-1 text-amber-800 dark:text-amber-300">
              {displaySummary.medium}
            </div>
            <div className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">Score 40–59</div>
          </div>

          <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/40 shadow-sm">
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase">
              Low
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-800 dark:text-emerald-300">
              {displaySummary.low}
            </div>
            <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Score &lt; 40</div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
              Avg Priority
            </div>
            <div className="text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400">
              {displaySummary.averageScore == null ? 'Not available' : displaySummary.averageScore.toFixed(1)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Scored assets only · 0–100</div>
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
        {panchayatsLoading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin text-3xl mb-2">⚙️</div>
            Loading available Panchayats...
          </div>
        ) : panchayatError ? (
          <div role="alert" className="p-8 text-center text-red-600 dark:text-red-400">{panchayatError}</div>
        ) : emptyState === 'invalid-selection' || emptyState === 'select-panchayat' || emptyState === 'no-panchayats' ? (
          <div className="p-12 text-center text-slate-500">
            {emptyState === 'invalid-selection'
              ? selectionError
              : emptyState === 'no-panchayats'
                ? 'No Panchayats are available to this account.'
                : 'Select a Panchayat to view its priority analysis.'}
          </div>
        ) : loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin text-3xl mb-2">⚙️</div>
            Evaluating multi-criteria normalization & rankings...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 dark:text-red-400">{error}</div>
        ) : emptyState === 'no-assets' ? (
          <div className="p-12 text-center text-slate-500">No infrastructure assets were returned for this Panchayat.</div>
        ) : emptyState === 'inconsistent-response' ? (
          <div className="p-12 text-center text-amber-700 dark:text-amber-400">
            The API reports {stats?.total ?? 'some'} assets for this Panchayat but returned no asset records. The response is incomplete.
          </div>
        ) : emptyState === 'none-scorable' ? (
          <div className="p-12 text-center text-slate-600 dark:text-slate-300">
            {assets.length} assets were returned, but none are currently scorable. They are not included in the ranked list or urgency counts.
          </div>
        ) : emptyState === 'filters-empty' ? (
          <div className="p-12 text-center text-slate-500">
            No scored assets match the active filters.
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

      {showUnavailableSection && (
        <section className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm dark:border-amber-900/60 dark:bg-slate-800" aria-labelledby="unscored-priority-heading">
          <div className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="unscored-priority-heading" className="text-lg font-bold text-slate-900 dark:text-white">
                Not Yet Scoreable <span className="ml-1 text-sm font-semibold text-slate-500">({unavailableAssets.length})</span>
              </h2>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Excluded from ranking
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              These records have no priority score or rank. Review their source inputs and provenance before considering them for scoring.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {unavailableAssets.map((asset) => (
              <article key={asset._id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{asset.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{asset.type}</p>
                  </div>
                  <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:border-slate-600 dark:text-slate-300">
                    Priority unavailable
                  </span>
                </div>
                <PriorityAvailabilityDetails availability={asset.priorityAvailability} />
                <button
                  type="button"
                  onClick={() => setSelectedAsset(asset)}
                  className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  View readiness details
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Modals */}
      <ScoreExplanationModal
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
      />

      <PriorityConfigModal
        isOpen={isConfigOpen}
        panchayatId={selectedPanchayatId}
        onClose={() => setIsConfigOpen(false)}
        onConfigSaved={() => {
          if (selectedPanchayatId) loadPriorities(selectedPanchayatId);
        }}
      />
    </div>
  );
}

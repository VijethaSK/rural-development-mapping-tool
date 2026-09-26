import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import {
  Coordinate,
  StopCandidate,
  OrderedStop,
  RouteOptimizationResult
} from '../types/route';
import { api, apiAuth } from '../api/client';
import { useAuth } from '../store/auth';
import {
  candidateRequestPath,
  isFiniteCoordinate,
  panchayatsVisibleToUser,
  resetRouteSelection,
  resolveRouteOrigin,
  routeMethodOverlayLabel,
  shouldApplyCandidateResponse,
  shouldApplyOptimizationResponse,
} from '../utils/routeOptimizerScope';
import type { RoutePanchayatOption } from '../utils/routeOptimizerScope';

interface PanchayatOption extends RoutePanchayatOption {
  centerCoord?: Coordinate | null;
}

// Custom icons
const createStartIcon = () => {
  return L.divIcon({
    className: 'custom-start-marker',
    html: `<div style="background-color: #2563eb; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); font-size: 16px; cursor: pointer;">🏁</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
};

const createNumberedStopIcon = (sequence: number, priorityLevel: string) => {
  const colorMap: Record<string, string> = {
    Critical: '#dc2626',
    High: '#ea580c',
    Medium: '#d97706',
    Low: '#16a34a',
  };
  const color = colorMap[priorityLevel] || '#2563eb';

  return L.divIcon({
    className: 'custom-seq-marker',
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35); font-weight: 800; font-size: 13px; color: white; cursor: pointer;">${sequence}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

export default function RouteOptimizationPage() {
  const { token, user } = useAuth();
  const initialPanchayatId = new URLSearchParams(window.location.search).get('panchayatId') || '';
  const [panchayats, setPanchayats] = useState<PanchayatOption[]>([]);
  const [loadingPanchayats, setLoadingPanchayats] = useState<boolean>(true);
  const [selectedPanchayatId, setSelectedPanchayatId] = useState<string>(initialPanchayatId);
  const selectedPanchayatIdRef = useRef(initialPanchayatId);
  const optimizationRequestVersionRef = useRef(0);
  const visiblePanchayats = useMemo(
    () => panchayatsVisibleToUser(panchayats, user?.panchayatId),
    [panchayats, user?.panchayatId]
  );
  const selectedPanchayat = panchayats.find((item) => String(item._id) === selectedPanchayatId);

  // State
  const [loadingCandidates, setLoadingCandidates] = useState<boolean>(Boolean(initialPanchayatId));
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Available candidate infrastructure
  const [candidates, setCandidates] = useState<StopCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Configuration
  const [startName, setStartName] = useState<string>('Select a Panchayat');
  const [startCoord, setStartCoord] = useState<Coordinate | null>(null);
  const [priorityWeight, setPriorityWeight] = useState<number>(1.5);
  const [speedKmph, setSpeedKmph] = useState<number>(30);

  // Optimization Result
  const [result, setResult] = useState<RouteOptimizationResult | null>(null);

  // Load Panchayats through the existing scoped API. The backend remains authoritative.
  useEffect(() => {
    let active = true;
    setLoadingPanchayats(true);
    (token ? apiAuth<PanchayatOption[]>('/panchayats', token) : api<PanchayatOption[]>('/panchayats'))
      .then((res) => {
        if (active && Array.isArray(res)) setPanchayats(res);
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load Panchayats for route planning:', err);
          setError('Could not load Panchayats for route planning.');
        }
      })
      .finally(() => { if (active) setLoadingPanchayats(false); });
    return () => { active = false; };
  }, [token]);

  // 1. Fetch candidates only for an explicit Panchayat selection.
  useEffect(() => {
    const requestPath = candidateRequestPath(selectedPanchayatId);
    if (!requestPath) {
      setLoadingCandidates(false);
      return;
    }

    let active = true;
    setLoadingCandidates(true);
    setError(null);
    setCandidates([]);
    setSelectedIds(new Set());
    setStartCoord(null);
    setResult(null);
    const request = token
      ? apiAuth<{ data: any[]; startLocation?: Coordinate | null; panchayatName?: string }>(requestPath, token)
      : api<{ data: any[]; startLocation?: Coordinate | null; panchayatName?: string }>(requestPath);
    request
      .then((res) => {
        if (!active || !shouldApplyCandidateResponse(selectedPanchayatId, selectedPanchayatIdRef.current)) return;
        const list: StopCandidate[] = (res.data || [])
          .filter((item) => String(item.panchayatId) === selectedPanchayatId && isFiniteCoordinate(item.location))
          .map((item) => ({
            _id: item._id,
            infrastructureId: item._id,
            panchayatId: item.panchayatId,
            name: item.name,
            type: item.type,
            condition: item.condition,
            complaintsCount: item.complaintsCount,
            populationServed: item.populationServed,
            priorityScore: item.priorityScore ?? 50,
            priorityLevel: item.priorityLevel ?? 'Medium',
            location: item.location,
          }));
        setCandidates(list);
        setSelectedIds(new Set());

        const origin = resolveRouteOrigin(res.startLocation, res.panchayatName, list[0]?.location);
        setStartCoord(origin?.coordinate || null);
        setStartName(origin?.name || `${selectedPanchayat?.name || 'Selected Panchayat'} depot unavailable`);
      })
      .catch((err) => {
        if (!active || !shouldApplyCandidateResponse(selectedPanchayatId, selectedPanchayatIdRef.current)) return;
        console.error('Failed to load candidate infrastructure:', err);
        setCandidates([]);
        setError('Could not load candidates for this Panchayat. Check that it is available to your account.');
      })
      .finally(() => {
        if (active && shouldApplyCandidateResponse(selectedPanchayatId, selectedPanchayatIdRef.current)) setLoadingCandidates(false);
      });
    return () => { active = false; };
  }, [token, selectedPanchayatId]);

  const handlePanchayatChange = (panchayatId: string) => {
    selectedPanchayatIdRef.current = panchayatId;
    optimizationRequestVersionRef.current += 1;
    setSelectedPanchayatId(panchayatId);
    const reset = resetRouteSelection();
    setCandidates(reset.candidates);
    setSelectedIds(reset.selectedIds);
    setStartCoord(reset.startCoord);
    setStartName(panchayatId ? 'Loading selected Panchayat depot…' : reset.startName);
    setResult(reset.result);
    setOptimizing(false);
    setSaveSuccess(false);
    setError(null);
    setLoadingCandidates(Boolean(panchayatId));
  };

  const toggleSelectStop = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectTopPriority = (count: number) => {
    const sorted = [...candidates].sort((a, b) => b.priorityScore - a.priorityScore);
    const top = sorted.slice(0, count);
    const panchayatId = top[0]?.panchayatId;
    setSelectedIds(new Set(top.filter((c) => c.panchayatId === panchayatId).map((c) => c.infrastructureId)));
  };

  // 2. Generate Optimized Route
  const handleOptimize = async () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one maintenance location.');
      return;
    }

    setOptimizing(true);
    setError(null);
    setSaveSuccess(false);

    const selectedStops = candidates.filter((c) => selectedIds.has(c.infrastructureId));
    if (!startCoord) { setError('No valid Panchayat center or infrastructure coordinate is available for the route origin.'); setOptimizing(false); return; }
    const panchayatId = selectedPanchayatId;
    if (!panchayatId || selectedStops.some((stop) => stop.panchayatId !== panchayatId)) {
      setError('Select infrastructure from one Panchayat for each route.');
      setOptimizing(false);
      return;
    }

    const requestVersion = ++optimizationRequestVersionRef.current;
    const isCurrentRequest = () => shouldApplyOptimizationResponse(
      panchayatId,
      selectedPanchayatIdRef.current,
      requestVersion,
      optimizationRequestVersionRef.current
    );

    try {
      const payload = {
        panchayatId,
        startLocation: {
          lat: startCoord.lat,
          lng: startCoord.lng,
          name: startName,
        },
        maintenanceLocations: selectedStops.map((s) => ({
          infrastructureId: s.infrastructureId,
          infrastructureName: s.name,
          type: s.type,
          location: s.location,
          priorityScore: s.priorityScore,
          priorityLevel: s.priorityLevel,
        })),
        options: {
          priorityWeight,
          averageSpeedKmph: speedKmph,
          apply2Opt: true,
        },
      };

      const res = token
        ? await apiAuth<{ data: RouteOptimizationResult }>('/api/routes/optimize', token, { method: 'POST', body: JSON.stringify(payload) })
        : await api<{ data: RouteOptimizationResult }>('/api/routes/optimize', { method: 'POST', body: JSON.stringify(payload) });

      if (isCurrentRequest()) setResult(res.data);
    } catch (err: any) {
      if (isCurrentRequest()) {
        console.error('Optimization error:', err);
        setError(err.message || 'Route optimization failed.');
      }
    } finally {
      if (isCurrentRequest()) setOptimizing(false);
    }
  };

  // 3. Save Route to Database
  const handleSaveRoute = async () => {
    if (!result) return;
    const selectedStops = candidates.filter((c) => selectedIds.has(c.infrastructureId));
    const panchayatId = selectedPanchayatId;
    if (!token || !panchayatId || !['admin', 'pdo'].includes(user?.role || '')) {
      setError('Sign in as an administrator or PDO in the selected Panchayat to save a route.');
      return;
    }
    setSaving(true);
    try {
      await apiAuth('/api/routes/save', token, {
        method: 'POST',
        body: JSON.stringify({
          panchayatId,
          name: `Daily Maintenance Circuit — ${new Date().toLocaleDateString()}`,
          startLocation: startCoord,
          optimizationResult: result,
          selectedInfrastructureIds: selectedStops.map((stop) => stop.infrastructureId),
          routeOptions: { priorityWeight, averageSpeedKmph: speedKmph, apply2Opt: true },
        }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      alert('Failed to save route: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Map center
  const mapCenter = useMemo(() => {
    if (result && result.orderedStops.length > 0) {
      return [result.orderedStops[0].location.lat, result.orderedStops[0].location.lng] as [number, number];
    }
    return startCoord ? [startCoord.lat, startCoord.lng] as [number, number] : [0, 0] as [number, number];
  }, [result, startCoord]);

  // Route Polyline LatLngs
  const routePolylineCoords = useMemo(() => {
    if (!result?.routeGeometry?.coordinates) return [];
    return result.routeGeometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
  }, [result]);

  const getPriorityBadgeClass = (level: string) => {
    switch (level) {
      case 'Critical':
        return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
      case 'High':
        return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800';
      case 'Medium':
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
              Phase 5 Routing
            </span>
            <span className="text-xs text-slate-500">
              Level 1 Dijkstra + Level 2 Priority 2-Opt Ordering
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            Maintenance Route Optimization
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Solves multi-stop rural field operations by balancing Dijkstra shortest path travel
            with high-urgency priority dispatching.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={handleSaveRoute}
              disabled={saving || saveSuccess}
              className={`px-4 py-2 text-sm font-semibold rounded-lg text-white transition shadow-sm flex items-center gap-2 ${
                saveSuccess
                  ? 'bg-emerald-600'
                  : saving
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <span>{saveSuccess ? '✓ Assigned' : '💾'}</span>
              <span>{saveSuccess ? 'Route Saved & Assigned' : 'Save & Assign Route'}</span>
            </button>
          )}

          <button
            onClick={handleOptimize}
            disabled={!selectedPanchayatId || optimizing || selectedIds.size === 0}
            className={`px-5 py-2 text-sm font-bold rounded-lg text-white transition shadow-md flex items-center gap-2 ${
              !selectedPanchayatId || optimizing || selectedIds.size === 0
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
            }`}
          >
            <span>{optimizing ? '⚙️' : '🚀'}</span>
            <span>{optimizing ? 'Optimizing...' : 'Generate Route'}</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <label htmlFor="route-panchayat" className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Panchayat for this route
        </label>
        <select
          id="route-panchayat"
          value={selectedPanchayatId}
          onChange={(event) => handlePanchayatChange(event.target.value)}
          disabled={loadingPanchayats}
          className="w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        >
          <option value="">{loadingPanchayats ? 'Loading Panchayats…' : 'Select Panchayat'}</option>
          {visiblePanchayats.map((panchayat) => (
            <option key={panchayat._id} value={panchayat._id}>{panchayat.name}</option>
          ))}
          {selectedPanchayatId && !visiblePanchayats.some((item) => String(item._id) === selectedPanchayatId) && (
            <option value={selectedPanchayatId}>Panchayat unavailable to this account</option>
          )}
        </select>
        {selectedPanchayat && <div className="mt-2 text-xs text-slate-500">Candidates and depot are scoped to {selectedPanchayat.name}.</div>}
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-xl">
          ⚠️ {error}
        </div>
      )}

      {/* Main Grid: Controls / Asset Selector vs Map & Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Route Configuration & Asset Selector (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Start Location & Worker Assignment Card */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>👤</span>
              <span>Work Order & Origin</span>
            </h2>

            <div>
              <label className="text-xs text-slate-500 font-medium">Assigned Officer / Team</label>
              <div className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border dark:bg-slate-900 dark:border-slate-700">
                {user?.role === 'pdo' ? 'Assigned to your PDO account' : 'Assigned to an active PDO in the selected Panchayat'}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 font-medium">Starting Depot / Base</label>
              <input
                type="text"
                value={startName}
                onChange={(e) => setStartName(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border dark:bg-slate-900 dark:border-slate-700"
              />
              <div className="grid grid-cols-2 gap-2 mt-1 text-[11px] text-slate-500 font-mono">
                <div>Lat: {startCoord?.lat.toFixed(4) ?? 'Unavailable'}</div>
                <div>Lng: {startCoord?.lng.toFixed(4) ?? 'Unavailable'}</div>
              </div>
            </div>

            {/* Tradeoff Balance Slider */}
            <div className="border-t pt-2 dark:border-slate-700">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Priority Urgency Weight
                </span>
                <span className="font-bold font-mono text-blue-600 dark:text-blue-400">
                  {priorityWeight.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="0.1"
                value={priorityWeight}
                onChange={(e) => setPriorityWeight(parseFloat(e.target.value))}
                className="w-full mt-1.5 accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>0x (Shortest Distance)</span>
                <span>1.5x (Balanced)</span>
                <span>3.0x (Priority First)</span>
              </div>
            </div>
          </div>

          {/* Candidate Assets Selector Card */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Select Infrastructure
                </h2>
                <span className="text-xs text-slate-500">
                  {selectedIds.size} of {candidates.length} stops selected
                </span>
              </div>

              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => selectTopPriority(3)}
                  className="px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 font-semibold"
                >
                  Top 3
                </button>
                <button
                  type="button"
                  onClick={() => selectTopPriority(5)}
                  className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 font-semibold"
                >
                  Top 5
                </button>
              </div>
            </div>

            {!selectedPanchayatId ? (
              <div className="p-8 text-center text-xs text-slate-500">Select a Panchayat to load route candidates.</div>
            ) : loadingCandidates ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading infrastructure assets...</div>
            ) : candidates.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No infrastructure with usable point coordinates is available for this Panchayat.</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                {candidates.map((cand) => {
                  const isSelected = selectedIds.has(cand.infrastructureId);
                  return (
                    <div
                      key={cand.infrastructureId}
                      onClick={() => toggleSelectStop(cand.infrastructureId)}
                      className={`p-2.5 rounded-lg border transition cursor-pointer text-xs flex items-start gap-2.5 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by div
                        className="mt-0.5 accent-blue-600 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {cand.name}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${getPriorityBadgeClass(
                              cand.priorityLevel
                            )}`}
                          >
                            {cand.priorityLevel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                          <span>{cand.type}</span>
                          <span>•</span>
                          <span>Score: {cand.priorityScore.toFixed(0)}</span>
                          {cand.complaintsCount != null && cand.complaintsCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-red-600 font-medium">
                                {cand.complaintsCount} reports
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: GIS Map & Results (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Key Metrics Row */}
          {result && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="text-[11px] uppercase font-semibold text-slate-500">Total Distance</div>
                <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
                  {result.totalDistanceKm} km
                </div>
                <div className="text-[10px] text-slate-400">
                  Original: {result.originalDistanceKm ?? result.totalDistanceKm} km
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="text-[11px] uppercase font-semibold text-slate-500">Estimated Duration</div>
                <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {result.estimatedDurationMinutes == null ? 'Not estimated' : `${Math.round(result.estimatedDurationMinutes)} mins`}
                </div>
                <div className="text-[10px] text-slate-400">Transit + inspection</div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="text-[11px] uppercase font-semibold text-slate-500">Stops Planned</div>
                <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {result.stopsCount} stops
                </div>
                <div className="text-[10px] text-slate-400">From depot origin</div>
              </div>

              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/40 shadow-sm">
                <div className="text-[11px] uppercase font-bold text-emerald-700 dark:text-emerald-400">
                  Route Optimization
                </div>
                <div className="text-xl font-extrabold text-emerald-800 dark:text-emerald-300 mt-0.5">
                  {result.savingsPercent ?? 0}% saved
                </div>
              <div className="text-[10px] text-emerald-600/80">
                  {result.distanceSavingsKm ?? 0} km detour reduction
                </div>
              </div>
            </div>
          )}
          {result && <div className={`rounded-lg border p-3 text-sm ${result.fallbackUsed ? 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200' : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'}`}>
            <strong>{result.routingMethod}</strong>{result.fallbackUsed ? ' — straight-line distance is shown for fallback legs; it is not road distance and has no travel-time estimate.' : ' — legs use the stored road graph.'}
            {result.unreachableStops.length > 0 && <div className="mt-2">Unreachable stops excluded from route: {result.unreachableStops.map(s => s.infrastructureName).join(', ')}.</div>}
            <div className="mt-1 text-xs opacity-80">{result.algorithm.description}</div>
          </div>}

          {/* Interactive GIS Map */}
          <div className="relative h-[420px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md">
            {!startCoord ? (
              <div className="flex h-full items-center justify-center bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-slate-900">
                {selectedPanchayatId ? 'No depot center or candidate location is available for this Panchayat.' : 'Select a Panchayat to view its route map.'}
              </div>
            ) : (
            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              {/* Start Depot Marker */}
              {startCoord && <Marker position={[startCoord.lat, startCoord.lng]} icon={createStartIcon()}>
                <Popup>
                  <div className="p-1 text-xs">
                    <strong className="text-blue-600">Route Origin (Depot)</strong>
                    <div className="text-slate-800 font-semibold mt-0.5">{startName}</div>
                    <div className="text-slate-500">Departure: 09:00 AM</div>
                  </div>
                </Popup>
              </Marker>}

              {/* Sequential Ordered Stops Markers */}
              {result?.orderedStops.map((stop) => (
                <Marker
                  key={stop.sequence}
                  position={[stop.location.lat, stop.location.lng]}
                  icon={createNumberedStopIcon(stop.sequence, stop.priorityLevel)}
                >
                  <Popup>
                    <div className="p-1 min-w-[200px] text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900">Stop #{stop.sequence}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getPriorityBadgeClass(
                            stop.priorityLevel
                          )}`}
                        >
                          {stop.priorityLevel}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-800 mt-1">{stop.infrastructureName}</div>
                      <div className="mt-1 text-slate-500 space-y-0.5">
                        <div>Priority Score: <strong>{stop.priorityScore.toFixed(0)}</strong></div>
                        <div>Leg Distance: <strong>+{stop.distanceFromPreviousKm} km</strong></div>
                        <div>Leg method: <strong>{stop.routingMethod}</strong></div>
                        {stop.estimatedArrivalTime && <div>Estimated Arrival: <strong>{stop.estimatedArrivalTime}</strong></div>}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Optimized Dijkstra Route Polyline */}
              {routePolylineCoords.length > 0 && (
                <Polyline
                  positions={routePolylineCoords}
                  pathOptions={{
                    color: result?.fallbackUsed ? '#d97706' : '#2563eb',
                    weight: 5,
                    opacity: 0.85,
                    dashArray: result?.fallbackUsed ? '8, 8' : '1, 8',
                  }}
                />
              )}
            </MapContainer>
            )}

            {/* Algorithm Overlay Pill */}
            <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-lg shadow border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-300">
              ⚡ {routeMethodOverlayLabel(result)}
            </div>
          </div>

          {/* Numbered Stops Itinerary & Sequence Table */}
          {result && result.orderedStops.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b dark:border-slate-700 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Optimized Itinerary & Stop Sequence
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chronological maintenance dispatch with arrival timestamps and leg telemetry.
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono">Speed: {speedKmph} km/h</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 font-semibold text-slate-600 dark:text-slate-300 uppercase border-b dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">Stop</th>
                      <th className="py-2.5 px-3">Infrastructure Target</th>
                      <th className="py-2.5 px-3 text-center">Urgency</th>
                      <th className="py-2.5 px-3 text-right">Leg Dist.</th>
                      <th className="py-2.5 px-3 text-right">Total Dist.</th>
                      <th className="py-2.5 px-3 text-center">Est. Arrival</th>
                      <th className="py-2.5 px-3">Dispatch Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {result.orderedStops.map((stop) => (
                      <tr key={stop.sequence} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="py-2.5 px-3 text-center">
                          <span className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-extrabold text-[11px]">
                            {stop.sequence}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {stop.infrastructureName}
                          </div>
                          <div className="text-[11px] text-slate-500">{stop.type || 'Asset'}</div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPriorityBadgeClass(
                              stop.priorityLevel
                            )}`}
                          >
                            {stop.priorityLevel} ({stop.priorityScore.toFixed(0)})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                          +{stop.distanceFromPreviousKm} km
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold">
                          {stop.cumulativeDistanceKm} km
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                          {stop.estimatedArrivalTime || 'Not estimated'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                          {stop.reasonForOrder}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* "Why This Route?" Explainability Box */}
          {result?.explanation && (
            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">💡</span>
                <h3 className="font-bold text-sm text-blue-950 dark:text-blue-200 uppercase tracking-wider">
                  Why this route? (Decision Support Explanation)
                </h3>
              </div>

              <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed font-medium">
                {result.explanation.summary}
              </p>

              <div className="p-3 bg-white/80 dark:bg-slate-900/60 rounded-lg border border-blue-100 dark:border-blue-900/40 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
                <div className="font-semibold text-blue-900 dark:text-blue-300">
                  Priority-Distance Tradeoff Methodology:
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {result.explanation.tradeoffRationale}
                </p>
                <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  {result.explanation.stopOrderReasons.map((reason, idx) => (
                    <div key={idx} className="flex gap-1.5">
                      <span className="text-blue-600 font-bold">↳</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

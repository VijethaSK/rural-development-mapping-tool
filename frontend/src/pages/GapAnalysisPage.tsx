import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, Circle } from 'react-leaflet';
import L from 'leaflet';
import {
  Coordinate,
  UnderservedArea,
  SchoolBufferZone,
  AccessibilityMetrics,
  GapAnalysisResult,
  GapSeverity
} from '../types/gap';
import { api } from '../api/client';

// Custom icons
const schoolIcon = L.divIcon({
  className: 'custom-school-marker',
  html: `<div style="background-color: #2563eb; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); font-size: 16px; cursor: pointer;">🏫</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -17],
});

const habitationIcon = (isUnderserved: boolean, severity: GapSeverity) => {
  const bg = !isUnderserved
    ? '#10b981'
    : severity === 'Critical'
    ? '#dc2626'
    : severity === 'High'
    ? '#ea580c'
    : '#f59e0b';

  return L.divIcon({
    className: 'custom-hab-marker',
    html: `<div style="background-color: ${bg}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35); font-size: 13px; cursor: pointer;">🏘️</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
};

export default function GapAnalysisPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Configurable Thresholds (NOT hardcoded)
  const [schoolThresholdKm, setSchoolThresholdKm] = useState<number>(3.0);
  const [roadThresholdKm, setRoadThresholdKm] = useState<number>(1.0);
  const [gridResolutionKm, setGridResolutionKm] = useState<number>(0.8);

  // Filter
  const [issueFilter, setIssueFilter] = useState<string>('All');
  const [severityFilter, setSeverityFilter] = useState<string>('All');

  // Layer Toggles
  const [showSchoolBuffers, setShowSchoolBuffers] = useState<boolean>(true);
  const [showGridPolygons, setShowGridPolygons] = useState<boolean>(true);
  const [showHabitations, setShowHabitations] = useState<boolean>(true);

  // Results
  const [result, setResult] = useState<GapAnalysisResult | null>(null);

  const fetchGapAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api<{ data: GapAnalysisResult }>('/api/gap-analysis/analyze', {
        method: 'POST',
        body: JSON.stringify({
          schoolThresholdKm,
          roadThresholdKm,
          gridResolutionKm,
          computeNetworkDistance: true,
        }),
      });
      setResult(res.data);
    } catch (err: any) {
      console.error('Gap analysis error:', err);
      setError(err.message || 'Failed to execute spatial gap analysis.');
    } finally {
      setAnalyzing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGapAnalysis();
  }, []);

  const metrics: AccessibilityMetrics | undefined = result?.metrics;

  const filteredUnderservedAreas = useMemo(() => {
    if (!result) return [];
    return result.underservedAreas.filter((area) => {
      if (issueFilter !== 'All' && area.primaryIssue !== issueFilter) return false;
      if (severityFilter !== 'All' && area.overallSeverity !== severityFilter) return false;
      return true;
    });
  }, [result, issueFilter, severityFilter]);

  const mapCenter = useMemo(() => {
    if (result && result.schoolBuffers.length > 0) {
      return [result.schoolBuffers[0].center.lat, result.schoolBuffers[0].center.lng] as [number, number];
    }
    if (result?.underservedAreas.length) return [result.underservedAreas[0].center.lat, result.underservedAreas[0].center.lng] as [number, number];
    return [0, 0] as [number, number];
  }, [result]);

  const getSeverityBadgeClass = (severity: GapSeverity) => {
    switch (severity) {
      case 'Critical':
        return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
      case 'High':
        return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800';
      case 'Moderate':
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    }
  };

  const getPolygonColor = (severity: GapSeverity) => {
    switch (severity) {
      case 'Critical':
        return { color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.35 };
      case 'High':
        return { color: '#ea580c', fillColor: '#f97316', fillOpacity: 0.30 };
      default:
        return { color: '#d97706', fillColor: '#f59e0b', fillOpacity: 0.22 };
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300">
              Phase 6 Spatial GIS
            </span>
            <span className="text-xs text-slate-500">
              RTE & PMGSY Threshold Gap Modeling
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            Infrastructure Gap & Accessibility Detection
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Identifies underserved village habitations and territorial dead zones beyond acceptable
            walking distance to schools and road connectivity networks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchGapAnalysis}
            disabled={analyzing}
            className={`px-4 py-2 text-sm font-bold rounded-lg text-white transition shadow-md flex items-center gap-2 ${
              analyzing
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 active:scale-95'
            }`}
          >
            <span>{analyzing ? '⚙️' : '🔍'}</span>
            <span>{analyzing ? 'Analyzing Spatial Gaps...' : 'Re-Run Spatial Analysis'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-xl">
          ⚠️ {error}
        </div>
      )}

      {result?.spatialAnalysisAvailable === false && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {result.spatialAnalysisUnavailableReason || 'Spatial analysis unavailable — coordinates not provided/verified.'}
        </div>
      )}

      {/* KPI Dashboard Cards */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-[11px] font-semibold uppercase text-slate-500">Total Schools</div>
            <div className="text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400">
              {metrics.totalSchools}
            </div>
            <div className="text-[10px] text-slate-400">Active educational centers</div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-[11px] font-semibold uppercase text-slate-500">Analyzed Areas</div>
            <div className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">
              {metrics.totalAnalyzedAreas}
            </div>
            <div className="text-[10px] text-slate-400">
              {metrics.totalHabitations} villages + grid sectors
            </div>
          </div>

          <div className="p-4 bg-red-50/70 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/40 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-red-700 dark:text-red-400">
              Underserved Areas
            </div>
            <div className="text-2xl font-bold mt-1 text-red-800 dark:text-red-300">
              {metrics.underservedAreasCount}
            </div>
            <div className="text-[10px] text-red-600/80">Exceeding access threshold</div>
          </div>

          <div className="p-4 bg-orange-50/70 dark:bg-orange-950/20 rounded-xl border border-orange-200 dark:border-orange-900/40 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-orange-700 dark:text-orange-400">
              Area Deprivation
            </div>
            <div className="text-2xl font-bold mt-1 text-orange-800 dark:text-orange-300">
              {metrics.percentageAreaUnderserved}%
            </div>
            <div className="text-[10px] text-orange-600/80">Territory without coverage</div>
          </div>

          <div className="p-4 bg-purple-50/70 dark:bg-purple-950/20 rounded-xl border border-purple-200 dark:border-purple-900/40 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-purple-700 dark:text-purple-400">
              Affected Population
            </div>
            <div className="text-2xl font-bold mt-1 text-purple-800 dark:text-purple-300">
              {metrics.populationAffected.toLocaleString()}
            </div>
            <div className="text-[10px] text-purple-600/80">
              {metrics.percentagePopulationAffected}% of Panchayat
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-[11px] font-semibold uppercase text-slate-500">Avg School Dist.</div>
            <div className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">
              {metrics.averageDistanceToSchoolKm} km
            </div>
            <div className="text-[10px] text-slate-400">For unserved habitations</div>
          </div>
        </div>
      )}

      {/* Threshold Configuration Control Panel */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b pb-3 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <span>⚙️</span>
              <span>Configurable Spatial Accessibility Thresholds</span>
            </h2>
            <p className="text-xs text-slate-500">
              Tune maximum acceptable transit distance to model policy impacts (e.g. RTE norms vs PMGSY rural guidelines).
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showSchoolBuffers}
                onChange={(e) => setShowSchoolBuffers(e.target.checked)}
                className="accent-blue-600 rounded"
              />
              <span>School Buffers</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showGridPolygons}
                onChange={(e) => setShowGridPolygons(e.target.checked)}
                className="accent-red-600 rounded"
              />
              <span>Underserved Polygons</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showHabitations}
                onChange={(e) => setShowHabitations(e.target.checked)}
                className="accent-emerald-600 rounded"
              />
              <span>Habitations</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* School Threshold Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                School Max Acceptable Distance
              </span>
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                {schoolThresholdKm.toFixed(1)} km
              </span>
            </div>
            <input
              type="range"
              min="1.0"
              max="8.0"
              step="0.5"
              value={schoolThresholdKm}
              onChange={(e) => setSchoolThresholdKm(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>1.0 km (Primary)</span>
              <span>3.0 km (Upper Primary)</span>
              <span>5.0+ km (Secondary)</span>
            </div>
          </div>

          {/* Road Threshold Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Road Connectivity Max Distance
              </span>
              <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                {roadThresholdKm.toFixed(1)} km
              </span>
            </div>
            <input
              type="range"
              min="0.3"
              max="3.0"
              step="0.1"
              value={roadThresholdKm}
              onChange={(e) => setRoadThresholdKm(parseFloat(e.target.value))}
              className="w-full accent-purple-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>0.5 km (Direct link)</span>
              <span>1.0 km (PMGSY norm)</span>
              <span>2.0+ km (Isolated)</span>
            </div>
          </div>

          {/* Grid Resolution Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Territorial Grid Mesh Density
              </span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {gridResolutionKm.toFixed(1)} km
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={gridResolutionKm}
              onChange={(e) => setGridResolutionKm(parseFloat(e.target.value))}
              className="w-full accent-slate-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>0.5 km (High resolution)</span>
              <span>0.8 km (Balanced)</span>
              <span>1.5 km (Fast scan)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: GIS Map vs Filters & Priority Table */}
      <div className="space-y-5">
        {/* Interactive Leaflet GIS Map */}
        <div className="relative h-[480px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md">
          <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {/* School Radial Service Buffers */}
            {showSchoolBuffers &&
              result?.schoolBuffers.map((buf) => (
                <Circle
                  key={buf.schoolId}
                  center={[buf.center.lat, buf.center.lng]}
                  radius={buf.radiusKm * 1000}
                  pathOptions={{
                    color: '#2563eb',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.12,
                    weight: 1.5,
                    dashArray: '3, 6',
                  }}
                />
              ))}

            {/* Underserved Spatial Polygons / Grid Cells */}
            {showGridPolygons &&
              filteredUnderservedAreas
                .filter((a) => a.areaType === 'GridCell' && a.polygonGeometry)
                .map((cell) => {
                  const ringCoords = cell.polygonGeometry!.coordinates[0].map(
                    ([lng, lat]) => [lat, lng] as [number, number]
                  );
                  const style = getPolygonColor(cell.overallSeverity);

                  return (
                    <Polygon
                      key={cell.id}
                      positions={ringCoords}
                      pathOptions={{
                        color: style.color,
                        fillColor: style.fillColor,
                        fillOpacity: style.fillOpacity,
                        weight: 1.5,
                      }}
                    >
                      <Popup>
                        <div className="p-1 min-w-[200px] text-xs">
                          <div className="flex items-center justify-between">
                            <strong className="text-slate-900">{cell.name}</strong>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${getSeverityBadgeClass(
                                cell.overallSeverity
                              )}`}
                            >
                              {cell.overallSeverity}
                            </span>
                          </div>
                          <div className="mt-1 text-slate-600 space-y-0.5">
                            {cell.nearestSchool && (
                              <div>
                                Nearest School: <strong>{cell.nearestSchool.name}</strong> ({cell.nearestSchool.geographicDistanceKm.toFixed(1)} km)
                              </div>
                            )}
                            {cell.nearestRoad && (
                              <div>
                                Nearest Road: <strong>{cell.nearestRoad.name}</strong> ({cell.nearestRoad.geographicDistanceKm.toFixed(1)} km)
                              </div>
                            )}
                            <div className="text-red-600 font-semibold mt-1">
                              Distance Ratio: {cell.distanceToThresholdRatio}x acceptable threshold
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Polygon>
                  );
                })}

            {/* School Markers */}
            {result?.schoolBuffers.map((buf) => (
              <Marker key={buf.schoolId} position={[buf.center.lat, buf.center.lng]} icon={schoolIcon}>
                <Popup>
                  <div className="p-1 text-xs">
                    <strong className="text-blue-600 font-bold">🏫 {buf.schoolName}</strong>
                    <div className="text-slate-500 mt-0.5">
                      Service Catchment Radius: <strong>{buf.radiusKm} km</strong>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Habitation Markers */}
            {showHabitations &&
              result?.underservedAreas
                .filter((a) => a.areaType === 'Habitation')
                .map((hab) => (
                  <Marker
                    key={hab.id}
                    position={[hab.center.lat, hab.center.lng]}
                    icon={habitationIcon(true, hab.overallSeverity)}
                  >
                    <Popup>
                      <div className="p-1 min-w-[220px] text-xs">
                        <div className="flex items-center justify-between">
                          <strong className="text-slate-900">🏘️ {hab.name}</strong>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${getSeverityBadgeClass(
                              hab.overallSeverity
                            )}`}
                          >
                            {hab.overallSeverity}
                          </span>
                        </div>
                        <div className="mt-1 text-slate-600 space-y-0.5">
                          <div>Population: <strong>{hab.populationAffected.toLocaleString()}</strong></div>
                          {hab.ward && <div>Ward: <strong>{hab.ward}</strong></div>}
                          {hab.nearestSchool && (
                            <div>
                              Nearest School: <strong>{hab.nearestSchool.geographicDistanceKm.toFixed(1)} km</strong>
                              {hab.nearestSchool.networkDistanceKm && (
                                <span className="text-purple-600 font-mono block">
                                  ↳ Road Travel: {hab.nearestSchool.networkDistanceKm} km
                                </span>
                              )}
                            </div>
                          )}
                          {hab.nearestRoad && (
                            <div>
                              Nearest Motorable Road: <strong>{hab.nearestRoad.geographicDistanceKm.toFixed(1)} km</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
          </MapContainer>

          {/* Map Legend */}
          <div className="absolute bottom-4 right-3 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">Spatial Gap Legend</div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 border border-blue-300" />
              <span>School Service Catchment (&le; {schoolThresholdKm} km)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-red-500/50 border border-red-600" />
              <span>Critical Gap (&gt; 2.0x threshold)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-orange-500/50 border border-orange-600" />
              <span>High Gap (1.5x - 2.0x threshold)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-amber-500/50 border border-amber-600" />
              <span>Moderate Gap (1.0x - 1.5x threshold)</span>
            </div>
            <div className="border-t pt-1 mt-1 text-[10px] text-slate-500">
              🏘️ Village Habitation | 🏫 Public School
            </div>
          </div>
        </div>

        {/* Filters and Underserved Areas Detailed Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden space-y-3">
          <div className="p-4 border-b dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Detected Underserved Infrastructure Gaps ({filteredUnderservedAreas.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Detailed territorial sectors and villages exceeding policy distance thresholds.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={issueFilter}
                onChange={(e) => setIssueFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
              >
                <option value="All">All Deprivations</option>
                <option value="School_Gap">School Gaps Only</option>
                <option value="Road_Isolation">Road Isolation Only</option>
                <option value="Dual_Deprivation">Dual Deprivation (Both)</option>
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
              >
                <option value="All">All Severities</option>
                <option value="Critical">Critical (&gt; 2.0x)</option>
                <option value="High">High (1.5x - 2.0x)</option>
                <option value="Moderate">Moderate (1.0x - 1.5x)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 font-semibold text-slate-600 dark:text-slate-300 uppercase border-b dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Area Name / ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Nearest School (d_geo)</th>
                  <th className="py-2.5 px-3">Road Travel (d_network)</th>
                  <th className="py-2.5 px-3">Nearest Road</th>
                  <th className="py-2.5 px-3 text-center">Severity</th>
                  <th className="py-2.5 px-3 text-right">Population Affected</th>
                  <th className="py-2.5 px-3">Primary Diagnosis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredUnderservedAreas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No underserved gaps detected with current filter and threshold parameters.
                    </td>
                  </tr>
                ) : (
                  filteredUnderservedAreas.map((area) => (
                    <tr key={area.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">{area.name}</div>
                        {area.ward && <div className="text-[10px] text-slate-400">{area.ward}</div>}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {area.areaType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {area.nearestSchool ? (
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {area.nearestSchool.geographicDistanceKm.toFixed(1)} km
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate max-w-[140px]">
                              {area.nearestSchool.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-red-600 font-semibold">No facility ({area.schoolCoverageStatus})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {area.nearestSchool?.networkDistanceKm != null ? (
                          <div className="text-purple-600 dark:text-purple-400 font-bold">
                            {area.nearestSchool.networkDistanceKm} km
                            {area.nearestSchool.circuityFactor && (
                              <span className="text-[10px] text-slate-400 block font-normal">
                                ({area.nearestSchool.circuityFactor}x circuity)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">Geodesic buffer only</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {area.nearestRoad ? (
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {area.nearestRoad.geographicDistanceKm.toFixed(1)} km
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">
                              {area.nearestRoad.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-red-600 font-semibold">No facility ({area.roadCoverageStatus})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSeverityBadgeClass(
                            area.overallSeverity
                          )}`}
                        >
                          {area.overallSeverity} ({area.distanceToThresholdRatio}x)
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        {area.populationAffected > 0
                          ? area.populationAffected.toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-600 dark:text-slate-400">
                        {area.primaryIssue === 'Dual_Deprivation' && (
                          <span className="text-red-600 font-semibold">🚨 Lacks School & Road Access</span>
                        )}
                        {area.primaryIssue === 'School_Gap' && (
                          <span className="text-amber-600 font-medium">🏫 Exceeds School Threshold</span>
                        )}
                        {area.primaryIssue === 'Road_Isolation' && (
                          <span className="text-purple-600 font-medium">🛣️ Remote from All-Weather Road</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Methodology Notes & Policy Guidelines Box */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-400 space-y-2">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <span>ℹ️</span>
            <span>Spatial Methodology & Distinction Between Distance Metrics</span>
          </div>
          <p className="leading-relaxed">
            <strong>Geographic (Straight-Line) Distance:</strong> Calculated using the Haversine formula across Earth&apos;s surface. Used exclusively to construct radial service catchment buffers around facilities.
          </p>
          <p className="leading-relaxed">
            <strong>Network Road Travel Distance:</strong> Evaluated using Dijkstra&apos;s algorithm on the digitized Panchayat road network. In rural environments, network road travel distance is typically 1.2&times; to 1.6&times; longer than straight-line distance due to winding agrarian roads, water bodies, and elevation contours. Straight-line distance does <em>not</em> represent actual walking distance.
          </p>
          <p className="text-[11px] text-slate-500 pt-1 border-t dark:border-slate-700">
            <strong>Policy Grounding:</strong> Right to Education (RTE) Act suggests primary schools within 1 km and upper primary within 3 km. Pradhan Mantri Gram Sadak Yojana (PMGSY) targets all-weather road connectivity within 500m to 1km of all rural habitations.
          </p>
        </div>
      </div>
    </div>
  );
}

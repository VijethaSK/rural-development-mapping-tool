import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import {
  HeatmapPoint,
  ComplaintFilterOptions,
  ComplaintCluster,
  ComplaintAnalyticsSummary,
  ComplaintHeatmapResult,
  ComplaintDetail
} from '../types/complaint';
import { api } from '../api/client';
import HeatmapOverlay from '../components/HeatmapOverlay';
import ClusterInspectionModal from '../components/ClusterInspectionModal';

// Custom cluster marker
const createClusterMarkerIcon = (count: number, criticalCount: number) => {
  const isHighUrgency = criticalCount > 0;
  const bg = isHighUrgency ? '#dc2626' : '#9333ea';
  const size = Math.min(48, Math.max(32, 28 + count * 3));

  return L.divIcon({
    className: 'custom-cluster-badge',
    html: `<div style="background-color: ${bg}; width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); color: white; cursor: pointer;">
      <span style="font-weight: 800; font-size: ${size > 36 ? '13px' : '11px'}; line-height: 1;">${count}</span>
      ${isHighUrgency ? '<span style="font-size: 8px; font-weight: bold; text-transform: uppercase;">Crit</span>' : ''}
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

export default function ComplaintHeatmapPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [infraFilter, setInfraFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');

  // Layer Toggles
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showClusters, setShowClusters] = useState<boolean>(true);

  // Data
  const [summary, setSummary] = useState<ComplaintAnalyticsSummary | null>(null);
  const [heatmapResult, setHeatmapResult] = useState<ComplaintHeatmapResult | null>(null);

  // Modal inspection
  const [inspectingCluster, setInspectingCluster] = useState<ComplaintCluster | null>(null);
  const [inspectingComplaints, setInspectingComplaints] = useState<ComplaintDetail[]>([]);
  const [loadingCluster, setLoadingCluster] = useState<boolean>(false);

  // Fetch summary and heatmap data
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    // Calculate date range from preset
    let startDate: string | undefined;
    const now = new Date();
    if (dateFilter === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (dateFilter === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (dateFilter === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    }

    const queryParams = new URLSearchParams();
    if (startDate) queryParams.set('startDate', startDate);
    if (categoryFilter !== 'All') queryParams.set('category', categoryFilter);
    if (infraFilter !== 'All') queryParams.set('infrastructureType', infraFilter);
    if (statusFilter !== 'All') queryParams.set('status', statusFilter);
    if (priorityFilter !== 'All') queryParams.set('priority', priorityFilter);

    const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';

    try {
      const [sumRes, heatRes] = await Promise.all([
        api<{ data: ComplaintAnalyticsSummary }>(`/api/complaints/analytics/summary${qs}`),
        api<{ data: ComplaintHeatmapResult }>(`/api/complaints/analytics/heatmap${qs}`),
      ]);

      setSummary(sumRes.data);
      setHeatmapResult(heatRes.data);
    } catch (err: any) {
      console.error('Failed to load complaint analytics:', err);
      setError(err.message || 'Could not fetch complaint analytics data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateFilter, categoryFilter, infraFilter, statusFilter, priorityFilter]);

  // Inspect Cluster click
  const handleInspectCluster = async (cluster: ComplaintCluster) => {
    setInspectingCluster(cluster);
    setLoadingCluster(true);
    try {
      const res = await api<{ data: ComplaintDetail[] }>('/api/complaints/analytics/inspect', {
        method: 'POST',
        body: JSON.stringify({ complaintIds: cluster.complaintIds }),
      });
      setInspectingComplaints(res.data || []);
    } catch (err: any) {
      alert('Failed to inspect cluster: ' + err.message);
    } finally {
      setLoadingCluster(false);
    }
  };

  const mapCenter = useMemo(() => {
    if (heatmapResult && heatmapResult.clusters.length > 0) {
      return [heatmapResult.clusters[0].center.lat, heatmapResult.clusters[0].center.lng] as [number, number];
    }
    return [12.9430, 77.7440] as [number, number];
  }, [heatmapResult]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300">
              Objective 4 Analytics
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Dynamic Kernel Density Estimation (KDE) Heatmap
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            Complaint Analytics & Heatmap
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Visualize citizen grievance intensity, cluster hotspots, and infrastructure defect concentrations
            dynamically from verified GPS locations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition shadow-sm flex items-center gap-2"
          >
            <span>🔄</span>
            <span>{loading ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-xl">
          ⚠️ {error}
        </div>
      )}

      {/* KPI Dashboard Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-[11px] font-semibold uppercase text-slate-500">Total Grievances</div>
            <div className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">
              {summary.totalComplaints}
            </div>
            <div className="text-[10px] text-slate-400">All registered reports</div>
          </div>

          <div className="p-4 bg-amber-50/70 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/40 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-amber-700 dark:text-amber-400">
              Open Grievances
            </div>
            <div className="text-2xl font-bold mt-1 text-amber-800 dark:text-amber-300">
              {summary.openComplaints}
            </div>
            <div className="text-[10px] text-amber-600/80">Pending action</div>
          </div>

          <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/40 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
              Closed
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-800 dark:text-emerald-300">
              {summary.resolvedComplaints}
            </div>
            <div className="text-[10px] text-emerald-600/80">Completed maintenance</div>
          </div>

          <div className="p-4 bg-red-50/70 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/40 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-red-700 dark:text-red-400">
              Critical Urgency
            </div>
            <div className="text-2xl font-bold mt-1 text-red-800 dark:text-red-300">
              {summary.criticalComplaints}
            </div>
            <div className="text-[10px] text-red-600/80">Hazardous defects</div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="text-[11px] font-semibold uppercase text-slate-500">Most Affected Type</div>
            <div className="text-xl font-bold mt-1 text-blue-600 dark:text-blue-400 truncate">
              {summary.mostAffectedInfrastructureType}
            </div>
            <div className="text-[10px] text-slate-400">Highest defect volume</div>
          </div>

          <div className="p-4 bg-purple-50/70 dark:bg-purple-950/20 rounded-xl border border-purple-200 dark:border-purple-900/40 shadow-sm">
            <div className="text-[11px] font-bold uppercase text-purple-700 dark:text-purple-400">
              Top Concentration
            </div>
            <div className="text-sm font-extrabold mt-1 text-purple-900 dark:text-purple-300 truncate">
              {summary.highestConcentrationArea.name}
            </div>
            <div className="text-[10px] text-purple-600/80">
              {summary.highestConcentrationArea.count} reports in hotspot
            </div>
          </div>
        </div>
      )}

      {/* Multi-Criteria Filter Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b pb-3 dark:border-slate-700">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <span>🔍</span>
            <span>Analytics Filters</span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
                className="accent-rose-600 rounded"
              />
              <span>Heatmap Gradient</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showClusters}
                onChange={(e) => setShowClusters(e.target.checked)}
                className="accent-purple-600 rounded"
              />
              <span>Cluster Pins</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          {/* Date preset */}
          <div>
            <label className="text-slate-500 font-medium block mb-1">Time Horizon</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="text-slate-500 font-medium block mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="All">All Categories</option>
              <option value="Road">Roads</option>
              <option value="School">Schools</option>
              <option value="Healthcare">Healthcare</option>
              <option value="Water">Water Supply</option>
              <option value="Sanitation">Sanitation</option>
              <option value="Electricity">Electricity</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Infrastructure Type */}
          <div>
            <label className="text-slate-500 font-medium block mb-1">Asset Link</label>
            <select
              value={infraFilter}
              onChange={(e) => setInfraFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="All">All Infrastructure</option>
              <option value="Road">Roads</option>
              <option value="School">Schools</option>
              <option value="Healthcare">Healthcare (PHC)</option>
              <option value="WaterFacility">Water Facility</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-slate-500 font-medium block mb-1">Workflow Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="All">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="VERIFIED">Verified</option>
              <option value="CLOSED">Closed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="text-slate-500 font-medium block mb-1">Priority Urgency</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="All">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive Map vs Hotspots & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Heatmap GIS (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="relative h-[520px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md">
            <MapContainer
              center={mapCenter}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              {/* Dynamic Canvas Heatmap Layer */}
              {showHeatmap && heatmapResult && (
                <HeatmapOverlay points={heatmapResult.points} />
              )}

              {/* Interactive Spatial Cluster Pins */}
              {showClusters &&
                heatmapResult?.clusters.map((cluster) => (
                  <Marker
                    key={cluster.clusterId}
                    position={[cluster.center.lat, cluster.center.lng]}
                    icon={createClusterMarkerIcon(cluster.count, cluster.criticalCount)}
                  >
                    <Popup>
                      <div className="p-1 min-w-[200px] text-xs">
                        <div className="font-bold text-slate-900 text-sm">{cluster.name}</div>
                        <div className="text-slate-500 mt-0.5">{cluster.ward}</div>
                        <div className="mt-1.5 space-y-0.5 text-slate-600">
                          <div>Total reports: <strong>{cluster.count}</strong></div>
                          {cluster.criticalCount > 0 && (
                            <div className="text-red-600 font-bold">
                              Critical: {cluster.criticalCount} reports
                            </div>
                          )}
                          <div>Top Category: <strong>{cluster.topCategory}</strong></div>
                        </div>

                        <button
                          onClick={() => handleInspectCluster(cluster)}
                          className="mt-2.5 w-full py-1.5 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-semibold transition"
                        >
                          Inspect Cluster ({cluster.count} reports) →
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>

            {/* Thermal Gradient Legend */}
            <div className="absolute bottom-4 left-3 z-[1000] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5">
              <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">Grievance Density Heat</div>
              <div className="w-36 h-3 rounded-full bg-gradient-to-r from-blue-500 via-green-400 via-yellow-400 to-red-600" />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
              <div className="border-t pt-1 mt-1 text-[10px] text-slate-400">
                Click cluster badges to inspect reports
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Spatial Hotspots & Category Breakdown (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Spatial Hotspots List */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>🔥</span>
                <span>Grievance Hotspots</span>
              </h2>
              <span className="text-xs text-slate-500">
                {heatmapResult?.clusters.length || 0} clusters
              </span>
            </div>

            <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1">
              {!heatmapResult || heatmapResult.clusters.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No complaint hotspots detected for active filters.
                </div>
              ) : (
                heatmapResult.clusters.map((cl) => (
                  <div
                    key={cl.clusterId}
                    onClick={() => handleInspectCluster(cl)}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-purple-400 bg-slate-50/50 dark:bg-slate-800/40 transition cursor-pointer text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {cl.name}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 font-bold text-[10px]">
                        {cl.count} reports
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{cl.ward}</span>
                      <span>•</span>
                      <span>{cl.topCategory}</span>
                      {cl.criticalCount > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-red-600 font-semibold">{cl.criticalCount} Critical</span>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Category Breakdown Card */}
          {summary && (
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>📊</span>
                <span>Category Breakdown</span>
              </h2>

              <div className="space-y-2 text-xs">
                {Object.entries(summary.categoryBreakdown).map(([category, count]) => {
                  const pct = summary.totalComplaints > 0 ? (count / summary.totalComplaints) * 100 : 0;
                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{category}</span>
                        <span className="font-mono text-slate-500">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cluster Inspection Modal */}
      <ClusterInspectionModal
        cluster={inspectingCluster}
        complaints={inspectingComplaints}
        loading={loadingCluster}
        onClose={() => setInspectingCluster(null)}
        onStatusUpdated={fetchData}
      />
    </div>
  );
}

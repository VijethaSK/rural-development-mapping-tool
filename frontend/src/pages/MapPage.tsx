import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { RankedInfrastructure, PriorityLevel } from '../types/priority';
import { HeatmapPoint, ComplaintCluster, ComplaintDetail } from '../types/complaint';
import { UnderservedArea } from '../types/gap';
import { api, apiFetch } from '../api/client';
import { countRoadRecords, filterMappedRoads, getRoadLineCoordinates } from '../utils/roadGeometry';
import HeatmapOverlay from '../components/HeatmapOverlay';
import ScoreExplanationModal from '../components/ScoreExplanationModal';
import ClusterInspectionModal from '../components/ClusterInspectionModal';

// ----------------- TYPE DEFINITIONS -----------------

interface Panchayat {
  _id: string;
  name: string;
  district?: string;
  state?: string;
  wards?: string[];
  centerCoord?: { lat: number; lng: number } | null;
  dataOrigin?: string;
  taluka?: string;
  villages?: string[];
}

interface ComplaintPoint {
  _id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  ward?: string;
  location?: {
    coordinates: [number, number]; // [lng, lat]
    lat?: number;
    lng?: number;
  };
  upvotesCount?: number;
  reporterName?: string;
  createdAt?: string;
}

interface SavedRoute {
  _id: string;
  name: string;
  status: string;
  totalDistanceKm: number;
  estimatedDuration: number | null;
  routingMethod?: 'NETWORK_ROUTE' | 'STRAIGHT_LINE_FALLBACK' | 'LEGACY_UNKNOWN';
  fallbackUsed?: boolean;
  assignedMember?: {
    name: string;
    phone?: string;
  };
  startLocation: {
    coordinates: [number, number];
  };
  orderedStops: Array<{
    stopOrder: number;
    name: string;
    location: {
      coordinates: [number, number];
    };
    priorityScore: number;
    legDistanceMeters?: number;
  }>;
  geometry?: {
    coordinates: [number, number][]; // [[lng, lat], ...]
  };
}

// ----------------- LEAFLET CUSTOM ICONS -----------------

const getPriorityColor = (level: string): string => {
  switch (level) {
    case 'Critical':
      return '#dc2626'; // Red
    case 'High':
      return '#ea580c'; // Orange
    case 'Medium':
      return '#d97706'; // Amber
    case 'Unavailable':
      return '#64748b';
    default:
      return '#16a34a'; // Green
  }
};

const getConditionColor = (condition?: string | null): string => {
  switch (condition?.toLowerCase()) {
    case 'good':
      return '#059669'; // Emerald
    case 'average':
      return '#d97706'; // Amber
    case 'poor':
      return '#ea580c'; // Orange
    case 'bad':
      return '#dc2626'; // Red
    default:
      return '#64748b'; // Slate
  }
};

const createInfraIcon = (type: string, level: string, isHighlighted: boolean = false) => {
  const color = getPriorityColor(level);
  let emoji = '🏛️';
  const t = type.toLowerCase();
  if (t.includes('school')) emoji = '🏫';
  else if (t.includes('health') || t.includes('phc')) emoji = '🏥';
  else if (t.includes('water')) emoji = '💧';
  else if (t.includes('road')) emoji = '🛣️';

  const ringStyle = isHighlighted
    ? `box-shadow: 0 0 0 5px rgba(220, 38, 38, 0.4), 0 4px 10px rgba(0,0,0,0.4);`
    : `box-shadow: 0 2px 6px rgba(0,0,0,0.35);`;

  return L.divIcon({
    className: 'custom-infra-marker',
    html: `<div style="background-color: ${color}; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; ${ringStyle} font-size: 15px; cursor: pointer; transition: transform 0.2s;" class="hover:scale-110">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
};

const createComplaintIcon = (priority: string) => {
  const color =
    priority === 'Critical'
      ? '#dc2626'
      : priority === 'High'
      ? '#ea580c'
      : priority === 'Medium'
      ? '#2563eb'
      : '#7c3aed';

  return L.divIcon({
    className: 'custom-complaint-pin',
    html: `<div style="background-color: ${color}; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35); font-size: 12px; cursor: pointer;">⚠️</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
};

const createClusterIcon = (count: number, hasCritical: boolean) => {
  const bg = hasCritical ? '#dc2626' : '#9333ea';
  const size = Math.min(48, Math.max(32, 28 + Math.log2(count) * 4));

  return L.divIcon({
    className: 'custom-cluster-badge',
    html: `<div style="background-color: ${bg}; width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 0 0 4px rgba(147, 51, 234, 0.25), 0 3px 8px rgba(0,0,0,0.4); color: white; font-weight: 800; font-size: 11px; cursor: pointer;">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const createStopIcon = (sequence: number) => {
  return L.divIcon({
    className: 'custom-route-stop-icon',
    html: `<div style="background-color: #2563eb; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); color: white; font-weight: 900; font-size: 12px;">${sequence}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

const depotIcon = L.divIcon({
  className: 'custom-depot-icon',
  html: `<div style="background-color: #0f172a; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.5); font-size: 15px;">🚩</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// ----------------- MAP CONTROLLER HELPER -----------------

function MapController({
  center,
  zoom,
  onZoomChange,
}: {
  center: [number, number];
  zoom: number;
  onZoomChange?: (z: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom);
  }, [center[0], center[1], zoom]);

  useEffect(() => {
    if (!onZoomChange) return;
    const handleZoom = () => onZoomChange(map.getZoom());
    map.on('zoomend', handleZoom);
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map, onZoomChange]);

  return null;
}

// ----------------- MAIN GIS MAP COMPONENT -----------------

export default function MapPage() {
  // Master Panchayat & Area Info
  const [panchayats, setPanchayats] = useState<Panchayat[]>([]);
  const [selectedPanchayat, setSelectedPanchayat] = useState<Panchayat | null>(null);
  const [selectedWard, setSelectedWard] = useState<string>('All');

  // Layer 1, 2, 3, 6: Infrastructure Data (Ranked with SAW Priority Scores)
  const [rankedAssets, setRankedAssets] = useState<RankedInfrastructure[]>([]);

  // Layer 4: Complaints
  const [complaints, setComplaints] = useState<ComplaintPoint[]>([]);

  // Layer 5: Complaint Heatmap
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);

  // Layer 7: Maintenance Routes
  const [routes, setRoutes] = useState<SavedRoute[]>([]);

  // Layer 8: Underserved Regions (Spatial Gap Analysis)
  const [underservedAreas, setUnderservedAreas] = useState<UnderservedArea[]>([]);

  // UI & Loading States
  const [loading, setLoading] = useState<boolean>(true);
  const [currentZoom, setCurrentZoom] = useState<number>(13);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [roadColorMode, setRoadColorMode] = useState<'priority' | 'condition'>('priority');

  // Selected asset for Inspector Drawer & Modal
  const [inspectedAsset, setInspectedAsset] = useState<RankedInfrastructure | null>(null);
  const [detailModalAsset, setDetailModalAsset] = useState<RankedInfrastructure | null>(null);

  // Selected complaint cluster modal
  const [inspectedCluster, setInspectedCluster] = useState<ComplaintCluster | null>(null);

  // In-Memory Layer Cache to prevent unnecessary repeated fetches
  const cacheRef = useRef<Record<string, any>>({});

  // ----------------- 8 LAYER TOGGLES -----------------
  const [layers, setLayers] = useState({
    roads: true,
    schools: true,
    otherInfra: true,
    complaints: true,
    heatmap: false,
    priorityHighlight: true,
    routes: true,
    underserved: true,
  });

  const toggleLayer = (layerKey: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  // ----------------- FILTER CONTROLS -----------------
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [conditionFilter, setConditionFilter] = useState<string>('All');
  const [complaintStatusFilter, setComplaintStatusFilter] = useState<string>('All');
  const [infraStatusFilter, setInfraStatusFilter] = useState<string>('All');

  // ----------------- DATA FETCHING WITH CACHING -----------------

  const fetchPanchayats = async () => {
    try {
      const res = await apiFetch('/panchayats');
      if (res.ok) {
        const list: Panchayat[] = await res.json();
        setPanchayats(list);
        if (list.length > 0 && !selectedPanchayat) {
          // Prefer the imported source inventory on first load while retaining
          // every Panchayat in the selector, including legacy/demo data.
          const requestedId = new URLSearchParams(window.location.search).get('panchayatId');
          setSelectedPanchayat(
            list.find((item) => item._id === requestedId)
              || list.find((item) => item.dataOrigin === 'SOURCE_EXCEL')
              || list[0]
          );
        }
      }
    } catch (err) {
      console.warn('Could not load Panchayats:', err);
    }
  };

  const fetchCentralMapData = useCallback(async (forceRefresh = false) => {
    const pId = selectedPanchayat?._id;
    const cacheKey = `${pId || 'default'}_${selectedWard}`;

    if (!forceRefresh && cacheRef.current[cacheKey]) {
      const cached = cacheRef.current[cacheKey];
      setRankedAssets(cached.assets || []);
      setComplaints(cached.complaints || []);
      setHeatmapPoints(cached.heatmap || []);
      setRoutes(cached.routes || []);
      setUnderservedAreas(cached.gaps || []);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const pParams = new URLSearchParams();
      if (pId) pParams.append('panchayatId', pId);
      if (selectedWard !== 'All') pParams.append('ward', selectedWard);

      // 1. Fetch Priority Ranked Infrastructure
      const pUrl = `/priorities?${pParams.toString()}`;
      const infraPromise = apiFetch(pUrl)
        .then((r) => r.json())
        .then((data) => (data.items ? data.items : Array.isArray(data) ? data : []))
        .catch(() => []);

      // 2. Fetch Complaints
      const cParams = new URLSearchParams();
      if (pId) cParams.append('panchayatId', pId);
      if (selectedWard !== 'All') cParams.append('ward', selectedWard);
      const complaintsPromise = apiFetch(`/complaints?${cParams.toString()}`)
        .then((r) => r.json())
        .then((data) => data.complaints || [])
        .catch(() => []);

      // 3. Fetch Heatmap Points
      const heatmapPromise = apiFetch(`/complaints/analytics/heatmap?${pParams.toString()}`)
        .then((r) => r.json())
        .then((data) => data.points || [])
        .catch(() => []);

      // 4. Fetch Maintenance Routes
      const routesPromise = apiFetch(`/routes?${pParams.toString()}`)
        .then((r) => r.json())
        .then((data) => (data.success && data.data ? data.data : []))
        .catch(() => []);

      // 5. Fetch Underserved Regions (Spatial Gap Analysis)
      const gapsPromise = apiFetch('/gap-analysis/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          panchayatId: pId,
          schoolThresholdKm: 3.0,
          roadThresholdKm: 1.0,
          gridResolutionKm: 1.0,
          computeNetworkDistance: false,
        }),
      })
        .then((r) => r.json())
        .then((data) => (data.data?.underservedAreas ? data.data.underservedAreas : []))
        .catch(() => []);

      const [assets, comps, heat, rts, gaps] = await Promise.all([
        infraPromise,
        complaintsPromise,
        heatmapPromise,
        routesPromise,
        gapsPromise,
      ]);

      setRankedAssets(assets);
      setComplaints(comps);
      setHeatmapPoints(heat);
      setRoutes(rts);
      setUnderservedAreas(gaps);

      // Save into cache
      cacheRef.current[cacheKey] = {
        assets,
        complaints: comps,
        heatmap: heat,
        routes: rts,
        gaps,
      };
    } catch (err) {
      console.error('Failed to load GIS layer data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedPanchayat?._id, selectedWard]);

  useEffect(() => {
    fetchPanchayats();
  }, []);

  useEffect(() => {
    fetchCentralMapData();
  }, [fetchCentralMapData]);

  // Center coordinate determination
  const mapCenter: [number, number] = useMemo(() => {
    if (selectedPanchayat?.centerCoord) {
      return [selectedPanchayat.centerCoord.lat, selectedPanchayat.centerCoord.lng];
    }
    const coordinates = rankedAssets.map((asset: any) => asset.location?.coordinates).find((coords: any) => Array.isArray(coords) && Number.isFinite(coords[1]) && Number.isFinite(coords[0]));
    return coordinates ? [coordinates[1], coordinates[0]] : [0, 0];
  }, [selectedPanchayat, rankedAssets]);

  // Available Wards
  const availableWards = useMemo(() => {
    if (selectedPanchayat?.wards && selectedPanchayat.wards.length > 0) {
      return selectedPanchayat.wards;
    }
    const wardsSet = new Set<string>();
    rankedAssets.forEach((a) => {
      if (a.ward) wardsSet.add(a.ward);
    });
    return Array.from(wardsSet);
  }, [selectedPanchayat, rankedAssets]);

  // ----------------- FILTERED DATA SETS -----------------

  const filteredAssets = useMemo(() => {
    return rankedAssets.filter((item) => {
      if (typeFilter !== 'All' && item.type.toLowerCase() !== typeFilter.toLowerCase()) {
        return false;
      }
      if (categoryFilter !== 'All' && item.sourceCategory !== categoryFilter) return false;
      if (priorityFilter !== 'All' && item.priorityLevel !== priorityFilter) {
        return false;
      }
      if (conditionFilter !== 'All' && (item.condition || 'Unavailable').toLowerCase() !== conditionFilter.toLowerCase()) {
        return false;
      }
      if (infraStatusFilter !== 'All' && (item.sourceStatus || item.status || '').toLowerCase() !== infraStatusFilter.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [rankedAssets, typeFilter, categoryFilter, priorityFilter, conditionFilter, infraStatusFilter]);

  const sourceCategories = useMemo(() => Array.from(new Set(rankedAssets.map((asset) => asset.sourceCategory).filter(Boolean) as string[])).sort(), [rankedAssets]);
  const unlocatedSourceAssets = useMemo(() => rankedAssets.filter((asset) => asset.dataOrigin === 'SOURCE_EXCEL' && !asset.location?.coordinates), [rankedAssets]);

  // Road records can have approximate Points, but only valid LineStrings are mapped as roads.
  const roadRecordAssets = useMemo(
    () => filteredAssets.filter((asset) => asset.type.toLowerCase() === 'road'),
    [filteredAssets]
  );
  const mappedRoadAssets = useMemo(() => filterMappedRoads(roadRecordAssets), [roadRecordAssets]);
  const roadCounts = useMemo(() => countRoadRecords(roadRecordAssets), [roadRecordAssets]);
  const roadAssets = layers.roads ? mappedRoadAssets : [];

  // Layer 2: Schools
  const schoolAssets = useMemo(() => {
    if (!layers.schools) return [];
    return filteredAssets.filter((a) => a.type.toLowerCase() === 'school');
  }, [filteredAssets, layers.schools]);

  // Layer 3: Other Infrastructure
  const otherAssets = useMemo(() => {
    if (!layers.otherInfra) return [];
    return filteredAssets.filter(
      (a) => a.type.toLowerCase() !== 'road' && a.type.toLowerCase() !== 'school'
    );
  }, [filteredAssets, layers.otherInfra]);

  // Layer 4: Filtered Complaints
  const filteredComplaints = useMemo(() => {
    if (!layers.complaints) return [];
    return complaints.filter((comp) => {
      if (complaintStatusFilter !== 'All') {
        const cleanTarget = complaintStatusFilter.toUpperCase().replace(/\s+/g, '_');
        const cleanActual = comp.status.toUpperCase().replace(/\s+/g, '_');
        if (cleanActual !== cleanTarget) return false;
      }
      return true;
    });
  }, [complaints, layers.complaints, complaintStatusFilter]);

  // ----------------- GRID CLUSTERING ALGORITHM -----------------
  // Automatically groups dense complaints when zoom < 15
  const complaintClusters = useMemo(() => {
    if (currentZoom >= 15 || filteredComplaints.length <= 1) {
      return { clusters: [], singles: filteredComplaints };
    }

    const gridSize = currentZoom <= 12 ? 0.015 : currentZoom === 13 ? 0.008 : 0.004;
    const gridMap = new Map<string, ComplaintPoint[]>();

    filteredComplaints.forEach((comp) => {
      let lat = 0;
      let lng = 0;
      if (comp.location?.coordinates && comp.location.coordinates.length >= 2) {
        lng = comp.location.coordinates[0];
        lat = comp.location.coordinates[1];
      } else if (comp.location?.lat != null && comp.location?.lng != null) {
        lat = comp.location.lat;
        lng = comp.location.lng;
      } else {
        return;
      }

      const gridKey = `${Math.floor(lat / gridSize)}_${Math.floor(lng / gridSize)}`;
      if (!gridMap.has(gridKey)) {
        gridMap.set(gridKey, []);
      }
      gridMap.get(gridKey)!.push(comp);
    });

    const clusters: Array<{
      id: string;
      lat: number;
      lng: number;
      count: number;
      hasCritical: boolean;
      items: ComplaintPoint[];
    }> = [];
    const singles: ComplaintPoint[] = [];

    gridMap.forEach((group, key) => {
      if (group.length === 1) {
        singles.push(group[0]);
      } else {
        let sumLat = 0;
        let sumLng = 0;
        let hasCritical = false;

        group.forEach((item) => {
          const lat = item.location?.coordinates ? item.location.coordinates[1] : item.location!.lat!;
          const lng = item.location?.coordinates ? item.location.coordinates[0] : item.location!.lng!;
          sumLat += lat;
          sumLng += lng;
          if (item.priority === 'Critical') hasCritical = true;
        });

        clusters.push({
          id: key,
          lat: sumLat / group.length,
          lng: sumLng / group.length,
          count: group.length,
          hasCritical,
          items: group,
        });
      }
    });

    return { clusters, singles };
  }, [filteredComplaints, currentZoom]);

  // Quick Preset Handlers
  const applyPreset = (preset: 'all' | 'priority' | 'heatmap' | 'gaps' | 'routes') => {
    if (preset === 'all') {
      setLayers({
        roads: true,
        schools: true,
        otherInfra: true,
        complaints: true,
        heatmap: false,
        priorityHighlight: true,
        routes: true,
        underserved: true,
      });
      setTypeFilter('All');
      setPriorityFilter('All');
    } else if (preset === 'priority') {
      setLayers({
        roads: true,
        schools: true,
        otherInfra: true,
        complaints: false,
        heatmap: false,
        priorityHighlight: true,
        routes: false,
        underserved: false,
      });
      setPriorityFilter('Critical');
    } else if (preset === 'heatmap') {
      setLayers({
        roads: true,
        schools: false,
        otherInfra: false,
        complaints: false,
        heatmap: true,
        priorityHighlight: false,
        routes: false,
        underserved: false,
      });
    } else if (preset === 'gaps') {
      setLayers({
        roads: true,
        schools: true,
        otherInfra: false,
        complaints: false,
        heatmap: false,
        priorityHighlight: false,
        routes: false,
        underserved: true,
      });
    } else if (preset === 'routes') {
      setLayers({
        roads: true,
        schools: false,
        otherInfra: false,
        complaints: false,
        heatmap: false,
        priorityHighlight: true,
        routes: true,
        underserved: false,
      });
    }
  };

  return (
    <div className="relative h-[calc(100vh-76px)] w-full overflow-hidden flex bg-slate-900 font-sans">
      {/* ----------------- SIDEBAR CONTROLS (DESKTOP & TABLET DRAWER) ----------------- */}
      <div
        className={`absolute lg:relative z-[1000] top-0 bottom-0 left-0 transition-all duration-300 ease-in-out flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl lg:shadow-none ${
          isSidebarOpen ? 'w-80 md:w-96 translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 overflow-hidden'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base">🗺️</span>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Central GIS Map
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Interactive Multi-Layer Infrastructure Layer
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchCentralMapData(true)}
              disabled={loading}
              title="Refresh Map Data"
              className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition"
            >
              🔄
            </button>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-1 text-slate-400 hover:text-slate-600 text-lg font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Control Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          {/* Quick Preset Views */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Quick Lens Presets
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => applyPreset('all')}
                className="px-2.5 py-1.5 text-left rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-700 transition truncate"
              >
                🌐 All Layers
              </button>
              <button
                onClick={() => applyPreset('priority')}
                className="px-2.5 py-1.5 text-left rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-700 dark:text-red-300 font-semibold border border-red-200 dark:border-red-800 transition truncate"
              >
                🔴 Priority Focus
              </button>
              <button
                onClick={() => applyPreset('heatmap')}
                className="px-2.5 py-1.5 text-left rounded-xl bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800 transition truncate"
              >
                🔥 Complaint Heatmap
              </button>
              <button
                onClick={() => applyPreset('gaps')}
                className="px-2.5 py-1.5 text-left rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800 transition truncate"
              >
                ⭕ School Gaps
              </button>
              <button
                onClick={() => applyPreset('routes')}
                className="px-2.5 py-1.5 text-left rounded-xl bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 text-sky-700 dark:text-sky-300 font-semibold border border-sky-200 dark:border-sky-800 transition truncate col-span-2"
              >
                🚚 Maintenance Routes Dispatch
              </button>
            </div>
          </div>

          {/* 1. Panchayat & Area (Ward) Selector */}
          <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Panchayat & Ward Jurisdiction
            </label>
            <div className="space-y-2">
              <select
                value={selectedPanchayat?._id || ''}
                onChange={(e) => {
                  const found = panchayats.find((p) => p._id === e.target.value);
                  if (found) {
                    setSelectedPanchayat(found);
                    setSelectedWard('All');
                  }
                }}
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white"
              >
                {panchayats.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <span className="text-slate-500 whitespace-nowrap">Area / Ward:</span>
                <select
                  value={selectedWard}
                  onChange={(e) => setSelectedWard(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-800 dark:text-white"
                >
                  <option value="All">All Areas ({availableWards.length})</option>
                  {availableWards.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>

              {sourceCategories.length > 0 && <div>
                <span className="text-[11px] text-slate-500 block mb-1">Source Dataset Category:</span>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium">
                  <option value="All">All Source Categories</option>
                  {sourceCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>}
            </div>
          </div>

          {/* 2. Supported Layer Toggles (The 8 Layers) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Visual Layers (8 Available)
              </label>
            </div>

            <div className="space-y-1.5">
              {/* Layer 1: Roads */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layers.roads}
                    onChange={() => toggleLayer('roads')}
                    className="rounded accent-blue-600 w-4 h-4"
                  />
                  <span>🛣️ Roads Layer</span>
                </label>
                <span className="flex flex-col items-end px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  <span>{roadCounts.mappedRoads} mapped</span>
                  <span className="font-normal">{roadCounts.roadRecords} road records</span>
                </span>
              </div>

              {/* Layer 2: Schools */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layers.schools}
                    onChange={() => toggleLayer('schools')}
                    className="rounded accent-blue-600 w-4 h-4"
                  />
                  <span>🏫 Schools Layer</span>
                </label>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {schoolAssets.length}
                </span>
              </div>

              {/* Layer 3: Other Infrastructure */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layers.otherInfra}
                    onChange={() => toggleLayer('otherInfra')}
                    className="rounded accent-blue-600 w-4 h-4"
                  />
                  <span>🏛️ Other Facilities</span>
                </label>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {otherAssets.length}
                </span>
              </div>

              {/* Layer 4: Complaints */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layers.complaints}
                    onChange={() => toggleLayer('complaints')}
                    className="rounded accent-purple-600 w-4 h-4"
                  />
                  <span>⚠️ Complaints & Clusters</span>
                </label>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                  {filteredComplaints.length}
                </span>
              </div>

              {/* Layer 5: Complaint Heatmap */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layers.heatmap}
                    onChange={() => toggleLayer('heatmap')}
                    className="rounded accent-purple-600 w-4 h-4"
                  />
                  <span>🔥 Grievance Heatmap</span>
                </label>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                  {heatmapPoints.length} pts
                </span>
              </div>

              {/* Layer 6: Priority Infrastructure */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layers.priorityHighlight}
                    onChange={() => toggleLayer('priorityHighlight')}
                    className="rounded accent-red-600 w-4 h-4"
                  />
                  <span>⚡ Priority Halos</span>
                </label>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                  Active
                </span>
              </div>

              {/* Layer 7: Maintenance Routes */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layers.routes}
                    onChange={() => toggleLayer('routes')}
                    className="rounded accent-sky-600 w-4 h-4"
                  />
                  <span>🚚 Maintenance Routes</span>
                </label>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                  {routes.length}
                </span>
              </div>

              {/* Layer 8: Underserved Regions */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={layers.underserved}
                    onChange={() => toggleLayer('underserved')}
                    className="rounded accent-amber-600 w-4 h-4"
                  />
                  <span>⭕ Underserved Regions</span>
                </label>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                  {underservedAreas.length}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Attribute Filters */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Multi-Attribute Filter Controls
            </label>

            <div className="space-y-2">
              {/* Type */}
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Infrastructure Type:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                >
                  <option value="All">All Types</option>
                  <option value="Road">Roads Only</option>
                  <option value="School">Schools Only</option>
                  <option value="Healthcare">Healthcare Facilities</option>
                  <option value="WaterFacility">Water Facilities</option>
                  <option value="Other">Other Assets</option>
                </select>
              </div>

              {/* Priority */}
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Priority Rating:</span>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                >
                  <option value="All">All Priorities</option>
                  <option value="Critical">🔴 Critical (Score 80–100)</option>
                  <option value="High">🟠 High (Score 60–79)</option>
                  <option value="Medium">🟡 Medium (Score 40–59)</option>
                  <option value="Low">🟢 Low (Score 0–39)</option>
                  <option value="Unavailable">Unavailable (insufficient source data)</option>
                </select>
              </div>

              {unlocatedSourceAssets.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
                <strong>{unlocatedSourceAssets.length} source-derived records have no coordinates.</strong> They remain available here and are not placed on the map or used for spatial analysis.
                <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
                  {unlocatedSourceAssets.filter((asset) => categoryFilter === 'All' || asset.sourceCategory === categoryFilter).map((asset) => <button key={asset._id} onClick={() => setInspectedAsset(asset)} className="block w-full rounded border border-amber-200 bg-white p-2 text-left hover:bg-amber-100">
                    <span className="font-semibold">{asset.name}</span>
                    <span className="block text-slate-600">{asset.sourceCategory} · {asset.sourceStatus || 'Source status unavailable'}</span>
                  </button>)}
                </div>
              </div>}

              {/* Condition */}
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Physical Condition:</span>
                <select
                  value={conditionFilter}
                  onChange={(e) => setConditionFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                >
                  <option value="All">All Conditions</option>
                  <option value="Good">Good (Minor / No defects)</option>
                  <option value="Average">Average (Wear & tear)</option>
                  <option value="Poor">Poor (Major defects)</option>
                  <option value="Bad">Bad (Severe hazard / unusable)</option>
                </select>
              </div>

              {/* Infrastructure Operational Status */}
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Asset Operational Status:</span>
                <select
                  value={infraStatusFilter}
                  onChange={(e) => setInfraStatusFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                >
                  <option value="All">All Asset Statuses</option>
                  <option value="Operational">Operational</option>
                  <option value="Needs_Repair">Needs Repair</option>
                  <option value="Under_Maintenance">Under Maintenance</option>
                  <option value="Decommissioned">Decommissioned</option>
                </select>
              </div>

              {/* Complaint Status */}
              <div>
                <span className="text-[11px] text-slate-500 block mb-1">Complaint State:</span>
                <select
                  value={complaintStatusFilter}
                  onChange={(e) => setComplaintStatusFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
                >
                  <option value="All">All Complaint States</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="PRIORITY_SET">Priority Set</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="CLOSED">Closed</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>

              {/* Road Styling Toggle */}
              <div className="pt-2">
                <span className="text-[11px] text-slate-500 block mb-1">Road Color Encoding:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRoadColorMode('priority')}
                    className={`flex-1 py-1 px-2 rounded-lg font-bold text-[11px] border transition ${
                      roadColorMode === 'priority'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    By Priority
                  </button>
                  <button
                    onClick={() => setRoadColorMode('condition')}
                    className={`flex-1 py-1 px-2 rounded-lg font-bold text-[11px] border transition ${
                      roadColorMode === 'condition'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    By Condition
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------- MAP CANVAS & FLOATING OVERLAYS ----------------- */}
      <div className="relative flex-1 h-full w-full overflow-hidden">
        {/* Toggle Sidebar Button */}
        <button
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          className="absolute top-4 left-4 z-[999] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-2.5 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white font-extrabold flex items-center gap-1.5 hover:scale-105 transition"
        >
          <span>{isSidebarOpen ? '◀' : '▶'}</span>
          <span className="text-xs font-bold">Layers & Filters</span>
        </button>

        {/* Top Summary Status Bar */}
        <div className="hidden md:flex absolute top-4 right-4 z-[999] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            <span>
              Assets: <strong>{filteredAssets.length}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
            <span>
              Critical: <strong>{filteredAssets.filter((a) => a.priorityLevel === 'Critical').length}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
            <span>
              Grievances: <strong>{filteredComplaints.length}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>
              Gaps: <strong>{underservedAreas.length}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-600" />
            <span>
              Routes: <strong>{routes.length}</strong>
            </span>
          </div>
        </div>

        {/* Priority & Map Legend */}
        <div className="absolute bottom-6 right-4 z-[999] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 max-w-[200px]">
          <div className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center justify-between">
            <span>Map Legend</span>
            <span className="text-[10px] text-slate-400 font-normal">Z: {currentZoom}</span>
          </div>

          <div className="space-y-1 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600 border border-white" />
              <span>Critical (80–100)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500 border border-white" />
              <span>High (60–79)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 border border-white" />
              <span>Medium (40–59)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white" />
              <span>Low (0–39)</span>
            </div>
            <div className="pt-1 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-600" />
              <span>Citizen Complaint</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                1
              </span>
              <span>Route Stop</span>
            </div>
          </div>
        </div>

        {/* ----------------- LEAFLET MAP CONTAINER ----------------- */}
        <MapContainer
          center={mapCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          <MapController center={mapCenter} zoom={13} onZoomChange={setCurrentZoom} />

          {/* LAYER 5: COMPLAINT HEATMAP OVERLAY */}
          {layers.heatmap && heatmapPoints.length > 0 && (
            <HeatmapOverlay points={heatmapPoints} radius={32} blur={22} maxIntensity={1.0} />
          )}

          {/* LAYER 8: UNDERSERVED REGIONS (GAP ANALYSIS) */}
          {layers.underserved &&
            underservedAreas.map((gap) => {
              const radius = 800; // 800m visualization circle
              const isHigh = gap.overallSeverity === 'Critical' || gap.overallSeverity === 'High';
              const fillColor = isHigh ? '#dc2626' : '#ea580c';

              return (
                <Circle
                  key={gap.id}
                  center={[gap.center.lat, gap.center.lng]}
                  radius={radius}
                  pathOptions={{
                    color: fillColor,
                    weight: 2,
                    dashArray: '5, 8',
                    fillColor,
                    fillOpacity: 0.22,
                  }}
                >
                  <Popup>
                    <div className="p-1 min-w-[220px] text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-900">{gap.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${
                            isHigh ? 'bg-red-600' : 'bg-amber-600'
                          }`}
                        >
                          {gap.overallSeverity} Gap
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">{gap.notes}</p>
                      <div className="space-y-0.5 text-slate-700">
                        {gap.nearestSchool && (
                          <div>
                            Nearest School:{' '}
                            <strong>
                              {gap.nearestSchool.name} (
                              {gap.nearestSchool.geographicDistanceKm.toFixed(1)} km vs{' '}
                              {gap.nearestSchool.thresholdKm} km limit)
                            </strong>
                          </div>
                        )}
                        <div>
                          Population Affected:{' '}
                          <strong>{gap.populationAffected.toLocaleString()} citizens</strong>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Circle>
              );
            })}

          {/* LAYER 1: ROADS (POLYLINES) */}
          {roadAssets.map((road) => {
            const rawCoords = getRoadLineCoordinates(road);
            if (!rawCoords) return null;
            const latLngs: [number, number][] = rawCoords.map(([lng, lat]) => [lat, lng]);

            const color =
              roadColorMode === 'priority'
                ? getPriorityColor(road.priorityLevel)
                : getConditionColor(road.condition);

            const weight =
              road.priorityLevel === 'Critical'
                ? 6.5
                : road.priorityLevel === 'High'
                ? 5.5
                : road.priorityLevel === 'Medium'
                ? 4.5
                : 3.5;

            return (
              <Polyline
                key={road._id}
                positions={latLngs}
                pathOptions={{
                  color,
                  weight,
                  opacity: 0.85,
                }}
                eventHandlers={{
                  click: () => setInspectedAsset(road),
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[240px] text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-sm text-slate-900">{road.name}</span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-extrabold text-white"
                        style={{ backgroundColor: getPriorityColor(road.priorityLevel) }}
                      >
                        {road.priorityLevel}
                      </span>
                    </div>

                    <div className="space-y-1 text-slate-600 text-[11px]">
                      <div>
                        Type: <strong className="text-slate-800">Road ({road.trafficLevel || 'Standard'} Traffic)</strong>
                      </div>
                      <div>
                        Condition: <strong className="text-slate-800">{road.condition}</strong>
                      </div>
                      <div>
                        Priority Score:{' '}
                        <strong className="text-blue-700">{road.priorityScore == null ? 'Unavailable' : `${road.priorityScore.toFixed(1)} / 100`}</strong>
                      </div>
                      <div>
                        Complaints: <strong className="text-slate-800">{road.complaintsCount} active</strong>
                      </div>
                      <div>
                        Population Served:{' '}
                        <strong className="text-slate-800">{road.populationServed?.toLocaleString() ?? 'Unavailable'}</strong>
                      </div>
                      {road.lastMaintenanceDate && (
                        <div>
                          Last Maintenance:{' '}
                          <strong className="text-slate-800">
                            {new Date(road.lastMaintenanceDate).toLocaleDateString()}
                          </strong>
                        </div>
                      )}
                      <div>
                        Estimated Repair Cost:{' '}
                        <strong className="text-emerald-700">
                          ₹{' '}
                          {(road.estimatedRepairCost || road.estimatedMaintenanceCost || 0).toLocaleString()}
                        </strong>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setInspectedAsset(road);
                        setDetailModalAsset(road);
                      }}
                      className="w-full mt-2 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"
                    >
                      <span>View Details & Score Analysis →</span>
                    </button>
                  </div>
                </Popup>
              </Polyline>
            );
          })}

          {/* LAYER 2: SCHOOLS */}
          {schoolAssets.map((school) => {
            let lat: number | undefined;
            let lng: number | undefined;

            if (school.location?.coordinates && school.location.coordinates.length >= 2) {
              lng = school.location.coordinates[0];
              lat = school.location.coordinates[1];
            } else if (school.location?.lat != null && school.location?.lng != null) {
              lat = school.location.lat;
              lng = school.location.lng;
            }

            if (lat == null || lng == null) return null;

            const isHighlighted = layers.priorityHighlight && (school.priorityLevel === 'Critical' || school.priorityLevel === 'High');

            return (
              <Marker
                key={school._id}
                position={[lat, lng]}
                icon={createInfraIcon(school.type, school.priorityLevel, isHighlighted)}
                eventHandlers={{
                  click: () => setInspectedAsset(school),
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[240px] text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-sm text-slate-900">{school.name}</span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-extrabold text-white"
                        style={{ backgroundColor: getPriorityColor(school.priorityLevel) }}
                      >
                        {school.priorityLevel}
                      </span>
                    </div>

                    <div className="space-y-1 text-slate-600 text-[11px]">
                      <div>
                        Type: <strong className="text-slate-800">School</strong>
                      </div>
                      <div>
                        Condition: <strong className="text-slate-800">{school.condition}</strong>
                      </div>
                      <div>
                        Students Enrolled:{' '}
                        <strong className="text-slate-800">{school.studentCount || 'N/A'}</strong>
                      </div>
                      <div>
                        Priority Score:{' '}
                        <strong className="text-blue-700">{school.priorityScore == null ? 'Unavailable' : `${school.priorityScore.toFixed(1)} / 100`}</strong>
                      </div>
                      <div>
                        Complaints: <strong className="text-slate-800">{school.complaintsCount}</strong>
                      </div>
                      <div>
                        Population Served:{' '}
                        <strong className="text-slate-800">{school.populationServed?.toLocaleString() ?? 'Unavailable'}</strong>
                      </div>
                      <div>
                        Estimated Cost:{' '}
                        <strong className="text-emerald-700">
                          ₹{' '}
                          {(school.estimatedRepairCost || school.estimatedMaintenanceCost || 0).toLocaleString()}
                        </strong>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setInspectedAsset(school);
                        setDetailModalAsset(school);
                      }}
                      className="w-full mt-2 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"
                    >
                      <span>View Details & Score Analysis →</span>
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* LAYER 3: OTHER INFRASTRUCTURE */}
          {otherAssets.map((asset) => {
            let lat: number | undefined;
            let lng: number | undefined;

            if (asset.location?.coordinates && asset.location.coordinates.length >= 2) {
              lng = asset.location.coordinates[0];
              lat = asset.location.coordinates[1];
            } else if (asset.location?.lat != null && asset.location?.lng != null) {
              lat = asset.location.lat;
              lng = asset.location.lng;
            }

            if (lat == null || lng == null) return null;

            const isHighlighted = layers.priorityHighlight && (asset.priorityLevel === 'Critical' || asset.priorityLevel === 'High');

            return (
              <Marker
                key={asset._id}
                position={[lat, lng]}
                icon={createInfraIcon(asset.type, asset.priorityLevel, isHighlighted)}
                eventHandlers={{
                  click: () => setInspectedAsset(asset),
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[240px] text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-sm text-slate-900">{asset.name}</span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-extrabold text-white"
                        style={{ backgroundColor: getPriorityColor(asset.priorityLevel) }}
                      >
                        {asset.priorityLevel}
                      </span>
                    </div>

                    <div className="space-y-1 text-slate-600 text-[11px]">
                      <div>
                        Type: <strong className="text-slate-800">{asset.type}</strong>
                      </div>
                      <div>
                        Condition: <strong className="text-slate-800">{asset.condition}</strong>
                      </div>
                      <div>
                        Priority Score:{' '}
                        <strong className="text-blue-700">{asset.priorityScore == null ? 'Unavailable' : `${asset.priorityScore.toFixed(1)} / 100`}</strong>
                      </div>
                      <div>
                        Complaints: <strong className="text-slate-800">{asset.complaintsCount}</strong>
                      </div>
                      <div>
                        Population Served:{' '}
                        <strong className="text-slate-800">{asset.populationServed?.toLocaleString() ?? 'Unavailable'}</strong>
                      </div>
                      <div>
                        Estimated Cost:{' '}
                        <strong className="text-emerald-700">
                          ₹{' '}
                          {(asset.estimatedRepairCost || asset.estimatedMaintenanceCost || 0).toLocaleString()}
                        </strong>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setInspectedAsset(asset);
                        setDetailModalAsset(asset);
                      }}
                      className="w-full mt-2 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"
                    >
                      <span>View Details & Score Analysis →</span>
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* LAYER 4: COMPLAINTS (CLUSTERS & SINGLES) */}
          {complaintClusters.clusters.map((cluster) => (
            <Marker
              key={`cluster-${cluster.id}`}
              position={[cluster.lat, cluster.lng]}
              icon={createClusterIcon(cluster.count, cluster.hasCritical)}
            >
              <Popup>
                <div className="p-1 min-w-[200px] text-xs space-y-2">
                  <div className="font-extrabold text-slate-900 flex items-center justify-between">
                    <span>⚠️ Complaint Cluster</span>
                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">
                      {cluster.count} Reports
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    {cluster.items.slice(0, 5).map((c) => (
                      <div key={c._id} className="p-1.5 bg-slate-50 rounded border text-[11px]">
                        <span className="font-bold text-slate-800 block truncate">{c.title}</span>
                        <span className="text-slate-500 text-[10px]">
                          {c.category} • {c.priority} • {c.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    ))}
                    {cluster.items.length > 5 && (
                      <div className="text-[10px] text-slate-400 italic">
                        + {cluster.items.length - 5} more reports
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {complaintClusters.singles.map((comp) => {
            const lat = comp.location?.coordinates ? comp.location.coordinates[1] : comp.location?.lat;
            const lng = comp.location?.coordinates ? comp.location.coordinates[0] : comp.location?.lng;
            if (lat == null || lng == null) return null;

            return (
              <Marker key={`single-${comp._id}`} position={[lat, lng]} icon={createComplaintIcon(comp.priority)}>
                <Popup>
                  <div className="p-1 min-w-[220px] text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-black text-slate-900 truncate">{comp.title}</span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: getPriorityColor(comp.priority) }}
                      >
                        {comp.priority}
                      </span>
                    </div>
                    <p className="text-slate-700 text-[11px] leading-snug">{comp.description}</p>
                    <div className="text-[10px] text-slate-500 space-y-0.5">
                      <div>Category: <strong>{comp.category}</strong></div>
                      <div>Status: <strong>{comp.status.replace(/_/g, ' ')}</strong></div>
                      <div>Civic Backing: <strong>{comp.upvotesCount || 0} votes</strong></div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* LAYER 7: MAINTENANCE ROUTES */}
          {layers.routes &&
            routes.map((route) => {
              const polylineCoords: [number, number][] =
                route.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];

              return (
                <React.Fragment key={route._id}>
                  {/* Route Polyline Track */}
                  {polylineCoords.length > 0 && (
                    <Polyline
                      positions={polylineCoords}
                      pathOptions={{
                            color: route.fallbackUsed ? '#d97706' : '#0284c7',
                        weight: 4.5,
                            dashArray: route.fallbackUsed ? '8, 8' : '8, 6',
                        opacity: 0.9,
                      }}
                    >
                      <Popup>
                        <div className="p-1 min-w-[200px] text-xs space-y-1">
                          <strong className="text-slate-900 block font-bold">{route.name}</strong>
                          <div className="text-slate-600">
                            Distance: <strong>{route.totalDistanceKm} km</strong>
                          </div>
                          <div className="text-slate-600">
                            Est. Duration: <strong>{route.estimatedDuration == null ? 'Not available' : `${route.estimatedDuration} mins`}</strong>
                          </div>
                          <div className="text-slate-600">Routing: <strong>{route.routingMethod || 'LEGACY_UNKNOWN'}</strong>{route.fallbackUsed && ' (straight-line; not road distance)'}</div>
                          <div className="text-slate-600">
                            Officer: <strong>{route.assignedMember?.name || 'Assigned Crew'}</strong>
                          </div>
                          <div className="text-slate-600">
                            Stops: <strong>{route.orderedStops?.length || 0} stops</strong>
                          </div>
                        </div>
                      </Popup>
                    </Polyline>
                  )}

                  {/* Start Depot Marker */}
                  {route.startLocation?.coordinates && (
                    <Marker
                      position={[route.startLocation.coordinates[1], route.startLocation.coordinates[0]]}
                      icon={depotIcon}
                    >
                      <Popup>
                        <div className="p-1 text-xs">
                          <strong>🚩 Route Starting Depot</strong>
                          <p>{route.name}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Numbered Stops */}
                  {route.orderedStops?.map((stop) => {
                    if (!stop.location?.coordinates) return null;
                    return (
                      <Marker
                        key={`stop-${route._id}-${stop.stopOrder}`}
                        position={[stop.location.coordinates[1], stop.location.coordinates[0]]}
                        icon={createStopIcon(stop.stopOrder)}
                      >
                        <Popup>
                          <div className="p-1 text-xs space-y-1">
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">
                              Stop #{stop.stopOrder}
                            </span>
                            <div className="font-extrabold text-slate-900 mt-1">{stop.name}</div>
                            <div>
                              Priority Score: <strong>{stop.priorityScore}</strong>
                            </div>
                            {stop.legDistanceMeters != null && (
                              <div>
                                Leg Distance: <strong>{(stop.legDistanceMeters / 1000).toFixed(1)} km</strong>
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
                </React.Fragment>
              );
            })}
        </MapContainer>

        {/* ----------------- CLICKED INFRASTRUCTURE INSPECTOR (DRAWER) ----------------- */}
        {inspectedAsset && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[1000] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 animate-fade-in text-xs max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="space-y-0.5">
                <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                  {inspectedAsset.type} Infrastructure
                </span>
                <h3 className="text-base font-black text-slate-900 dark:text-white leading-snug">
                  {inspectedAsset.name}
                </h3>
              </div>

              <button
                onClick={() => setInspectedAsset(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">Priority Score</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                    {inspectedAsset.priorityScore == null ? 'Unavailable' : inspectedAsset.priorityScore.toFixed(1)}
                  </span>
                  <span className="text-[10px] text-slate-400">/ 100</span>
                </div>
                <span
                  className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold text-white"
                  style={{ backgroundColor: getPriorityColor(inspectedAsset.priorityLevel) }}
                >
                  {inspectedAsset.priorityLevel}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">Condition & Status</span>
                <div className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 text-xs truncate">
                  {inspectedAsset.sourceStatus || inspectedAsset.condition || 'Not provided in source'}
                </div>
                <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {inspectedAsset.status || 'Application status unavailable'}
                </span>
              </div>
            </div>

            {/* Detailed Properties Table */}
            <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span>Active Complaints:</span>
                <strong className="text-slate-900 dark:text-white">
                  {inspectedAsset.complaintsCount == null ? 'No source complaint history' : `${inspectedAsset.complaintsCount} grievance(s)`}
                </strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span>Population Served:</span>
                <strong className="text-slate-900 dark:text-white">
                  {inspectedAsset.populationServed == null ? 'Not provided in source' : `${inspectedAsset.populationServed.toLocaleString()} citizens`}
                </strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span>Estimated Repair Cost:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                  {(inspectedAsset.estimatedRepairCost ?? inspectedAsset.estimatedMaintenanceCost) == null ? 'Not provided in source' : `₹ ${(inspectedAsset.estimatedRepairCost ?? inspectedAsset.estimatedMaintenanceCost)!.toLocaleString()}`}
                </strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span>Last Maintenance Date:</span>
                <strong className="text-slate-900 dark:text-white">
                  {inspectedAsset.lastMaintenanceDate || inspectedAsset.lastRepairDate
                    ? new Date(inspectedAsset.lastMaintenanceDate || inspectedAsset.lastRepairDate!).toLocaleDateString()
                    : 'Pending recorded service'}
                </strong>
              </div>
              {inspectedAsset.ward && (
                <div className="flex justify-between py-1">
                  <span>Location Ward:</span>
                  <strong className="text-slate-900 dark:text-white">
                    {inspectedAsset.ward} {inspectedAsset.village ? `• ${inspectedAsset.village}` : ''}
                  </strong>
                </div>
              )}
            </div>

            {/* View Details Action Button */}
            <button
              onClick={() => setDetailModalAsset(inspectedAsset)}
              disabled={inspectedAsset.scoringStatus === 'UNAVAILABLE'}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-2xl font-bold transition flex items-center justify-center gap-1.5 shadow-md"
            >
              <span>{inspectedAsset.scoringStatus === 'UNAVAILABLE' ? 'Priority score unavailable from source data' : '🔬 View Complete SAW Score Analysis'}</span>
              {inspectedAsset.scoringStatus !== 'UNAVAILABLE' && <span>→</span>}
            </button>
          </div>
        )}
      </div>

      {/* ----------------- SCORE EXPLANATION MODAL ----------------- */}
      <ScoreExplanationModal
        asset={detailModalAsset}
        onClose={() => setDetailModalAsset(null)}
      />

      {/* ----------------- CLUSTER INSPECTION MODAL ----------------- */}
      <ClusterInspectionModal
        cluster={inspectedCluster}
        complaints={[]}
        loading={false}
        onClose={() => setInspectedCluster(null)}
      />
    </div>
  );
}

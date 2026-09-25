import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { MapFeatureItem, ComplaintMapItem, GapSummaryItem } from '../../../types/adminDashboard';
import HeatmapOverlay from '../../HeatmapOverlay';
import { HeatmapPoint } from '../../../types/complaint';

interface Props {
  infrastructure: MapFeatureItem[];
  complaints: ComplaintMapItem[];
  topGaps: GapSummaryItem[];
}

// Custom icons based on priority level
const createInfraIcon = (type: string, priorityLevel: string) => {
  const bg =
    priorityLevel === 'Critical'
      ? '#dc2626'
      : priorityLevel === 'High'
      ? '#ea580c'
      : priorityLevel === 'Medium'
      ? '#2563eb'
      : '#64748b';

  const emoji = type === 'Road' ? '🛣️' : type === 'School' ? '🏫' : type === 'WaterFacility' ? '💧' : '🏥';

  return L.divIcon({
    className: 'custom-infra-marker',
    html: `<div style="background-color: ${bg}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35); font-size: 14px; cursor: pointer;">
      ${emoji}
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const complaintIcon = L.divIcon({
  className: 'custom-complaint-marker',
  html: `<div style="background-color: #ef4444; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); font-size: 12px; cursor: pointer; color: white;">
    ⚠️
  </div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -13]
});

export function MapIntelligenceSection({ infrastructure, complaints, topGaps }: Props) {
  const [showInfra, setShowInfra] = useState<boolean>(true);
  const [showComplaints, setShowComplaints] = useState<boolean>(true);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showGaps, setShowGaps] = useState<boolean>(true);
  const [priorityFilter, setPriorityFilter] = useState<string>('All');

  // Compute map center from available features or fallback to Panchayat coordinates (12.9489, 77.7479)
  const center = useMemo<[number, number]>(() => {
    for (const item of infrastructure) {
      if (item.location?.coordinates) {
        return [item.location.coordinates[1], item.location.coordinates[0]];
      }
    }
    return [12.9489, 77.7479];
  }, [infrastructure]);

  // Convert complaints to HeatmapPoints
  const heatmapPoints = useMemo<HeatmapPoint[]>(() => {
    return complaints
      .filter((c) => c.location?.coordinates)
      .map((c) => [
        c.location!.coordinates[1],
        c.location!.coordinates[0],
        c.priority === 'Critical' ? 1.0 : c.priority === 'High' ? 0.75 : 0.5
      ] as HeatmapPoint);
  }, [complaints]);

  // Filtered infrastructure
  const filteredInfra = useMemo(() => {
    if (priorityFilter === 'All') return infrastructure;
    return infrastructure.filter((item) => item.priorityLevel === priorityFilter);
  }, [infrastructure, priorityFilter]);

  return (
    <div className="space-y-3" id="section-map">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>🗺️</span> Section 3: GIS Spatial Intelligence Map
          </h2>
          <p className="text-xs text-slate-500">
            Answers: <em>"Where are the problems?"</em> — Visualizes assets by priority, citizen complaint clusters, and underserved zones.
          </p>
        </div>

        {/* Layer Toggles */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showInfra}
              onChange={(e) => setShowInfra(e.target.checked)}
              className="accent-blue-600 rounded"
            />
            <span>Assets ({filteredInfra.length})</span>
          </label>

          <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showComplaints}
              onChange={(e) => setShowComplaints(e.target.checked)}
              className="accent-red-600 rounded"
            />
            <span>Complaints ({complaints.length})</span>
          </label>

          <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
              className="accent-purple-600 rounded"
            />
            <span>Heatmap</span>
          </label>

          <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showGaps}
              onChange={(e) => setShowGaps(e.target.checked)}
              className="accent-emerald-600 rounded"
            />
            <span>Gap Alerts ({topGaps.length})</span>
          </label>
        </div>
      </div>

      {/* Map Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div style={{ height: '480px', width: '100%' }}>
          <MapContainer
            center={center}
            zoom={14}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Heatmap Overlay */}
            {showHeatmap && heatmapPoints.length > 0 && (
              <HeatmapOverlay points={heatmapPoints} radius={32} blur={20} />
            )}

            {/* Infrastructure Markers */}
            {showInfra &&
              filteredInfra.map((item) => {
                if (item.location?.coordinates) {
                  const lat = item.location.coordinates[1];
                  const lng = item.location.coordinates[0];
                  return (
                    <Marker
                      key={`infra-${item.id}`}
                      position={[lat, lng]}
                      icon={createInfraIcon(item.type, item.priorityLevel)}
                    >
                      <Popup>
                        <div className="p-1 space-y-1 text-xs">
                          <span className="font-bold text-slate-900 block text-sm">{item.name}</span>
                          <span className="text-slate-500 block">
                            Type: <strong>{item.type}</strong> • Ward: <strong>{item.ward}</strong>
                          </span>
                          <span className="text-slate-600 block">
                            Condition: <strong>{item.condition}</strong>
                          </span>
                          <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-bold text-red-600">
                              Priority: {item.priorityScore == null ? 'Unavailable' : `${item.priorityLevel} (${item.priorityScore})`}
                            </span>
                            <span className="font-semibold text-slate-700">
                              {item.estimatedCost == null ? 'Cost unavailable' : `₹${item.estimatedCost.toLocaleString('en-IN')}`}
                            </span>
                          </div>
                          {(item.complaintsCount ?? 0) > 0 && (
                            <span className="text-red-600 font-semibold block text-[11px]">
                              🚨 {item.complaintsCount} active complaints
                            </span>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                }

                if (item.lineGeometry?.coordinates) {
                  const positions: [number, number][] = item.lineGeometry.coordinates.map((c) => [c[1], c[0]]);
                  const strokeColor =
                    item.priorityLevel === 'Critical'
                      ? '#dc2626'
                      : item.priorityLevel === 'High'
                      ? '#ea580c'
                      : '#2563eb';

                  return (
                    <Polyline
                      key={`infra-line-${item.id}`}
                      positions={positions}
                      color={strokeColor}
                      weight={5}
                      opacity={0.85}
                    >
                      <Popup>
                        <div className="p-1 text-xs">
                          <span className="font-bold text-slate-900 block">{item.name}</span>
                          <span className="text-slate-500 block">Road Segment • Condition: {item.condition}</span>
                          <span className="font-bold text-red-600 block mt-1">Priority: {item.priorityScore}/100</span>
                        </div>
                      </Popup>
                    </Polyline>
                  );
                }
                return null;
              })}

            {/* Complaint Pins */}
            {showComplaints &&
              complaints.map((c) => {
                if (!c.location?.coordinates) return null;
                const lat = c.location.coordinates[1];
                const lng = c.location.coordinates[0];
                return (
                  <Marker key={`comp-${c.id}`} position={[lat, lng]} icon={complaintIcon}>
                    <Popup>
                      <div className="p-1 text-xs space-y-1">
                        <span className="text-red-600 font-bold block text-xs uppercase">
                          {c.priority} Grievance
                        </span>
                        <span className="font-bold text-slate-900 block">{c.title}</span>
                        <span className="text-slate-500 block">
                          Category: <strong>{c.category}</strong> • Status: <strong>{c.status}</strong>
                        </span>
                        {c.upvotesCount > 0 && (
                          <span className="text-blue-600 font-semibold block text-[11px]">
                            👍 {c.upvotesCount} citizen confirmations
                          </span>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

            {/* Gap Detection Indicator Pins */}
            {showGaps &&
              topGaps.map((g, idx) => (
                <CircleMarker
                  key={`gap-${idx}`}
                  center={center} // fallback close to center with slight offset
                  radius={18}
                  fillColor="#8b5cf6"
                  color="#ffffff"
                  weight={2}
                  fillOpacity={0.25}
                >
                  <Popup>
                    <div className="p-1 text-xs">
                      <span className="font-bold text-purple-900 block">Underserved Area: {g.name}</span>
                      <span className="text-slate-600 block">
                        Nearest School: {g.distanceToNearestSchoolKm} km • Road: {g.distanceToNearestRoadKm} km
                      </span>
                      <span className="text-purple-700 font-semibold block mt-1">
                        Population Affected: {g.affectedPopulation.toLocaleString()}
                      </span>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
          </MapContainer>
        </div>

        {/* Bottom Legend */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-bold text-slate-800">Priority Legend:</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600" /> Critical (80-100)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> High (60-79)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Medium (40-59)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-500" /> Low (0-39)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold">!</span> Citizen Complaint</span>
          </div>
          <span className="text-[11px] text-slate-500">Click any marker on the map to inspect full operational metadata.</span>
        </div>
      </div>
    </div>
  );
}

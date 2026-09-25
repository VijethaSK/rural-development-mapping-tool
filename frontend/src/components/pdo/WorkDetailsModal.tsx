import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { PdoAssignmentItem } from '../../types/pdoWork';

interface Props {
  assignment: PdoAssignmentItem | null;
  priorityExplanation?: any;
  isOpen: boolean;
  onClose: () => void;
}

const infraIcon = L.divIcon({
  className: 'custom-detail-infra',
  html: `<div style="background-color: #2563eb; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); font-size: 16px;">🏛️</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

const complaintPin = L.divIcon({
  className: 'custom-detail-comp',
  html: `<div style="background-color: #dc2626; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4); font-size: 14px;">⚠️</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

export function WorkDetailsModal({ assignment, priorityExplanation, isOpen, onClose }: Props) {
  if (!isOpen || !assignment) return null;

  const infra = assignment.infrastructureId;
  const comp = assignment.complaintId;

  // Center coordinates
  let center: [number, number] = [12.9489, 77.7479];
  if (infra?.location?.coordinates) {
    center = [infra.location.coordinates[1], infra.location.coordinates[0]];
  } else if (comp?.location?.coordinates) {
    center = [comp.location.coordinates[1], comp.location.coordinates[0]];
  }

  const formatRupee = (val?: number) => {
    if (!val) return '₹0';
    return '₹' + val.toLocaleString('en-IN');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                {assignment.assignmentNumber}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700">
                {assignment.status.replace('_', ' ')}
              </span>
              <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                Priority: {assignment.priority}
              </span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">{assignment.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* 1. Infrastructure Information */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            1. Infrastructure Information
          </h4>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Asset Name:</span>
              <span className="font-bold text-slate-800 text-sm block mt-0.5">{infra?.name || 'Unrecorded'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Asset Type:</span>
              <span className="font-bold text-slate-800 block mt-0.5">{infra?.type || 'General'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Ward / Habitation:</span>
              <span className="font-bold text-slate-800 block mt-0.5">{infra?.ward} {infra?.village ? `• ${infra.village}` : ''}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Physical Condition:</span>
              <span className="font-bold text-red-600 block mt-0.5">{infra?.condition || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Allocated Budget:</span>
              <span className="font-bold text-emerald-700 block mt-0.5">{formatRupee(assignment.allocatedBudget)}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Est. Maintenance Cost:</span>
              <span className="font-bold text-slate-800 block mt-0.5">
                {formatRupee(infra?.estimatedRepairCost || infra?.estimatedMaintenanceCost)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Assigned Date:</span>
              <span className="font-medium text-slate-700 block mt-0.5">
                {new Date(assignment.scheduledDate).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Due Target Date:</span>
              <span className="font-medium text-slate-700 block mt-0.5">
                {assignment.targetCompletionDate ? new Date(assignment.targetCompletionDate).toLocaleDateString() : 'Immediate'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Citizen Complaint Information & Photos */}
        {comp && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              2. Linked Citizen Grievance & Evidence
            </h4>
            <div className="p-4 bg-red-50/40 rounded-2xl border border-red-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-red-900 text-sm">{comp.title}</span>
                <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded font-bold text-[10px]">
                  {comp.priority} Urgency
                </span>
              </div>
              <p className="text-slate-700 leading-relaxed">{comp.description}</p>
              <div className="flex items-center gap-4 text-slate-500 text-[11px]">
                <span>Category: <strong>{comp.category}</strong></span>
                <span>Status: <strong>{comp.status}</strong></span>
                {comp.upvotesCount > 0 && <span>Confirmations: <strong>{comp.upvotesCount} citizens</strong></span>}
                {comp.reporterName && <span>Reported by: <strong>{comp.reporterName}</strong></span>}
              </div>

              {/* Photos */}
              {comp.images && comp.images.length > 0 && (
                <div className="pt-2 border-t border-red-100">
                  <span className="font-bold text-slate-700 block mb-1.5 text-[11px]">Citizen Submitted Photos:</span>
                  <div className="grid grid-cols-3 gap-2">
                    {comp.images.map((img, idx) => (
                      <div key={idx} className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                        <img src={img.url} alt={img.caption || 'Citizen report'} className="w-full h-24 object-cover" />
                        {img.caption && <span className="p-1 block text-[10px] text-slate-500 truncate">{img.caption}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Priority Scoring & Factor Explanation */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            3. Priority Intelligence & Factor Decomposition
          </h4>
          <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-950 text-sm">
                Engineering Priority Score: {infra?.priorityScore || assignment.priority} / 100
              </span>
              <span className="font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                {assignment.priority} Level
              </span>
            </div>
            <p className="text-indigo-900 text-xs leading-relaxed">
              {priorityExplanation?.summary ||
                'Calculated via multi-criteria SAW decision model accounting for severe physical distress, citizen grievances, demographic footprint, and isolation.'}
            </p>
          </div>
        </div>

        {/* 4. GIS Map Location Preview */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            4. Geographic Location Map
          </h4>
          <div className="rounded-2xl overflow-hidden border border-slate-200" style={{ height: '240px' }}>
            <MapContainer center={center} zoom={15} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {infra?.location?.coordinates && (
                <Marker position={[infra.location.coordinates[1], infra.location.coordinates[0]]} icon={infraIcon}>
                  <Popup>
                    <div className="text-xs font-bold">{infra.name}</div>
                  </Popup>
                </Marker>
              )}
              {comp?.location?.coordinates && (
                <Marker position={[comp.location.coordinates[1], comp.location.coordinates[0]]} icon={complaintPin}>
                  <Popup>
                    <div className="text-xs font-bold">{comp.title}</div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>

        {/* 5. Completion / Verification Audit History (if completed or verified) */}
        {(assignment.status === 'Completed' || assignment.status === 'Verified') && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              5. Completion & Verification Audit Trail
            </h4>
            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-950">
                  {assignment.status === 'Verified' ? '✓ Verified by Panchayat Executive' : 'Completed / Awaiting Admin Verification'}
                </span>
                <span className="text-emerald-700 font-semibold">
                  Actual Cost: {formatRupee(assignment.actualCost)}
                </span>
              </div>
              {assignment.completionNotes && (
                <p className="text-slate-700">
                  <strong>Crew Notes:</strong> {assignment.completionNotes}
                </p>
              )}
              {assignment.completionImages && assignment.completionImages.length > 0 && (
                <div className="pt-2">
                  <span className="font-bold text-slate-700 block mb-1">Completion Photos:</span>
                  <div className="grid grid-cols-3 gap-2">
                    {assignment.completionImages.map((img, idx) => (
                      <img key={idx} src={img.url} alt="Proof" className="w-full h-20 object-cover rounded-lg border border-slate-200" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { PdoAssignmentItem } from '../../types/pdoWork';

interface Props {
  assignment: PdoAssignmentItem;
  onAction: (id: string, action: 'accept' | 'start' | 'pause') => void;
  onOpenCompleteModal: (assignment: PdoAssignmentItem) => void;
  onOpenDetailsModal: (assignment: PdoAssignmentItem) => void;
}

export function PdoTaskCard({
  assignment,
  onAction,
  onOpenCompleteModal,
  onOpenDetailsModal
}: Props) {
  const infra = assignment.infrastructureId;
  const comp = assignment.complaintId;

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'High':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Medium':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Assigned':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Accepted':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'In_Progress':
        return 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse';
      case 'Completed':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Verified':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const getTypeIcon = (type?: string) => {
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

  const formatRupee = (num?: number) => {
    if (!num) return '₹0';
    return '₹' + num.toLocaleString('en-IN');
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
      {/* Top Meta */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 bg-slate-100 text-slate-800 rounded-lg border border-slate-200">
              {assignment.assignmentNumber}
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadgeClass(
                assignment.status
              )}`}
            >
              {assignment.status === 'Completed'
                ? 'Completed / Awaiting Verification'
                : assignment.status.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getPriorityBadgeClass(
                assignment.priority
              )}`}
            >
              {assignment.priority} ({infra?.priorityScore || '—'})
            </span>
          </div>
        </div>

        {/* Infrastructure Name & Type */}
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>{getTypeIcon(infra?.type)}</span>
            <span>{infra?.type || 'Rural Infrastructure'}</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 mt-0.5">
            {infra?.name || assignment.title}
          </h3>
          <span className="text-xs text-slate-500 block">
            📍 {infra?.ward || 'Panchayat Sector'} {infra?.village ? `• ${infra.village}` : ''}
          </span>
        </div>

        {/* Problem Statement */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Reported Defect / Work Scope:
          </span>
          <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">
            {comp?.description || assignment.description || assignment.title}
          </p>
        </div>

        {/* Schedule & Cost Grid */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block">Assigned Date:</span>
            <span className="font-semibold text-slate-700 block">
              {new Date(assignment.scheduledDate).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block">Due Date:</span>
            <span className="font-semibold text-slate-700 block">
              {assignment.targetCompletionDate
                ? new Date(assignment.targetCompletionDate).toLocaleDateString()
                : 'Urgent'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block">Est. Repair Cost:</span>
            <span className="font-extrabold text-blue-700 block">
              {formatRupee(infra?.estimatedRepairCost || infra?.estimatedMaintenanceCost || assignment.allocatedBudget)}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <button
          onClick={() => onOpenDetailsModal(assignment)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 underline py-1"
        >
          View Full Details →
        </button>

        <div className="flex items-center gap-1.5">
          {/* Action 1: Accept Work */}
          {assignment.status === 'Assigned' && (
            <button
              onClick={() => onAction(assignment._id, 'accept')}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs shadow-sm transition"
            >
              Accept Work
            </button>
          )}

          {/* Action 2: Start Work */}
          {assignment.status === 'Accepted' && (
            <button
              onClick={() => onAction(assignment._id, 'start')}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-sm transition"
            >
              ▶ Start Work
            </button>
          )}

          {/* Action 3: Pause Work */}
          {assignment.status === 'In_Progress' && (
            <button
              onClick={() => onAction(assignment._id, 'pause')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs border border-slate-200 transition"
            >
              ⏸ Pause Work
            </button>
          )}

          {/* Action 4: Complete Work */}
          {assignment.status === 'In_Progress' && (
            <button
              onClick={() => onOpenCompleteModal(assignment)}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs shadow-sm transition"
            >
              ✓ Complete Work
            </button>
          )}

          {/* Status 5: Completed */}
          {assignment.status === 'Completed' && (
            <span className="px-2.5 py-1 text-xs font-bold text-purple-700 bg-purple-50 rounded-xl border border-purple-200">
              ⏳ Awaiting Admin Sign-off
            </span>
          )}

          {/* Status 6: Verified */}
          {assignment.status === 'Verified' && (
            <span className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200">
              ✓ Verified by Admin
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

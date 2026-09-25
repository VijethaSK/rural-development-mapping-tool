import React, { useState } from 'react';
import { MaintenanceMetrics, MaintenanceAssignmentItem } from '../../../types/adminDashboard';

interface Props {
  metrics: MaintenanceMetrics;
  onUpdateStatus: (
    id: string,
    status: 'In_Progress' | 'Completed' | 'Verified' | 'Rejected',
    notes?: string
  ) => Promise<boolean>;
}

export function MaintenanceOpsSection({ metrics, onUpdateStatus }: Props) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('All');

  const handleAction = async (
    id: string,
    status: 'In_Progress' | 'Completed' | 'Verified' | 'Rejected'
  ) => {
    setUpdatingId(id);
    await onUpdateStatus(id, status);
    setUpdatingId(null);
  };

  const filteredAssignments = metrics.recentAssignments.filter((a) => {
    if (filterStatus === 'All') return true;
    if (filterStatus === 'Overdue') return a.isOverdue;
    return a.status === filterStatus;
  });

  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (isOverdue) {
      return 'bg-red-100 text-red-800 border-red-300 font-bold animate-pulse';
    }
    switch (status) {
      case 'Assigned':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'In_Progress':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Completed':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Verified':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-4" id="section-maintenance">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>🛠️</span> Section 4: Maintenance Operations & Task Verification
          </h2>
          <p className="text-xs text-slate-500">
            Answers: <em>"Where should workers go?"</em> & <em>"What work requires admin sign-off?"</em>
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {['All', 'Assigned', 'In_Progress', 'Completed', 'Verified', 'Overdue'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 py-1 rounded-lg font-medium transition border ${
                filterStatus === st
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Status KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Pending */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium block">Pending Dispatch</span>
          <div className="text-2xl font-black text-blue-700 mt-1">{metrics.pendingAssignments}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Awaiting field crew start</span>
        </div>

        {/* In-Progress */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium block">In-Progress Work</span>
          <div className="text-2xl font-black text-amber-600 mt-1">{metrics.inProgressWork}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">Active on ground repairs</span>
        </div>

        {/* Completed Awaiting Verification */}
        <div className="bg-white p-4 rounded-2xl border border-purple-200 shadow-sm bg-purple-50/20">
          <span className="text-xs text-purple-700 font-bold block">Awaiting Admin Verification</span>
          <div className="text-2xl font-black text-purple-800 mt-1">{metrics.completedAwaitingVerification}</div>
          <span className="text-[11px] text-purple-600 mt-1 block">Requires executive sign-off</span>
        </div>

        {/* Overdue */}
        <div className={`p-4 rounded-2xl border shadow-sm ${metrics.overdueWork > 0 ? 'bg-red-50/40 border-red-200' : 'bg-white border-slate-200'}`}>
          <span className={`text-xs font-bold block ${metrics.overdueWork > 0 ? 'text-red-700' : 'text-slate-500'}`}>
            Overdue Work Orders
          </span>
          <div className={`text-2xl font-black mt-1 ${metrics.overdueWork > 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {metrics.overdueWork}
          </div>
          <span className={`text-[11px] block mt-1 ${metrics.overdueWork > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
            {metrics.overdueWork > 0 ? 'Exceeded target schedule' : 'All schedules on track'}
          </span>
        </div>
      </div>

      {/* Assignments Table with Action Buttons */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>📋</span> Active Maintenance Work Orders ({filteredAssignments.length})
          </h3>
          <span className="text-xs text-slate-500">Live operational dispatch records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">Work Order #</th>
                <th className="p-3">Title & Asset</th>
                <th className="p-3">Assigned Crew</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Status</th>
                <th className="p-3">Target Date</th>
                <th className="p-3">Allocated Budget</th>
                <th className="p-3 text-right">Admin Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-500">
                    No assignments found for status "{filterStatus}".
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-mono font-bold text-slate-700">{a.assignmentNumber}</td>
                    <td className="p-3">
                      <span className="font-bold text-slate-900 block">{a.title}</span>
                      <span className="text-slate-500 text-[11px] block mt-0.5">Asset: {a.infrastructureName}</span>
                    </td>
                    <td className="p-3 font-medium text-slate-700">{a.assignedMemberName}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          a.priority === 'Critical'
                            ? 'bg-red-100 text-red-800'
                            : a.priority === 'High'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {a.priority}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] border font-bold ${getStatusBadge(a.status, a.isOverdue)}`}>
                        {a.isOverdue ? 'Overdue' : a.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">
                      {a.targetCompletionDate ? new Date(a.targetCompletionDate).toLocaleDateString() : 'Unspecified'}
                    </td>
                    <td className="p-3 font-bold text-slate-800">
                      ₹{a.allocatedBudget ? a.allocatedBudget.toLocaleString('en-IN') : '0'}
                    </td>
                    <td className="p-3 text-right">
                      {a.status === 'Completed' ? (
                        <button
                          onClick={() => handleAction(a.id, 'Verified')}
                          disabled={updatingId === a.id}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs shadow-sm transition disabled:opacity-50"
                        >
                          {updatingId === a.id ? 'Verifying...' : '✓ Verify Work'}
                        </button>
                      ) : (
                        <span className="text-slate-500 font-medium text-xs">{a.status === 'Verified' ? '✓ Verified' : 'Field officer action required'}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

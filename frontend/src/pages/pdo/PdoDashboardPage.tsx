import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import {
  PdoAssignmentItem,
  WorkCounts,
  PdoTaskStatus,
  CompletionImage
} from '../../types/pdoWork';
import { PdoTaskCard } from '../../components/pdo/PdoTaskCard';
import { WorkDetailsModal } from '../../components/pdo/WorkDetailsModal';
import { CompleteWorkModal } from '../../components/pdo/CompleteWorkModal';
import { apiFetch } from '../../api/client';

export default function PdoDashboardPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState<PdoAssignmentItem[]>([]);
  const [counts, setCounts] = useState<WorkCounts>({
    assigned: 0,
    accepted: 0,
    inProgress: 0,
    completed: 0,
    verified: 0,
    total: 0
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [selectedForDetails, setSelectedForDetails] = useState<PdoAssignmentItem | null>(null);
  const [detailsExplanation, setDetailsExplanation] = useState<any>(null);
  const [selectedForComplete, setSelectedForComplete] = useState<PdoAssignmentItem | null>(null);

  // Notifications
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Fetch Member/PDO work assignments
  const fetchMyWork = async (isBackground = false) => {
    if (!token) {
      setLoading(false);
      return;
    }

    if (isBackground) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (priorityFilter !== 'All') params.append('priority', priorityFilter);

      const res = await apiFetch(`/assignments/my-work?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError('Session expired. Please log in again.');
          return;
        }
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error ${res.status}`);
      }

      const data = await res.json();
      setAssignments(data.assignments || []);
      if (data.counts) {
        setCounts(data.counts);
      }
    } catch (err: any) {
      console.error('Error fetching PDO work orders:', err);
      setError(err.message || 'Failed to load assigned work orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMyWork();
  }, [token, statusFilter, priorityFilter]);

  // Client-side text search
  const filteredAssignments = useMemo(() => {
    if (!searchQuery.trim()) return assignments;
    const q = searchQuery.toLowerCase();
    return assignments.filter((item) => {
      const num = item.assignmentNumber?.toLowerCase() || '';
      const title = item.title?.toLowerCase() || '';
      const desc = item.description?.toLowerCase() || '';
      const infraName = item.infrastructureId?.name?.toLowerCase() || '';
      const ward = item.infrastructureId?.ward?.toLowerCase() || '';
      const village = item.infrastructureId?.village?.toLowerCase() || '';
      const compDesc = item.complaintId?.description?.toLowerCase() || '';
      return (
        num.includes(q) ||
        title.includes(q) ||
        desc.includes(q) ||
        infraName.includes(q) ||
        ward.includes(q) ||
        village.includes(q) ||
        compDesc.includes(q)
      );
    });
  }, [assignments, searchQuery]);

  // Task Actions (Accept, Start, Pause)
  const handleAction = async (id: string, action: 'accept' | 'start' | 'pause') => {
    if (!token) return;

    let bodyData: any = { action };

    // For "pause", ask reason
    if (action === 'pause') {
      const reason = window.prompt('Enter reason for pausing maintenance work (e.g. weather, materials, shift end):');
      if (reason === null) return; // User cancelled prompt
      bodyData.notes = reason.trim() || 'Work paused by field officer';
    }

    // For "start", capture GPS if browser allows
    if (action === 'start' && navigator.geolocation) {
      try {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              bodyData.completionLocation = {
                type: 'Point',
                coordinates: [pos.coords.longitude, pos.coords.latitude]
              };
              resolve();
            },
            () => resolve(), // Continue without GPS if denied
            { timeout: 3000 }
          );
        });
      } catch {
        // Ignore GPS error on start
      }
    }

    try {
      const res = await apiFetch(`/assignments/${id}/action`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(bodyData)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update work status');
      }

      const resData = await res.json();
      const updatedStatus = resData.assignment?.status;

      if (action === 'accept') {
        showToast('Work order accepted! You can now start execution when on-site.', 'success');
      } else if (action === 'start') {
        showToast('Field maintenance started! Status set to In Progress.', 'success');
      } else if (action === 'pause') {
        showToast('Work order paused. Ready to resume anytime.', 'info');
      }

      await fetchMyWork(true);
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    }
  };

  // Task Completion submit
  const handleCompleteSubmit = async (data: {
    notes: string;
    completionImages: CompletionImage[];
    completionLocation?: { coordinates: [number, number] };
    actualCost?: number;
  }) => {
    if (!selectedForComplete || !token) return;

    const res = await apiFetch(`/assignments/${selectedForComplete._id}/action`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        action: 'complete',
        ...data
      })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Failed to submit work completion');
    }

    setSelectedForComplete(null);
    showToast(
      'Work submitted! Status is now "Completed / Awaiting Verification". Panchayat Admin will verify before final closure.',
      'success'
    );
    await fetchMyWork(true);
  };

  // Open Details Modal and fetch fresh explanation
  const handleOpenDetails = async (item: PdoAssignmentItem) => {
    setSelectedForDetails(item);
    setDetailsExplanation(null);
    try {
    const res = await apiFetch(`/assignments/${item._id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.priorityExplanation) {
          setDetailsExplanation(data.priorityExplanation);
        }
      }
    } catch {
      // Fallback
    }
  };

  // Authentication check view
  if (!token) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-3xl border border-slate-200 shadow-xl text-center space-y-4">
        <div className="text-4xl">🔒</div>
        <h2 className="text-xl font-bold text-slate-800">Member/PDO Authentication Required</h2>
        <p className="text-xs text-slate-500">
          You must be logged in as a Panchayat Development Officer or Ward Member to access your assigned work orders.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm shadow-md transition"
        >
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed top-16 right-6 z-50 p-4 rounded-2xl shadow-xl text-xs font-bold border flex items-center gap-3 transition-all animate-bounce ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : toast.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-300'
              : 'bg-blue-50 text-blue-800 border-blue-300'
          }`}
        >
          <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠️' : 'ℹ️'}</span>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      )}

      {/* Top Header & Member Info Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-blue-500/30 border border-blue-400/40 rounded-full text-[11px] font-bold tracking-wide uppercase">
              Field Maintenance Portal
            </span>
            <span className="px-2.5 py-0.5 bg-emerald-500/30 border border-emerald-400/40 rounded-full text-[11px] font-bold tracking-wide">
              🔒 Member Isolation Active
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">MY WORK</h1>
          <p className="text-xs text-blue-100/90 max-w-xl">
            Real-time maintenance work orders assigned to you. Accept, start field operations, upload geotagged completion proof, and track verification.
          </p>
        </div>

        {/* Member Profile Badge */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl shadow-inner">
            👷
          </div>
          <div className="text-xs space-y-0.5">
            <span className="text-[10px] text-blue-200 block uppercase font-bold tracking-wider">
              Assigned Field Officer
            </span>
            <div className="font-extrabold text-white text-sm">
              {user?.name || 'Panchayat Development Officer'}
            </div>
            <div className="text-blue-100 flex items-center gap-2 text-[11px]">
              <span className="px-1.5 py-0.2 bg-white/20 rounded font-medium">
                {user?.designation || 'PDO / Ward Member'}
              </span>
              <span>•</span>
              <span className="font-semibold text-emerald-300">
                📍 {user?.assignedWard || 'Ward 3 (Belagola)'}
              </span>
            </div>
          </div>
          <button
            onClick={() => fetchMyWork(true)}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition ml-2 disabled:opacity-50"
            title="Refresh assignments"
          >
            <span className={`inline-block text-base ${refreshing ? 'animate-spin' : ''}`}>🔄</span>
          </button>
        </div>
      </div>

      {/* 5 KPI Status Cards */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Work Order Status Overview
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            Total Allocated: <strong className="text-slate-800">{counts.total}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Card 1: Assigned */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'Assigned' ? 'All' : 'Assigned')}
            className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
              statusFilter === 'Assigned'
                ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400 shadow-md'
                : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between text-blue-600 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Assigned</span>
              <span className="text-lg">📋</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{counts.assigned}</div>
            <div className="text-[11px] text-slate-500 mt-1">Awaiting Acceptance</div>
          </button>

          {/* Card 2: Accepted */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'Accepted' ? 'All' : 'Accepted')}
            className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
              statusFilter === 'Accepted'
                ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-400 shadow-md'
                : 'bg-white border-slate-200 hover:border-sky-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between text-sky-600 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Accepted</span>
              <span className="text-lg">🤝</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{counts.accepted}</div>
            <div className="text-[11px] text-slate-500 mt-1">Ready to Dispatch</div>
          </button>

          {/* Card 3: In Progress */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'In_Progress' ? 'All' : 'In_Progress')}
            className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
              statusFilter === 'In_Progress'
                ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400 shadow-md'
                : 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between text-amber-600 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">In Progress</span>
              <span className="text-lg">⚡</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{counts.inProgress}</div>
            <div className="text-[11px] text-slate-500 mt-1">Field Work Underway</div>
          </button>

          {/* Card 4: Verified */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'Verified' ? 'All' : 'Verified')}
            className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
              statusFilter === 'Verified'
                ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-400 shadow-md'
                : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between text-purple-600 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Verified</span>
              <span className="text-lg">✓</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{counts.verified}</div>
            <div className="text-[11px] text-slate-500 mt-1">Admin Sign-off Complete</div>
          </button>

          {/* Card 5: Awaiting Verification */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'Completed' ? 'All' : 'Completed')}
            className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden col-span-2 md:col-span-1 ${
              statusFilter === 'Completed'
                ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400 shadow-md'
                : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between text-indigo-600 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Awaiting Verification</span>
              <span className="text-lg">⏳</span>
            </div>
            <div className="text-2xl font-black text-slate-900">{counts.completed}</div>
            <div className="text-[11px] text-slate-500 mt-1">Pending Admin Audit</div>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Search by order #, asset, or issue..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Status selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 text-xs focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Statuses ({counts.total})</option>
              <option value="Assigned">Assigned ({counts.assigned})</option>
              <option value="Accepted">Accepted ({counts.accepted})</option>
              <option value="In_Progress">In Progress ({counts.inProgress})</option>
              <option value="Completed">Completed / Awaiting Verification ({counts.completed})</option>
              <option value="Verified">Verified ({counts.verified})</option>
            </select>
          </div>

          {/* Priority selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-semibold">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 text-xs focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {(statusFilter !== 'All' || priorityFilter !== 'All' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('All');
                setPriorityFilter('All');
                setSearchQuery('');
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-16 text-center text-slate-500 space-y-3 bg-white rounded-3xl border border-slate-200">
          <div className="inline-block animate-spin text-3xl">⚙️</div>
          <div className="font-bold text-sm text-slate-800">Loading your assigned work orders...</div>
          <p className="text-xs text-slate-400">Verifying member authorization and fetching task GIS telemetry.</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-center space-y-3">
          <div className="text-2xl">⚠️</div>
          <div className="font-bold text-sm text-red-700">{error}</div>
          <button
            onClick={() => fetchMyWork()}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold"
          >
            Retry
          </button>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="p-16 text-center space-y-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <div className="text-4xl">🎉</div>
          <h3 className="text-base font-bold text-slate-800">No Work Orders Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {statusFilter !== 'All' || priorityFilter !== 'All' || searchQuery
              ? 'No assigned tasks match your current filter criteria.'
              : 'You have no pending maintenance tasks assigned to your ward at this time.'}
          </p>
          {(statusFilter !== 'All' || priorityFilter !== 'All' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('All');
                setPriorityFilter('All');
                setSearchQuery('');
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Showing <strong>{filteredAssignments.length}</strong> of {assignments.length} assigned task(s)
            </span>
            <span className="text-[11px] text-slate-400">
              Sorted by latest update
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAssignments.map((assignment) => (
              <PdoTaskCard
                key={assignment._id}
                assignment={assignment}
                onAction={handleAction}
                onOpenCompleteModal={(item) => setSelectedForComplete(item)}
                onOpenDetailsModal={(item) => handleOpenDetails(item)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {selectedForComplete && (
        <CompleteWorkModal
          assignment={selectedForComplete}
          isOpen={!!selectedForComplete}
          onClose={() => setSelectedForComplete(null)}
          onSubmit={handleCompleteSubmit}
        />
      )}

      {/* Work Details Modal */}
      {selectedForDetails && (
        <WorkDetailsModal
          assignment={selectedForDetails}
          priorityExplanation={detailsExplanation}
          isOpen={!!selectedForDetails}
          onClose={() => setSelectedForDetails(null)}
        />
      )}
    </div>
  );
}

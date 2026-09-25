import React, { useState } from 'react';
import { ComplaintStatus, StatusHistoryItem, AvailableTransition } from '../../types/citizen';
import { useAuth } from '../../store/auth';

interface Props {
  complaintId: string;
  currentStatus: ComplaintStatus;
  statusHistory?: StatusHistoryItem[];
  availableTransitions?: AvailableTransition[];
  onTransitionSuccess?: (updatedComplaint: any) => void;
  readOnly?: boolean;
}

interface StepDefinition {
  key: string;
  normalizedKey: string;
  label: string;
  icon: string;
  description: string;
}

const PRIMARY_STEPS: StepDefinition[] = [
  { key: 'SUBMITTED', normalizedKey: 'SUBMITTED', label: 'Submitted', icon: '📝', description: 'Grievance lodged by citizen' },
  { key: 'UNDER_REVIEW', normalizedKey: 'UNDER_REVIEW', label: 'Under Review', icon: '🔍', description: 'Panchayat officials reviewing report' },
  { key: 'PRIORITY_SET', normalizedKey: 'PRIORITY_SET', label: 'Priority Set', icon: '⚖️', description: 'Urgency & SAW score assessed' },
  { key: 'ASSIGNED', normalizedKey: 'ASSIGNED', label: 'Assigned', icon: '👷', description: 'Dispatched to PDO/Worker' },
  { key: 'IN_PROGRESS', normalizedKey: 'IN_PROGRESS', label: 'In Progress', icon: '⚡', description: 'On-site repair work underway' },
  { key: 'COMPLETED', normalizedKey: 'COMPLETED', label: 'Completed', icon: '📦', description: 'Field work done, awaiting audit' },
  { key: 'VERIFIED', normalizedKey: 'VERIFIED', label: 'Verified', icon: '🛡️', description: 'Admin verified repair evidence' },
  { key: 'CLOSED', normalizedKey: 'CLOSED', label: 'Closed', icon: '✅', description: 'Grievance resolved & archived' }
];

export function normalizeStatus(raw: string = ''): string {
  const clean = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (clean === 'NEW') return 'SUBMITTED';
  if (clean === 'RESOLVED') return 'COMPLETED';
  return clean;
}

export function getStatusStyle(status: string) {
  const norm = normalizeStatus(status);
  switch (norm) {
    case 'SUBMITTED':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', badge: 'bg-blue-600', icon: '📝' };
    case 'UNDER_REVIEW':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'bg-amber-600', icon: '🔍' };
    case 'PRIORITY_SET':
      return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', badge: 'bg-purple-600', icon: '⚖️' };
    case 'ASSIGNED':
      return { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', badge: 'bg-sky-600', icon: '👷' };
    case 'REASSIGNED':
      return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', badge: 'bg-orange-600', icon: '🔄' };
    case 'IN_PROGRESS':
      return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', badge: 'bg-orange-500', icon: '⚡' };
    case 'COMPLETED':
      return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', badge: 'bg-indigo-600', icon: '📦' };
    case 'VERIFIED':
      return { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', badge: 'bg-teal-600', icon: '🛡️' };
    case 'CLOSED':
      return { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', badge: 'bg-emerald-600', icon: '✅' };
    case 'REJECTED':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', badge: 'bg-red-600', icon: '❌' };
    default:
      return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', badge: 'bg-slate-600', icon: '📌' };
  }
}

export function ComplaintLifecycleTimeline({
  complaintId,
  currentStatus,
  statusHistory = [],
  availableTransitions = [],
  onTransitionSuccess,
  readOnly = false
}: Props) {
  const { user, token } = useAuth();
  const [transitioning, setTransitioning] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [transitionComment, setTransitionComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);

  const normalizedCurrent = normalizeStatus(currentStatus);
  const isRejected = normalizedCurrent === 'REJECTED';
  const isReassigned = normalizedCurrent === 'REASSIGNED';

  // Find step index in standard flow
  let activeStepIndex = PRIMARY_STEPS.findIndex((s) => s.normalizedKey === normalizedCurrent);
  if (activeStepIndex === -1) {
    if (isRejected) activeStepIndex = 1; // Branched from Under Review
    else if (isReassigned) activeStepIndex = 3; // Branched from Assigned
    else activeStepIndex = 0;
  }

  // Determine authorized transitions if not explicitly passed from backend
  const userRole = user?.role || 'citizen';
  const canPerformTransitions = !readOnly && token && (userRole === 'admin' || userRole === 'pdo');

  const handleOpenTransitionModal = (targetState: string) => {
    setSelectedTarget(targetState);
    setTransitionComment('');
    setError(null);
  };

  const handleConfirmTransition = async () => {
    if (!selectedTarget || !token) return;
    setTransitioning(true);
    setError(null);

    try {
      const res = await fetch(`/complaints/${complaintId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          toState: selectedTarget,
          comment: transitionComment.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Transition failed');
      }

      setSelectedTarget(null);
      setTransitionComment('');
      if (onTransitionSuccess) {
        onTransitionSuccess(data.complaint);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to execute status transition');
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-6">
      {/* 1. Header with Status & Reference Rules Trigger */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Complaint State Machine & Audit Trail
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 ${
              getStatusStyle(currentStatus).bg
            } ${getStatusStyle(currentStatus).text} ${getStatusStyle(currentStatus).border}`}
          >
            <span>{getStatusStyle(currentStatus).icon}</span>
            <span>Current State: {currentStatus}</span>
          </span>
          {isRejected && (
            <span className="px-2.5 py-0.5 text-[11px] font-bold bg-red-100 text-red-800 rounded-full border border-red-200 animate-pulse">
              ❌ Branch: Rejected
            </span>
          )}
          {isReassigned && (
            <span className="px-2.5 py-0.5 text-[11px] font-bold bg-orange-100 text-orange-800 rounded-full border border-orange-200">
              🔄 Branch: Reassigned
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowRulesModal(true)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
        >
          <span>📐 State Machine Rules</span>
        </button>
      </div>

      {/* 2. Horizontal Graphical Stepper (Desktop) */}
      <div className="hidden md:block relative py-2">
        <div className="flex items-center justify-between relative z-10">
          {PRIMARY_STEPS.map((step, idx) => {
            const isCompleted = !isRejected && idx < activeStepIndex;
            const isCurrent = !isRejected && idx === activeStepIndex;
            const isFuture = idx > activeStepIndex;

            return (
              <div key={step.key} className="flex-1 flex flex-col items-center text-center relative group">
                {/* Horizontal Connector Line */}
                {idx > 0 && (
                  <div
                    className={`absolute top-4 -left-1/2 w-full h-1 -z-10 transition-colors ${
                      idx <= activeStepIndex && !isRejected ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  />
                )}

                {/* Circular Badge */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm ${
                    isCurrent
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100 scale-110 shadow-blue-200'
                      : isCompleted
                      ? 'bg-emerald-600 text-white shadow-emerald-100'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                  title={`${step.label}: ${step.description}`}
                >
                  {isCompleted ? '✓' : step.icon}
                </div>

                {/* Step Text Label */}
                <div className="mt-2 text-center">
                  <span
                    className={`block text-[11px] font-bold leading-tight ${
                      isCurrent
                        ? 'text-blue-700'
                        : isCompleted
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[9px] text-slate-400 block mt-0.5 leading-none">
                    Stage {idx + 1}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Stepper */}
      <div className="md:hidden grid grid-cols-2 gap-2">
        {PRIMARY_STEPS.map((step, idx) => {
          const isCompleted = !isRejected && idx < activeStepIndex;
          const isCurrent = !isRejected && idx === activeStepIndex;

          return (
            <div
              key={step.key}
              className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                isCurrent
                  ? 'bg-blue-50 border-blue-300 font-bold text-blue-900'
                  : isCompleted
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
            >
              <span>{isCompleted ? '✓' : step.icon}</span>
              <span className="truncate">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Alternative State Branch Banner */}
      {isRejected && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs space-y-1">
          <div className="font-bold text-red-800 flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>Grievance Terminated at Review Stage (REJECTED)</span>
          </div>
          <p className="text-red-700 text-[11px] leading-relaxed">
            This grievance was reviewed by Panchayat Administration and marked as Rejected. If this decision was reached in error, an Administrator may reopen the ticket for reconsideration.
          </p>
        </div>
      )}

      {isReassigned && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-1">
          <div className="font-bold text-amber-800 flex items-center gap-2">
            <span className="text-base">🔄</span>
            <span>Work Assignment Rescheduled (REASSIGNED)</span>
          </div>
          <p className="text-amber-700 text-[11px] leading-relaxed">
            The maintenance task was reassigned to another field officer or queue. On-site work will commence under the updated schedule.
          </p>
        </div>
      )}

      {/* 3. Chronological Lifecycle Event Timeline (Audit Log) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span>📜</span>
            <span>Recorded Transition History ({statusHistory.length} events)</span>
          </h5>
          <span className="text-[11px] text-slate-400">Strictly audited & tamper-proof</span>
        </div>

        {statusHistory.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 text-center">
            No previous transitions recorded. Grievance is in initial SUBMITTED state.
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {statusHistory.map((item, idx) => {
              const oldState = item.oldStatus || item.fromStatus;
              const newState = item.newStatus || item.toStatus || item.status;
              const style = getStatusStyle(newState);
              const actorName =
                item.changedByName ||
                item.updatedByName ||
                (typeof item.changedBy === 'object' ? (item.changedBy as any)?.name : null) ||
                (typeof item.updatedBy === 'object' ? item.updatedBy?.name : null) ||
                'Authorized Official';
              const actorRole =
                item.changedByRole ||
                (typeof item.changedBy === 'object' ? (item.changedBy as any)?.role : null) ||
                (typeof item.updatedBy === 'object' ? item.updatedBy?.role : null) ||
                'official';
              const commentText = item.comment || item.notes;

              return (
                <div key={idx} className="relative group text-xs">
                  {/* Timeline Dot */}
                  <div
                    className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${style.badge}`}
                  />

                  {/* Event Card */}
                  <div className="bg-slate-50 hover:bg-slate-100/70 p-3.5 rounded-xl border border-slate-200 transition-all space-y-1.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {oldState ? (
                          <div className="flex items-center gap-1 font-semibold text-slate-700">
                            <span className="px-1.5 py-0.5 bg-white border rounded text-[10px] text-slate-600">
                              {oldState}
                            </span>
                            <span className="text-slate-400">➔</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${style.bg} ${style.text} border ${style.border}`}
                            >
                              {newState}
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${style.bg} ${style.text} border ${style.border}`}
                          >
                            {newState}
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.2 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            actorRole === 'admin'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : actorRole === 'pdo'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {actorRole}
                        </span>

                        <span className="text-slate-600 font-medium">
                          by <strong className="text-slate-800">{actorName}</strong>
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(item.timestamp).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </span>
                    </div>

                    {commentText && (
                      <div className="mt-1 p-2 bg-white rounded-lg border border-slate-200/80 text-slate-700 italic flex items-start gap-1.5">
                        <span className="text-slate-400 not-italic">💬</span>
                        <span className="leading-snug">"{commentText}"</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. State Machine Transition Actions (Role-Guarded) */}
      <div className="pt-4 border-t border-slate-100 space-y-3">
        {canPerformTransitions ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <span>⚡</span>
                <span>Controlled State Machine Actions ({userRole.toUpperCase()})</span>
              </h5>
              <span className="text-[11px] text-slate-400">Execute authorized transition</span>
            </div>

            {availableTransitions.length === 0 ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                No state machine transitions currently available for role <strong>{userRole}</strong> from state{' '}
                <strong>{currentStatus}</strong>.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTransitions.map((t) => {
                  const targetStyle = getStatusStyle(t.targetState);
                  return (
                    <button
                      key={t.targetState}
                      type="button"
                      onClick={() => handleOpenTransitionModal(t.targetState)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border shadow-sm transition flex items-center gap-1.5 ${targetStyle.bg} ${targetStyle.text} ${targetStyle.border} hover:scale-[1.02]`}
                      title={t.description}
                    >
                      <span>{targetStyle.icon}</span>
                      <span>Transition to {t.targetState}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
            <span className="text-base">🔒</span>
            <span>
              <strong>Role Access Guard:</strong> State transitions are governed by the Panchayat State Machine. Only authenticated Admins and PDO officers have permission to advance lifecycle stages.
            </span>
          </div>
        )}
      </div>

      {/* Transition Confirmation Modal */}
      {selectedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Confirm State Transition
                </span>
                <h4 className="text-lg font-black text-slate-900 mt-1">
                  {currentStatus} ➔ {selectedTarget}
                </h4>
              </div>
              <button
                onClick={() => setSelectedTarget(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              You are about to advance this grievance to <strong>{selectedTarget}</strong>. This state change will be recorded in the immutable audit trail with your name and role (<strong>{user?.name || userRole}</strong>).
            </p>

            {error && <div className="text-xs text-red-600 font-bold p-2 bg-red-50 rounded-lg">{error}</div>}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Official Comment / Audit Note (Optional)</label>
              <textarea
                value={transitionComment}
                onChange={(e) => setTransitionComment(e.target.value)}
                placeholder="e.g. On-site verification completed; contractor dispatched for asphalt resurfacing..."
                rows={3}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={transitioning}
                onClick={handleConfirmTransition}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
              >
                {transitioning ? 'Executing Transition...' : `Confirm: Set to ${selectedTarget}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Explanatory Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h4 className="text-lg font-black text-slate-900">
                  📐 Complaint Lifecycle Controlled State Machine
                </h4>
                <p className="text-xs text-slate-500">
                  Panchayat Infrastructure Grievance State Transition Matrix
                </p>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
                <strong className="text-blue-900 block font-bold">The 10 Canonical States</strong>
                <p className="text-blue-800 text-[11px] leading-relaxed">
                  SUBMITTED ➔ UNDER_REVIEW ➔ PRIORITY_SET ➔ ASSIGNED ➔ IN_PROGRESS ➔ COMPLETED ➔ VERIFIED ➔ CLOSED
                  <br />
                  Alternative Branch States: REJECTED (from Review/Priority), REASSIGNED (from Assigned).
                </p>
              </div>

              <div className="space-y-2">
                <strong className="text-slate-900 block font-bold">Role Authorization Matrix:</strong>
                <ul className="list-disc pl-5 space-y-1 text-[11px]">
                  <li>
                    <strong className="text-purple-700">Admin Only:</strong> Can set priority (<code>PRIORITY_SET</code>), reject grievances (<code>REJECTED</code>), verify completed works (<code>VERIFIED</code>), close tickets (<code>CLOSED</code>), and reopen disputed cases.
                  </li>
                  <li>
                    <strong className="text-emerald-700">PDO / Member:</strong> Can review submitted cases, accept assignments, start repair (<code>IN_PROGRESS</code>), pause work, and submit completion with photos (<code>COMPLETED</code>). Cannot self-verify or close tickets.
                  </li>
                  <li>
                    <strong className="text-blue-700">Citizen:</strong> Strictly restricted from executing state transitions. Citizens can only file grievances, post civic comments, and upvote issues.
                  </li>
                </ul>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <strong className="text-slate-900 block font-bold">Audit Guarantee:</strong>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Every state transition is atomically written to the database with previous status (<code>oldStatus</code>), new status (<code>newStatus</code>), actor identity (ID, Name, Role), timestamp, and official comments.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                Close Reference
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

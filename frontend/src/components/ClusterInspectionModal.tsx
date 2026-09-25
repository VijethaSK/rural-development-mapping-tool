import React, { useState } from 'react';
import { ComplaintCluster, ComplaintDetail } from '../types/complaint';
import { api, apiUrl } from '../api/client';

interface ClusterInspectionModalProps {
  cluster: ComplaintCluster | null;
  complaints: ComplaintDetail[];
  loading: boolean;
  onClose: () => void;
  onStatusUpdated?: () => void;
}

export default function ClusterInspectionModal({
  cluster,
  complaints,
  loading,
  onClose,
  onStatusUpdated,
}: ClusterInspectionModalProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  if (!cluster) return null;

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      await api(`/issues/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (onStatusUpdated) {
        onStatusUpdated();
      }
    } catch (err: any) {
      alert('Failed to update status: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
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

  const getStatusBadgeClass = (status: string) => {
    switch (status.trim().toUpperCase().replace(/\s+/g, '_')) {
      case 'COMPLETED':
      case 'CLOSED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'UNDER_REVIEW':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'REJECTED':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      default:
        return 'bg-purple-100 text-purple-800 border-purple-300';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-3xl w-full p-6 text-slate-900 dark:text-slate-100 my-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300">
                Spatial Complaint Cluster
              </span>
              <span className="text-xs text-slate-500 font-medium">{cluster.ward}</span>
            </div>
            <h2 className="text-xl font-bold mt-1 text-slate-900 dark:text-white flex items-center gap-2">
              <span>📍</span>
              <span>{cluster.name}</span>
            </h2>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
              <span><strong>{cluster.count}</strong> reports in hotspot</span>
              <span>•</span>
              <span className="text-red-600 font-semibold">{cluster.criticalCount} Critical</span>
              <span>•</span>
              <span className="text-orange-600 font-semibold">{cluster.highCount} High</span>
              <span>•</span>
              <span>Primary issue: <strong>{cluster.topCategory}</strong></span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl font-light p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 leading-none"
          >
            ×
          </button>
        </div>

        {/* Underlying Complaints List */}
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <div className="animate-spin text-2xl mb-2">⚙️</div>
              Retrieving underlying grievances...
            </div>
          ) : complaints.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No complaint details found for this cluster.
            </div>
          ) : (
            complaints.map((item) => (
              <div
                key={item._id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        {item.category}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded border ${getPriorityBadgeClass(
                          item.priority
                        )}`}
                      >
                        ● {item.priority}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded border ${getStatusBadgeClass(
                          item.status
                        )}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white pt-1">
                      {item.title}
                    </h3>
                  </div>

                  <div className="text-right text-[11px] text-slate-400">
                    <div>{new Date(item.createdAt).toLocaleDateString()}</div>
                    {item.upvotesCount > 0 && (
                      <div className="text-blue-600 font-semibold mt-0.5">
                        👍 {item.upvotesCount} community upvotes
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.description}
                </p>

                {item.infrastructureId && (
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span>Linked Asset:</span>
                    <strong className="text-slate-700 dark:text-slate-200">
                      {item.infrastructureId.name} ({item.infrastructureId.type})
                    </strong>
                  </div>
                )}

                {/* Images */}
                {item.images && item.images.length > 0 && (
                  <div className="flex gap-2 pt-1 overflow-x-auto">
                    {item.images.map((img, i) => (
                      <img
                        key={i}
                        src={apiUrl(img.url)}
                        alt="Complaint evidence"
                        className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                      />
                    ))}
                  </div>
                )}

                {/* Reporter & Action Bar */}
                <div className="flex items-center justify-between border-t pt-2 dark:border-slate-700 text-xs">
                  <div className="text-slate-500 text-[11px]">
                    Reported by: <strong>{item.reporterName || 'Citizen'}</strong>
                    {item.reporterPhone && ` (${item.reporterPhone})`}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Status:</span>
                    <select
                      value={item.status}
                      disabled={updatingId === item._id}
                      onChange={(e) => handleUpdateStatus(item._id, e.target.value)}
                      className="px-2 py-1 text-xs rounded border dark:bg-slate-900 dark:border-slate-700"
                    >
                      {({ SUBMITTED: ['UNDER_REVIEW', 'REJECTED'], UNDER_REVIEW: ['PRIORITY_SET', 'REJECTED'], PRIORITY_SET: ['ASSIGNED', 'UNDER_REVIEW', 'REJECTED'], ASSIGNED: ['IN_PROGRESS', 'REASSIGNED', 'PRIORITY_SET'], REASSIGNED: ['IN_PROGRESS', 'ASSIGNED'], IN_PROGRESS: ['COMPLETED', 'ASSIGNED'], COMPLETED: ['VERIFIED', 'IN_PROGRESS', 'REJECTED'], VERIFIED: ['CLOSED', 'IN_PROGRESS'], CLOSED: ['UNDER_REVIEW'], REJECTED: ['UNDER_REVIEW'] } as Record<string, string[]>)[item.status.trim().toUpperCase().replace(/\s+/g, '_')]?.map((next) => <option key={next} value={next}>{next.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-sm font-semibold transition"
          >
            Close Cluster Inspection
          </button>
        </div>
      </div>
    </div>
  );
}

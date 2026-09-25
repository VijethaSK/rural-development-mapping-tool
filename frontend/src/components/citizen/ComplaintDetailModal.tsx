import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { ComplaintItem } from '../../types/citizen';
import { ComplaintLifecycleTimeline } from './ComplaintLifecycleTimeline';
import { useAuth } from '../../store/auth';
import { apiFetch, apiUrl } from '../../api/client';

interface Props {
  complaint: ComplaintItem | null;
  isOpen: boolean;
  onClose: () => void;
  onVoteToggle?: (id: string) => Promise<void>;
  onCommentAdded?: (id: string, newComment: any) => void;
  onComplaintUpdated?: (updated: ComplaintItem) => void;
}

const complaintIcon = L.divIcon({
  className: 'custom-complaint-pin',
  html: `<div style="background-color: #dc2626; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.4); font-size: 16px;">⚠️</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

const infraIcon = L.divIcon({
  className: 'custom-infra-pin',
  html: `<div style="background-color: #2563eb; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.3); font-size: 15px;">🏛️</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

export function ComplaintDetailModal({
  complaint,
  isOpen,
  onClose,
  onVoteToggle,
  onCommentAdded,
  onComplaintUpdated
}: Props) {
  const { user, token } = useAuth();
  const [activeComplaint, setActiveComplaint] = useState<ComplaintItem | null>(complaint);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronize and fetch fresh details with full lifecycle & available transitions
  React.useEffect(() => {
    if (complaint) {
      setActiveComplaint(complaint);
      const fetchFreshDetails = async () => {
        try {
          const headers: any = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const res = await apiFetch(`/complaints/${complaint._id}`, { headers });
          if (res.ok) {
            const data = await res.json();
            if (data.complaint) {
              setActiveComplaint({
                ...data.complaint,
                lifecycle: data.lifecycle
              });
            }
          }
        } catch (err) {
          console.warn('Could not refresh full complaint lifecycle:', err);
        }
      };
      fetchFreshDetails();
    }
  }, [complaint?._id, isOpen, token]);

  if (!isOpen || !activeComplaint) return null;

  const currentComp = activeComplaint;
  const infra = currentComp.infrastructureId;

  // Determine center coordinates
  let center: [number, number] = [12.9489, 77.7479];
  if (currentComp.location?.coordinates) {
    center = [currentComp.location.coordinates[1], currentComp.location.coordinates[0]];
  } else if (infra?.location?.coordinates) {
    center = [infra.location.coordinates[1], infra.location.coordinates[0]];
  }

  const handleVote = async () => {
    if (!token) {
      alert('Please sign in or register as a citizen to support this grievance.');
      return;
    }
    if (voting) return;
    setVoting(true);
    try {
      if (onVoteToggle) {
        await onVoteToggle(currentComp._id);
      } else {
      const res = await apiFetch(`/complaints/${currentComp._id}/vote`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setActiveComplaint((prev) =>
            prev ? { ...prev, hasVoted: data.hasVoted, upvotesCount: data.upvotesCount } : null
          );
        }
      }
    } catch (err: any) {
      console.error('Vote toggle error:', err);
    } finally {
      setVoting(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    if (!token) {
      alert('Please sign in to join the civic discussion.');
      return;
    }

    setSubmittingComment(true);
    setError(null);
    try {
      const res = await apiFetch(`/complaints/${currentComp._id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text: commentText.trim() })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to post comment');
      }

      const data = await res.json();
      setActiveComplaint((prev) => (prev ? { ...prev, comments: data.comments } : null));
      if (onCommentAdded) {
        onCommentAdded(currentComp._id, data.comments);
      }
      setCommentText('');
    } catch (err: any) {
      setError(err.message || 'Could not post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                {currentComp.category}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                📍 {currentComp.ward} {currentComp.village ? `• ${currentComp.village}` : ''}
              </span>
              <span className="text-xs text-slate-400">
                Filed on {new Date(currentComp.createdAt).toLocaleDateString()}
              </span>
            </div>
            <h3 className="text-xl font-black text-slate-900">{currentComp.title}</h3>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* 1. Visual Lifecycle Stepper & Controlled State Machine Timeline */}
        <ComplaintLifecycleTimeline
          complaintId={currentComp._id}
          currentStatus={currentComp.status}
          statusHistory={currentComp.statusHistory}
          availableTransitions={currentComp.lifecycle?.availableTransitions}
          onTransitionSuccess={(updated) => {
            setActiveComplaint((prev) =>
              prev
                ? {
                    ...prev,
                    ...updated,
                    status: updated.status,
                    statusHistory: updated.statusHistory,
                    lifecycle: updated.lifecycle || prev.lifecycle
                  }
                : null
            );
            if (onComplaintUpdated) onComplaintUpdated(updated);
          }}
        />

        {/* 2. Defect Description & Images */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Grievance Description & Evidence
          </h4>
          <p className="text-sm text-slate-800 bg-slate-50 p-4 rounded-2xl border border-slate-200 leading-relaxed">
            {currentComp.description}
          </p>

          {/* Citizen Photos */}
          {currentComp.images && currentComp.images.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Attached Photo Proof:</span>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {currentComp.images.map((img, i) => (
                  <div key={i} className="rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                    <img
                      src={apiUrl(img.url)}
                      alt={img.caption || 'Grievance proof'}
                      className="w-full h-36 object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    {img.caption && (
                      <p className="p-2 text-[10px] text-slate-500 bg-white truncate">{img.caption}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Linked Infrastructure & Map Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Linked Infrastructure Specs */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Target Infrastructure
              </span>
              <h5 className="text-base font-extrabold text-slate-900 mt-1">
                {infra?.name || 'General Panchayat Sector / Community Ward'}
              </h5>
              <div className="mt-3 space-y-1 text-xs text-slate-600">
                <div>Category: <strong className="text-slate-800">{infra?.type || currentComp.category}</strong></div>
                <div>Condition: <strong className="text-slate-800">{infra?.condition || 'Pending Assessment'}</strong></div>
                {infra?.priorityScore != null && (
                  <div>Calculated Priority Score: <strong className="text-blue-700">{infra.priorityScore}</strong></div>
                )}
              </div>
            </div>

            {/* Support / Upvote Button */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Civic Backing: <strong className="text-slate-800">{currentComp.upvotesCount}</strong> citizen(s)
              </span>
              <button
                onClick={handleVote}
                disabled={voting}
                className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 ${
                  currentComp.hasVoted
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{currentComp.hasVoted ? '✓ Supported' : '👍 Support Grievance'}</span>
                <span className="px-1.5 py-0.2 bg-black/10 rounded-full text-[10px]">
                  {currentComp.upvotesCount}
                </span>
              </button>
            </div>
          </div>

          {/* Interactive GIS Map */}
          <div className="h-56 rounded-2xl overflow-hidden border border-slate-200 shadow-inner relative">
            <MapContainer
              center={center}
              zoom={15}
              style={{ height: '100%', width: '100%' }}
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
              {currentComp.location?.coordinates && (
                <Marker
                  position={[currentComp.location.coordinates[1], currentComp.location.coordinates[0]]}
                  icon={complaintIcon}
                >
                  <Popup>
                    <div className="text-xs p-1">
                      <strong>⚠️ Grievance Location</strong>
                      <p>{currentComp.title}</p>
                    </div>
                  </Popup>
                </Marker>
              )}
              {infra?.location?.coordinates && (
                <Marker
                  position={[infra.location.coordinates[1], infra.location.coordinates[0]]}
                  icon={infraIcon}
                >
                  <Popup>
                    <div className="text-xs p-1">
                      <strong>🏛️ {infra.name}</strong>
                      <p>{infra.type} ({infra.condition})</p>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>

        {/* 4. Civic Comments Discussion */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Citizen Comments & Discussion ({currentComp.comments?.length || 0})
            </h4>
          </div>

          {/* Comments List */}
          <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
            {!currentComp.comments || currentComp.comments.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">
                No comments posted yet. Be the first to share an update or support this issue.
              </p>
            ) : (
              currentComp.comments.map((c, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-800">{c.userName}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          c.userRole === 'admin'
                            ? 'bg-purple-100 text-purple-700'
                            : c.userRole === 'pdo'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {c.userRole}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(c.createdAt).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-slate-700">{c.text}</p>
                </div>
              ))
            )}
          </div>

          {/* Post Comment Input */}
          <form onSubmit={handlePostComment} className="space-y-2">
            {error && <div className="text-xs text-red-600 font-semibold">{error}</div>}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={
                  token ? 'Add a helpful comment or update on this defect...' : 'Sign in to post a comment...'
                }
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                disabled={!token || submittingComment}
                className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!token || submittingComment || !commentText.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-sm"
              >
                {submittingComment ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

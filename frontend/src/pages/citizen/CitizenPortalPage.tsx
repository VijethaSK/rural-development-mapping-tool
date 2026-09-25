import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { ComplaintItem, ComplaintCategory, ComplaintStatus } from '../../types/citizen';
import { ComplaintDetailModal } from '../../components/citizen/ComplaintDetailModal';
import { SubmitComplaintModal } from '../../components/citizen/SubmitComplaintModal';
import { useAuth } from '../../store/auth';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiUrl } from '../../api/client';

const complaintMarkerIcon = (priority: string) => {
  const color =
    priority === 'Critical'
      ? '#dc2626'
      : priority === 'High'
      ? '#f59e0b'
      : priority === 'Medium'
      ? '#2563eb'
      : '#64748b';

  return L.divIcon({
    className: 'custom-comp-marker',
    html: `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); font-size: 13px; color: white;">⚠️</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
};

const infraMarkerIcon = (type: string) => {
  const icon = type === 'School' ? '🏫' : type === 'Road' ? '🛣️' : type === 'Healthcare' ? '🏥' : '🏛️';
  return L.divIcon({
    className: 'custom-infra-marker',
    html: `<div style="background-color: #0284c7; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.3); font-size: 14px;">${icon}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
};

export default function CitizenPortalPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [infrastructures, setInfrastructures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View state: 'list' | 'map'
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Filters
  const [filterMyComplaints, setFilterMyComplaints] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintItem | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  // Notification Toast
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchComplaints = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterMyComplaints) params.append('myComplaints', 'true');
      if (categoryFilter !== 'All') params.append('category', categoryFilter);
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await apiFetch(`/complaints?${params.toString()}`, { headers });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();
      setComplaints(data.complaints || []);
    } catch (err: any) {
      console.error('Error fetching complaints:', err);
      setError(err.message || 'Failed to load complaints');
    } finally {
      setLoading(false);
    }
  };

  const fetchInfrastructure = async () => {
    try {
      const res = await apiFetch('/priorities/candidates');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setInfrastructures(data);
      }
    } catch (err) {
      console.warn('Could not load infrastructure points:', err);
    }
  };

  useEffect(() => {
    fetchComplaints();
    fetchInfrastructure();
  }, [token, filterMyComplaints, categoryFilter, statusFilter]);

  const handleVoteToggle = async (id: string) => {
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const res = await apiFetch(`/complaints/${id}/vote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Vote toggle failed');
      const data = await res.json();

      setComplaints((prev) =>
        prev.map((c) => {
          if (c._id === id) {
            return {
              ...c,
              hasVoted: data.hasVoted,
              upvotesCount: data.upvotesCount
            };
          }
          return c;
        })
      );

      if (selectedComplaint && selectedComplaint._id === id) {
        setSelectedComplaint((prev) =>
          prev ? { ...prev, hasVoted: data.hasVoted, upvotesCount: data.upvotesCount } : null
        );
      }

      showToast(data.hasVoted ? 'Grievance upvoted! Thank you for supporting community action.' : 'Vote removed.', 'info');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCommentAdded = (id: string, updatedComments: any) => {
    setComplaints((prev) =>
      prev.map((c) => (c._id === id ? { ...c, comments: updatedComments } : c))
    );
    if (selectedComplaint && selectedComplaint._id === id) {
      setSelectedComplaint((prev) => (prev ? { ...prev, comments: updatedComments } : null));
    }
    showToast('Your comment was posted to the public ledger.', 'success');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'UNDER_REVIEW':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'PRIORITY_SET':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'ASSIGNED':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'IN_PROGRESS':
        return 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse';
      case 'COMPLETED':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'VERIFIED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold';
      case 'CLOSED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
      case 'REJECTED':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-16 right-6 z-50 p-4 rounded-2xl shadow-xl text-xs font-bold border flex items-center gap-3 transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : 'bg-blue-50 text-blue-800 border-blue-300'
          }`}
        >
          <span>{toast.type === 'success' ? '✓' : 'ℹ️'}</span>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400">✕</button>
        </div>
      )}

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-sky-700 to-indigo-800 rounded-3xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-blue-500/30 border border-blue-400/40 rounded-full text-[11px] font-bold tracking-wide uppercase">
              Citizen Grievance & GIS Portal
            </span>
            {user?.role === 'citizen' && (
              <span className="px-2.5 py-0.5 bg-emerald-500/30 border border-emerald-400/40 rounded-full text-[11px] font-bold">
                ✓ Verified Citizen: {user.name}
              </span>
            )}
          </div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tight">
            Panchayat Citizen Grievance Portal
          </h1>
          <p className="text-xs md:text-sm text-blue-100/90 leading-relaxed">
            Report broken roads, school safety defects, water supply breakdowns, and health facility issues. Track full lifecycle progress from submission to verified resolution.
          </p>
        </div>

        {/* Action Button & Sign In prompt */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="px-6 py-3 bg-white text-blue-700 hover:bg-blue-50 font-black rounded-2xl shadow-lg transition flex items-center justify-center gap-2 text-sm"
          >
            <span>📢</span>
            <span>Report New Issue</span>
          </button>

          {!token && (
            <button
              onClick={() => navigate('/login')}
              className="px-5 py-3 bg-blue-800/80 hover:bg-blue-800 text-white font-bold rounded-2xl border border-blue-400/40 transition text-sm text-center"
            >
              Sign In / Register
            </button>
          )}
        </div>
      </div>

      {/* Controls Bar: Search, Filters, My Complaints Toggle, View Switcher */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full lg:w-80">
          <input
            type="text"
            placeholder="Search grievances by ward, defect, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchComplaints()}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setTimeout(fetchComplaints, 0);
              }}
              className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Badges & Selectors */}
        <div className="flex items-center gap-3 w-full lg:w-auto flex-wrap">
          {/* My Complaints Toggle */}
          {token && (
            <button
              onClick={() => setFilterMyComplaints(!filterMyComplaints)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                filterMyComplaints
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {filterMyComplaints ? '✓ Showing My Reports' : '👤 My Submitted Reports'}
            </button>
          )}

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-semibold">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
            >
              <option value="All">All Categories</option>
              <option value="Road">Roads</option>
              <option value="School">Schools</option>
              <option value="Water">Water Facilities</option>
              <option value="Healthcare">Healthcare</option>
              <option value="Sanitation">Sanitation</option>
              <option value="Electricity">Electricity</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
            >
              <option value="All">All Stages</option>
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

          {/* View Mode Switcher */}
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              📋 List
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              🗺️ GIS Map
            </button>
          </div>
        </div>
      </div>

      {/* Main View Area: List or GIS Map */}
      {viewMode === 'map' ? (
        /* GIS Map View */
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-800">GIS Infrastructure & Grievance Map</span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
                <span>Complaints ({complaints.filter((c) => c.location?.coordinates).length})</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
                <span>Infrastructure ({infrastructures.length})</span>
              </span>
            </div>
            <span className="text-slate-400">Click markers to inspect details</span>
          </div>

          <div className="h-[600px] rounded-2xl overflow-hidden border border-slate-200 relative">
            <MapContainer
              center={[12.9489, 77.7479]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              attributionControl={false}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />

              {/* Infrastructure Markers */}
              {infrastructures.map((infra) => {
                if (!infra.location?.coordinates) return null;
                return (
                  <Marker
                    key={infra._id}
                    position={[infra.location.coordinates[1], infra.location.coordinates[0]]}
                    icon={infraMarkerIcon(infra.type)}
                  >
                    <Popup>
                      <div className="text-xs p-1 space-y-1">
                        <strong className="block font-bold text-slate-900">{infra.name}</strong>
                        <div>Type: {infra.type}</div>
                        <div>Condition: {infra.condition}</div>
                        <div>Ward: {infra.ward}</div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Complaint Markers */}
              {complaints.map((c) => {
                if (!c.location?.coordinates) return null;
                return (
                  <Marker
                    key={c._id}
                    position={[c.location.coordinates[1], c.location.coordinates[0]]}
                    icon={complaintMarkerIcon(c.priority)}
                  >
                    <Popup>
                      <div className="text-xs p-1 space-y-1 max-w-xs">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                          {c.category}
                        </span>
                        <strong className="block font-bold text-slate-900">{c.title}</strong>
                        <p className="text-slate-600 line-clamp-2">{c.description}</p>
                        <div className="pt-1 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-emerald-700">Status: {c.status.replace(/_/g, ' ')}</span>
                          <button
                            onClick={() => setSelectedComplaint(c)}
                            className="text-blue-600 font-bold underline text-[11px]"
                          >
                            Inspect Details →
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </div>
      ) : (
        /* Complaints List View */
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Showing <strong>{complaints.length}</strong> grievance(s)
            </span>
            <span className="text-slate-400">Sorted by newest submission</span>
          </div>

          {loading ? (
            <div className="p-16 text-center text-slate-500 space-y-3 bg-white rounded-3xl border border-slate-200">
              <div className="inline-block animate-spin text-3xl">⚙️</div>
              <div className="font-bold text-sm text-slate-800">Loading citizen grievances...</div>
            </div>
          ) : error ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-center space-y-3">
              <div className="font-bold text-sm text-red-700">{error}</div>
              <button
                onClick={fetchComplaints}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold"
              >
                Retry
              </button>
            </div>
          ) : complaints.length === 0 ? (
            <div className="p-16 text-center space-y-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <div className="text-4xl">🎉</div>
              <h3 className="text-base font-bold text-slate-800">No Complaints Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {filterMyComplaints
                  ? 'You have not submitted any complaints yet. Click "Report New Issue" to file a defect.'
                  : 'No complaints match the current filter selection.'}
              </p>
              <button
                onClick={() => setIsSubmitModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md"
              >
                + Report New Issue
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {complaints.map((c) => (
                <div
                  key={c._id}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    {/* Top Meta */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {c.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(
                          c.status
                        )}`}
                      >
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-slate-900 line-clamp-1">{c.title}</h3>

                    {/* Location */}
                    <div className="text-xs text-slate-500">
                      📍 {c.ward} {c.village ? `• ${c.village}` : ''}
                    </div>

                    {/* Defect Description */}
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      {c.description}
                    </p>

                    {/* Photo thumbnail if present */}
                    {c.images && c.images.length > 0 && (
                      <div className="pt-1 flex items-center gap-2">
                        <img
                          src={apiUrl(c.images[0].url)}
                          alt="Proof"
                          className="w-12 h-12 object-cover rounded-lg border border-slate-200"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <span className="text-[11px] text-slate-400">
                          {c.images.length} photo proof(s) attached
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Vote button and Details button */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => handleVoteToggle(c._id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        c.hasVoted
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <span>{c.hasVoted ? '✓' : '👍'}</span>
                      <span>Support ({c.upvotesCount})</span>
                    </button>

                    <button
                      onClick={() => setSelectedComplaint(c)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 underline py-1"
                    >
                      View Lifecycle & Details →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Complaint Detail Modal */}
      {selectedComplaint && (
        <ComplaintDetailModal
          complaint={selectedComplaint}
          isOpen={!!selectedComplaint}
          onClose={() => setSelectedComplaint(null)}
          onVoteToggle={handleVoteToggle}
          onCommentAdded={handleCommentAdded}
          onComplaintUpdated={(updated) => {
            setComplaints((prev) =>
              prev.map((c) => (c._id === updated._id ? { ...c, ...updated } : c))
            );
            setSelectedComplaint((prev) => (prev ? { ...prev, ...updated } : null));
            showToast(`Grievance status updated to ${updated.status}`, 'info');
          }}
        />
      )}

      {/* Submit Grievance Modal */}
      {isSubmitModalOpen && (
        <SubmitComplaintModal
          isOpen={isSubmitModalOpen}
          onClose={() => setIsSubmitModalOpen(false)}
          onSubmitted={() => {
            fetchComplaints();
            showToast('Grievance lodged successfully! Status set to "Submitted" for Panchayat review.', 'success');
          }}
        />
      )}
    </div>
  );
}

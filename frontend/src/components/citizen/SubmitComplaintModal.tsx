import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ComplaintCategory } from '../../types/citizen';
import { useAuth } from '../../store/auth';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

const pinIcon = L.divIcon({
  className: 'custom-picker-pin',
  html: `<div style="background-color: #ef4444; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.4); font-size: 14px;">📍</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

function MapClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

export function SubmitComplaintModal({ isOpen, onClose, onSubmitted }: Props) {
  const { user, token } = useAuth();

  const [category, setCategory] = useState<ComplaintCategory>('Road');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ward, setWard] = useState(user?.ward || 'Ward 1');
  const [village, setVillage] = useState(user?.village || '');
  const [infrastructureId, setInfrastructureId] = useState('');
  const [infras, setInfras] = useState<any[]>([]);

  // Geolocation
  const [coords, setCoords] = useState<[number, number] | null>([77.7479, 12.9489]);
  const [gpsStatus, setGpsStatus] = useState<string>('Click on map or use GPS button to pinpoint defect location');

  // Images
  const [images, setImages] = useState<{ url: string; caption?: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load infrastructure candidates
  useEffect(() => {
    if (!isOpen) return;
    fetch('/priorities/candidates')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setInfras(data);
        }
      })
      .catch((err) => console.warn('Could not load infrastructure list:', err));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation not supported on this browser');
      return;
    }
    setGpsStatus('Acquiring satellite lock...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        setCoords([lng, lat]);
        setGpsStatus(`✓ Acquired GPS: ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E (±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        setGpsStatus(`Could not acquire GPS: ${err.message}. Please click on map manually.`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/upload', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Failed to upload image');
      const data = await res.json();
      if (data.url) {
        setImages((prev) => [
          ...prev,
          { url: data.url, caption: `Photo evidence: ${file.name}` }
        ]);
      }
    } catch (err: any) {
      setError(err.message || 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please provide a description of the defect.');
      return;
    }
    if (!ward.trim()) {
      setError('Please provide the ward/area name.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        title: title.trim() || description.slice(0, 50),
        description: description.trim(),
        category,
        ward: ward.trim(),
        village: village.trim(),
        infrastructureId: infrastructureId || undefined,
        images
      };

      if (coords) {
        payload.location = {
          type: 'Point',
          coordinates: coords
        };
      }

      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/complaints', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to submit complaint');
      }

      onSubmitted();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-xl font-black text-slate-900">Lodge Infrastructure Grievance</h3>
            <p className="text-xs text-slate-500">
              Submit public defect report with geotagged photo proof for Panchayat inspection.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Category & Linked Infrastructure */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Infrastructure Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500"
              >
                <option value="Road">Road / Pothole / Bridge</option>
                <option value="School">School / Anganwadi</option>
                <option value="Water">Drinking Water / Borewell</option>
                <option value="Healthcare">Health Sub-Center</option>
                <option value="Sanitation">Sanitation / Drain / Waste</option>
                <option value="Electricity">Streetlight / Power</option>
                <option value="Other">Other Community Facility</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Link Known Asset (Optional)</label>
              <select
                value={infrastructureId}
                onChange={(e) => {
                  setInfrastructureId(e.target.value);
                  const selected = infras.find((i) => i._id === e.target.value);
                  if (selected) {
                    if (selected.ward) setWard(selected.ward);
                    if (selected.village) setVillage(selected.village);
                    if (selected.location?.coordinates) {
                      setCoords(selected.location.coordinates);
                    }
                  }
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500"
              >
                <option value="">General Panchayat Area (No specific asset)</option>
                {infras.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name} ({item.type} - {item.ward})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">Issue Summary / Title</label>
            <input
              type="text"
              placeholder="e.g. Deep pothole cluster near Varthur market bus stop"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">Defect Description & Impact *</label>
            <textarea
              rows={3}
              placeholder="Describe the severity, damage, safety hazards to children/traffic, and any immediate risks..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 leading-relaxed"
            />
          </div>

          {/* Ward & Village */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Ward / Sector *</label>
              <input
                type="text"
                placeholder="Ward 1"
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Village / Habitation</label>
              <input
                type="text"
                placeholder="Varthur"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Interactive Map Picker & GPS Button */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700">Geographic Defect Location</label>
              <button
                type="button"
                onClick={handleCaptureGps}
                className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg border border-blue-200 flex items-center gap-1 transition"
              >
                <span>📡</span>
                <span>Use My Current GPS</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500">{gpsStatus}</p>

            <div className="h-44 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
              <MapContainer
                center={coords ? [coords[1], coords[0]] : [12.9489, 77.7479]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                attributionControl={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
                <MapClickPicker
                  onPick={(lat, lng) => {
                    setCoords([lng, lat]);
                    setGpsStatus(`✓ Pin positioned at: ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`);
                  }}
                />
                {coords && (
                  <Marker position={[coords[1], coords[0]]} icon={pinIcon} />
                )}
              </MapContainer>
            </div>
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <label className="font-bold text-slate-700 block">Photo Proof Attachments</label>
            <div className="flex items-center gap-3">
              <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl border border-slate-200 cursor-pointer transition">
                <span>📷 Upload Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {uploading && <span className="text-blue-600 font-semibold animate-pulse">Uploading photo...</span>}
            </div>

            {images.length > 0 && (
              <div className="flex gap-2 flex-wrap pt-1">
                {images.map((img, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                    <img src={img.url} alt="Proof" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50"
            >
              {submitting ? 'Submitting Grievance...' : 'Submit Grievance →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

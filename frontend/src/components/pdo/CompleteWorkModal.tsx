import React, { useState } from 'react';
import { PdoAssignmentItem, CompletionImage } from '../../types/pdoWork';

interface Props {
  assignment: PdoAssignmentItem;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    notes: string;
    completionImages: CompletionImage[];
    completionLocation?: { coordinates: [number, number] };
    actualCost?: number;
  }) => Promise<void>;
}

export function CompleteWorkModal({ assignment, isOpen, onClose, onSubmit }: Props) {
  const [notes, setNotes] = useState<string>('');
  const [actualCost, setActualCost] = useState<string>(
    assignment.allocatedBudget ? String(assignment.allocatedBudget) : ''
  );
  const [images, setImages] = useState<CompletionImage[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [gpsCoords, setGpsCoords] = useState<[number, number] | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>('Ready to acquire GPS coordinates');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation not supported by this browser');
      return;
    }

    setGpsStatus('Acquiring satellite lock...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        setGpsCoords([lng, lat]);
        setGpsAccuracy(Math.round(pos.coords.accuracy));
        setGpsStatus(`✓ Acquired GPS: ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E (±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        console.warn('GPS capture error:', err);
        setGpsStatus(`Could not acquire field GPS: ${err.message}. Completion requires a location capture.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
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

      if (!res.ok) throw new Error('Failed to upload image file');

      const data = await res.json();
      if (data.url) {
        setImages((prev) => [
          ...prev,
          {
            url: data.url,
            caption: `Completion proof - ${file.name}`,
            uploadedAt: new Date().toISOString()
          }
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
    if (!notes.trim()) {
      setError('Please provide completion notes summarizing work performed.');
      return;
    }
    if (!images.length) { setError('Upload at least one completion evidence image.'); return; }
    if (!gpsCoords) { setError('Capture the current field location before submitting completion.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        notes: notes.trim(),
        completionImages: images,
        completionLocation: gpsCoords ? { coordinates: gpsCoords } : undefined,
        actualCost: actualCost ? Number(actualCost) : undefined
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit work completion');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 block">
              Field Work Completion Audit
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              Submit Completion: {assignment.assignmentNumber}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Target Infrastructure */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="text-slate-500 font-medium block">Asset:</span>
            <span className="text-sm font-bold text-slate-800 block">
              {assignment.infrastructureId?.name || assignment.title}
            </span>
            <span className="text-slate-600 text-[11px] block">
              Location: {assignment.infrastructureId?.ward} {assignment.infrastructureId?.village ? `• ${assignment.infrastructureId.village}` : ''}
            </span>
          </div>

          {/* 1. Completion Notes */}
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              Completion Notes & Work Description <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe materials deployed, repairs executed, quality test observations, and current operational state..."
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              required
            />
          </div>

          {/* 2. GPS Location Capture */}
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              Field Geolocation Evidence (GPS) <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCaptureGps}
                className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-xl border border-indigo-200 transition flex items-center gap-1.5"
              >
                <span>📍</span> Acquire Current Location
              </button>
              <span className={`text-[11px] font-medium ${gpsCoords ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                {gpsStatus}
              </span>
            </div>
          </div>

          {/* 3. Image Upload Evidence */}
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              Photo Evidence of Completed Repair <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <label className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-xl border border-blue-200 cursor-pointer transition flex items-center gap-1.5">
                <span>📷</span> Upload Completion Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {uploading && <span className="text-blue-600 font-medium">Uploading photo...</span>}
            </div>

            {/* Uploaded Images Preview */}
            {images.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative rounded-lg overflow-hidden border border-slate-200">
                    <img src={img.url} alt={img.caption} className="w-full h-20 object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] p-1 truncate block">
                      {img.caption}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Actual Repair Expenditure */}
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              Actual Execution Cost (INR ₹)
            </label>
            <div className="flex items-center border border-slate-300 rounded-xl px-3 py-2 bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500">
              <span className="text-slate-500 font-bold mr-1.5">₹</span>
              <input
                type="number"
                value={actualCost}
                onChange={(e) => setActualCost(e.target.value)}
                placeholder="45000"
                className="bg-transparent w-full text-slate-900 font-semibold focus:outline-none"
              />
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Allocated Budget: ₹{assignment.allocatedBudget?.toLocaleString('en-IN') || 0}
            </span>
          </div>

          {/* Advisory Notice */}
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 text-[11px] leading-relaxed">
            ℹ️ <strong>Workflow Requirement:</strong> After submitting completion, this task status becomes{' '}
            <strong className="text-purple-700">"Completed / Awaiting Verification"</strong>. An administrator must inspect and verify the repair before the work order and associated complaint are closed.
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploading || !notes.trim() || !images.length || !gpsCoords}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {submitting ? 'Submitting Completion...' : '✓ Submit Completion for Verification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

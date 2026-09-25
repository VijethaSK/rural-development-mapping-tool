import React, { useState, useEffect } from 'react';
import { PriorityConfig, PriorityWeights } from '../types/priority';
import { api, apiAuth } from '../api/client';
import { useAuth } from '../store/auth';

interface PriorityConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
}

export default function PriorityConfigModal({
  isOpen,
  onClose,
  onConfigSaved,
}: PriorityConfigModalProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Weights in percentage (0 - 100) for user friendly UI
  const [weights, setWeights] = useState({
    condition: 30,
    complaints: 20,
    population: 15,
    traffic: 15,
    maintenanceAge: 10,
    alternativeDistance: 10,
  });

  const [thresholds, setThresholds] = useState({
    critical: 80,
    high: 60,
    medium: 40,
  });

  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    api<{ config: PriorityConfig }>('/api/priorities/config')
      .then((data) => {
        if (data.config?.weights) {
          setWeights({
            condition: Math.round(data.config.weights.condition * 100),
            complaints: Math.round(data.config.weights.complaints * 100),
            population: Math.round(data.config.weights.population * 100),
            traffic: Math.round(data.config.weights.traffic * 100),
            maintenanceAge: Math.round(data.config.weights.maintenanceAge * 100),
            alternativeDistance: Math.round(data.config.weights.alternativeDistance * 100),
          });
        }
        if (data.config?.thresholds) {
          setThresholds(data.config.thresholds);
        }
        if (data.config?.notes) {
          setNotes(data.config.notes);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch config, using defaults', err);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const totalPercentage =
    weights.condition +
    weights.complaints +
    weights.population +
    weights.traffic +
    weights.maintenanceAge +
    weights.alternativeDistance;

  const isValidTotal = totalPercentage === 100;

  const handleWeightChange = (key: keyof typeof weights, value: number) => {
    setWeights((prev) => ({
      ...prev,
      [key]: isNaN(value) ? 0 : Math.max(0, Math.min(100, value)),
    }));
  };

  const handleSave = async () => {
    if (!isValidTotal) {
      setError(`Weights must sum to exactly 100%. Current sum is ${totalPercentage}%.`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    const payloadWeights: PriorityWeights = {
      condition: weights.condition / 100,
      complaints: weights.complaints / 100,
      population: weights.population / 100,
      traffic: weights.traffic / 100,
      maintenanceAge: weights.maintenanceAge / 100,
      alternativeDistance: weights.alternativeDistance / 100,
    };

    try {
      const call = token
        ? apiAuth('/api/priorities/config', token, {
            method: 'PUT',
            body: JSON.stringify({
              weights: payloadWeights,
              thresholds,
              notes: notes || 'Updated via Admin Priority Control Panel',
            }),
          })
        : api('/api/priorities/config', {
            method: 'PUT',
            body: JSON.stringify({
              weights: payloadWeights,
              thresholds,
              notes: notes || 'Updated via Admin Priority Control Panel',
            }),
          });

      await call;
      setSuccess(true);
      setTimeout(() => {
        onConfigSaved();
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Failed to update priority configuration.');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setWeights({
      condition: 30,
      complaints: 20,
      population: 15,
      traffic: 15,
      maintenanceAge: 10,
      alternativeDistance: 10,
    });
    setThresholds({
      critical: 80,
      high: 60,
      medium: 40,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-xl w-full p-6 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b pb-3 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              ⚙️ Multi-Criteria Priority Weights Configuration
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tune decision criteria weights to reflect Panchayat policy guidelines. Total must equal 100%.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl p-1 leading-none rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading current configuration...</div>
        ) : (
          <div className="mt-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-lg">
                ⚠️ {error}
              </div>
            )}
            {success && (
              <div className="p-3 bg-green-50 dark:bg-green-950/40 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 text-sm rounded-lg">
                ✓ Priority weights updated and recalculation initiated!
              </div>
            )}

            {/* Sum Tracker Banner */}
            <div
              className={`p-3 rounded-lg border flex items-center justify-between font-medium text-sm ${
                isValidTotal
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-300 text-red-800 dark:text-red-300'
              }`}
            >
              <span>Total Configured Weight:</span>
              <span className="font-mono font-bold text-base">
                {totalPercentage}% {isValidTotal ? '✓ (Valid)' : `❌ (${totalPercentage > 100 ? '+' : ''}${totalPercentage - 100}% off)`}
              </span>
            </div>

            {/* Weights Sliders */}
            <div className="space-y-3">
              {[
                { key: 'condition', label: 'Physical Condition', desc: 'Structural wear, distress & defect rating' },
                { key: 'complaints', label: 'Citizen Complaints', desc: 'Active community grievances count' },
                { key: 'population', label: 'Population Served', desc: 'Beneficiary village & school population' },
                { key: 'traffic', label: 'Traffic / Utilization', desc: 'Volume of vehicles / daily visitors' },
                { key: 'maintenanceAge', label: 'Maintenance Age', desc: 'Days elapsed since last repair' },
                { key: 'alternativeDistance', label: 'Alternative Distance', desc: 'Isolation / distance to nearest facility' },
              ].map(({ key, label, desc }) => {
                const k = key as keyof typeof weights;
                return (
                  <div key={key} className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between items-center text-sm">
                      <div>
                        <span className="font-semibold">{label}</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={weights[k]}
                          onChange={(e) => handleWeightChange(k, parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1 text-right font-mono border rounded dark:bg-slate-800 dark:border-slate-700"
                        />
                        <span className="text-xs text-slate-500 font-mono">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={weights[k]}
                      onChange={(e) => handleWeightChange(k, parseInt(e.target.value) || 0)}
                      className="w-full mt-2 accent-blue-600"
                    />
                  </div>
                );
              })}
            </div>

            {/* Threshold Settings */}
            <div className="mt-4 border-t pt-3 dark:border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Classification Thresholds (Score out of 100)
              </h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="text-slate-600 dark:text-slate-400">Critical (&gt;=)</label>
                  <input
                    type="number"
                    value={thresholds.critical}
                    onChange={(e) => setThresholds({ ...thresholds, critical: parseInt(e.target.value) || 80 })}
                    className="w-full mt-1 px-2 py-1 border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-600 dark:text-slate-400">High (&gt;=)</label>
                  <input
                    type="number"
                    value={thresholds.high}
                    onChange={(e) => setThresholds({ ...thresholds, high: parseInt(e.target.value) || 60 })}
                    className="w-full mt-1 px-2 py-1 border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-600 dark:text-slate-400">Medium (&gt;=)</label>
                  <input
                    type="number"
                    value={thresholds.medium}
                    onChange={(e) => setThresholds({ ...thresholds, medium: parseInt(e.target.value) || 40 })}
                    className="w-full mt-1 px-2 py-1 border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Policy Notes */}
            <div className="mt-2">
              <label className="text-xs text-slate-500 font-medium">Policy Notes / Revision Justification</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Monsoon 2026 priority revision favoring road drainage & complaints"
                className="w-full mt-1 px-3 py-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-between pt-4 border-t dark:border-slate-800">
              <button
                type="button"
                onClick={resetToDefaults}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
              >
                Reset to Standard Defaults
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 border rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!isValidTotal || saving}
                  onClick={handleSave}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition ${
                    isValidTotal && !saving
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-slate-400 cursor-not-allowed'
                  }`}
                >
                  {saving ? 'Saving...' : 'Save & Recalculate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

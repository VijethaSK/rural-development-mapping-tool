import React from 'react';
import { RankedInfrastructure, PriorityExplanation } from '../types/priority';

interface ScoreExplanationModalProps {
  asset: RankedInfrastructure | null;
  onClose: () => void;
}

export default function ScoreExplanationModal({ asset, onClose }: ScoreExplanationModalProps) {
  if (!asset) return null;

  if (asset.priorityScore == null || asset.priorityLevel === 'Unavailable') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
        <div className="max-w-lg w-full rounded-xl bg-white dark:bg-slate-900 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex justify-between gap-4">
            <div><span className="text-xs uppercase text-slate-500">{asset.type}</span><h2 className="text-xl font-bold">{asset.name}</h2></div>
            <button onClick={onClose} aria-label="Close modal" className="text-2xl">×</button>
          </div>
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Priority score unavailable. This source record does not contain enough verified condition, complaint, population, traffic, maintenance, or accessibility data for a defensible score.
          </p>
          {asset.missingDataFields && <p className="mt-2 text-sm text-slate-600">Missing fields: {asset.missingDataFields.join(', ') || 'Not specified'}</p>}
        </div>
      </div>
    );
  }
  const score = asset.priorityScore;

  const explanation: PriorityExplanation | undefined =
    asset.priorityExplanation || (asset as any).explanation;
  const factors = explanation?.factors;

  const getPriorityBadgeClass = (level: string) => {
    switch (level) {
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

  const getProgressBarColor = (score: number) => {
    if (score >= 80) return 'bg-red-600';
    if (score >= 60) return 'bg-orange-500';
    if (score >= 40) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const factorRows = factors
    ? [
        {
          key: 'condition',
          name: 'Physical Condition',
          icon: '🏗️',
          description: 'Structural integrity & distress evaluation',
          data: factors.condition,
        },
        {
          key: 'complaints',
          name: 'Citizen Complaints',
          icon: '📢',
          description: 'Direct community reports & unresolved grievances',
          data: factors.complaints,
        },
        {
          key: 'population',
          name: 'Population Served',
          icon: '👥',
          description: 'Residents and students dependent on this asset',
          data: factors.population,
        },
        {
          key: 'traffic',
          name: 'Traffic / Utilization',
          icon: '🚗',
          description: 'Volume of movement & public usage intensity',
          data: factors.traffic,
        },
        {
          key: 'maintenanceAge',
          name: 'Maintenance Age',
          icon: '⏳',
          description: 'Elapsed time since last formal repair/service',
          data: factors.maintenanceAge,
        },
        {
          key: 'alternativeDistance',
          name: 'Alternative Distance',
          icon: '📍',
          description: 'Distance to closest backup facility or main road',
          data: factors.alternativeDistance,
        },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-3xl w-full p-6 my-8 text-slate-900 dark:text-slate-100 transition-all max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                {asset.type}
              </span>
              {asset.habitationName && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Habitation: {asset.habitationName}
                </span>
              )}
              {asset.wardNumber != null && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Ward #{asset.wardNumber}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold mt-1 text-slate-900 dark:text-white">
              {asset.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl font-light leading-none p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Priority Hero Box */}
        <div className="mt-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                Multi-Criteria Priority Index
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-extrabold tracking-tight">
                  {score.toFixed(1)}
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                  / 100
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:items-end">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border ${getPriorityBadgeClass(
                  asset.priorityLevel
                )}`}
              >
                ● {asset.priorityLevel} Priority
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {asset.priorityLevel === 'Critical' && 'Requires immediate Panchayat intervention'}
                {asset.priorityLevel === 'High' && 'Scheduled for upcoming maintenance cycle'}
                {asset.priorityLevel === 'Medium' && 'Routine monitoring and inspection'}
                {asset.priorityLevel === 'Low' && 'In sound working condition'}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(
                score
              )}`}
              style={{ width: `${Math.min(100, Math.max(2, score))}%` }}
            />
          </div>
        </div>

        {/* Human Readable Summary */}
        {explanation?.summary && (
          <div className="mt-4 p-3.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex gap-3 items-start">
            <div className="text-blue-600 dark:text-blue-400 text-lg mt-0.5">ℹ️</div>
            <div>
              <div className="text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
                Automated Decision Rationale
              </div>
              <p className="text-sm text-blue-900 dark:text-blue-200 mt-0.5 leading-relaxed">
                {explanation.summary}
              </p>
            </div>
          </div>
        )}

        {/* Breakdown Table */}
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Mathematical Factor Contribution Breakdown
          </h3>
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800/80 text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 border-b dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Factor</th>
                  <th className="py-2.5 px-3">Raw Value</th>
                  <th className="py-2.5 px-3 text-right">Norm. Score (0-100)</th>
                  <th className="py-2.5 px-3 text-right">Weight (W)</th>
                  <th className="py-2.5 px-3 text-right">Points Added (W × S)</th>
                  <th className="py-2.5 px-3 text-right">% of Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {factorRows.map((f) => {
                  const percentOfTotal =
                    score > 0
                      ? ((f.data.contribution / score) * 100).toFixed(1)
                      : '0.0';

                  return (
                    <tr key={f.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3">
                        <div className="font-medium flex items-center gap-1.5">
                          <span>{f.icon}</span>
                          <span>{f.name}</span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 pl-6">
                          {f.description}
                        </div>
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {String(f.data.raw)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs">
                        <span className="font-semibold">{f.data.score}</span> / 100
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                        {(f.data.weight * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                        +{f.data.contribution.toFixed(2)} pts
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-xs text-slate-500">
                        {percentOfTotal}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800 font-bold border-t border-slate-300 dark:border-slate-700">
                <tr>
                  <td className="py-2.5 px-3" colSpan={3}>
                    Final Simple Additive Weighting (SAW) Sum:
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">100%</td>
                  <td className="py-2.5 px-3 text-right font-mono text-sm text-blue-600 dark:text-blue-400">
                    {score.toFixed(2)} pts
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Explainability methodology note */}
        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <p>
            <strong>Decision Support Formula:</strong> Priority score is computed dynamically via{' '}
            <em>Simple Additive Weighting (SAW)</em>: Score = ∑(Weight × Normalized Factor). All factors
            are scaled to a standard 0–100 scale to guarantee transparent, unbiased prioritization
            free of arbitrary rank distortion.
          </p>
        </div>

        {/* Modal Actions */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-sm font-semibold transition"
          >
            Close Breakdown
          </button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { PriorityAvailability } from '../types/priority';
import { getPriorityAvailabilityDisplay } from '../utils/priorityDashboardScope.mjs';

interface PriorityAvailabilityDetailsProps {
  availability?: PriorityAvailability | null;
}

export default function PriorityAvailabilityDetails({ availability }: PriorityAvailabilityDetailsProps) {
  const details = getPriorityAvailabilityDisplay(availability);
  const provenance = details.coordinateProvenance;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-700 dark:text-slate-300">{details.reason}</p>

      <section aria-label="Missing data preventing priority scoring">
        <h4 className="font-semibold text-slate-800 dark:text-slate-100">Missing data preventing priority scoring</h4>
        {details.missingScoringInputs.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-slate-600 dark:text-slate-300">
            {details.missingScoringInputs.map((input) => <li key={input.code}>{input.label}</li>)}
          </ul>
        ) : !details.hasStructuredAvailability ? (
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            A detailed scoring-input assessment is unavailable for this response.
          </p>
        ) : (
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            No missing scoring inputs were identified. The source record remains unavailable under the current eligibility policy.
          </p>
        )}
      </section>

      {(details.dataQualityWarnings.length > 0 || provenance) && (
        <section aria-label="Coordinate and data-quality warnings" className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
          <h4 className="font-semibold text-amber-900 dark:text-amber-200">Coordinate / data-quality warnings</h4>
          {details.dataQualityWarnings.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-amber-900 dark:text-amber-100">
              {details.dataQualityWarnings.map((warning) => <li key={warning.code}>{warning.message}</li>)}
            </ul>
          )}
          {provenance && (
            <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
              Coordinate provenance: {provenance.source ?? 'not recorded'}; status: {provenance.status ?? 'not recorded'}; verified: {provenance.verified == null ? 'not recorded' : provenance.verified ? 'yes' : 'no'}.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

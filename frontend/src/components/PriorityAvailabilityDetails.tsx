import React from 'react';
import { PriorityAvailability, PriorityEvidenceFactorReadiness, PriorityScoringProfileSummary } from '../types/priority';
import { getPriorityAvailabilityDisplay } from '../utils/priorityDashboardScope.mjs';

interface PriorityAvailabilityDetailsProps {
  availability?: PriorityAvailability | null;
  scoringProfile?: PriorityScoringProfileSummary;
  factorReadiness?: PriorityEvidenceFactorReadiness[];
  applicableFactors?: string[];
}

const factorLabels: Record<string, string> = {
  condition: 'Condition',
  complaintsCount: 'Complaints',
  populationServed: 'Population Served',
  trafficLevel: 'Utilization',
  lastMaintenanceDate: 'Maintenance Age',
  alternativeDistanceKm: 'Accessibility'
};

const stateLabels: Record<string, string> = {
  APPLICABLE_MISSING: 'Missing',
  READY: 'Ready · accepted evidence',
  PENDING_VERIFICATION: 'Pending review',
  REJECTED: 'Rejected',
  NOT_APPLICABLE: 'Not applicable',
  UNRESOLVED: 'Unresolved'
};

export default function PriorityAvailabilityDetails({ availability, scoringProfile, factorReadiness, applicableFactors }: PriorityAvailabilityDetailsProps) {
  const details = getPriorityAvailabilityDisplay(availability);
  const provenance = details.coordinateProvenance;
  const evidenceReadiness = availability?.evidenceReadiness;
  const readiness = factorReadiness?.length ? factorReadiness : details.factorReadiness;
  const factors = readiness.length
    ? readiness.filter((factor) => !applicableFactors?.length || applicableFactors.includes(factor.factor))
    : [];

  return (
    <div className="space-y-3 text-sm">
      {scoringProfile && (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50" aria-label="Scoring profile">
          <h4 className="font-semibold text-slate-800 dark:text-slate-100">Scoring profile</h4>
          <p className="mt-1 text-slate-700 dark:text-slate-300">
            {scoringProfile.status === 'APPROVED' ? 'Active approved profile' : scoringProfile.status === 'LEGACY' ? 'Legacy scoring profile' : 'Profile unavailable'}
            {scoringProfile.profileId ? ` · ${scoringProfile.profileId} v${scoringProfile.profileVersion}` : ''}
          </p>
          {scoringProfile.reason && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{scoringProfile.reason}</p>}
        </section>
      )}

      {evidenceReadiness && (
        <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-700" aria-label="Evidence readiness status">
          <h4 className="font-semibold text-slate-800 dark:text-slate-100">Evidence readiness</h4>
          <p className="mt-1 text-slate-700 dark:text-slate-300">
            {evidenceReadiness.status}
            {evidenceReadiness.recordScope ? ` · Scope: ${evidenceReadiness.recordScope}` : ''}
          </p>
        </section>
      )}

      <p className="text-slate-700 dark:text-slate-300">{details.reason}</p>

      <section aria-label="Missing data preventing priority scoring">
        <h4 className="font-semibold text-slate-800 dark:text-slate-100">Factor readiness</h4>
        {factors.length > 0 ? (
          <ul className="mt-1 space-y-1.5 text-slate-600 dark:text-slate-300">
            {factors.map((factor) => (
              <li key={factor.factor} className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="font-medium">{factorLabels[factor.factor] || factor.factor}</span>
                <span className="sm:text-right">
                  <span className={factor.state === 'READY' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
                    {stateLabels[factor.state] || factor.state}
                  </span>
                  {factor.reason && <span className="block text-xs text-slate-500 dark:text-slate-400">{factor.reason}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <h5 className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Missing data preventing priority scoring</h5>
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
          </>
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
          {details.dataQualityWarnings.length > 0 && (
            <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
              These warnings describe data quality; they are not presented as scoring blockers unless the readiness details say so.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

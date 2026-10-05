import type { PriorityAvailability, PriorityStats, RankedInfrastructure } from '../types/priority';

export function resolveInitialPriorityPanchayat(
  panchayats: Array<{ _id: string; name: string }>,
  requestedId: string | null
): { selectedId: string; error: string | null };
export function updatePrioritySearchParams(current: URLSearchParams, panchayatId: string | null): URLSearchParams;
export function buildPriorityRequestPath(panchayatId: string): string;
export function parsePriorityResponse(response: unknown): { items: RankedInfrastructure[]; stats: PriorityStats };
export function isScoredPriority(item: RankedInfrastructure): boolean;
export function getUnavailablePriorityItems(items: RankedInfrastructure[]): RankedInfrastructure[];
export function shouldShowUnavailablePrioritySection(input: {
  loading: boolean;
  error: string | null;
  items: RankedInfrastructure[];
}): boolean;
export function getPriorityAvailabilityDisplay(availability?: PriorityAvailability | null): {
  hasStructuredAvailability: boolean;
  reason: string;
  missingScoringInputs: PriorityAvailability['missingScoringInputs'];
  dataQualityWarnings: PriorityAvailability['dataQualityWarnings'];
  coordinateProvenance: PriorityAvailability['coordinateProvenance'] | null;
};
export function getPriorityDisplaySummary(items: RankedInfrastructure[], stats: PriorityStats): {
  total: number;
  scored: number;
  unscored: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  averageScore: number | null;
};
export function getPriorityEmptyState(input: {
  selectedPanchayat: boolean;
  panchayatCount: number;
  selectionError: string | null;
  items: RankedInfrastructure[];
  stats: PriorityStats | null;
  scoredCount: number;
  filteredCount: number;
}): 'invalid-selection' | 'no-panchayats' | 'select-panchayat' | 'no-assets' | 'inconsistent-response' | 'none-scorable' | 'filters-empty' | null;
export function filterAndSortPriorityItems(
  items: RankedInfrastructure[],
  filters: { typeFilter: string; priorityFilter: string; searchTerm: string; sortBy: 'score' | 'complaints' | 'population' }
): RankedInfrastructure[];

export interface PriorityRequest {
  generation: number;
  panchayatId: string;
  lifecycleId: number;
}
export interface PriorityRequestGate {
  activate(): number;
  deactivate(lifecycleId: number): boolean;
  select(panchayatId: string | null): void;
  begin(panchayatId: string): PriorityRequest | null;
  isCurrent(request: PriorityRequest | null): boolean;
  invalidateIfCurrent(request: PriorityRequest | null): boolean;
}
export function createPriorityRequestGate(): PriorityRequestGate;
export function applyPriorityResultIfCurrent(gate: PriorityRequestGate, request: PriorityRequest, effect: () => void): boolean;

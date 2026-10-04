export interface GapPanchayatOption {
  _id: string;
  name: string;
}

export interface GapAnalysisRequest {
  generation: number;
  panchayatId: string;
  lifecycleId: number;
}

export interface GapAnalysisRequestGate {
  activate(): number;
  deactivate(lifecycleId: number): boolean;
  select(panchayatId?: string | null): void;
  begin(panchayatId?: string | null): GapAnalysisRequest | null;
  isCurrent(request: GapAnalysisRequest | null): boolean;
  invalidateIfCurrent(request: GapAnalysisRequest | null): boolean;
}

export function resolveInitialGapPanchayat(
  panchayats: readonly GapPanchayatOption[],
  requestedId: string | null
): { selectedId: string; error: string | null };
export function createGapAnalysisRequestGate(): GapAnalysisRequestGate;
export function applyGapAnalysisIfCurrent(
  gate: GapAnalysisRequestGate,
  request: GapAnalysisRequest | null,
  effect: () => void
): boolean;
export function deriveGapAnalysisMapCenter(
  result: {
    schoolBuffers?: readonly { center?: { lat: number; lng: number } | null }[];
    underservedAreas?: readonly { center?: { lat: number; lng: number } | null }[];
  } | null
): [number, number] | null;

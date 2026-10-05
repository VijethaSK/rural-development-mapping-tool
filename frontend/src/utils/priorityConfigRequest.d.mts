export interface PriorityConfigRequest {
  generation: number;
  panchayatId: string;
}

export interface PriorityConfigRequestGate {
  begin(panchayatId: string): PriorityConfigRequest | null;
  invalidate(request: PriorityConfigRequest | null): boolean;
  isCurrent(request: PriorityConfigRequest | null, context: {
    isOpen: boolean;
    panchayatId: string;
  }): boolean;
}

export interface ValidPriorityConfigResponse {
  weights: {
    condition: number;
    complaints: number;
    population: number;
    traffic: number;
    maintenanceAge: number;
    alternativeDistance: number;
  };
  thresholds: {
    critical: number;
    high: number;
    medium: number;
  };
  notes?: string | null;
  [key: string]: unknown;
}

export function createPriorityConfigRequestGate(): PriorityConfigRequestGate;
export function commitPriorityConfigRequestIfCurrent(
  gate: PriorityConfigRequestGate,
  request: PriorityConfigRequest | null,
  context: { isOpen: boolean; panchayatId: string },
  effect: () => void
): boolean;
export function parsePriorityConfigResponse(response: unknown): ValidPriorityConfigResponse;
export function canSavePriorityConfiguration(context: {
  isOpen: boolean;
  isLoading: boolean;
  loadSucceeded: boolean;
  loadedPanchayatId: string | null;
  selectedPanchayatId: string;
}): boolean;

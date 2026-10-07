interface MapRequest {
  generation: number;
  panchayatId: string;
  lifecycleId: number | null;
}

interface MapRequestGate {
  activate(): number;
  deactivate(lifecycleId: number): boolean;
  select(panchayatId?: string | null): void;
  invalidate(): boolean;
  begin(panchayatId?: string | null): MapRequest | null;
  isCurrent(request: MapRequest | null): boolean;
}

interface MapBootstrapGuard {
  isActive(): boolean;
  run(effect: () => void): boolean;
  cleanup(): void;
}

interface MapCenterPanchayat {
  _id?: string;
  centerCoord?: { lat: number; lng: number } | null;
  coordinatesVerified?: boolean;
  coordinateStatus?: string;
  coordinateSource?: string | null;
  dataOrigin?: string;
  isSynthetic?: boolean;
  source?: string;
}

interface MapCenterAsset {
  panchayatId?: string;
  coordinatesVerified?: boolean;
  coordinateStatus?: string;
  coordinateSource?: string | null;
  dataOrigin?: string;
  isSynthetic?: boolean;
  source?: string;
  location?: {
    coordinates?: unknown;
    lat?: unknown;
    lng?: unknown;
  };
}

export function createMapRequestGate(): MapRequestGate;
export function createMapBootstrapGuard(): MapBootstrapGuard;
export function commitMapDataIfCurrent<T>(
  gate: MapRequestGate,
  request: MapRequest | null,
  cacheKey: string,
  data: T,
  cache: Record<string, T>,
  apply: (data: T) => void
): boolean;
export function runMapRequestIfCurrent(
  gate: MapRequestGate,
  request: MapRequest | null,
  effect: () => void
): boolean;
export function deriveScopedMapCenter(
  panchayat: MapCenterPanchayat | null,
  assets: readonly MapCenterAsset[]
): [number, number] | null;

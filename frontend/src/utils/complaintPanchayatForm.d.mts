export interface ComplaintPanchayat {
  _id: string;
  name: string;
  wards?: string[];
  villages?: string[];
  habitations?: Array<{ name: string; ward: string }>;
  centerCoord?: { lat: number; lng: number };
}

export function normalizeComplaintPanchayats(value: unknown): ComplaintPanchayat[];
export function resetComplaintPanchayatFields(): { infrastructureId: string; ward: string; village: string; assets: never[] };
export function selectComplaintPanchayat(panchayatId: string): { selectedPanchayatId: string; infrastructureId: string; ward: string; village: string; assets: never[] };
export function shouldUseAssetLocation(currentCoordinates: [number, number] | null): boolean;
export function complaintAssetPanchayatQuery(panchayatId: string): string | null;
export function filterComplaintAssetsByPanchayat<T extends { panchayatId?: unknown }>(items: T[], panchayatId: string): T[];

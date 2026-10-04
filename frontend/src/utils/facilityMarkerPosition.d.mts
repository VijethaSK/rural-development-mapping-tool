export function toFacilityMarkerPosition(location: {
  coordinates?: readonly unknown[] | null;
  lat?: unknown;
  lng?: unknown;
} | null | undefined): [number, number] | null;

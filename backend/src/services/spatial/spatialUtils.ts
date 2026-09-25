import { Coordinate, GeoPolygon } from './types.js';

export class SpatialUtils {
  private static readonly EARTH_RADIUS_KM = 6371.0;

  /**
   * Geodesic Haversine Distance between two geographic coordinates in kilometers.
   */
  public static haversineDistanceKm(c1: Coordinate, c2: Coordinate): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(c2.lat - c1.lat);
    const dLng = toRad(c2.lng - c1.lng);
    const lat1 = toRad(c1.lat);
    const lat2 = toRad(c2.lat);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Number((this.EARTH_RADIUS_KM * c).toFixed(3));
  }

  /**
   * Shortest distance from point P to line segment AB in kilometers.
   */
  public static distanceToSegmentKm(p: Coordinate, a: Coordinate, b: Coordinate): number {
    // Local planar projection centered at point A
    const cosLat = Math.cos((p.lat * Math.PI) / 180);
    const kx = 111.32 * cosLat; // km per degree longitude
    const ky = 110.57; // km per degree latitude

    const px = p.lng * kx;
    const py = p.lat * ky;
    const ax = a.lng * kx;
    const ay = a.lat * ky;
    const bx = b.lng * kx;
    const by = b.lat * ky;

    const dx = bx - ax;
    const dy = by - ay;
    const segLengthSq = dx * dx + dy * dy;

    if (segLengthSq === 0) {
      return this.haversineDistanceKm(p, a);
    }

    // Projection parameter t
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segLengthSq));
    const projX = ax + t * dx;
    const projY = ay + t * dy;

    const distSq = (px - projX) * (px - projX) + (py - projY) * (py - projY);
    return Number(Math.sqrt(distSq).toFixed(3));
  }

  /**
   * Distance from point P to a road polyline (array of [lng, lat] coordinates) in kilometers.
   */
  public static distanceToPolylineKm(p: Coordinate, coordinates: [number, number][]): number {
    if (!coordinates || coordinates.length === 0) return Infinity;
    if (coordinates.length === 1) {
      return this.haversineDistanceKm(p, { lat: coordinates[0][1], lng: coordinates[0][0] });
    }

    let minDistance = Infinity;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const a: Coordinate = { lat: coordinates[i][1], lng: coordinates[i][0] };
      const b: Coordinate = { lat: coordinates[i + 1][1], lng: coordinates[i + 1][0] };
      const d = this.distanceToSegmentKm(p, a, b);
      if (d < minDistance) {
        minDistance = d;
      }
    }
    return minDistance;
  }

  /**
   * Generate circular buffer polygon coordinates around a center point for service area visualization.
   */
  public static createRadialBufferPolygon(
    center: Coordinate,
    radiusKm: number,
    numPoints = 32
  ): GeoPolygon {
    const ring: [number, number][] = [];
    const latRad = (center.lat * Math.PI) / 180;
    const degLatPerKm = 1 / 110.574;
    const degLngPerKm = 1 / (111.32 * Math.cos(latRad));

    for (let i = 0; i < numPoints; i++) {
      const angle = (i * 2 * Math.PI) / numPoints;
      const dLng = radiusKm * Math.cos(angle) * degLngPerKm;
      const dLat = radiusKm * Math.sin(angle) * degLatPerKm;

      ring.push([
        Number((center.lng + dLng).toFixed(6)),
        Number((center.lat + dLat).toFixed(6))
      ]);
    }
    // Close polygon ring
    ring.push([ring[0][0], ring[0][1]]);

    return {
      type: 'Polygon',
      coordinates: [ring]
    };
  }

  /**
   * Generate uniform spatial grid cells across a bounding box for gap detection.
   */
  public static generateSpatialGrid(
    bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    resolutionKm = 0.8
  ): Array<{ id: string; center: Coordinate; polygon: GeoPolygon }> {
    const cells: Array<{ id: string; center: Coordinate; polygon: GeoPolygon }> = [];
    if (!Number.isFinite(resolutionKm) || resolutionKm <= 0 || ![bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng].every(Number.isFinite) || bounds.maxLat <= bounds.minLat || bounds.maxLng <= bounds.minLng || bounds.minLat < -90 || bounds.maxLat > 90 || bounds.minLng < -180 || bounds.maxLng > 180) return cells;

    const avgLat = (bounds.minLat + bounds.maxLat) / 2;
    const degLatStep = resolutionKm / 110.574;
    const degLngStep = resolutionKm / (111.32 * Math.cos((avgLat * Math.PI) / 180));
    const estimatedCells = Math.ceil((bounds.maxLat - bounds.minLat) / degLatStep) * Math.ceil((bounds.maxLng - bounds.minLng) / degLngStep);
    if (!Number.isFinite(estimatedCells) || estimatedCells > 10000) throw new Error('Spatial grid exceeds the 10,000-cell safety limit; increase grid resolution or reduce bounds.');

    let row = 0;
    for (let lat = bounds.minLat; lat < bounds.maxLat; lat += degLatStep) {
      let col = 0;
      for (let lng = bounds.minLng; lng < bounds.maxLng; lng += degLngStep) {
        const nextLat = Math.min(lat + degLatStep, bounds.maxLat + degLatStep * 0.1);
        const nextLng = Math.min(lng + degLngStep, bounds.maxLng + degLngStep * 0.1);

        const center: Coordinate = {
          lat: Number(((lat + nextLat) / 2).toFixed(6)),
          lng: Number(((lng + nextLng) / 2).toFixed(6))
        };

        const ring: [number, number][] = [
          [Number(lng.toFixed(6)), Number(lat.toFixed(6))],
          [Number(nextLng.toFixed(6)), Number(lat.toFixed(6))],
          [Number(nextLng.toFixed(6)), Number(nextLat.toFixed(6))],
          [Number(lng.toFixed(6)), Number(nextLat.toFixed(6))],
          [Number(lng.toFixed(6)), Number(lat.toFixed(6))]
        ];

        cells.push({
          id: `cell-r${row}-c${col}`,
          center,
          polygon: {
            type: 'Polygon',
            coordinates: [ring]
          }
        });
        col++;
      }
      row++;
    }

    return cells;
  }
}

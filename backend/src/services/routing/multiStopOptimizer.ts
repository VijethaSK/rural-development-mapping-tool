import { Coordinate, StopCandidate, OrderedStop, RouteOptimizationOptions, RouteOptimizationResult, IRoutingProvider, ShortestPathResult } from './types.js';
import { RoadGraph } from './graph.js';
import { getRoutingProvider } from './routingProvider.js';

export const MAX_ROUTE_STOPS = 50;

export class MultiStopOptimizer {
  public static validateCoordinate(coord: Coordinate, label = 'Coordinate'): void {
    if (!coord || !Number.isFinite(coord.lat) || !Number.isFinite(coord.lng) || coord.lat < -90 || coord.lat > 90 || coord.lng < -180 || coord.lng > 180) {
      throw new Error(`Invalid ${label}: latitude/longitude must be finite and within geographic bounds.`);
    }
  }

  /** Identical IDs are duplicate requests; distinct assets at the same place remain separate stops. */
  public static deduplicateStops(stops: StopCandidate[]): StopCandidate[] {
    const seen = new Set<string>();
    return stops.filter(stop => {
      if (!stop.infrastructureId || seen.has(stop.infrastructureId)) return false;
      seen.add(stop.infrastructureId);
      return true;
    });
  }

  public static formatArrivalTime(startHour = 9, startMinute = 0, elapsedMinutes = 0): string {
    const total = startHour * 60 + startMinute + Math.round(elapsedMinutes);
    const h24 = Math.floor(total / 60) % 24;
    const mins = total % 60;
    return `${String(h24 % 12 || 12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
  }

  public static async optimizeRoute(start: Coordinate, inputStops: StopCandidate[], options: RouteOptimizationOptions = {}, customProvider?: IRoutingProvider): Promise<RouteOptimizationResult> {
    this.validateCoordinate(start, 'start location');
    if (!Array.isArray(inputStops)) throw new Error('maintenanceLocations must be an array.');
    if (inputStops.length > MAX_ROUTE_STOPS) throw new Error(`A route may contain at most ${MAX_ROUTE_STOPS} stops.`);
    inputStops.forEach((s, i) => this.validateCoordinate(s.location, `maintenance location #${i + 1}`));
    const stops = this.deduplicateStops(inputStops);
    const algorithm = { shortestPath: 'Dijkstra' as const, ordering: 'Priority-Weighted Nearest Neighbor' as const, improvement: '2-opt' as const, description: 'Dijkstra calculates each network leg; priority-weighted nearest-neighbor ordering and 2-opt are heuristics for sequencing stops, not an exact multi-stop shortest-path solution.' };
    if (!stops.length) return { orderedStops: [], routeGeometry: { type: 'LineString', coordinates: [[start.lng, start.lat]] }, totalDistanceKm: 0, totalDistanceMeters: 0, estimatedDurationMinutes: 0, routingMethod: 'NETWORK_ROUTE', fallbackUsed: false, unreachableStops: [], stopsCount: 0, originalDistanceKm: 0, optimizedDistanceKm: 0, distanceSavingsKm: 0, savingsPercent: 0, algorithm, explanation: { summary: 'No maintenance stops provided.', tradeoffRationale: algorithm.description, stopOrderReasons: [] } };
    const speed = options.averageSpeedKmph ?? 30;
    if (!Number.isFinite(speed) || speed <= 0 || speed > 120) throw new Error('averageSpeedKmph must be greater than 0 and no more than 120.');
    const weight = options.priorityWeight ?? 1.4;
    if (!Number.isFinite(weight) || weight < 0 || weight > 3) throw new Error('priorityWeight must be between 0 and 3.');
    const provider = customProvider || await getRoutingProvider(options.panchayatId);
    const points = [start, ...stops.map(s => s.location)];
    const matrix = await provider.getDistanceMatrix(points);
    const D = matrix.distancesMeters;
    const unreachableIndices = new Set<number>();
    // Identify destinations unreachable from the start before ordering. No leg is invented.
    for (let i = 1; i < points.length; i++) if (!Number.isFinite(D[0][i])) unreachableIndices.add(i);
    const remaining = new Set<number>(Array.from({ length: stops.length }, (_, i) => i + 1).filter(i => !unreachableIndices.has(i)));
    const order: number[] = [];
    let current = 0;
    while (remaining.size) {
      let best = -1, bestCost = Infinity;
      for (const i of remaining) {
        const p = Math.max(0, stops[i - 1].priorityScore || 0) / 100;
        const cost = D[current][i] / (1 + weight * Math.pow(p, 1.5));
        if (Number.isFinite(cost) && cost < bestCost) { best = i; bestCost = cost; }
      }
      if (best < 0) { for (const i of remaining) unreachableIndices.add(i); break; }
      order.push(best); remaining.delete(best); current = best;
    }
    // 2-opt reversals are accepted only if every resulting edge is reachable.
    if ((options.apply2Opt ?? true) && order.length > 2) {
      const cost = (o: number[]) => {
        let total = D[0][o[0]];
        for (let i = 0; i < o.length - 1; i++) total += D[o[i]][o[i + 1]];
        for (let i = 0; i < o.length; i++) total += i * Math.max(0, stops[o[i] - 1].priorityScore || 0) / 100 * 1200;
        return total;
      };
      let improved = true, rounds = 0;
      while (improved && rounds++ < 80) {
        improved = false;
        for (let i = 0; i < order.length - 1 && !improved; i++) for (let k = i + 1; k < order.length; k++) {
          const candidate = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
          if (candidate.every((id, j) => Number.isFinite(D[j === 0 ? 0 : candidate[j - 1]][id])) && cost(candidate) < cost(order) - 10) { order.splice(0, order.length, ...candidate); improved = true; break; }
        }
      }
    }
    let meters = 0, elapsed = 0, last = 0, fallbackUsed = false;
    let allNetwork = true;
    const coords: [number, number][] = [];
    const orderedStops: OrderedStop[] = [];
    for (let n = 0; n < order.length; n++) {
      const idx = order[n], stop = stops[idx - 1];
      const path: ShortestPathResult = matrix.paths[last][idx];
      if (!path?.reachable || !Number.isFinite(path.distanceMeters)) { unreachableIndices.add(idx); continue; }
      const legKm = path.distanceMeters / 1000;
      meters += path.distanceMeters;
      fallbackUsed ||= path.fallbackUsed;
      allNetwork &&= path.routingMethod === 'NETWORK_ROUTE';
      if (allNetwork) elapsed += (legKm / speed) * 60;
      if (path.coordinates.length) coords.push(...(coords.length ? path.coordinates.slice(1) : path.coordinates));
      const arrival = allNetwork ? elapsed : undefined;
      orderedStops.push({ sequence: orderedStops.length + 1, infrastructureId: stop.infrastructureId, infrastructureName: stop.infrastructureName || `Asset ${stop.infrastructureId}`, type: stop.type, location: stop.location, priorityScore: stop.priorityScore, priorityLevel: stop.priorityLevel, distanceFromPreviousKm: Number(legKm.toFixed(2)), cumulativeDistanceKm: Number((meters / 1000).toFixed(2)), ...(arrival == null ? {} : { estimatedArrivalMinutes: Math.round(arrival), estimatedArrivalTime: this.formatArrivalTime(9, 0, arrival) }), routingMethod: path.routingMethod, reasonForOrder: `Stop #${orderedStops.length + 1}: priority-weighted nearest-neighbor sequencing; road distance calculated for this leg by ${path.algorithm}.` });
      // Maintenance inspection buffer is assumed and added only to network travel estimate.
      if (allNetwork) elapsed += 15;
      last = idx;
    }
    const unreachableStops = [...unreachableIndices].map(i => ({ infrastructureId: stops[i - 1].infrastructureId, infrastructureName: stops[i - 1].infrastructureName || `Asset ${stops[i - 1].infrastructureId}`, reason: 'No network path from the start or previously reachable route segment; stop excluded from route geometry.' }));
    const totalKm = Number((meters / 1000).toFixed(2));
    const original = order.reduce((sum, idx, n) => sum + D[n === 0 ? 0 : order[n - 1]][idx], 0);
    const originalKm = Number((original / 1000).toFixed(2));
    const savings = Number(Math.max(0, originalKm - totalKm).toFixed(2));
    const summary = `${orderedStops.length} reachable stop(s), ${totalKm} km by ${fallbackUsed ? 'straight-line fallback for at least one leg' : 'network routing'}${unreachableStops.length ? `; ${unreachableStops.length} stop(s) unreachable` : ''}.`;
    return { orderedStops, routeGeometry: { type: 'LineString', coordinates: coords.length ? coords : [[start.lng, start.lat]] }, totalDistanceKm: totalKm, totalDistanceMeters: Math.round(meters), estimatedDurationMinutes: allNetwork ? Math.round(elapsed) : null, routingMethod: fallbackUsed ? 'STRAIGHT_LINE_FALLBACK' : 'NETWORK_ROUTE', fallbackUsed, unreachableStops, stopsCount: orderedStops.length, originalDistanceKm: Number.isFinite(originalKm) ? originalKm : undefined, optimizedDistanceKm: totalKm, distanceSavingsKm: savings, savingsPercent: originalKm > 0 ? Number((savings / originalKm * 100).toFixed(1)) : 0, algorithm, explanation: { summary, tradeoffRationale: algorithm.description, stopOrderReasons: orderedStops.map(s => `${s.sequence}. ${s.infrastructureName}: ${s.reasonForOrder}`) } };
  }
}

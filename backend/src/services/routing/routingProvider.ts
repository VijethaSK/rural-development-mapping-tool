import {
  Coordinate,
  ShortestPathResult,
  DistanceMatrixResult,
  IRoutingProvider,
  ProviderRouteResult,
  RoutingMethod
} from './types.js';
import { RoadGraph, RoadLineInput } from './graph.js';
import { DijkstraShortestPath } from './dijkstra.js';
import { Road } from '../../models/Infrastructure.js';
import { env } from '../../config/env.js';
import { parseRoutingConfiguration, type RoutingConfiguration } from '../../config/routing.js';
import { OsrmRoutingProvider } from './osrmRoutingProvider.js';

export interface RoadDocumentForRouting {
  _id?: unknown;
  name?: string;
  lineGeometry?: unknown;
  geometry?: unknown;
  location?: unknown;
  coordinatesVerified?: boolean;
  coordinateSource?: string | null;
  coordinateStatus?: string;
}

interface ValidRoadLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

function isValidRoadLineString(value: unknown): value is ValidRoadLineString {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; coordinates?: unknown };
  return candidate.type === 'LineString' &&
    Array.isArray(candidate.coordinates) &&
    candidate.coordinates.length >= 2 &&
    candidate.coordinates.every((coordinate) =>
      Array.isArray(coordinate) &&
      coordinate.length === 2 &&
      typeof coordinate[0] === 'number' && Number.isFinite(coordinate[0]) &&
      coordinate[0] >= -180 && coordinate[0] <= 180 &&
      typeof coordinate[1] === 'number' && Number.isFinite(coordinate[1]) &&
      coordinate[1] >= -90 && coordinate[1] <= 90
    );
}

/** Point locations are deliberately ignored: only valid stored LineStrings add road edges. */
export function roadDocumentsToLineInputs(roads: readonly RoadDocumentForRouting[]): RoadLineInput[] {
  const inputs: RoadLineInput[] = [];
  for (const road of roads) {
    const line = isValidRoadLineString(road.lineGeometry)
      ? road.lineGeometry
      : isValidRoadLineString(road.geometry)
        ? road.geometry
        : null;
    if (!line) continue;
    inputs.push({
      _id: road._id == null ? undefined : String(road._id),
      name: road.name,
      coordinates: line.coordinates
    });
  }
  return inputs;
}

/**
 * Concrete Dijkstra Road Graph Routing Provider.
 * Implements IRoutingProvider interface behind a clean service boundary.
 */
export class DijkstraRoadGraphProvider implements IRoutingProvider {
  public readonly name = 'Dijkstra Road Graph Engine';
  public readonly provider = 'INTERNAL' as const;
  private graph: RoadGraph;

  constructor(graph?: RoadGraph) {
    this.graph = graph || new RoadGraph();
  }

  public getRoadGraph(): RoadGraph {
    return this.graph;
  }

  /**
   * Populate graph from database roads for a specific Panchayat.
   */
  public async loadFromDatabase(panchayatId?: string): Promise<number> {
    const filter: any = {};
    if (panchayatId) {
      filter.panchayatId = panchayatId;
    }

    const roads = await Road.find(filter).lean();
    const roadInputs = roadDocumentsToLineInputs(roads);
    this.graph.addRoads(roadInputs);
    return this.graph.nodeCount;
  }

  public async findShortestPath(
    start: Coordinate,
    end: Coordinate
  ): Promise<ShortestPathResult> {
    const result = DijkstraShortestPath.findShortestPath(this.graph, start, end);
    return {
      ...result,
      durationSeconds: null,
      provider: this.provider,
      method: result.fallbackUsed ? 'HAVERSINE_FALLBACK' : 'DIJKSTRA'
    };
  }

  /**
   * Compute a directed N x N matrix. This internal graph is bidirectional,
   * but matrix consumers must not assume other providers are symmetric.
   */
  public async getDistanceMatrix(points: Coordinate[]): Promise<DistanceMatrixResult> {
    const n = points.length;
    const matrix: DistanceMatrixResult['matrix'] = Array.from({ length: n }, () => new Array(n));
    const methods = new Set<RoutingMethod>();
    let fallbackUsed = false;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = {
            reachable: true,
            distanceMeters: 0,
            durationSeconds: 0,
            provider: this.provider,
            method: 'DIJKSTRA',
            fallbackUsed: false
          };
          methods.add('DIJKSTRA');
        } else if (j > i) {
          const pathRes = await this.findShortestPath(points[i], points[j]);
          const distanceMeters = pathRes.reachable && Number.isFinite(pathRes.distanceMeters)
            ? pathRes.distanceMeters
            : null;
          matrix[i][j] = {
            reachable: distanceMeters !== null,
            distanceMeters,
            durationSeconds: null,
            provider: pathRes.provider,
            method: pathRes.method,
            fallbackUsed: pathRes.fallbackUsed
          };
          matrix[j][i] = {
            reachable: distanceMeters !== null,
            distanceMeters,
            durationSeconds: null,
            provider: pathRes.provider,
            method: pathRes.method,
            fallbackUsed: pathRes.fallbackUsed
          };
          methods.add(pathRes.method);
          fallbackUsed ||= pathRes.fallbackUsed;
        }
      }
    }

    return {
      points,
      matrix,
      provider: this.provider,
      methodsUsed: [...methods],
      fallbackUsed
    };
  }

  /** Build geometry only for the final selected order, not for every matrix pair. */
  public async getRoute(orderedPoints: Coordinate[]): Promise<ProviderRouteResult> {
    const legs: ShortestPathResult[] = [];
    const coordinates: [number, number][] = [];
    const methods = new Set<RoutingMethod>();
    let distanceMeters = 0;
    let totalDurationSeconds = 0;
    let hasDurationForEveryLeg = true;
    let reachable = true;
    let fallbackUsed = false;

    for (let i = 0; i < orderedPoints.length - 1; i++) {
      const leg = await this.findShortestPath(orderedPoints[i], orderedPoints[i + 1]);
      legs.push(leg);
      methods.add(leg.method);
      fallbackUsed ||= leg.fallbackUsed;
      if (!leg.reachable || !Number.isFinite(leg.distanceMeters)) {
        reachable = false;
        continue;
      }
      distanceMeters += leg.distanceMeters;
      if (leg.durationSeconds == null) hasDurationForEveryLeg = false;
      else totalDurationSeconds += leg.durationSeconds;
      if (leg.coordinates.length) {
        coordinates.push(...(coordinates.length ? leg.coordinates.slice(1) : leg.coordinates));
      }
    }

    if (orderedPoints.length === 1) {
      coordinates.push([orderedPoints[0].lng, orderedPoints[0].lat]);
      methods.add('DIJKSTRA');
    } else if (orderedPoints.length === 0) {
      methods.add('DIJKSTRA');
    }

    return {
      reachable,
      geometry: { type: 'LineString', coordinates },
      distanceMeters: reachable ? distanceMeters : null,
      durationSeconds: reachable && hasDurationForEveryLeg ? totalDurationSeconds : null,
      legs,
      provider: this.provider,
      methodsUsed: [...methods],
      fallbackUsed
    };
  }
}

/**
 * Service abstraction factory. Provider selection is configuration; each
 * returned provider reports the engine that actually supplied its metrics.
 */
export async function getRoutingProvider(
  panchayatId?: string,
  customGraph?: RoadGraph,
  providerConfiguration?: RoutingConfiguration
): Promise<IRoutingProvider> {
  // A supplied graph is the existing explicit Dijkstra/test path. Production
  // selection remains server-side and does not alter reported provider identity.
  const configuration = providerConfiguration ?? (customGraph
    ? { providerSelection: 'INTERNAL' as const }
    : { providerSelection: env.ROUTING_PROVIDER, osrmBaseUrl: env.OSRM_BASE_URL });
  const selectedConfiguration = parseRoutingConfiguration(
    configuration.providerSelection,
    configuration.osrmBaseUrl
  );
  if (selectedConfiguration.providerSelection === 'OSRM') {
    // parseRoutingConfiguration guarantees this value for OSRM selection.
    return new OsrmRoutingProvider(selectedConfiguration.osrmBaseUrl!);
  }

  const provider = new DijkstraRoadGraphProvider(customGraph);
  if (!customGraph) {
    await provider.loadFromDatabase(panchayatId);
  }
  return provider;
}

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
import { Infrastructure, Road } from '../../models/Infrastructure.js';
import { env } from '../../config/env.js';
import { parseRoutingConfiguration, type RoutingConfiguration } from '../../config/routing.js';
import { OsrmRoutingProvider } from './osrmRoutingProvider.js';
import { getExplicitSyntheticDemoPoint, getExplicitSyntheticDemoRoadLineString, getVerifiedRoadLineString, isExplicitSyntheticDemoRecord } from '../spatial/spatialCoordinateEligibility.js';
import { GAP_ANALYSIS_DEMO_SOURCE } from '../spatial/gapAnalysisDemoProvenance.js';
import { Panchayat } from '../../models/Panchayat.js';

export interface RoadDocumentForRouting {
  _id?: unknown;
  name?: string;
  lineGeometry?: unknown;
  geometry?: unknown;
  location?: unknown;
  coordinatesVerified?: boolean;
  coordinateSource?: string | null;
  coordinateStatus?: string;
  dataOrigin?: string;
  isSynthetic?: boolean;
  source?: string;
}

/** Point locations are deliberately ignored: only valid stored LineStrings add road edges. */
export function roadDocumentsToLineInputs(roads: readonly RoadDocumentForRouting[]): RoadLineInput[] {
  const inputs: RoadLineInput[] = [];
  for (const road of roads) {
    const line = getVerifiedRoadLineString(road);
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

/**
 * Builds an internal road graph only for the isolated demo preview. This path
 * does not change roadDocumentsToLineInputs or the trusted production gate.
 */
export async function getSyntheticDemoRoutingProvider(panchayatId: string): Promise<IRoutingProvider> {
  const panchayat: any = await Panchayat.findById(panchayatId).lean();
  if (!panchayat || panchayat.source !== GAP_ANALYSIS_DEMO_SOURCE || panchayat.dataOrigin !== 'SYNTHETIC_DEMO' ||
      panchayat.isSynthetic !== true || panchayat.coordinatesVerified !== false ||
      panchayat.coordinateSource !== 'SYNTHETIC' || panchayat.coordinateStatus !== 'DEMO_ONLY') {
    throw new Error('Synthetic route preview requires an explicitly marked demonstration Panchayat.');
  }
  const roads: any[] = await Road.find({ panchayatId, source: GAP_ANALYSIS_DEMO_SOURCE, syntheticDemoRoles: 'GAP_ANALYSIS_ROAD' }).lean();
  const lineInputs: RoadLineInput[] = roads.flatMap((road) => {
    const line = getExplicitSyntheticDemoRoadLineString(road);
    return isExplicitSyntheticDemoRecord(road) && road.syntheticDemoRoles?.includes('GAP_ANALYSIS_ROAD') && line
      ? [{ _id: String(road._id), name: road.name, coordinates: line.coordinates }]
      : [];
  });
  if (!lineInputs.length) throw new Error('No synthetic demonstration road geometry is available for route preview.');
  const graph = new RoadGraph();
  graph.addRoads(lineInputs);
  return new DijkstraRoadGraphProvider(graph);
}

export async function getSyntheticDemoRouteCandidates(panchayatId: string): Promise<Array<Record<string, unknown>>> {
  const records: any[] = await Infrastructure.find({
    panchayatId,
    source: GAP_ANALYSIS_DEMO_SOURCE,
    syntheticDemoRoles: 'ROUTE_STOP'
  }).lean();
  return records.flatMap((record) => {
    const location = getExplicitSyntheticDemoPoint(record);
    if (!isExplicitSyntheticDemoRecord(record) || !record.syntheticDemoRoles?.includes('ROUTE_STOP') || !location) return [];
    return [{
      _id: String(record._id),
      panchayatId: String(record.panchayatId),
      name: record.name,
      type: record.type,
      condition: null,
      complaintsCount: null,
      populationServed: null,
      priorityScore: 0,
      priorityLevel: 'Unavailable',
      location,
      syntheticDemo: true
    }];
  });
}

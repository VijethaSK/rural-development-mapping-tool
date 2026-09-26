import {
  Coordinate,
  ShortestPathResult,
  DistanceMatrixResult,
  IRoutingProvider
} from './types.js';
import { RoadGraph, RoadLineInput } from './graph.js';
import { DijkstraShortestPath } from './dijkstra.js';
import { Road } from '../../models/Infrastructure.js';

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
    return result;
  }

  /**
   * Efficiently compute N x N pairwise shortest paths and distance matrix.
   */
  public async getDistanceMatrix(points: Coordinate[]): Promise<DistanceMatrixResult> {
    const n = points.length;
    const distancesMeters: number[][] = Array.from({ length: n }, () =>
      new Array(n).fill(0)
    );
    const paths: ShortestPathResult[][] = Array.from({ length: n }, () =>
      new Array(n)
    );

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          distancesMeters[i][j] = 0;
          paths[i][j] = {
            source: points[i],
            target: points[j],
            distanceMeters: 0,
            coordinates: [[points[i].lng, points[i].lat]],
            reachable: true,
            algorithm: 'Dijkstra',
            routingMethod: 'NETWORK_ROUTE',
            fallbackUsed: false
          };
        } else if (j > i) {
          // Compute forward path
          const pathRes = await this.findShortestPath(points[i], points[j]);
          distancesMeters[i][j] = pathRes.distanceMeters;
          paths[i][j] = pathRes;

          // For bidirectional road graphs, reverse path for [j][i]
          distancesMeters[j][i] = pathRes.distanceMeters;
          paths[j][i] = {
            source: points[j],
            target: points[i],
            distanceMeters: pathRes.distanceMeters,
            coordinates: [...pathRes.coordinates].reverse(),
            reachable: pathRes.reachable,
            algorithm: pathRes.algorithm,
            routingMethod: pathRes.routingMethod,
            fallbackUsed: pathRes.fallbackUsed,
            snapDistanceMeters: pathRes.snapDistanceMeters
          };
        }
      }
    }

    return {
      points,
      distancesMeters,
      paths
    };
  }
}

/**
 * Service Abstraction Factory.
 * If external providers (e.g. OSRM, Valhalla) are configured in future,
 * they can be swapped here without touching route optimization logic.
 */
export async function getRoutingProvider(
  panchayatId?: string,
  customGraph?: RoadGraph
): Promise<IRoutingProvider> {
  const provider = new DijkstraRoadGraphProvider(customGraph);
  if (!customGraph) {
    await provider.loadFromDatabase(panchayatId);
  }
  return provider;
}

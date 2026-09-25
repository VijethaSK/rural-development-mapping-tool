import {
  Coordinate,
  ShortestPathResult,
  DistanceMatrixResult,
  IRoutingProvider
} from './types.js';
import { RoadGraph } from './graph.js';
import { DijkstraShortestPath } from './dijkstra.js';
import { Road } from '../../models/Infrastructure.js';

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
    const roadInputs = [];
    for (const r of roads) {
      const coords =
        r.lineGeometry?.coordinates ||
        (r.geometry as any)?.coordinates;
      if (coords && coords.length >= 2) {
        roadInputs.push({
          _id: r._id,
          name: r.name,
          coordinates: coords
        });
      }
    }
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

import { Coordinate, ShortestPathResult } from './types.js';
import { RoadGraph } from './graph.js';

interface HeapItem {
  nodeId: string;
  distance: number;
}

/**
 * Standard Binary Min-Heap Priority Queue for optimal Dijkstra performance.
 */
class MinHeap {
  private heap: HeapItem[] = [];

  public get size(): number {
    return this.heap.length;
  }

  public push(item: HeapItem): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  public pop(): HeapItem | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIdx = Math.floor((index - 1) / 2);
      if (this.heap[index].distance >= this.heap[parentIdx].distance) break;
      this.swap(index, parentIdx);
      index = parentIdx;
    }
  }

  private bubbleDown(index: number): void {
    const len = this.heap.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < len && this.heap[left].distance < this.heap[smallest].distance) {
        smallest = left;
      }
      if (right < len && this.heap[right].distance < this.heap[smallest].distance) {
        smallest = right;
      }
      if (smallest === index) break;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}

export class DijkstraShortestPath {
  /**
   * Run Dijkstra's algorithm between two specific node IDs on the RoadGraph.
   */
  public static findPathBetweenNodes(
    graph: RoadGraph,
    sourceNodeId: string,
    targetNodeId: string
  ): {
    distanceMeters: number;
    pathNodeIds: string[];
    geometry: [number, number][];
    reachable: boolean;
  } {
    if (sourceNodeId === targetNodeId) {
      const node = graph.getNode(sourceNodeId);
      return {
        distanceMeters: 0,
        pathNodeIds: [sourceNodeId],
        geometry: node ? [[node.coord.lng, node.coord.lat]] : [],
        reachable: true
      };
    }

    const distances = new Map<string, number>();
    const previous = new Map<
      string,
      {
        nodeId: string;
        geometry: [number, number][];
        weight: number;
      }
    >();

    const pq = new MinHeap();

    distances.set(sourceNodeId, 0);
    pq.push({ nodeId: sourceNodeId, distance: 0 });

    let targetReached = false;

    while (pq.size > 0) {
      const current = pq.pop()!;
      const u = current.nodeId;

      // Skip stale heap entries
      if (current.distance > (distances.get(u) ?? Infinity)) {
        continue;
      }

      if (u === targetNodeId) {
        targetReached = true;
        break;
      }

      const uNode = graph.getNode(u);
      if (!uNode) continue;

      for (const edge of uNode.edges) {
        const v = edge.to;
        const alt = current.distance + edge.weightMeters;
        const currentBest = distances.get(v) ?? Infinity;

        if (alt < currentBest) {
          distances.set(v, alt);
          previous.set(v, {
            nodeId: u,
            geometry: edge.geometry,
            weight: edge.weightMeters
          });
          pq.push({ nodeId: v, distance: alt });
        }
      }
    }

    if (!targetReached) {
      return {
        distanceMeters: Infinity,
        pathNodeIds: [],
        geometry: [],
        reachable: false
      };
    }

    // Reconstruct path
    const pathNodeIds: string[] = [];
    const geometry: [number, number][] = [];
    let curr = targetNodeId;

    while (curr !== sourceNodeId) {
      pathNodeIds.unshift(curr);
      const prevEdge = previous.get(curr);
      if (!prevEdge) break;

      // Add edge geometry (excluding first point to avoid duplicates when stitching)
      const edgeGeom = [...prevEdge.geometry];
      if (geometry.length > 0 && edgeGeom.length > 0) {
        edgeGeom.pop(); // remove duplicate connection
      }
      geometry.unshift(...edgeGeom);

      curr = prevEdge.nodeId;
    }
    pathNodeIds.unshift(sourceNodeId);

    const targetDist = distances.get(targetNodeId) || 0;
    return {
      distanceMeters: targetDist,
      pathNodeIds,
      geometry,
      reachable: true
    };
  }

  /**
   * High-level Dijkstra: Finds shortest path between any two geographical coordinates.
   * Snaps coordinates to graph nodes, runs Dijkstra, and stitches first/last mile.
   */
  public static findShortestPath(
    graph: RoadGraph,
    source: Coordinate,
    target: Coordinate
  ): ShortestPathResult {
    // 1. Identical coordinates check
    const directHaversine = RoadGraph.haversineDistanceMeters(source, target);
    if (directHaversine < 1.0) {
      return {
        source,
        target,
        distanceMeters: 0,
        coordinates: [[source.lng, source.lat]],
        reachable: true,
        algorithm: 'Dijkstra',
        routingMethod: 'NETWORK_ROUTE',
        fallbackUsed: false
      };
    }

    // If graph is empty or has no nodes, fallback to direct geodesic
    if (graph.nodeCount === 0) {
      return {
        source,
        target,
        distanceMeters: directHaversine,
        coordinates: [
          [source.lng, source.lat],
          [target.lng, target.lat]
        ],
        reachable: true,
        algorithm: 'Straight-line Haversine fallback',
        routingMethod: 'STRAIGHT_LINE_FALLBACK',
        fallbackUsed: true
      };
    }

    // Snap to nearest road segments, then connect virtual endpoint nodes to both segment ends.
    const snapSource = graph.findNearestSegment(source);
    const snapTarget = graph.findNearestSegment(target);

    if (!snapSource || !snapTarget) {
      // Unreachable in graph
      return {
        source,
        target,
        distanceMeters: directHaversine,
        coordinates: [
          [source.lng, source.lat],
          [target.lng, target.lat]
        ],
        reachable: true,
        algorithm: 'Straight-line Haversine fallback',
        routingMethod: 'STRAIGHT_LINE_FALLBACK',
        fallbackUsed: true
      };
    }

    const routedGraph = graph.clone();
    const sourceId = 'virtual-route-source';
    const targetId = 'virtual-route-target';
    const connectSnap = (id: string, origin: Coordinate, snap: NonNullable<typeof snapSource>) => {
      routedGraph.addNode(origin, id);
      const seg = snap.segment;
      const endpoints = [
        { id: seg.fromId, coord: seg.from },
        { id: seg.toId, coord: seg.to }
      ];
      for (const endpoint of endpoints) {
        const along = RoadGraph.haversineDistanceMeters(snap.point, endpoint.coord);
        const geometry = ([
          [origin.lng, origin.lat], [snap.point.lng, snap.point.lat], [endpoint.coord.lng, endpoint.coord.lat]
        ] as [number, number][]).filter((point, i, all) => i === 0 || point[0] !== all[i - 1][0] || point[1] !== all[i - 1][1]);
        routedGraph.addEdge(id, endpoint.id, snap.distanceMeters + along, geometry, seg.roadId, seg.roadName, true);
      }
    };
    connectSnap(sourceId, source, snapSource);
    connectSnap(targetId, target, snapTarget);
    // If both endpoints project to the same stored road segment, allow the direct
    // along-segment path; routing only through an endpoint would add a false detour.
    const sameSegment = snapSource.segment.fromId === snapTarget.segment.fromId && snapSource.segment.toId === snapTarget.segment.toId;
    if (sameSegment) {
      const along = RoadGraph.haversineDistanceMeters(snapSource.point, snapTarget.point);
      const geometry: [number, number][] = [[source.lng, source.lat], [snapSource.point.lng, snapSource.point.lat], [snapTarget.point.lng, snapTarget.point.lat], [target.lng, target.lat]];
      routedGraph.addEdge(sourceId, targetId, snapSource.distanceMeters + along + snapTarget.distanceMeters, geometry, snapSource.segment.roadId, snapSource.segment.roadName, true);
    }

    // 3. Run Dijkstra on graph
    const dijkstraRes = this.findPathBetweenNodes(
      routedGraph,
      sourceId,
      targetId
    );

    if (!dijkstraRes.reachable) {
      // Disconnected graph components
      return {
        source,
        target,
        distanceMeters: Infinity,
        coordinates: [],
        reachable: false,
        algorithm: 'Dijkstra',
        routingMethod: 'NETWORK_ROUTE',
        fallbackUsed: false,
        snapDistanceMeters: { source: snapSource.distanceMeters, target: snapTarget.distanceMeters }
      };
    }

    return {
      source,
      target,
      distanceMeters: Number(dijkstraRes.distanceMeters.toFixed(2)),
      coordinates: dijkstraRes.geometry,
      reachable: true,
      algorithm: 'Dijkstra',
      routingMethod: 'NETWORK_ROUTE',
      fallbackUsed: false,
      snapDistanceMeters: { source: snapSource.distanceMeters, target: snapTarget.distanceMeters }
    };
  }
}

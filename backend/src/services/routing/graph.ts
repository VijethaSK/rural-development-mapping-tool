import { Coordinate, GraphNode, GraphEdge } from './types.js';

export interface RoadLineInput { _id?: any; name?: string; coordinates: [number, number][] }
export interface RoadSegment {
  fromId: string; toId: string; from: Coordinate; to: Coordinate; roadId?: string; roadName?: string;
}
export interface SegmentSnap { point: Coordinate; fraction: number; distanceMeters: number; segment: RoadSegment }

// Node keys round each angular coordinate to 7 decimals (~1 cm latitude precision).
// Only equal canonical coordinates are merged. No broader proximity connection is inferred.
export const GRAPH_NODE_COORDINATE_DECIMALS = 7;
export const DEFAULT_MAX_SEGMENT_SNAP_METERS = 5000;

export class RoadGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private roads: RoadLineInput[] = [];
  private segments: RoadSegment[] = [];

  public static haversineDistanceMeters(c1: Coordinate, c2: Coordinate): number {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const phi1 = toRad(c1.lat), phi2 = toRad(c2.lat);
    const deltaPhi = toRad(c2.lat - c1.lat), deltaLambda = toRad(c2.lng - c1.lng);
    const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  public static makeNodeId(coord: Coordinate): string {
    return `${coord.lng.toFixed(GRAPH_NODE_COORDINATE_DECIMALS)},${coord.lat.toFixed(GRAPH_NODE_COORDINATE_DECIMALS)}`;
  }

  private static intersection(a: [number, number], b: [number, number], c: [number, number], d: [number, number], lat0: number): { point: [number, number]; t: number; u: number } | null {
    const mx = (lng: number) => lng * 111320 * Math.cos(lat0 * Math.PI / 180);
    const my = (lat: number) => lat * 110574;
    const ax = mx(a[0]), ay = my(a[1]), bx = mx(b[0]), by = my(b[1]);
    const cx = mx(c[0]), cy = my(c[1]), dx = mx(d[0]), dy = my(d[1]);
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-9) return null; // Parallel/collinear lines do not imply a new junction.
    const qpx = cx - ax, qpy = cy - ay;
    const t = (qpx * sy - qpy * sx) / denom;
    const u = (qpx * ry - qpy * rx) / denom;
    const eps = 1e-10; // numerical boundary tolerance only; not a near-road connection radius.
    if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
    const tc = Math.max(0, Math.min(1, t));
    return { point: [a[0] + (b[0] - a[0]) * tc, a[1] + (b[1] - a[1]) * tc], t: tc, u: Math.max(0, Math.min(1, u)) };
  }

  public addNode(coord: Coordinate, customId?: string): GraphNode {
    const id = customId || RoadGraph.makeNodeId(coord);
    let node = this.nodes.get(id);
    if (!node) {
      node = { id, coord: { lat: coord.lat, lng: coord.lng }, edges: [] };
      this.nodes.set(id, node);
    }
    return node;
  }

  public addEdge(fromId: string, toId: string, weightMeters: number, geometry: [number, number][], roadId?: string, roadName?: string, bidirectional = true): void {
    const fromNode = this.nodes.get(fromId), toNode = this.nodes.get(toId);
    if (!fromNode || !toNode) throw new Error(`Cannot add edge: node not found (${!fromNode ? fromId : toId})`);
    fromNode.edges.push({ to: toId, weightMeters, geometry, roadId, roadName });
    if (bidirectional) toNode.edges.push({ to: fromId, weightMeters, geometry: [...geometry].reverse(), roadId, roadName });
  }

  public addRoad(road: RoadLineInput): void { this.addRoads([...this.roads, road]); }

  /** Build all roads together so geometric crossings split both participating lines. */
  public addRoads(roads: RoadLineInput[]): void {
    this.roads = roads.filter((r) => Array.isArray(r.coordinates) && r.coordinates.length >= 2);
    this.nodes.clear();
    this.segments = [];
    const refLat = this.roads.flatMap((r) => r.coordinates).reduce((sum, c, _, all) => sum + c[1] / all.length, 0) || 0;
    const segmentSplits: Array<Array<{ t: number; point: [number, number] }>> = [];
    const sourceSegments: Array<{ roadIndex: number; segmentIndex: number; a: [number, number]; b: [number, number] }> = [];
    for (let r = 0; r < this.roads.length; r++) {
      const coords = this.roads[r].coordinates;
      for (let i = 0; i < coords.length - 1; i++) {
        sourceSegments.push({ roadIndex: r, segmentIndex: i, a: coords[i], b: coords[i + 1] });
        segmentSplits.push([{ t: 0, point: coords[i] }, { t: 1, point: coords[i + 1] }]);
      }
    }
    for (let i = 0; i < sourceSegments.length; i++) {
      const s1 = sourceSegments[i];
      for (let j = i + 1; j < sourceSegments.length; j++) {
        const s2 = sourceSegments[j];
        if (s1.roadIndex === s2.roadIndex && Math.abs(s1.segmentIndex - s2.segmentIndex) <= 1) continue;
        const hit = RoadGraph.intersection(s1.a, s1.b, s2.a, s2.b, refLat);
        if (!hit) continue;
        segmentSplits[i].push({ t: hit.t, point: hit.point });
        segmentSplits[j].push({ t: hit.u, point: hit.point });
      }
    }
    for (let i = 0; i < sourceSegments.length; i++) {
      const raw = sourceSegments[i], road = this.roads[raw.roadIndex];
      const splits = segmentSplits[i].sort((a, b) => a.t - b.t);
      for (let k = 0; k < splits.length - 1; k++) {
        const p = splits[k].point, q = splits[k + 1].point;
        const from = { lng: p[0], lat: p[1] }, to = { lng: q[0], lat: q[1] };
        const fromNode = this.addNode(from), toNode = this.addNode(to);
        if (fromNode.id === toNode.id) continue;
        const geometry: [number, number][] = [p, q];
        this.addEdge(fromNode.id, toNode.id, RoadGraph.haversineDistanceMeters(from, to), geometry, road._id ? String(road._id) : undefined, road.name, true);
        this.segments.push({ fromId: fromNode.id, toId: toNode.id, from, to, roadId: road._id ? String(road._id) : undefined, roadName: road.name });
      }
    }
  }

  public getNode(id: string): GraphNode | undefined { return this.nodes.get(id); }
  public getNodes(): Map<string, GraphNode> { return this.nodes; }
  public getRoadSegments(): RoadSegment[] { return this.segments; }
  public get nodeCount(): number { return this.nodes.size; }

  public findNearestSegment(target: Coordinate, maxDistanceMeters = DEFAULT_MAX_SEGMENT_SNAP_METERS): SegmentSnap | null {
    let best: SegmentSnap | null = null;
    for (const segment of this.segments) {
      const latScale = 111320, lngScale = latScale * Math.cos(target.lat * Math.PI / 180);
      const ax = (segment.from.lng - target.lng) * lngScale, ay = (segment.from.lat - target.lat) * latScale;
      const bx = (segment.to.lng - target.lng) * lngScale, by = (segment.to.lat - target.lat) * latScale;
      const dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy;
      const t = lenSq ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq)) : 0;
      const point = { lng: segment.from.lng + (segment.to.lng - segment.from.lng) * t, lat: segment.from.lat + (segment.to.lat - segment.from.lat) * t };
      const distanceMeters = RoadGraph.haversineDistanceMeters(target, point);
      if (!best || distanceMeters < best.distanceMeters) best = { point, fraction: t, distanceMeters, segment };
    }
    return best && best.distanceMeters <= maxDistanceMeters ? best : null;
  }

  public findNearestNode(target: Coordinate, maxDistanceMeters = 50000): { node: GraphNode; distanceMeters: number } | null {
    let nearest: GraphNode | null = null, minDistance = Infinity;
    for (const node of this.nodes.values()) {
      const dist = RoadGraph.haversineDistanceMeters(target, node.coord);
      if (dist < minDistance) { minDistance = dist; nearest = node; }
    }
    return nearest && minDistance <= maxDistanceMeters ? { node: nearest, distanceMeters: minDistance } : null;
  }

  public clone(): RoadGraph {
    const graph = new RoadGraph();
    for (const node of this.nodes.values()) graph.addNode(node.coord, node.id);
    for (const node of this.nodes.values()) for (const edge of node.edges) graph.addEdge(node.id, edge.to, edge.weightMeters, [...edge.geometry], edge.roadId, edge.roadName, false);
    graph.segments = this.segments.slice();
    return graph;
  }

  public clear(): void { this.nodes.clear(); this.roads = []; this.segments = []; }
}

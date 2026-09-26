import assert from 'node:assert/strict';
import { RoadGraph } from './services/routing/graph.js';
import { DijkstraShortestPath } from './services/routing/dijkstra.js';
import { DijkstraRoadGraphProvider, roadDocumentsToLineInputs } from './services/routing/routingProvider.js';
import { MultiStopOptimizer, MAX_ROUTE_STOPS } from './services/routing/multiStopOptimizer.js';
import { StopCandidate } from './services/routing/types.js';

const coord = (lng: number, lat = 12.9) => ({ lng, lat });
const intersection = new RoadGraph();
intersection.addRoads([
  { _id: 'horizontal', coordinates: [[77.6, 12.9], [77.602, 12.9]] },
  { _id: 'vertical', coordinates: [[77.601, 12.899], [77.601, 12.901]] }
]);
assert.equal(intersection.nodeCount, 5, 'crossing without shared source vertex creates one shared intersection node');
const center = [...intersection.getNodes().values()].find(n => Math.abs(n.coord.lng - 77.601) < 1e-8 && Math.abs(n.coord.lat - 12.9) < 1e-8);
assert.ok(center && center.edges.length === 4, 'intersection node connects all four split road arms');
const crossPath = DijkstraShortestPath.findShortestPath(intersection, coord(77.6005), coord(77.6015));
assert.equal(crossPath.reachable, true);
assert.equal(crossPath.routingMethod, 'NETWORK_ROUTE');
assert.ok(crossPath.coordinates.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)), 'path geometry retains [longitude, latitude] order');
assert.ok(crossPath.coordinates.some(([lng, lat]) => Math.abs(lng - 77.601) < 1e-8 && Math.abs(lat - 12.9) < 1e-8));
assert.ok(crossPath.distanceMeters < 120, 'points on one segment route directly instead of via a distant endpoint');

const nearbyButSeparate = new RoadGraph();
nearbyButSeparate.addRoads([
  { coordinates: [[77.6, 12.9], [77.601, 12.9]] },
  { coordinates: [[77.601, 12.90001], [77.602, 12.90001]] }
]);
assert.equal(nearbyButSeparate.nodeCount, 4, 'nearby coordinates are not merged without an actual intersection');
const disconnected = DijkstraShortestPath.findShortestPath(nearbyButSeparate, coord(77.6005, 12.9), coord(77.6015, 12.90001));
assert.equal(disconnected.reachable, false, 'disconnected road components remain unreachable');
assert.equal(disconnected.fallbackUsed, false, 'disconnected network path does not silently become a straight-line route');

const deadEnd = new RoadGraph();
deadEnd.addRoad({ coordinates: [[77.6, 12.9], [77.601, 12.9], [77.602, 12.9]] });
const deadEndPath = DijkstraShortestPath.findShortestPath(deadEnd, coord(77.6002), coord(77.6018));
assert.equal(deadEndPath.reachable, true, 'dead-end connected line remains routable');

const emptyGraph = new RoadGraph();
const fallback = DijkstraShortestPath.findShortestPath(emptyGraph, coord(77.6), coord(77.601));
assert.equal(fallback.routingMethod, 'STRAIGHT_LINE_FALLBACK');
assert.equal(fallback.fallbackUsed, true);

const sourcePointOnlyRoads = roadDocumentsToLineInputs([{
  _id: 'source-point-only',
  name: 'Public road network',
  location: { type: 'Point', coordinates: [74.93052, 12.867023] },
  coordinateSource: 'PUBLIC_MAP_APPROXIMATE',
  coordinateStatus: 'APPROXIMATE',
  coordinatesVerified: false
}]);
assert.equal(sourcePointOnlyRoads.length, 0, 'approximate Point-only source road is not converted into a graph line');
const sourcePointOnlyGraph = new RoadGraph();
sourcePointOnlyGraph.addRoads(sourcePointOnlyRoads);
assert.equal(sourcePointOnlyGraph.nodeCount, 0, 'Point-only source road contributes no routing nodes or edges');

const demoRoads = roadDocumentsToLineInputs([{
  _id: 'demo-road',
  name: 'Kerehalli Santhe Main Road',
  lineGeometry: { type: 'LineString', coordinates: [[75.5, 13.9], [75.51, 13.9], [75.52, 13.9]] },
  geometry: { type: 'LineString', coordinates: [[75.5, 13.9], [75.51, 13.9], [75.52, 13.9]] }
}]);
assert.equal(demoRoads.length, 1, 'a stored demo LineString remains eligible for the routing graph');
const demoRoadGraph = new RoadGraph();
demoRoadGraph.addRoads(demoRoads);
assert.ok(demoRoadGraph.nodeCount >= 2, 'demo road LineString still creates a routable graph');

const providerGraph = new RoadGraph();
providerGraph.addRoad({ coordinates: [[77.6, 12.9], [77.61, 12.9]] });
const provider = new DijkstraRoadGraphProvider(providerGraph);
const stop = (id: string, lng: number): StopCandidate => ({ infrastructureId: id, location: coord(lng), priorityScore: 50, priorityLevel: 'Medium' });
const run = async () => {
  const two = await MultiStopOptimizer.optimizeRoute(coord(77.6001), [stop('a', 77.602), stop('b', 77.604)], {}, provider);
  assert.equal(two.stopsCount, 2);
  assert.equal(two.routingMethod, 'NETWORK_ROUTE');
  assert.ok(two.orderedStops[0].reasonForOrder.includes('road distance calculated for this leg by Dijkstra'));
  const multiple = await MultiStopOptimizer.optimizeRoute(coord(77.6001), [stop('a', 77.602), stop('b', 77.604), stop('c', 77.608)], {}, provider);
  assert.equal(multiple.stopsCount, 3);
  const duplicates = await MultiStopOptimizer.optimizeRoute(coord(77.6001), [stop('a', 77.602), stop('a', 77.602), stop('other-asset', 77.602)], {}, provider);
  assert.equal(duplicates.stopsCount, 2, 'deduplicate repeated IDs but retain distinct co-located assets');
  const empty = await MultiStopOptimizer.optimizeRoute(coord(77.6), [], {}, provider);
  assert.equal(empty.stopsCount, 0);
  const splitGraph = new RoadGraph();
  splitGraph.addRoads([{ coordinates: [[77.6, 12.9], [77.601, 12.9]] }, { coordinates: [[77.61, 12.9], [77.611, 12.9]] }]);
  const splitProvider = new DijkstraRoadGraphProvider(splitGraph);
  const withUnreachable = await MultiStopOptimizer.optimizeRoute(coord(77.6001), [stop('near', 77.6008), stop('far', 77.6102)], {}, splitProvider);
  assert.equal(withUnreachable.stopsCount, 1);
  assert.equal(withUnreachable.unreachableStops[0].infrastructureId, 'far');
  const noNetwork = await MultiStopOptimizer.optimizeRoute(coord(77.6), [stop('fallback', 77.61)], {}, new DijkstraRoadGraphProvider(new RoadGraph()));
  assert.equal(noNetwork.routingMethod, 'STRAIGHT_LINE_FALLBACK');
  assert.equal(noNetwork.estimatedDurationMinutes, null, 'fallback leg never claims a travel-time estimate');
  assert.ok(noNetwork.orderedStops[0].reasonForOrder.includes('distance calculated using Straight-line Haversine fallback'));
  assert.equal(noNetwork.orderedStops[0].reasonForOrder.includes('road distance'), false, 'fallback distance is not described as road distance');
  await assert.rejects(() => MultiStopOptimizer.optimizeRoute(coord(77.6), Array.from({ length: MAX_ROUTE_STOPS + 1 }, (_, i) => stop(String(i), 77.6)), {}, provider), /at most/);
  console.log('GIS routing correctness tests passed.');
};
await run();

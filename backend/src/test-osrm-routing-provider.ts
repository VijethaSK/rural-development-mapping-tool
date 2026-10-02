import assert from 'node:assert/strict';
import { OsrmRoutingProvider, type RoutingFetch } from './services/routing/osrmRoutingProvider.js';
import { getRoutingErrorStatusCode, RoutingProviderTimeoutError, RoutingProviderUnavailableError, RoutingUnreachableError } from './services/routing/routingErrors.js';
import { MultiStopOptimizer } from './services/routing/multiStopOptimizer.js';
import type { Coordinate } from './services/routing/types.js';

const A: Coordinate = { lng: 77.6, lat: 12.9 };
const B: Coordinate = { lng: 77.61, lat: 12.91 };

function response(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

function fixtureFetch(payload: unknown, inspect?: (url: URL, init: { method: 'GET'; signal: AbortSignal }) => void): RoutingFetch {
  return async (url, init) => {
    inspect?.(url, init);
    return response(payload);
  };
}

const run = async () => {
  const tableUrls: URL[] = [];
  const tableProvider = new OsrmRoutingProvider('https://routing.example/osrm', fixtureFetch({
    code: 'Ok',
    distances: [[0, 1234], [2345, 0]],
    durations: [[0, 90], [170, 0]]
  }, url => tableUrls.push(url)));
  const table = await tableProvider.getDistanceMatrix([A, B]);
  assert.equal(table.provider, 'OSRM');
  assert.equal(table.fallbackUsed, false);
  assert.equal(table.matrix[0][1].distanceMeters, 1234);
  assert.equal(table.matrix[1][0].distanceMeters, 2345, 'Table values preserve directionality');
  assert.equal(table.matrix[0][1].durationSeconds, 90);
  assert.equal(table.matrix[1][0].durationSeconds, 170);
  assert.equal(table.matrix[0][1].method, 'OSRM_TABLE');
  assert.equal(tableUrls[0].pathname, '/osrm/table/v1/driving/77.6,12.9;77.61,12.91');
  assert.equal(tableUrls[0].searchParams.get('annotations'), 'distance,duration');

  const unreachable = await new OsrmRoutingProvider('https://routing.example', fixtureFetch({
    code: 'Ok', distances: [[0, null], [null, 0]], durations: [[0, null], [null, 0]]
  })).getDistanceMatrix([A, B]);
  assert.equal(unreachable.matrix[0][1].reachable, false);
  assert.equal(unreachable.matrix[0][1].distanceMeters, null);
  assert.equal(unreachable.matrix[0][1].durationSeconds, null);
  assert.equal(unreachable.matrix[1][0].reachable, false);

  await assert.rejects(
    () => new OsrmRoutingProvider('https://routing.example', fixtureFetch({
      code: 'Ok', distances: [[0, 1]], durations: [[0, 1]]
    })).getDistanceMatrix([A, B]),
    error => error instanceof RoutingProviderUnavailableError && !error.message.includes('routing.example')
  );
  await assert.rejects(
    () => new OsrmRoutingProvider('https://routing.example', fixtureFetch({
      code: 'Ok', distances: [[0, '1'], [1, 0]], durations: [[0, 1], [1, 0]]
    })).getDistanceMatrix([A, B]),
    RoutingProviderUnavailableError
  );
  await assert.rejects(
    () => new OsrmRoutingProvider('https://routing.example', fixtureFetch({
      code: 'Ok', distances: [[0, null], [1, 0]], durations: [[0, 2], [1, 0]]
    })).getDistanceMatrix([A, B]),
    RoutingProviderUnavailableError,
    'distance/duration nullability must agree for each matrix cell'
  );

  let routeUrl: URL | undefined;
  const routePayload = {
    code: 'Ok',
    waypoints: [{ location: [77.6, 12.9] }, { location: [77.61, 12.91] }],
    routes: [{
      distance: 3000,
      duration: 240,
      geometry: { type: 'LineString', coordinates: [[77.6, 12.9], [77.605, 12.905], [77.61, 12.91]] },
      legs: [
        { distance: 3000, duration: 240, steps: [{ geometry: { type: 'LineString', coordinates: [[77.6, 12.9], [77.605, 12.905], [77.61, 12.91]] } }] }
      ]
    }]
  };
  const routeProvider = new OsrmRoutingProvider('https://routing.example', fixtureFetch(routePayload, url => { routeUrl = url; }));
  const route = await routeProvider.getRoute([A, B]);
  assert.equal(route.reachable, true);
  assert.equal(route.provider, 'OSRM');
  assert.equal(route.distanceMeters, 3000);
  assert.equal(route.durationSeconds, 240);
  assert.deepEqual(route.geometry.coordinates[0], [77.6, 12.9], 'geometry remains GeoJSON [longitude, latitude]');
  assert.equal(route.legs.length, 1);
  assert.equal(route.legs[0].source, A);
  assert.equal(route.legs[0].target, B);
  assert.equal(route.legs[0].distanceMeters, 3000);
  assert.equal(route.legs[0].durationSeconds, 240);
  assert.equal(route.legs[0].method, 'OSRM_ROUTE');
  assert.equal(routeUrl?.pathname, '/route/v1/driving/77.6,12.9;77.61,12.91');
  assert.equal(routeUrl?.searchParams.get('geometries'), 'geojson');
  assert.equal(routeUrl?.searchParams.get('steps'), 'true');
  assert.equal(routeUrl?.searchParams.get('alternatives'), 'false');

  const shortest = await routeProvider.findShortestPath(A, B);
  assert.equal(shortest.provider, 'OSRM');
  assert.equal(shortest.distanceMeters, 3000);
  assert.deepEqual(shortest.coordinates, route.geometry.coordinates);

  const C: Coordinate = { lng: 77.62, lat: 12.92 };
  const X: [number, number] = [77.605, 12.905];
  const Y: [number, number] = [77.615, 12.915];
  let multiRouteUrl: URL | undefined;
  const multiRouteProvider = new OsrmRoutingProvider('https://routing.example', fixtureFetch({
    code: 'Ok',
    waypoints: [{ location: [A.lng, A.lat] }, { location: [B.lng, B.lat] }, { location: [C.lng, C.lat] }],
    routes: [{
      distance: 5500,
      duration: 360,
      geometry: { type: 'LineString', coordinates: [[A.lng, A.lat], X, [B.lng, B.lat], Y, [C.lng, C.lat]] },
      legs: [
        { distance: 3000, duration: 240, steps: [
          { geometry: { type: 'LineString', coordinates: [[A.lng, A.lat], X] } },
          { geometry: { type: 'LineString', coordinates: [X, [B.lng, B.lat]] } }
        ] },
        { distance: 2500, duration: 120, steps: [
          { geometry: { type: 'LineString', coordinates: [[B.lng, B.lat], Y, [C.lng, C.lat]] } }
        ] }
      ]
    }]
  }, url => { multiRouteUrl = url; }));
  const multiRoute = await multiRouteProvider.getRoute([A, B, C]);
  assert.equal(multiRouteUrl?.pathname, '/route/v1/driving/77.6,12.9;77.61,12.91;77.62,12.92', 'request waypoint order is retained');
  assert.equal(multiRoute.legs.length, 2);
  assert.deepEqual(multiRoute.legs.map(leg => [leg.source, leg.target]), [[A, B], [B, C]], 'leg order follows requested waypoint order');
  assert.deepEqual(multiRoute.legs[0].coordinates, [[A.lng, A.lat], X, [B.lng, B.lat]], 'step endpoints are stitched once in OSRM order');
  assert.deepEqual(multiRoute.legs[1].coordinates, [[B.lng, B.lat], Y, [C.lng, C.lat]]);
  assert.deepEqual(multiRoute.geometry.coordinates, [[A.lng, A.lat], X, [B.lng, B.lat], Y, [C.lng, C.lat]]);
  assert.equal(multiRoute.geometry.coordinates.filter(([lng, lat]) => lng === B.lng && lat === B.lat).length, 1, 'shared waypoint occurs once in final route geometry');
  assert.equal(multiRoute.geometry.type, 'LineString');

  const discontinuousSteps = new OsrmRoutingProvider('https://routing.example', fixtureFetch({
    code: 'Ok',
    waypoints: routePayload.waypoints,
    routes: [{
      distance: 3000, duration: 240,
      geometry: routePayload.routes[0].geometry,
      legs: [{ distance: 3000, duration: 240, steps: [
        { geometry: { type: 'LineString', coordinates: [[77.6, 12.9], [77.605, 12.905]] } },
        { geometry: { type: 'LineString', coordinates: [[77.606, 12.905], [77.61, 12.91]] } }
      ] }]
    }]
  }));
  await assert.rejects(discontinuousSteps.getRoute([A, B]), RoutingProviderUnavailableError,
    'a discontinuous step boundary is rejected instead of being bridged or dropped');

  await assert.rejects(
    () => new OsrmRoutingProvider('https://routing.example', fixtureFetch({
      code: 'Ok', waypoints: routePayload.waypoints, routes: [{ distance: 3, duration: 4, geometry: { type: 'Point', coordinates: [77.6, 12.9] }, legs: [] }]
    })).getRoute([A, B]),
    RoutingProviderUnavailableError,
    'Point geometry is not accepted as route geometry'
  );
  await assert.rejects(
    () => new OsrmRoutingProvider('https://routing.example', fixtureFetch({
      code: 'Ok', waypoints: routePayload.waypoints, routes: [{ distance: 3, geometry: routePayload.routes[0].geometry, legs: routePayload.routes[0].legs }]
    })).getRoute([A, B]),
    RoutingProviderUnavailableError,
    'required route duration is validated'
  );
  await assert.rejects(
    () => new OsrmRoutingProvider('https://routing.example', fixtureFetch({
      code: 'Ok', waypoints: [{ location: [77.6, 12.9] }], routes: routePayload.routes
    })).getRoute([A, B]),
    RoutingProviderUnavailableError,
    'the OSRM waypoint count must match the requested ordered points'
  );

  const providerError = new OsrmRoutingProvider('https://routing.example', async () => response({ message: 'secret response body' }, false, 500));
  await assert.rejects(providerError.getDistanceMatrix([A, B]), error =>
    error instanceof RoutingProviderUnavailableError &&
    !error.message.includes('secret response body') && !error.message.includes('routing.example')
  );

  const timeoutProvider = new OsrmRoutingProvider('https://routing.example', async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('transport URL and secret')));
  }), 5);
  await assert.rejects(timeoutProvider.getDistanceMatrix([A, B]), error =>
    error instanceof RoutingProviderTimeoutError &&
    !error.message.includes('routing.example') && !error.message.includes('secret')
  );

  const bodyTimeoutProvider = new OsrmRoutingProvider('https://routing.example', async (_url, init) => ({
    ok: true,
    status: 200,
    json: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('secret body'))))
  }), 5);
  await assert.rejects(bodyTimeoutProvider.getDistanceMatrix([A, B]), RoutingProviderTimeoutError,
    'the configured deadline also covers response-body parsing');

  let requestedService = '';
  const osrmFactory = new OsrmRoutingProvider('https://routing.example', async url => {
    requestedService = url.pathname;
    return response({ code: 'NoTable' });
  });
  assert.equal(osrmFactory.provider, 'OSRM', 'OSRM selection reports OSRM and never becomes INTERNAL');
  await assert.rejects(osrmFactory.getDistanceMatrix([A, B]), RoutingProviderUnavailableError);
  assert.match(requestedService, /\/table\/v1\/driving\//, 'provider failure does not trigger a Dijkstra or fallback request');

  const noRoute = await new OsrmRoutingProvider('https://routing.example', fixtureFetch({ code: 'NoRoute' })).getRoute([A, B]);
  assert.equal(noRoute.reachable, false);
  assert.equal(noRoute.distanceMeters, null);
  assert.equal(noRoute.legs[0].distanceMeters, Infinity, 'unreachable leg uses the existing unreachable sentinel, not a fabricated metric');
  assert.equal(noRoute.fallbackUsed, false);
  const noSegment = await new OsrmRoutingProvider('https://routing.example', fixtureFetch({ code: 'NoSegment' })).getRoute([A, B]);
  assert.equal(noSegment.reachable, false);

  const zeroLegProvider = new OsrmRoutingProvider('https://routing.example', async url => url.pathname.includes('/table/')
    ? response({ code: 'Ok', distances: [[0, 100, 100], [100, 0, 0], [100, 0, 0]], durations: [[0, 60, 60], [60, 0, 0], [60, 0, 0]] })
    : response({
      code: 'Ok',
      waypoints: [{ location: [A.lng, A.lat] }, { location: [B.lng, B.lat] }, { location: [B.lng, B.lat] }],
      routes: [{
        distance: 100, duration: 60,
        geometry: { type: 'LineString', coordinates: [[A.lng, A.lat], [B.lng, B.lat]] },
        legs: [
          { distance: 100, duration: 60, steps: [{ geometry: { type: 'LineString', coordinates: [[A.lng, A.lat], [B.lng, B.lat]] } }] },
          { distance: 0, duration: 0, steps: [] }
        ]
      }]
    }));
  const zeroLegRoute = await zeroLegProvider.getRoute([A, B, B]);
  assert.equal(zeroLegRoute.legs[1].reachable, true);
  assert.equal(zeroLegRoute.legs[1].distanceMeters, 0);
  assert.equal(zeroLegRoute.legs[1].durationSeconds, 0);
  assert.deepEqual(zeroLegRoute.legs[1].coordinates, [], 'zero-step leg carries no fabricated geometry');

  const contradictoryZeroLegProvider = new OsrmRoutingProvider('https://routing.example', fixtureFetch({
    code: 'Ok',
    waypoints: routePayload.waypoints,
    routes: [{
      distance: 0, duration: 0,
      geometry: { type: 'LineString', coordinates: [[A.lng, A.lat], [B.lng, B.lat]] },
      legs: [{ distance: 0, duration: 0, steps: [{ geometry: { type: 'LineString', coordinates: [[A.lng, A.lat], [B.lng, B.lat]] } }] }]
    }]
  }));
  await assert.rejects(contradictoryZeroLegProvider.getRoute([A, B]), RoutingProviderUnavailableError,
    'zero metrics cannot accompany geometry with distinct coordinates');

  const tolerancePoint: [number, number] = [77.605, 12.905];
  const withinToleranceProvider = new OsrmRoutingProvider('https://routing.example', fixtureFetch({
    code: 'Ok',
    waypoints: routePayload.waypoints,
    routes: [{
      distance: 3000, duration: 240,
      geometry: routePayload.routes[0].geometry,
      legs: [{ distance: 3000, duration: 240, steps: [
        { geometry: { type: 'LineString', coordinates: [[A.lng, A.lat], tolerancePoint] } },
        { geometry: { type: 'LineString', coordinates: [[tolerancePoint[0] + 5e-7, tolerancePoint[1] - 5e-7], [B.lng, B.lat]] } }
      ] }]
    }]
  }));
  const withinToleranceRoute = await withinToleranceProvider.getRoute([A, B]);
  assert.deepEqual(withinToleranceRoute.legs[0].coordinates, [[A.lng, A.lat], tolerancePoint, [B.lng, B.lat]],
    'small endpoint jitter within tolerance is accepted and the first step endpoint is retained');

  const routeMismatchProvider = new OsrmRoutingProvider('https://routing.example', async url => url.pathname.includes('/table/')
    ? response({ code: 'Ok', distances: [[0, 100], [100, 0]], durations: [[0, 60], [60, 0]] })
    : response({ code: 'NoRoute' }));
  await assert.rejects(
    () => MultiStopOptimizer.optimizeRoute(A, [{ infrastructureId: 'unreachable', location: B, priorityScore: 10, priorityLevel: 'Low' }], {}, routeMismatchProvider),
    error => error instanceof RoutingUnreachableError && error.errorCode === 'ROUTE_UNREACHABLE' && getRoutingErrorStatusCode(error) === 422,
    'an unreachable selected OSRM route follows the typed non-400 status path'
  );

  console.log('OSRM routing provider tests passed.');
};

await run();

import assert from 'node:assert/strict';
import { parseRoutingConfiguration } from './config/routing.js';
import { RoadGraph } from './services/routing/graph.js';
import { getRoutingProvider, DijkstraRoadGraphProvider } from './services/routing/routingProvider.js';
import {
  getRoutingErrorStatusCode,
  RoutingProviderTimeoutError,
  RoutingProviderUnavailableError
} from './services/routing/routingErrors.js';

const run = async () => {
  assert.deepEqual(parseRoutingConfiguration(undefined, undefined), { providerSelection: 'INTERNAL' });
  assert.deepEqual(parseRoutingConfiguration(' internal ', undefined), { providerSelection: 'INTERNAL' });
  assert.throws(() => parseRoutingConfiguration('VALHALLA', undefined), /ROUTING_PROVIDER must be either INTERNAL or OSRM/);

  assert.throws(() => parseRoutingConfiguration('OSRM', undefined), /OSRM_BASE_URL is required/);
  assert.throws(() => parseRoutingConfiguration('OSRM', 'not a URL'), /valid absolute HTTP\(S\) URL/);
  assert.throws(() => parseRoutingConfiguration('OSRM', 'ftp://routing.example'), /valid absolute HTTP\(S\) URL/);
  assert.throws(() => parseRoutingConfiguration('OSRM', 'https://user:password@routing.example'), /without credentials/);
  assert.deepEqual(parseRoutingConfiguration('OSRM', 'https://routing.example/osrm/'), {
    providerSelection: 'OSRM',
    osrmBaseUrl: 'https://routing.example/osrm'
  });

  const graph = new RoadGraph();
  const defaultProvider = await getRoutingProvider(undefined, graph);
  assert.ok(defaultProvider instanceof DijkstraRoadGraphProvider, 'a custom graph continues to select Dijkstra');
  assert.equal(defaultProvider.getRoadGraph(), graph, 'the supplied custom graph is preserved');
  const internalProvider = await getRoutingProvider(undefined, graph, { providerSelection: 'INTERNAL' });
  assert.ok(internalProvider instanceof DijkstraRoadGraphProvider, 'explicit INTERNAL selection uses Dijkstra');
  assert.equal(internalProvider.provider, 'INTERNAL', 'selection and reported provider identity remain distinct concepts');

  await assert.rejects(
    () => getRoutingProvider(undefined, undefined, { providerSelection: 'OSRM' }),
    /OSRM_BASE_URL is required/
  );
  await assert.rejects(
    () => getRoutingProvider(undefined, undefined, { providerSelection: 'OSRM', osrmBaseUrl: 'https://routing.example' }),
    (error: unknown) => error instanceof RoutingProviderUnavailableError && error.statusCode === 503
  );
  assert.equal(getRoutingErrorStatusCode(new RoutingProviderUnavailableError()), 503);
  assert.equal(getRoutingErrorStatusCode(new RoutingProviderTimeoutError()), 504);
  assert.equal(getRoutingErrorStatusCode(new Error('invalid route options')), 400, 'ordinary validation errors remain client errors');
  assert.equal(getRoutingErrorStatusCode(Object.assign(new Error('forbidden'), { statusCode: 403 })), 403, 'existing explicit status codes are preserved');

  console.log('Routing configuration and provider error tests passed.');
};

await run();

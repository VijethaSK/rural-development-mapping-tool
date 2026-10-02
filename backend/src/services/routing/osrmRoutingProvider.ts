import { parseRoutingConfiguration } from '../../config/routing.js';
import {
  RoutingProviderTimeoutError,
  RoutingProviderUnavailableError
} from './routingErrors.js';
import type {
  Coordinate,
  DistanceMatrixResult,
  IRoutingProvider,
  ProviderRouteResult,
  ShortestPathResult
} from './types.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const SAFE_PROVIDER_FAILURE = 'The configured routing provider returned an invalid or unsuccessful response.';
const STEP_ENDPOINT_TOLERANCE_DEGREES = 1e-6;

type FetchResponse = Pick<Response, 'ok' | 'status' | 'json'>;
export type RoutingFetch = (url: URL, init: { method: 'GET'; signal: AbortSignal }) => Promise<FetchResponse>;

interface OsrmGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === 'number' && Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180 &&
    typeof value[1] === 'number' && Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90;
}

function coordinatesMatchWithinTolerance(left: [number, number], right: [number, number]): boolean {
  return Math.abs(left[0] - right[0]) <= STEP_ENDPOINT_TOLERANCE_DEGREES &&
    Math.abs(left[1] - right[1]) <= STEP_ENDPOINT_TOLERANCE_DEGREES;
}

function validateCoordinate(point: Coordinate): void {
  if (!point || !Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90 ||
      !Number.isFinite(point.lng) || point.lng < -180 || point.lng > 180) {
    throw new Error('Routing coordinates must be finite latitude/longitude values within geographic bounds.');
  }
}

function validateGeometry(value: unknown): OsrmGeometry {
  if (!isRecord(value) || value.type !== 'LineString' || !Array.isArray(value.coordinates) ||
      value.coordinates.length < 2 || !value.coordinates.every(isCoordinatePair)) {
    throw new RoutingProviderUnavailableError(SAFE_PROVIDER_FAILURE);
  }
  return { type: 'LineString', coordinates: value.coordinates };
}

function unavailable(): RoutingProviderUnavailableError {
  return new RoutingProviderUnavailableError(SAFE_PROVIDER_FAILURE);
}

/** OSRM adapter. Its HTTP boundary is injectable so tests never require a live service. */
export class OsrmRoutingProvider implements IRoutingProvider {
  public readonly name = 'OSRM Road Routing';
  public readonly provider = 'OSRM' as const;
  private readonly baseUrl: string;
  private readonly fetchRequest: RoutingFetch;

  constructor(baseUrl: string, fetchRequest?: RoutingFetch, private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {
    const parsed = parseRoutingConfiguration('OSRM', baseUrl);
    if (!parsed.osrmBaseUrl) throw new Error('OSRM_BASE_URL is required when ROUTING_PROVIDER is OSRM.');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Routing provider timeout must be positive.');
    this.baseUrl = parsed.osrmBaseUrl;
    this.fetchRequest = fetchRequest ?? ((url, init) => fetch(url, init));
  }

  private buildUrl(service: 'table' | 'route', points: Coordinate[]): URL {
    const coordinates = points.map(point => `${point.lng},${point.lat}`).join(';');
    return new URL(`${this.baseUrl}/${service}/v1/driving/${coordinates}`);
  }

  private async requestJson(url: URL): Promise<unknown> {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new RoutingProviderTimeoutError());
      }, this.timeoutMs);
    });

    try {
      const requestAndParse = async (): Promise<unknown> => {
        const response = await this.fetchRequest(url, { method: 'GET', signal: controller.signal });
        if (!response.ok) throw unavailable();
        try {
          return await response.json();
        } catch {
          throw unavailable();
        }
      };
      return await Promise.race([requestAndParse(), timeout]);
    } catch (error) {
      if (error instanceof RoutingProviderTimeoutError || error instanceof RoutingProviderUnavailableError) throw error;
      // Do not propagate fetch/transport exceptions: they may contain the full URL or other sensitive detail.
      throw unavailable();
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  public async getDistanceMatrix(points: Coordinate[]): Promise<DistanceMatrixResult> {
    points.forEach(validateCoordinate);
    if (!points.length) {
      return { points, matrix: [], provider: this.provider, methodsUsed: [], fallbackUsed: false };
    }

    const url = this.buildUrl('table', points);
    url.searchParams.set('annotations', 'distance,duration');
    const payload = await this.requestJson(url);
    if (!isRecord(payload) || payload.code !== 'Ok' || !Array.isArray(payload.distances) || !Array.isArray(payload.durations)) {
      throw unavailable();
    }

    const count = points.length;
    if (payload.distances.length !== count || payload.durations.length !== count ||
        !payload.distances.every(row => Array.isArray(row) && row.length === count) ||
        !payload.durations.every(row => Array.isArray(row) && row.length === count)) {
      throw unavailable();
    }

    const matrix: DistanceMatrixResult['matrix'] = [];
    for (let from = 0; from < count; from++) {
      const distanceRow = payload.distances[from] as unknown[];
      const durationRow = payload.durations[from] as unknown[];
      const row: DistanceMatrixResult['matrix'][number] = [];
      for (let to = 0; to < count; to++) {
        const distance = distanceRow[to];
        const duration = durationRow[to];
        if (distance === null && duration === null) {
          row.push({ reachable: false, distanceMeters: null, durationSeconds: null, provider: this.provider, method: 'OSRM_TABLE', fallbackUsed: false });
        } else if (isMetric(distance) && isMetric(duration)) {
          row.push({ reachable: true, distanceMeters: distance, durationSeconds: duration, provider: this.provider, method: 'OSRM_TABLE', fallbackUsed: false });
        } else {
          throw unavailable();
        }
      }
      matrix.push(row);
    }

    return { points, matrix, provider: this.provider, methodsUsed: ['OSRM_TABLE'], fallbackUsed: false };
  }

  public async findShortestPath(start: Coordinate, end: Coordinate): Promise<ShortestPathResult> {
    const route = await this.getRoute([start, end]);
    const leg = route.legs[0];
    if (!route.reachable || !leg) {
      return {
        source: start, target: end, distanceMeters: Infinity, durationSeconds: null, coordinates: [], reachable: false,
        provider: this.provider, method: 'OSRM_ROUTE', routingMethod: 'NETWORK_ROUTE', fallbackUsed: false
      };
    }
    return leg;
  }

  public async getRoute(orderedPoints: Coordinate[]): Promise<ProviderRouteResult> {
    orderedPoints.forEach(validateCoordinate);
    if (orderedPoints.length < 2) {
      return {
        reachable: true,
        geometry: { type: 'LineString', coordinates: orderedPoints.map(point => [point.lng, point.lat] as [number, number]) },
        distanceMeters: 0,
        durationSeconds: 0,
        legs: [],
        provider: this.provider,
        methodsUsed: [],
        fallbackUsed: false
      };
    }

    const url = this.buildUrl('route', orderedPoints);
    url.searchParams.set('overview', 'full');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('steps', 'true');
    url.searchParams.set('alternatives', 'false');
    const payload = await this.requestJson(url);
    if (!isRecord(payload) || typeof payload.code !== 'string') throw unavailable();

    if (payload.code === 'NoRoute' || payload.code === 'NoSegment') {
      const legs: ShortestPathResult[] = orderedPoints.slice(0, -1).map((source, index) => ({
        source,
        target: orderedPoints[index + 1],
        distanceMeters: Infinity,
        durationSeconds: null,
        coordinates: [],
        reachable: false,
        provider: this.provider,
        method: 'OSRM_ROUTE',
        routingMethod: 'NETWORK_ROUTE',
        fallbackUsed: false
      }));
      return { reachable: false, geometry: { type: 'LineString', coordinates: [] }, distanceMeters: null, durationSeconds: null, legs, provider: this.provider, methodsUsed: ['OSRM_ROUTE'], fallbackUsed: false };
    }

    if (payload.code !== 'Ok' || !Array.isArray(payload.routes) || payload.routes.length !== 1 ||
        !Array.isArray(payload.waypoints) || payload.waypoints.length !== orderedPoints.length ||
        !payload.waypoints.every(waypoint => isRecord(waypoint) && isCoordinatePair(waypoint.location))) throw unavailable();
    const route = payload.routes[0];
    if (!isRecord(route)) throw unavailable();
    const geometry = validateGeometry(route.geometry);
    if (!isMetric(route.distance) || !isMetric(route.duration) || !Array.isArray(route.legs) || route.legs.length !== orderedPoints.length - 1) {
      throw unavailable();
    }

    const legs: ShortestPathResult[] = [];
    for (let index = 0; index < route.legs.length; index++) {
      const leg = route.legs[index];
      if (!isRecord(leg) || !isMetric(leg.distance) || !isMetric(leg.duration) || !Array.isArray(leg.steps)) throw unavailable();
      const legCoordinates: [number, number][] = [];
      for (const step of leg.steps) {
        if (!isRecord(step)) throw unavailable();
        const stepGeometry = validateGeometry(step.geometry);
        if (legCoordinates.length) {
          const previousEndpoint = legCoordinates[legCoordinates.length - 1];
          const nextStartpoint = stepGeometry.coordinates[0];
          if (!coordinatesMatchWithinTolerance(previousEndpoint, nextStartpoint)) throw unavailable();
          legCoordinates.push(...stepGeometry.coordinates.slice(1));
        } else {
          legCoordinates.push(...stepGeometry.coordinates);
        }
      }
      const hasZeroMetrics = leg.distance === 0 && leg.duration === 0;
      const hasContradictoryZeroMetricGeometry = hasZeroMetrics && legCoordinates.length > 0 &&
        legCoordinates.some(point => !coordinatesMatchWithinTolerance(legCoordinates[0], point));
      const isValidEmptyZeroLengthLeg = legCoordinates.length === 0 && hasZeroMetrics;
      if (hasContradictoryZeroMetricGeometry || (!isValidEmptyZeroLengthLeg && legCoordinates.length < 2) ||
          !legCoordinates.every(isCoordinatePair)) throw unavailable();
      legs.push({
        source: orderedPoints[index],
        target: orderedPoints[index + 1],
        distanceMeters: leg.distance,
        durationSeconds: leg.duration,
        coordinates: legCoordinates,
        reachable: true,
        provider: this.provider,
        method: 'OSRM_ROUTE',
        routingMethod: 'NETWORK_ROUTE',
        fallbackUsed: false
      });
    }

    return {
      reachable: true,
      geometry,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      legs,
      provider: this.provider,
      methodsUsed: ['OSRM_ROUTE'],
      fallbackUsed: false
    };
  }
}

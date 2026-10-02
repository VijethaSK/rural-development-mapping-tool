export type RoutingProviderErrorCode = 'ROUTING_PROVIDER_UNAVAILABLE' | 'ROUTING_PROVIDER_TIMEOUT';

export class RoutingProviderError extends Error {
  public readonly statusCode: number;

  constructor(
    message: string,
    public readonly errorCode: RoutingProviderErrorCode,
    statusCode: number
  ) {
    super(message);
    this.name = 'RoutingProviderError';
    this.statusCode = statusCode;
  }
}

export class RoutingProviderUnavailableError extends RoutingProviderError {
  constructor(message = 'The selected routing provider is unavailable.') {
    super(message, 'ROUTING_PROVIDER_UNAVAILABLE', 503);
    this.name = 'RoutingProviderUnavailableError';
  }
}

export class RoutingProviderTimeoutError extends RoutingProviderError {
  constructor(message = 'The routing provider request timed out.') {
    super(message, 'ROUTING_PROVIDER_TIMEOUT', 504);
    this.name = 'RoutingProviderTimeoutError';
  }
}

/** A valid request for which the selected route sequence has no network path. */
export class RoutingUnreachableError extends Error {
  public readonly errorCode = 'ROUTE_UNREACHABLE';
  public readonly statusCode = 422;

  constructor() {
    super('The selected stops cannot be connected by the configured routing network.');
    this.name = 'RoutingUnreachableError';
  }
}

/** Preserve existing validation statuses while mapping provider failures as gateway errors. */
export function getRoutingErrorStatusCode(error: unknown, fallbackStatusCode = 400): number {
  if (error instanceof RoutingProviderError) return error.statusCode;
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = error.statusCode;
    if (typeof statusCode === 'number' && Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
      return statusCode;
    }
  }
  return fallbackStatusCode;
}

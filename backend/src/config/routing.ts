export type RoutingProviderSelection = 'INTERNAL' | 'OSRM';

export interface RoutingConfiguration {
  providerSelection: RoutingProviderSelection;
  osrmBaseUrl?: string;
}

/** Parse non-secret routing settings without exposing rejected values in errors. */
export function parseRoutingConfiguration(
  providerValue: string | undefined,
  osrmBaseUrlValue: string | undefined
): RoutingConfiguration {
  const normalizedProvider = providerValue?.trim().toUpperCase() || 'INTERNAL';
  if (normalizedProvider !== 'INTERNAL' && normalizedProvider !== 'OSRM') {
    throw new Error('ROUTING_PROVIDER must be either INTERNAL or OSRM.');
  }

  if (normalizedProvider === 'INTERNAL') {
    return { providerSelection: 'INTERNAL' };
  }

  const candidate = osrmBaseUrlValue?.trim();
  if (!candidate) {
    throw new Error('OSRM_BASE_URL is required when ROUTING_PROVIDER is OSRM.');
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('OSRM_BASE_URL must be a valid absolute HTTP(S) URL without credentials, query, or fragment.');
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('OSRM_BASE_URL must be a valid absolute HTTP(S) URL without credentials, query, or fragment.');
  }

  return {
    providerSelection: 'OSRM',
    osrmBaseUrl: url.toString().replace(/\/+$/, '')
  };
}

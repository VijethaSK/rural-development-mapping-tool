const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE_URL = (configuredApiBaseUrl || (import.meta.env.DEV ? 'http://localhost:4000' : '')).replace(/\/+$/, '');

export function apiUrl(path: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(path) || /^[a-z][a-z\d+.-]*:/i.test(path)) return path;
  if (!API_BASE_URL && !import.meta.env.DEV) {
    throw new Error('VITE_API_BASE_URL must be configured for production builds.');
  }
  if (API_BASE_URL && (path === API_BASE_URL || path.startsWith(`${API_BASE_URL}/`))) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), opts);
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiAuth<T>(path: string, token: string, opts: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

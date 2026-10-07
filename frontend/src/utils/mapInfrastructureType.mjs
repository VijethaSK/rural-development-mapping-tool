/** Normalize an API-provided infrastructure type without assigning a fallback type. */
export function normalizeInfrastructureType(type) {
  return typeof type === 'string' ? type.trim().toLowerCase() : '';
}

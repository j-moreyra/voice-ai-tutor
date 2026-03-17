export function parseAllowedOrigins(envValue: string | null | undefined, defaults: string[]): string[] {
  const fromEnv = (envValue ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  return [...new Set([...defaults, ...fromEnv])]
}

export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  return Boolean(origin && allowedOrigins.includes(origin))
}

export function buildCorsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  const allowedOrigin = isOriginAllowed(origin, allowedOrigins)
    ? origin!
    : allowedOrigins[0]

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin
  return headers
}

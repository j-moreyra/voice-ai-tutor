export function parseAllowedOrigins(envValue: string | null | undefined, defaults: string[]): string[] {
  const fromEnv = (envValue ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  if (fromEnv.length > 0) {
    return [...new Set(fromEnv)]
  }

  return [...new Set(defaults)]
}

export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  return Boolean(origin && allowedOrigins.includes(origin))
}

export function buildCorsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

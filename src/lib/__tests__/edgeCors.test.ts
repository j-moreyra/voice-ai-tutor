import { describe, it, expect } from 'vitest'
import { parseAllowedOrigins, isOriginAllowed, buildCorsHeaders } from '../../../supabase/functions/_shared/cors'

describe('edge CORS helpers', () => {
  const defaults = ['http://localhost:5173', 'http://localhost:4173']

  it('parses env origins and deduplicates with defaults', () => {
    const result = parseAllowedOrigins('https://app.example.com, http://localhost:5173', defaults)
    expect(result).toEqual(['http://localhost:5173', 'http://localhost:4173', 'https://app.example.com'])
  })

  it('checks if origin is allowed', () => {
    const allowed = parseAllowedOrigins('https://app.example.com', defaults)
    expect(isOriginAllowed('https://app.example.com', allowed)).toBe(true)
    expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false)
  })

  it('builds cors headers with allowed origin fallback', () => {
    const allowed = parseAllowedOrigins('', defaults)
    const headers = buildCorsHeaders('https://not-allowed.example.com', allowed)
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(headers['Access-Control-Allow-Methods']).toContain('OPTIONS')
  })
})

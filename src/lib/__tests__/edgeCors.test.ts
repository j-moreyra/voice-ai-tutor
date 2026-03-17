import { describe, it, expect } from 'vitest'
import { parseAllowedOrigins, isOriginAllowed, buildCorsHeaders } from '../../../supabase/functions/_shared/cors'

describe('edge CORS helpers', () => {
  const defaults = ['http://localhost:5173', 'http://localhost:4173']

  it('uses env origins as authoritative when provided', () => {
    const result = parseAllowedOrigins('https://app.example.com, https://app.example.com', defaults)
    expect(result).toEqual(['https://app.example.com'])
  })

  it('falls back to defaults when env origins are missing', () => {
    const result = parseAllowedOrigins('', defaults)
    expect(result).toEqual(defaults)
  })

  it('checks if origin is allowed', () => {
    const allowed = parseAllowedOrigins('https://app.example.com', defaults)
    expect(isOriginAllowed('https://app.example.com', allowed)).toBe(true)
    expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false)
  })

  it('builds cors headers only for allowed origins', () => {
    const allowed = parseAllowedOrigins('https://app.example.com', defaults)
    const headers = buildCorsHeaders('https://not-allowed.example.com', allowed)
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(headers['Access-Control-Allow-Methods']).toContain('OPTIONS')
  })
})

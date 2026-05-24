/**
 * Platform Trust — runtime configuration
 *
 * The package's public APIs (withTrust, createTrustMiddleware, trustGate,
 * trustLog, trustMeter) accept an explicit `PlatformTrustConfig` so a BYOK
 * consumer can point the middleware at THEIR Supabase project instead of
 * the portfolio's default trust-events project.
 *
 * Explicit options take precedence over the `PLATFORM_TRUST_SUPABASE_URL`,
 * `PLATFORM_TRUST_SERVICE_KEY`, and `PLATFORM_TRUST_PROJECT_ID` env vars,
 * which remain as a fallback for the legacy "shared trust infra" pattern
 * documented in portfolio-manifest.yaml.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface PlatformTrustConfig {
  /**
   * Supabase URL of YOUR trust-events project. When omitted, falls back to
   * `process.env.PLATFORM_TRUST_SUPABASE_URL`.
   */
  supabaseUrl?: string
  /**
   * Service-role key for the trust-events project. When omitted, falls back
   * to `process.env.PLATFORM_TRUST_SERVICE_KEY`.
   */
  serviceKey?: string
  /**
   * Project ID for the trust-events project. When omitted, falls back to
   * `process.env.PLATFORM_TRUST_PROJECT_ID`.
   */
  projectId?: string
}

export interface ResolvedPlatformTrustConfig {
  supabaseUrl: string
  serviceKey: string
  projectId: string
}

/**
 * Resolve final config from explicit options + env-var fallbacks.
 * Returns `null` if any required field is still empty after both sources.
 */
export function resolvePlatformTrustConfig(
  cfg?: PlatformTrustConfig,
): ResolvedPlatformTrustConfig | null {
  const supabaseUrl = cfg?.supabaseUrl || process.env.PLATFORM_TRUST_SUPABASE_URL || ''
  const serviceKey = cfg?.serviceKey || process.env.PLATFORM_TRUST_SERVICE_KEY || ''
  const projectId = cfg?.projectId || process.env.PLATFORM_TRUST_PROJECT_ID || ''
  if (!supabaseUrl || !serviceKey || !projectId) return null
  return { supabaseUrl, serviceKey, projectId }
}

// Cache one Supabase client per unique (URL, key) pair so repeated calls
// with the same options don't allocate fresh clients each time.
const clientCache = new Map<string, SupabaseClient>()

export function getTrustClient(cfg?: PlatformTrustConfig): {
  client: SupabaseClient | null
  resolved: ResolvedPlatformTrustConfig | null
} {
  const resolved = resolvePlatformTrustConfig(cfg)
  if (!resolved) return { client: null, resolved: null }
  const cacheKey = `${resolved.supabaseUrl}::${resolved.serviceKey}`
  let client = clientCache.get(cacheKey)
  if (!client) {
    client = createClient(resolved.supabaseUrl, resolved.serviceKey)
    clientCache.set(cacheKey, client)
  }
  return { client, resolved }
}

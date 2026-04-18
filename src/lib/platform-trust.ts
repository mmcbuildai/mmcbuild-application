/**
 * Platform Trust integration for mmcbuild.
 *
 * Re-export shim — the actual trustGate / trustLog / trustMeter implementation
 * now lives in the @caistech/platform-trust-middleware package. This file exists
 * so existing call sites like
 *
 *   import { trustGate, trustLog, trustMeter } from '@/lib/platform-trust'
 *
 * keep working without changes.
 *
 * Behaviour is byte-for-byte identical to the previous hand-copied template.
 * Env vars expected at runtime (unchanged):
 *   PLATFORM_TRUST_SUPABASE_URL
 *   PLATFORM_TRUST_SERVICE_KEY
 *   PLATFORM_TRUST_PROJECT_ID
 *
 * See @caistech/platform-trust-middleware v0.2.0 for source.
 */

export { trustGate, trustLog, trustMeter } from '@caistech/platform-trust-middleware';
export type { TrustContext, TrustGateResult } from '@caistech/platform-trust-middleware';

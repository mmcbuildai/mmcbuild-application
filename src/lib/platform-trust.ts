/**
 * Platform Trust integration for mmcbuild.
 *
 * Re-export shim. The trustGate / trustLog / trustMeter implementation is folded
 * into the app at src/lib/services/platform-trust-middleware (was the
 * @caistech/platform-trust-middleware package before the 2026-05-24 fold-in).
 * This file keeps existing call sites working:
 *
 *   import { trustGate, trustLog, trustMeter } from '@/lib/platform-trust'
 *
 * Env vars expected at runtime (unchanged):
 *   PLATFORM_TRUST_SUPABASE_URL
 *   PLATFORM_TRUST_SERVICE_KEY
 *   PLATFORM_TRUST_PROJECT_ID
 */

export { trustGate, trustLog, trustMeter } from '@/lib/services/platform-trust-middleware';
export type { TrustContext, TrustGateResult } from '@/lib/services/platform-trust-middleware';

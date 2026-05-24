export { checkRateLimit } from './checkRateLimit'
export type { RateLimitInput, RateLimitResult } from './checkRateLimit'

export { checkPermission } from './checkPermission'
export type { PermissionInput, PermissionResult } from './checkPermission'

export { logAuditEvent } from './logAuditEvent'
export type { AuditEventInput, AuditEventResult } from './logAuditEvent'

export { meterCall } from './meterCall'
export type { MeterCallInput, MeterCallResult } from './meterCall'

export { withTrust, createTrustMiddleware } from './nextjs'
export type { ScopeRule, WithTrustOptions } from './nextjs'

// Compat shim for the hand-copied lib/platform-trust.ts template
// (see src/trust-gate.ts for behavioural details vs the primitives).
export { trustGate, trustLog, trustMeter } from './trust-gate'
export type { TrustContext, TrustGateResult } from './trust-gate'

// BYOK config — explicit options that override the PLATFORM_TRUST_* env vars.
export type { PlatformTrustConfig, ResolvedPlatformTrustConfig } from './config'
export { resolvePlatformTrustConfig } from './config'

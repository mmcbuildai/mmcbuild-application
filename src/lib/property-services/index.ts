/**
 * Property Services SDK — re-export shim.
 *
 * Sources the canonical published @caistech/property-services-sdk (0.7.0+) — the
 * single approved property feed. The 2026-05-24 local fold-in under
 * src/lib/services/property-services-sdk was retired on 2026-07-05 (it had frozen
 * at ~0.4-era: no comparables/dossier/suggest/contribute/terrain). Named exports
 * are listed explicitly so Turbopack resolves them statically.
 */

export {
  PropertyServicesClient,
  PropertyServicesError,
  createPropertyServices,
  usePropertyOnboarding,
  PropertyAssessment,
} from '@caistech/property-services-sdk';

export type {
  PropertyProfile,
  NormalisedAddress,
  LotInfo,
  ZoningInfo,
  EnvironmentInfo,
  PlanningOverlay,
  SubdivisionAnalysis,
  ProfileMetadata,
  SuitabilityAssessment,
  DeriveResponse,
  AssessResponse,
  PropertyServicesConfig,
  UsePropertyOnboardingReturn,
  OnboardingStage,
} from '@caistech/property-services-sdk';

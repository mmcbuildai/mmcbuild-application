/**
 * Property Services SDK — re-export shim.
 *
 * Folded into the app at src/lib/services/property-services-sdk (was the
 * @caistech/property-services-sdk package before the 2026-05-24 fold-in).
 * Named exports are listed explicitly so Turbopack resolves them statically.
 */

export {
  PropertyServicesClient,
  PropertyServicesError,
  createPropertyServices,
  usePropertyOnboarding,
  PropertyAssessment,
} from '@/lib/services/property-services-sdk';

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
} from '@/lib/services/property-services-sdk';

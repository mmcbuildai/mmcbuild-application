/**
 * @caistech/property-services-sdk
 *
 * Shared property intelligence for F2K-Checkpoint, DealFindrs, MMC Build.
 */

// Types
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
} from './types'

// Client
export { PropertyServicesClient, PropertyServicesError, createPropertyServices } from './client'
export type { PropertyServicesConfig } from './client'

// React hook
export { usePropertyOnboarding } from './usePropertyOnboarding'
export type { UsePropertyOnboardingReturn, OnboardingStage } from './usePropertyOnboarding'

// Components
export { PropertyAssessment } from './PropertyAssessment'

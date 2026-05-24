/**
 * @caistech/property-services-sdk types.
 * Mirror of the edge function types for TypeScript consumers.
 */

export interface PropertyProfile {
  address: NormalisedAddress
  lot: LotInfo | null
  zoning: ZoningInfo | null
  environment: EnvironmentInfo
  overlays: PlanningOverlay[]
  subdivision: SubdivisionAnalysis | null
  summary: string
  metadata: ProfileMetadata
}

export interface NormalisedAddress {
  full: string
  streetNumber: string
  streetName: string
  suburb: string
  state: string
  postcode: string
  lat: number
  lng: number
}

export interface LotInfo {
  lotSize: number | null
  lotNumber: string | null
  planNumber: string | null
  parcelId: string | null
}

export interface ZoningInfo {
  code: string
  name: string
  description: string | null
  minimumLotSize: number | null
  maximumHeight: number | null
  maximumHeightStoreys: number | null
  setbacks: {
    front: number | null
    side: number | null
    rear: number | null
    notes: string | null
  } | null
  permittedUses: string[]
  subdivisionPermitted: boolean
  modularProvisions: string | null
}

export interface EnvironmentInfo {
  windRegion: string | null
  windSpeed: number | null
  climateZone: string | null
  climateZoneNumber: number | null
  climateDescription: string | null
  bal: string | null
  balInOverlay: boolean
}

export interface PlanningOverlay {
  type: string
  name: string
  requirements: string[]
  requiresReport: boolean
}

export interface SubdivisionAnalysis {
  torrens: {
    feasible: boolean
    maxLots: number | null
    minLotSize: number | null
    lotSizeEach: number | null
  }
  strata: {
    feasible: boolean
    minLotSize: number | null
    notes: string
  }
  recommendations: string[]
  warnings: string[]
}

export interface ProfileMetadata {
  sourceApis: string[]
  lgaCode: string | null
  lgaName: string | null
  lgaCoverage: 'full' | 'partial' | 'none'
  cached: boolean
  derivedAt: string
  expiresAt: string
}

export interface SuitabilityAssessment {
  suitable: boolean
  confidence: 'high' | 'medium' | 'low'
  verdict: string
  zoningCompatibility: {
    compatible: boolean
    details: string
    permittedAs: string | null
  }
  overlayImpacts: Array<{
    overlay: string
    impact: 'blocking' | 'requires_action' | 'minor' | 'none'
    detail: string
  }>
  requirements: string[]
  risks: string[]
  recommendations: string[]
  nextSteps: string[]
}

export interface DeriveResponse {
  success: boolean
  data?: PropertyProfile
  lookupId?: string
  error?: string
}

export interface AssessResponse {
  success: boolean
  data?: SuitabilityAssessment
  error?: string
}

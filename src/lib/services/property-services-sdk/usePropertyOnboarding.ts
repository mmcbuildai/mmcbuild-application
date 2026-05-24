/**
 * usePropertyOnboarding — React hook for the property layer.
 *
 * Plugs into each product's existing AddressAutocomplete.
 * When a user selects an address, this hook:
 * 1. Derives the full property profile (cached, ~100ms or ~3s first time)
 * 2. Returns structured data for the product to display/use
 * 3. Optionally runs AI suitability assessment
 *
 * Usage in F2K-Checkpoint:
 *   const { derive, assess, profile, assessment, loading } = usePropertyOnboarding({
 *     supabaseUrl: process.env.NEXT_PUBLIC_PROPERTY_SERVICES_URL!,
 *     apiKey:      process.env.NEXT_PUBLIC_PROPERTY_SERVICES_API_KEY!,
 *     product: 'f2k',
 *   })
 *
 * `apiKey` is issued from the property-services Supabase `api_keys` table
 * (one per consuming product). Functions are deployed `--no-verify-jwt`
 * since 2026-04-30, so the Supabase anon key is no longer required.
 *
 *   // In your existing AddressAutocomplete onSelect:
 *   async function handleAddressSelect(address, coords) {
 *     await derive({ address, lat: coords.lat, lng: coords.lng })
 *   }
 *
 *   // When user enters their use case:
 *   async function handleAssess(useCase: string) {
 *     await assess(useCase)
 *   }
 */
import { useState, useCallback, useRef } from 'react'
import { PropertyServicesClient } from './client'
import type { PropertyServicesConfig } from './client'
import type { PropertyProfile, SuitabilityAssessment } from './types'

export type OnboardingStage =
  | 'idle'          // waiting for address
  | 'deriving'      // fetching property data
  | 'ready'         // profile available
  | 'assessing'     // running AI suitability check
  | 'assessed'      // assessment complete
  | 'error'         // something failed

export interface UsePropertyOnboardingReturn {
  /** Current stage of the onboarding flow */
  stage: OnboardingStage
  /** Derived property profile (null until derived) */
  profile: PropertyProfile | null
  /** AI suitability assessment (null until assessed) */
  assessment: SuitabilityAssessment | null
  /** Lookup ID for the cached profile (pass to assess) */
  lookupId: string | null
  /** Whether any operation is in progress */
  loading: boolean
  /** Error message if something failed */
  error: string | null

  /** Derive property profile from address + coordinates */
  derive: (params: {
    address: string
    lat?: number
    lng?: number
    suburb?: string
    state?: string
    postcode?: string
  }) => Promise<PropertyProfile | null>

  /** Run AI suitability assessment for a use case */
  assess: (useCase: string) => Promise<SuitabilityAssessment | null>

  /** Reset everything (e.g., user changes address) */
  reset: () => void
}

export function usePropertyOnboarding(
  config: PropertyServicesConfig
): UsePropertyOnboardingReturn {
  const [stage, setStage] = useState<OnboardingStage>('idle')
  const [profile, setProfile] = useState<PropertyProfile | null>(null)
  const [assessment, setAssessment] = useState<SuitabilityAssessment | null>(null)
  const [lookupId, setLookupId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Lazy-init client — config is validated at hook call time (render), not in async callback
  const clientRef = useRef<PropertyServicesClient | null>(null)
  const configRef = useRef(config)
  configRef.current = config

  function getClient() {
    if (!clientRef.current) {
      clientRef.current = new PropertyServicesClient(configRef.current)
    }
    return clientRef.current
  }

  const derive = useCallback(
    async (params: {
      address: string
      lat?: number
      lng?: number
      suburb?: string
      state?: string
      postcode?: string
    }): Promise<PropertyProfile | null> => {
      setStage('deriving')
      setError(null)
      setAssessment(null)

      try {
        const client = getClient()
        const res = await client.derive(params)

        if (res.success && res.data) {
          setProfile(res.data)
          setLookupId(res.lookupId ?? null)
          setStage('ready')
          return res.data
        } else {
          setError(res.error ?? 'Derivation failed')
          setStage('error')
          return null
        }
      } catch (err) {
        setError(String((err as Error).message))
        setStage('error')
        return null
      }
    },
    []
  )

  const assess = useCallback(
    async (useCase: string): Promise<SuitabilityAssessment | null> => {
      if (!profile && !lookupId) {
        setError('No property profile — derive first')
        return null
      }

      setStage('assessing')
      setError(null)

      try {
        const client = getClient()
        const res = await client.assess({
          lookupId: lookupId ?? undefined,
          profile: lookupId ? undefined : profile ?? undefined,
          useCase,
        })

        if (res.success && res.data) {
          setAssessment(res.data)
          setStage('assessed')
          return res.data
        } else {
          setError(res.error ?? 'Assessment failed')
          setStage('error')
          return null
        }
      } catch (err) {
        setError(String((err as Error).message))
        setStage('error')
        return null
      }
    },
    [profile, lookupId]
  )

  const reset = useCallback(() => {
    setStage('idle')
    setProfile(null)
    setAssessment(null)
    setLookupId(null)
    setError(null)
  }, [])

  return {
    stage,
    profile,
    assessment,
    lookupId,
    loading: stage === 'deriving' || stage === 'assessing',
    error,
    derive,
    assess,
    reset,
  }
}

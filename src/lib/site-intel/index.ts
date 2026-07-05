/**
 * Site intelligence orchestrator.
 *
 * Derives climate zone, wind region, BAL, council/LGA and zoning for a project
 * site by calling the SHARED property-services service — NOT by downloading
 * geospatial datasets into this app's own Supabase. The datasets (climate
 * zones, wind regions, LGA boundaries) are a CAS-owned shared asset that lives
 * once in property-services and is served via its `derive` endpoint; they are
 * never copied into a client repo/Supabase. (This replaced the local
 * `climate.ts`/`wind-region.ts`/`council.ts` geojson-bucket lookups, whose
 * missing `climate_clean.geojson` object was the source of the
 * "[climate] Failed to load GeoJSON" production error.)
 */

import { createPropertyServices } from "@caistech/property-services-sdk";
import type { PropertyProfile, PlanningOverlay } from "@caistech/property-services-sdk";

export interface SiteIntelResult {
  climate_zone: number | null;
  wind_region: string | null;
  bal_rating: string | null;
  council_name: string | null;
  council_code: string | null;
  zoning: string | null;
  /** Authoritative overlays (bushfire/flood/heritage/…) — previously hardcoded to {}. */
  overlays: PlanningOverlay[];
  /** Denormalised constructability inputs (previously dropped). */
  lot_size_sqm: number | null;
  slope_percent: number | null;
  buildability: string | null;
  /** The full PropertyProfile → persisted to projects.property_profile (was dead). */
  profile: PropertyProfile | null;
}

export interface DeriveSiteIntelInput {
  lat: number;
  lng: number;
  /** Required by property-services `derive`. Falls back to a lat/lng string. */
  address: string;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
}

const EMPTY: SiteIntelResult = {
  climate_zone: null,
  wind_region: null,
  bal_rating: null,
  council_name: null,
  council_code: null,
  zoning: null,
  overlays: [],
  lot_size_sqm: null,
  slope_percent: null,
  buildability: null,
  profile: null,
};

export async function deriveSiteIntel(
  input: DeriveSiteIntelInput,
): Promise<SiteIntelResult> {
  // Prefer server-only credentials; fall back to the public ones the create
  // dialog already uses. If property-services isn't configured, degrade to
  // nulls (callers treat site intel as best-effort) rather than throwing.
  const supabaseUrl =
    process.env.PROPERTY_SERVICES_URL ??
    process.env.NEXT_PUBLIC_PROPERTY_SERVICES_URL;
  const apiKey =
    process.env.PROPERTY_SERVICES_API_KEY ??
    process.env.NEXT_PUBLIC_PROPERTY_SERVICES_API_KEY;

  if (!supabaseUrl || !apiKey) {
    console.error(
      "[deriveSiteIntel] property-services not configured — returning empty site intel",
    );
    return EMPTY;
  }

  const address =
    input.address?.trim() || `${input.lat}, ${input.lng}`;

  try {
    const client = createPropertyServices({
      supabaseUrl,
      apiKey,
      product: "mmcbuild",
    });
    const res = await client.derive({
      address,
      lat: input.lat,
      lng: input.lng,
      suburb: input.suburb ?? undefined,
      state: input.state ?? undefined,
      postcode: input.postcode ?? undefined,
    });

    const profile = res.data;
    if (!res.success || !profile) {
      console.error(
        "[deriveSiteIntel] property-services derive returned no profile:",
        res.error,
      );
      return EMPTY;
    }

    return {
      climate_zone: profile.environment.climateZoneNumber,
      wind_region: profile.environment.windRegion,
      bal_rating: profile.environment.bal,
      council_name: profile.metadata.lgaName,
      council_code: profile.metadata.lgaCode,
      zoning: profile.zoning?.name ?? null,
      overlays: profile.overlays ?? [],
      lot_size_sqm: profile.lot?.lotSize ?? null,
      slope_percent: profile.terrain?.slopePercent ?? null,
      buildability: profile.terrain?.buildability ?? null,
      profile,
    };
  } catch (e) {
    console.error("[deriveSiteIntel] property-services derive failed:", e);
    return EMPTY;
  }
}

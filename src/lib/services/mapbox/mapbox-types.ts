/** Mapbox Geocoding API v6 response types (subset) */

export interface MapboxFeature {
  id: string;
  type: "Feature";
  place_type: string[];
  text: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  context?: MapboxContext[];
  properties: Record<string, unknown>;
}

export interface MapboxContext {
  id: string;
  text: string;
  short_code?: string;
  wikidata?: string;
}

export interface GeocodedAddress {
  latitude: number;
  longitude: number;
  formatted_address: string;
  suburb: string | null;
  postcode: string | null;
  state: string | null;
}

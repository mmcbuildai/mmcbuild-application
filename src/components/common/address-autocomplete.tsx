"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { forwardSearch, reverseSearch, parseCoordinates, featureToGeocodedAddress } from "@/lib/services/mapbox";
import type { MapboxFeature, GeocodedAddress } from "@/lib/services/mapbox";

interface AddressAutocompleteProps {
  onSelect: (address: GeocodedAddress) => void;
  placeholder?: string;
  defaultValue?: string;
}

export function AddressAutocomplete({
  onSelect,
  placeholder = "Start typing an address…",
  defaultValue = "",
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const coords = parseCoordinates(q);
      const results = coords
        ? await reverseSearch(coords.lat, coords.lng)
        : await forwardSearch(q);
      setSuggestions(results);
      setOpen(results.length > 0);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(value: string) {
    setQuery(value);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (value.length < 4) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    timerRef.current = setTimeout(() => search(value), 300);
  }

  function handleSelect(feature: MapboxFeature) {
    const geocoded = featureToGeocodedAddress(feature);
    setQuery(geocoded.formatted_address);
    setSuggestions([]);
    setOpen(false);
    onSelect(geocoded);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {suggestions.map((feature) => (
            <button
              key={feature.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => handleSelect(feature)}
            >
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{feature.place_name}</span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}
    </div>
  );
}

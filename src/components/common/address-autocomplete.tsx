"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { forwardSearch, reverseSearch, parseCoordinates, featureToGeocodedAddress } from "@/lib/services/mapbox";
import type { MapboxFeature, GeocodedAddress } from "@/lib/services/mapbox";
import { resolveAddressKey } from "@/lib/address/keynav";

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
  const [highlight, setHighlight] = useState(0);
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
      setHighlight(0);
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

  // This input sits inside a <form>; a bare Enter would submit it — creating
  // the project/record before the user has picked an address from the list
  // (SCRUM-335). Route Enter to "choose the highlighted suggestion" and never
  // let it reach the form submit; arrow keys move the highlight; Escape closes.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const action = resolveAddressKey(e.key, {
      open,
      count: suggestions.length,
      highlight,
    });
    switch (action.type) {
      case "move":
        e.preventDefault();
        setHighlight(action.highlight);
        break;
      case "select":
        e.preventDefault();
        handleSelect(suggestions[action.index]);
        break;
      case "preventSubmit":
        e.preventDefault();
        break;
      case "close":
        setOpen(false);
        break;
      case "passthrough":
        break;
    }
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
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />

      {open && suggestions.length > 0 && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {suggestions.map((feature, i) => (
            <button
              key={feature.id}
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                i === highlight ? "bg-accent" : "hover:bg-accent"
              }`}
              onMouseEnter={() => setHighlight(i)}
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

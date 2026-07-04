import type { MmcTechnologyCategory } from "@/lib/ai/types";

/**
 * Map a user-selected construction system (the `projects.selected_systems`
 * keys, defined in `system-selection-panel.tsx` `CONSTRUCTION_SYSTEMS`) to the
 * design-suggestion technology categories (`MMC_TECHNOLOGY_CATEGORIES` in
 * `ai/types.ts`) it should surface.
 *
 * The two vocabularies were authored independently, so a straight
 * `array.includes()` does not line up — this is the bridge between them.
 *
 * Why this exists: Design Optimisation used to store EVERY AI suggestion
 * regardless of the systems the owner picked, so selecting "SIPs" still showed
 * roof trusses, modular pods, precast, etc. (Karen, 2026-07-03). Narrowing the
 * output to the selected systems is the fix.
 */
export const SYSTEM_TO_CATEGORIES: Record<string, MmcTechnologyCategory[]> = {
  // Available-now systems (comingSoon: false)
  sips: ["sip_panels", "prefabricated_wall_panels"],
  volumetric_modular: ["modular_pods"],
  concrete_printing: ["precast_concrete"],
  // Coming-soon systems — mapped now so the filter is correct the moment they
  // become selectable.
  clt: ["clt_mass_timber"],
  steel_frame: ["steel_framing"],
  timber_frame: ["prefabricated_wall_panels"],
  hybrid: ["hybrid_systems"],
};

/**
 * The set of suggestion categories that the selected systems should surface.
 * Returns null when nothing is selected (caller should not filter in that case).
 */
export function categoriesForSelectedSystems(
  selectedSystems: string[] | null | undefined,
): Set<MmcTechnologyCategory> | null {
  if (!selectedSystems || selectedSystems.length === 0) return null;
  const out = new Set<MmcTechnologyCategory>();
  for (const sys of selectedSystems) {
    for (const cat of SYSTEM_TO_CATEGORIES[sys] ?? []) out.add(cat);
  }
  return out.size > 0 ? out : null;
}

/**
 * Narrow AI-generated design suggestions to the owner's selected systems.
 *
 * Guarantees:
 * - No selection (or an unmappable selection) → return everything unchanged.
 * - A filter that would drop EVERY suggestion falls back to returning
 *   everything, so a report is never left empty (an empty report reads as a
 *   broken run, which is worse than an over-broad one).
 */
export function filterSuggestionsBySystems<T extends { technology_category: string }>(
  suggestions: T[],
  selectedSystems: string[] | null | undefined,
): T[] {
  const allowed = categoriesForSelectedSystems(selectedSystems);
  if (!allowed) return suggestions;
  const filtered = suggestions.filter((s) =>
    allowed.has(s.technology_category as MmcTechnologyCategory),
  );
  return filtered.length > 0 ? filtered : suggestions;
}

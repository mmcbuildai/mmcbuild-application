/**
 * Trades & Suppliers pricing visibility gate.
 *
 * The supplier tiers are NOT in Go Live 1 (Dennis, 2026-07-31), and the prices
 * currently advertised on /mmc-suppliers — "$99 Basic Directory" and "$499
 * Professional Directory" — match neither the confirmed model ($199 Verified
 * Suppliers / $299 Growth Partner) nor anything purchasable: `plans.ts` never
 * reads a supplier price ID, so no supplier tier can be bought in-app.
 *
 * A public page quoting prices that don't exist and can't be paid is the
 * problem. But the rest of that page is doing real work — it explains the
 * directory, lists what each listing level includes, and carries the join form
 * that produces actual supplier leads (Hayley, SCRUM-294). Deleting the page
 * would cost those leads to remove a number.
 *
 * So this gates the PRICE CLAIMS only. Off: the dollar figures, the billing
 * period, the "first 2 months free" offer, and the GST disclosure disappear.
 * The tiers keep their names, every feature list stays, the comparison table
 * stays (its columns are keyed by tier name, not price), and the join form is
 * untouched. Suppliers can still see what they'd get and register interest;
 * they just aren't quoted a price we can't honour yet.
 *
 * DEFAULT = ENABLED, mirroring `isBetaTestingEnabled`. Absent or any value
 * other than the literal string "false" leaves pricing visible, so merging this
 * changes nothing until the env var is set. To hide it for Go Live, set
 *   NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED=false
 * in the environment (production + preview) and redeploy.
 *
 * NEXT_PUBLIC_* is readable in both server and client components, so this one
 * helper gates the marketing page and the /pricing cross-link together.
 *
 * Nothing is deleted. When the supplier tiers are priced, wired to real Stripe
 * price IDs, and ready to sell, correct the figures and flip this back on.
 */
export function isSupplierPricingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED !== "false";
}

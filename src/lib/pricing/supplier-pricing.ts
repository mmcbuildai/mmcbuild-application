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
 * DEFAULT = DISABLED, inverted on 2026-08-09. It previously defaulted to
 * ENABLED, mirroring `isBetaTestingEnabled`, so that merging the gate changed
 * nothing until the env var was set. That was the right call at merge time and
 * the wrong one to leave standing, because the two flags carry opposite risk:
 * `isBetaTestingEnabled` wrongly on shows a module, while this one wrongly on
 * PUBLISHES PRICES NOBODY CAN PAY — and it only takes the absence of a variable.
 * A preview environment, a new Vercel project, or someone tidying an env list
 * would have quoted "$99 Basic Directory" and "first 2 months free" to the
 * public, with nothing erroring and nothing to notice.
 *
 * `purchase-cta.ts` already states the principle in this repo: a flag that opens
 * a commercial door "must default to the SAFE state", and the safe state here is
 * not quoting a price. The two flags now agree.
 *
 * ⚠️ NO BEHAVIOUR CHANGE IN PRODUCTION. Both Vercel projects already set this to
 * "false" (verified live 2026-08-09 — neither site renders any supplier figure),
 * and "false" is still not "true", so production stays exactly as it is. What
 * changes is only what happens when the variable is ABSENT.
 *
 * To show supplier pricing once the figures are correct and purchasable, set
 *   NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED=true
 * in the environment (production + preview) and redeploy.
 *
 * NEXT_PUBLIC_* is readable in both server and client components, so this one
 * helper gates the marketing page and the /pricing cross-link together.
 *
 * Nothing is deleted. When the supplier tiers are priced, wired to real Stripe
 * price IDs, and ready to sell, correct the figures and flip this back on.
 */
export function isSupplierPricingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED === "true";
}

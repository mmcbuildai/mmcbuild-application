# PRD — CTA → sign-up → 14-day trial → auto-charge

**Status:** DRAFT, awaiting Karen + Karthik sign-off. Not yet ratified in Jira.
**Source:** MMC Build client call, **2026-07-29** (recording + transcript held by Dennis).
**Answers:** SCRUM-353 open question 2(a) — *"are live Stripe payments required at launch?"* →
**YES** (Dennis, 2026-07-31). This flow is therefore a **go-live gate**, not post-launch work.

---

## 1. The decision, as settled on the call

> Users sign up → enter credit card → 14-day free trial → auto-charged at **$49/month** default
> if no action is taken; users are informed up front.

Step by step:

1. **The external CTA points at the sign-up page** — not the marketing contact page. Karthik:
   *"I don't think we should send them the contact page, because they just sit in the database and
   nothing happens… we want that data from them, at least their sign-up information."* Karen
   confirmed the ads currently land on the contact page and *"it's not working because they're not
   actually signing"* up.
2. **Sign-up captures a card through Stripe.** Karthik: *"they enter their credit card information,
   which goes into Stripe. We don't charge them, but we store the information… free for 14 days."*
3. **The default plan is Essential at $49/month** (the early-adopter price already in `plans.ts`).
   No plan chooser is shown at sign-up.
4. **At day 14 the card is charged automatically** unless the user has cancelled or changed plan.
5. **This is disclosed up front, at sign-up.** Dennis: *"if you don't make any decision, at 14 days,
   your credit card is going to be charged X amount of dollars."* Karen: *"we'll have to sign that
   up front."*
6. **The user is warned before the charge** — a notification around day 11 (*"your 14-day trial is
   about to run out. Click here to choose your plan"*), plus softer upgrade messaging
   (*"how was your experience going? Did you think you needed more runs?"*).

### ⚠️ Read this before building: the first proposal was overridden

Mid-discussion, Dennis proposed a hidden "free" plan that simply **cuts the user off** at day 14:
*"if they don't do anything, it just cuts out at 14. We just cut them off at 14 days."* Karthik
agreed. **Karen rejected it** — *"I don't necessarily want them to have that control… they'll forget
about it, and then we'll lose people. It's hard enough getting them in there, but getting them back
is even harder"* — and Dennis accepted, conditional on up-front disclosure.

**The settled behaviour is auto-charge at day 14, not cut-off.** Anyone reading only the middle of
that discussion will build the wrong product.

---

## 2. What exists today

| Piece | Today | Required |
|---|---|---|
| CTA destination | Marketing **contact page** | **Sign-up page** |
| Sign-up → leads/HubSpot | None in `main`; **PR #136** adds it (open) | Merged |
| Card capture at sign-up | **None.** Sign-up never touches Stripe | Stripe Checkout, card stored |
| Trial mechanism | Bare DB default — `organisations.trial_ends_at = now() + 14 days` (migration `00027`) | Stripe subscription in `trialing` |
| Trial run cap | **`TRIAL_RUN_LIMIT = 3`** (`plans.ts`) — trial dies after 3 runs regardless of days | See open decision D1 |
| Charge at day 14 | **None** | Automatic, via Stripe |
| Trial-ending alerts | **None** | Day-7 / day-11 / day-13 emails |
| Stripe account state | **Non-functional** — 0 customers, 0 subscriptions, 0 webhooks; the four `STRIPE_*_PRICE_ID` env vars are unset (SCRUM-332, In Review) | Live mode, products + prices, webhook verified |

So the only part of the agreed flow that exists is the *word* "14 days" in a column default.

---

## 3. Design

### 3.1 Sign-up

`provisionUser` keeps its current responsibilities (profile, org, `recordSignupLead` from PR #136),
then the user is sent to a Stripe Checkout Session:

- `mode: 'subscription'`, line item = `STRIPE_ESSENTIAL_EARLY_PRICE_ID` ($49/mo).
- `subscription_data.trial_period_days: 14`.
- **`payment_method_collection: 'always'` — non-negotiable.** Stripe's default (`if_required`)
  **does not collect a card when a trial is present.** The subscription is created card-less, the
  trial looks perfectly healthy for 14 days, and then the first charge fails silently. That single
  default would defeat Karen's entire requirement, and it would surface as churn rather than as an
  error.
- On completion, the webhook writes the `subscriptions` row (`status: 'trialing'`).

### 3.2 Trial → paid

Stripe drives the transition; we react to it. `customer.subscription.updated` moves
`trialing → active` (charge succeeded) or `past_due` (failed). No local ticker decides billing —
the DB `trial_ends_at` becomes display-only, because two sources of truth for "has this person paid"
is how double-charges and free-forever accounts both happen.

**`getSubscriptionStatus` needs revisiting** (`src/lib/stripe/subscription.ts`): it already treats
`trialing` as an active subscription and takes the subscription branch, which returns
`trialEndsAt: null` and derives `daysRemaining` from `current_period_end`. During a Stripe trial
`current_period_end` *is* the trial end, so the days maths survives — but `trialEndsAt: null` will
silently stop the trial banner rendering. That is a real regression to catch in test, not at launch.

### 3.3 Alerts

An Inngest scheduled function queries subscriptions in `trialing` and sends at **day 7** (mid-trial
value check), **day 11** (Karen's "choose your plan" prompt) and **day 13** (24-hour notice naming
the exact amount and date). Each send is recorded so a retry cannot double-send.

**Dependency:** these are the first emails that must reliably reach a real inbox at a real moment.
**SCRUM-323** (DKIM / real `mmcbuild.com.au` mailbox) is a hard prerequisite — a trial-ending
warning in spam is indistinguishable from no warning, and the consequence is an unexpected charge.

### 3.4 Disclosure

At sign-up, adjacent to the card field and above the submit button — not in a linked document:

> Your 14-day free trial starts today. We'll charge the card **$49/month (Essential)** on
> **[date]** unless you cancel or change plan before then. Cancel any time from Billing.

`/terms` must state the same terms. Cancellation must be reachable in-app (the Stripe billing
portal is already wired — `createPortalSession`).

---

## 4. Open decisions — needed before build

| # | Decision | Why it matters | Owner |
|---|---|---|---|
| **D1** | **Does the 3-run trial cap survive?** `TRIAL_RUN_LIMIT = 3` today. "Free for 14 days" and "3 runs" are different promises, and a user who exhausts 3 runs on day 2 gets 12 days of a dead product before being charged $49. | Directly shapes conversion and complaints | Karen |
| **D2** | **Is $49 inclusive or exclusive of GST?** **No price surface anywhere states GST today** — not the pricing page, not billing. An unqualified figure reads to a business buyer as the amount leaving their account. This is a tax decision with real consequences, so it is not being guessed here. | Legal/tax; every displayed price | Karen |
| **D3** | Alert schedule — confirm day 7 / 11 / 13. Day 11 was *"day 11 or whatever"* on the call. | Fixes the build | Karen |
| **D4** | Failed first charge — how many Stripe retries, and does access pause immediately at `past_due` or after a grace period? | Determines revenue leakage vs. angry users | Karen + Dennis |
| **D5** | Sign-up defaults to Essential with no chooser — confirm Professional is an in-app upgrade only. | Confirms §1.3 | Karthik |

---

## 5. Acceptance criteria

1. A click on the external CTA lands on the sign-up page.
2. Completing sign-up creates: a Supabase user + org, a `leads` row with `form_type='signup'`
   synced to HubSpot (PR #136), **and** a Stripe customer with a stored card.
3. The subscription exists in Stripe as `trialing` on Essential $49/mo with 14 trial days, and
   `subscriptions` reflects it.
4. The disclosure copy naming the amount and the date is visible before submit.
5. Trial-ending emails arrive at day 7, 11 and 13 in a real inbox (not spam).
6. At day 14 with no user action, the card is charged $49 and status becomes `active`.
7. A user who cancels before day 14 is not charged, and loses access at trial end.
8. A failed charge sets `past_due` and behaves per D4.
9. Webhook handling is idempotent and order-safe — a Stripe redelivery must not double-apply, and a
   late-arriving event must not resurrect cancelled state.

## 6. Risks

- **Stripe is not merely unconfigured, it is unexercised.** Zero webhooks have ever been received in
  production. The first real event will arrive from a paying member of the public.
- **Charging a card is irreversible in reputation terms.** This is the first flow in the product
  that takes money from someone who may have forgotten they signed up. Every safeguard here —
  disclosure, three warnings, easy cancellation — exists because Karen explicitly traded user
  goodwill for conversion, and that trade only holds if the warnings actually work.
- **Test-mode verification is not proof.** Live-mode keys, live prices and a live webhook secret are
  a distinct configuration; the cutover smoke test in SCRUM-353 Phase 2 must include a real card.

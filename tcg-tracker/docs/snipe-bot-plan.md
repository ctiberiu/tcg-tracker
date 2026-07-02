# Snipe — Auto-Purchase Bot (Plan / Draft Epic)

> Status: **Draft plan** for review. Prepared for the Brainstormer (architect) →
> Coder (implementation) → Code Reviewer (final review) pipeline.
> Naming: **Snipe** (the bot = "the Sniper"). It watches for a restock and
> finalizes an order.

## 1. Goal

Let a user automatically buy a hard-to-get TCG product the moment it's in
stock, using **their own logged-in session** on the target store, with a
per-store checkout flow they configure. **First and only target: krit.ro.**

Two ways to target an item:
- **Mode A — Direct link:** watch a specific product URL (often currently
  sold out); when it becomes available, buy it.
- **Mode B — Keyword search:** search the store for a set of keywords
  (e.g. `pokemon, tcg, prismatic, elite`) and buy the item whose title
  matches all of them (e.g. *Pokemon TCG: Prismatic Evolutions Elite Trainer
  Box*).

Both modes support a **desired quantity**, capped by the store's **per-person
purchase limit** (buy `min(desiredQty, detectedLimit)`).

## 2. The defining constraint (why it's a browser extension)

A page hosted on our dashboard domain **cannot** use a user's krit.ro session
(same-origin policy: it can't read Krit's cookies, make logged-in requests, or
drive a Krit tab). Executing a purchase with the user's own account/payment
must therefore happen **inside the user's own browser**.

➡️ **Architecture: a browser extension** does the automation in the user's
browser (using their live Krit session), and the dashboard provides a
configuration + trigger UI. Any user who wants the feature installs the
extension once.

```
User logged into krit.ro (own session, saved address)
        │
[ Dashboard "Snipe" page ]  ──Play (postMessage)──►  [ Snipe extension ]
   - create site flows                                 - background worker runs
   - create tasks (mode/qty)                              the watch loop
   - Download extension                                 - content scripts drive
   - How-to-install modal                                 krit.ro: stock → cart →
   - Play / Stop / status                                 checkout → shipping →
                                                          payment (ramburs=auto,
                                                          card=pause for user)
```

Multi-account = the user runs separate browser **profiles**, each logged into a
different Krit account, each with the extension. No shared/stored credentials.

## 3. Guardrails (mandatory)

1. **No stored credentials or card data.** The extension uses the live browser
   session only. We never store Krit passwords or payment details anywhere.
2. **Card payment = human-in-the-loop.** For a card flow, the extension fills
   everything up to the payment step, then **pauses and notifies** the user to
   complete card entry / 3-D-Secure OTP / click "Place order." Ramburs
   (cash-on-delivery) flows may auto-complete since there is no card step.
3. **Respect per-person limits.** Never attempt to exceed the store's stated
   per-customer max on a single account.
4. **No anti-bot / CAPTCHA evasion.** If a CAPTCHA or OTP appears, hand control
   back to the user. We do not attempt to defeat protections.
5. **ToS awareness.** Automating checkout — and especially using multiple
   accounts to exceed per-person limits — may violate krit.ro's terms and risk
   account/order cancellation. This is the user's decision; documented in the UI.

## 4. Configuration model (per-store "flow" + "task")

Stored in Supabase (per user via auth), managed from the dashboard page.

- **Flow** (per store; Krit only for now):
  - `site` (krit.ro)
  - `payment_method`: `ramburs` (auto-place) | `card` (pause for user)
  - `shipping_method` (store-specific option)
  - `address`: "use account's saved default" or a chosen saved address
- **Task** (what to buy):
  - `flow_id`
  - `mode`: `link` | `keywords`
  - `url` (Mode A) or `keywords[]` (Mode B)
  - `desired_qty`, `respect_limit` (default true), optional `max_price`
  - `status`: idle | running | grabbed | awaiting_payment | ordered | failed
  - `check_interval` (Mode A watch): default ~10s with jitter

Proposed tables: `snipe_flows`, `snipe_tasks`, `snipe_runs` (audit log), all
scoped to `user_id`, RLS = owner-only.

## 5. Dashboard "Snipe" page (admin-only for now)

- **Extension status banner**: detected / not installed.
- **Download extension** button + **How to install** button → modal with
  step-by-step (Chrome: enable Developer mode → Load unpacked / install the
  packaged build; later: Chrome Web Store link).
- **Flow builder**: pick site (Krit), payment method (ramburs/card), shipping,
  address.
- **Task builder**: Mode A (URL) or Mode B (keywords), quantity, respect-limit.
- **Play / Stop** per task → hands the active task to the extension via
  `window.postMessage` (extension content script on the dashboard origin relays
  to its background worker). Live status updates back to the page.

## 6. The Krit checkout flow (needs discovery — Phase 0)

The scraper already knows Krit's **listing** DOM (scraper_type `krit`:
`.product-grid-wrapper .product`, `.product-title`, `.integer-price` /
`.fractional-price`, out-of-stock via "Indisponibil" / "Stoc epuizat"). The
**checkout** path is not yet mapped and must be discovered while logged in:
product page add-to-cart, cart, checkout steps, shipping-method + address
selection, payment-method selection (ramburs vs card), and the final
place-order button. Deliverable: a documented Krit flow spec with selectors.

## 7. Phased breakdown

- **Phase 0 — Discovery:** map Krit's logged-in checkout flow end-to-end; write
  the selector/step spec. (No code shipped; unblocks everything.)
- **Phase 1 — Extension skeleton:** manifest (host permissions limited to
  krit.ro + dashboard origin), background service worker, krit.ro content
  script, dashboard-origin messaging content script. Prove: dashboard sends a
  task → extension receives it → extension reads a Krit product page's stock and
  can add-to-cart on command (single item, manual trigger).
- **Phase 2 — Mode A (watch link) + checkout:** poll the URL (~10s + jitter);
  on in-stock → add to cart (qty capped by limit) → checkout → shipping/address
  → payment: **card = pause + notify**, **ramburs = auto place**. One account.
- **Phase 3 — Mode B (keyword search):** search Krit, match all keywords, then
  reuse the Phase 2 buy pipeline.
- **Phase 4 — Dashboard Snipe page:** flow + task builders, Play/Stop, status,
  Supabase persistence (tables + RLS).
- **Phase 5 — Distribution:** package the extension, Download button, install
  tutorial modal.
- **Phase 6 — Polish:** multi-profile guidance, notifications (desktop +/or
  email), audit log, error handling.
- **Final:** Code Reviewer pass.

## 8. Open questions for the Brainstormer to confirm with the user

1. Notification channel for "awaiting payment / grabbed / failed": browser
   desktop notification, the existing Gmail alert, or both?
2. Browser support: Chrome only first, or also Edge/Firefox?
3. Distribution: unpacked (developer mode) to start, or invest in Chrome Web
   Store review up front?
4. Does Krit enforce/display the per-person limit at cart or checkout (affects
   how we detect and cap quantity)?

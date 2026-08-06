# Snipe — Auto-Purchase Bot (Plan / Draft Epic)

> Status: **Validated by SubBSM, ready for the Coder.** Prepared for the
> Brainstormer (architect) → Coder (implementation) → Code Reviewer (final
> review) pipeline.
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
purchase limit**. The limit is read **best-effort from the product page**
(when Krit displays it there) and used as `min(desiredQty, detectedLimit)`;
when it isn't shown, or the page value doesn't match reality, the checkout
flow's cart/checkout-step error detection acts as a **safety net** — see
§3 guardrail 3 and §6.

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
   per-customer max on a single account. Read the limit from the product page
   when shown (best-effort); when Krit isn't showing it, or rejects the
   quantity at cart/checkout, detect that error, **cap to the accepted
   quantity instead of hard-failing**, and report the capped amount to the
   user — never retry to push past a rejection.
4. **No anti-bot / CAPTCHA evasion.** If a CAPTCHA or OTP appears, hand control
   back to the user. We do not attempt to defeat protections.
5. **ToS awareness.** Automating checkout — and especially using multiple
   accounts to exceed per-person limits — may violate krit.ro's terms and risk
   account/order cancellation. This is the user's decision; documented in the UI.
6. **Trigger command integrity.** The dashboard→extension trigger
   (`window.postMessage`, §5) can arm a real purchase with real money/cards.
   The content script relaying dashboard messages to the background worker
   MUST validate `event.origin` (and `event.source === window`) against the
   known dashboard origin before forwarding — otherwise a compromised/XSS'd
   dashboard page, or any other tab, could message the extension.

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
- **Download extension** button + **How to install** button → modal documenting
  Chrome developer-mode steps for v1: enable Developer mode → **Load unpacked**.
  Chrome Web Store packaging/review is a later, optional phase (see §7 Phase 5).
- **Flow builder**: pick site (Krit), payment method (ramburs/card), shipping,
  address.
- **Task builder**: Mode A (URL) or Mode B (keywords), quantity, respect-limit.
- **Play / Stop** per task → hands the active task to the extension via
  `window.postMessage` (extension content script on the dashboard origin relays
  to its background worker). Live status updates back to the page, mirroring
  the desktop notifications described in §7 Phase 6 (v1 targets Chrome only,
  Manifest V3 — no Edge/Firefox).

## 6. The Krit checkout flow (needs discovery — Phase 0)

The scraper already knows Krit's **listing** DOM (scraper_type `krit`:
`.product-grid-wrapper .product`, `.product-title`, `.integer-price` /
`.fractional-price`, out-of-stock via "Indisponibil" / "Stoc epuizat"). The
**checkout** path is not yet mapped and must be discovered while logged in:
product page add-to-cart, cart, checkout steps, shipping-method + address
selection, payment-method selection (ramburs vs card), and the final
place-order button. Also map: where/whether the product page displays a
per-person purchase limit (best-effort read), what a quantity-rejected error
looks like at cart/checkout (the safety-net path when the limit isn't shown
or is exceeded), and how to detect **login state** on krit.ro (so the
extension can confirm the user is authenticated before attempting add-to-cart
or checkout). Deliverable: a documented Krit flow spec with selectors.

## 7. Phased breakdown

- **Phase 0 — Discovery:** map Krit's logged-in checkout flow end-to-end; write
  the selector/step spec. (No code shipped; unblocks everything.)
- **Phase 1 — Extension skeleton:** manifest (host permissions limited to
  krit.ro + dashboard origin), background service worker, krit.ro content
  script, dashboard-origin messaging content script (with origin validation
  per guardrail 6). Prove: dashboard sends a task → extension receives it →
  extension reads a Krit product page's stock and can add-to-cart on command
  (single item, manual trigger). Since the real dashboard Play/Stop UI and
  Supabase task storage don't exist until Phase 4, Phases 1-3 drive tasks via
  a manual/dev-stub trigger (hardcoded task or an extension popup form); this
  stub is replaced by the real `postMessage` + Supabase wiring in Phase 4.
- **Phase 2 — Mode A (watch link) + checkout:** poll the URL (~10s + jitter);
  on in-stock → read per-person limit from product page (best-effort) → add to
  cart with `min(desiredQty, detectedLimit)` → if cart/checkout rejects the
  quantity, detect the error and retry with the accepted amount instead of
  failing → checkout → shipping/address → payment: **card = pause + notify**,
  **ramburs = auto place**. One account. On repeated poll errors or a Krit
  block/error page, back off exponentially and surface a **failed** status
  rather than retrying at the fixed interval (ties to guardrail 5, ToS
  awareness).
- **Phase 3 — Mode B (keyword search):** search Krit, match all keywords, then
  reuse the Phase 2 buy pipeline.
- **Phase 4 — Dashboard Snipe page:** flow + task builders, Play/Stop, live
  status, Supabase persistence (tables + RLS).
- **Phase 5 — Distribution:** package the extension for **unpacked / developer
  mode** ("Load unpacked") — v1 only, Chrome (Manifest V3). Download button +
  install tutorial modal documenting the developer-mode steps. Chrome Web
  Store packaging/review is a later, optional phase — not in v1 scope.
- **Phase 6 — Polish:** multi-profile guidance, `chrome.notifications` desktop
  alerts for **grabbed / awaiting-your-payment** and **failed** (user is
  expected to be present while the bot runs, so no email channel for v1 — email
  stays reserved for the scraper's stock alerts), audit log, error handling.
- **Final:** Code Reviewer pass.

## 8. Resolved decisions (confirmed with the user)

1. **Notifications:** `chrome.notifications` desktop alerts for
   grabbed/awaiting-payment and failed, plus live status on the Snipe page.
   No email for v1 (email stays reserved for the scraper's stock alerts) —
   the user is expected to be present while the bot runs.
2. **Browser support:** Chrome only for v1 (Manifest V3). No Edge/Firefox.
3. **Distribution:** unpacked / developer mode ("Load unpacked") for v1; the
   install modal documents the Chrome developer-mode steps. Chrome Web Store
   is a later, optional phase.
4. **Per-person limit:** best-effort read from the product page; when absent
   or wrong, the checkout flow detects a quantity-rejected error at
   cart/checkout, caps to the accepted amount instead of hard-failing, and
   reports the capped amount to the user.

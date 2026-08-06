# Krit.ro Checkout Flow Spec (Snipe Phase 0 deliverable)

> Discovered via a logged-in manual walkthrough (Playwright persistent profile,
> captured DOM at each step). This is the selector/step reference that unblocks
> Snipe Phases 1–6. Product used: *Pokemon TCG Mega Evolution: Chaos Rising —
> Sleeved Booster Pack* (in stock, `/produs/pokemon-tcg-mega-evolution-chaos-rising-sleeved-booster-pack`).

## 0. Platform & selector-stability warning (READ FIRST)

Krit is a **Next.js / React app using styled-jsx**. Every class like
`jsx-2274618699` is a **build-hash** that **changes on each Krit deploy** — do
**NOT** select on `jsx-*` classes. Use stable anchors instead:

- **Semantic classes**: `.add-to-cart`, `.product-stock`, `.product-element`,
  `.payment-methods`, `.cart-summary`, `.cart-wrapper`.
- **`name` attributes**: `billingName`, `billingPhoneNumber`, `billingAddress`,
  `agreement`, `isCompany`.
- **`data-*` attributes**: `data-tier-cap`, `data-in-cart`, `data-is-special`.
- **Visible text**: `TRIMITE COMANDA`, `ADAUGA IN COS`, `In stoc`, payment labels.
- **Embedded JSON**: the Next.js page data (inline `<script>` / `__NEXT_DATA__`)
  carries `availability`, `pricelistMaxQuantity`, price, slug — a more robust
  source for stock/limit than scraping the DOM.

## 1. Login & login-state detection

- Login page: `https://krit.ro/cont/login`.
- **Logged-in signals**: the `/comanda` page pre-fills `billingName` /
  `billingPhoneNumber` / `billingAddress` from the saved account; the header
  shows the account area. **Logged-out** → protected steps redirect to
  `/cont/login`.
- Recommended detection: check for the account indicator in the header (pin the
  exact stable selector during Phase 1) **and/or** treat a redirect to
  `/cont/login` as "not authenticated → abort with a clear status."

## 2. Product page — `/produs/<slug>`

- **Stock (in stock):** embedded JSON `"availability":"available"` (also
  schema.org `"availability":"https://schema.org/InStock"`); DOM: `.add-to-cart`
  contains text `In stoc`. **Preorder:** text `Precomanda`. **Out of stock:** the
  product/card element carries `.out-of-stock` (e.g. listing `.product-element.out-of-stock`).
- **Add to cart:** the `.add-to-cart` element (a div wrapping the button).
  Clicking it adds the item (AJAX; `data-in-cart` increments).
- **Per-person limit (best-effort read):** `data-tier-cap` on `.add-to-cart`
  (`"null"` = no limit) and/or `pricelistMaxQuantity` in the page JSON (`null` =
  no limit). When a number is present, cap desired qty to it.
- **Quantity mechanism — TO CONFIRM (Phase 2):** add-to-cart adds 1 and shows
  `data-in-cart`. Whether qty >1 is reached by repeated add-to-cart clicks or a
  +/- stepper (on product or in cart) was not fully captured — confirm when
  building Phase 2. The **safety net** (per guardrail 3) is required regardless:
  attempt the target qty, detect a quantity-rejected error, cap to accepted.

## 3. Checkout — `/comanda` (single-page: cart + shipping + payment + submit)

Krit goes product → `/comanda`; there is no separate `/cos` page in the flow.

- **Cart summary:** `.cart-summary` (e.g. "2 produse / Total 43.99 Lei"),
  `.cart-delivery-date` ("Livrare intre 6 - 7 Iulie").
- **Billing / address:** inputs `name="billingName"`, `name="billingPhoneNumber"`,
  `name="billingAddress"` (pre-filled from saved account). `name="isCompany"`
  checkbox toggles company billing.
  - **Saved-address picker is a react-select combobox** (NOT a native `<select>`) —
    **live-confirmed 2026-07**. Emotion classes (`css-<hash>-control/-menu/-singleValue/-container`)
    rotate per build; anchor instead on react-select's stable **id patterns**:
    the listbox `[id$="-listbox"]`, options `[id*="-option-"]`. Option `…-option-0`
    is always **"Adresă nouă"** (create-new — skip it); real saved addresses are
    option 1+ (e.g. `…-option-1` = "Alex vlase - Sectorul 1, BUCURESTI, Pajura").
    To drive it: **mousedown** the control (react-select opens on mousedown, not
    click) → poll for the listbox → mousedown the first non-"Adresă nouă" option
    (or the one matching a requested address string).
- **Delivery method** ("Livrare"): two options —
  - **Livrare prin Curier** (home delivery 24–48h)
  - **Livrare la Easybox Sameday** (pickup). Selected point shown on a button
    with **"Schimba"** (change) — e.g. "Sectorul 1, Bucuresti - easybox Penny…".
  - (Delivery-option DOM not yet live-confirmed; matched best-effort by text.)
- **Payment method** — **live-confirmed 2026-07**. Container is `.payment-methods`
  (repeated **plural**, once per option), each option is `.method`, and the
  matchable label is `.method-text .title` (with a `.subtitle` below). Match on
  the **title** by trimmed exact text (so "Card" ≠ "Card la Easybox"):
  - **Card** — title `Card`, subtitle "Plata online cu cardul bancar" (plain
    online card → the **pause** path).
  - **Transfer Bancar** — title `Transfer Bancar` (not a supported task method yet).
  - **Card la Easybox** — title `Card la Easybox`, subtitle "Plata cu cardul
    direct la Easybox" (pay by card **in person** at pickup — no online card entry).
  - ✅ **There is no plain "ramburs" option.** The functional pay-in-person
    equivalent is **"Card la Easybox"**; per user decision the `ramburs` task
    enum maps to it as the **auto-place** path (guardrail 2's concern — the bot
    submitting an unsupervised online card charge — doesn't apply, since no card
    details are ever entered on the site). The DB/task enum value stays `ramburs`;
    only the DOM target changed. **(Resolves backlog `22822043`.)**
- **Terms:** `name="agreement"` checkbox — must be checked before submit.
- **Place order (final submit):** `<button type="submit">` with text
  **`TRIMITE COMANDA`** (stable-text anchor; ignore its `jsx-… orange` class).
- **Cookie consent** (first visit): `#rcc-confirm-button` ("ACCEPTA") — dismiss
  before interacting.

## 4. End-to-end step sequence (for the extension)

1. Detect login (§1); abort with status if not authenticated.
2. Product page (§2): confirm in stock → read limit (`data-tier-cap` /
   `pricelistMaxQuantity`) → add to cart, reaching `min(desiredQty, limit)`
   (with the reject-and-cap safety net).
3. Go to `/comanda`.
4. Verify/select address (pre-filled), select delivery method, select payment
   method per the flow's config.
5. Check `agreement`.
6. **Payment branch:** `card` (title **"Card"**) → **pause + notify user** (they
   complete card/3-DS and click TRIMITE COMANDA); `ramburs` (title **"Card la
   Easybox"**, pay-by-card at pickup) → auto-click TRIMITE COMANDA. Select the
   address (react-select) **before** payment and let the payment section settle.

## 5. Gaps to confirm (small, don't block Phase 1)

1. ~~**Ramburs / cash-on-delivery:**~~ ✅ **Resolved (2026-07):** no plain ramburs
   option exists; the `ramburs` task enum maps to **"Card la Easybox"** (pay by
   card at pickup, auto-place). See §3. Backlog `22822043` closed by this finding.
2. **Quantity >1 mechanism** on the product page (repeat-click vs stepper).
3. **Exact stable header selector** for logged-in detection (pin in Phase 1).
4. **`/comanda` cart line-price selector** for the ramburs pre-place price
   re-check (backlog `514ef758`) — same page as the now-confirmed payment/address
   DOM; still needs the exact per-line price element captured.

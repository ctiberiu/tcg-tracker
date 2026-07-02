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
  `name="billingAddress"` (pre-filled from saved account). A saved-address picker
  is a react-select ("Selectează o adresă de mai jos, sau adaugă…"). `name="isCompany"`
  checkbox toggles company billing.
- **Delivery method** ("Livrare"): two options —
  - **Livrare prin Curier** (home delivery 24–48h)
  - **Livrare la Easybox Sameday** (pickup). Selected point shown on a button
    with **"Schimba"** (change) — e.g. "Sectorul 1, Bucuresti - easybox Penny…".
- **Payment method** ("Alege modalitatea de plata:"): options captured were —
  - **Card** — "Plata online cu cardul bancar" (online card payment)
  - **Transfer Bancar** — "Integral prin transfer bancar"
  - ⚠️ **Ramburs (cash on delivery) was NOT present** in this checkout (used
    Easybox delivery). See §5 — needs confirmation.
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
6. **Payment branch:** `card` → **pause + notify user** (they complete
   card/3-DS and click TRIMITE COMANDA); `ramburs`/COD-style → auto-click
   TRIMITE COMANDA (only if such an option exists — see §5).

## 5. Gaps to confirm (small, don't block Phase 1)

1. **Ramburs / cash-on-delivery:** not shown with Easybox delivery — only Card +
   Transfer Bancar appeared. Confirm whether Krit offers ramburs at all, and if
   so whether it's **Courier-delivery-only**. (Affects the "auto-place" branch.)
2. **Quantity >1 mechanism** on the product page (repeat-click vs stepper).
3. **Exact stable header selector** for logged-in detection (pin in Phase 1).

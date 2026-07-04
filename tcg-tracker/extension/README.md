# Snipe Extension

Manifest V3 Chrome extension for the Snipe auto-purchase bot: Mode A watch loop,
Mode B keyword search, the cart/checkout/payment pipeline, and the real
dashboard Play/Stop trigger with live status. See `docs/snipe-bot-plan.md` and
the Phase 0 selector spec `docs/krit-flow-spec.md`. The Phase 1 dev-stub popup
has been removed now that the dashboard drives tasks.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest; host permissions limited to krit.ro + the dashboard origin. |
| `background.js` | Service worker — hub; watch loop + buy-pipeline orchestration on the active krit tab. |
| `krit-dom.js` | Pure krit.ro product-page DOM helpers (stock read, add-to-cart). No chrome APIs. |
| `krit-checkout.js` | Pure `/comanda` checkout DOM helpers (limit, payment, terms, place-order). No chrome APIs. |
| `watch-loop.js` | Pure Mode A watch loop (poll + jitter + exponential backoff). |
| `buy-pipeline.js` | Pure buy orchestrator (limit cap → add → checkout → **card=pause / ramburs=auto**). |
| `keyword-match.js` | Pure Mode B matcher — search `/cautare/<q>`, resolve the single all-keywords match. |
| `content-krit.js` | Injected on krit.ro; runs single stock/cart/checkout actions on command. |
| `config.js` | Shared constants for the dashboard bridge (trusted origins). |
| `content-dashboard.js` | Injected on the dashboard origin; **guardrail-6 trust boundary** + status-push port. |

## Trust boundary (guardrail 6)

`content-dashboard.js` accepts a `window.postMessage` from the dashboard page
**only** when ALL hold:

1. `event.source === window` — the page posted to itself (rejects other
   frames/tabs/windows);
2. `event.origin` ∈ `SNIPE_CONFIG.DASHBOARD_ORIGINS` (rejects every other site);
3. `event.data.source === "snipe-dashboard"` — our namespace discriminator.

Only then does it forward the message to the background worker over
`chrome.runtime`. Anything failing a check is silently dropped.

## Configuring the dashboard origin

The trusted production origin is the confirmed deployed dashboard,
`https://tcg-tracker-kappa.vercel.app`. `http://localhost:5173` (Vite dev server)
is also trusted for local development. These live in **two** places that must
stay in sync:

- `manifest.json` → `host_permissions` **and** the dashboard `content_scripts.matches`
- `config.js` → `DASHBOARD_ORIGINS`

If the dashboard is ever redeployed to a different URL, update both.

## Load it (Chrome developer mode)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. It should load with no errors and show the service worker as active.

## Mode B — keyword search (Phase 3)

Instead of a direct URL, a Mode B task gives a keyword list. The extension
searches Krit at `https://krit.ro/cautare/<query>`, reads the result cards, and
resolves to the **single** product whose title contains **all** keywords
(case-insensitive substring). It **never guesses**:

- exactly one match → hands the URL to the **unchanged** Phase 2 watch+buy pipeline;
- zero matches → status `no_match`;
- more than one → status `ambiguous` (returns the candidates to refine).

## Buy pipeline & safety (Phase 2)

On restock the watch loop hands off to `buy-pipeline.js`:

1. Read per-person limit (best-effort) → add to cart `min(desiredQty, limit)`.
2. If cart/checkout rejects the quantity, **cap to the accepted amount** and
   notify — never hard-fail, never retry past the rejection (guardrail 3).
3. Select shipping/address → payment.
4. **Payment branch (guardrail 2):**
   - **card** → fills up to the payment step, then **pauses** (`awaiting_payment`)
     and notifies. It **never** auto-submits a card order.
   - **ramburs** → auto-clicks **TRIMITE COMANDA** (`ordered`). If ramburs isn't
     offered for the order, it pauses instead of guessing.

**Security (guardrail 1):** the pipeline reads and stores **no** credentials and
**no** card data anywhere; it never touches password/card fields. A task with
`paymentMethod: "card"` always pauses at payment — it never auto-places an order.

## Play/Stop trigger + live status (Phase 4)

The dashboard Snipe page drives tasks (replacing the old dev-stub):

- **Play** → the page `window.postMessage`s `START_TASK` with the task payload
  (`taskId`, mode, url/keywords, qty, respect-limit, payment/shipping/address).
  `content-dashboard.js` validates the boundary (guardrail 6) and forwards it to
  the worker, which starts the Mode A watch or Mode B search+watch.
- **Stop** → `STOP_TASK { taskId }` → the worker stops the watch and closes its tab.
- **Live status** → the worker pushes status changes
  (`running → grabbed → awaiting_payment | ordered | failed`, `idle` on stop)
  over a long-lived `chrome.runtime` port to `content-dashboard.js`, which
  relays them to the page; the page persists them to `snipe_tasks.status`.

Only **one** task runs at a time (single account); a second Play returns
`{ ok: false, reason: "a watch is already running" }`.

## Manual smoke test

With the extension loaded, open the dashboard origin (e.g. the Vite dev server)
and run in its DevTools console:

```js
window.addEventListener("message", (e) => {
  if (e.data?.source === "snipe-extension") console.log("from extension:", e.data);
});
// PING → expect a PONG (this is what the dashboard's "extension detected" banner uses)
window.postMessage({ source: "snipe-dashboard", type: "PING", requestId: "t1" }, window.origin);
```

Expected: a `PONG` message logged back. Posting the same message from a page on
any other origin must produce **no** reply (boundary rejects it). Prefer driving
Play/Stop from the dashboard Snipe page rather than by hand.

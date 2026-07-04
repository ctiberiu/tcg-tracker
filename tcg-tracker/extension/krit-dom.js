/**
 * Pure krit.ro product-page DOM helpers (no chrome APIs, no side effects beyond
 * the one explicit add-to-cart click). Injected via the manifest immediately
 * BEFORE content-krit.js in the same content-script entry, so they share the
 * isolated world; exposed on `globalThis.SnipeKritDom`.
 *
 * Selectors are grounded in a live read-only probe of a real krit.ro product
 * page (see docs/krit-flow-spec.md, Phase 0). Key lesson from that probe: the
 * page carries related-product markup whose `.out-of-stock` classes and JSON
 * `availability` fields DO NOT describe the main product — so every signal here
 * is scoped to the MAIN product container `.product-data`, never page-wide.
 */
"use strict";

(() => {
  /** Main product region on a /produs/<slug> page (chain: .add-to-cart → .product-cart-line → .product-price-and-cart → .product-peek → .product-data). */
  const MAIN_SELECTOR = ".product-data";
  const LISTING_ANCESTORS = "a.product-element, .product-grid-wrapper";

  const getMain = (root) => root.querySelector(MAIN_SELECTOR) ?? root.body ?? root;

  /**
   * The MAIN product's add-to-cart widget (a `<div class="add-to-cart">` wrapping
   * a `<button>`), excluding any add-to-cart that belongs to a related-product
   * listing card. Returns null if none.
   */
  const findAddToCart = (root = document) => {
    const main = getMain(root);
    const scoped = main.querySelector?.(".add-to-cart");
    if (scoped && !scoped.closest(LISTING_ANCESTORS)) return scoped;
    return [...root.querySelectorAll(".add-to-cart")].find((el) => !el.closest(LISTING_ANCESTORS)) ?? null;
  };

  /**
   * Read the main product's stock state.
   * @returns {{state: "in_stock"|"preorder"|"out_of_stock"|"unknown", inStock: boolean, limit: number|null, inCart: number, hasAddToCart: boolean}}
   */
  const readStock = (root = document) => {
    const atc = findAddToCart(root);
    const main = getMain(root);
    const mainText = main.textContent ?? "";
    const lower = mainText.toLowerCase();
    const oos = /indisponibil|stoc epuizat/i.test(mainText) || Boolean(main.querySelector?.(".out-of-stock"));

    let state = "unknown";
    if (lower.includes("precomanda")) state = "preorder";
    else if (atc && lower.includes("in stoc") && !oos) state = "in_stock";
    else if (oos || atc === null) state = "out_of_stock";

    // Best-effort per-person cap: data-tier-cap on the widget ("null" = no cap).
    const tierCapRaw = atc?.getAttribute("data-tier-cap");
    const limit = tierCapRaw != null && tierCapRaw !== "null" ? Number.parseInt(tierCapRaw, 10) : null;

    return {
      state,
      inStock: state === "in_stock",
      limit: Number.isNaN(limit) ? null : limit,
      inCart: Number.parseInt(atc?.getAttribute("data-in-cart") ?? "0", 10) || 0,
      hasAddToCart: atc !== null,
      // True only on a real product page. A Krit block/challenge/error page has
      // no `.product-data`, so the watch loop treats isProductPage=false as an
      // error (→ backoff) rather than a false "out of stock".
      isProductPage: (root.querySelector?.(MAIN_SELECTOR) ?? null) !== null,
    };
  };

  /**
   * Click the main add-to-cart once (single item). Krit adds via AJAX and
   * increments the widget's `data-in-cart`. Returns immediately after the click;
   * callers poll `data-in-cart` to confirm. Does NOT loop or reach a quantity.
   */
  const addToCart = (root = document) => {
    const atc = findAddToCart(root);
    if (atc === null) return { ok: false, reason: "main add-to-cart element not found" };
    const inCartBefore = Number.parseInt(atc.getAttribute("data-in-cart") ?? "0", 10) || 0;
    const clickable = atc.querySelector("button") ?? atc;
    clickable.click();
    return { ok: true, clicked: true, inCartBefore };
  };

  /** Current data-in-cart on the main widget (for confirming an add completed). */
  const readInCart = (root = document) => {
    const atc = findAddToCart(root);
    return atc === null ? null : Number.parseInt(atc.getAttribute("data-in-cart") ?? "0", 10) || 0;
  };

  /**
   * Parse a price string to a number (RON). Handles Krit's dot-decimal ("28.99")
   * and Romanian formatting ("1.299,00 lei" → 1299.00): when both separators are
   * present the LAST one is the decimal; multiple dots alone are thousands.
   * @returns {number|null}
   */
  const parsePriceText = (text) => {
    if (text == null) return null;
    const m = String(text).match(/\d[\d.,]*/);
    if (!m) return null;
    let s = m[0];
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot !== -1 && lastComma !== -1) {
      const dec = lastDot > lastComma ? "." : ",";
      const thou = dec === "." ? "," : ".";
      s = s.split(thou).join("").replace(dec, ".");
    } else if (lastComma !== -1) {
      s = s.replace(/,/g, "."); // RO decimal comma
    } else if ((s.match(/\./g) ?? []).length > 1) {
      s = s.replace(/\./g, ""); // multiple dots → thousands separators
    }
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  /** Read a price from Krit's split `.integer-price` + `.fractional-price` within a scope (unambiguous). */
  const readSplitPrice = (scope) => {
    const intEl = scope.querySelector?.(".integer-price");
    if (!intEl || intEl.closest(LISTING_ANCESTORS)) return null;
    const intDigits = (intEl.textContent ?? "").replace(/\D/g, ""); // strips thousands dots
    if (!intDigits) return null;
    const fracEl = scope.querySelector?.(".fractional-price");
    const fracDigits = fracEl && !fracEl.closest(LISTING_ANCESTORS) ? (fracEl.textContent ?? "").replace(/\D/g, "") : "";
    const n = Number(`${intDigits}.${fracDigits || "0"}`);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  /**
   * Read the MAIN product's unit price (RON), scoped like readStock — NEVER
   * page-wide (related-product cards carry other prices). Returns null when not
   * confidently found. Page-aware so the pipeline's pre-place re-check works:
   *  - product page: `.product-data` → split price (fallback `.product-price`);
   *  - checkout (/comanda, no `.product-data`): the cart line's unit price via
   *    the same reused price component (best-effort; confirm the live `/comanda`
   *    selector with a logged-in session — Phase 0 didn't capture the cart DOM).
   */
  const readPrice = (root = document) => {
    const main = root.querySelector?.(MAIN_SELECTOR);
    if (main) {
      return (
        readSplitPrice(main) ??
        parsePriceText(main.querySelector?.(".product-price .price-content, .product-price .price, .product-price")?.textContent ?? null)
      );
    }
    const cart = root.querySelector?.(".cart-summary, .cart-wrapper");
    if (cart) {
      return readSplitPrice(cart) ?? parsePriceText(cart.querySelector?.(".price-content, .price")?.textContent ?? null);
    }
    return null;
  };

  /**
   * Read product cards from a krit.ro listing/search page (`/cautare/<q>`).
   * Same listing selectors the scraper uses for `scraper_type krit`.
   * @returns {Array<{title: string, url: string}>}
   */
  const readSearchResults = (root = document) => {
    const base = root.location?.origin ?? window.location.origin;
    const out = [];
    const seen = new Set();
    for (const card of root.querySelectorAll(".product-grid-wrapper .product")) {
      const link = card.querySelector("a.product-element");
      const title = card.querySelector(".product-title")?.textContent?.trim();
      const href = link?.getAttribute("href");
      if (!title || !href) continue;
      const url = href.startsWith("http") ? href : base + href;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ title, url });
    }
    return out;
  };

  globalThis.SnipeKritDom = Object.freeze({ MAIN_SELECTOR, findAddToCart, readStock, addToCart, readInCart, readPrice, readSearchResults });
})();

/**
 * krit.ro checkout DOM helpers (pure; no chrome APIs). Injected before
 * content-krit.js (same isolated world → globalThis.SnipeKritCheckout).
 *
 * Selectors come from the Phase 0 discovery spec (docs/krit-flow-spec.md §2–§4):
 * checkout is the single `/comanda` page (cart + billing + delivery + payment +
 * submit). Krit is a Next.js app with rotating `jsx-*` build hashes, so these
 * anchor on stable text / name / semantic classes, never `jsx-*`.
 *
 * The **address picker** (react-select combobox) and **payment methods**
 * (`.payment-methods .method` / `.method-text .title`) were confirmed against a
 * real logged-in `/comanda` (2026-07). The quantity-rejection signature, the
 * delivery-option DOM, and the `/comanda` cart-price selector remain best-effort
 * (unconfirmed) and are matched defensively.
 */
"use strict";

(() => {
  const textOf = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

  // Payment method → the exact `.method-text .title` to match on the live DOM
  // (confirmed against a real logged-in /comanda, 2026-07). Krit has no plain
  // "ramburs" text; the pay-in-person equivalent is "Card la Easybox" (pay by
  // card at the pickup point — no online card entry), which the user confirmed
  // should be the auto-place path mapped from the `ramburs` task enum.
  const PAYMENT_TITLES = {
    card: "card", // plain online card — the pause path (unchanged)
    ramburs: "card la easybox", // pay-by-card at Easybox → auto-place (guardrail-2's online-charge concern doesn't apply)
    transfer: "transfer bancar", // present but not a supported task method for now
  };
  const DELIVERY_PATTERNS = {
    curier: /curier/i,
    easybox: /easybox|sameday/i,
  };

  /** The `.method-text .title` text of a payment `.method` row. */
  const titleOf = (methodEl) => textOf(methodEl?.querySelector(".method-text .title"));

  /**
   * Find the payment `.method` whose title matches `method` — scoped to
   * `.payment-methods .method`, matched by trimmed EXACT title (case-insensitive)
   * so "Card" never collides with "Card la Easybox".
   */
  const findPaymentMethod = (root, method) => {
    const target = PAYMENT_TITLES[method];
    if (!target) return null;
    return [...root.querySelectorAll(".payment-methods .method")].find((el) => titleOf(el).toLowerCase() === target) ?? null;
  };

  /** Delivery matching (live DOM not yet confirmed — best-effort, whole-form scope). */
  const findOption = (root, pattern) => {
    const scope = root.querySelector("form") ?? root;
    return [...scope.querySelectorAll('label, button, [role="radio"], .delivery-method, li')].find((el) => pattern.test(textOf(el))) ?? null;
  };

  const clickOption = (el) => {
    if (el == null) return false;
    const input = el.querySelector?.('input[type="radio"], input[type="checkbox"]');
    (input ?? el).click();
    return true;
  };

  /** Dispatch a real mousedown (react-select opens/selects on mousedown, not click). */
  const dispatchMouseDown = (el, root) => {
    const view = root.defaultView ?? (typeof window !== "undefined" ? window : undefined);
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view }));
  };

  /** Per-person limit (best-effort) — reuse the main product widget's data-tier-cap. */
  const readLimit = (root = document) => globalThis.SnipeKritDom?.readStock(root).limit ?? null;

  /** Dismiss the first-visit cookie banner if present (spec §3). */
  const dismissCookieConsent = (root = document) => {
    const btn = root.querySelector("#rcc-confirm-button");
    if (btn) btn.click();
    return { ok: btn != null };
  };

  /**
   * Heuristic quantity-rejection detector (Phase 0 gap: exact signature not
   * captured live). Looks for an alert/error region mentioning a quantity/stock
   * limit and tries to parse the accepted maximum.
   */
  const detectQuantityRejection = (root = document) => {
    const regions = [
      ...root.querySelectorAll('[role="alert"], .error, .alert, .invalid-feedback, .cart-error, .field-error'),
    ];
    const kw = /cantitate|stoc (insuficient|disponibil|epuizat)|maxim|limit[aă]|nu mai (sunt|este)|doar \d+/i;
    const hit = regions.find((el) => kw.test(textOf(el)));
    if (!hit) return { rejected: false, acceptedQty: null, text: null };
    const text = textOf(hit);
    const m = text.match(/(?:maxim(?:um)?|doar|disponibil[eă]?)\D{0,12}(\d+)/i);
    const acceptedQty = m ? Number.parseInt(m[1], 10) : null;
    return { rejected: true, acceptedQty: Number.isNaN(acceptedQty) ? null : acceptedQty, text };
  };

  /**
   * Detect a blocking condition that the bot must NOT try to bypass (guardrail 4):
   * a CAPTCHA/verification challenge, or a lost session (redirected to login).
   * @returns {"captcha"|"login_lost"|null}
   */
  const detectBlocking = (root = document) => {
    const path = root.location?.pathname ?? window.location.pathname;
    // Session lost → Krit sends protected steps to /cont/login (spec §1).
    if (/\/cont\/login/.test(path)) return "login_lost";
    if (root.querySelector('input[type="password"]') && !/\/comanda/.test(path)) return "login_lost";
    // CAPTCHA / anti-bot challenges (Cloudflare Turnstile, reCAPTCHA, hCaptcha).
    if (
      root.querySelector(
        'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"], .g-recaptcha, .h-captcha, .cf-turnstile, #challenge-form',
      )
    ) {
      return "captcha";
    }
    if (/nu sunt robot|verificare de securitate|verifică că ești om|cloudflare/i.test(root.body?.textContent ?? "")) {
      return "captcha";
    }
    return null;
  };

  /** Snapshot of the /comanda page relevant to the pipeline. */
  const readCheckoutState = (root = document) => {
    const summary = textOf(root.querySelector(".cart-summary"));
    const qtyMatch = summary.match(/(\d+)\s*produse?/i);
    const cartQty = qtyMatch ? Number.parseInt(qtyMatch[1], 10) : null;
    const paymentOptions = ["card", "ramburs", "transfer"].filter((m) => findPaymentMethod(root, m) !== null);
    return {
      cartQty: Number.isNaN(cartQty) ? null : cartQty,
      paymentOptions,
      rejection: detectQuantityRejection(root),
      blockedReason: detectBlocking(root),
      isCheckoutPage: /\/comanda/.test(root.location?.pathname ?? window.location.pathname),
    };
  };

  const selectShipping = (root, method) => {
    const pattern = DELIVERY_PATTERNS[method] ?? new RegExp(String(method ?? ""), "i");
    return { ok: clickOption(findOption(root, pattern)) };
  };

  // ── Address react-select combobox (live-confirmed) ──
  // The address widget is a react-select, NOT a native <select>. Emotion classes
  // (css-<hash>-control/menu/singleValue) rotate, so we anchor on the stable
  // react-select id patterns (…-listbox, …-option-N). Option 0 is always
  // "Adresă nouă" (create new); real saved addresses are option 1+.
  const ADDR_NEW = /adres[ăa]\s+nou[ăa]/i;

  /** Find the address react-select control (its value/options mention an address). */
  const findAddressControl = (root) => {
    const controls = [...root.querySelectorAll('[class*="-control"]')];
    return controls.find((el) => /adres/i.test(textOf(el))) ?? controls[0] ?? null;
  };

  /** Open the address react-select menu. Returns {ok}. */
  const openAddressPicker = (root = document) => {
    const control = findAddressControl(root);
    if (control == null) return { ok: false, reason: "address picker (react-select) not found" };
    dispatchMouseDown(control, root);
    return { ok: true };
  };

  /** True once the react-select listbox / options have rendered (poll target). */
  const isAddressMenuReady = (root = document) => root.querySelector('[id$="-listbox"], [id*="-option-"]') != null;

  /**
   * Click a REAL saved address option — never "Adresă nouă". If `address` is
   * given, match it by text; otherwise default to the first non-"Adresă nouă"
   * option (index ≥ 1). Assumes the menu is already open (see openAddressPicker).
   */
  const pickAddress = (root = document, address) => {
    const options = [...root.querySelectorAll('[id*="-option-"]')];
    const real = options.filter((el) => !ADDR_NEW.test(textOf(el)));
    let chosen = address ? real.find((el) => textOf(el).toLowerCase().includes(String(address).toLowerCase())) ?? null : null;
    chosen = chosen ?? real[0] ?? null;
    if (chosen == null) return { ok: false, matched: null, reason: "no saved address option (only 'Adresă nouă')" };
    dispatchMouseDown(chosen, root);
    chosen.click?.();
    return { ok: true, matched: textOf(chosen) };
  };

  const selectPayment = (root, method) => {
    const el = findPaymentMethod(root, method);
    if (el == null) return { ok: false, available: false, matched: null };
    el.click();
    return { ok: true, available: true, matched: titleOf(el) };
  };

  const acceptTerms = (root = document) => {
    const box = root.querySelector('input[name="agreement"]');
    if (!box) return { ok: false, reason: "agreement checkbox not found" };
    if (!box.checked) box.click();
    return { ok: box.checked === true };
  };

  /** Click the final submit button — text "TRIMITE COMANDA" (ramburs auto-place only). */
  const placeOrder = (root = document) => {
    const buttons = [...root.querySelectorAll('button[type="submit"], button')];
    const btn = buttons.find((b) => /trimite comanda/i.test(textOf(b)));
    if (!btn) return { ok: false, reason: "TRIMITE COMANDA button not found" };
    btn.click();
    return { ok: true };
  };

  globalThis.SnipeKritCheckout = Object.freeze({
    readLimit,
    dismissCookieConsent,
    detectQuantityRejection,
    detectBlocking,
    readCheckoutState,
    selectShipping,
    // Address react-select (open → poll isAddressMenuReady → pick), orchestrated by content-krit.js.
    openAddressPicker,
    isAddressMenuReady,
    pickAddress,
    findPaymentMethod,
    selectPayment,
    acceptTerms,
    placeOrder,
  });
})();

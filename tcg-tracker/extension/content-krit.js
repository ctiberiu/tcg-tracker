/**
 * krit.ro content script.
 *
 * Registers with the background worker on load and executes single, on-command
 * actions against the current product page: read stock, or add-to-cart once.
 * The pure DOM logic lives in krit-dom.js (injected just before this file, same
 * isolated world → globalThis.SnipeKritDom).
 *
 * Scope: single, on-command actions — stock read, add-to-cart (single or up to a
 * target quantity), and the Phase 2 checkout steps on /comanda. NO watch loop
 * here (that's the background worker). DOM logic: krit-dom.js + krit-checkout.js.
 */
"use strict";

(() => {
  const dom = globalThis.SnipeKritDom;
  const checkout = globalThis.SnipeKritCheckout;

  // Tell the background worker we're live on this krit.ro tab.
  chrome.runtime.sendMessage({ kind: "KRIT_READY", url: window.location.href }, () => {
    if (chrome.runtime.lastError) {
      console.debug("[Snipe/krit] background not reachable yet:", chrome.runtime.lastError.message);
    }
  });

  /** Wait (poll, max ~2.5s) for data-in-cart to exceed `from`, confirming the AJAX add. */
  const waitForCartIncrement = async (from) => {
    for (let i = 0; i < 25; i++) {
      const now = dom.readInCart();
      if (now !== null && now > from) return now;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return dom.readInCart();
  };

  /** Generic poll: resolve true once `pred()` is truthy, else false after ~tries×ms. */
  const pollUntil = async (pred, tries = 25, ms = 100) => {
    for (let i = 0; i < tries; i++) {
      try { if (pred()) return true; } catch { /* keep polling */ }
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    try { return Boolean(pred()); } catch { return false; }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Receives the FULL message so it can read per-action fields (qty/method/address),
  // not just `action`. (`message` is NOT in scope from the onMessage listener below.)
  const handleAction = async (message) => {
    const { action } = message;
    if (dom == null) return { ok: false, reason: "SnipeKritDom missing (krit-dom.js failed to load)" };
    switch (action) {
      case "CHECK_STOCK":
        return { ok: true, action, stock: dom.readStock() };
      case "READ_PRICE":
        return { ok: true, action, price: dom.readPrice() };
      case "ADD_TO_CART": {
        const before = dom.readStock();
        if (!before.inStock) {
          return { ok: false, action, reason: `not in stock (state=${before.state})`, stock: before };
        }
        const clicked = dom.addToCart();
        if (!clicked.ok) return { ok: false, action, reason: clicked.reason, stock: before };
        const inCartAfter = await waitForCartIncrement(clicked.inCartBefore);
        const added = inCartAfter !== null && inCartAfter > clicked.inCartBefore;
        return { ok: added, action, inCartBefore: clicked.inCartBefore, inCartAfter, stock: dom.readStock() };
      }
      case "ADD_TO_CART_QTY": {
        // Reach `qty` by repeated add-to-cart (Phase 0 didn't confirm a stepper).
        // Stop as soon as data-in-cart no longer increases — that is the store
        // capping us; the buy pipeline caps to the accepted amount, never retries.
        const target = Math.max(1, Math.trunc(Number(message.qty) || 1));
        const first = dom.readStock();
        if (!first.inStock) return { ok: false, action, reason: `not in stock (state=${first.state})`, achievedQty: 0 };
        let current = dom.readInCart() ?? 0;
        for (let guard = 0; current < target && guard < target + 3; guard++) {
          const before = dom.readInCart() ?? 0;
          const clicked = dom.addToCart();
          if (!clicked.ok) break;
          const after = await waitForCartIncrement(before);
          if (after == null || after <= before) break; // store stopped accepting
          current = after;
        }
        return { ok: current > 0, action, achievedQty: current, target };
      }
      case "READ_SEARCH_RESULTS":
        // Mode B: read product cards from a /cautare/<q> search page.
        return { ok: true, action, results: dom.readSearchResults() };
      case "READ_CHECKOUT_STATE":
        checkout?.dismissCookieConsent();
        return { ok: true, action, state: checkout?.readCheckoutState() ?? null };
      case "SELECT_SHIPPING":
        return { ok: checkout?.selectShipping(document, message.method).ok === true, action };
      case "SELECT_ADDRESS": {
        // Address is a react-select combobox: open it, wait for the listbox to
        // render (poll — no blind sleep), then pick a real saved address.
        if (checkout == null) return { ok: false, action, reason: "SnipeKritCheckout missing" };
        const opened = checkout.openAddressPicker(document);
        if (!opened.ok) return { ok: false, action, reason: opened.reason };
        const ready = await pollUntil(() => checkout.isAddressMenuReady(document));
        if (!ready) return { ok: false, action, reason: "address listbox did not render" };
        const picked = checkout.pickAddress(document, message.address);
        return { ok: picked.ok, action, matched: picked.matched, reason: picked.reason };
      }
      case "SELECT_PAYMENT": {
        // Selecting the address can re-render the payment section — wait for the
        // payment methods to be present (poll), plus a brief settle for a late
        // re-render, before choosing. (Address selection already completed: this
        // is a separate, sequential message the pipeline sends after SELECT_ADDRESS.)
        await pollUntil(() => document.querySelector(".payment-methods .method") != null);
        await sleep(300);
        const r = checkout?.selectPayment(document, message.method) ?? { ok: false, available: false };
        return { ok: r.ok, available: r.available, matched: r.matched, action };
      }
      case "ACCEPT_TERMS":
        return { ok: checkout?.acceptTerms().ok === true, action };
      case "PLACE_ORDER":
        // Only reached for the ramburs auto-place branch. Card never calls this.
        return { ok: checkout?.placeOrder().ok === true, action };
      default:
        return { ok: false, reason: `unknown action: ${action}` };
    }
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.kind === "KRIT_PING") {
      sendResponse({ type: "KRIT_PONG", payload: { url: window.location.href, title: document.title } });
      return false;
    }
    if (message?.kind === "KRIT_ACTION") {
      // Pass the whole message so handlers can read qty/method/address; always
      // respond, even on a thrown error, so the caller never hangs.
      handleAction(message)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, action: message.action, reason: err?.message ?? String(err) }));
      return true; // async response
    }
    return false;
  });

  console.debug("[Snipe/krit] content script ready @", window.location.href);
})();

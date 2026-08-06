/**
 * Snipe buy pipeline (Phase 2, Task 2) — the money-moving core.
 *
 * Pure, dependency-injected orchestrator: read per-person limit → add-to-cart
 * min(desiredQty, limit) → detect a quantity-rejection at cart/checkout and CAP
 * to the accepted amount (never escalate/retry past it, never hard-fail) →
 * shipping/address → payment. Both methods SUBMIT the order (TRIMITE COMANDA):
 *   - card    → submit → the order redirects to the bank's card page for the user
 *               to confirm; we set awaiting_payment + hand back and STOP. The bot
 *               never reads/enters anything on that card page (guardrail 1).
 *   - ramburs → submit → order placed (no card step); status ordered.
 *
 * Security (guardrail 1 / AC5): this module reads and stores NO credentials and
 * NO card data. It never touches password/card fields; the card path hands
 * control to the human. Nothing here is persisted.
 *
 * All side effects are injected primitives, so every branch is unit-testable
 * without a browser and WITHOUT ever placing a real order. Loaded into the
 * background worker via importScripts → globalThis.SnipeBuyPipeline.
 */
"use strict";

(() => {
  /**
   * @param {{url: string, desiredQty?: number, respectLimit?: boolean,
   *          paymentMethod: "card"|"ramburs", shippingMethod?: string, address?: string,
   *          maxPrice?: number|null}} task
   * @param {{
   *   readLimit: () => Promise<number|null>,
   *   readPrice: () => Promise<number|null>,
   *   addToCartQuantity: (target: number) => Promise<{achievedQty: number}>,
   *   goToCheckout: () => Promise<void>,
   *   readCheckoutState: () => Promise<{cartQty: number|null, paymentOptions?: string[], rejection?: {rejected: boolean, acceptedQty: number|null, text?: string}|null}>,
   *   selectShipping?: (method: string) => Promise<{ok: boolean}>,
   *   selectAddress?: (address?: string|null) => Promise<{ok: boolean, reason?: string}>,
   *   selectPayment: (method: string) => Promise<{ok: boolean, available: boolean}>,
   *   acceptTerms: () => Promise<{ok: boolean}>,
   *   placeOrder: () => Promise<{ok: boolean}>,
   *   onStatus: (status: "grabbed"|"awaiting_payment"|"ordered"|"failed", detail: object) => void,
   *   notify: (event: string, detail: object) => void,
   * }} deps
   */
  const runBuyPipeline = async (task, deps) => {
    const url = task.url;
    const desired = Math.max(1, Math.trunc(task.desiredQty ?? 1));

    // Price cap (review Item 1): never spend above the user's stated ceiling.
    // Returns a blocking result to abort with, or null to proceed.
    const priceGuard = async () => {
      if (task.maxPrice == null) return null; // no cap → no read, no abort (unchanged behavior)
      const price = await deps.readPrice();
      if (price == null) {
        // Unreadable price → abort, for BOTH card and ramburs. Both now submit the
        // order (card's TRIMITE COMANDA only redirects to the bank's card page, it
        // doesn't charge), so neither may proceed against an unverifiable price.
        return { reason: "price_unreadable", price: null };
      }
      return price > task.maxPrice ? { reason: "price_exceeded", price } : null;
    };
    const abortForPrice = (blocked) => {
      deps.onStatus("failed", { url, reason: blocked.reason, price: blocked.price, cap: task.maxPrice });
      deps.notify(blocked.reason, { url, price: blocked.price, cap: task.maxPrice });
      return { outcome: "failed", reason: blocked.reason, price: blocked.price };
    };

    // 1) Per-person limit (best-effort) → cap desired quantity (guardrail 3).
    const limit = task.respectLimit === false ? null : await deps.readLimit();
    const target = limit != null && limit > 0 ? Math.min(desired, limit) : desired;
    if (target < desired) {
      deps.notify("quantity_capped", { url, requested: desired, accepted: target, reason: `per-person limit ${limit}` });
    }

    // 1b) Price cap — check BEFORE spending anything (before add-to-cart).
    const priceBlock = await priceGuard();
    if (priceBlock) return abortForPrice(priceBlock);

    // 2) Add to cart, reaching the (already limit-capped) target.
    const add = await deps.addToCartQuantity(target);
    let effectiveQty = Number.isFinite(add?.achievedQty) ? add.achievedQty : target;
    if (effectiveQty <= 0) {
      deps.onStatus("failed", { url, reason: "could not add item to cart" });
      return { outcome: "failed", reason: "add_to_cart_failed" };
    }

    // 3) Go to checkout and inspect cart/checkout for a quantity rejection.
    await deps.goToCheckout();
    const state = await deps.readCheckoutState();

    // 3a) Guardrail 4: if a CAPTCHA/verification appears, or the session was lost
    //     (login page), DO NOT try to solve or bypass it — hand the tab back to the
    //     user and stop with a clear failure. Never retry past a protection.
    if (state?.blockedReason) {
      const reason =
        state.blockedReason === "login_lost"
          ? "krit.ro session lost — sign in and re-run the task"
          : "CAPTCHA/verification required — complete it in the Krit tab, then re-run";
      deps.onStatus("failed", { url, reason });
      deps.notify(state.blockedReason, { url, reason });
      await deps.handBack?.();
      return { outcome: "failed", reason: state.blockedReason, detail: reason };
    }

    // 3b) Quantity-rejection handling: CAP to accepted, never retry past it.
    if (state?.rejection?.rejected) {
      const accepted = state.rejection.acceptedQty ?? state.cartQty ?? effectiveQty;
      if (accepted < effectiveQty) {
        effectiveQty = Math.max(1, accepted);
        deps.notify("quantity_capped", { url, requested: target, accepted: effectiveQty, reason: state.rejection.text ?? "store rejected quantity" });
      }
    } else if (state?.cartQty != null && state.cartQty < effectiveQty) {
      // Silent cap: the cart holds fewer than we tried to add (store limited it
      // without an explicit error). Accept the amount the store allowed.
      deps.notify("quantity_capped", { url, requested: target, accepted: state.cartQty, reason: "cart holds fewer than requested" });
      effectiveQty = Math.max(1, state.cartQty);
    }
    // NB: we never call addToCartQuantity again here — capping, not escalating.

    // 4) Shipping method (best-effort) + address.
    if (task.shippingMethod) await deps.selectShipping?.(task.shippingMethod);
    // ALWAYS select an address: Krit's default checkout state is "Adresă nouă"
    // (create-new), NOT a pre-filled saved address, so a blank Flow address must
    // still pick a real saved one. `selectAddress`/`pickAddress` treat an absent
    // address as "use the first real saved address".
    const addr = await deps.selectAddress?.(task.address);
    if (addr && addr.ok === false) {
      // No usable saved address (account only has "Adresă nouă"). Do NOT proceed
      // to payment / place-order against an unset address — abort cleanly, the
      // same shape as the guardrail-4 block (fail + notify + hand the tab back).
      const reason = "no saved address on the krit.ro account — add one, then re-run";
      deps.onStatus("failed", { url, reason: "no_saved_address" });
      deps.notify("no_saved_address", { url, reason });
      await deps.handBack?.();
      return { outcome: "failed", reason: "no_saved_address", detail: reason };
    }

    // 5) Payment selection + terms.
    const pay = await deps.selectPayment(task.paymentMethod);
    await deps.acceptTerms();

    // Report the final quantity relative to what the user originally asked for
    // (covers both the per-person-limit cap and any cart/checkout rejection cap).
    const cappedFrom = desired !== effectiveQty ? desired : null;

    // 6) Payment branch.
    if (task.paymentMethod === "card") {
      // Live-confirmed: on Krit, clicking TRIMITE COMANDA with "Card" selected does
      // NOT charge — it submits the order and redirects to the bank's card page
      // where the HUMAN enters/confirms their card. So we submit (same as ramburs),
      // then STOP and hand back. The bot NEVER touches the post-redirect card page
      // (guardrail 1 — no card data ever read/entered by the bot).
      const placeBlock = await priceGuard(); // same re-check as ramburs — over-cap aborts, no submit
      if (placeBlock) return abortForPrice(placeBlock);
      const placed = await deps.placeOrder();
      if (!placed?.ok) {
        // The submit itself failed — do NOT claim awaiting_payment.
        deps.onStatus("failed", { url, reason: "place-order click did not succeed" });
        return { outcome: "failed", reason: "place_order_failed", qty: effectiveQty };
      }
      // Order submitted → the card-confirmation page is now up for the user.
      deps.onStatus("awaiting_payment", { url, qty: effectiveQty, cappedFrom });
      deps.notify("awaiting_payment", { url, qty: effectiveQty });
      await deps.handBack?.(); // surface the tab so the user sees the card page immediately
      return { outcome: "awaiting_payment", qty: effectiveQty, cappedFrom };
    }

    if (task.paymentMethod === "ramburs") {
      if (!pay.available) {
        // Phase 0 gap: ramburs may not be offered for this order (e.g. some
        // delivery methods). Do NOT guess/auto-place — hand back to the user.
        deps.onStatus("awaiting_payment", { url, qty: effectiveQty, reason: "ramburs not offered for this order" });
        deps.notify("ramburs_unavailable", { url, qty: effectiveQty });
        return { outcome: "awaiting_payment", qty: effectiveQty, reason: "ramburs_unavailable" };
      }
      // RE-CHECK the price right before the auto-place — it may have changed
      // between add-to-cart and checkout. Blocks an over-cap ramburs order.
      const placeBlock = await priceGuard();
      if (placeBlock) return abortForPrice(placeBlock);
      const placed = await deps.placeOrder();
      if (!placed?.ok) {
        deps.onStatus("failed", { url, reason: "place-order click did not succeed" });
        return { outcome: "failed", reason: "place_order_failed", qty: effectiveQty };
      }
      deps.onStatus("ordered", { url, qty: effectiveQty, cappedFrom });
      deps.notify("ordered", { url, qty: effectiveQty });
      return { outcome: "ordered", qty: effectiveQty, cappedFrom };
    }

    deps.onStatus("failed", { url, reason: `unknown payment method: ${task.paymentMethod}` });
    return { outcome: "failed", reason: "unknown_payment_method" };
  };

  globalThis.SnipeBuyPipeline = Object.freeze({ runBuyPipeline });
})();

/**
 * Mode A watch loop (Snipe, Phase 2).
 *
 * Polls a product URL at ~10s + jitter; on in-stock, hands off to the buy
 * pipeline (sibling sub-epic — a stub call site for now). On errors or a Krit
 * block/error page it backs off exponentially instead of hammering at the fixed
 * interval, and after exhausting its error budget it reports `failed` with a
 * reason rather than hanging forever (guardrail 5: be polite to Krit).
 *
 * The core is PURE and dependency-injected (checkStock / onInStock / onStatus /
 * sleep / now / random) so timing, jitter, and backoff are deterministically
 * unit-testable without a browser. Loaded into the background service worker via
 * importScripts → exposed on globalThis.SnipeWatchLoop.
 */
"use strict";

(() => {
  const DEFAULTS = Object.freeze({
    intervalMs: 10_000, // base poll cadence (§4: ~10s)
    jitterMs: 3_000, // random extra in [0, jitterMs) added to each poll
    backoffBaseMs: 15_000, // first backoff wait after an error
    backoffFactor: 2, // exponential growth per consecutive error
    backoffMaxMs: 5 * 60_000, // cap a single backoff wait at 5 min
    maxConsecutiveErrors: 6, // give up (→ failed) after this many in a row (unless watchUntilStopped)
    watchUntilStopped: false, // when true: no error-count give-up — keep backing off until stopped
    maxWatchMs: 24 * 60 * 60_000, // hard 24h cap on total watch duration (forgot-to-stop safety net)
  });

  const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * @param {{url: string}} task
   * @param {{
   *   checkStock: () => Promise<{inStock?: boolean, error?: string, state?: string}>,
   *   onInStock?: (result: object) => (void | Promise<void>),
   *   onStatus?: (status: "running"|"grabbed"|"failed"|"stopped", detail: object) => void,
   *   onEvent?: (event: string, detail: object) => void,
   *   sleep?: (ms: number) => Promise<void>, now?: () => number, random?: () => number,
   * }} deps
   * @param {object} [options] overrides for DEFAULTS
   */
  const createWatchLoop = (task, deps, options = {}) => {
    const cfg = { ...DEFAULTS, ...options };
    const { checkStock, onInStock, onStatus, onEvent } = deps;
    const sleep = deps.sleep ?? defaultSleep;
    const now = deps.now ?? Date.now;
    const random = deps.random ?? Math.random;

    let running = false;
    let consecutiveErrors = 0;

    /** Normal cadence: base interval + jitter in [0, jitterMs). */
    const nextPollDelay = () => cfg.intervalMs + Math.floor(random() * cfg.jitterMs);
    /** Exponential backoff for the Nth (1-based) consecutive error, capped. */
    const backoffDelay = (errors) =>
      Math.min(cfg.backoffBaseMs * cfg.backoffFactor ** (errors - 1), cfg.backoffMaxMs);

    const run = async () => {
      running = true;
      consecutiveErrors = 0;
      const startAt = now();
      onStatus?.("running", { url: task.url, startedAt: startAt });

      while (running) {
        // Hard 24h cap on total watch duration — a "forgot to click Stop" safety
        // net for the opt-in indefinite watch. Only applies when watchUntilStopped
        // is ON (so the default path stays byte-for-byte unchanged); once ON it is
        // checked each iteration on BOTH the error-backoff and normal-poll paths.
        if (cfg.watchUntilStopped && now() - startAt >= cfg.maxWatchMs) {
          onStatus?.("failed", {
            url: task.url,
            reason: "reached max watch duration (24h) — stop and restart if you still want to watch this item",
          });
          running = false;
          break;
        }

        let result = null;
        let reason = null;
        try {
          result = await checkStock();
          if (result?.error) reason = result.error;
        } catch (err) {
          reason = err?.message ?? String(err);
        }
        if (!running) break; // stopped mid-check

        // --- Success: in stock → hand off and finish. ---
        if (reason === null && result?.inStock === true) {
          consecutiveErrors = 0;
          onStatus?.("grabbed", { url: task.url, stock: result });
          try {
            await onInStock?.(result);
          } catch (err) {
            onEvent?.("handoff_error", { message: err?.message ?? String(err) });
          }
          running = false;
          break;
        }

        // --- Error / block page → exponential backoff, or give up. ---
        if (reason !== null) {
          consecutiveErrors += 1;
          // Give up after the error budget — UNLESS the task opted into
          // "watch until stopped", in which case we keep backing off (still
          // capped at backoffMaxMs = 5 min, guardrail-5) until Stop or the 24h cap.
          if (!cfg.watchUntilStopped && consecutiveErrors >= cfg.maxConsecutiveErrors) {
            onStatus?.("failed", {
              url: task.url,
              reason: `gave up after ${consecutiveErrors} consecutive errors (last: ${reason})`,
            });
            running = false;
            break;
          }
          const delay = backoffDelay(consecutiveErrors);
          onEvent?.("backoff", { attempt: consecutiveErrors, delayMs: delay, reason });
          await sleep(delay);
          continue;
        }

        // --- In stock false, no error → keep watching at normal cadence. ---
        consecutiveErrors = 0;
        onEvent?.("poll", { state: result?.state ?? "unknown" });
        await sleep(nextPollDelay());
      }
    };

    return {
      /** Start the loop. Returns the run promise (resolves when the loop ends). */
      start() {
        return running ? Promise.resolve() : run();
      },
      /** Stop the loop; it exits before the next check/sleep completes. */
      stop(detail = "stopped by user") {
        if (!running) return;
        running = false;
        onStatus?.("stopped", { url: task.url, reason: detail });
      },
      isRunning: () => running,
      // Exposed for tests / diagnostics:
      _nextPollDelay: nextPollDelay,
      _backoffDelay: backoffDelay,
      _config: cfg,
    };
  };

  globalThis.SnipeWatchLoop = Object.freeze({ createWatchLoop, DEFAULTS });
})();

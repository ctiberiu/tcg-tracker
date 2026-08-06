/**
 * Dashboard-origin messaging bridge (content script).
 *
 * Trust boundary for guardrail 6 (snipe-bot-plan.md §3.6). The dashboard page
 * arms real purchases via `window.postMessage`; this bridge is the ONLY thing
 * that decides whether a page message is allowed to reach the extension. It
 * forwards to the background worker over `chrome.runtime` ONLY when a message
 * passes every check below, then relays the worker's reply back to the page.
 *
 * Runs in the same isolated world as config.js, which set globalThis.SNIPE_CONFIG.
 */
"use strict";

(() => {
  const config = globalThis.SNIPE_CONFIG;
  if (config == null) {
    // config.js failed to load first — fail closed rather than trust everything.
    console.error("[Snipe/bridge] SNIPE_CONFIG missing; bridge disabled.");
    return;
  }

  const ALLOWED_ORIGINS = new Set(config.DASHBOARD_ORIGINS);
  const { PAGE_SOURCE, EXT_SOURCE } = config;

  /** Post a reply back to the dashboard page, pinned to the origin it came from. */
  const replyToPage = (origin, requestId, type, payload) => {
    window.postMessage({ source: EXT_SOURCE, type, requestId, payload }, origin);
  };

  window.addEventListener("message", (event) => {
    // --- Guardrail 6: validate the boundary BEFORE trusting anything. ---

    // 1) Only messages this same window posted to itself. Rejects messages from
    //    iframes, popups, or other tabs/windows (their event.source differs).
    if (event.source !== window) return;

    // 2) Only our known dashboard origin(s). Rejects every other site, even if
    //    it somehow shares this window (it can't, but defense in depth).
    if (!ALLOWED_ORIGINS.has(event.origin)) return;

    // 3) Shape + our namespace discriminator. Ignore the noise of unrelated
    //    postMessage traffic (analytics, wallets, frameworks, etc.).
    const data = event.data;
    if (data === null || typeof data !== "object") return;
    if (data.source !== PAGE_SOURCE) return;

    const requestId = typeof data.requestId === "string" ? data.requestId : null;
    const type = typeof data.type === "string" ? data.type : null;
    if (type === null) return;

    // --- Passed the boundary: forward to the background worker. ---
    // We forward the validated origin so the worker has provenance if it needs it.
    chrome.runtime.sendMessage(
      { kind: "DASHBOARD_MESSAGE", origin: event.origin, type, payload: data.payload ?? null },
      (response) => {
        if (chrome.runtime.lastError) {
          replyToPage(event.origin, requestId, "ERROR", {
            message: chrome.runtime.lastError.message ?? "extension unavailable",
          });
          return;
        }
        replyToPage(event.origin, requestId, response?.type ?? "ACK", response?.payload ?? null);
      },
    );
  });

  // Long-lived port so the background worker can PUSH live task-status updates to
  // this page. Status flows worker → port → here → window.postMessage → the
  // dashboard React app (which persists it to snipe_tasks.status).
  const connectStatusPort = () => {
    let port;
    try {
      port = chrome.runtime.connect({ name: "snipe-dashboard" });
    } catch {
      return; // extension context gone — stop trying.
    }
    port.onMessage.addListener((msg) => {
      window.postMessage({ source: EXT_SOURCE, type: msg?.type ?? "STATUS", requestId: null, payload: msg }, window.origin);
    });
    // The MV3 worker can recycle the port; reconnect so status keeps flowing.
    port.onDisconnect.addListener(() => {
      setTimeout(connectStatusPort, 500);
    });
  };
  connectStatusPort();

  // Announce presence so the dashboard can detect the extension is installed.
  window.postMessage({ source: EXT_SOURCE, type: "EXT_PRESENT", requestId: null, payload: { version: "0.1.0" } }, window.origin);

  console.debug("[Snipe/bridge] ready; trusting origins:", [...ALLOWED_ORIGINS]);
})();

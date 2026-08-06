/**
 * Background service worker (Manifest V3).
 *
 * Hub between the content scripts, and host of the Mode A **watch loop**
 * (watch-loop.js, loaded below). It receives chrome.runtime messages, drives a
 * managed krit.ro tab to poll a product URL for restock, and hands off to the
 * buy pipeline (Phase 2 sibling sub-epic — a stub here) when stock appears.
 *
 * NOTE (MV3 lifecycle): the loop is driven by setTimeout. Each ~10s poll issues
 * chrome.tabs calls that keep the worker warm; a long backoff wait (minutes) can
 * outlast the worker. Persisting watch state + resuming via chrome.alarms is a
 * Phase 4 concern (Supabase task storage) — tracked as a TODO, not needed to
 * prove the loop's behavior here.
 */
"use strict";

importScripts("watch-loop.js", "buy-pipeline.js", "keyword-match.js"); // → SnipeWatchLoop, SnipeBuyPipeline, SnipeKeywordMatch

/** Tab ids of krit.ro tabs whose content script has reported ready. */
const kritTabs = new Set();

/**
 * At most one Mode A watch at a time (single account / single item this phase).
 * `null` = idle; `{ pending: true }` = a start is in flight (claimed synchronously
 * before the first await to close the TOCTOU race); otherwise the real watch
 * `{ tabId, url, status, loop, task }`.
 */
let activeWatch = null;

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[Snipe/bg] installed (${details.reason}); Phase 2 watch loop active.`);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  kritTabs.delete(tabId);
  if (activeWatch?.tabId === tabId) {
    activeWatch.loop?.stop("watch tab was closed");
    activeWatch = null;
  }
});

// ── Live status push to the dashboard page ──
// The dashboard bridge opens a long-lived port so the worker can PUSH task
// status changes back to the page (which persists them to snipe_tasks.status).
const dashboardPorts = new Set();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "snipe-dashboard") return;
  dashboardPorts.add(port);
  port.onDisconnect.addListener(() => dashboardPorts.delete(port));
});

// ── Desktop notifications (Phase 6) — only for the three time-sensitive events.
//    No email channel (that stays reserved for the scraper's stock alerts). ──
const NOTIFY = {
  grabbed: { title: "Snipe — item grabbed", body: () => "In stock and added to cart; proceeding to checkout." },
  awaiting_payment: { title: "Snipe — payment needed", body: () => "Order submitted — confirm your card on the Krit tab to complete it." },
  failed: { title: "Snipe — task failed", body: (d) => (d?.reason ? String(d.reason) : "The run failed.") },
};

const notifyDesktop = (status, detail) => {
  const spec = NOTIFY[status];
  if (!spec || !chrome.notifications) return; // only the 3 events; ignore others
  try {
    chrome.notifications.create(`snipe-${status}-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon-128.png"),
      title: spec.title,
      message: spec.body(detail),
      priority: status === "awaiting_payment" ? 2 : 1,
    });
  } catch (err) {
    console.debug("[Snipe/notify] create failed", err);
  }
};

/** Broadcast a task's status change to every connected dashboard bridge + fire a desktop notification for the key events. */
const broadcastStatus = (taskId, status, detail) => {
  for (const port of dashboardPorts) {
    try {
      port.postMessage({ type: "STATUS", taskId: taskId ?? null, status, detail: detail ?? null });
    } catch {
      dashboardPorts.delete(port);
    }
  }
  notifyDesktop(status, detail);
};

/** Push a non-status audit EVENT (backoff, quantity_capped, captcha…) to the dashboard for snipe_runs logging. */
const broadcastEvent = (taskId, event, detail) => {
  for (const port of dashboardPorts) {
    try {
      port.postMessage({ type: "EVENT", taskId: taskId ?? null, event, detail: detail ?? null });
    } catch {
      dashboardPorts.delete(port);
    }
  }
};

/** Resolve once the tab finishes loading, or reject on timeout (event-based, no blind sleep). */
const waitForTabComplete = (tabId, timeoutMs = 30_000) =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("navigation timeout"));
    }, timeoutMs);
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        cleanup();
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

/**
 * Build a checkStock() for the watch loop: navigate the managed tab to the URL,
 * wait for load, ask the content script to read stock, and classify the result.
 * A missing content script or a non-product page is reported as an ERROR (so the
 * loop backs off), never as a false "out of stock".
 */
const makeCheckStock = (getTabId, url) => async () => {
  const tabId = getTabId();
  if (tabId == null) return { error: "watch tab missing" };
  try {
    await chrome.tabs.update(tabId, { url });
    await waitForTabComplete(tabId);
  } catch (err) {
    return { error: `navigation failed: ${err?.message ?? err}` };
  }
  try {
    const res = await chrome.tabs.sendMessage(tabId, { kind: "KRIT_ACTION", action: "CHECK_STOCK" });
    const stock = res?.stock;
    if (!res?.ok || stock == null) return { error: res?.reason ?? "no stock result" };
    if (stock.isProductPage === false) return { error: "not a product page (possible Krit block/error page)" };
    return { inStock: stock.inStock === true, state: stock.state, stock };
  } catch (err) {
    return { error: `content script unreachable (possible block/challenge): ${err?.message ?? err}` };
  }
};

/**
 * Run the buy pipeline for a watch's tab. Builds the injected primitives that
 * drive the krit.ro content script, then delegates all branching (limit cap,
 * quantity-rejection cap, card=pause / ramburs=auto-place) to the pure
 * SnipeBuyPipeline orchestrator.
 *
 * SAFETY: no credentials or card data are read or stored here (guardrail 1). The
 * dev-stub default task is `paymentMethod: "card"`, so a manually-started watch
 * always PAUSES at payment (awaiting_payment) and never auto-places an order.
 * Ramburs auto-place only happens when a real task explicitly configures it
 * (Phase 4 Supabase task storage).
 */
const runBuyForWatch = async (state, stockResult) => {
  const send = (action, extra = {}) => chrome.tabs.sendMessage(state.tabId, { kind: "KRIT_ACTION", action, ...extra });
  const task = state.task;
  const deps = {
    readLimit: async () => (await send("CHECK_STOCK"))?.stock?.limit ?? null,
    readPrice: async () => (await send("READ_PRICE"))?.price ?? null,
    addToCartQuantity: async (target) => ({ achievedQty: (await send("ADD_TO_CART_QTY", { qty: target }))?.achievedQty ?? 0 }),
    goToCheckout: async () => {
      await chrome.tabs.update(state.tabId, { url: new URL("/comanda", state.url).href });
      await waitForTabComplete(state.tabId);
    },
    readCheckoutState: async () => (await send("READ_CHECKOUT_STATE"))?.state ?? { cartQty: null, rejection: null },
    selectShipping: async (method) => ({ ok: (await send("SELECT_SHIPPING", { method }))?.ok === true }),
    selectAddress: async (address) => ({ ok: (await send("SELECT_ADDRESS", { address }))?.ok === true }),
    selectPayment: async (method) => {
      const r = await send("SELECT_PAYMENT", { method });
      return { ok: r?.ok === true, available: r?.available === true };
    },
    acceptTerms: async () => ({ ok: (await send("ACCEPT_TERMS"))?.ok === true }),
    placeOrder: async () => ({ ok: (await send("PLACE_ORDER"))?.ok === true }),
    // Guardrail 4: bring the krit tab to the front so the user can complete a
    // CAPTCHA / re-login themselves — we never try to solve or bypass it.
    handBack: async () => {
      try {
        await chrome.tabs.update(state.tabId, { active: true });
      } catch { /* tab gone */ }
    },
    onStatus: (status, detail) => {
      state.status = status;
      broadcastStatus(state.task.taskId, status, detail);
      console.log(`[Snipe/buy] status=${status}`, detail);
    },
    notify: (event, detail) => broadcastEvent(state.task.taskId, event, detail), // → dashboard snipe_runs audit
  };
  try {
    return await globalThis.SnipeBuyPipeline.runBuyPipeline(task, deps);
  } catch (err) {
    state.status = "failed";
    // Ensure an unexpected pipeline throw still surfaces as failed (status + notify).
    broadcastStatus(state.task.taskId, "failed", { reason: err?.message ?? String(err) });
    console.error("[Snipe/buy] pipeline error", err);
    return { outcome: "failed", reason: err?.message ?? String(err) };
  }
};

// `preclaimed` = the caller (startKeywordWatch) already claimed the single-watch
// slot with a synchronous `{ pending: true }` sentinel, so we must not re-check
// the guard (we'd reject our own reservation) — but we still own clearing it on
// failure. See the TOCTOU note on `activeWatch`.
const startWatch = async (url, taskConfig = {}, preclaimed = false) => {
  if (!preclaimed && activeWatch) return { ok: false, reason: "a watch is already running — stop it first" };
  if (typeof url !== "string" || !/^https?:\/\/(www\.)?krit\.ro\//.test(url)) {
    if (preclaimed) activeWatch = null; // release the slot the caller reserved
    return { ok: false, reason: "start a watch from a krit.ro product page" };
  }
  // Claim the slot SYNCHRONOUSLY, before the first await, so a second concurrent
  // START_TASK sees a non-null activeWatch and is rejected (no orphaned tab/loop).
  // Idempotent when the caller already set the pending sentinel.
  activeWatch = { pending: true };
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
  } catch (err) {
    activeWatch = null; // failed start must not wedge the guard
    return { ok: false, reason: `could not open the watch tab: ${err?.message ?? err}` };
  }
  // Default payment_method is card → the pipeline PAUSES at payment and never
  // auto-places an order when a task omits it. Real tasks pass their flow's method.
  const task = { url, desiredQty: 1, respectLimit: true, paymentMethod: "card", maxPrice: null, watchUntilStopped: false, ...taskConfig };
  const state = { tabId: tab.id, url, status: "idle", loop: null, task };
  activeWatch = state; // replace the pending sentinel with the real watch
  const loop = globalThis.SnipeWatchLoop.createWatchLoop(
    { url },
    {
      checkStock: makeCheckStock(() => state.tabId, url),
      onInStock: (result) => runBuyForWatch(state, result),
      onStatus: (status, detail) => {
        state.status = status;
        broadcastStatus(state.task.taskId, status, detail);
        console.log(`[Snipe/watch] status=${status}`, detail);
      },
      onEvent: (event, detail) => {
        // 'poll' fires every ~10s — too noisy for the audit log; only record backoff.
        if (event === "backoff") broadcastEvent(state.task.taskId, "backoff", detail);
        console.debug(`[Snipe/watch] ${event}`, detail);
      },
    },
    // "Watch until stopped" opt-in: removes the error give-up cutoff (24h cap still applies).
    { watchUntilStopped: state.task.watchUntilStopped === true },
  );
  state.loop = loop;
  loop.start().catch((err) => console.error("[Snipe/watch] loop error", err));
  return { ok: true, url, tabId: tab.id };
};

/**
 * Mode B (Phase 3): search krit.ro for keywords, resolve to the SINGLE product
 * whose title matches ALL of them, then reuse the Phase 2 watch+buy pipeline
 * (startWatch) unchanged. Never guesses: zero or multiple matches surface a
 * clear status and DO NOT start a purchase.
 */
const startKeywordWatch = async (keywords, taskConfig = {}) => {
  const km = globalThis.SnipeKeywordMatch;
  const norm = km.normalizeKeywords(keywords);
  if (norm.length === 0) return { ok: false, status: "no_keywords", reason: "provide at least one keyword" };
  if (activeWatch) return { ok: false, reason: "a watch is already running — stop it first" };
  // Claim the slot SYNCHRONOUSLY before the search await, so a concurrent
  // START_TASK can't also start a watch. Cleared on every early return below.
  activeWatch = { pending: true };

  // Search in a temporary tab, read results, then close it.
  const searchUrl = km.buildSearchUrl("https://krit.ro", norm);
  let tab;
  try {
    tab = await chrome.tabs.create({ url: searchUrl, active: false });
  } catch (err) {
    activeWatch = null;
    return { ok: false, status: "search_failed", reason: `could not open the search tab: ${err?.message ?? err}` };
  }
  let products = [];
  try {
    await waitForTabComplete(tab.id);
    const res = await chrome.tabs.sendMessage(tab.id, { kind: "KRIT_ACTION", action: "READ_SEARCH_RESULTS" });
    products = Array.isArray(res?.results) ? res.results : [];
  } catch (err) {
    try { await chrome.tabs.remove(tab.id); } catch { /* gone */ }
    activeWatch = null;
    return { ok: false, status: "search_failed", reason: `search read failed: ${err?.message ?? err}` };
  }
  try { await chrome.tabs.remove(tab.id); } catch { /* gone */ }

  const resolved = km.resolveByKeywords(products, norm);
  if (resolved.status !== "resolved") {
    // no_match / ambiguous → release the slot, no purchase (never buy the wrong item).
    activeWatch = null;
    console.log(`[Snipe/modeB] not resolved: ${resolved.status}`, resolved.matches?.map((m) => m.title));
    return {
      ok: false,
      status: resolved.status,
      candidates: (resolved.matches ?? []).map((m) => ({ title: m.title, url: m.url })),
      reason: resolved.status === "ambiguous"
        ? `keywords matched ${resolved.matches.length} products — refine to a single match`
        : "no product title matched all keywords",
    };
  }

  // Single unambiguous match → hand the URL to the pipeline. Pass preclaimed=true
  // so startWatch adopts our pending sentinel instead of re-checking the guard.
  console.log(`[Snipe/modeB] resolved → ${resolved.url} (${resolved.product.title})`);
  const started = await startWatch(resolved.url, taskConfig, true);
  return { ...started, status: "resolved", matchedTitle: resolved.product.title, url: resolved.url };
};

const stopWatch = async () => {
  if (!activeWatch) return { ok: false, reason: "no active watch" };
  const { tabId } = activeWatch;
  activeWatch.loop?.stop("stopped by user");
  activeWatch = null;
  try {
    if (tabId != null) await chrome.tabs.remove(tabId);
  } catch {
    /* tab already gone */
  }
  return { ok: true };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const kind = message?.kind;

  // --- From the krit.ro content script ---
  if (kind === "KRIT_READY") {
    const tabId = sender?.tab?.id;
    if (typeof tabId === "number") {
      kritTabs.add(tabId);
      console.debug(`[Snipe/bg] krit tab ${tabId} ready @ ${message.url ?? "?"}`);
    }
    sendResponse({ type: "ACK", payload: { acknowledged: true } });
    return false;
  }

  // --- From the dashboard bridge (already origin/source-validated there,
  //     guardrail 6). This is the real Play/Stop trigger that replaced the
  //     Phase 1 dev-stub. ---
  if (kind === "DASHBOARD_MESSAGE") {
    console.debug(`[Snipe/bg] dashboard message '${message.type}' from ${message.origin}`);
    if (message.type === "PING") {
      sendResponse({ type: "PONG", payload: { version: "0.1.0", kritTabsConnected: kritTabs.size, watching: activeWatch?.task?.taskId ?? null } });
      return false;
    }
    if (message.type === "START_TASK") {
      const t = message.payload?.task ?? {};
      const cfg = {
        taskId: t.taskId,
        desiredQty: t.desiredQty,
        respectLimit: t.respectLimit,
        paymentMethod: t.paymentMethod,
        shippingMethod: t.shippingMethod,
        address: t.address,
        maxPrice: t.maxPrice ?? null,
        watchUntilStopped: t.watchUntilStopped ?? false,
      };
      const started = t.mode === "keywords" ? startKeywordWatch(t.keywords, cfg) : startWatch(t.url, cfg);
      started.then((result) => {
        // On success the watch loop's own onStatus('running') already broadcasts;
        // do this too so the page updates immediately. On failure we DON'T set a
        // status (the ack below carries the reason — e.g. "already running",
        // no_match, ambiguous — for the page to surface without mislabeling).
        if (result.ok !== false) broadcastStatus(t.taskId, "running", { matchedTitle: result.matchedTitle });
        sendResponse({ type: "TASK_RESULT", payload: result });
      });
      return true;
    }
    if (message.type === "STOP_TASK") {
      const taskId = message.payload?.taskId ?? activeWatch?.task?.taskId ?? null;
      stopWatch().then((result) => {
        broadcastStatus(taskId, "idle", { reason: "stopped by user" });
        sendResponse({ type: "TASK_RESULT", payload: result });
      });
      return true;
    }
    sendResponse({ type: "ERROR", payload: { message: `unknown type: ${message.type}` } });
    return false;
  }

  return false; // unknown sender/shape
});

/**
 * Shared constants for the Snipe extension's DASHBOARD-side content scripts.
 *
 * This file is injected (via manifest `content_scripts`) immediately BEFORE
 * `content-dashboard.js` in the same content-script entry, so both files run in
 * the same isolated world and share `globalThis`. It exposes the config on
 * `globalThis.SNIPE_CONFIG` for `content-dashboard.js` to read.
 *
 * ⚠️ KEEP IN SYNC: `DASHBOARD_ORIGINS` below MUST match the dashboard entries in
 * manifest.json (`host_permissions` + the dashboard `content_scripts.matches`).
 * The manifest decides WHERE the bridge is injected; this list decides which
 * `event.origin` values the bridge will TRUST at runtime (guardrail 6). They
 * must describe the same set of origins or the trust check is meaningless.
 *
 * Production origin is the CONFIRMED deployed dashboard: `https://tcg-tracker-kappa.vercel.app`.
 * `http://localhost:5173` is kept for local dev.
 */
"use strict";

globalThis.SNIPE_CONFIG = Object.freeze({
  /** Exact origins (scheme + host + port, no trailing slash) allowed to talk to the extension. */
  DASHBOARD_ORIGINS: Object.freeze([
    "https://tcg-tracker-kappa.vercel.app",
    "https://www.tcg-tracker-kappa.vercel.app",
    "http://localhost:5173",
  ]),
  /** Discriminator on messages the dashboard PAGE posts to the bridge. */
  PAGE_SOURCE: "snipe-dashboard",
  /** Discriminator on messages the bridge posts BACK to the dashboard page. */
  EXT_SOURCE: "snipe-extension",
});

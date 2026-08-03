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
 * Production origin is `https://packradar.info` — the real custom domain, verified
 * serving the app. `https://tcg-tracker-kappa.vercel.app` is Vercel's auto-assigned
 * hostname for the same project and serves byte-identical HTML; it is retained
 * ONLY so the extension keeps working while that host is still reachable.
 *
 * ⚠️ If the vercel.app host is ever 301'd to packradar.info (planned, epic
 * 5de9e87c), the redirect ALONE would have broken this extension before
 * packradar.info was added here: every URL the bridge matched would have
 * redirected to a host it did not trust. Add the origin BEFORE adding the
 * redirect, and the vercel.app entries can be dropped once the redirect is live.
 *
 * `http://localhost:5173` is kept for local dev. `www.packradar.info` is
 * deliberately absent — it does not resolve, and an origin that cannot be
 * reached is trust surface for nothing.
 */
"use strict";

globalThis.SNIPE_CONFIG = Object.freeze({
  /** Exact origins (scheme + host + port, no trailing slash) allowed to talk to the extension. */
  DASHBOARD_ORIGINS: Object.freeze([
    "https://packradar.info",
    "https://tcg-tracker-kappa.vercel.app",
    "https://www.tcg-tracker-kappa.vercel.app",
    "http://localhost:5173",
  ]),
  /** Discriminator on messages the dashboard PAGE posts to the bridge. */
  PAGE_SOURCE: "snipe-dashboard",
  /** Discriminator on messages the bridge posts BACK to the dashboard page. */
  EXT_SOURCE: "snipe-extension",
});

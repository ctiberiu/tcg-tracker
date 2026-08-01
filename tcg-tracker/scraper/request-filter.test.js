import { describe, it, expect } from 'vitest';
import { shouldAllowRequest } from './request-filter.js';

const STORE = 'https://www.lexshop.ro/produse?c=pokemon';
const allow = (url, type) => shouldAllowRequest(STORE, url, type).allow;

describe('shouldAllowRequest', () => {
  it('never blocks the top-level document', () => {
    // Filtering the navigation itself would make a store read as a hard failure
    // rather than a filtered one.
    expect(allow(STORE, 'document')).toBe(true);
  });

  it('blocks passive assets regardless of origin', () => {
    expect(allow('https://www.lexshop.ro/logo.png', 'image')).toBe(false);
    expect(allow('https://ads.example.com/pixel.gif', 'image')).toBe(false);
    expect(allow('https://fonts.gstatic.com/x.woff2', 'font')).toBe(false);
    expect(allow('https://cdn.example.com/promo.mp4', 'media')).toBe(false);
  });

  // THE ONE THAT MATTERS. Playwright's waitForSelector defaults to
  // state:'visible', and all 16 DOM scrapers rely on that default, so visibility
  // is computed from CSS. Blocking stylesheets means elements the site's CSS
  // reveals never become visible -> timeout -> swallow-catch returns [] ->
  // classifyOutcome reads empty as a block -> auto-disable, on a store serving
  // product the whole time. Same failure as 9bf84aa, different door.
  it('NEVER blocks stylesheets, at any origin', () => {
    expect(allow('https://www.lexshop.ro/app.css', 'stylesheet')).toBe(true);
    expect(allow('https://cdn.other-domain.com/app.css', 'stylesheet')).toBe(true);
  });

  it('NEVER blocks scripts or data, at any origin', () => {
    // Origin-independent by design. This buys bandwidth and fewer third-party
    // connections, NOT hostile-JS mitigation — passive assets do not execute.
    // Blocking cross-origin script is a different control needing a per-store
    // allowlist, because shops serve their own rendering code from platform
    // domains (pokemania.ro runs on cdnmp.net).
    expect(allow('https://www.lexshop.ro/app.js', 'script')).toBe(true);
    expect(allow('https://cdnmp.net/platform.js', 'script')).toBe(true);
    expect(allow('https://www.googletagmanager.com/gtm.js', 'script')).toBe(true);
    expect(allow('https://www.lexshop.ro/api/products', 'xhr')).toBe(true);
    expect(allow('https://api.other.com/products', 'fetch')).toBe(true);
  });

  it('allows unknown resource types rather than guessing', () => {
    expect(allow('https://x.test/thing', 'websocket')).toBe(true);
    expect(allow('https://x.test/thing', 'other')).toBe(true);
  });
});

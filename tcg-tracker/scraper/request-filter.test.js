import { describe, it, expect } from 'vitest';
import { shouldAllowRequest, isSameSite, registrableDomain } from './request-filter.js';

const STORE = 'https://www.lexshop.ro/produse?c=pokemon';
const allow = (url, type, mode) => shouldAllowRequest(STORE, url, type, mode).allow;

describe('registrableDomain', () => {
  it('takes the last two labels', () => {
    expect(registrableDomain('www.lexshop.ro')).toBe('lexshop.ro');
    expect(registrableDomain('cdn.static.lexshop.ro')).toBe('lexshop.ro');
    expect(registrableDomain('lexshop.ro')).toBe('lexshop.ro');
  });

  it('is case-insensitive and tolerates junk', () => {
    expect(registrableDomain('WWW.Krit.RO')).toBe('krit.ro');
    expect(registrableDomain('')).toBe('');
    expect(registrableDomain(null)).toBe('');
  });
});

describe('isSameSite', () => {
  it('treats subdomains as same-site — this is the CDN case', () => {
    // Many shops serve their OWN rendering code from a CDN subdomain. An exact
    // origin check would block it, which looks identical to a blocked store.
    expect(isSameSite('www.lexshop.ro', 'cdn.lexshop.ro')).toBe(true);
    expect(isSameSite('lexshop.ro', 'static.assets.lexshop.ro')).toBe(true);
  });

  it('separates genuinely different sites', () => {
    expect(isSameSite('www.lexshop.ro', 'google-analytics.com')).toBe(false);
    expect(isSameSite('pokemania.ro', 'cdnmp.net')).toBe(false);
  });
});

describe('shouldAllowRequest — assets mode (the default)', () => {
  it('never blocks the top-level document', () => {
    // If the navigation itself were filtered the store would read as a hard
    // failure rather than a filtered one.
    expect(allow(STORE, 'document')).toBe(true);
  });

  it('blocks passive assets regardless of origin', () => {
    expect(allow('https://www.lexshop.ro/logo.png', 'image')).toBe(false);
    expect(allow('https://ads.example.com/pixel.gif', 'image')).toBe(false);
    expect(allow('https://fonts.gstatic.com/x.woff2', 'font')).toBe(false);
    expect(allow('https://cdn.example.com/promo.mp4', 'media')).toBe(false);
  });

  // THE ONE THAT MATTERS. Playwright's waitForSelector defaults to
  // state:'visible', and all 14 DOM scrapers call it with only a timeout, so
  // visibility is computed from CSS. Blocking stylesheets makes elements the
  // site's CSS reveals never become visible → timeout → swallow-catch returns []
  // → classifyOutcome reads empty as a block → auto-disable, on a store that was
  // serving product the whole time. Same failure as 9bf84aa, different door.
  it('NEVER blocks stylesheets', () => {
    expect(allow('https://www.lexshop.ro/app.css', 'stylesheet')).toBe(true);
    expect(allow('https://cdn.other-domain.com/app.css', 'stylesheet')).toBe(true);
  });

  it('does not block scripts or data, at any origin', () => {
    // Assets mode is origin-independent by design: it buys bandwidth and fewer
    // third-party connections, NOT hostile-JS mitigation. Passive assets do not
    // execute, so blocking them protects against nothing that runs.
    expect(allow('https://www.lexshop.ro/app.js', 'script')).toBe(true);
    expect(allow('https://cdnmp.net/platform.js', 'script')).toBe(true);
    expect(allow('https://www.googletagmanager.com/gtm.js', 'script')).toBe(true);
    expect(allow('https://www.lexshop.ro/api/products', 'xhr')).toBe(true);
    expect(allow('https://api.other.com/products', 'fetch')).toBe(true);
  });
});

describe('shouldAllowRequest — crosssite mode (opt-in, unverified)', () => {
  const x = (url, type) => allow(url, type, 'crosssite');

  it('still allows same-site subresources, including a CDN subdomain', () => {
    expect(x('https://www.lexshop.ro/app.js', 'script')).toBe(true);
    expect(x('https://cdn.lexshop.ro/app.js', 'script')).toBe(true);
    expect(x('https://www.lexshop.ro/api/products', 'xhr')).toBe(true);
  });

  it('blocks third-party scripts — the actual threat surface', () => {
    expect(x('https://www.googletagmanager.com/gtm.js', 'script')).toBe(false);
    expect(x('https://connect.facebook.net/x.js', 'script')).toBe(false);
  });

  // Documents the cost rather than asserting it is acceptable. scraper.js
  // describes pokemania.ro as a "distinct cdnmp.net platform", so its own
  // rendering code is cross-site and this mode would block it — the exact
  // client-rendered breakage the epic warns about.
  it('ALSO blocks a shop whose own platform JS is on another domain', () => {
    expect(shouldAllowRequest('https://pokemania.ro/x', 'https://cdnmp.net/render.js', 'script', 'crosssite').allow)
      .toBe(false);
  });

  it('still never blocks the document or stylesheets', () => {
    expect(x(STORE, 'document')).toBe(true);
    expect(x('https://cdn.other.com/app.css', 'stylesheet')).toBe(true);
  });
});

describe('fails open', () => {
  // This module must never be the reason a shop stops scraping.
  it('allows when the store URL is unparseable', () => {
    expect(shouldAllowRequest('not-a-url', 'https://x.com/a.js', 'script', 'crosssite').allow).toBe(true);
  });

  it('allows when the request URL is unparseable', () => {
    expect(shouldAllowRequest(STORE, 'data:text/js,1', 'script', 'crosssite').allow).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fetchWithFilterFallback, filterMode } from './scraper.js';
import { classifyOutcome } from './block-detection.js';

/**
 * THE INVARIANT: no auto-disable may ever be caused by our own request filter.
 *
 * This is asserted rather than documented on purpose. "No auto-disable may ever
 * be caused by our own filter" as a code comment is the exact artifact this
 * project has watched go stale repeatedly — the pagination cap rationale that
 * outlived its constraint, the is_notified note describing behaviour the code
 * never had. A comment records an intention; a test records the behaviour.
 *
 * The failure it guards against: filtering makes a store render nothing →
 * rawCount 0 → classifyOutcome returns 'block' → 5 strikes → flagged → 12h →
 * auto-disabled, while the shop served product the whole time. That is 9bf84aa
 * (ATU-Toys One Piece, 17 strikes, 15 products on the page).
 *
 * Synthetic: no browser, no network, no live store.
 */

const store = { name: 'TestShop', url: 'https://testshop.ro/catalog' };
const product = (i) => ({ url: `https://testshop.ro/p/${i}`, title: `p${i}`, in_stock: true });
const result = (n, extra = {}) => ({
  raw: Array.from({ length: n }, (_, i) => product(i)),
  status: 200,
  challenged: false,
  confirmedEmpty: false,
  ...extra,
});

let saved;
beforeEach(() => { saved = process.env.SCRAPER_REQUEST_FILTER; });
afterEach(() => {
  if (saved === undefined) delete process.env.SCRAPER_REQUEST_FILTER;
  else process.env.SCRAPER_REQUEST_FILTER = saved;
});

describe('filterMode', () => {
  it('defaults to assets', () => {
    delete process.env.SCRAPER_REQUEST_FILTER;
    expect(filterMode()).toBe('assets');
  });

  it('can be turned off without a deploy', () => {
    process.env.SCRAPER_REQUEST_FILTER = 'off';
    expect(filterMode()).toBe('off');
  });

  it('falls back to assets on an unrecognised value rather than disabling filtering', () => {
    // Same lesson as the ALERT_MODE gate: a typo must not silently change
    // behaviour into a mode nobody chose.
    process.env.SCRAPER_REQUEST_FILTER = 'aseets';
    expect(filterMode()).toBe('assets');
  });
});

describe('THE INVARIANT — our filter can never cause an auto-disable', () => {
  it('retries unfiltered when filtering yields nothing, and the outcome is NOT block', async () => {
    process.env.SCRAPER_REQUEST_FILTER = 'assets';
    const calls = [];
    // Filtered attempt renders nothing; unfiltered attempt finds the catalogue.
    const fakeFetch = async (_s, _b, _fn, mode) => {
      calls.push(mode);
      return mode === 'off'
        ? result(12)
        : result(0, { blockedByType: { image: 40, font: 3 } });
    };

    const out = await fetchWithFilterFallback(store, null, null, fakeFetch);

    expect(calls).toEqual(['assets', 'off']);
    expect(out.raw).toHaveLength(12);
    // The assertion that matters: with products recovered, classifyOutcome sees
    // rawCount > 0, so the store classifies success — it cannot accumulate a
    // strike, let alone reach auto-disable.
    expect(classifyOutcome({ status: 200, rawCount: out.raw.length })).toBe('success');
    expect(classifyOutcome({ status: 200, rawCount: out.raw.length })).not.toBe('block');
  });

  it('does not retry when filtering is off — no wasted page load', async () => {
    process.env.SCRAPER_REQUEST_FILTER = 'off';
    const calls = [];
    const fakeFetch = async (_s, _b, _fn, mode) => { calls.push(mode); return result(0); };
    await fetchWithFilterFallback(store, null, null, fakeFetch);
    expect(calls).toEqual(['off']);
  });

  it('does not retry when the filtered attempt already found products', async () => {
    process.env.SCRAPER_REQUEST_FILTER = 'assets';
    const calls = [];
    const fakeFetch = async (_s, _b, _fn, mode) => { calls.push(mode); return result(7); };
    const out = await fetchWithFilterFallback(store, null, null, fakeFetch);
    expect(calls).toEqual(['assets']);
    expect(out.raw).toHaveLength(7);
  });

  it('leaves a genuinely failing store classified as block', async () => {
    // The other direction. If the unfiltered retry is ALSO empty the store is
    // really failing, and the pre-existing behaviour must be unchanged —
    // otherwise this net would mask real blocks and nothing would ever disable.
    process.env.SCRAPER_REQUEST_FILTER = 'assets';
    const fakeFetch = async () => result(0);
    const out = await fetchWithFilterFallback(store, null, null, fakeFetch);
    expect(out.raw).toHaveLength(0);
    expect(classifyOutcome({ status: 200, rawCount: out.raw.length })).toBe('block');
  });
});

describe('confirmedEmpty is not a filter failure', () => {
  it('does not retry a store that positively reported no results', async () => {
    // Found on the first live run: ATU-Toys has three legitimately-empty
    // categories. Retrying them costs a page load per run forever, and makes
    // "the retry fired" meaningless as a signal because it would fire constantly
    // and never find anything.
    process.env.SCRAPER_REQUEST_FILTER = 'assets';
    const calls = [];
    const fakeFetch = async (_s, _b, _fn, mode) => {
      calls.push(mode);
      return { raw: [], status: 200, challenged: false, confirmedEmpty: true };
    };
    const out = await fetchWithFilterFallback(store, null, null, fakeFetch);
    expect(calls).toEqual(['assets']);
    expect(out.raw).toHaveLength(0);
    // Still classifies success via confirmedEmpty — not block.
    expect(classifyOutcome({ status: 200, rawCount: 0, confirmedEmpty: true })).toBe('success');
  });
});

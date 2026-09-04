/**
 * The push send path, tested where it can be: the pure decisions.
 *
 * The delivery itself needs a real push service and a real device, so what is
 * asserted here is everything that decides WHETHER and WHAT to send — the gate
 * that stops a laptop buzzing strangers, the fan-out that decides how many times
 * a phone vibrates, and the failure classification that decides whether a
 * subscriber is deleted or retried. Those are the parts where being wrong is
 * expensive and silent.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPushPayload,
  classifyPushFailure,
  matchProductsToSubscriptions,
  resolvePushChannel,
} from './push.js';

const product = (over = {}) => ({
  title: 'Elite Trainer Box',
  store_name: 'RedGoblin',
  price: 249,
  game: 'pokemon',
  url: 'https://example.ro/etb',
  ...over,
});

const sub = (games, over = {}) => ({
  id: `sub-${games.join('-')}`,
  endpoint: `https://web.push.apple.com/${games.join('')}`,
  p256dh: 'k',
  auth: 'a',
  games,
  failure_count: 0,
  ...over,
});

describe('resolvePushChannel — the local-run hard gate', () => {
  it('refuses to send live from a laptop even when PUSH_MODE=live', () => {
    // The whole point. A stray `export PUSH_MODE=live` or a copied .env must not
    // be able to buzz real strangers' phones from a dev machine.
    const channel = resolvePushChannel({
      PUSH_MODE: 'live',
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      // GITHUB_ACTIONS deliberately unset.
    });
    expect(channel).toBeNull();
  });

  it('sends live on the GitHub runner', () => {
    const channel = resolvePushChannel({
      PUSH_MODE: 'live',
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      GITHUB_ACTIONS: 'true',
    });
    expect(channel).toMatchObject({ mode: 'live', publicKey: 'pub', privateKey: 'priv' });
  });

  it('honours ALLOW_LOCAL_PUSH as the deliberate escape hatch', () => {
    const channel = resolvePushChannel({
      PUSH_MODE: 'live',
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      ALLOW_LOCAL_PUSH: '1',
    });
    expect(channel?.mode).toBe('live');
  });

  it('defaults to dry when PUSH_MODE is unset', () => {
    expect(resolvePushChannel({}).mode).toBe('dry');
  });

  it('falls back to dry on a typo rather than sending', () => {
    // Mirrors resolveAlertChannel's allowlist reasoning: an unrecognised value
    // must never send mail — or push — that a correct value would not have sent.
    expect(resolvePushChannel({ PUSH_MODE: 'liev', GITHUB_ACTIONS: 'true' }).mode).toBe('dry');
  });

  it('refuses live without VAPID keys instead of throwing mid-sweep', () => {
    expect(resolvePushChannel({ PUSH_MODE: 'live', GITHUB_ACTIONS: 'true' })).toBeNull();
  });

  it('dry mode does NOT need keys, so a dry run never looks broken', () => {
    expect(resolvePushChannel({ PUSH_MODE: 'dry' })).toMatchObject({ mode: 'dry' });
  });
});

describe('matchProductsToSubscriptions', () => {
  it('sends a device ONE notification covering all its games, not one per game', () => {
    // The regression this exists for: the naive nested loop buzzes this phone
    // twice for a single sweep.
    const both = sub(['pokemon', 'magic']);
    const matches = matchProductsToSubscriptions(
      [both],
      [product({ game: 'pokemon' }), product({ game: 'magic', title: 'Bloomburrow Bundle' })],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].products).toHaveLength(2);
    expect(matches[0].games).toEqual(['pokemon', 'magic']);
  });

  it('gives each device only the games it asked for', () => {
    const matches = matchProductsToSubscriptions(
      [sub(['pokemon']), sub(['magic'])],
      [product({ game: 'pokemon' }), product({ game: 'magic', title: 'Bloomburrow Bundle' })],
    );
    expect(matches).toHaveLength(2);
    expect(matches[0].products.map((p) => p.game)).toEqual(['pokemon']);
    expect(matches[1].products.map((p) => p.game)).toEqual(['magic']);
  });

  it('skips devices with no matching product rather than sending an empty alert', () => {
    const matches = matchProductsToSubscriptions([sub(['lorcana'])], [product({ game: 'pokemon' })]);
    expect(matches).toEqual([]);
  });

  it('treats a product with no game as pokemon, matching the column default', () => {
    // products.game is NOT NULL DEFAULT 'pokemon' (migration 023), but the row
    // reaches here through JS where undefined is possible.
    const matches = matchProductsToSubscriptions([sub(['pokemon'])], [product({ game: undefined })]);
    expect(matches).toHaveLength(1);
  });

  it('sends nothing when there are no subscriptions', () => {
    expect(matchProductsToSubscriptions([], [product()])).toEqual([]);
  });
});

describe('buildPushPayload', () => {
  it('names the game and deep-links to its filter when only one restocked', () => {
    const payload = buildPushPayload([product()], ['pokemon']);
    expect(payload.title).toBe('Pokémon back in stock');
    expect(payload.url).toBe('/view?game=pokemon');
    expect(payload.body).toContain('Elite Trainer Box');
    expect(payload.body).toContain('RedGoblin');
    expect(payload.body).toContain('249.00 RON');
  });

  it('counts and drops the filter when several games restocked', () => {
    // A ?game= filter naming one of two games would HIDE the other, so the
    // multi-game case must link to the unfiltered log.
    const payload = buildPushPayload(
      [product({ game: 'pokemon' }), product({ game: 'magic' })],
      ['pokemon', 'magic'],
    );
    expect(payload.title).toBe('2 TCG products back in stock');
    expect(payload.url).toBe('/view');
    expect(payload.body).toContain('and 1 more');
  });

  it('truncates a long title so the payload stays well inside the 4KB cap', () => {
    const payload = buildPushPayload([product({ title: 'X'.repeat(500) })], ['pokemon']);
    expect(payload.body.length).toBeLessThan(140);
    expect(JSON.stringify(payload).length).toBeLessThan(4096);
  });

  it('omits the price rather than printing null when there is none', () => {
    const payload = buildPushPayload([product({ price: null })], ['pokemon']);
    expect(payload.body).not.toContain('null');
    expect(payload.body).not.toContain('RON');
  });

  it('uses the singular title for exactly one product', () => {
    expect(buildPushPayload([product()], ['pokemon']).title).not.toMatch(/^1 /);
  });
});

describe('classifyPushFailure', () => {
  it('prunes a gone endpoint', () => {
    // The only way to learn a device is gone is to send to it, so pruning has to
    // happen here or dead rows accumulate forever.
    expect(classifyPushFailure(410)).toBe('prune');
    expect(classifyPushFailure(404)).toBe('prune');
  });

  it('KEEPS a subscriber through a transient push-service failure', () => {
    // Deleting on a 500 would be unrecoverable: the row cannot be recreated
    // without the user opting in again, and they would never know to.
    expect(classifyPushFailure(500)).toBe('keep');
    expect(classifyPushFailure(503)).toBe('keep');
    expect(classifyPushFailure(429)).toBe('keep');
    expect(classifyPushFailure(undefined)).toBe('keep');
  });
});

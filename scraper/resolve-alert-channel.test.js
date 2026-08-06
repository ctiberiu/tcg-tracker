/**
 * resolveAlertChannel — the local-run hard gate.
 *
 * Ported from scraper/verify-alert-channel.mjs, which was committed as a plain
 * node script because there was no node-environment runner. It caught a live
 * defect on its first run: the gate triggered on `mode !== 'dry'`, so a MISSPELLED
 * ALERT_MODE fired it and emailed the operator, where the correctly-spelled value
 * would have sent nothing — a typo causing a send. Three reviewers had read that
 * gate and none of us considered a malformed value; the assertion caught it
 * because it enumerated the cases instead of reasoning about them.
 *
 * Runs fully offline: Supabase is stubbed, and the stub records whether the
 * subscriber lookup was reached at all — which is the property that actually
 * matters. Containment must be structural, not a swapped recipient list.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveAlertChannel } from './scraper.js';

let subscribersQueried = false;

const supabaseStub = {
  from() {
    subscribersQueried = true;
    return {
      select: () => ({
        eq: () => Promise.resolve({ data: [{ email: 'subscriber@example.com' }], error: null }),
      }),
    };
  },
};

const FULL_ENV = {
  GMAIL_USER: 'ops@gmail.com',
  GMAIL_APP_PASSWORD: 'pw',
  ALERT_EMAIL_TO: 'me@example.com',
  ZEPTOMAIL_TOKEN: 'zt',
  ALERT_FROM: 'PackRadar <signals@packradar.info>',
};

const ENV_KEYS = [
  'GITHUB_ACTIONS', 'ALLOW_LOCAL_EMAIL', 'ALERT_MODE', 'GMAIL_USER',
  'GMAIL_APP_PASSWORD', 'ALERT_EMAIL_TO', 'ZEPTOMAIL_TOKEN', 'ALERT_FROM',
];

/** Resolve a channel under an exact environment, with logging silenced. */
async function resolve(env) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  subscribersQueried = false;
  return resolveAlertChannel(supabaseStub);
}

const usesZeptoMail = (channel) => Boolean(channel?.transporter?.options?.host?.includes('zeptomail'));

/**
 * `mode` is the single source of truth for real-vs-test. There is deliberately no
 * stored flag: a `markNotified` field lived here briefly after products.is_notified
 * was dropped, read by nothing, which is how that column became a trap to begin
 * with. Derive it instead.
 */
const REAL_SEND_MODES = new Set(['live', 'gmail']);
const isRealSend = (mode) => REAL_SEND_MODES.has(mode);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('local-run hard gate', () => {
  it('overrides live, the dangerous case', async () => {
    const channel = await resolve({ ...FULL_ENV, ALERT_MODE: 'live' });

    expect(channel.mode).toBe('local');
    expect(usesZeptoMail(channel)).toBe(false);
    expect(channel.from).not.toContain('packradar.info');
    expect(channel.recipients).toEqual(['me@example.com']);
    expect(channel.subjectPrefix).toBe('[local] ');
    expect(isRealSend(channel.mode)).toBe(false);
    // The property that matters: containment is structural, not a swapped list.
    expect(subscribersQueried).toBe(false);
  });

  it('overrides gmail', async () => {
    const channel = await resolve({ ...FULL_ENV, ALERT_MODE: 'gmail' });
    expect(channel.mode).toBe('local');
    expect(subscribersQueried).toBe(false);
  });

  it('overrides redirect', async () => {
    const channel = await resolve({ ...FULL_ENV, ALERT_MODE: 'redirect' });
    expect(channel.mode).toBe('local');
    expect(usesZeptoMail(channel)).toBe(false);
  });
});

describe('fails closed when local config is missing', () => {
  it('sends nothing without ALERT_EMAIL_TO', async () => {
    expect(await resolve({ ...FULL_ENV, ALERT_MODE: 'live', ALERT_EMAIL_TO: '' })).toBeNull();
  });

  it('sends nothing without Gmail credentials, and does not fall back to another transport', async () => {
    expect(
      await resolve({ ...FULL_ENV, ALERT_MODE: 'live', GMAIL_USER: '', GMAIL_APP_PASSWORD: '' }),
    ).toBeNull();
  });
});

describe('Actions runs are unaffected', () => {
  it('live still reaches the real audience over ZeptoMail', async () => {
    const channel = await resolve({ ...FULL_ENV, ALERT_MODE: 'live', GITHUB_ACTIONS: 'true' });

    expect(channel.mode).toBe('live');
    expect(usesZeptoMail(channel)).toBe(true);
    expect(channel.from).toContain('packradar.info');
    expect(isRealSend(channel.mode)).toBe(true);
    expect(subscribersQueried).toBe(true);
  });

  it('redirect keeps the real transport and From, because it rehearses production', async () => {
    const channel = await resolve({ ...FULL_ENV, ALERT_MODE: 'redirect', GITHUB_ACTIONS: 'true' });

    expect(channel.mode).toBe('redirect');
    expect(usesZeptoMail(channel)).toBe(true);
    expect(channel.from).toContain('packradar.info');
    // Rehearsal, not a real send: it goes to the operator, not to subscribers.
    expect(channel.recipients).toEqual(['me@example.com']);
  });

  it('ALLOW_LOCAL_EMAIL restores the real path from a laptop', async () => {
    const channel = await resolve({ ...FULL_ENV, ALERT_MODE: 'live', ALLOW_LOCAL_EMAIL: '1' });
    expect(channel.mode).toBe('live');
    expect(usesZeptoMail(channel)).toBe(true);
  });
});

describe('dry stays inert', () => {
  it('is not overridden, because the gate must never CAUSE a send', async () => {
    const channel = await resolve({ ...FULL_ENV, ALERT_MODE: 'dry' });
    expect(channel.mode).toBe('dry');
    expect(channel.subjectPrefix).toBeUndefined();
  });

  // LOAD-BEARING, and the reason this assertion exists rather than a comment.
  // `dry` carries the REAL subscriber list in `recipients` so it can log who it
  // would have reached — that is the mode's whole diagnostic value and cannot be
  // stripped. What makes those addresses unreachable is `transporter: null`, not
  // the early return in sendAlerts. The realistic regression is not "someone
  // deletes the early return" but "someone gives dry a real transporter" —
  // previewing rendering against live SMTP, or folding the channel constructors
  // into one shared builder that populates `transporter` uniformly. That fails
  // OPEN, and would sail past a test that only checked the early return.
  it('has no transporter, so its recipients are structurally unreachable', async () => {
    const channel = await resolve({ ...FULL_ENV, ALERT_MODE: 'dry' });
    expect(channel.transporter).toBeNull();
    expect(isRealSend(channel.mode)).toBe(false);
  });

  it('falls back to dry on an unrecognised mode, rather than to a sending mode', async () => {
    // The defect this file caught on its first run: `mode !== 'dry'` treated a
    // typo as a sending mode and fired the local gate.
    const channel = await resolve({ ...FULL_ENV, ALERT_MODE: 'lve' });
    expect(channel.mode).toBe('dry');
    expect(channel.transporter).toBeNull();
  });
});

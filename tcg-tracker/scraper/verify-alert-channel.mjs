/**
 * Assertions for resolveAlertChannel's local-run hard gate.
 *
 *   node scraper/verify-alert-channel.mjs      (exits non-zero on failure)
 *
 * WHY THIS IS A SCRIPT AND NOT A TEST FILE: `vite.config.ts` defines only a
 * browser-mode Storybook Vitest project and `scraper/package.json` has no vitest,
 * so there is currently nowhere for a node-environment `.test.js` to live (see
 * docs/testing.md). These are ordinary assertions and should be moved into a real
 * test file the moment a node project exists — nothing here depends on being a
 * standalone script.
 *
 * It runs fully offline: Supabase is stubbed, and the stub records whether the
 * subscriber lookup was reached at all, which is the property that actually
 * matters. No network, no credentials, no mail.
 */

import { resolveAlertChannel } from './scraper.js';

let subscribersQueried = false;
const supabaseStub = {
  from() {
    subscribersQueried = true;
    return {
      select() {
        return {
          eq() {
            return Promise.resolve({ data: [{ email: 'subscriber@example.com' }], error: null });
          },
        };
      },
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

async function resolve(env) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  subscribersQueried = false;
  const saved = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = () => {};
  try {
    return await resolveAlertChannel(supabaseStub);
  } finally {
    [console.log, console.warn, console.error] = saved;
  }
}

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ''}`);
  }
}

const isZepto = (ch) => ch?.transporter?.options?.host?.includes('zeptomail');

console.log('\nLocal-run hard gate');
{
  const ch = await resolve({ ...FULL_ENV, ALERT_MODE: 'live' });
  check('local + live is overridden to the local channel', ch?.mode === 'local');
  check('  never ZeptoMail', !isZepto(ch));
  check('  never the official From', !String(ch?.from).includes('packradar.info'));
  check('  operator address only', ch?.recipients.join() === 'me@example.com');
  check('  subject marked [local]', ch?.subjectPrefix === '[local] ');
  check('  does not mark products notified', ch?.markNotified === false);
  // The property that matters: containment is structural, not a swapped list.
  check('  subscribers table never queried', subscribersQueried === false);
}
{
  const ch = await resolve({ ...FULL_ENV, ALERT_MODE: 'gmail' });
  check('local + gmail is overridden', ch?.mode === 'local' && !subscribersQueried);
}
{
  const ch = await resolve({ ...FULL_ENV, ALERT_MODE: 'redirect' });
  check('local + redirect is overridden', ch?.mode === 'local' && !isZepto(ch));
}

console.log('\nFail-closed when local config is missing');
check('no ALERT_EMAIL_TO -> sends nothing',
  (await resolve({ ...FULL_ENV, ALERT_MODE: 'live', ALERT_EMAIL_TO: '' })) === null);
check('no Gmail credentials -> sends nothing, no fallback transport',
  (await resolve({ ...FULL_ENV, ALERT_MODE: 'live', GMAIL_USER: '', GMAIL_APP_PASSWORD: '' })) === null);

console.log('\nActions runs are unaffected');
{
  const ch = await resolve({ ...FULL_ENV, ALERT_MODE: 'live', GITHUB_ACTIONS: 'true' });
  check('actions + live still uses ZeptoMail and the real audience',
    ch?.mode === 'live' && isZepto(ch) && ch.markNotified === true && subscribersQueried);
  check('  and the official From', String(ch?.from).includes('packradar.info'));
}
{
  const ch = await resolve({ ...FULL_ENV, ALERT_MODE: 'redirect', GITHUB_ACTIONS: 'true' });
  check('actions + redirect keeps the real transport and From (rehearses production)',
    ch?.mode === 'redirect' && isZepto(ch) && String(ch.from).includes('packradar.info'));
}
{
  const ch = await resolve({ ...FULL_ENV, ALERT_MODE: 'live', ALLOW_LOCAL_EMAIL: '1' });
  check('ALLOW_LOCAL_EMAIL=1 restores the real path from a laptop',
    ch?.mode === 'live' && isZepto(ch));
}

console.log('\ndry stays inert locally');
{
  const ch = await resolve({ ...FULL_ENV, ALERT_MODE: 'dry' });
  check('local + dry is NOT overridden', ch?.mode === 'dry');
  check('  and is not marked [local] (nothing is sent to mark)', !ch?.subjectPrefix);
  // LOAD-BEARING. `dry` carries the real subscriber list in `recipients` so it can
  // log who it WOULD have reached — that is the mode's whole diagnostic value and
  // cannot be stripped. What makes those addresses unreachable is `transporter:
  // null`: even if sendAlerts' early return were removed, the send would throw
  // rather than deliver. That is a value, not a control-flow detail, and this
  // assertion is what stops a restructure quietly turning it into a real send.
  check('  dry has NO transporter, so its recipients are structurally unreachable',
    ch?.transporter == null, `transporter=${ch?.transporter}`);
}
{
  const ch = await resolve({ ...FULL_ENV, ALERT_MODE: 'nonsense-value' });
  check('an unrecognised mode falls back to dry, not to a sending mode',
    ch?.mode === 'dry' && ch?.transporter == null);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failed:\n  ' + failures.join('\n  '));
  process.exit(1);
}

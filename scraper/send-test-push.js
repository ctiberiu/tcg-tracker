/**
 * Send a test push notification to real subscribed devices.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Delivery cannot be verified anywhere except a real device, and the VAPID
 * private key deliberately lives only in GitHub secrets (write-only) — so
 * nobody, including the operator, can hand-send from a laptop. Without this,
 * the only way to confirm the pipeline works is to wait for a genuine restock
 * and hope you are looking at your phone.
 *
 * It exercises the SHIPPED code path: buildPushPayload from push.js is the same
 * function a real restock uses, so a notification arriving here proves payload
 * shape, VAPID signing, encryption and the sw.js handler — not a parallel test
 * implementation that could pass while production fails.
 *
 * ── Why it is manual-only, and narrow by default ─────────────────────────────
 * These are real strangers' lock screens. A test message is unsolicited by
 * definition, so the blast radius is capped in two ways:
 *   - it runs ONLY from workflow_dispatch. There is no cron, no push trigger,
 *     and it is never called by scraper.js.
 *   - it targets the NEWEST subscription by default — in practice the operator's
 *     own device, the one that just subscribed to test. Reaching everyone
 *     requires TARGET=all AND typing the confirmation phrase, because a
 *     mistyped dropdown should not be able to buzz the whole audience.
 */

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { fileURLToPath } from 'node:url';
import { buildPushPayload, classifyPushFailure } from './push.js';

/** Typing this exactly is what unlocks a send to every subscriber. */
const CONFIRM_PHRASE = 'yes send to everyone';

function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_KEY');
  return createClient(url, key);
}

/**
 * The product this pretends restocked.
 *
 * Deliberately labelled as a test in the title. An alert that is
 * indistinguishable from a real one teaches people to act on it — someone would
 * tap through expecting stock and find a product that never restocked.
 */
function testProduct() {
  return {
    title: 'Test notification - no product restocked',
    store_name: 'PackRadar',
    price: null,
    game: 'pokemon',
    url: 'https://packradar.info/view',
  };
}

async function main() {
  const supabase = initSupabase();

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:alerts@packradar.info';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — cannot sign a push');
  }

  const target = (process.env.TARGET ?? 'newest').toLowerCase();
  const confirm = (process.env.CONFIRM ?? '').trim().toLowerCase();

  const { data: rows, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, games, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load subscriptions: ${error.message}`);

  if (!rows || rows.length === 0) {
    console.log('No subscriptions in the table — nothing to send to.');
    return;
  }

  let recipients;
  if (target === 'all') {
    if (confirm !== CONFIRM_PHRASE) {
      console.error(
        `TARGET=all requires CONFIRM="${CONFIRM_PHRASE}" (got "${confirm || '(empty)'}").\n` +
          `Refusing to notify ${rows.length} device(s).`,
      );
      process.exitCode = 1;
      return;
    }
    recipients = rows;
  } else {
    // Newest first from the query above, so [0] is the most recent subscriber.
    recipients = rows.slice(0, 1);
  }

  console.log(
    `${rows.length} subscription(s) in the table; sending to ${recipients.length} [target=${target}]`,
  );

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = buildPushPayload([testProduct()], ['pokemon']);
  console.log(`payload: ${JSON.stringify(payload)}`);

  let sent = 0;
  let pruned = 0;
  let failed = 0;

  for (const sub of recipients) {
    const tail = sub.endpoint.slice(-12);
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      sent++;
      console.log(`  ACCEPTED  ...${tail}  (subscribed ${sub.created_at?.slice(0, 19)})`);
      await supabase
        .from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString(), failure_count: 0, last_error: null })
        .eq('id', sub.id);
    } catch (err) {
      const status = err?.statusCode;
      // Same prune/keep rule as the real send path — a test run should leave the
      // table in the state a real send would, not accumulate known-dead rows.
      if (classifyPushFailure(status) === 'prune') {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        pruned++;
        console.log(`  DEAD ${status} — row deleted  ...${tail}`);
      } else {
        failed++;
        console.log(`  FAILED ${status ?? '?'}  ...${tail}  ${String(err?.message ?? '').slice(0, 120)}`);
      }
    }
  }

  console.log(`\nAccepted by the push service: ${sent}; dead endpoints pruned: ${pruned}; failed: ${failed}`);
  if (sent > 0) {
    // "Accepted" is genuinely all that can be known from here. Web push gives no
    // delivery receipt, so a 201 means the push service took it, not that a
    // phone displayed it.
    console.log('NOTE: accepted means the push service queued it. There is no delivery receipt.');
  }
  if (sent === 0 && recipients.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

/**
 * Web Push delivery for restock alerts.
 *
 * ── Relationship to the email path ───────────────────────────────────────────
 * This is a SECOND channel, not a replacement. sendAlerts() and sendPushAlerts()
 * are both driven by the same `alertProducts` array from syncToSupabase, so they
 * agree by construction on what counts as alertable — new-and-in-stock, or
 * out-of-stock -> in-stock. Neither decides that for itself, and the anti-repeat
 * property (a product alerts on the TRANSITION, so it cannot alert twice) is
 * inherited rather than reimplemented here.
 *
 * ── Why PUSH_MODE is its own variable and not ALERT_MODE ─────────────────────
 * The obvious move is to reuse ALERT_MODE, and it is wrong. Those two switches
 * govern resources with completely different costs: ZeptoMail bills per credit,
 * push is free. The intended steady state is push LIVE while email stays dry or
 * redirect — that is the entire point of adding this channel — and one shared
 * variable makes that state unreachable. They are deliberately independent.
 *
 * ── The local-run hard gate is NOT independent, and is copied on purpose ─────
 * resolveAlertChannel()'s GITHUB_ACTIONS gate exists because a value like
 * ALERT_MODE can be inherited from a stray shell export or a copied .env, and
 * "a safety property that depends on remembering to set something is not a
 * safety property". Every word of that applies here and the consequence is
 * arguably worse: an email to a subscriber is recoverable and apologisable, a
 * push notification is an unsolicited buzz on a stranger's phone, at whatever
 * hour the laptop happened to run. Same gate, same fail-closed direction.
 */

import webpush from 'web-push';
import { fileURLToPath } from 'node:url';

/** PostgREST caps a plain select at 1000 rows and does NOT error when it truncates. */
const PAGE_SIZE = 1000;

/**
 * Display names for notification copy.
 *
 * SOURCE OF TRUTH is `GAMES` in src/components/packradar/tokens.ts. Duplicated
 * here for the same reason storeBaseName() is duplicated in digest.js: scraper/
 * is a separate package of plain ESM and cannot import a .ts module out of src/.
 * Title Case rather than the uppercase badge labels, because this text lands on
 * a lock screen as a sentence, not as a badge.
 */
const GAME_LABELS = {
  pokemon: 'Pokémon',
  magic: 'Magic',
  lorcana: 'Lorcana',
  yugioh: 'Yu-Gi-Oh!',
  digimon: 'Digimon',
  one_piece: 'One Piece',
  duel_masters: 'Duel Masters',
  dragon_ball_super: 'Dragon Ball Super',
  weiss_schwarz: 'Weiss Schwarz',
  riftbound: 'Riftbound',
};

/**
 * Apple caps an encrypted push payload at 4KB and REJECTS anything larger, so an
 * over-long product title would silently cost a device its notification. The body
 * is truncated well inside that: this is a lock-screen preview, and iOS stops
 * rendering long before the transport limit.
 */
const MAX_BODY_CHARS = 120;

/**
 * Which HTTP statuses mean "this subscription is dead, delete the row".
 *
 * 404 and 410 are the push services' way of saying the endpoint no longer exists
 * — the user cleared site data, deleted the web app, or revoked permission.
 * There is no way to learn this other than by sending, which is why pruning is a
 * side effect of delivery rather than a maintenance job.
 *
 * Everything else is explicitly NOT terminal. A 500 or a timeout from FCM is the
 * push service having a bad minute; deleting a live subscriber over it would be
 * unrecoverable, since the row cannot be recreated without the user opting in
 * again. Transient failures increment failure_count and are left alone.
 */
export function classifyPushFailure(statusCode) {
  if (statusCode === 404 || statusCode === 410) return 'prune';
  return 'keep';
}

/**
 * Fan alertable products out to the devices that asked for them.
 *
 * ONE notification per device, never one per game. A device subscribed to both
 * Pokémon and Magic, on a sweep that restocks both, must buzz once — the naive
 * loop (for each game, for each subscriber) buzzes it twice, and the phone shows
 * two banners for one event. The grouping is therefore by SUBSCRIPTION with the
 * games folded in, not by game with subscriptions folded in.
 *
 * Returns [{ subscription, products, games }], skipping devices with no match.
 */
export function matchProductsToSubscriptions(subscriptions, alertProducts) {
  const matches = [];

  for (const subscription of subscriptions) {
    const wanted = new Set(subscription.games ?? []);
    const products = alertProducts.filter((p) => wanted.has(p.game ?? 'pokemon'));
    if (products.length === 0) continue;

    // Preserve the order games appear in the products, so the title names the
    // game that actually restocked first rather than an arbitrary set ordering.
    const games = [];
    for (const p of products) {
      const g = p.game ?? 'pokemon';
      if (!games.includes(g)) games.push(g);
    }
    matches.push({ subscription, products, games });
  }

  return matches;
}

/**
 * Build the notification for one device.
 *
 * Deliberately does NOT list every product. The payload has a hard size limit,
 * a lock screen shows two lines, and a person who wants the full list is one tap
 * from it — so the notification carries a count, one concrete example to make it
 * feel specific, and a deep link.
 */
export function buildPushPayload(products, games) {
  const count = products.length;
  const label = games.length === 1 ? (GAME_LABELS[games[0]] ?? games[0]) : 'TCG';

  const title =
    count === 1
      ? `${label} back in stock`
      : `${count} ${label} products back in stock`;

  const first = products[0];
  const price = typeof first.price === 'number' ? ` · ${first.price.toFixed(2)} RON` : '';
  const storeSuffix = first.store_name ? ` — ${first.store_name}` : '';
  let body = `${first.title ?? 'Product'}${storeSuffix}${price}`;
  if (body.length > MAX_BODY_CHARS) body = `${body.slice(0, MAX_BODY_CHARS - 1)}…`;
  if (count > 1) body += `\nand ${count - 1} more`;

  // Deep link to the filtered log when exactly one game restocked; otherwise the
  // unfiltered log, since a filter naming one of several games would hide the rest.
  // SignalLogPage reads ?game= (src/pages/SignalLogPage.tsx).
  const url = games.length === 1 ? `/view?game=${games[0]}` : '/view';

  return {
    title,
    body,
    url,
    // One tag per device-sweep so consecutive alerts collapse into a single
    // lock-screen entry instead of stacking one banner per sweep.
    tag: 'packradar-stock',
  };
}

/**
 * Decide whether this run may push, mirroring resolveAlertChannel()'s structure.
 *
 * Returns null when nothing should be sent. Every refusal is logged, because a
 * push channel that silently does nothing is indistinguishable from one that is
 * broken.
 */
export function resolvePushChannel(env = process.env) {
  const mode = (env.PUSH_MODE ?? 'dry').toLowerCase();
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  // mailto: contact the push services use to reach the operator about abuse.
  // web-push refuses to sign without it.
  const subject = env.VAPID_SUBJECT ?? 'mailto:alerts@packradar.info';

  // ── HARD GATE ──────────────────────────────────────────────────────────────
  // Runs before mode handling and overrides `live`. Keys off the RUNTIME, not
  // configuration: GITHUB_ACTIONS is set by the runner and absent everywhere
  // else, so FORGETTING IT FAILS CLOSED. ALLOW_LOCAL_PUSH=1 is the deliberate
  // opt-in for verifying the real path from a laptop.
  //
  // Unlike the email gate there is no "send to yourself instead" fallback, and
  // there should not be: the email gate can narrow to ALERT_EMAIL_TO because an
  // address is a thing the operator owns. There is no equivalent for push — the
  // operator's own device is just another row in the same table, indistinguishable
  // from a stranger's. Narrowing is not available, so the only safe local
  // behaviour is to send nothing.
  const isLocalRun = !env.GITHUB_ACTIONS && !env.ALLOW_LOCAL_PUSH;
  if (isLocalRun && mode === 'live') {
    console.warn(
      '  🔒 LOCAL RUN (GITHUB_ACTIONS unset) — PUSH_MODE=live OVERRIDDEN, sending nothing. ' +
        'Real devices are unreachable from here. Set ALLOW_LOCAL_PUSH=1 to override deliberately.',
    );
    return null;
  }

  if (mode !== 'live') {
    if (mode !== 'dry') {
      console.warn(`  Unknown PUSH_MODE="${mode}" — falling back to dry (nothing will be sent)`);
    }
    return { mode: 'dry', publicKey: null, privateKey: null, subject: null };
  }

  if (!publicKey || !privateKey) {
    console.error('  PUSH_MODE=live but VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — refusing to send');
    return null;
  }

  return { mode: 'live', publicKey, privateKey, subject };
}

/** Fetch every subscription, paginating past PostgREST's 1000-row cap. */
async function fetchAllSubscriptions(supabase) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, games, failure_count')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

/**
 * Send push notifications for this sweep's alertable products.
 *
 * Never throws: a push failure must not fail the scrape or block the email path
 * that runs alongside it. Every outcome is logged instead.
 */
export async function sendPushAlerts(supabase, alertProducts) {
  if (alertProducts.length === 0) return { sent: 0, pruned: 0, failed: 0 };

  const channel = resolvePushChannel();
  if (!channel) return { sent: 0, pruned: 0, failed: 0 };

  let subscriptions;
  try {
    subscriptions = await fetchAllSubscriptions(supabase);
  } catch (err) {
    console.error(`  Failed to load push subscriptions: ${err.message}`);
    return { sent: 0, pruned: 0, failed: 0 };
  }

  const matches = matchProductsToSubscriptions(subscriptions, alertProducts);

  if (channel.mode === 'dry') {
    console.log(
      `  PUSH_MODE=dry — would notify ${matches.length} of ${subscriptions.length} device(s); nothing sent`,
    );
    for (const { products, games } of matches.slice(0, 3)) {
      const payload = buildPushPayload(products, games);
      console.log(`    "${payload.title}" -> ${payload.url}`);
    }
    return { sent: 0, pruned: 0, failed: 0 };
  }

  webpush.setVapidDetails(channel.subject, channel.publicKey, channel.privateKey);

  let sent = 0;
  let pruned = 0;
  let failed = 0;

  for (const { subscription, products, games } of matches) {
    const payload = buildPushPayload(products, games);
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        // Hold for at most an hour. A restock alert delivered to a phone that
        // was off for a day is worse than useless — the product is long gone and
        // the notification is a false lead. Expiring beats queueing here.
        { TTL: 3600 },
      );
      sent++;
      await supabase
        .from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString(), failure_count: 0, last_error: null })
        .eq('id', subscription.id);
    } catch (err) {
      const status = err?.statusCode;
      if (classifyPushFailure(status) === 'prune') {
        // Terminal. The endpoint is gone and will never work again, so the row
        // is deleted rather than left to fail on every sweep forever.
        await supabase.from('push_subscriptions').delete().eq('id', subscription.id);
        pruned++;
      } else {
        failed++;
        await supabase
          .from('push_subscriptions')
          .update({
            failure_count: (subscription.failure_count ?? 0) + 1,
            last_error: String(err?.message ?? status ?? 'unknown').slice(0, 500),
          })
          .eq('id', subscription.id);
      }
    }
  }

  console.log(
    `  Push: ${sent} sent, ${pruned} pruned (dead endpoints), ${failed} failed [mode=${channel.mode}]`,
  );
  return { sent, pruned, failed };
}

// Allows `node push.js` to print the resolved channel without sending, for
// checking secrets are wired up on the runner.
async function main() {
  const channel = resolvePushChannel();
  console.log(channel ? `PUSH_MODE resolves to: ${channel.mode}` : 'Push is disabled for this run.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

export { GAME_LABELS, MAX_BODY_CHARS };

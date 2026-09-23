// Telling "the database was unreachable" apart from "this code is broken".
//
// Both arrive at the same catch block as an Error, and until now both exited 1.
// A failed workflow run emails the operator, so every Supabase outage produced a
// failure email every two minutes from BOTH workflows — on 2026-09-22 that ran
// for over two hours, and again on 2026-09-23. None of those emails were
// actionable: nothing in this repo was broken, and nothing in this repo could
// fix it.
//
// The fix is not to silence failures. It is to stop calling someone else's
// outage a failure of ours. A scrape that could not reach the database has not
// failed — it has nothing to report. A scrape that reached the database and
// then hit a missing column, a bad key or a ReferenceError HAS failed, and must
// stay loud, because only those are ours to fix.
//
// So this module answers one question, conservatively: is this error the
// database being unavailable? Anything it cannot positively identify as an
// outage is treated as a real fault — the safe direction, because the cost of
// guessing wrong that way is an email, and the cost of guessing wrong the other
// way is silence about a genuine bug.

/**
 * SQLSTATEs where the server could not serve the statement, regardless of what
 * the statement said. 57014 is the one this incident actually produced:
 * "canceling statement due to statement timeout", seen in run 35704971623 the
 * moment Supabase stopped responding.
 */
const UNAVAILABLE_SQLSTATES = new Set([
  '57014', // query_canceled — statement timeout
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now — server still starting
  '53300', // too_many_connections
  '53400', // configuration_limit_exceeded
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '08006', // connection_failure
]);

/**
 * SQLSTATEs that mean the database answered and the QUERY was wrong. These are
 * ours. Listed explicitly and checked first so no message pattern below can
 * ever launder a schema bug into an "outage" and stop the email.
 */
const REAL_FAULT_SQLSTATES = new Set([
  '42P01', // undefined_table
  '42703', // undefined_column
  '42501', // insufficient_privilege — an RLS/grant mistake, not an outage
  '22P02', // invalid_text_representation
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '23505', // unique_violation
]);

/**
 * PostgREST's own error codes are strings like "PGRST204". Every PGRST code is a
 * request the API understood and rejected — a missing column, an ambiguous
 * embed, a singular response with the wrong row count — so the whole prefix is
 * ours. An unreachable PostgREST does not answer with a PGRST code at all; it
 * times out, which is the case handled further down.
 */
const REAL_FAULT_CODE_PREFIX = 'PGRST';

/**
 * Node/undici socket-level codes. ENOTFOUND is NOT here — it lives in
 * REAL_FAULT_SYSCALL_CODES below. Merely leaving it out of this set was not
 * enough, and the test caught it: ENOTFOUND reaches us wrapped in an Error
 * whose message is "fetch failed", which the message patterns further down
 * match, so the wrapper was classified as an outage and a wrong SUPABASE_URL
 * would have exited 0 in silence. EAI_AGAIN (a TEMPORARY DNS failure) stays
 * here, for the opposite reason.
 */
const UNAVAILABLE_SYSCALL_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * Network-level codes that are configuration rather than weather. A hostname
 * that does not resolve, or a malformed URL, is a wrong SUPABASE_URL: no amount
 * of waiting fixes it, and a silent green run would hide it indefinitely. These
 * are checked in the ours-first pass so the "fetch failed" wrapper they travel
 * in cannot launder them into an outage.
 */
const REAL_FAULT_SYSCALL_CODES = new Set(['ENOTFOUND', 'ERR_INVALID_URL']);

/** HTTP statuses that mean "not right now", never "your request was wrong". */
const UNAVAILABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

/**
 * Last resort, and the reason it exists: the five database reads in scraper.js
 * used to build `new Error(\`...: ${error.message}\`)`, throwing the structured
 * PostgREST error away. dbError() below stops that, but an error can still
 * arrive as text only — from supabase-js internals, from fetch, or from an old
 * stack trace — so these patterns catch what the codes miss. Every one is a
 * string observed in this repo's own run logs.
 */
const UNAVAILABLE_MESSAGE_PATTERNS = [
  /upstream request timeout/i,             // fast lane, run 35705343616
  /canceling statement due to statement timeout/i, // main, run 35704971623
  /connection terminated/i,                // "Connection terminated due to connection timeout"
  /connection timeout/i,
  /timeout exceeded/i,
  /\bfetch failed\b/i,                     // undici's opaque network failure
  /socket hang up/i,
  /network (request )?failed/i,
  /gateway time-?out/i,
  /service unavailable/i,
  /too many connections/i,
  /server is (starting up|shutting down)/i,
  /terminating connection/i,
];

/**
 * Credential and authorisation problems. These reach us as 401/403 with prose
 * rather than a SQLSTATE, and they are emphatically ours: a revoked key or an
 * expired JWT needs a human, and staying quiet about it would hide the failure
 * mode most likely to look like an outage.
 */
const REAL_FAULT_MESSAGE_PATTERNS = [
  /invalid api key/i,
  /\bjwt\b/i,
  /unauthorized/i,
  /permission denied/i,
  /row-level security/i,
];

/** Walk `cause` so a wrapped error is judged on what actually went wrong. */
function chain(err) {
  const seen = new Set();
  const out = [];
  let cur = err;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = cur.cause;
  }
  return out;
}

function matchesAny(patterns, text) {
  return typeof text === 'string' && patterns.some((re) => re.test(text));
}

/**
 * True only when the error positively identifies the database as unreachable.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isDatabaseUnavailable(err) {
  const links = chain(err);
  if (links.length === 0) return false;

  // Ours-first. A single link anywhere in the chain naming a real fault settles
  // it, so an outage-shaped wrapper cannot hide a schema error underneath.
  for (const link of links) {
    const code = link.code;
    if (typeof code === 'string') {
      if (REAL_FAULT_SQLSTATES.has(code)) return false;
      if (REAL_FAULT_SYSCALL_CODES.has(code)) return false;
      if (code.startsWith(REAL_FAULT_CODE_PREFIX)) return false;
    }
    if (matchesAny(REAL_FAULT_MESSAGE_PATTERNS, link.message)) return false;
    if (link.status === 401 || link.status === 403) return false;
  }

  for (const link of links) {
    const code = link.code;
    if (typeof code === 'string') {
      if (UNAVAILABLE_SQLSTATES.has(code)) return true;
      if (UNAVAILABLE_SYSCALL_CODES.has(code)) return true;
    }
    if (UNAVAILABLE_STATUSES.has(link.status)) return true;
    if (matchesAny(UNAVAILABLE_MESSAGE_PATTERNS, link.message)) return true;
    // undici reports the real cause one level down with name 'AbortError' when a
    // request is cut short by a timeout rather than by us.
    if (link.name === 'AbortError' || link.name === 'TimeoutError') return true;
  }

  return false;
}

/**
 * Build the Error for a failed Supabase read WITHOUT discarding what Supabase
 * said. The old form — `new Error(\`prefix: ${error.message}\`)` — lost `code`,
 * `details` and `hint`, which left message matching as the only way to classify
 * an error at the catch site. Keeping the code is what lets a statement timeout
 * be recognised as 57014 rather than as a hopeful regex.
 *
 * @param {string} prefix human-readable context, e.g. "Failed to fetch stores"
 * @param {{message?: string, code?: string, details?: string, hint?: string, status?: number}} error
 * @returns {Error}
 */
export function dbError(prefix, error) {
  const message = error?.message ?? String(error);
  const err = new Error(`${prefix}: ${message}`);
  if (error?.code !== undefined) err.code = error.code;
  if (error?.details !== undefined) err.details = error.details;
  if (error?.hint !== undefined) err.hint = error.hint;
  if (error?.status !== undefined) err.status = error.status;
  if (error && typeof error === 'object') err.cause = error;
  return err;
}

/**
 * One line for the run log, and a GitHub annotation so a skipped run is visibly
 * marked in the Actions UI instead of silently green. `::warning::` is used
 * rather than `::error::` deliberately: an error annotation on a successful run
 * reads as a failure to anyone scanning the list, which is the confusion this
 * whole change exists to remove.
 *
 * @param {string} lane "Scraper" or "Fast lane"
 * @param {Error} err
 * @returns {string[]} lines to print
 */
export function databaseOutageLines(lane, err) {
  return [
    `  ${lane} skipped: the database was unreachable — ${err.message}`,
    '  Nothing was scraped or written. This is not a failure of this repo, so the',
    '  run exits 0 to avoid a failure email. A real bug would still exit 1.',
    `::warning::${lane} skipped: Supabase unreachable (${err.message})`,
  ];
}

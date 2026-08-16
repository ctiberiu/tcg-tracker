# Per-subscriber TCG filtering for alert emails

> Drafted 2026-08-12 by Epic Manager. Not yet a DevChain epic — the MCP
> connection was down. Create it on the board and delete this file.

**Operator request:** each subscriber receives alerts only for the games they
choose, managed from the admin UI with a dropdown like `/view`'s channel
filter, then an update button.

**This sends real email to 4 real people.** `ALERT_MODE` defaults to `gmail`.

## What exists today

    subscribers            id, email, is_active, created_at   <- no game column
    getRecipients          scraper.js:2993, returns email[] where is_active
    sendAlerts             builds ONE html, then `for (const email of recipients)`
    useSubscribers         select / insert{email} / delete    <- no update
    ManageEmails           add, remove, send-test             <- no per-row editing
    ChannelFilterDropdown  { channels, selected, onToggle, open, onOpenChange }

**The send loop is already per-recipient**, which is what makes this cheap. The
body just has to be built inside that loop rather than before it.

## The decision that matters most

**No selection means all games.** NULL or empty must behave exactly as today.
Four people are subscribed now and none has chosen anything; if empty meant
"nothing", all four silently stop receiving alerts and nobody finds out until
someone asks why they missed a restock. Assert it in a test — it is the one
failure here that is invisible when it happens.

## Work

1. **Migration 036.** Add the game selection. `text[]` is the obvious shape for
   a handful of rows; a join table is more normal but heavier. Either is fine,
   say which and why. **Must be replayable** — prove it by running twice. `033`
   failed on a retry and left a security fix half-applied while reporting
   failure. Constrain values against `GAMES` in `tokens.ts`; free text
   accumulates typos that match nothing, which looks identical to "no alerts".

2. **`getRecipients` returns email + games.** The `ALERT_EMAIL_TO` fallback
   below it, used when the table is empty, has no preference and must keep
   receiving everything.

3. **`sendAlerts` filters per recipient.** Three things easy to get wrong:
   - the subject count (`TCG Tracker: N Products In Stock`) must be *that
     recipient's* N, not the global one;
   - a recipient matching nothing this run must get **no email at all**, not an
     empty table;
   - the `ALERT_MODE=dry` log prints one line for all recipients today; it
     should show the per-recipient split, since that is the only cheap way to
     check this before it sends for real.

4. **`useSubscribers` gains an update**, **`ManageEmails` gains a
   `ChannelFilterDropdown` per row** plus an update button. Reuse the component
   as-is. Its `channels` prop wants `{ game, count }`; per-subscriber there is
   no meaningful count — decide what to pass and say why rather than inventing
   a number.

RLS: since `033` only admins can write `subscribers` (`USING (is_admin())`).
Operator-managed by design — **no policy change, do not add one.**

## Scope
- OUT: subscriber self-service, public signup, unsubscribe-preferences page.
  That is the accounts roadmap and carries its own RLS design.
- OUT: the `is_active` gap below — report, do not fix.

## Adjacent finding — report, do not fix
`is_active` is **read** by `getRecipients` and **rendered** at
`ManageEmails.tsx:124`, but **written by nothing**. There is no deactivate
control, only delete, so the "inactive" label is unreachable. Worth knowing
here: a per-game filter that empties someone's alerts looks exactly like the
deactivation nobody can currently perform.

## DoD
- [ ] A subscriber with no selection receives exactly what they receive today.
      Asserted in a test, and confirmed against the 4 live rows before merge.
- [ ] A subscriber with a selection receives only those games; subject count matches.
- [ ] A recipient matching nothing receives no email at all.
- [ ] The `ALERT_EMAIL_TO` fallback still receives everything.
- [ ] Migration runs twice cleanly; demonstrate it.
- [ ] Only games present in `GAMES` can be stored.
- [ ] The existing `ChannelFilterDropdown`, not a second one.
- [ ] Verified with `ALERT_MODE=dry` showing the per-recipient split first.
- [ ] `npm test` / `npm run build` pass; no new lint problems in changed files.
- [ ] Branch from `develop`. Epic Manager applies the migration after merge.

Where a case is ambiguous, prefer over-sending to under-sending.

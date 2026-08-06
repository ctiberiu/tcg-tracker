# TCG Restock Dashboard — Launch Blueprint (draft)

> Status: **draft for discussion** — pricing, naming, and timelines below are starting proposals, not decisions. The "Drilling the proposal" section at the end is deliberately critical; read it before committing to anything here.

## 0. What this is, in one sentence

A free dashboard that shows TCG restock/availability across Romanian retailers, with a paid email-alert tier — explicitly **not** a purchasing bot. The auto-buy capability (Snipe) stays private/personal and is not part of this product.

---

## 1. Positioning: escaping the "scalper tool" label

The core risk isn't the pricing model — it's the category people put you in the moment they see "restock alerts + paid tier." Two things put you in the "aggregator/tracker" bucket instead of the "scalper bot" bucket, and you already have both:

1. **No purchasing automation is exposed publicly.** The paid tier sells *information speed*, not *buying power*. This is the single biggest lever you have — say it explicitly, everywhere, unprompted: "We tell you it's back. We never buy it for you." Put that sentence on the homepage above the fold.
2. **The core product is free.** A tool that only works if you pay is read as "pay to compete." A tool that's free for everyone and *optionally* faster for payers reads as a convenience upsell, not a competitive edge sold to the highest bidder — much closer to how price trackers (CamelCamelCamel) or restock aggregators (NowInStock) are perceived than how sneaker/resale bots are perceived.

Where you can't fully escape it, and shouldn't pretend to: **paying for faster notification is still an edge over free users.** It's a much milder, more defensible edge than an auto-buy bot, but it's not zero. Own this honestly rather than claim neutrality — e.g. a public FAQ entry: *"Does paying help me buy before other people? It gets you the alert faster than the free tier. It does not buy anything for you, and it does not help you buy more than the store's own per-person limit."*

**Recommended brand rules:**
- Never use drop-culture language ("cop," "grab," "snipe," "before it's gone," "beat the bots"). Use "track," "watch," "know," "stay ahead of restocks" instead.
- Publish a one-paragraph "fair use" stance discouraging bulk-buying/reselling. Costs nothing, buys real trust.
- If you ever do productize the bot, it needs its own separate brand, its own legal review, and should not share a name/domain with the dashboard — different risk category entirely (see §6).

---

## 2. Naming

Constraints: must work across multiple TCGs (not Pokémon-specific), must not sound aggressive/bot-like, should be crackable in both Romanian and English contexts since collector communities lean bilingual.

| Name | Read | Notes |
|---|---|---|
| **CardWatch** | Neutral, clear, safe | "Watch" = monitor, not "hunt." Easiest to explain in one sentence. |
| **TCG Radar** | Broad-coverage, tech-forward | "Radar" signals scanning many stores at once — matches multi-TCG ambition well. |
| **CardScout** | Friendly, exploratory | "Scout" is helpful/exploratory, not acquisitive. |
| **TCG Beacon** | Warm, guiding | "Beacon" = a light that helps you, not a weapon. Slightly more abstract to explain. |
| StockPulse | Techy | Good but sounds more infra/dev-tool than collector-hobby. |
| PackAlert | Direct, functional | Ties into "booster pack" nicely but reads generic/interchangeable. |
| CollectRadar | Leans into identity | Names the *community* ("collectors"), not the *action* — strong anti-scalper signal, slightly clunkier to say. |

**Recommendation: `CardWatch`** as the primary, `TCG Radar` as the runner-up if you want something that scales the "we cover everything" story harder once you add 5 more games. Before deciding: check `.ro`/`.com` domain availability and do a basic trademark screen (a name search, not necessarily a lawyer, at this stage) — I can't verify either from here.

---

## 3. Logo direction

**Hard constraint:** you're tracking Pokémon, Yu-Gi-Oh, One Piece, Lorcana, Dragon Ball, and Digimon. None of those companies' mascots, exact brand colors, or logos can appear in your mark — Nintendo/Konami/Bandai/Disney are all known to enforce aggressively. Keep the identity generic-hobby, not franchise-adjacent.

- **Icon concept:** a simple card outline (rounded-rect with a corner clipped, the universal "trading card" silhouette) with a small radar-sweep arc or notification-pulse in one corner. Reads as "watching a card" without copying any specific game's card frame.
- **Palette:** avoid Pokémon yellow/blue and Yu-Gi-Oh gold/purple specifically (the two most recognizable). A deep indigo/navy base (`#2A2A72`-ish) with a warm amber or teal accent reads premium and neutral — "hobby-tech," not "any specific game."
- **Type:** rounded, approachable sans-serif. Avoid sharp/angular esports-style faces — those read "competitive gaming bot," which is exactly the wrong association.

This is a good candidate for a quick pass in Figma or an AI logo tool once the name is locked — happy to help generate concepts once you've picked a direction.

---

## 4. Pricing (proposal — needs validation, see §7)

**Free tier** — full dashboard, all tracked TCGs, no email alerts (or a once-daily digest email as a taste of the paid feature). This is the trust-building, SEO-driving, word-of-mouth layer. Don't gate it behind signup if you can avoid it — the public `/view` route you already have is the right instinct.

**Paid tiers**, billed monthly (RON, since your current store list is Romania-only):

| Tier | Price/mo | What it gets |
|---|---|---|
| Single Game | ~19 RON (~€4) | Real-time email alerts for **one** TCG of your choice |
| All Access | ~39 RON (~€8) | Real-time alerts across every tracked TCG |

Annual option at ~2 months free (≈190 RON / 390 RON per year) to improve cash flow and reduce churn once you have any paying users at all.

**Launch tactic:** offer a "founding member" rate (e.g. 50% off, locked forever) to your first N subscribers. This does double duty — it rewards early adopters *and* it's your actual pricing signal, since right now these numbers are a guess, not a finding.

---

## 5. TCG expansion — grounded in the current codebase

I checked what's actually there before writing this section, so the roadmap is real, not aspirational:

- `products` has **no game/TCG column today** — `store_name`, `title`, `price`, `url`, `image_url`. Everything scraped so far is implicitly Pokémon.
- Store list (`scraper_type`) is Pokémon-card-store-flavored: Gomag-based shops, Shopify shops, Hobby-Planet, RegatulJocurilor, Carturesti, Foon, etc. Some of these (RegatulJocurilor, Hobby-Planet in particular — general hobby/game retailers, not Pokémon-exclusive by name) may **already sell Yu-Gi-Oh/One Piece/Lorcana/Dragon Ball/Digimon stock** that your scraper is either ignoring or lumping in as unlabeled "products." Worth auditing before writing any new scraper code — you might get 1-2 extra TCGs almost for free by just categorizing what you already scrape.

**What actually needs building, in order of cost:**
1. **Cheapest:** add a `game` column to `products`, backfill existing rows as `'pokemon'`, and add title/category-based classification to the scraper for stores you already track that likely carry other TCGs.
2. **Medium:** for TCGs with no coverage from existing stores, find and add 1-2 new store scrapers per game — same pattern as every store added so far.
3. **UI:** per-TCG filter on the dashboard, per-TCG selection in the paid signup flow (this is what the "Single Game" tier in §4 needs to exist).

**Recommendation:** don't launch all 5 new games simultaneously. Pick the one with the best existing store overlap (likely Yu-Gi-Oh or One Piece, if RegatulJocurilor/Hobby-Planet carry them — verify first), ship it as its own mini-launch, validate there's real demand and your scraping approach holds up for a second game, *then* sequence the rest. Five simultaneous new game integrations is a lot of scope for one person to maintain scrapers for.

---

## 6. The bot question

Correct instinct to keep Snipe out of this entirely for now. Two separate reasons, not one:

1. **Brand risk** — an auto-purchase bot living anywhere near the same brand/domain as a "we're not a scalper tool" dashboard undermines the entire positioning in §1, even if it's never advertised. If it ever leaks or gets discovered, it retroactively poisons the trust you built with the free dashboard.
2. **Legal risk is a different category.** The dashboard scrapes public stock/price data — low risk. Snipe automates checkout against a specific retailer's site, which the project's own guardrail-5 already flags as a ToS-awareness concern. Monetizing that (even quietly) is a materially different risk profile — worth actual legal review before ever considering it, not something to back into by accident because the dashboard business grew.

If you do ever want to revisit this, it should be a deliberate, separate decision later — not scoped into this launch plan.

---

## 7. Marketing plan

**Pre-launch (4-6 weeks):**
- Share the free dashboard (no paywall, no ask) in relevant Romanian Pokémon/TCG Facebook groups and Discord servers. Build reputation before ever mentioning payment.
- Build a small landing page: what it does, what it explicitly doesn't do (§1), free vs. paid comparison, email waitlist for the paid tier.
- Use the waitlist signup as your actual pricing research — ask "what would you pay for real-time alerts?" as an open question, don't just present §4's numbers as fact.

**Launch:**
- Announce in the same communities with the founding-member discount (§4).
- Short demo video/reel: "here's the dashboard, here's what an alert looks like" — low-production, authentic beats polished for this audience.
- Ask early users to share, don't cold-market — TCG collector communities are small and word-of-mouth-driven; one bad "feels spammy" post can cost more trust than ten good ones earn.

**Growth:**
- Each new TCG (§5) is its own mini-launch into that game's specific communities — don't rely on Pokémon users to organically discover you added Yu-Gi-Oh.
- Romanian-language SEO content ("unde găsești produse Pokémon TCG în stoc", etc.) funneling into the dashboard.
- Consider affiliate links to the stores you track as a secondary, non-subscription revenue stream later.

---

## 8. What actually needs to be built before this can launch as a paid product

Being concrete about engineering gaps, since "add a subscription" is doing a lot of hidden work:

- **Self-serve signup + consent.** Today, `ManageEmails.tsx`/`useSubscribers` is an *admin-managed* list — you manually add/remove subscriber emails. A public paid product needs self-serve signup with explicit consent capture (a checkbox, not an admin action) to be GDPR-compliant.
- **Unsubscribe link in every email + a privacy policy.** Legally required for EU/Romanian email marketing, not currently present as far as I can see.
- **Billing.** No payment integration exists yet (no Stripe or equivalent). Stripe operates fine in Romania — this is a real but standard build, not a blocker, just not started.
- **Per-TCG subscription selection**, which depends on §5's `game` column existing first.

None of these are hard, but they're all real work, not configuration — worth sizing before promising a launch date.

---

## 9. Drilling the proposal

You explicitly asked for this, so here's the honest version, not the supportive one:

1. **"Not a scalper tool" is a positioning choice, not a fact.** You'll get *some* people calling it that regardless of what you build, because "pay for faster restock info" pattern-matches to scalper tooling for anyone not reading closely. §1's honest-FAQ approach is the right mitigation, but don't expect it to be airtight — decide in advance how you'll respond to that criticism publicly, calmly, once (not every time).
2. **The pricing in §4 is invented, not researched.** I don't have real willingness-to-pay data for Romanian TCG collectors specifically. Treat those numbers as a hypothesis to test via the waitlist question in §7, not a plan to execute on day one.
3. **Six TCGs (current + 5 new) is too much surface area to launch at once.** Realistically this is a solo-maintained scraper fleet — every additional store is an ongoing maintenance burden (sites redesign, scrapers break — you've already had to fix DexHit, RaiJucarii, RegatulJocurilor, Tulli.ro scrapers in recent history). Sequencing per §5 isn't just nicer, it's probably necessary to keep the thing running.
4. **The free dashboard + paid email model has a thin moat.** Nothing here is hard to clone technically. What's actually defensible is community trust and being first/most-reliable in the Romanian TCG space specifically — which means the marketing/community work in §7 matters more than any single feature, and reputation damage (spammy launch, a scraper silently broken for a week, an alert that's late) costs disproportionately more than it would for a less trust-dependent product.
5. **§8 is a real prerequisite, not a nice-to-have.** "I want a paid subscription" implicitly requires consent capture, unsubscribe links, and billing — none of which exist today. Worth sizing this work explicitly before setting any launch date, so the date isn't a surprise disappointment later.
6. **Domain/name/trademark checks are unverified.** I generated the name shortlist in §2 from reasoning, not from checking actual availability or conflicts. Do that before getting attached to any of them.

---

## 10. Suggested next steps (small, in order)

1. Pick a name from §2 (or reject all of them) — check domain + basic trademark search.
2. Post the free dashboard (as-is, today) into 1-2 communities with zero monetization mentioned. Gauge real reaction.
3. Audit existing scraped stores for non-Pokémon TCG stock already present but unlabeled (§5, item 1) — cheapest possible next feature.
4. Draft the waitlist landing page with the pricing *question*, not the pricing *answer*.
5. Only after 2-4 show real signal: scope the self-serve-signup + billing work from §8.

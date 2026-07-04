/**
 * Mode B keyword matching (Snipe, Phase 3) — pure, no DOM, no chrome APIs.
 *
 * Given a keyword list, resolve krit.ro search results to the SINGLE product
 * whose title contains ALL keywords (case-insensitive substring). The whole
 * point is safety: it must never guess. Zero matches → `no_match`; more than one
 * → `ambiguous`. Only an unambiguous single match resolves to a URL that the
 * (unchanged) Phase 2 buy pipeline then acts on.
 *
 * Loaded into the background worker via importScripts → globalThis.SnipeKeywordMatch.
 */
"use strict";

(() => {
  /** Normalize a keyword list: strings, trimmed, lowercased, non-empty, de-duped. */
  const normalizeKeywords = (keywords) => {
    if (!Array.isArray(keywords)) return [];
    const seen = new Set();
    const out = [];
    for (const k of keywords) {
      const norm = String(k ?? "").trim().toLowerCase();
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        out.push(norm);
      }
    }
    return out;
  };

  /** True iff every keyword is a case-insensitive substring of `title`. */
  const matchAllKeywords = (title, keywords) => {
    const norm = normalizeKeywords(keywords);
    if (norm.length === 0) return false; // never match on an empty keyword set
    const hay = String(title ?? "").toLowerCase();
    return norm.every((k) => hay.includes(k));
  };

  /** Build Krit's path-based search URL: `${origin}/cautare/<encoded query>`. */
  const buildSearchUrl = (origin, keywords) => {
    const query = normalizeKeywords(keywords).join(" ");
    return `${origin.replace(/\/$/, "")}/cautare/${encodeURIComponent(query)}`;
  };

  /**
   * Resolve search results to a single product by all-keywords title match.
   * @param {Array<{title: string, url: string}>} products
   * @param {string[]} keywords
   * @returns {{status: "resolved"|"no_match"|"ambiguous"|"no_keywords", url?: string, product?: object, matches: object[]}}
   */
  const resolveByKeywords = (products, keywords) => {
    const norm = normalizeKeywords(keywords);
    if (norm.length === 0) return { status: "no_keywords", matches: [] };

    const seenUrls = new Set();
    const matches = [];
    for (const p of Array.isArray(products) ? products : []) {
      if (!p || typeof p.url !== "string" || !matchAllKeywords(p.title, norm)) continue;
      if (seenUrls.has(p.url)) continue; // de-dupe identical product urls
      seenUrls.add(p.url);
      matches.push(p);
    }

    if (matches.length === 0) return { status: "no_match", matches };
    if (matches.length > 1) return { status: "ambiguous", matches };
    return { status: "resolved", url: matches[0].url, product: matches[0], matches };
  };

  globalThis.SnipeKeywordMatch = Object.freeze({ normalizeKeywords, matchAllKeywords, buildSearchUrl, resolveByKeywords });
})();

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type Label } from "../todos/types";

/** Minimum normalized similarity (0..1) for a typed token to be treated as an
 * existing roster entry rather than a new one. 0.75 tolerates one edit on a short
 * word (jon -> john, features -> feature) and proportionally more as words grow
 * (one typo in a long label still matches), while keeping johnny (0.67) distinct
 * from john. Lower this to merge more aggressively, raise it to merge less. */
export const MATCH_THRESHOLD = 0.75;

/** Levenshtein edit distance between two strings. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

/** Normalized similarity 0..1: 1 minus the edit distance over the longer length.
 * 1 = identical, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

/**
 * Best similarity of a token against a name, measured against the whole name and
 * each of its words. The per-word pass is what lets a first name match a full
 * roster name ("john" scores 1.0 against the "john" in "John Smith"), so one
 * threshold covers exact, first/last-name, and typo/plural matches alike.
 */
function nameSimilarity(token: string, name: string): number {
  const t = token.trim().toLowerCase();
  const n = name.trim().toLowerCase();
  if (!t || !n) return 0;
  let best = similarity(t, n);
  for (const w of n.split(/\s+/)) best = Math.max(best, similarity(t, w));
  return best;
}

/** Fuzzily resolve a typed name to the closest roster entry above the match
 * threshold, or null to mint a new one. Shared by assignees and labels. */
export function resolveName<T extends { id: string; name: string }>(
  token: string,
  roster: T[],
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const r of roster) {
    const score = nameSimilarity(token, r.name);
    // >= threshold to count; strictly > current best so ties keep the first.
    if (score >= MATCH_THRESHOLD && score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** Min length before label prefix/stem matching kicks in, so a 1-2 char tag
 * doesn't latch onto every label. */
const MIN_PREFIX_LEN = 3;

/** Whether two label names share a stem, via a length-guarded prefix either way
 * ("mark" -> "marketing", "feature" <-> "features", "ship" -> "shipping"). This
 * also covers the common -s/-ing/-ed endings without a real stemmer. */
function stemMatch(a: string, b: string): boolean {
  if (a.length < MIN_PREFIX_LEN || b.length < MIN_PREFIX_LEN) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Resolve a typed label, preferring an existing one (labels lean toward
 * assignment over creation): first the shared similarity match (exact / typo /
 * plural), then a looser stem/prefix match ("#mark" -> "marketing"), and only
 * a brand-new label when nothing matches ("#bug" with no "bug*" around).
 */
export function resolveLabel(token: string, roster: Label[]): Label | null {
  const sim = resolveName(token, roster);
  if (sim) return sim;
  const t = token.trim().toLowerCase();
  let best: Label | null = null;
  let bestLen = Infinity;
  for (const r of roster) {
    if (!stemMatch(t, r.name.trim().toLowerCase())) continue;
    // Prefer the closest stem (shortest candidate), so "mark" picks "marketing"
    // over a longer "marketing-campaign".
    const len = r.name.trim().length;
    if (len < bestLen) {
      bestLen = len;
      best = r;
    }
  }
  return best;
}

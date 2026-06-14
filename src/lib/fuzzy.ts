/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

/**
 * Tiny dependency-free fuzzy matcher. For a todo list (tens–hundreds of items) a
 * linear scan with this scorer is effectively instant, so there's no need for an
 * index or a library.
 *
 * A query matches if its characters appear in order (a subsequence) in the text.
 * Score rewards contiguous runs and matches at word boundaries, so tighter,
 * start-of-word matches rank higher.
 */
export function fuzzyScore(text: string, query: string): number | null {
  const t = text.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return 0;

  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const c of q) {
    const idx = t.indexOf(c, ti);
    if (idx === -1) return null;
    streak = idx === ti ? streak + 1 : 0;
    let s = 1 + streak; // contiguity bonus
    if (idx === 0 || /[\s\-_/.]/.test(t[idx - 1])) s += 3; // word-boundary bonus
    score += s;
    ti = idx + 1;
  }
  return score;
}

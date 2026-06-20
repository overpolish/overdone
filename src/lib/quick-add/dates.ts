/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import * as chrono from "chrono-node";

/** Words that, just before a date, mean "remind me then" - routes to `notifyAt`. */
const REMIND_CUES = ["remind", "reminder", "follow up", "followup", "ping", "notify", "alert"];
/** Words that, just before a date, mean "this is the deadline" - routes to `dueDate`. */
const DUE_CUES = ["due", "by", "deadline", "before"];
/** Neutral words that still license a bare date (so "the monday meeting" stays
 * prose, but "on monday" / "at 5pm" are taken). */
const NEUTRAL_CUES = ["on", "at", "this", "next", "by"];

/** Default reminder time when a "remind me" phrase names a day but no clock time
 * (e.g. "follow up tomorrow"): 9:00 in the morning. */
const DEFAULT_REMIND_HOUR = 9;

/** Trailing word right before `index` in `text`, lowercased (or ""). */
function precedingWord(text: string, index: number): string {
  const before = text.slice(0, index).trimEnd();
  const m = before.match(/([\p{L}]+)$/u);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Whether a matched date phrase is "strong" enough to take on its own, with no
 * cue word in front of it. Relative/explicit phrases (tomorrow, tonight, next
 * monday, in 3 days, june 20, 5pm, 15:00) are unambiguous; a lone weekday or a
 * bare number is not, so those need a cue to avoid eating ordinary prose.
 */
function isStrongDate(matchText: string): boolean {
  const t = matchText.toLowerCase();
  return (
    /\b(today|tonight|tomorrow|tmr|tmrw|yesterday)\b/.test(t) ||
    /\bnext\s+\w+/.test(t) ||
    /\bin\s+\d+\s+\w+/.test(t) ||
    /\d{1,2}\s*[:.]\s*\d{2}/.test(t) || // 15:00
    /\d{1,2}\s*(am|pm)\b/.test(t) || // 5pm
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(t) || // month name
    /\d{1,2}\/\d{1,2}/.test(t) // 6/20
  );
}

/** Cue that licenses/routes a date match, or null to reject it. A reminder cue
 * can sit a couple of words back ("remind me tomorrow", "follow up with him on
 * friday"); a due/neutral connector must be immediately adjacent so it can't eat
 * a date out of unrelated prose. */
function cueFor(text: string, index: number): string | null {
  // Reminder intent, scanning the last few words before the date.
  const tail = text.slice(0, index).toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const window = tail.slice(-3);
  if (window.includes("follow") && window.includes("up")) return "follow up";
  for (const cue of REMIND_CUES) {
    if (window.includes(cue)) return cue;
  }
  // Due/neutral connector, only when it's the word right before the date.
  const word = precedingWord(text, index);
  if (DUE_CUES.includes(word) || NEUTRAL_CUES.includes(word)) return word;
  return null;
}

/** Lift a chrono match into a concrete time + whether it carries a clock time. */
function resolveDate(result: chrono.ParsedResult): { date: Date; hasTime: boolean } {
  const hasTime = result.start.isCertain("hour");
  return { date: result.start.date(), hasTime };
}

/** Local midnight of a date, as epoch ms - the date-only form `dueDate` stores. */
function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** A date at local midnight (date-only). */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The next date on or after `ref` that falls on weekday `dow` (0=Sun..6=Sat). */
function nextDow(ref: Date, dow: number): Date {
  const d = atMidnight(ref);
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return d;
}

/** Last day of `ref`'s month, at midnight. */
function endOfMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
}

/**
 * Shorthand due-date phrases chrono doesn't reliably handle. All resolve to a
 * date-only due date. Matched phrases are blanked (not deleted) before chrono
 * runs, so chrono's match offsets - which the title pass strips by - stay valid.
 */
const DATE_ALIASES: Array<{ re: RegExp; date: (ref: Date) => Date; notifyHour?: number }> = [
  // eod reminds at end of day (18:00); the rest fall back to the default hour.
  { re: /\b(?:eod|end of (?:the )?day)\b/giu, date: atMidnight, notifyHour: 18 },
  { re: /\b(?:eow|end of (?:the )?week)\b/giu, date: (r) => nextDow(r, 5) },
  { re: /\b(?:eom|end of (?:the )?month)\b/giu, date: endOfMonth },
  { re: /\bthis weekend\b/giu, date: (r) => nextDow(r, 6) },
  { re: /\bmid[-\s]?week\b/giu, date: (r) => nextDow(r, 3) },
];

/** A reminder time / due date, plus the source spans to strip. */
export interface DateScan {
  notifyAt?: number;
  dueDate?: number;
  /** [start, end) spans of the matched date phrases (and leading connector cues),
   * for callers that strip them; comment parsing ignores these. */
  removals: Array<[number, number]>;
}

/**
 * Find a reminder time and/or due date in free text. chrono proposes matches;
 * each is accepted only with a cue word in front or a self-evidently strong
 * phrase, then routed to notify (a time, or a "remind/follow up" cue) or due (a
 * "due/by" cue, or a bare date). The first of each wins. Shared by the quick-add
 * title pass (which strips the spans) and comment parsing (which doesn't).
 */
/** A candidate date match (from an alias or chrono), before cue routing. */
interface DateCand {
  index: number;
  length: number;
  date: Date;
  /** Carries a clock time (so it routes to notify even without a cue). */
  hasTime: boolean;
  /** Strong enough to take with no cue in front (aliases always are). */
  strong: boolean;
  /** Hour to use if this becomes a reminder with no clock time (eod = 18). */
  notifyHour?: number;
}

export function scanDates(text: string, ref: Date): DateScan {
  const scan: DateScan = { removals: [] };
  const cands: DateCand[] = [];

  // Resolve the shorthand aliases ourselves, then blank them to equal-length
  // spaces so chrono (below) doesn't re-read them and its offsets still index
  // `text`. Aliases are candidates like any other - cue routing happens uniformly.
  let masked = text;
  for (const alias of DATE_ALIASES) {
    for (const m of text.matchAll(alias.re)) {
      const index = m.index ?? 0;
      cands.push({
        index,
        length: m[0].length,
        date: alias.date(ref),
        hasTime: false,
        strong: true,
        notifyHour: alias.notifyHour,
      });
      masked = masked.slice(0, index) + " ".repeat(m[0].length) + masked.slice(index + m[0].length);
    }
  }
  for (const r of chrono.parse(masked, ref, { forwardDate: true })) {
    const { date, hasTime } = resolveDate(r);
    cands.push({ index: r.index, length: r.text.length, date, hasTime, strong: isStrongDate(r.text) });
  }

  // Route each candidate by the cue in front of it; leftmost of each kind wins.
  cands.sort((a, b) => a.index - b.index);
  for (const c of cands) {
    const cue = cueFor(text, c.index);
    if (!cue && !c.strong) continue; // bare prose date - skip
    const remind = cue != null && REMIND_CUES.includes(cue);
    const due = cue != null && DUE_CUES.includes(cue);
    if ((remind || c.hasTime) && !due) {
      if (scan.notifyAt != null) continue;
      const at = new Date(c.date);
      if (!c.hasTime) at.setHours(c.notifyHour ?? DEFAULT_REMIND_HOUR, 0, 0, 0);
      // A reminder can't be in the past (matches the date picker's clamp). chrono
      // already rolls a past clock time forward, but an hour we inject ourselves
      // ("notify eod" late in the day, "remind me today" before 9am has passed)
      // can still land behind now - clamp it up.
      scan.notifyAt = Math.max(at.getTime(), ref.getTime());
    } else {
      if (scan.dueDate != null) continue;
      scan.dueDate = midnight(c.date);
    }
    // Strip the date phrase, plus the cue in front of it. A connector cue
    // ("due"/"by"/"on") always goes. A reminder cue ("notify"/"remind me") also
    // goes - unless it's the leading task verb (nothing before it), so
    // "follow up tomorrow" keeps "Follow up" but "wrap up notify eod" drops it.
    let start = c.index;
    if (cue && REMIND_CUES.includes(cue)) {
      const cs = cueStartBefore(text, c.index, cue);
      if (cs != null && text.slice(0, cs).trim() !== "") start = cs;
    } else if (cue) {
      start -= cueLengthBefore(text, start, cue);
    }
    scan.removals.push([start, c.index + c.length]);
  }
  return scan;
}

/** Length of the cue token (and its trailing space) sitting just before `index`,
 * so it can be stripped along with the date. 0 when there's no cue to remove. */
function cueLengthBefore(text: string, index: number, cue: string | null): number {
  if (!cue) return 0;
  const before = text.slice(0, index);
  // Match the cue (1 or 2 words) followed by the whitespace up to the date.
  const re = new RegExp(`${cue.replace(/\s+/g, "\\s+")}\\s*$`, "iu");
  const m = before.match(re);
  return m ? m[0].length : 0;
}

/** Start index of the reminder cue nearest before `dateIndex` (the cue's first
 * word may sit a couple words back, e.g. "remind me …"), or null if not found. */
function cueStartBefore(text: string, dateIndex: number, cue: string): number | null {
  const firstWord = cue.split(/\s+/)[0];
  const re = new RegExp(`\\b${firstWord}\\b`, "giu");
  let last: number | null = null;
  for (const m of text.slice(0, dateIndex).matchAll(re)) last = m.index ?? null;
  return last;
}

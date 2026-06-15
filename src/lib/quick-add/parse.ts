/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import * as chrono from "chrono-node";

import { type Assignee, type Label } from "../todos/types";

/**
 * Quick-add parsing: pull structured metadata out of a free-form item title so
 * typing "Fix login #bug @john due friday" sets the label, assignee, and due
 * date, leaving the title as "Fix login". Deterministic and offline - dates go
 * through chrono-node, everything else is sigils/keywords. See {@link parseQuickAdd}.
 *
 * The whole point is to run on every confirm (Enter/blur) of any row without
 * mangling ordinary prose, so each extractor is deliberately conservative:
 * sigils must sit on a word boundary, and bare dates need an explicit cue.
 */

/** What {@link parseQuickAdd} pulled out of an item's text. */
export interface QuickAddParse {
  /** The title with every recognized token removed and whitespace tidied. */
  text: string;
  /** Ids of existing roster people the text referenced (`@name`, "assign to name"). */
  assigneeIds: string[];
  /** Names that matched no one in the roster - the caller mints these. */
  newAssignees: string[];
  /** Ids of existing labels the text referenced (`#name`). */
  labelIds: string[];
  /** Label names that matched nothing - the caller mints these. */
  newLabels: string[];
  /** Epoch ms for a reminder ("remind/follow up", or any date carrying a time). */
  notifyAt?: number;
  /** Epoch ms (local midnight) for a due date ("due/by", or a bare strong date). */
  dueDate?: number;
  /** Whether anything was extracted - the caller skips mutating when false, so a
   * plain edit with no tokens costs nothing. */
  changed: boolean;
}

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
interface DateScan {
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

function scanDates(text: string, ref: Date): DateScan {
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

/**
 * Dates extracted from free text without modifying it - for comments, where the
 * note stays as written but "remind me tomorrow at 15:00" / "due friday" still
 * set the item's reminder / due date. `ref` is "now" (injectable for tests).
 */
export function parseDates(
  text: string,
  ref: Date = new Date(),
): { notifyAt?: number; dueDate?: number } {
  const { notifyAt, dueDate } = scanDates(text, ref);
  return { notifyAt, dueDate };
}

/**
 * Dates derived from comments that are new or edited relative to `prevById`
 * (id -> stored text). Only changed comments are scanned, so reopening the panel
 * doesn't re-derive old dates; the last match of each kind wins. `textOf` pulls
 * plain text from a comment's stored form (HTML), kept injectable so this stays
 * pure and testable. Used by the details:action wiring (see main-events).
 */
export function datesFromNewComments(
  prevById: Map<string, string>,
  comments: Array<{ id: string; text: string }>,
  textOf: (stored: string) => string,
  ref: Date = new Date(),
): { notifyAt?: number; dueDate?: number } {
  const dates: { notifyAt?: number; dueDate?: number } = {};
  for (const c of comments) {
    if (prevById.get(c.id) === c.text) continue; // unchanged - skip
    const found = parseDates(textOf(c.text), ref);
    if (found.notifyAt != null) dates.notifyAt = found.notifyAt;
    if (found.dueDate != null) dates.dueDate = found.dueDate;
  }
  return dates;
}

/** Minimum normalized similarity (0..1) for a typed token to be treated as an
 * existing roster entry rather than a new one. 0.75 tolerates one edit on a short
 * word (jon -> john, features -> feature) and proportionally more as words grow
 * (one typo in a long label still matches), while keeping johnny (0.67) distinct
 * from john. Lower this to merge more aggressively, raise it to merge less. */
const MATCH_THRESHOLD = 0.75;

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
function similarity(a: string, b: string): number {
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
function resolveName<T extends { id: string; name: string }>(
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
function resolveLabel(token: string, roster: Label[]): Label | null {
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

/**
 * Classify a word as an assignment verb and its grammar family, or null. Three
 * families, each with its own connector rules (see {@link extractAssign}):
 *   "assign"  assign / assigned / delegate / reassign … - "[to] NAME [to TASK]"
 *   "ask"     ask / get                                 - "NAME to TASK"
 *   "owner"   owner / owned                             - "[:|by] NAME"
 * The assign family is typo-tolerant (0.75 similarity, so "assignt"/"asign"/
 * "reassign" all count); ask/owner are matched exactly since they're ordinary
 * words and a fuzzy match would fire far too often.
 */
type AssignKind = "assign" | "ask" | "owner";
function assignKind(word: string): AssignKind | null {
  const w = word.toLowerCase();
  if (
    similarity(w, "assign") >= MATCH_THRESHOLD ||
    similarity(w, "assigned") >= MATCH_THRESHOLD ||
    w === "delegate" ||
    w === "delegated"
  ) {
    return "assign";
  }
  if (["ask", "asks", "asked", "get", "gets"].includes(w)) return "ask";
  if (w === "owner" || w === "owned") return "owner";
  return null;
}

/** Names in a directive, split on commas / "and" / "&" / "/". */
function splitNames(s: string): string[] {
  return s
    .split(/\s*(?:,|&|\/|\band\b)\s*/iu)
    .map((n) => n.trim())
    .filter(Boolean);
}

/** Every name resolves to an existing roster member (none would be created). */
function allResolve(names: string[], roster: Assignee[]): boolean {
  return names.length > 0 && names.every((n) => resolveName(n, roster) != null);
}

/** Validate, resolve-guard, and record a name list, returning false (caller
 * leaves the text untouched) if it isn't a usable set of names. `allowCreate`
 * gates whether unknown names mint a new person or disqualify the directive. */
function recordAssignees(
  namesStr: string,
  allowCreate: boolean,
  roster: Assignee[],
  out: QuickAddParse,
): boolean {
  if (!/^[\p{L}][\p{L}\s,&/]*$/u.test(namesStr.trim())) return false;
  const names = splitNames(namesStr);
  if (names.length === 0) return false;
  if (!allowCreate && !allResolve(names, roster)) return false;
  for (const n of names) addAssignee(n, roster, out);
  out.changed = true;
  return true;
}

/**
 * Pull an assignment directive out of the text and return the remaining title.
 * The verb may sit anywhere (rightmost wins); each family parses differently:
 *
 *   assign/delegate  "[to] NAME [to TASK]"   create only with an explicit "to";
 *                                            bare "assign john" needs john to exist
 *   ask/get          "NAME to TASK"          start-only, TASK becomes the title,
 *                                            names must exist (these verbs are common)
 *   owner/owned      "owner: NAME" / "owned by NAME" / "owner NAME"  - trailing;
 *                                            create only with the ":"/"by" marker
 *
 * The must-already-exist guard on the unmarked forms is the safety net: it stops
 * imperatives like "assign tickets to triage" or "get milk" from minting people.
 */
function extractAssign(text: string, roster: Assignee[], out: QuickAddParse): string {
  // Rightmost assignment verb - a directive usually trails the task text.
  let verb: { start: number; end: number; word: string; kind: AssignKind } | null = null;
  for (const m of text.matchAll(/\b\p{L}+/gu)) {
    const idx = m.index ?? 0;
    const kind = assignKind(m[0]);
    if (kind) verb = { start: idx, end: idx + m[0].length, word: m[0].toLowerCase(), kind };
  }
  if (!verb) return text;

  const atStart = text.slice(0, verb.start).trim() === "";
  const prefix = text.slice(0, verb.start).trimEnd();
  let rest = text.slice(verb.end);

  if (verb.kind === "ask") {
    // "ask/get NAME to TASK": start-only (else the prefix would be lost), and a
    // "to TASK" is required - so "get milk" / "ask for help" don't trigger.
    if (!atStart) return text;
    const sp = rest.match(/^\s+/u);
    if (!sp) return text;
    rest = rest.slice(sp[0].length);
    if (/^to\s+/iu.test(rest)) return text; // "ask to john" isn't valid
    const split = rest.match(/^(.*?)\s+to\s+(.+)$/iu);
    if (!split) return text;
    if (!recordAssignees(split[1], false, roster, out)) return text;
    return split[2];
  }

  if (verb.kind === "owner") {
    // "owner: NAME" / "owner NAME" / "owned by NAME" - trailing. The ":" or "by"
    // marker licenses creating a new owner; a bare "owner NAME" must already exist.
    let marked = false;
    if (verb.word === "owned") {
      const by = rest.match(/^\s+by\s+/iu);
      if (!by) return text;
      rest = rest.slice(by[0].length);
      marked = true;
    } else {
      const colon = rest.match(/^\s*:\s*/u);
      if (colon) {
        rest = rest.slice(colon[0].length);
        marked = true;
      } else {
        const sp = rest.match(/^\s+/u);
        if (!sp) return text;
        rest = rest.slice(sp[0].length);
      }
    }
    if (!recordAssignees(rest, marked, roster, out)) return text;
    return prefix;
  }

  // assign / delegate: optional "to" before the name; a leading "to TASK" form
  // names the task (start-only); bare "assign john" requires john to exist.
  let hadTo = false;
  const toLead = rest.match(/^\s+to\s+/iu);
  if (toLead) {
    hadTo = true;
    rest = rest.slice(toLead[0].length);
  } else {
    const sp = rest.match(/^\s+/u);
    if (!sp) return text; // verb glued to the next char - not a directive
    rest = rest.slice(sp[0].length);
  }
  let namesStr = rest;
  let task: string | null = null;
  if (atStart) {
    const split = rest.match(/^(.*?)\s+to\s+(.+)$/iu);
    if (split) {
      namesStr = split[1];
      task = split[2];
    }
  }
  if (!recordAssignees(namesStr, hadTo, roster, out)) return text;
  return task != null ? task : prefix;
}

/**
 * Parse an item title into its plain text plus extracted assignees, labels, and
 * dates. `ref` is the "now" dates resolve against (injectable for tests).
 *
 * Order matters: strip sigils first (so a `#`/`@` token can't be mistaken for
 * part of a date phrase), then run the date pass over what remains.
 */
export function parseQuickAdd(
  raw: string,
  roster: Assignee[],
  labelRoster: Label[],
  ref: Date = new Date(),
): QuickAddParse {
  const out: QuickAddParse = {
    text: raw,
    assigneeIds: [],
    newAssignees: [],
    labelIds: [],
    newLabels: [],
    changed: false,
  };

  let text = raw;

  // 1. Labels: #name, anchored to a word boundary so "C# rewrite" is left alone.
  // Fuzzy-resolved, so "#features" lands on an existing "feature" label.
  text = text.replace(/(^|\s)#([\p{L}\d][\p{L}\d_-]*)/gu, (_m, lead, name) => {
    addLabel(name, labelRoster, out);
    out.changed = true;
    return lead; // keep the leading space; collapse later
  });

  // 2. Sigil form: @name anywhere, word-boundary anchored.
  text = text.replace(/(^|\s)@([\p{L}\d][\p{L}\d._-]*)/gu, (_m, lead, name) => {
    addAssignee(name, roster, out);
    out.changed = true;
    return lead;
  });

  // 3. Dates (see scanDates): set notify/due from cued or strong matches, then
  // strip the matched spans out of the title.
  const dates = scanDates(text, ref);
  if (dates.notifyAt != null) {
    out.notifyAt = dates.notifyAt;
    out.changed = true;
  }
  if (dates.dueDate != null) {
    out.dueDate = dates.dueDate;
    out.changed = true;
  }
  text = applyRemovals(text, dates.removals);

  // 4. "assign …" directive, run after dates so a trailing "...by friday assign
  // to john" has the date already stripped. Handles typo'd verbs, an optional
  // "to", a leading task-naming form, and the bare "assign john" (existing-only).
  text = extractAssign(text, roster, out);

  out.text = tidy(text);
  return out;
}

/** Resolve+record one assignee name into `out` (existing id, fuzzy-matched, or a
 * new name for the caller to mint). */
function addAssignee(name: string, roster: Assignee[], out: QuickAddParse): void {
  const existing = resolveName(name, roster);
  if (existing) {
    if (!out.assigneeIds.includes(existing.id)) out.assigneeIds.push(existing.id);
  } else if (!out.newAssignees.some((n) => n.toLowerCase() === name.toLowerCase())) {
    out.newAssignees.push(name);
  }
}

/** Resolve+record one label name into `out` (existing id, fuzzy/stem-matched, or
 * new). Labels prefer assignment, so this is looser than the assignee resolver. */
function addLabel(name: string, roster: Label[], out: QuickAddParse): void {
  const existing = resolveLabel(name, roster);
  if (existing) {
    if (!out.labelIds.includes(existing.id)) out.labelIds.push(existing.id);
  } else if (!out.newLabels.some((n) => n.toLowerCase() === name.toLowerCase())) {
    out.newLabels.push(name);
  }
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

/** Cut every [start, end) span out of `text` (spans come in source order). */
function applyRemovals(text: string, spans: Array<[number, number]>): string {
  if (spans.length === 0) return text;
  spans.sort((a, b) => a[0] - b[0]);
  let result = "";
  let cursor = 0;
  for (const [start, end] of spans) {
    if (start < cursor) continue; // overlapping span, already covered
    result += text.slice(cursor, start);
    cursor = end;
  }
  result += text.slice(cursor);
  return result;
}

/** Collapse the whitespace left behind by stripped tokens and trim the ends. */
function tidy(text: string): string {
  return text.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

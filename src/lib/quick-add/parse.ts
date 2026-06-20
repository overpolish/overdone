/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type Assignee, type Label } from "../todos/types";

import { scanDates } from "./dates";
import { MATCH_THRESHOLD, resolveLabel, resolveName, similarity } from "./matching";

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

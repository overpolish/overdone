/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { randomColor } from "../assignee";
import { randomLabelColor } from "../label";
import { type TodoState } from "../todo";
import { type Assignee, type Comment, type Label, type TodoData } from "../todos";
import { ITEM_RE, MARKER_TO_STATE } from "./constants";
import { type ParsedList } from "./storage";

/**
 * Best-effort *import* of human-readable markdown into a {@link ParsedList} -
 * roughly the inverse of {@link import("./export").renderMarkdown}. Where
 * {@link import("./storage").parseList} round-trips our own metadata-laden
 * storage format losslessly, this reads the clean markdown that `renderMarkdown`
 * emits (and ordinary GitHub task lists), reconstructing what it can:
 *
 *   - Task lines `- [x]` / `- [ ]` (and our `[/]` `[-]` `[~]` markers) become
 *     items; a two-space indent makes a sub-item.
 *   - The italic `_(in progress)_` / `_(on hold)_` tags and `~~strikethrough~~`
 *     text recover the non-binary states the export flattened to `- [ ]`.
 *   - `@Name` mentions and `` `#Label` `` tags are collected into fresh list
 *     rosters (new ids + colors, since export drops the originals) and linked
 *     to the item.
 *   - A trailing `_done Jun 13, 2:05 PM_` annotation recovers `doneAt` when the
 *     date parses; nested `> **stamp**: text` blockquotes become the comment log.
 *
 * It is necessarily lossy: export discards item ids, created/updated times, the
 * exact done timestamp (only a locale string survives), and the roster ids, so
 * those are regenerated or left absent. Anything unrecognized is kept as plain
 * item text rather than dropped.
 */
export function importMarkdown(content: string): ParsedList {
  const lines = content.split(/\r?\n/);
  let title = "";
  const items: TodoData[] = [];

  // Name -> roster entry, built lazily as @mentions / `#labels` are first seen.
  const assigneeByName = new Map<string, Assignee>();
  const labelByName = new Map<string, Label>();
  const assigneeId = (name: string): string => {
    let entry = assigneeByName.get(name);
    if (!entry) {
      entry = { id: crypto.randomUUID(), name, color: randomColor() };
      assigneeByName.set(name, entry);
    }
    return entry.id;
  };
  const labelId = (name: string): string => {
    let entry = labelByName.get(name);
    if (!entry) {
      entry = { id: crypto.randomUUID(), name, color: randomLabelColor() };
      labelByName.set(name, entry);
    }
    return entry.id;
  };

  for (const line of lines) {
    if (!title) {
      const heading = line.match(/^#\s+(.*)$/);
      if (heading) {
        title = heading[1].trim();
        continue;
      }
    }

    const match = line.match(ITEM_RE);
    if (match) {
      const depth = match[1] ? 1 : 0;
      const base = MARKER_TO_STATE[match[2]] ?? "todo";
      const parsed = parseAnnotations(match[3]);
      const item: TodoData = {
        id: crypto.randomUUID(),
        text: parsed.text,
        state: parsed.state ?? base,
        depth,
      };
      if (parsed.doneAt != null) item.doneAt = parsed.doneAt;
      if (parsed.assignees.length) {
        item.assignees = parsed.assignees.map(assigneeId);
      }
      if (parsed.labels.length) item.labels = parsed.labels.map(labelId);
      items.push(item);
      continue;
    }

    // Anything that isn't the title or a task line belongs to the previous item:
    // a `> ...` blockquote is part of its comment log, anything else is a
    // continuation of its text. Strip the export's continuation indent first
    // (4 spaces under a sub-item's marker, 2 under a top item's).
    if (items.length === 0 || line.trim() === "") continue;
    const last = items[items.length - 1];
    const strip = last.depth === 1 ? 4 : 2;
    const body = line.replace(new RegExp(`^ {0,${strip}}`), "");

    const quote = body.match(/^>\s?(.*)$/);
    if (!quote) {
      last.text += "\n" + body;
      continue;
    }
    appendComment(last, quote[1]);
  }

  return {
    title,
    items,
    assignees: [...assigneeByName.values()],
    labels: [...labelByName.values()],
  };
}

/** Reverse of export's `STATE_LABEL`: the italic tag text → its state. */
const STATE_BY_LABEL: Record<string, TodoState> = {
  "in progress": "inProgress",
  "on hold": "onHold",
};

interface Annotations {
  text: string;
  state?: TodoState;
  doneAt?: number;
  assignees: string[];
  labels: string[];
}

/**
 * Pull the trailing annotations off an item's first line, peeling them from the
 * end in the reverse of the order export appends them (labels, assignees, state
 * tag, done date), then unwrap a cancelled item's strikethrough. Whatever is
 * left is the item's text.
 */
function parseAnnotations(raw: string): Annotations {
  let text = raw;
  let state: TodoState | undefined;
  let doneAt: number | undefined;
  const assignees: string[] = [];
  const labels: string[] = [];

  // `_done Jun 13, 2:05 PM_`
  const done = text.match(/\s*_done ([^_]+)_\s*$/);
  if (done) {
    const t = Date.parse(done[1].trim());
    if (!Number.isNaN(t)) doneAt = t;
    state = "done";
    text = text.slice(0, done.index);
  }

  // `_(in progress)_` / `_(on hold)_`
  const tag = text.match(/\s*_\(([^)]+)\)_\s*$/);
  if (tag) {
    const s = STATE_BY_LABEL[tag[1].trim()];
    if (s) {
      state = s;
      text = text.slice(0, tag.index);
    }
  }

  // ` - @Alice, @Bob` (the whole tail must be @mentions, so a stray " - @" in
  // real text isn't mistaken for an assignee list).
  const ass = text.match(/\s+-\s+(@[^,]+(?:,\s*@[^,]+)*)\s*$/);
  if (ass) {
    for (const name of ass[1].split(/,\s*/)) {
      const trimmed = name.replace(/^@/, "").trim();
      if (trimmed) assignees.push(trimmed);
    }
    text = text.slice(0, ass.index);
  }

  // `` `#urgent` `` tags, peeled one at a time from the end.
  for (;;) {
    const lab = text.match(/\s*`#([^`]+)`\s*$/);
    if (!lab) break;
    labels.unshift(lab[1].trim());
    text = text.slice(0, lab.index);
  }

  text = text.trim();

  // Cancelled items export their text as `~~struck~~`.
  const strike = text.match(/^~~([\s\S]*)~~$/);
  if (strike) {
    text = strike[1];
    if (!state) state = "cancelled";
  }

  return { text, state, doneAt, assignees, labels };
}

/** First line of a comment in the export's blockquote log. */
const COMMENT_RE = /^\*\*(.+?)\*\*( \(edited\))?:\s?(.*)$/;

/**
 * Fold one blockquote line (already stripped of its `> `) into the item's
 * comment log: a `**stamp**: text` line opens a new comment, any other line
 * continues the previous comment's text.
 */
function appendComment(item: TodoData, body: string): void {
  const log = (item.comments ??= []);
  const head = body.match(COMMENT_RE);
  if (head) {
    const createdAt = Date.parse(head[1].trim());
    const comment: Comment = {
      id: crypto.randomUUID(),
      text: head[3],
      createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
    };
    // Export only records *that* a comment was edited, not when, so mark it
    // edited at its post time to keep the indicator without inventing a time.
    if (head[2]) comment.editedAt = comment.createdAt;
    log.push(comment);
    return;
  }
  const prev = log[log.length - 1];
  if (prev) prev.text += "\n" + body;
}

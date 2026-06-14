/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type TodoState } from "../todo";
import { type Assignee, type Label, type TodoData } from "../todos";

/**
 * Compact, human timestamp for export (e.g. "Jun 13, 2:05 PM"). Mirrors the
 * format shown in the item-details panel.
 */
function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Human label for the non-binary states, shown as an italic tag on export. */
const STATE_LABEL: Partial<Record<TodoState, string>> = {
  inProgress: "in progress",
  onHold: "on hold",
};

/**
 * Render a list as clean, human-readable markdown for export - no round-trip
 * metadata comments. Unlike `serializeList` (the storage format, which tucks
 * timestamps/assignees/comments into trailing HTML comments so it parses back
 * losslessly), this produces markdown meant to be *read*:
 *
 *   - Standard GitHub task-list checkboxes: `- [x]` done, `- [ ]` everything
 *     else, with an italic `_(in progress)_` / `_(on hold)_` tag for those
 *     states and `~~strikethrough~~` text for cancelled items.
 *   - Assignees resolved from the roster to `@Name` and appended after an em
 *     dash.
 *   - Comments rendered as a nested blockquote log, each prefixed with its
 *     timestamp.
 *   - Done items annotated with a light `_done Jun 13_` date.
 *
 * This is one-way: the result is not meant to be parsed back.
 */
export function renderMarkdown(
  title: string,
  items: TodoData[],
  assignees: Assignee[] = [],
  labels: Label[] = [],
): string {
  const nameById = new Map(assignees.map((a) => [a.id, a.name]));
  const labelById = new Map(labels.map((l) => [l.id, l.name]));
  const lines: string[] = [`# ${title || "Untitled"}`, ""];

  for (const item of items) {
    const indent = item.depth === 1 ? "  " : "";
    const cont = `${indent}  `;
    const marker = item.state === "done" ? "x" : " ";

    const [first = "", ...rest] = item.text.split("\n");
    let text = first;
    if (item.state === "cancelled" && text.trim()) text = `~~${text}~~`;

    // Trailing annotations: labels, assignees, a state tag, and a done date.
    const tail: string[] = [];
    const tags = (item.labels ?? [])
      .map((id) => labelById.get(id))
      .filter((n): n is string => !!n)
      .map((n) => `\`#${n}\``);
    if (tags.length) tail.push(tags.join(" "));
    const names = (item.assignees ?? [])
      .map((id) => nameById.get(id))
      .filter((n): n is string => !!n)
      .map((n) => `@${n}`);
    if (names.length) tail.push(`- ${names.join(", ")}`);
    const label = STATE_LABEL[item.state];
    if (label) tail.push(`_(${label})_`);
    if (item.state === "done" && item.doneAt != null) {
      tail.push(`_done ${formatTimestamp(item.doneAt)}_`);
    }

    lines.push(
      `${indent}- [${marker}] ${[text, ...tail].filter(Boolean).join(" ")}`.trimEnd(),
    );
    // Continuation lines of the item's text sit under the marker.
    for (const line of rest) lines.push(`${cont}${line}`);

    // Comment log as a nested blockquote, oldest first.
    for (const comment of item.comments ?? []) {
      const stamp = formatTimestamp(comment.createdAt);
      const edited = comment.editedAt != null ? " (edited)" : "";
      const [head = "", ...more] = comment.text.split("\n");
      lines.push(`${cont}> **${stamp}**${edited}: ${head}`.trimEnd());
      for (const line of more) lines.push(`${cont}> ${line}`);
    }
  }

  return lines.join("\n") + "\n";
}

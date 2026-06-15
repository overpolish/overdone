/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import dayjs from "dayjs";

import { isStruck } from "../../lib/todo";
import { type TodoData } from "../../lib/todos";

/**
 * Line height of the text field's first row. The checkbox is centered within a
 * box of this height so it aligns with the first line, and the row stays
 * top-anchored (so the checkbox doesn't drift down) once the text wraps.
 */
export const LINE_HEIGHT = 20;

/** Left inset of a sub-item, so its checkbox sits under the parent's text. */
export const INDENT = 24;

/** Status accent colors, shared by the row tint and the status icons. */
export const STATUS_COLOR = {
  overdue: "var(--mantine-color-red-6)",
  notify: "var(--mantine-color-yellow-6)",
  today: "var(--mantine-color-orange-6)",
} as const;

/** Due urgency that surfaces an indicator (future/none don't). */
export type DueState = "overdue" | "today" | null;

/** The row's winning status accent, or null when nothing applies. */
export type RowStatus = keyof typeof STATUS_COLOR | null;

export interface ItemStatus {
  /** Resolved (done/cancelled): crossed off, dimmed, and never nagged. */
  done: boolean;
  /** A fired-but-unacknowledged notification (shows the dismiss bell). */
  needsAction: boolean;
  /** A reminder is scheduled but hasn't fired yet (shows a quiet pending bell, so
   * setting one - e.g. from a comment - has immediate, visible confirmation). */
  pendingNotify: boolean;
  dueState: DueState;
  /** The accent that wins the row by priority (see below). */
  status: RowStatus;
  /** Resolved color for `status`, or null. */
  statusColor: string | null;
}

/**
 * Derive a row's appearance from its item. Row appearance follows a single
 * priority: overdue (red) > notification (amber) > due today (orange). The
 * winner tints the text and a faint full-row wash; the per-status icons keep
 * their own colors regardless. Stored due dates are date-only, so compare days.
 */
export function rowStatus(item: TodoData): ItemStatus {
  const done = isStruck(item.state);
  const needsAction = item.notifiedAt != null;
  // A reminder still waiting to fire (notifyAt is cleared the moment it fires and
  // becomes notifiedAt, so the two never overlap). Hidden once the item resolves.
  const pendingNotify = item.notifyAt != null && !done;

  const dueState: DueState = (() => {
    if (item.dueDate == null || done) return null;
    const today = dayjs().startOf("day");
    const due = dayjs(item.dueDate).startOf("day");
    if (due.isBefore(today)) return "overdue";
    if (due.isSame(today)) return "today";
    return null;
  })();

  const status: RowStatus =
    dueState === "overdue"
      ? "overdue"
      : needsAction && !done
        ? "notify"
        : dueState === "today"
          ? "today"
          : null;

  return {
    done,
    needsAction,
    pendingNotify,
    dueState,
    status,
    statusColor: status ? STATUS_COLOR[status] : null,
  };
}

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import dayjs from "dayjs";

import { dayKey } from "./daily-review";
import { useDailyReviewState } from "./daily-review-state";
import { useTauriEvent } from "./main-events";
import {
  type AssigneeAction,
  type DatesAction,
  type DetailsAction,
  type EditActionType,
  type LabelAction,
  type LabelRosterAction,
  openReviewPanel,
  type ReviewAction,
  type RosterAction,
  type StatusAction,
} from "./panel";
import { datesFromNewComments } from "./quick-add";
import { type ScratchpadConvert } from "./scratchpad";
import { useTodos } from "./todos";

/** Plain text of a comment's stored HTML, for date parsing (the comment itself
 * is left untouched - only its text is read). */
function htmlToText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

/**
 * Wire the floating panel windows (and Settings) back into the store. Each panel
 * runs in its own webview and can't reach the store directly, so it emits an
 * event the main window applies here.
 */
export function usePanelActionListeners() {
  // Apply status picks made in the floating panel back to the store.
  useTauriEvent<StatusAction>("status:action", ({ itemId, type, state }) => {
    const todos = useTodos.getState();
    if (type === "delete") todos.deleteItem(itemId);
    else if (state) todos.setItemState(itemId, state);
  });

  // Jump to an item picked from search: pin it past any active filter (so it
  // renders even when hidden), focus it, and bring the window forward.
  useTauriEvent<string>("search:focus", (id) => {
    const todos = useTodos.getState();
    todos.revealItem(id);
    todos.focusItem(id);
    void getCurrentWindow().setFocus();
  });

  // Clear the search pin from the panel's "Clear" control: the item drops back
  // under the active filter (hidden again if it doesn't match).
  useTauriEvent("search:reveal-clear", () => {
    useTodos.getState().revealItem(null);
  });

  // Apply comment-log changes made in the details panel back to the store. A
  // newly added or edited comment also feeds the date parser ("remind me tomorrow
  // at 15:00" / "due friday"): the comment text is left exactly as written, but a
  // recognized date sets the item's reminder / due date. Only freshly changed
  // comments are scanned, so reopening the panel doesn't re-derive old dates.
  useTauriEvent<DetailsAction>("details:action", ({ itemId, comments }) => {
    const todos = useTodos.getState();
    const item = todos.items.find((i) => i.id === itemId);
    const prevById = new Map((item?.comments ?? []).map((c) => [c.id, c.text]));
    const dates = datesFromNewComments(prevById, comments, htmlToText);
    todos.setItemComments(itemId, comments);
    // Merge onto the item: only overwrite the field a comment actually set.
    if (dates.notifyAt != null || dates.dueDate != null) {
      todos.setItemDates(itemId, {
        notifyAt: dates.notifyAt ?? item?.notifyAt,
        dueDate: dates.dueDate ?? item?.dueDate,
      });
    }
  });

  // Apply assignee changes made in the details panel: register any newly created
  // roster members first, then set the item's assignee list.
  useTauriEvent<AssigneeAction>("assignee:action", ({ itemId, assigneeIds, newAssignees }) => {
    const todos = useTodos.getState();
    newAssignees?.forEach((a) => todos.addAssignee(a));
    todos.setItemAssignees(itemId, assigneeIds);
  });

  // Apply label changes made in the details panel: register any newly created
  // roster members first, then set the item's label list.
  useTauriEvent<LabelAction>("label:action", ({ itemId, labelIds, newLabels }) => {
    const todos = useTodos.getState();
    newLabels?.forEach((l) => todos.addLabel(l));
    todos.setItemLabels(itemId, labelIds);
  });

  // Apply notification-time / due-date changes made in the details panel.
  useTauriEvent<DatesAction>("dates:action", ({ itemId, notifyAt, dueDate }) => {
    useTodos.getState().setItemDates(itemId, { notifyAt, dueDate });
  });

  // Snooze from the daily review: defer the item by `days`, so it drops off
  // today's queue and resurfaces later. "Defer", not "+days": an item overdue by
  // a week snoozes to tomorrow, not to one day past its (already-past) date - we
  // anchor to the later of its date and now, so the move is always forward. Due
  // dates are local-midnight date-only (kept that way); a fired reminder re-arms
  // (keeping its time of day) and its fired flag is cleared.
  useTauriEvent<ReviewAction>("review:action", ({ itemId, days }) => {
    const todos = useTodos.getState();
    const it = todos.items.find((i) => i.id === itemId);
    if (!it) return;
    const now = dayjs();
    const deferDay = (ms: number) => {
      const base = Math.max(dayjs(ms).startOf("day").valueOf(), now.startOf("day").valueOf());
      return dayjs(base).add(days, "day").startOf("day").valueOf();
    };
    const deferTime = (ms: number) =>
      dayjs(Math.max(ms, now.valueOf())).add(days, "day").valueOf();
    const reminder = it.notifyAt ?? it.notifiedAt;
    todos.setItemDates(itemId, {
      dueDate: it.dueDate != null ? deferDay(it.dueDate) : undefined,
      notifyAt: reminder != null ? deferTime(reminder) : undefined,
    });
    if (it.notifiedAt != null) todos.dismissNotification(itemId);
  });

  // Manual "Start now" from Settings (which runs in the panel webview and can't
  // reach the list store): open the review here, forced so it opens even with
  // nothing pending. Counts as engaging today, so the daily banner won't also nag.
  useTauriEvent("review:open", () => {
    useDailyReviewState.getState().markSeen(dayKey(Date.now()));
    void openReviewPanel({ force: true });
  });

  // Clear the "item being edited" row highlight when the panel hides (blur,
  // Escape, status pick, etc.). Opening a panel sets it; this is the close side.
  useTauriEvent("panel:closed", () => {
    useTodos.getState().setEditingId(null);
  });

  // Undo/redo forwarded from a focused panel window (which can't reach the
  // store itself).
  useTauriEvent<EditActionType>("edit:action", (type) => {
    const todos = useTodos.getState();
    if (type === "redo") todos.redo();
    else todos.undo();
  });

  // Convert a scratchpad selection into a list item (the scratchpad runs in its
  // own window and can't reach the list store). The first line is the item; any
  // remaining lines + embedded media become its first comment, whose attachment
  // files are copied from the scratchpad's media folder into the active list's so
  // the `media/<file>` refs resolve there.
  useTauriEvent<ScratchpadConvert>("scratchpad:convert", ({ text, comment, mediaFiles, mediaDir }) => {
    const todos = useTodos.getState();
    const listId = todos.activeId;
    void (async () => {
      if (listId && comment && mediaFiles.length) {
        await Promise.all(
          mediaFiles.map((file) =>
            invoke("import_attachment", {
              listId,
              src: `${mediaDir}/${file}`,
              fileName: file,
            }).catch(() => {}),
          ),
        );
      }
      todos.addItemWithComment(text, comment);
    })();
  });

  // Apply roster management changes made in Settings back to the store.
  useTauriEvent<RosterAction>("roster:action", (a) => {
    const todos = useTodos.getState();
    if (a.type === "add") todos.addAssignee(a.assignee);
    else if (a.type === "rename") todos.renameAssignee(a.id, a.name);
    else if (a.type === "recolor") todos.setAssigneeColor(a.id, a.color);
    else if (a.type === "remove") todos.removeAssignee(a.id);
  });

  // Apply label-roster management changes made in Settings back to the store.
  useTauriEvent<LabelRosterAction>("labelRoster:action", (a) => {
    const todos = useTodos.getState();
    if (a.type === "add") todos.addLabel(a.label);
    else if (a.type === "rename") todos.renameLabel(a.id, a.name);
    else if (a.type === "recolor") todos.setLabelColor(a.id, a.color);
    else if (a.type === "remove") todos.removeLabel(a.id);
  });
}

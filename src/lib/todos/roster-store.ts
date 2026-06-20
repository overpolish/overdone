/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type StoreApi } from "zustand";

import { type TodoData, type TodosState } from "./types";

/** Apply `updater` to items, recording an undo step (with coalescing). */
type Commit = (
  updater: (items: TodoData[]) => TodoData[],
  coalesceKey: string | null,
) => void;

/**
 * Roster (assignee + label) management actions, split out of the main store to
 * keep it lean. These mutate list-level state (the rosters), which lives outside
 * the items undo history (like `title`) and autosaves with the rest of the list;
 * a removal also strips the id from every item that referenced it, which is the
 * one part that goes through `commit` as a single undo step.
 *
 * `now` is passed in so it shares the store's single clock.
 */
export const createRosterActions = (
  set: StoreApi<TodosState>["setState"],
  commit: Commit,
  now: () => number,
): Pick<
  TodosState,
  | "addAssignee"
  | "renameAssignee"
  | "setAssigneeColor"
  | "removeAssignee"
  | "addLabel"
  | "renameLabel"
  | "setLabelColor"
  | "removeLabel"
> => ({
  // Roster ops live outside the items undo history (like `title`): a single
  // list-level field that autosaves with the rest of the list.
  addAssignee: (assignee) =>
    set((s) =>
      // Idempotent by id: the details panel may re-send a freshly created
      // entry alongside later edits, so guard against duplicates.
      s.assignees.some((a) => a.id === assignee.id)
        ? s
        : { assignees: [...s.assignees, assignee] },
    ),

  renameAssignee: (id, name) =>
    set((s) => ({
      assignees: s.assignees.map((a) => (a.id === id ? { ...a, name } : a)),
    })),

  setAssigneeColor: (id, color) =>
    set((s) => ({
      assignees: s.assignees.map((a) => (a.id === id ? { ...a, color } : a)),
    })),

  removeAssignee: (id) => {
    set((s) => ({ assignees: s.assignees.filter((a) => a.id !== id) }));
    // Strip the id from every item that referenced it (one undo step).
    commit(
      (items) =>
        items.map((i) =>
          i.assignees?.includes(id)
            ? { ...i, assignees: i.assignees.filter((x) => x !== id), updatedAt: now() }
            : i,
        ),
      null,
    );
  },

  // Label roster ops mirror the assignee ones: list-level state outside the
  // items undo history, autosaved with the rest of the list.
  addLabel: (label) =>
    set((s) =>
      s.labels.some((l) => l.id === label.id)
        ? s
        : { labels: [...s.labels, label] },
    ),

  renameLabel: (id, name) =>
    set((s) => ({
      labels: s.labels.map((l) => (l.id === id ? { ...l, name } : l)),
    })),

  setLabelColor: (id, color) =>
    set((s) => ({
      labels: s.labels.map((l) => (l.id === id ? { ...l, color } : l)),
    })),

  removeLabel: (id) => {
    set((s) => ({ labels: s.labels.filter((l) => l.id !== id) }));
    // Strip the id from every item that referenced it (one undo step).
    commit(
      (items) =>
        items.map((i) =>
          i.labels?.includes(id)
            ? { ...i, labels: i.labels.filter((x) => x !== id), updatedAt: now() }
            : i,
        ),
      null,
    );
  },
});

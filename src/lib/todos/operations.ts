/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { isStruck, type TodoState } from "../todo";
import { type TodoData } from "./types";

/**
 * Apply a new state to an item, stamping `updatedAt` and maintaining `doneAt`
 * (set on the first transition into `done`, cleared on leaving it).
 */
export function applyState(item: TodoData, state: TodoState, t: number): TodoData {
  return {
    ...item,
    state,
    updatedAt: t,
    doneAt: state === "done" ? (item.doneAt ?? t) : undefined,
    // Resolving an item (done/cancelled) dismisses any fired notification - it no
    // longer needs action. A still-scheduled `notifyAt` is kept (the scheduler
    // skips struck items), so reopening the item restores its reminder.
    notifiedAt: isStruck(state) ? undefined : item.notifiedAt,
  };
}

/**
 * Promote any sub-item that has no top-level item above it to a top item - the
 * only structurally-invalid case in the one-level model (a child belongs to the
 * nearest preceding depth-0 item).
 */
export function normalizeDepths(items: TodoData[]): TodoData[] {
  let sawTop = false;
  return items.map((it) => {
    if (it.depth === 0) {
      sawTop = true;
      return it;
    }
    return sawTop ? it : { ...it, depth: 0 };
  });
}

/**
 * Float pinned top-level blocks (a depth-0 parent plus its sub-items) to the
 * front of the list, preserving the relative order within the pinned and the
 * unpinned groups. A stable partition: this is the invariant the store keeps so
 * pinned items stay at the top under manual (drag) order, and it clamps a drag
 * that would otherwise move a pin below an unpinned item (or vice versa).
 * Returns the input unchanged when there's nothing to reorder.
 */
export function floatPinned(items: TodoData[]): TodoData[] {
  const blocks: TodoData[][] = [];
  for (const it of items) {
    if (it.depth === 0 || blocks.length === 0) blocks.push([it]);
    else blocks[blocks.length - 1].push(it);
  }
  const pinned = blocks.filter((b) => b[0].pinned);
  if (pinned.length === 0 || pinned.length === blocks.length) return items;
  const rest = blocks.filter((b) => !b[0].pinned);
  return [...pinned, ...rest].flat();
}

/** Whether the item at `i` is a top item with at least one sub-item. */
export function hasChildren(items: TodoData[], i: number): boolean {
  return items[i]?.depth === 0 && items[i + 1]?.depth === 1;
}

/** Remove an item; a deleted parent promotes its sub-items to top items. */
export function removeItem(items: TodoData[], id: string): TodoData[] {
  const i = items.findIndex((x) => x.id === id);
  if (i === -1) return items;
  const wasParent = hasChildren(items, i);
  const next = items.filter((x) => x.id !== id);
  if (wasParent) {
    for (let j = i; j < next.length && next[j].depth === 1; j++) {
      next[j] = { ...next[j], depth: 0 };
    }
  }
  return normalizeDepths(next);
}

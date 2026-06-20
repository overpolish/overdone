/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { isStruck } from "../todo";
import { applyState, floatPinned, normalizeDepths } from "./operations";
import { type TodoData, type TodosState } from "./types";

/** Apply `updater` to items, recording an undo step (with coalescing). */
type Commit = (
  updater: (items: TodoData[]) => TodoData[],
  coalesceKey: string | null,
) => void;

/**
 * Structural item actions (reorder / pin / indent / bulk state), split out of
 * the main store to keep it lean. These are pure item-array transforms run
 * through `commit` as a single undo step; they keep their public method names on
 * the store. `now` is passed in so it shares the store's single clock.
 */
export const createItemActions = (
  commit: Commit,
  now: () => number,
): Pick<
  TodosState,
  | "moveItem"
  | "moveItems"
  | "setItemsState"
  | "setItemsPinned"
  | "togglePin"
  | "indentItem"
  | "outdentItem"
> => ({
  moveItem: (id, dropIndex) =>
    commit((items) => {
      const from = items.findIndex((i) => i.id === id);
      if (from === -1) return items;
      // Drag a parent and its sub-items move together as one block.
      let blockLen = 1;
      if (items[from].depth === 0) {
        while (from + blockLen < items.length && items[from + blockLen].depth === 1) {
          blockLen++;
        }
      }
      const block = items.slice(from, from + blockLen);
      const without = [
        ...items.slice(0, from),
        ...items.slice(from + blockLen),
      ];
      // `dropIndex` is in the original coordinates; shift past the removed block.
      let to = dropIndex > from ? dropIndex - blockLen : dropIndex;
      to = Math.max(0, Math.min(to, without.length));
      const next = [...without.slice(0, to), ...block, ...without.slice(to)];
      // Re-float so a drag can't strand a pinned block below an unpinned one
      // (or push an unpinned item up into the pinned region).
      return floatPinned(normalizeDepths(next));
    }, null),

  moveItems: (ids, dropIndex) =>
    commit((items) => {
      const idSet = new Set(ids);
      // An item moves if it's selected, or it's a sub-item whose parent is
      // selected (a parent drags its children, matching single-item drag).
      let parentSelected = false;
      const moving = items.map((it) => {
        if (it.depth === 0) parentSelected = idSet.has(it.id);
        return idSet.has(it.id) || (it.depth === 1 && parentSelected);
      });
      if (!moving.some(Boolean)) return items;
      const block = items.filter((_, i) => moving[i]);
      const rest = items.filter((_, i) => !moving[i]);
      // `dropIndex` is in original coordinates; subtract the moving rows before
      // it to land in `rest`'s coordinates.
      const movedBefore = moving.slice(0, dropIndex).filter(Boolean).length;
      const to = Math.max(0, Math.min(dropIndex - movedBefore, rest.length));
      const next = [...rest.slice(0, to), ...block, ...rest.slice(to)];
      return floatPinned(normalizeDepths(next));
    }, null),

  setItemsState: (ids, state) =>
    commit((items) => {
      const idSet = new Set(ids);
      const t = now();
      const struck = isStruck(state);
      let next = items.map((it) => {
        if (!idSet.has(it.id)) return it;
        const applied = applyState(it, state, t);
        return struck && applied.pinned ? { ...applied, pinned: undefined } : applied;
      });
      // Cancelling a selected parent cancels its open sub-items too (see the
      // single-item setItemState).
      if (state === "cancelled") {
        for (let i = 0; i < next.length; i++) {
          if (!idSet.has(next[i].id) || next[i].depth !== 0) continue;
          for (let j = i + 1; j < next.length && next[j].depth === 1; j++) {
            if (next[j].state !== "done") next[j] = applyState(next[j], "cancelled", t);
          }
        }
      }
      return floatPinned(next);
    }, null),

  setItemsPinned: (ids, pinned) =>
    commit((items) => {
      const idSet = new Set(ids);
      const next = items.map((it) =>
        idSet.has(it.id) && it.depth === 0
          ? { ...it, pinned: pinned ? true : undefined, updatedAt: now() }
          : it,
      );
      return floatPinned(next);
    }, null),

  togglePin: (id) =>
    commit((items) => {
      const i = items.findIndex((x) => x.id === id);
      // Only top-level items pin; a sub-item would have to leave its parent to
      // reach the top, which `indentItem` already models the other way.
      if (i === -1 || items[i].depth !== 0) return items;
      const next = items.map((it, idx) =>
        idx === i ? { ...it, pinned: it.pinned ? undefined : true, updatedAt: now() } : it,
      );
      return floatPinned(next);
    }, null),

  indentItem: (id) =>
    commit((items) => {
      const i = items.findIndex((x) => x.id === id);
      // Need a top item above to nest under (guaranteed once `i > 0`, since the
      // first item is always depth 0). Indenting a parent flattens its
      // sub-items into siblings under the new parent (one level only).
      if (i <= 0 || items[i].depth !== 0) return items;
      // Becoming a sub-item drops any pin (only top-level items pin).
      const next = items.map((it, idx) =>
        idx === i ? { ...it, depth: 1, pinned: undefined, updatedAt: now() } : it,
      );
      return floatPinned(next);
    }, null),

  outdentItem: (id) =>
    commit((items) => {
      const i = items.findIndex((x) => x.id === id);
      if (i === -1 || items[i].depth !== 1) return items;
      const next = items.map((it, idx) =>
        idx === i ? { ...it, depth: 0, updatedAt: now() } : it,
      );
      // A freshly promoted top item is unpinned, so it sinks below any pins.
      return floatPinned(next);
    }, null),
});

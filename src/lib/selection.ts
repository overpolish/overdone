/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { create } from "zustand";

import { useTodos } from "./todos";

/**
 * Multi-select state for the item list: which item ids are selected, plus the
 * range anchor (the last item a selection gesture started from, used to extend a
 * shift-range). Purely transient - not persisted, not part of undo history, and
 * cleared whenever the active list changes. Bulk actions (drag, delete, copy,
 * set-status, pin) read {@link useSelection.getState}().ids.
 */
interface SelectionState {
  /** Selected item ids. */
  ids: Set<string>;
  /** The id a range selection extends from, or null. */
  anchor: string | null;
  /** Toggle one item in/out (Cmd/Ctrl-click); becomes the new anchor. */
  toggle: (id: string) => void;
  /** Replace the selection with exactly these ids, setting the anchor. */
  setRange: (ids: string[], anchor: string) => void;
  /** Remember the range anchor without changing the selection. */
  setAnchor: (id: string) => void;
  /** Drop the whole selection. */
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  ids: new Set(),
  anchor: null,

  toggle: (id) =>
    set((s) => {
      const ids = new Set(s.ids);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { ids, anchor: id };
    }),

  setRange: (ids, anchor) => set({ ids: new Set(ids), anchor }),

  setAnchor: (id) => set({ anchor: id }),

  clear: () => set((s) => (s.ids.size === 0 && s.anchor === null ? s : { ids: new Set(), anchor: null })),
}));

// A selection doesn't carry across lists: clear it when the active list changes.
// (todos never imports selection, so this one-way dependency is cycle-free.)
let lastActiveId = useTodos.getState().activeId;
useTodos.subscribe((s) => {
  if (s.activeId !== lastActiveId) {
    lastActiveId = s.activeId;
    useSelection.getState().clear();
  }
});

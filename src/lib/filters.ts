/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import dayjs from "dayjs";
import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { isStruck, type TodoState } from "./todo";
import { type TodoData, useTodos } from "./todos";

/** View-sort key. `manual` keeps the list's stored (drag) order. */
export type SortKey = "manual" | "updated" | "created" | "due";
export type SortDir = "asc" | "desc";
/** Three-way switch for the presence filters (ignore / require / exclude). */
export type Tri = "any" | "yes" | "no";
/** Due-date bucket. `has`/`none` test presence; the rest test the date window. */
export type DueFilter = "any" | "overdue" | "today" | "week" | "has" | "none";

export interface FilterCriteria {
  /** Empty = any; otherwise item.state must be in the set. */
  states: TodoState[];
  /** Label ids; empty = any; else the item must carry ANY of them. */
  labels: string[];
  /** Assignee ids; empty = any; else the item must have ANY of them. */
  assignees: string[];
  due: DueFilter;
  hasComments: Tri;
  /** A scheduled (notifyAt) or fired (notifiedAt) reminder. */
  hasReminder: Tri;
  sort: SortKey;
  sortDir: SortDir;
}

export interface SavedFilter {
  id: string;
  name: string;
  /** True = usable on every list; false = scoped to `listId`. */
  global: boolean;
  /** Owner list when not global. */
  listId?: string;
  criteria: FilterCriteria;
}

/** A blank filter: nothing narrowed, stored order. */
export function emptyCriteria(): FilterCriteria {
  return {
    states: [],
    labels: [],
    assignees: [],
    due: "any",
    hasComments: "any",
    hasReminder: "any",
    sort: "manual",
    sortDir: "desc",
  };
}

/** Whether any criterion narrows the visible set (drives item hiding). */
export function hasActiveCriteria(c: FilterCriteria): boolean {
  return (
    c.states.length > 0 ||
    c.labels.length > 0 ||
    c.assignees.length > 0 ||
    c.due !== "any" ||
    c.hasComments !== "any" ||
    c.hasReminder !== "any"
  );
}

/** Whether the view differs from the raw stored list - hiding *or* sorting.
 * Drives the warning-colored titlebar button and disables drag-reorder. */
export function isViewAltered(c: FilterCriteria): boolean {
  return hasActiveCriteria(c) || c.sort !== "manual";
}

interface DueBounds {
  todayStart: number;
  todayEnd: number;
  weekEnd: number;
}

/** Day-aligned epoch boundaries for the due-date buckets, from the current clock. */
function dueBounds(): DueBounds {
  const start = dayjs().startOf("day");
  return {
    todayStart: start.valueOf(),
    todayEnd: start.add(1, "day").valueOf(),
    weekEnd: start.add(7, "day").valueOf(),
  };
}

function matchesDue(item: TodoData, due: DueFilter, b: DueBounds): boolean {
  if (due === "any") return true;
  const d = item.dueDate;
  switch (due) {
    case "has":
      return d != null;
    case "none":
      return d == null;
    // Overdue excludes resolved items - a finished task isn't "overdue".
    case "overdue":
      return d != null && d < b.todayStart && !isStruck(item.state);
    case "today":
      return d != null && d >= b.todayStart && d < b.todayEnd;
    case "week":
      return d != null && d >= b.todayStart && d < b.weekEnd;
  }
}

/** Whether a single item satisfies every (AND-ed) criterion category. */
export function matchesCriteria(
  item: TodoData,
  c: FilterCriteria,
  bounds: DueBounds = dueBounds(),
): boolean {
  if (c.states.length && !c.states.includes(item.state)) return false;
  if (c.labels.length && !(item.labels ?? []).some((l) => c.labels.includes(l))) {
    return false;
  }
  if (c.assignees.length && !(item.assignees ?? []).some((a) => c.assignees.includes(a))) {
    return false;
  }
  if (!matchesDue(item, c.due, bounds)) return false;
  if (c.hasComments !== "any") {
    const has = (item.comments?.length ?? 0) > 0;
    if (c.hasComments === "yes" ? !has : has) return false;
  }
  if (c.hasReminder !== "any") {
    const has = item.notifyAt != null || item.notifiedAt != null;
    if (c.hasReminder === "yes" ? !has : has) return false;
  }
  return true;
}

/**
 * Apply a filter to the list for display: hide non-matching items, then
 * view-sort. Structure is preserved - items are grouped into top-level blocks
 * (a depth-0 parent plus its depth-1 children):
 *
 * - A child is shown iff it matches.
 * - A parent is shown iff it matches *or* any of its children is shown (so a
 *   matching sub-item keeps its parent for context).
 * - When sorting, only top blocks are reordered (by the parent's field);
 *   children stay attached, in their stored order. Missing values sort last.
 *
 * A pinned (top-level) item is always shown, even when the filter would hide it:
 * pinning means "keep this important item in view no matter the current filter".
 * It still floats to the top like any pin.
 *
 * `revealId` pins one item past the filter: it (and, for a child, its parent for
 * context) is kept visible even when it doesn't match, so jumping to a search
 * hit doesn't land on a hidden row. It rides along the normal block flow, so a
 * sub-item lands under its parent and the whole block view-sorts as usual.
 *
 * Returns the original array untouched when nothing is filtered or sorted.
 */
export function applyFilter(
  items: TodoData[],
  c: FilterCriteria,
  revealId?: string | null,
): TodoData[] {
  if (!hasActiveCriteria(c) && c.sort === "manual") return items;
  const bounds = dueBounds();
  // A pinned item always shows (that's the point of pinning - keep it visible no
  // matter the filter), as does the one item pinned from search.
  const match = (it: TodoData) =>
    it.pinned || it.id === revealId || matchesCriteria(it, c, bounds);

  interface Block {
    parent: TodoData;
    children: TodoData[];
  }
  const blocks: Block[] = [];
  for (const it of items) {
    if (it.depth === 0 || blocks.length === 0) blocks.push({ parent: it, children: [] });
    else blocks[blocks.length - 1].children.push(it);
  }

  let visible = blocks
    .map((b): Block | null => {
      const children = b.children.filter(match);
      return match(b.parent) || children.length > 0 ? { parent: b.parent, children } : null;
    })
    .filter((b): b is Block => b !== null);

  if (c.sort !== "manual") {
    const field = (it: TodoData): number | undefined =>
      c.sort === "updated" ? it.updatedAt : c.sort === "created" ? it.createdAt : it.dueDate;
    const dir = c.sortDir === "asc" ? 1 : -1;
    visible = visible.slice().sort((a, b) => {
      const av = field(a.parent);
      const bv = field(b.parent);
      // Items missing the sort field always sink to the bottom, either direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
    // Pins stay on top regardless of the view-sort: a stable partition keeps the
    // just-sorted order within the pinned and unpinned groups. (Manual order
    // already carries pins first from the store, so it needs no extra pass.)
    visible = [
      ...visible.filter((b) => b.parent.pinned),
      ...visible.filter((b) => !b.parent.pinned),
    ];
  }

  return visible.flatMap((b) => [b.parent, ...b.children]);
}

const STORAGE_NAME = "overdone-filters";
const CHANNEL_NAME = "overdone:filters";

interface FiltersState {
  /** Active criteria keyed by list id. Persisted, so each list reopens with the
   * filter it last had; survives list switches within a session and syncs across
   * windows. */
  active: Record<string, FilterCriteria>;
  /** Saved filters (persisted). */
  saved: SavedFilter[];
  setCriteria: (listId: string, criteria: FilterCriteria) => void;
  patchCriteria: (listId: string, patch: Partial<FilterCriteria>) => void;
  clear: (listId: string) => void;
  saveFilter: (name: string, global: boolean, listId: string, criteria: FilterCriteria) => void;
  deleteSaved: (id: string) => void;
}

export const useFilters = create<FiltersState>()(
  persist(
    (set) => ({
      active: {},
      saved: [],

      setCriteria: (listId, criteria) =>
        set((s) => ({ active: { ...s.active, [listId]: criteria } })),

      patchCriteria: (listId, patch) =>
        set((s) => ({
          active: {
            ...s.active,
            [listId]: { ...(s.active[listId] ?? emptyCriteria()), ...patch },
          },
        })),

      clear: (listId) =>
        set((s) => {
          const next = { ...s.active };
          delete next[listId];
          return { active: next };
        }),

      saveFilter: (name, global, listId, criteria) =>
        set((s) => ({
          saved: [
            ...s.saved,
            {
              id: crypto.randomUUID(),
              name: name.trim(),
              global,
              listId: global ? undefined : listId,
              criteria,
            },
          ],
        })),

      deleteSaved: (id) =>
        set((s) => ({ saved: s.saved.filter((f) => f.id !== id) })),
    }),
    {
      name: STORAGE_NAME,
      storage: createJSONStorage(() => localStorage),
      // Persist both the saved filters and the per-list active criteria, so a
      // list reopens with the filter it last had instead of resetting.
      partialize: (state) => ({ saved: state.saved, active: state.active }),
    },
  ),
);

/** The active list's criteria, or a blank filter when none/unknown. */
export function criteriaOf(listId: string | null): FilterCriteria {
  if (!listId) return emptyCriteria();
  return useFilters.getState().active[listId] ?? emptyCriteria();
}

/** The active list's items with its filter applied (hidden + view-sorted), for
 * the main window to render. Recomputes only when the items or criteria change. */
export function useVisibleItems(): TodoData[] {
  const items = useTodos((s) => s.items);
  const activeId = useTodos((s) => s.activeId);
  const revealedId = useTodos((s) => s.revealedId);
  const criteria = useFilters((s) => (activeId ? s.active[activeId] : undefined));
  return useMemo(
    () => applyFilter(items, criteria ?? emptyCriteria(), revealedId),
    [items, criteria, revealedId],
  );
}

/** Whether a search pin is actually forcing an otherwise-hidden item into view:
 * something is filtered *and* the pinned item wouldn't show without the pin.
 * A pin set while unfiltered (no visible effect) doesn't count - so it neither
 * ambers the search button nor offers a clear control. */
export function isRevealEffective(
  items: TodoData[],
  c: FilterCriteria,
  revealedId: string | null,
): boolean {
  if (!revealedId || !hasActiveCriteria(c)) return false;
  if (!items.some((i) => i.id === revealedId)) return false;
  return !applyFilter(items, c).some((i) => i.id === revealedId);
}

/** Whether the active list has an effective search pin (see {@link
 * isRevealEffective}), for the amber search button. */
export function useRevealActive(): boolean {
  const items = useTodos((s) => s.items);
  const activeId = useTodos((s) => s.activeId);
  const revealedId = useTodos((s) => s.revealedId);
  const criteria = useFilters((s) => (activeId ? s.active[activeId] : undefined));
  return useMemo(
    () => isRevealEffective(items, criteria ?? emptyCriteria(), revealedId),
    [items, criteria, revealedId],
  );
}

// Cross-window sync. localStorage's `storage` event is unreliable across Tauri
// webviews, so both `active` and `saved` are broadcast explicitly (mirroring the
// settings store). `applyingRemote` breaks the received -> set -> broadcast echo.
if (typeof BroadcastChannel !== "undefined") {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  let applyingRemote = false;

  useFilters.subscribe((state) => {
    if (applyingRemote) return;
    channel.postMessage({ active: state.active, saved: state.saved });
  });

  channel.onmessage = (event) => {
    applyingRemote = true;
    try {
      useFilters.setState(event.data as Pick<FiltersState, "active" | "saved">);
    } finally {
      applyingRemote = false;
    }
  };
}

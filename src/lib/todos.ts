import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { parseList } from "./markdown";
import { referencedMedia } from "./media";
import { type TodoState } from "./todo";

/** A person who can be assigned to items, scoped to a single list's roster. */
export interface Assignee {
  id: string;
  /** Display name, free-form. Drives the avatar's initials. */
  name: string;
  /** Mantine color-family name (e.g. "blue"), registered in the theme. */
  color: string;
}

/** A single timestamped comment in an item's traceable comment log. */
export interface Comment {
  id: string;
  text: string;
  /** Epoch ms when the comment was posted. */
  createdAt: number;
  /** Epoch ms of the last edit, if it's been edited since posting. */
  editedAt?: number;
}

export interface TodoData {
  id: string;
  text: string;
  state: TodoState;
  /** Nesting level: 0 = top item, 1 = sub-item. Only one level is supported. */
  depth: number;
  /** Epoch ms when the item was created. Absent for legacy items loaded from
   * files written before metadata was tracked. */
  createdAt?: number;
  /** Epoch ms of the last edit to the item's text, state, or nesting. */
  updatedAt?: number;
  /** Epoch ms when the item entered the `done` state; cleared when it leaves. */
  doneAt?: number;
  /** Traceable comment log attached to the item, edited in the details panel. */
  comments?: Comment[];
  /** Ids of the list-roster assignees on this item (see `Assignee`). */
  assignees?: string[];
}

/** Wall-clock now, in epoch ms — the single clock the store stamps from. */
const now = () => Date.now();

/**
 * Apply a new state to an item, stamping `updatedAt` and maintaining `doneAt`
 * (set on the first transition into `done`, cleared on leaving it).
 */
function applyState(item: TodoData, state: TodoState, t: number): TodoData {
  return {
    ...item,
    state,
    updatedAt: t,
    doneAt: state === "done" ? (item.doneAt ?? t) : undefined,
  };
}

/**
 * Promote any sub-item that has no top-level item above it to a top item — the
 * only structurally-invalid case in the one-level model (a child belongs to the
 * nearest preceding depth-0 item).
 */
function normalizeDepths(items: TodoData[]): TodoData[] {
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
 * Recompute every parent's done state from its children: done when all children
 * are done, and un-done (→ todo) if it was done but they aren't. A parent's
 * non-done state is left alone otherwise.
 */
function withRollup(items: TodoData[], t = now()): TodoData[] {
  const out = items.slice();
  for (let i = 0; i < out.length; i++) {
    if (out[i].depth !== 0) continue;
    const kids: TodoData[] = [];
    for (let j = i + 1; j < out.length && out[j].depth === 1; j++) kids.push(out[j]);
    if (kids.length === 0) continue;
    const allDone = kids.every((k) => k.state === "done");
    if (allDone && out[i].state !== "done") out[i] = applyState(out[i], "done", t);
    else if (!allDone && out[i].state === "done") out[i] = applyState(out[i], "todo", t);
  }
  return out;
}

/** Whether the item at `i` is a top item with at least one sub-item. */
function hasChildren(items: TodoData[], i: number): boolean {
  return items[i]?.depth === 0 && items[i + 1]?.depth === 1;
}

/** Remove an item; a deleted parent promotes its sub-items to top items. */
function removeItem(items: TodoData[], id: string): TodoData[] {
  const i = items.findIndex((x) => x.id === id);
  if (i === -1) return items;
  const wasParent = hasChildren(items, i);
  const next = items.filter((x) => x.id !== id);
  if (wasParent) {
    for (let j = i; j < next.length && next[j].depth === 1; j++) {
      next[j] = { ...next[j], depth: 0 };
    }
  }
  return normalizeDepths(withRollup(next));
}

interface TodosState {
  /** Id (uuid file stem) of the list currently loaded, or null before init. */
  activeId: string | null;
  /** Title of the active list (the markdown `# ` heading). */
  title: string;
  /**
   * The active list's assignee roster. List-level state (like `title`), kept
   * outside the items undo history; items reference entries here by id.
   */
  assignees: Assignee[];
  items: TodoData[];
  /** Past/future snapshots of `items` for undo/redo. */
  past: TodoData[][];
  future: TodoData[][];
  /**
   * Key of the last committed action. Consecutive commits sharing a non-null
   * key (e.g. typing in one field) collapse into a single undo step instead of
   * one step per keystroke.
   */
  lastKey: string | null;
  /**
   * Id of an item whose text field should grab focus on its next render
   * (set when a new item is created). Transient — not part of undo history.
   */
  focusId: string | null;
  /**
   * Where to place the caret when `focusId` grabs focus: `end` (the default,
   * e.g. a newly created item) or `start` (e.g. arrowing down into the next
   * item, so the caret lands where the eye is).
   */
  focusCaret: "start" | "end";
  /**
   * When true, the list title field should grab focus and select its contents
   * on the next render (set when a freshly-created, untitled list is opened).
   */
  focusTitle: boolean;

  setItemState: (id: string, state: TodoState) => void;
  setItemText: (id: string, text: string) => void;
  /**
   * Replace an item's comment log. The details panel owns the editing session
   * (add/edit/delete) and sends the whole updated array; the store just
   * persists it.
   */
  setItemComments: (id: string, comments: Comment[]) => void;
  /** Replace an item's assignee list (ids into the roster). */
  setItemAssignees: (id: string, assignees: string[]) => void;
  /** Add a new person to the roster. */
  addAssignee: (assignee: Assignee) => void;
  /** Rename a roster member (propagates everywhere, since items hold ids). */
  renameAssignee: (id: string, name: string) => void;
  /** Recolor a roster member. */
  setAssigneeColor: (id: string, color: string) => void;
  /** Remove a roster member and unassign it from every item. */
  removeAssignee: (id: string) => void;
  setTitle: (title: string) => void;
  deleteItem: (id: string) => void;
  /** Delete an item and move focus to its neighbour (previous, else next). */
  deleteItemFocusNeighbor: (id: string) => void;
  /**
   * Move an item to a new position. `dropIndex` is the gap it's dropped into,
   * 0..length (as computed from the drop indicator).
   */
  moveItem: (id: string, dropIndex: number) => void;
  /** Make an item a sub-item of the item above it (one level only). */
  indentItem: (id: string) => void;
  /** Promote a sub-item back to a top item. */
  outdentItem: (id: string) => void;
  /** Insert an empty sub-item under a top item and focus it. */
  addSubItem: (parentId: string) => void;
  /** Insert a new (empty by default) item at the top and focus it. */
  addItem: (initialText?: string) => void;
  clearFocus: () => void;
  clearFocusTitle: () => void;
  /** Focus an item's text field (e.g. when picked from search). */
  focusItem: (id: string, caret?: "start" | "end") => void;
  /** Load a list's markdown from disk into the store, resetting undo history. */
  open: (id: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
}

export const useTodos = create<TodosState>((set, get) => {
  /** Apply `updater` to items, recording an undo step (with coalescing). */
  const commit = (
    updater: (items: TodoData[]) => TodoData[],
    coalesceKey: string | null,
  ) => {
    const { items, past, lastKey } = get();
    const next = updater(items);
    const coalesce = coalesceKey != null && coalesceKey === lastKey;
    set({
      items: next,
      // When coalescing, keep the existing past so undo jumps back to before
      // the run of edits started.
      past: coalesce ? past : [...past, items],
      future: [],
      lastKey: coalesceKey,
    });
  };

  return {
    activeId: null,
    title: "",
    assignees: [],
    items: [],
    past: [],
    future: [],
    lastKey: null,
    focusId: null,
    focusCaret: "end",
    focusTitle: false,

    setItemState: (id, state) =>
      commit((items) => {
        const i = items.findIndex((x) => x.id === id);
        if (i === -1) return items;
        const t = now();
        let next = items.map((it, idx) => (idx === i ? applyState(it, state, t) : it));
        // Setting a parent cascades to all its sub-items (group control).
        if (next[i].depth === 0) {
          for (let j = i + 1; j < next.length && next[j].depth === 1; j++) {
            next[j] = applyState(next[j], state, t);
          }
        }
        // Setting a sub-item rolls its done state up to the parent.
        return withRollup(next, t);
      }, null),

    setItemText: (id, text) =>
      commit(
        (items) =>
          items.map((i) =>
            i.id === id ? { ...i, text, updatedAt: now() } : i,
          ),
        `text:${id}`,
      ),

    setItemComments: (id, comments) =>
      commit(
        (items) =>
          items.map((i) =>
            i.id === id ? { ...i, comments, updatedAt: now() } : i,
          ),
        // Coalesce a session's add/edit/delete bursts into one undo step.
        `comments:${id}`,
      ),

    setItemAssignees: (id, assignees) =>
      commit(
        (items) =>
          items.map((i) =>
            i.id === id ? { ...i, assignees, updatedAt: now() } : i,
          ),
        // Coalesce a session's add/remove bursts into one undo step.
        `assignees:${id}`,
      ),

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

    // Title lives outside the items undo history; it's a single field that
    // autosaves like the rest of the list.
    setTitle: (title) => set({ title }),

    deleteItem: (id) => commit((items) => removeItem(items, id), null),

    deleteItemFocusNeighbor: (id) => {
      const { items } = get();
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) return;
      // Previous item if there is one, otherwise the next; null when it was the
      // only item. The focus effect places the caret at the end.
      const neighbor = items[idx - 1] ?? items[idx + 1];
      commit((items) => removeItem(items, id), null);
      set({ focusId: neighbor ? neighbor.id : null });
    },

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
        return normalizeDepths(withRollup(next));
      }, null),

    indentItem: (id) =>
      commit((items) => {
        const i = items.findIndex((x) => x.id === id);
        // Need a top item above to nest under (guaranteed once `i > 0`, since the
        // first item is always depth 0). Indenting a parent flattens its
        // sub-items into siblings under the new parent (one level only).
        if (i <= 0 || items[i].depth !== 0) return items;
        const next = items.map((it, idx) =>
          idx === i ? { ...it, depth: 1, updatedAt: now() } : it,
        );
        return withRollup(next);
      }, null),

    outdentItem: (id) =>
      commit((items) => {
        const i = items.findIndex((x) => x.id === id);
        if (i === -1 || items[i].depth !== 1) return items;
        const next = items.map((it, idx) =>
          idx === i ? { ...it, depth: 0, updatedAt: now() } : it,
        );
        return withRollup(next);
      }, null),

    addSubItem: (parentId) => {
      const id = crypto.randomUUID();
      commit((items) => {
        const i = items.findIndex((x) => x.id === parentId);
        if (i === -1 || items[i].depth !== 0) return items; // only top items
        // Insert after the parent's existing sub-items.
        let at = i + 1;
        while (at < items.length && items[at].depth === 1) at++;
        const next = items.slice();
        const t = now();
        next.splice(at, 0, {
          id,
          text: "",
          state: "todo",
          depth: 1,
          createdAt: t,
          updatedAt: t,
        });
        return withRollup(next);
      }, `text:${id}`);
      set({ focusId: id });
    },

    addItem: (initialText = "") => {
      const id = crypto.randomUUID();
      // Coalesce under the same key the text field uses, so creating an item
      // and typing its first words collapse into a single undo step.
      commit((items) => {
        const t = now();
        return [
          { id, text: initialText, state: "todo", depth: 0, createdAt: t, updatedAt: t },
          ...items,
        ];
      }, `text:${id}`);
      set({ focusId: id });
    },

    // Reset the caret hint to its default as focus is consumed, so a one-off
    // `start` (arrow-down) doesn't leak into the next focus.
    clearFocus: () => set({ focusId: null, focusCaret: "end" }),

    clearFocusTitle: () => set({ focusTitle: false }),

    focusItem: (id, caret = "end") => set({ focusId: id, focusCaret: caret }),

    open: async (id) => {
      let content = "";
      try {
        content = await invoke<string>("read_list", { id });
      } catch {
        // Missing/unreadable file: start from an empty list.
      }
      const { title, items, assignees } = parseList(content);
      set({
        activeId: id,
        title,
        assignees,
        // Fix any structural quirks and ensure parent states match their kids.
        items: withRollup(normalizeDepths(items)),
        past: [],
        future: [],
        lastKey: null,
        focusId: null,
        // A fresh, untitled list opens with its title field focused for naming.
        focusTitle: title === "",
      });
      // Clear orphaned attachments (no unsaved drafts exist at load time, so any
      // unreferenced media file is genuinely stale).
      const keep = referencedMedia(
        items.flatMap((it) => (it.comments ?? []).map((c) => c.text)),
      );
      void invoke("prune_media", { listId: id, keep });
    },

    undo: () => {
      const { past, future, items } = get();
      if (past.length === 0) return;
      set({
        items: past[past.length - 1],
        past: past.slice(0, -1),
        future: [items, ...future],
        lastKey: null,
      });
    },

    redo: () => {
      const { past, future, items } = get();
      if (future.length === 0) return;
      set({
        items: future[0],
        past: [...past, items],
        future: future.slice(1),
        lastKey: null,
      });
    },
  };
});

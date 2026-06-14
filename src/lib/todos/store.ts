import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { parseList } from "../markdown";
import { referencedMedia } from "../media";
import { applyState, normalizeDepths, removeItem } from "./operations";
import { type Comment, type TodoData, type TodosState } from "./types";

/** Wall-clock now, in epoch ms — the single clock the store stamps from. */
const now = () => Date.now();

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
    editingId: null,

    setItemState: (id, state) =>
      commit((items) => {
        const i = items.findIndex((x) => x.id === id);
        if (i === -1) return items;
        const t = now();
        const next = items.map((it, idx) => (idx === i ? applyState(it, state, t) : it));
        // Cancelling a parent cancels its sub-items too — except any already
        // done (a finished sub-task stays done). No other state cascades, and
        // nothing rolls up: completion is per-item and explicit, since a parent's
        // sub-items may be a partial list rather than the whole picture.
        if (state === "cancelled" && next[i].depth === 0) {
          for (let j = i + 1; j < next.length && next[j].depth === 1; j++) {
            if (next[j].state !== "done") next[j] = applyState(next[j], "cancelled", t);
          }
        }
        return next;
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

    setItemDates: (id, dates) =>
      commit(
        (items) =>
          items.map((i) =>
            // Spread the pair so an absent (undefined) field is cleared, not kept.
            i.id === id ? { ...i, ...dates, updatedAt: now() } : i,
          ),
        // Coalesce repeated edits to the same item's dates into one undo step.
        `dates:${id}`,
      ),

    // Notification state changes go through `set` (not `commit`): firing is an
    // automatic, time-driven event, so it shouldn't land on the undo stack — but
    // a new `items` array still triggers autosave so the flag persists.
    markNotified: (id) =>
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id ? { ...i, notifyAt: undefined, notifiedAt: now() } : i,
        ),
      })),

    dismissNotification: (id) =>
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id ? { ...i, notifiedAt: undefined } : i,
        ),
      })),

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
        return normalizeDepths(next);
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
        return next;
      }, null),

    outdentItem: (id) =>
      commit((items) => {
        const i = items.findIndex((x) => x.id === id);
        if (i === -1 || items[i].depth !== 1) return items;
        const next = items.map((it, idx) =>
          idx === i ? { ...it, depth: 0, updatedAt: now() } : it,
        );
        return next;
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
        return next;
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

    setEditingId: (id) => set({ editingId: id }),

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
        // Fix any structural quirks (item states are taken as-is — no rollup).
        items: normalizeDepths(items),
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
        items.flatMap((it) => (it.comments ?? []).map((c: Comment) => c.text)),
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

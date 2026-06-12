import { create } from "zustand";

import { type TodoState } from "./todo";

export interface TodoData {
  id: string;
  text: string;
  state: TodoState;
}

interface TodosState {
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

  setItemState: (id: string, state: TodoState) => void;
  setItemText: (id: string, text: string) => void;
  deleteItem: (id: string) => void;
  /** Insert a new (empty by default) item at the top and focus it. */
  addItem: (initialText?: string) => void;
  clearFocus: () => void;
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
    items: [{ id: "dummy", text: "Click the checkbox to set a status", state: "todo" }],
    past: [],
    future: [],
    lastKey: null,
    focusId: null,

    setItemState: (id, state) =>
      commit(
        (items) => items.map((i) => (i.id === id ? { ...i, state } : i)),
        null,
      ),

    setItemText: (id, text) =>
      commit(
        (items) => items.map((i) => (i.id === id ? { ...i, text } : i)),
        `text:${id}`,
      ),

    deleteItem: (id) =>
      commit((items) => items.filter((i) => i.id !== id), null),

    addItem: (initialText = "") => {
      const id = crypto.randomUUID();
      // Coalesce under the same key the text field uses, so creating an item
      // and typing its first words collapse into a single undo step.
      commit(
        (items) => [{ id, text: initialText, state: "todo" }, ...items],
        `text:${id}`,
      );
      set({ focusId: id });
    },

    clearFocus: () => set({ focusId: null }),

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

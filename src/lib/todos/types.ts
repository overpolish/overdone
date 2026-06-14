/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type TodoState } from "../todo";

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
  /** Epoch ms for a scheduled notification (date AND time), set in details. */
  notifyAt?: number;
  /** Epoch ms when a scheduled notification fired — the item "needs action"
   * (shown amber, with a bell) until the user dismisses it. */
  notifiedAt?: number;
  /** Epoch ms (UTC midnight) of the item's due date — date only, no time. */
  dueDate?: number;
}

export interface TodosState {
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
  /**
   * Id of the item whose editing panel (details / assignees / status) is
   * currently open, so its row can be highlighted as "being edited". Null when
   * no item-scoped panel is open. Transient — not part of undo history.
   */
  editingId: string | null;

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
  /**
   * Set an item's notification time and/or due date. Both are passed each call
   * (the details panel owns the editing session and sends the current pair), so
   * an absent value clears that field. One commit, so they coalesce into a
   * single undo step.
   */
  setItemDates: (
    id: string,
    dates: { notifyAt?: number; dueDate?: number },
  ) => void;
  /** A scheduled notification fired: clear notifyAt and flag the item as needing
   * action (amber + bell in the list) until dismissed. */
  markNotified: (id: string) => void;
  /** Acknowledge a fired notification (the bell): clear the needs-action flag. */
  dismissNotification: (id: string) => void;
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
  /** Set (or clear, with null) the item whose editing panel is open. */
  setEditingId: (id: string | null) => void;
  /** Focus an item's text field (e.g. when picked from search). */
  focusItem: (id: string, caret?: "start" | "end") => void;
  /** Load a list's markdown from disk into the store, resetting undo history. */
  open: (id: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
}

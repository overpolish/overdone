/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type QuickAddParse } from "../quick-add";
import { type TodoState } from "../todo";

/** A person who can be assigned to items, scoped to a single list's roster. */
export interface Assignee {
  id: string;
  /** Display name, free-form. Drives the avatar's initials. */
  name: string;
  /** `#rrggbb` hex for the avatar background (see lib/assignee). Older lists may
   * still carry a `var(--mantine-color-…)` value, handled on render. */
  color: string;
}

/** A colored, named tag that can be applied to items, scoped to a list's roster.
 * Renders as a GitHub-style badge; its color is assigned randomly on creation. */
export interface Label {
  id: string;
  /** Display name, free-form. Shown on the badge. */
  name: string;
  /** `#rrggbb` hex; tinted into a translucent badge per scheme (see lib/label).
   * Older lists may carry a family name or `var(--mantine-color-…)`, handled on
   * render. */
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
  /** Ids of the list-roster labels on this item (see `Label`). */
  labels?: string[];
  /** Epoch ms for a scheduled notification (date AND time), set in details. */
  notifyAt?: number;
  /** Epoch ms when a scheduled notification fired - the item "needs action"
   * (shown amber, with a bell) until the user dismisses it. */
  notifiedAt?: number;
  /** Epoch ms (UTC midnight) of the item's due date - date only, no time. */
  dueDate?: number;
  /** Pinned items (top-level only) float to the top of the list and stay there
   * under manual order, until the item is resolved (done/cancelled), which drops
   * the pin. Absent/false = a normal, unpinned item. */
  pinned?: boolean;
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
  /**
   * The active list's label roster. List-level state (like `assignees`), kept
   * outside the items undo history; items reference entries here by id.
   */
  labels: Label[];
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
   * (set when a new item is created). Transient - not part of undo history.
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
   * no item-scoped panel is open. Transient - not part of undo history.
   */
  editingId: string | null;
  /**
   * Id of an item to keep visible even when the active filter would hide it,
   * set when jumping to a search hit so the row renders and can take focus.
   * Stays pinned until the list is switched. Transient - not undo history.
   */
  revealedId: string | null;

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
  /** Replace an item's label list (ids into the label roster). */
  setItemLabels: (id: string, labels: string[]) => void;
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
  /** Add a new label to the label roster. */
  addLabel: (label: Label) => void;
  /** Rename a label (propagates everywhere, since items hold ids). */
  renameLabel: (id: string, name: string) => void;
  /** Recolor a label. */
  setLabelColor: (id: string, color: string) => void;
  /** Remove a label and strip it from every item. */
  removeLabel: (id: string) => void;
  setTitle: (title: string) => void;
  deleteItem: (id: string) => void;
  /** Delete an item and move focus to its neighbour (previous, else next). */
  deleteItemFocusNeighbor: (id: string) => void;
  /**
   * Move an item to a new position. `dropIndex` is the gap it's dropped into,
   * 0..length (as computed from the drop indicator).
   */
  moveItem: (id: string, dropIndex: number) => void;
  /** Toggle a top-level item's pinned flag, re-floating pinned items to the top.
   * No-op on sub-items (only top-level items pin). */
  togglePin: (id: string) => void;
  /** Make an item a sub-item of the item above it (one level only). */
  indentItem: (id: string) => void;
  /** Promote a sub-item back to a top item. */
  outdentItem: (id: string) => void;
  /** Insert an empty sub-item under a top item and focus it. */
  addSubItem: (parentId: string) => void;
  /** Insert a new (empty by default) item at the top and focus it. */
  addItem: (initialText?: string) => void;
  /**
   * Insert a new item at the top with `text`, optionally seeding its first
   * comment with `commentHtml` (stored HTML). Used by the scratchpad's convert
   * action: the note's first line becomes the item, the rest its first comment.
   * One undo step; focuses the new item.
   */
  addItemWithComment: (text: string, commentHtml?: string) => void;
  /**
   * Apply a parsed quick-add result to an item in one undo step: mint any new
   * roster people/labels, then merge the extracted assignees, labels, and dates
   * onto the item alongside its cleaned text. New roster entries are added like
   * the other roster ops (outside the items history); the item edit is a single
   * commit so the whole quick-add collapses to one undo. No-op fields are left
   * untouched (a quick-add that found no date won't clear an existing one).
   */
  applyQuickAdd: (id: string, parsed: QuickAddParse) => void;
  clearFocus: () => void;
  clearFocusTitle: () => void;
  /** Set (or clear, with null) the item whose editing panel is open. */
  setEditingId: (id: string | null) => void;
  /** Focus an item's text field (e.g. when picked from search). */
  focusItem: (id: string, caret?: "start" | "end") => void;
  /** Pin an item (picked from search) so an active filter can't hide it, until
   * the list is switched. Pair with {@link focusItem} to jump to it; pass null
   * to drop the pin (the "Clear" control in the search panel). */
  revealItem: (id: string | null) => void;
  /** Load a list's markdown from disk into the store, resetting undo history. */
  open: (id: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
}

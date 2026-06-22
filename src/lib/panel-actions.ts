/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { emit } from "@tauri-apps/api/event";

import { type TodoState } from "./todo";
import { type Assignee, type Comment, type Label } from "./todos";

/** A status change picked in the panel, sent back to the main window. */
export interface StatusAction {
  itemId: string;
  type: "set" | "delete";
  state?: TodoState;
}

export function emitStatusAction(action: StatusAction) {
  void emit("status:action", action);
}

/** Jump to an item (picked from search) in the main window. */
export function emitFocusItem(id: string) {
  void emit("search:focus", id);
}

/** Drop the search pin (the item kept visible past the active filter), from the
 * search panel's "Clear" control. */
export function emitClearReveal() {
  void emit("search:reveal-clear");
}

/** A comment-log change made in the details panel, sent to the main window. */
export interface DetailsAction {
  itemId: string;
  comments: Comment[];
}

export function emitDetailsAction(action: DetailsAction) {
  void emit("details:action", action);
}

/** An item's assignee change made in the details panel, sent to the main window.
 * `newAssignees` carries any roster entries created in the same action. */
export interface AssigneeAction {
  itemId: string;
  assigneeIds: string[];
  newAssignees?: Assignee[];
}

export function emitAssigneeAction(action: AssigneeAction) {
  void emit("assignee:action", action);
}

/** An item's label change made in the details panel, sent to the main window.
 * `newLabels` carries any roster entries created in the same action. */
export interface LabelAction {
  itemId: string;
  labelIds: string[];
  newLabels?: Label[];
}

export function emitLabelAction(action: LabelAction) {
  void emit("label:action", action);
}

/** An item's notification time / due date change made in the details panel,
 * sent to the main window. All values are sent each time (absent = cleared). */
export interface DatesAction {
  itemId: string;
  notifyAt?: number;
  dueDate?: number;
  /** Optional custom reminder body, typed under the notify picker; fires in
   * place of the item text when the reminder triggers. */
  notifyMessage?: string;
}

export function emitDatesAction(action: DatesAction) {
  void emit("dates:action", action);
}

/** A "snooze" picked in the daily review: push the item's due date and/or
 * reminder out by `days` and acknowledge any fired reminder, so it drops off
 * today's queue and resurfaces later. Applied in the main window. */
export interface ReviewAction {
  itemId: string;
  days: number;
}

export function emitReviewAction(action: ReviewAction) {
  void emit("review:action", action);
}

/** A roster-management change made in Settings, sent to the main window. */
export type RosterAction =
  | { type: "add"; assignee: Assignee }
  | { type: "rename"; id: string; name: string }
  | { type: "recolor"; id: string; color: string }
  | { type: "remove"; id: string };

export function emitRosterAction(action: RosterAction) {
  void emit("roster:action", action);
}

/** A label-roster change made in Settings, sent to the main window. */
export type LabelRosterAction =
  | { type: "add"; label: Label }
  | { type: "rename"; id: string; name: string }
  | { type: "recolor"; id: string; color: string }
  | { type: "remove"; id: string };

export function emitLabelRosterAction(action: LabelRosterAction) {
  void emit("labelRoster:action", action);
}

/** Undo/redo pressed while a panel window holds focus, forwarded to the main
 * window (which owns the list + its history). */
export type EditActionType = "undo" | "redo";

export function emitEditAction(type: EditActionType) {
  void emit("edit:action", type);
}

/** The main window's current assignee state, pushed to the panel so an open
 * picker stays live with the store (e.g. after an undo/redo). */
export interface AssigneesSync {
  roster: Assignee[];
  /** Each item's assignee ids, keyed by item id. */
  byItem: Record<string, string[]>;
}

export function emitAssigneesSync(sync: AssigneesSync) {
  void emit("assignees:sync", sync);
}

/** The main window's current label state, pushed to the panel so an open label
 * picker stays live with the store (e.g. after an undo/redo). */
export interface LabelsSync {
  roster: Label[];
  /** Each item's label ids, keyed by item id. */
  byItem: Record<string, string[]>;
}

export function emitLabelsSync(sync: LabelsSync) {
  void emit("labels:sync", sync);
}

/** The main window's current per-item dates, pushed to the panel so an open
 * details panel reflects changes from elsewhere (a comment that set a reminder,
 * undo/redo) without a reopen. */
export interface DatesSync {
  /** Each item's notify time / due date (epoch ms) and reminder body, keyed by
   * item id. */
  byItem: Record<string, { notifyAt?: number; dueDate?: number; notifyMessage?: string }>;
}

export function emitDatesSync(sync: DatesSync) {
  void emit("dates:sync", sync);
}

/** The main window's current per-item comment logs, pushed to an open details
 * panel so its log reflects changes from elsewhere (undo/redo, a delete made
 * after it opened) without a reopen. */
export interface CommentsSync {
  /** Each item's comment log, keyed by item id. */
  byItem: Record<string, Comment[]>;
}

export function emitCommentsSync(sync: CommentsSync) {
  void emit("comments:sync", sync);
}

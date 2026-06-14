/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { type TodoState } from "./todo";
import { type Assignee, type Comment, type Label, type TodoData, useTodos } from "./todos";

/** Which content the secondary panel renders. */
export type PanelView =
  | "settings"
  | "lists"
  | "status"
  | "search"
  | "filter"
  | "details"
  | "assignee";

export interface PanelAnchor {
  /** Logical-pixel screen coordinates for the panel's top-left corner. */
  x: number;
  y: number;
}

/** An open request, broadcast from the main window to the panel window. */
export interface PanelRequest {
  /** Bumped per request so re-opening the same view re-triggers the panel. */
  nonce: number;
  view: PanelView;
  /** Pin the panel here (status picker); omitted = centered under the titlebar. */
  anchor?: PanelAnchor;
  /** Status-view context: the item whose status is being changed. */
  itemId?: string;
  state?: TodoState;
  /** Search-view payload: a snapshot of the active list's items to search. */
  items?: TodoData[];
  /** Details-view payload: the item's current comment log to seed the editor. */
  comments?: Comment[];
  /** Details-view context: the active list's id and its media folder (abs path). */
  listId?: string;
  mediaDir?: string;
  /** The active list's assignee roster (details + settings views). */
  roster?: Assignee[];
  /** Details-view payload: the item's current assignee ids. */
  assigneeIds?: string[];
  /** The active list's label roster (details + settings views). */
  labels?: Label[];
  /** Details-view payload: the item's current label ids. */
  labelIds?: string[];
  /** Details-view payload: the item's notification time / due date (epoch ms). */
  notifyAt?: number;
  dueDate?: number;
  /** Details-view payload: the item's created / last-updated times (epoch ms). */
  createdAt?: number;
  updatedAt?: number;
}

let nonce = 0;

/** Views that edit a specific item - their row is highlighted while open. */
const ITEM_VIEWS: readonly PanelView[] = ["details", "assignee", "status"];

/** Open (or switch) the secondary panel to a view. Emitted from the main window. */
export function openPanel(request: Omit<PanelRequest, "nonce">) {
  // Highlight the edited item's row in the main window (cleared when the panel
  // closes; see the `panel:closed` listener). Non-item views clear it.
  useTodos.getState().setEditingId(
    ITEM_VIEWS.includes(request.view) ? (request.itemId ?? null) : null,
  );
  void emit("panel:open", { ...request, nonce: ++nonce } satisfies PanelRequest);
}

/** Open the search panel over a snapshot of the active list. */
export function openSearchPanel() {
  const { items, labels, assignees } = useTodos.getState();
  openPanel({ view: "search", items, labels, roster: assignees });
}

/** Open the filter panel for the active list (rosters seed the filter options;
 * the criteria themselves live in the BroadcastChannel-synced filters store). */
export function openFilterPanel() {
  const { activeId, labels, assignees } = useTodos.getState();
  openPanel({ view: "filter", listId: activeId ?? "", labels, roster: assignees });
}

/** Open the list switcher. */
export function openListsPanel() {
  openPanel({ view: "lists" });
}

/** Open the settings panel (assignee / label rosters). */
export function openSettingsPanel() {
  const { assignees, labels } = useTodos.getState();
  openPanel({ view: "settings", roster: assignees, labels });
}

/** Hide the panel (after a status pick, etc.). */
export function closePanel() {
  void invoke("close_panel");
}

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
 * sent to the main window. Both values are sent each time (absent = cleared). */
export interface DatesAction {
  itemId: string;
  notifyAt?: number;
  dueDate?: number;
}

export function emitDatesAction(action: DatesAction) {
  void emit("dates:action", action);
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

/**
 * Open the details panel for an item, pinned just below its row (top-left
 * aligned with the row, like the status picker sits below a checkbox).
 */
export async function openDetailsPanel(
  rowEl: HTMLElement,
  itemId: string,
  comments: Comment[],
) {
  const rect = rowEl.getBoundingClientRect();
  const win = getCurrentWindow();
  const { activeId, assignees: roster, labels, items } = useTodos.getState();
  const listId = activeId ?? "";
  const item = items.find((i) => i.id === itemId);
  const assigneeIds = item?.assignees ?? [];
  const labelIds = item?.labels ?? [];
  const [scale, innerPos, base] = await Promise.all([
    win.scaleFactor(),
    win.innerPosition(),
    appDataDir(),
  ]);
  const inner = innerPos.toLogical(scale);
  // Absolute path of this list's media folder, for resolving attachment URLs.
  const mediaDir = listId ? await join(base, "media", listId) : "";
  openPanel({
    view: "details",
    itemId,
    comments,
    listId,
    mediaDir,
    roster,
    assigneeIds,
    labels,
    labelIds,
    notifyAt: item?.notifyAt,
    dueDate: item?.dueDate,
    createdAt: item?.createdAt,
    updatedAt: item?.updatedAt,
    anchor: { x: inner.x + rect.left, y: inner.y + rect.bottom + 6 },
  });
}

/**
 * Open the assignee picker for an item, pinned just below the clicked control
 * (the row's avatars / add button), so people can be assigned without leaving
 * the list.
 */
export async function openAssigneePanel(anchorEl: HTMLElement, itemId: string) {
  const rect = anchorEl.getBoundingClientRect();
  const win = getCurrentWindow();
  const { assignees: roster, items } = useTodos.getState();
  const assigneeIds = items.find((i) => i.id === itemId)?.assignees ?? [];
  const [scale, innerPos] = await Promise.all([
    win.scaleFactor(),
    win.innerPosition(),
  ]);
  const inner = innerPos.toLogical(scale);
  openPanel({
    view: "assignee",
    itemId,
    roster,
    assigneeIds,
    anchor: { x: inner.x + rect.left, y: inner.y + rect.bottom + 6 },
  });
}

/**
 * Open the status picker pinned just below an element (the clicked checkbox).
 * Converts the element's viewport rect into logical screen coordinates using
 * the window's position and scale factor.
 */
export async function openStatusPicker(
  anchorEl: HTMLElement,
  itemId: string,
  state: TodoState,
) {
  const rect = anchorEl.getBoundingClientRect();
  const win = getCurrentWindow();
  const [scale, innerPos] = await Promise.all([
    win.scaleFactor(),
    win.innerPosition(),
  ]);
  const inner = innerPos.toLogical(scale);
  openPanel({
    view: "status",
    itemId,
    state,
    anchor: { x: inner.x + rect.left, y: inner.y + rect.bottom + 6 },
  });
}

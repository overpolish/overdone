/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { getReviewQueue, type ReviewEntry } from "./daily-review";
import { emptyCriteria, isRevealEffective, useFilters } from "./filters";
import { type TodoState } from "./todo";
import { type Assignee, type Comment, type Label, type TodoData, useTodos } from "./todos";

// Cross-window Action / Sync types and their emitters live alongside; re-exported
// here so existing imports from "./lib/panel" keep resolving.
export * from "./panel-actions";

/** Which content the secondary panel renders. */
export type PanelView =
  | "settings"
  | "lists"
  | "status"
  | "search"
  | "filter"
  | "details"
  | "assignee"
  | "dailyReview"
  | "update";

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
  /** Search-view: the item pinned past the active filter (if any), so the panel
   * can name it and offer to clear the pin. */
  revealedId?: string;
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
  /** Details-view payload: the item's custom reminder body, if set. */
  notifyMessage?: string;
  /** Details-view payload: the item's created / last-updated times (epoch ms). */
  createdAt?: number;
  updatedAt?: number;
  /** Daily-review payload: a snapshot of the items to step through, each tagged
   * with why it surfaced (most-urgent reason first). */
  reviewQueue?: ReviewEntry[];
  /** Update-view payload: the newly-available version and its changelog. */
  updateVersion?: string;
  updateNotes?: string;
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

/** Open the search panel over a snapshot of the active list. Carries the search
 * pin only when it's actually holding an item past the filter, so the panel
 * shows its "Clear" affordance just when there's something to clear. */
export function openSearchPanel() {
  const { items, labels, assignees, activeId, revealedId } = useTodos.getState();
  const criteria = activeId ? useFilters.getState().active[activeId] : undefined;
  const pinned = isRevealEffective(items, criteria ?? emptyCriteria(), revealedId)
    ? (revealedId ?? undefined)
    : undefined;
  openPanel({ view: "search", items, labels, roster: assignees, revealedId: pinned });
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

/** Open the update panel: the new version and its changelog, with a link out to
 * the store. The values are passed in because the panel runs in its own webview
 * and can't reach the main window's update store. */
export function openUpdatePanel(version: string, notes: string | null) {
  openPanel({ view: "update", updateVersion: version, updateNotes: notes ?? undefined });
}

/**
 * Open the daily review over a snapshot of the active list's queue (items that
 * need attention today). Centered under the titlebar like settings; carries the
 * roster + media folder so each card can edit status and add a comment. The
 * queue is computed here so the banner and the panel agree on its contents.
 */
export async function openReviewPanel(options?: { force?: boolean }) {
  const { items, assignees: roster, activeId } = useTodos.getState();
  const reviewQueue = getReviewQueue(items, Date.now());
  // The daily banner only fires with a non-empty queue; a manual "Start now"
  // forces it open even when nothing's pending (lands on the "all caught up" card).
  if (reviewQueue.length === 0 && !options?.force) return;
  const listId = activeId ?? "";
  const mediaDir = listId ? await join(await appDataDir(), "media", listId) : "";
  openPanel({ view: "dailyReview", reviewQueue, roster, listId, mediaDir });
}

/** Request the main window open the daily review. Emitted from the Settings
 * "Start now" button, which runs in the panel webview and so can't reach the
 * list store to build the queue itself. */
export function emitOpenReview() {
  void emit("review:open");
}

/** Hide the panel (after a status pick, etc.). */
export function closePanel() {
  void invoke("close_panel");
}

/** Hold the panel open while a comment editor in it has focus, so you can click
 * out to another app to copy something into the comment without it dismissing.
 * Driven by the editor's focus/blur, not a user toggle. */
export function setPanelEditing(value: boolean) {
  void invoke("set_panel_editing", { value });
}

/** Tell the backend whether the panel holds an unsaved comment draft. While set,
 * clicking the main window (or focusing the scratchpad) confirms before
 * discarding it instead of dismissing the panel silently. */
export function setPanelDirty(value: boolean) {
  void invoke("set_panel_dirty", { value });
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
    notifyMessage: item?.notifyMessage,
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

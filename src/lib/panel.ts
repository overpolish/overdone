import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { type TodoState } from "./todo";
import { type Comment, type TodoData } from "./todos";

/** Which content the secondary panel renders. */
export type PanelView = "settings" | "lists" | "status" | "search" | "details";

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
}

let nonce = 0;

/** Open (or switch) the secondary panel to a view. Emitted from the main window. */
export function openPanel(request: Omit<PanelRequest, "nonce">) {
  void emit("panel:open", { ...request, nonce: ++nonce } satisfies PanelRequest);
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
  const [scale, innerPos] = await Promise.all([
    win.scaleFactor(),
    win.innerPosition(),
  ]);
  const inner = innerPos.toLogical(scale);
  openPanel({
    view: "details",
    itemId,
    comments,
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

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import { create } from "zustand";

import { criteriaOf } from "./filters";
import { useSelection } from "./selection";
import { useTodos } from "./todos";

/** Live drag state, read by the drop indicator and the dragged row. */
interface DragState {
  /** Id of the item being dragged, or null. */
  id: string | null;
  /** Y of the drop indicator, relative to the list container. */
  dropY: number | null;
}

export const useDrag = create<DragState>(() => ({ id: null, dropY: null }));

/** Movement (px) before a press on the checkbox becomes a drag rather than a click. */
const THRESHOLD = 4;
/** Edge band (px) and speed for autoscroll while dragging near the list ends. */
const EDGE = 28;
const SPEED = 8;

/** Each todo row is tagged with this so the drag can locate the row geometry. */
export const TODO_ROW_ATTR = "data-todo-row";
/** Each row also carries its item id, so the drop target resolves by id (and maps
 * back to the full list) rather than by visible position - which a filter shifts. */
export const TODO_ID_ATTR = "data-todo-id";

/** Nearest scrollable ancestor, for autoscroll. */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** All todo row elements in visible (DOM) order. */
const rowEls = () =>
  Array.from(document.querySelectorAll<HTMLElement>(`[${TODO_ROW_ATTR}]`));

/** The visible item ids, in display order (drives range selection). */
const idsInOrder = (): string[] =>
  rowEls()
    .map((el) => el.getAttribute(TODO_ID_ATTR))
    .filter((id): id is string => id != null);

/** The id of the row the pointer is over (clamped to the first/last row). */
function rowIdAt(y: number): string | null {
  const els = rowEls();
  if (!els.length) return null;
  for (const el of els) {
    if (y < el.getBoundingClientRect().bottom) return el.getAttribute(TODO_ID_ATTR);
  }
  return els[els.length - 1].getAttribute(TODO_ID_ATTR);
}

/** Scroll the list when the pointer nears its top/bottom edge during a drag. */
function autoscroll(y: number) {
  const scroller = getScrollParent(rowEls()[0] ?? null);
  if (!scroller) return;
  const rect = scroller.getBoundingClientRect();
  if (y < rect.top + EDGE) scroller.scrollTop -= SPEED;
  else if (y > rect.bottom - EDGE) scroller.scrollTop += SPEED;
}

/** Replace the selection with the inclusive range between two item ids, in
 * display order, keeping `anchor` as the extend-from point. */
function applyRange(anchor: string, over: string) {
  const ids = idsInOrder();
  const ia = ids.indexOf(anchor);
  const ib = ids.indexOf(over);
  if (ia === -1 || ib === -1) return;
  const [lo, hi] = ia <= ib ? [ia, ib] : [ib, ia];
  useSelection.getState().setRange(ids.slice(lo, hi + 1), anchor);
}

/**
 * Run a modifier-click as a selection gesture, so the shortcut works anywhere on
 * a row (not just its checkbox): Shift extends a range from the current anchor to
 * `itemId`, Cmd/Ctrl toggles `itemId`. The caller should `preventDefault` so the
 * click doesn't also move the text caret.
 */
export function selectByModifier(
  itemId: string,
  mods: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
) {
  if (mods.shiftKey) applyRange(useSelection.getState().anchor ?? itemId, itemId);
  else if (mods.metaKey || mods.ctrlKey) useSelection.getState().toggle(itemId);
}

/** A boolean flag carried by the hook so the following click can tell a drag
 * happened (and skip opening the status picker). */
type DidDrag = { current: boolean };

/** Attach the drag pointer listeners and return a function that detaches them. */
function attachPointer(onMove: (e: PointerEvent) => void, onUp: () => void): () => void {
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}

/**
 * Shift-press: range-select drag. Start (or extend) a selection from the anchor
 * and grow it to whatever row the pointer is over as it moves. The click that
 * follows is suppressed (didDrag) so it doesn't open the status picker.
 */
function startRangeSelectDrag(itemId: string, didDrag: DidDrag, e: ReactPointerEvent) {
  e.preventDefault();
  didDrag.current = true;
  const anchor = useSelection.getState().anchor ?? itemId;
  applyRange(anchor, itemId);

  let lastY = e.clientY;
  let raf = 0;
  const tick = () => {
    autoscroll(lastY);
    const over = rowIdAt(lastY);
    if (over) applyRange(anchor, over);
    raf = requestAnimationFrame(tick);
  };
  const onMove = (ev: PointerEvent) => {
    lastY = ev.clientY;
    ev.preventDefault();
  };
  const onUp = () => {
    detach();
    cancelAnimationFrame(raf);
    document.body.style.userSelect = "";
  };
  document.body.style.userSelect = "none";
  raf = requestAnimationFrame(tick);
  const detach = attachPointer(onMove, onUp);
}

/**
 * Plain press: drag-to-reorder. Rows stay put; a drop indicator (positioned via
 * `useDrag`) tracks where the item will land. On drop, a press on an item that's
 * part of a multi-selection moves the whole selection as a block; otherwise it's
 * a single-item move.
 */
function startReorderDrag(itemId: string, didDrag: DidDrag, e: ReactPointerEvent) {
  didDrag.current = false;
  const startY = e.clientY;
  let dragging = false;
  // The visible row the indicator sits *before* (its item id), or null for the
  // end. Resolved to a full-list index at drop time, so hidden rows don't skew it.
  let dropTargetId: string | null = null;
  let lastY = startY;
  let raf = 0;

  // Find the gap the pointer is over (0..length) and the indicator's Y.
  const compute = () => {
    const list = rowEls();
    if (!list.length) return;
    let idx = list.length;
    for (let i = 0; i < list.length; i++) {
      const r = list[i].getBoundingClientRect();
      if (lastY < r.top + r.height / 2) {
        idx = i;
        break;
      }
    }
    dropTargetId = idx < list.length ? list[idx].getAttribute(TODO_ID_ATTR) : null;
    const container = list[0].parentElement;
    if (!container) return;
    const base = container.getBoundingClientRect().top;
    const y =
      idx < list.length
        ? list[idx].getBoundingClientRect().top - base
        : list[list.length - 1].getBoundingClientRect().bottom - base;
    useDrag.setState({ id: itemId, dropY: y });
  };

  const tick = () => {
    autoscroll(lastY);
    compute();
    raf = requestAnimationFrame(tick);
  };

  const onMove = (ev: PointerEvent) => {
    lastY = ev.clientY;
    if (!dragging && Math.abs(ev.clientY - startY) > THRESHOLD) {
      dragging = true;
      didDrag.current = true;
      document.body.style.userSelect = "none";
      raf = requestAnimationFrame(tick);
    }
    if (dragging) ev.preventDefault();
  };

  const onUp = () => {
    detach();
    cancelAnimationFrame(raf);
    if (dragging) {
      // Translate the target row's id into a full-list index (length = drop at
      // the end). Identical to the visible position when nothing is hidden.
      const items = useTodos.getState().items;
      const to = dropTargetId ? items.findIndex((i) => i.id === dropTargetId) : items.length;
      const dropIndex = to < 0 ? items.length : to;
      const sel = useSelection.getState().ids;
      if (sel.size > 1 && sel.has(itemId)) {
        useTodos.getState().moveItems([...sel], dropIndex);
      } else {
        useTodos.getState().moveItem(itemId, dropIndex);
      }
      document.body.style.userSelect = "";
    }
    useDrag.setState({ id: null, dropY: null });
  };

  const detach = attachPointer(onMove, onUp);
}

/**
 * Drag-to-reorder driven by the status checkbox (which doubles as the handle).
 * Returns the pointer-down handler to spread on the handle and a `didDrag` ref
 * the click handler checks, so a drag doesn't also open the status picker.
 *
 * Shift starts a range-select drag; a plain press reorders (or moves the whole
 * selection). A view-sort isn't a real order to drop into, so reorder is disabled
 * while one is active - the press still falls through as a click. A filter
 * (manual sort) only hides rows, so reordering the visible ones still works.
 */
export function useItemDrag(itemId: string) {
  const didDrag = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if (e.shiftKey) {
      startRangeSelectDrag(itemId, didDrag, e);
    } else if (criteriaOf(useTodos.getState().activeId).sort === "manual") {
      startReorderDrag(itemId, didDrag, e);
    }
  };

  return { onPointerDown, didDrag };
}

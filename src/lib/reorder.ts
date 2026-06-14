/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import { create } from "zustand";

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

/**
 * Drag-to-reorder driven by the status checkbox (which doubles as the handle).
 * Returns the pointer-down handler to spread on the handle and a `didDrag` ref
 * the click handler checks, so a drag doesn't also open the status picker.
 *
 * Rows stay put while dragging; a drop indicator (positioned via `useDrag`)
 * shows where the item will land, and the list autoscrolls near its edges.
 */
export function useItemDrag(itemId: string) {
  const didDrag = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    didDrag.current = false;

    const startY = e.clientY;
    let dragging = false;
    let dropIndex = 0;
    let lastY = startY;
    let raf = 0;

    const rows = () =>
      Array.from(document.querySelectorAll<HTMLElement>(`[${TODO_ROW_ATTR}]`));

    // Find the gap the pointer is over (0..length) and the indicator's Y.
    const compute = () => {
      const list = rows();
      if (!list.length) return;
      let idx = list.length;
      for (let i = 0; i < list.length; i++) {
        const r = list[i].getBoundingClientRect();
        if (lastY < r.top + r.height / 2) {
          idx = i;
          break;
        }
      }
      dropIndex = idx;
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
      const scroller = getScrollParent(rows()[0] ?? null);
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        if (lastY < rect.top + EDGE) scroller.scrollTop -= SPEED;
        else if (lastY > rect.bottom - EDGE) scroller.scrollTop += SPEED;
      }
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
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(raf);
      if (dragging) {
        useTodos.getState().moveItem(itemId, dropIndex);
        document.body.style.userSelect = "";
      }
      useDrag.setState({ id: null, dropY: null });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return { onPointerDown, didDrag };
}

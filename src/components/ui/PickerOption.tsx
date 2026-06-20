/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { UnstyledButton } from "@mantine/core";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

interface PickerOptionProps {
  onSelect: () => void;
  children: ReactNode;
  /** Bold the row - the value currently applied. */
  bold?: boolean;
  /** Controlled highlight for keyboard navigation. When provided, the row's wash
   *  follows this prop instead of its own hover, and it scrolls into view as it
   *  becomes highlighted. Pair with `onHover` so the mouse can take it back. */
  highlighted?: boolean;
  /** Mouse moved over the row (controlled mode): hand the highlight back to it. */
  onHover?: () => void;
}

/**
 * One suggestion row, shared by the label, assignee, and code-language pickers.
 * `onMouseDown` (not click) so it fires before the field's blur closes the list.
 * By default the row tracks its own hover; pass `highlighted`/`onHover` to drive
 * it from keyboard navigation instead - then the mouse only takes the highlight on
 * actual movement (`onMouseMove`), so it doesn't fight the arrow keys under a
 * stationary pointer.
 */
/**
 * A ref for a keyboard-highlighted row that scrolls itself into view *within its
 * OverlayScrollbars viewport* whenever `active` - nudging only that viewport by
 * the overflow amount. `scrollIntoView` would instead scroll every scrollable
 * ancestor, yanking the whole dropdown (and the panel behind it) around. Falls
 * back to `scrollIntoView` when the row isn't inside an OS viewport.
 */
export function useScrollIntoOverlay<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const vp = el.closest<HTMLElement>("[data-overlayscrollbars-viewport]");
    if (!vp) {
      el.scrollIntoView({ block: "nearest" });
      return;
    }
    const row = el.getBoundingClientRect();
    const view = vp.getBoundingClientRect();
    if (row.top < view.top) vp.scrollTop -= view.top - row.top;
    else if (row.bottom > view.bottom) vp.scrollTop += row.bottom - view.bottom;
  }, [active]);
  return ref;
}

export function PickerOption({ onSelect, children, bold, highlighted, onHover }: PickerOptionProps) {
  const controlled = onHover !== undefined;
  const [hovered, setHovered] = useState(false);
  const lit = controlled ? Boolean(highlighted) : hovered;
  const ref = useScrollIntoOverlay<HTMLButtonElement>(controlled && Boolean(highlighted));

  return (
    <UnstyledButton
      ref={ref}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={controlled ? undefined : () => setHovered(true)}
      onMouseLeave={controlled ? undefined : () => setHovered(false)}
      onMouseMove={onHover}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 8px",
        borderRadius: "var(--mantine-radius-md)",
        textAlign: "left",
        fontWeight: bold ? 600 : undefined,
        background: lit ? "var(--mantine-color-default-hover)" : "transparent",
      }}
    >
      {children}
    </UnstyledButton>
  );
}

/**
 * Keyboard highlight for a suggestion list: Up/Down move a highlighted row
 * (clamped to `count`), which the rows reflect via `highlighted`/`onHover` on
 * {@link PickerOption}. The field's Enter handler acts on `highlight`; reset the
 * highlight to 0 when the list opens or its query changes.
 */
export function usePickerHighlight(count: number) {
  const [index, setIndex] = useState(0);
  const highlight = Math.min(index, Math.max(count - 1, 0));
  return {
    /** The clamped highlighted row index. */
    highlight,
    /** Hand the highlight to a row (mouse hover) or reset it (pass 0). */
    setIndex,
    /** Handle Up/Down arrows; returns true when it consumed the key. */
    onArrowKey(e: ReactKeyboardEvent): boolean {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, count - 1));
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
        return true;
      }
      return false;
    },
  };
}

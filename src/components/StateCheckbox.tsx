/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { UnstyledButton } from "@mantine/core";
import { useRef } from "react";

import { openStatusPicker } from "../lib/panel";
import { useItemDrag } from "../lib/reorder";
import { useSelection } from "../lib/selection";
import { type TodoState } from "../lib/todo";
import { StateBox } from "./StateBox";

interface StateCheckboxProps {
  value: TodoState;
  itemId: string;
}

/**
 * The status indicator for a todo, which doubles as the drag handle. A plain
 * click opens the status picker in the floating panel (pinned just below the
 * box, since the small always-on-top window would clip an in-window dropdown);
 * pressing and dragging reorders the item. `didDrag` keeps a drag from also
 * firing the click.
 */
export function StateCheckbox({ value, itemId }: StateCheckboxProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { onPointerDown, didDrag } = useItemDrag(itemId);

  return (
    <UnstyledButton
      ref={ref}
      aria-label="Change status"
      onPointerDown={onPointerDown}
      onClick={(e) => {
        if (didDrag.current) {
          didDrag.current = false;
          return;
        }
        // Shift range-selects on pointer-down already; don't also open the picker.
        if (e.shiftKey) return;
        // Cmd/Ctrl-click toggles this item in/out of the selection.
        if (e.metaKey || e.ctrlKey) {
          useSelection.getState().toggle(itemId);
          return;
        }
        // A plain click drops any active selection, then opens the status picker.
        useSelection.getState().clear();
        if (ref.current) void openStatusPicker(ref.current, itemId, value);
      }}
      style={{
        display: "flex",
        lineHeight: 0,
        cursor: "grab",
        touchAction: "none",
        // Match the StateBox radius so the focus ring rounds to the box's shape
        // instead of drawing a sharp rectangle around it.
        borderRadius: "var(--mantine-radius-sm)",
      }}
    >
      <StateBox state={value} />
    </UnstyledButton>
  );
}

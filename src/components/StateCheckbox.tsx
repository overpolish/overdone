import { UnstyledButton } from "@mantine/core";
import { useRef } from "react";

import { openStatusPicker } from "../lib/panel";
import { useItemDrag } from "../lib/reorder";
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
      onClick={() => {
        if (didDrag.current) {
          didDrag.current = false;
          return;
        }
        if (ref.current) void openStatusPicker(ref.current, itemId, value);
      }}
      style={{ display: "flex", lineHeight: 0, cursor: "grab", touchAction: "none" }}
    >
      <StateBox state={value} />
    </UnstyledButton>
  );
}

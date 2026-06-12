import { UnstyledButton } from "@mantine/core";
import { useRef } from "react";

import { openStatusPicker } from "../lib/panel";
import { type TodoState } from "../lib/todo";
import { StateBox } from "./StateBox";

interface StateCheckboxProps {
  value: TodoState;
  itemId: string;
}

/**
 * The status indicator for a todo. Clicking it opens the status picker in the
 * floating panel, pinned just below the box (rather than an in-window dropdown,
 * which the small always-on-top window would clip). The pick is applied back in
 * the main window via a `status:action` event (see `App`).
 */
export function StateCheckbox({ value, itemId }: StateCheckboxProps) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <UnstyledButton
      ref={ref}
      aria-label="Change status"
      onClick={() => {
        if (ref.current) void openStatusPicker(ref.current, itemId, value);
      }}
      style={{ display: "flex", lineHeight: 0 }}
    >
      <StateBox state={value} />
    </UnstyledButton>
  );
}

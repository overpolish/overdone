import { Box, Group, Textarea } from "@mantine/core";
import { useEffect, useRef } from "react";

import { useDrag } from "../lib/reorder";
import { type TodoData, useTodos } from "../lib/todos";
import { StateCheckbox } from "./StateCheckbox";

interface TodoItemProps {
  item: TodoData;
}

/**
 * Line height of the text field's first row. The checkbox is centered within a
 * box of this height so it aligns with the first line, and the row stays
 * top-anchored (so the checkbox doesn't drift down) once the text wraps.
 */
const LINE_HEIGHT = 20;

/**
 * A single todo row: the custom status checkbox plus an inline, unstyled text
 * field. Reads/writes through the todos store so edits flow through undo/redo.
 */
export function TodoItem({ item }: TodoItemProps) {
  const setItemText = useTodos((s) => s.setItemText);
  const deleteItemFocusNeighbor = useTodos((s) => s.deleteItemFocusNeighbor);
  const focusId = useTodos((s) => s.focusId);
  const clearFocus = useTodos((s) => s.clearFocus);
  const dragging = useDrag((s) => s.id === item.id);
  const done = item.state === "done";

  // When this item was just created (type-to-create), grab focus and place the
  // caret after the seeded character.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusId !== item.id) return;
    const el = inputRef.current;
    if (el) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
    clearFocus();
  }, [focusId, item.id, clearFocus]);

  return (
    <Group
      gap={8}
      wrap="nowrap"
      align="flex-start"
      data-todo-row
      style={{
        opacity: dragging ? 0.4 : 1,
        transition: "opacity 120ms ease",
      }}
    >
      <Box
        style={{
          display: "flex",
          alignItems: "center",
          height: LINE_HEIGHT,
        }}
      >
        <StateCheckbox value={item.state} itemId={item.id} />
      </Box>
      <Textarea
        ref={inputRef}
        variant="unstyled"
        placeholder="Untitled"
        value={item.text}
        onChange={(e) => setItemText(item.id, e.currentTarget.value)}
        onKeyDown={(e) => {
          // Enter confirms the item — just drops focus (Shift+Enter still
          // inserts a literal newline for a multi-line item).
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Backspace" && item.text === "") {
            // Backspace on an empty item removes it and focuses the neighbour.
            e.preventDefault();
            deleteItemFocusNeighbor(item.id);
          }
        }}
        // Grow with content and wrap instead of overflowing the narrow window.
        autosize
        minRows={1}
        style={{ flex: 1 }}
        styles={{
          input: {
            // Match LINE_HEIGHT (and drop the default padding/min-height) so the
            // first line lines up with the centered checkbox and every row is
            // exactly one line tall — otherwise the input's default min-height
            // pads single-line items but not wrapped ones, so wrapped items lose
            // the gap after them.
            padding: 0,
            minHeight: 0,
            fontSize: "13px",
            lineHeight: `${LINE_HEIGHT}px`,
            // The text sits a hair low in the line box; nudge it up 1px to
            // optically center against the checkbox.
            transform: "translateY(-1px)",
            // Done items read as crossed-off and dimmed.
            textDecoration: done ? "line-through" : undefined,
            opacity: done ? 0.5 : 1,
            transition: "opacity 120ms ease",
          },
        }}
      />
    </Group>
  );
}

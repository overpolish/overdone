import { ActionIcon, Box, Group, Textarea } from "@mantine/core";
import { IconMessage } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { caretEdges } from "../lib/caret";
import { useItemMenu } from "../lib/context-menu";
import { openDetailsPanel } from "../lib/panel";
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

/** Left inset of a sub-item, so its checkbox sits under the parent's text. */
const INDENT = 24;

/**
 * A single todo row: the custom status checkbox plus an inline, unstyled text
 * field. Reads/writes through the todos store so edits flow through undo/redo.
 */
export function TodoItem({ item }: TodoItemProps) {
  const setItemText = useTodos((s) => s.setItemText);
  const deleteItemFocusNeighbor = useTodos((s) => s.deleteItemFocusNeighbor);
  const indentItem = useTodos((s) => s.indentItem);
  const outdentItem = useTodos((s) => s.outdentItem);
  const focusId = useTodos((s) => s.focusId);
  const focusCaret = useTodos((s) => s.focusCaret);
  const clearFocus = useTodos((s) => s.clearFocus);
  const dragging = useDrag((s) => s.id === item.id);
  const done = item.state === "done";
  const child = item.depth === 1;
  // The details button appears on row hover (to avoid clutter), and stays
  // faintly visible as an indicator when the item already has comments.
  const rowRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const hasComments = (item.comments?.length ?? 0) > 0;

  // When focus is directed here (type-to-create, search, arrow nav), grab it,
  // place the caret per the hint, and scroll the row into view — the custom
  // scroll container doesn't always follow focus on its own.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusId !== item.id) return;
    const el = inputRef.current;
    if (el) {
      el.focus({ preventScroll: true });
      const pos = focusCaret === "start" ? 0 : el.value.length;
      el.setSelectionRange(pos, pos);
      el.scrollIntoView({ block: "nearest" });
    }
    clearFocus();
  }, [focusId, item.id, focusCaret, clearFocus]);

  return (
    <Group
      ref={rowRef}
      gap={8}
      wrap="nowrap"
      align="flex-start"
      data-todo-row
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        useItemMenu.getState().show(item.id, e.clientX, e.clientY);
      }}
      style={{
        position: "relative",
        paddingLeft: child ? INDENT : 0,
        opacity: dragging ? 0.4 : 1,
        transition: "opacity 120ms ease",
      }}
    >
      {/* Nesting guide: a faint vertical line under the parent's checkbox. */}
      {child && (
        <div
          style={{
            position: "absolute",
            left: 7,
            top: 0,
            bottom: 0,
            width: 1.5,
            borderRadius: 1,
            background:
              "color-mix(in srgb, var(--mantine-color-default-border) 70%, transparent)",
          }}
        />
      )}
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
          // Tab / Shift+Tab nest / un-nest the item (one level).
          if (e.key === "Tab") {
            e.preventDefault();
            if (e.shiftKey) outdentItem(item.id);
            else indentItem(item.id);
          } else if (e.key === "Enter" && !e.shiftKey) {
            // Enter confirms the item — just drops focus (Shift+Enter still
            // inserts a literal newline for a multi-line item).
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Backspace" && item.text === "") {
            // Backspace on an empty item removes it and focuses the neighbour.
            e.preventDefault();
            deleteItemFocusNeighbor(item.id);
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            // At the first visual row, ArrowUp jumps to the previous item; at
            // the last, ArrowDown jumps to the next — so the list reads as one
            // continuous field. Within a multi-line item (wrapped or not) the
            // caret walks its own rows first before crossing to a neighbour.
            const up = e.key === "ArrowUp";
            const { atFirstLine, atLastLine } = caretEdges(e.currentTarget);
            if (up ? !atFirstLine : !atLastLine) return;
            const { items, focusItem } = useTodos.getState();
            const idx = items.findIndex((x) => x.id === item.id);
            const neighbor = up ? items[idx - 1] : items[idx + 1];
            if (neighbor) {
              e.preventDefault();
              // Land where the eye is: end of the item above, start of the one
              // below.
              focusItem(neighbor.id, up ? "end" : "start");
            }
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
      {/* Details / comments. Top-anchored to align with the first text line,
          like the checkbox. Reserved in layout so showing it doesn't reflow. */}
      <Box style={{ display: "flex", alignItems: "center", height: LINE_HEIGHT }}>
        <ActionIcon
          aria-label="Details"
          variant="subtle"
          color="gray"
          size={20}
          onClick={() => {
            if (rowRef.current) {
              void openDetailsPanel(rowRef.current, item.id, item.comments ?? []);
            }
          }}
          style={{
            flexShrink: 0,
            opacity: hovered ? 1 : hasComments ? 0.4 : 0,
            pointerEvents: hovered || hasComments ? "auto" : "none",
            transition: "opacity 120ms ease",
          }}
        >
          <IconMessage size={14} stroke={1.8} />
        </ActionIcon>
      </Box>
    </Group>
  );
}

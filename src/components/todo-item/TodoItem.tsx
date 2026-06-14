/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, Textarea } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import { resolveAssignees } from "../../lib/assignee";
import { caretEdges } from "../../lib/caret";
import { useItemMenu } from "../../lib/context-menu";
import { resolveLabels } from "../../lib/label";
import { useDrag } from "../../lib/reorder";
import { type TodoData, useTodos } from "../../lib/todos";
import { LabelBadges } from "../LabelBadge";
import { StateCheckbox } from "../StateCheckbox";
import { ItemControls } from "./ItemControls";
import { INDENT, LINE_HEIGHT, rowStatus } from "./itemStatus";

interface TodoItemProps {
  item: TodoData;
}

/**
 * A single todo row: the custom status checkbox plus an inline, unstyled text
 * field. Reads/writes through the todos store so edits flow through undo/redo.
 */
export function TodoItem({ item }: TodoItemProps) {
  const setItemText = useTodos((s) => s.setItemText);
  const dismissNotification = useTodos((s) => s.dismissNotification);
  const deleteItemFocusNeighbor = useTodos((s) => s.deleteItemFocusNeighbor);
  const indentItem = useTodos((s) => s.indentItem);
  const outdentItem = useTodos((s) => s.outdentItem);
  const focusId = useTodos((s) => s.focusId);
  const focusCaret = useTodos((s) => s.focusCaret);
  const clearFocus = useTodos((s) => s.clearFocus);
  const dragging = useDrag((s) => s.id === item.id);
  const child = item.depth === 1;
  const { done, needsAction, dueState, statusColor } = rowStatus(item);
  const rowRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const hasComments = (item.comments?.length ?? 0) > 0;
  // Resolve the item's assignee ids against the roster (skipping any unknown
  // ids, e.g. a just-removed person undo briefly reintroduces).
  const roster = useTodos((s) => s.assignees);
  const assignees = resolveAssignees(item.assignees ?? [], roster);
  // Same for labels: resolve the item's ids against the list's label roster,
  // dropping any that no longer exist.
  const labelRoster = useTodos((s) => s.labels);
  const labels = resolveLabels(item.labels ?? [], labelRoster);
  // Highlight this row while its editing panel (details / assignees / status)
  // is open, so it's clear which item the floating panel is editing.
  const editing = useTodos((s) => s.editingId === item.id);

  // When focus is directed here (type-to-create, search, arrow nav), grab it,
  // place the caret per the hint, and scroll the row into view - the custom
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
      {/* Status wash backing the row (red overdue / amber notification / orange
          due-today, by priority), matching the tinted text + icon. Bleeds only
          horizontally - rows are flush (Stack gap 0), so a vertical bleed would
          overlap the neighbour's wash and double up into a dark seam. */}
      {statusColor && (
        <Box
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            marginInline: -8,
            borderRadius: "var(--mantine-radius-sm)",
            background: `color-mix(in srgb, ${statusColor} 14%, transparent)`,
            pointerEvents: "none",
            zIndex: -1,
          }}
        />
      )}
      {/* Highlight backing the row while its editing panel is open. Behind the
          content (zIndex -1) and bled out a touch so it reads as a padded
          surface rather than a tight box. */}
      {editing && (
        <Box
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            marginInline: -8,
            marginBlock: -2,
            borderRadius: "var(--mantine-radius-sm)",
            background: "var(--mantine-color-default-hover)",
            boxShadow: "inset 0 0 0 1px var(--mantine-color-default-border)",
            pointerEvents: "none",
            zIndex: -1,
          }}
        />
      )}
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
      {/* Text column: any labels render as badges stacked above the title, like
          GitHub. The column owns the row's flexible width so wrapped badges and
          title share one left edge. */}
      <Box style={{ flex: 1, minWidth: 0 }}>
        {labels.length > 0 && (
          <Box pt={3} pb={1}>
            <LabelBadges labels={labels} />
          </Box>
        )}
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
              // Enter confirms the item - just drops focus (Shift+Enter still
              // inserts a literal newline for a multi-line item).
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Backspace" && item.text === "") {
              // Backspace on an empty item removes it and focuses the neighbour.
              e.preventDefault();
              deleteItemFocusNeighbor(item.id);
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              // At the first visual row, ArrowUp jumps to the previous item; at
              // the last, ArrowDown jumps to the next - so the list reads as one
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
          style={{ width: "100%" }}
          styles={{
            input: {
              // Match LINE_HEIGHT (and drop the default padding/min-height) so the
              // first line lines up with the centered checkbox and every row is
              // exactly one line tall - otherwise the input's default min-height
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
              // Status tints the text (red/amber/orange by priority); done items
              // never tint, reading as resolved (status is already null then).
              color: statusColor ?? undefined,
              transition: "opacity 120ms ease",
            },
          }}
        />
      </Box>
      <ItemControls
        item={item}
        rowRef={rowRef}
        hovered={hovered}
        assignees={assignees}
        dueState={dueState}
        needsAction={needsAction}
        hasComments={hasComments}
        onDismiss={() => dismissNotification(item.id)}
      />
    </Group>
  );
}

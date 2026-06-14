import { ActionIcon, Box, Group, Textarea, UnstyledButton } from "@mantine/core";
import { IconBell, IconCalendar, IconMessage } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";

import { resolveAssignees } from "../lib/assignee";
import { caretEdges } from "../lib/caret";
import { useItemMenu } from "../lib/context-menu";
import { openAssigneePanel, openDetailsPanel } from "../lib/panel";
import { useDrag } from "../lib/reorder";
import { isStruck } from "../lib/todo";
import { type TodoData, useTodos } from "../lib/todos";
import { AddAssigneeButton, AssigneeAvatars } from "./AssigneeAvatar";
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

/** Status accent colors, shared by the row tint and the status icons. */
const STATUS_COLOR = {
  overdue: "var(--mantine-color-red-6)",
  notify: "var(--mantine-color-yellow-6)",
  today: "var(--mantine-color-orange-6)",
} as const;

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
  const done = isStruck(item.state);
  const child = item.depth === 1;
  // A fired-but-unacknowledged notification: a bell shows on the right until the
  // user clicks it to dismiss.
  const needsAction = item.notifiedAt != null;
  // Due urgency — only today or overdue surface an indicator (future/none don't,
  // and a done item never nags). Stored due dates are date-only, so compare days.
  const dueState: "overdue" | "today" | null = (() => {
    if (item.dueDate == null || done) return null;
    const today = dayjs().startOf("day");
    const due = dayjs(item.dueDate).startOf("day");
    if (due.isBefore(today)) return "overdue";
    if (due.isSame(today)) return "today";
    return null;
  })();
  // Row appearance follows a single priority: overdue (red) > notification
  // (amber) > due today (orange). The winner tints the text and a faint full-row
  // wash; the per-status icons keep their own colors regardless.
  const status: keyof typeof STATUS_COLOR | null =
    dueState === "overdue"
      ? "overdue"
      : needsAction && !done
        ? "notify"
        : dueState === "today"
          ? "today"
          : null;
  const statusColor = status ? STATUS_COLOR[status] : null;
  // The details button appears on row hover (to avoid clutter), and stays
  // faintly visible as an indicator when the item already has comments.
  const rowRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const hasComments = (item.comments?.length ?? 0) > 0;
  // Resolve the item's assignee ids against the roster (skipping any unknown
  // ids, e.g. a just-removed person undo briefly reintroduces).
  const roster = useTodos((s) => s.assignees);
  const assignees = resolveAssignees(item.assignees ?? [], roster);
  // Highlight this row while its editing panel (details / assignees / status)
  // is open, so it's clear which item the floating panel is editing.
  const editing = useTodos((s) => s.editingId === item.id);

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
      {/* Status wash backing the row (red overdue / amber notification / orange
          due-today, by priority), matching the tinted text + icon. Bleeds only
          horizontally — rows are flush (Stack gap 0), so a vertical bleed would
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
            // Status tints the text (red/amber/orange by priority); done items
            // never tint, reading as resolved (status is already null then).
            color: statusColor ?? undefined,
            transition: "opacity 120ms ease",
          },
        }}
      />
      {/* Right-side controls in fixed order: notification, due, assignees,
          details. They sit in their own tight group so they stay close together,
          while the row's wider gap separates them from the text. */}
      <Group gap={2} wrap="nowrap" align="flex-start">
      {/* Dismiss bell: only present once a notification has fired. Always visible
          (not hover-gated) and amber so it reads as the cue for the amber text;
          clicking acknowledges and clears the needs-action state. */}
      {needsAction && (
        <Box style={{ display: "flex", alignItems: "center", height: LINE_HEIGHT }}>
          <ActionIcon
            aria-label="Dismiss notification"
            variant="subtle"
            color="yellow.6"
            size={20}
            onClick={() => dismissNotification(item.id)}
            style={{ flexShrink: 0 }}
          >
            <IconBell size={14} stroke={1.8} />
          </ActionIcon>
        </Box>
      )}
      {/* Due indicator: orange when due today, red when overdue (nothing for a
          future/no due date). A non-interactive status cue — not dismissable;
          it only clears when the due date changes or the item is done/cancelled. */}
      {dueState && (
        <Box
          aria-label={dueState === "overdue" ? "Overdue" : "Due today"}
          title={dueState === "overdue" ? "Overdue" : "Due today"}
          style={{
            display: "flex",
            alignItems: "center",
            height: LINE_HEIGHT,
            flexShrink: 0,
            color: STATUS_COLOR[dueState],
          }}
        >
          <IconCalendar size={14} stroke={1.8} />
        </Box>
      )}
      {/* Assignee control, top-anchored to the first text line like the other
          controls and reserved in layout. Click the avatars to reassign; with
          nobody assigned, a dashed "add" circle appears on hover. */}
      <Box
        ref={assigneeRef}
        style={{
          display: "flex",
          alignItems: "center",
          // Right-aligned with a minimum width: the add circle / single avatar
          // reserve a steady slot whose right edge lines up with the details
          // icon, while multiple avatars grow leftward (keeping the gap to the
          // icon constant) instead of overflowing a fixed-width box.
          justifyContent: "flex-end",
          minWidth: 20,
          height: LINE_HEIGHT,
          // Empty + not hovered: hide the add affordance but keep its slot.
          opacity: assignees.length > 0 || hovered ? 1 : 0,
          pointerEvents: assignees.length > 0 || hovered ? "auto" : "none",
          transition: "opacity 120ms ease",
        }}
      >
        {assignees.length > 0 ? (
          <UnstyledButton
            aria-label="Change assignees"
            onClick={() => {
              if (assigneeRef.current) void openAssigneePanel(assigneeRef.current, item.id);
            }}
            style={{ display: "flex", alignItems: "center" }}
          >
            {/* 14px disc matches the IconCirclePlus's drawn ring at size 18
                (Tabler insets the circle to ~75% of the icon box). */}
            <AssigneeAvatars assignees={assignees} size={14} />
          </UnstyledButton>
        ) : (
          <AddAssigneeButton
            size={18}
            onClick={() => {
              if (assigneeRef.current) void openAssigneePanel(assigneeRef.current, item.id);
            }}
          />
        )}
      </Box>
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
    </Group>
  );
}

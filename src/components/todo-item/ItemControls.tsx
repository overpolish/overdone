/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { ActionIcon, Box, Group, UnstyledButton } from "@mantine/core";
import { IconBell, IconCalendar, IconMessage, IconPinnedFilled } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useRef } from "react";

import { openAssigneePanel, openDetailsPanel } from "../../lib/panel";
import { type Assignee, type TodoData, useTodos } from "../../lib/todos";
import { AddAssigneeButton, AssigneeAvatars } from "../ui/AssigneeAvatar";
import { type DueState, LINE_HEIGHT, STATUS_COLOR } from "./itemStatus";

interface ItemControlsProps {
  item: TodoData;
  /** The outer row element, the details panel anchors below it. */
  rowRef: React.RefObject<HTMLDivElement | null>;
  hovered: boolean;
  assignees: Assignee[];
  dueState: DueState;
  needsAction: boolean;
  /** A reminder is scheduled but hasn't fired yet (quiet pending bell). */
  pendingNotify: boolean;
  hasComments: boolean;
  onDismiss: () => void;
}

/**
 * Right-side row controls in fixed order: notification bell, due indicator,
 * assignees, and details. They sit in their own tight group so they stay close
 * together, while the row's wider gap separates them from the text.
 */
export function ItemControls({
  item,
  rowRef,
  hovered,
  assignees,
  dueState,
  needsAction,
  pendingNotify,
  hasComments,
  onDismiss,
}: ItemControlsProps) {
  const assigneeRef = useRef<HTMLDivElement>(null);

  return (
    <Group gap={2} wrap="nowrap" align="flex-start">
      {/* Pinned indicator: always visible (not hover-gated) so a pinned item is
          obvious; clicking it unpins, the quick inverse of the right-click pin. */}
      {item.pinned && (
        <Box style={{ display: "flex", alignItems: "center", height: LINE_HEIGHT }}>
          <ActionIcon
            aria-label="Unpin"
            title="Pinned - click to unpin"
            variant="subtle"
            color="gray"
            size={20}
            onClick={() => useTodos.getState().togglePin(item.id)}
            style={{ flexShrink: 0 }}
          >
            <IconPinnedFilled size={14} stroke={1.8} />
          </ActionIcon>
        </Box>
      )}
      {/* Pending reminder: a quiet, dimmed bell while a reminder is scheduled but
          hasn't fired (distinct from the amber fired bell below, and not
          dismissable). Gives setting a reminder - including from a comment -
          immediate, visible confirmation, with the time in its tooltip. */}
      {pendingNotify && !needsAction && (
        <Box
          aria-label={`Reminder ${dayjs(item.notifyAt).format("MMM D, h:mm A")}`}
          title={`Reminder ${dayjs(item.notifyAt).format("MMM D, h:mm A")}`}
          style={{
            display: "flex",
            alignItems: "center",
            // 20px-wide centered slot so the 14px glyph lands in the same column
            // as the dismiss bell / details, which center their icon in a 20px
            // ActionIcon. Same width and centering, just not a button.
            justifyContent: "center",
            width: 20,
            height: LINE_HEIGHT,
            flexShrink: 0,
            color: "var(--mantine-color-dimmed)",
          }}
        >
          <IconBell size={14} stroke={1.8} />
        </Box>
      )}
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
            onClick={onDismiss}
            style={{ flexShrink: 0 }}
          >
            <IconBell size={14} stroke={1.8} />
          </ActionIcon>
        </Box>
      )}
      {/* Due indicator: orange when due today, red when overdue (nothing for a
          future/no due date). A non-interactive status cue - not dismissable;
          it only clears when the due date changes or the item is done/cancelled. */}
      {dueState && (
        <Box
          aria-label={dueState === "overdue" ? "Overdue" : "Due today"}
          title={dueState === "overdue" ? "Overdue" : "Due today"}
          style={{
            display: "flex",
            alignItems: "center",
            // Match the dismiss bell / details column: 14px glyph centered in a
            // 20px slot, so the due indicator lines up with the other controls.
            justifyContent: "center",
            width: 20,
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
            // Round the focus ring to the avatars' shape (circle for one, stadium
            // for a stack) rather than a sharp rectangle.
            style={{ display: "flex", alignItems: "center", borderRadius: 999 }}
          >
            <AssigneeAvatars assignees={assignees} size={14} />
          </UnstyledButton>
        ) : (
          <AddAssigneeButton
            size={14}
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
  );
}

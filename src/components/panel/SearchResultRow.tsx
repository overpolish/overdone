/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Stack, Text, UnstyledButton } from "@mantine/core";
import { IconLink, IconMessage } from "@tabler/icons-react";
import { useState } from "react";

import { linkLabel, type ScannedLink } from "../../lib/links";
import { isStruck } from "../../lib/todo";
import { type Assignee, type Label, type TodoData } from "../../lib/todos";
import { AssigneeAvatar } from "../ui/AssigneeAvatar";
import { LabelBadge } from "../ui/LabelBadge";
import { useScrollIntoOverlay } from "../ui/PickerOption";
import { StateBox } from "../ui/StateBox";

/** One search result: the item's state + title, plus a second line showing why a
 * non-title field matched (comment excerpt / label / assignee / link). Supports
 * the search's arrow-key navigation via `highlighted`/`onHover`. */
export function ResultRow({
  item,
  snippet,
  label,
  assignee,
  link,
  highlighted,
  onHover,
  onSelect,
}: {
  item: TodoData;
  snippet?: string;
  label?: Label;
  assignee?: Assignee;
  link?: ScannedLink;
  /** Keyboard-highlighted row (arrow nav); shows the wash and scrolls into view. */
  highlighted?: boolean;
  /** Mouse moved over the row: hand the highlight back to it. */
  onHover?: () => void;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const lit = onHover ? Boolean(highlighted) : hovered;
  const ref = useScrollIntoOverlay<HTMLButtonElement>(Boolean(highlighted));
  const done = isStruck(item.state);
  const hasHint = Boolean(snippet || label || assignee || link);

  return (
    <UnstyledButton
      ref={ref}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={onHover}
      style={{
        display: "flex",
        alignItems: hasHint ? "flex-start" : "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: "var(--mantine-radius-md)",
        // Inset the focus ring so it doesn't overflow / clip at the scroll edges.
        outlineOffset: -2,
        background: lit ? "var(--mantine-color-default-hover)" : "transparent",
      }}
    >
      <StateBox state={item.state} size={16} optical />
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Text
          size="sm"
          truncate
          style={{
            textDecoration: done ? "line-through" : undefined,
            opacity: done ? 0.6 : 1,
          }}
          c={item.text ? undefined : "dimmed"}
        >
          {item.text || "Untitled"}
        </Text>
        {snippet && (
          <Text size="xs" c="dimmed" truncate style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <IconMessage size={12} style={{ flexShrink: 0 }} />
            {snippet}
          </Text>
        )}
        {label && (
          <div style={{ display: "flex" }}>
            <LabelBadge label={label} size={15} />
          </div>
        )}
        {assignee && (
          <Text size="xs" c="dimmed" truncate style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <AssigneeAvatar assignee={assignee} size={14} withTooltip={false} />
            {assignee.name}
          </Text>
        )}
        {link && (
          <Text size="xs" c="dimmed" truncate style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <IconLink size={12} style={{ flexShrink: 0 }} />
            {linkLabel(link)}
          </Text>
        )}
      </Stack>
    </UnstyledButton>
  );
}

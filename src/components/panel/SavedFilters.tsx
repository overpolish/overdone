/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Group, Text, UnstyledButton } from "@mantine/core";
import { IconTrash, IconWorld } from "@tabler/icons-react";
import { useState } from "react";

import { type SavedFilter } from "../../lib/filters";
import { IconButton } from "../ui/IconButton";

/** One saved-filter row: a clickable label that loads the filter, with a
 * hover-revealed danger delete (matching CommentRow / ListRow row actions). */
export function SavedRow({
  filter,
  onLoad,
  onDelete,
}: {
  filter: SavedFilter;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Group
      gap={2}
      wrap="nowrap"
      pr={6}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: "var(--mantine-radius-sm)",
        background: hovered
          ? "var(--mantine-color-default-hover)"
          : "transparent",
      }}
    >
      <UnstyledButton
        onClick={onLoad}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
        }}
      >
        {filter.global && (
          <IconWorld
            size={12}
            style={{
              display: "block",
              flexShrink: 0,
              color: "var(--mantine-color-dimmed)",
            }}
          />
        )}
        <Text size="xs" truncate>
          {filter.name}
        </Text>
      </UnstyledButton>
      <Group
        gap={2}
        style={{ opacity: hovered ? 1 : 0, transition: "opacity 120ms ease" }}
      >
        <IconButton
          label={`Delete ${filter.name}`}
          icon={IconTrash}
          danger
          onClick={onDelete}
        />
      </Group>
    </Group>
  );
}

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, Text } from "@mantine/core";

import { useVisibleItems } from "../lib/filters";
import { TODO_STATES } from "../lib/todo";
import { useTodos } from "../lib/todos";

/**
 * Sticky footer for the active list: a live item summary. Kept small so it
 * doesn't eat list space. The list name lives in the tab bar now, where the
 * active tab is its inline-editable title.
 */
export function Footer() {
  const items = useTodos((s) => s.items);
  // Counts reflect what's shown: when a filter hides items, count the visible
  // subset and surface "X of Y".
  const visible = useVisibleItems();
  const filtered = visible.length !== items.length;

  return (
    <Box
      px="md"
      // Content sizes the bar. A hair more bottom than top so the gaps look
      // even - the text sits optically high within its line box.
      pt={3}
      pb={5}
      style={{
        flexShrink: 0,
        // A faint seam, not a rule.
        borderTop:
          "1px solid color-mix(in srgb, var(--mantine-color-default-border) 30%, transparent)",
      }}
    >
      <Group gap="sm" wrap="nowrap" align="center" justify="flex-end">
        {/* Per-state counts (colored by state) then the total, e.g. "3 1 2 (6)".
            While filtered, counts cover the visible subset and the total reads
            "X of Y". */}
        <Text c="dimmed" style={{ flexShrink: 0, fontSize: "10px" }}>
          {TODO_STATES.map((meta) => (
            <Text
              key={meta.value}
              span
              inherit
              fw={600}
              mr={5}
              c={meta.color ? `${meta.color}.6` : "var(--mantine-color-text)"}
            >
              {visible.filter((i) => i.state === meta.value).length}
            </Text>
          ))}
          {filtered ? `(${visible.length} of ${items.length})` : `(${items.length})`}
        </Text>
      </Group>
    </Box>
  );
}

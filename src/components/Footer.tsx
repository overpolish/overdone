/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Group, Text, TextInput } from "@mantine/core";
import { useEffect, useRef } from "react";

import { useVisibleItems } from "../lib/filters";
import { TODO_STATES } from "../lib/todo";
import { useTodos } from "../lib/todos";

/**
 * Sticky footer for the active list: an editable title on the left (the
 * markdown `# ` header) and a live item summary on the right. Kept small so it
 * doesn't eat list space. A freshly-created, untitled list opens with this
 * field focused so the name can be typed immediately.
 */
export function Footer() {
  const title = useTodos((s) => s.title);
  const setTitle = useTodos((s) => s.setTitle);
  const items = useTodos((s) => s.items);
  const focusTitle = useTodos((s) => s.focusTitle);
  const clearFocusTitle = useTodos((s) => s.clearFocusTitle);
  // Counts reflect what's shown: when a filter hides items, count the visible
  // subset and surface "X of Y".
  const visible = useVisibleItems();
  const filtered = visible.length !== items.length;

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusTitle) return;
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
    clearFocusTitle();
  }, [focusTitle, clearFocusTitle]);

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
      <Group gap="sm" wrap="nowrap" align="center">
        <TextInput
          ref={inputRef}
          variant="unstyled"
          placeholder="Untitled"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          style={{ flex: 1, minWidth: 0 }}
          styles={{
            input: {
              // Strip the default input padding/min-height so it fits the bar.
              padding: 0,
              minHeight: 0,
              height: "auto",
              borderRadius: 0,
              fontSize: "11px",
              fontWeight: 600,
              lineHeight: 1.3,
            },
          }}
        />
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

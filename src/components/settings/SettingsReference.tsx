/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Group, Kbd, Stack, Text } from "@mantine/core";

import { ScrollArea } from "../ui/ScrollArea";

// Modifier glyphs differ per platform: ⌘/⌥/⇧ on macOS, spelled out on Windows.
const IS_MAC =
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? "⌘" : "Ctrl";
const SHIFT = IS_MAC ? "⇧" : "Shift";

/** Keyboard shortcuts shown in settings, keys on the left and action on right. */
const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [MOD, "F"], label: "Search" },
  { keys: [MOD, SHIFT, "F"], label: "Filter" },
  { keys: [MOD, "L"], label: "Lists" },
  { keys: [MOD, ","], label: "Settings" },
  { keys: [MOD, "N"], label: "New item" },
  { keys: ["A–Z"], label: "Type to start a new item" },
  { keys: [MOD, "Z"], label: "Undo" },
  { keys: [MOD, SHIFT, "Z"], label: "Redo" },
  { keys: ["Esc"], label: "Drop focus from the field" },
  { keys: [MOD, "]"], label: "Indent item" },
  { keys: [MOD, "["], label: "Outdent item" },
  { keys: ["↵"], label: "Confirm item" },
  { keys: [SHIFT, "↵"], label: "New line within an item" },
  { keys: ["⌫"], label: "Delete empty item" },
  { keys: ["↑", "↓"], label: "Move between items" },
];

/** Quick-add syntax shown in settings: an example on the left, what it does on
 * the right. Typed into an item's title (and dates also work inside comments). */
const QUICK_ADD: { ex: string; label: string }[] = [
  { ex: "#bug", label: "Add a label (fuzzy-matched)" },
  { ex: "@john", label: "Assign a person" },
  { ex: "assign to sara", label: "Assign, creating if new" },
  { ex: "ask john to ship", label: "Assign; rest becomes the title" },
  { ex: "owner: dana", label: "Assign as the owner" },
  { ex: "due friday", label: "Set a due date" },
  { ex: "remind me tomorrow 3pm", label: "Set a reminder" },
  { ex: "eod, eow, end of month", label: "Due-date shorthands" },
];

/** Read-only reference column: quick-add syntax and keyboard shortcuts. */
export function SettingsReference() {
  return (
    <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Quick add
        </Text>
        <Text size="xs" c="dimmed">
          Type these into an item to set its labels, people, and dates inline. A
          date in a comment (due…, remind…) sets the item's reminder/due too,
          leaving the comment as written.
        </Text>
        <ScrollArea
          maxHeight={110}
          style={{ border: "1px solid var(--mantine-color-default-border)" }}
        >
          <Stack gap={0} p={4}>
            {QUICK_ADD.map(({ ex, label }) => (
              <Group key={ex} justify="space-between" wrap="nowrap" gap="md" px={6} py={4}>
                <Text
                  size="xs"
                  style={{
                    flexShrink: 0,
                    fontFamily: "var(--mantine-font-family-monospace)",
                    color: "var(--mantine-color-text)",
                  }}
                >
                  {ex}
                </Text>
                <Text size="xs" c="dimmed" ta="right">
                  {label}
                </Text>
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      </Stack>

      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Keyboard shortcuts
        </Text>
        <ScrollArea
          maxHeight={110}
          style={{ border: "1px solid var(--mantine-color-default-border)" }}
        >
          <Stack gap={0} p={4}>
            {SHORTCUTS.map(({ keys, label }) => (
              <Group key={label} justify="space-between" wrap="nowrap" gap="md" px={6} py={4}>
                <Group gap={3} wrap="nowrap" style={{ flexShrink: 0 }}>
                  {keys.map((k) => (
                    <Kbd key={k} size="xs">
                      {k}
                    </Kbd>
                  ))}
                </Group>
                <Text size="xs" c="dimmed" ta="right">
                  {label}
                </Text>
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      </Stack>
    </Stack>
  );
}

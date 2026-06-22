/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { ActionIcon, Group, Stack, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import { IconPlus, IconTag, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { randomLabelColor } from "../../lib/label";
import { emitLabelRosterAction } from "../../lib/panel";
import { type Label } from "../../lib/todos";
import { IconButton } from "../ui/IconButton";
import { LabelBadge } from "../ui/LabelBadge";
import { ScrollArea } from "../ui/ScrollArea";

/**
 * Per-list label roster management - the mirror of {@link AssigneeSettings} for
 * labels. Rename, reshuffle the color, or remove labels, or add a new one. Each
 * label is born with a random color; click its badge to reshuffle until you like
 * it (GitHub-style), the same gesture as recoloring an assignee avatar. Holds a
 * local copy (seeded from the list's roster) and edits optimistically, emitting
 * each change to the main window - the sole owner of the list - which applies it
 * to the store and autosaves.
 */
export function LabelSettings({ initial }: { initial: Label[] }) {
  const [roster, setRoster] = useState<Label[]>(initial);
  const [name, setName] = useState("");

  const rename = (id: string, value: string) => {
    setRoster((r) => r.map((l) => (l.id === id ? { ...l, name: value } : l)));
    emitLabelRosterAction({ type: "rename", id, name: value });
  };
  const recolor = (id: string) => {
    const color = randomLabelColor();
    setRoster((r) => r.map((l) => (l.id === id ? { ...l, color } : l)));
    emitLabelRosterAction({ type: "recolor", id, color });
  };
  const remove = (id: string) => {
    setRoster((r) => r.filter((l) => l.id !== id));
    emitLabelRosterAction({ type: "remove", id });
  };
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Don't create a second label with the same name.
    if (roster.some((l) => l.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setName("");
      return;
    }
    const label: Label = { id: crypto.randomUUID(), name: trimmed, color: randomLabelColor() };
    setRoster((r) => [...r, label]);
    emitLabelRosterAction({ type: "add", label });
    setName("");
  };

  // Show the roster alphabetically (keyed by id, so an inline rename keeps focus).
  const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500} px={4}>
        Labels
      </Text>
      <Text size="xs" c="dimmed" px={4}>
        Tags you can apply to items in this list. New labels get a random color -
        click the badge to reshuffle it.
      </Text>

      <Group gap={6} wrap="nowrap" mt={2}>
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          placeholder="Add a label…"
          leftSection={<IconTag size={14} />}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <ActionIcon variant="default" size={22} aria-label="Add label" onClick={add}>
          <IconPlus size={14} />
        </ActionIcon>
      </Group>

      {sorted.length > 0 && (
        <ScrollArea maxHeight={76} hideScrollbar>
          <Stack gap={4} p={8}>
            {sorted.map((l) => (
              <Group key={l.id} gap={6} wrap="nowrap">
                {/* Fixed-width slot so the name inputs line up regardless of badge
                    width; a long label scrolls within it rather than being cut
                    off. Clicking the badge reshuffles its color. */}
                <div
                  className="hide-scrollbar"
                  style={{
                    width: 104,
                    flexShrink: 0,
                    display: "flex",
                    overflowX: "auto",
                  }}
                >
                  <Tooltip label="Shuffle color" withArrow openDelay={400}>
                    <UnstyledButton
                      aria-label={`Shuffle color for ${l.name}`}
                      onClick={() => recolor(l.id)}
                      // Match the pill badge so the focus ring rounds to its shape.
                      style={{ display: "flex", borderRadius: "var(--mantine-radius-xl)" }}
                    >
                      <LabelBadge label={l} size={18} />
                    </UnstyledButton>
                  </Tooltip>
                </div>
                <TextInput
                  size="xs"
                  style={{ flex: 1 }}
                  value={l.name}
                  onChange={(e) => rename(l.id, e.currentTarget.value)}
                />
                <IconButton
                  label={`Remove ${l.name}`}
                  icon={IconTrash}
                  danger
                  onClick={() => remove(l.id)}
                />
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
}

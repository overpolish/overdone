/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import {
  ActionIcon,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconPlus, IconTrash, IconUserPlus } from "@tabler/icons-react";
import { useState } from "react";

import { pickColor, randomColor } from "../../lib/assignee";
import { emitRosterAction } from "../../lib/panel";
import { type Assignee } from "../../lib/todos";
import { AssigneeAvatar } from "../AssigneeAvatar";
import { IconButton } from "../IconButton";
import { ScrollArea } from "../ScrollArea";

/**
 * Per-list assignee roster management. Rename, recolor, or remove people, or add
 * a new one. Holds a local copy (seeded from the list's roster) and edits
 * optimistically, emitting each change to the main window — the sole owner of
 * the list — which applies it to the store and autosaves.
 */
export function AssigneeSettings({ initial }: { initial: Assignee[] }) {
  const [roster, setRoster] = useState<Assignee[]>(initial);
  const [name, setName] = useState("");

  const rename = (id: string, value: string) => {
    setRoster((r) => r.map((a) => (a.id === id ? { ...a, name: value } : a)));
    emitRosterAction({ type: "rename", id, name: value });
  };
  const recolor = (id: string, color: string) => {
    setRoster((r) => r.map((a) => (a.id === id ? { ...a, color } : a)));
    emitRosterAction({ type: "recolor", id, color });
  };
  const remove = (id: string) => {
    setRoster((r) => r.filter((a) => a.id !== id));
    emitRosterAction({ type: "remove", id });
  };
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Don't create a second person with the same name.
    if (roster.some((a) => a.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setName("");
      return;
    }
    const assignee: Assignee = { id: crypto.randomUUID(), name: trimmed, color: pickColor(trimmed) };
    setRoster((r) => [...r, assignee]);
    emitRosterAction({ type: "add", assignee });
    setName("");
  };

  // Show the roster alphabetically (keyed by id, so an inline rename keeps focus).
  const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500} px={4}>
        Assignees
      </Text>
      <Text size="xs" c="dimmed" px={4}>
        People you can assign to items in this list.
      </Text>

      {/* Add field stays pinned at the top, outside the scrolling list. Its
          trailing button matches the rows' delete button (same width + gap) so
          the right edges line up. The px matches the scroll's inner padding so
          everything shares one left/right edge. */}
      <Group gap={6} wrap="nowrap" mt={2} px={4}>
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          placeholder="Add a person…"
          leftSection={<IconUserPlus size={14} />}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <ActionIcon variant="default" size={22} aria-label="Add assignee" onClick={add}>
          <IconPlus size={14} />
        </ActionIcon>
      </Group>

      {sorted.length > 0 && (
        <ScrollArea maxHeight={220}>
          {/* Padding keeps the rows' focus rings and hover surfaces clear of the
              container's rounded (clipped) edges and corners. */}
          <Stack gap={4} px={4} py={8}>
            {sorted.map((a) => (
              <Group key={a.id} gap={6} wrap="nowrap">
                <Tooltip label="Change color" withArrow openDelay={400}>
                  <UnstyledButton
                    aria-label={`Change color for ${a.name}`}
                    onClick={() => recolor(a.id, randomColor())}
                    style={{ display: "flex", borderRadius: "50%" }}
                  >
                    <AssigneeAvatar assignee={a} size={24} withTooltip={false} />
                  </UnstyledButton>
                </Tooltip>
                <TextInput
                  size="xs"
                  style={{ flex: 1 }}
                  value={a.name}
                  onChange={(e) => rename(a.id, e.currentTarget.value)}
                />
                <IconButton
                  label={`Remove ${a.name}`}
                  icon={IconTrash}
                  danger
                  onClick={() => remove(a.id)}
                />
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
}

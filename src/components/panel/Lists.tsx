/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { ActionIcon, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconDownload, IconListCheck, IconPlus, IconTrash, IconUpload } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { exportList, importList, type ListMeta, useLists } from "../../lib/lists";
import { IconButton } from "../ui/IconButton";
import { ScrollArea } from "../ui/ScrollArea";

/** Human-readable file size, e.g. "820 B", "12 KB", "3.4 MB". */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * Lists picker shown in the secondary panel. Quick-select any list (focusing a
 * row makes it the active list across windows), rename it inline, create a new
 * one, or delete it.
 */
export function Lists() {
  const lists = useLists((s) => s.lists);
  const activeId = useLists((s) => s.activeId);
  const refresh = useLists((s) => s.refresh);
  const setActive = useLists((s) => s.setActive);
  const create = useLists((s) => s.create);
  const remove = useLists((s) => s.remove);
  const rename = useLists((s) => s.rename);

  // Id of a just-created list whose row should grab focus so its name can be
  // typed straightaway (the only place a list is renamed now).
  const [focusId, setFocusId] = useState<string | null>(null);

  // Re-scan whenever the panel mounts so it reflects edits made while it was
  // hidden.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createAndFocus = () => void create().then(setFocusId);

  return (
    <Stack gap="md" w={260}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={8} wrap="nowrap">
          <IconListCheck size={18} stroke={1.8} />
          <Title order={5}>Lists</Title>
        </Group>
        <Group gap={2} wrap="nowrap">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Import list"
            onClick={() => void importList()}
          >
            <IconUpload size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="New list"
            onClick={createAndFocus}
          >
            <IconPlus size={16} />
          </ActionIcon>
        </Group>
      </Group>

      {lists.length === 0 ? (
        <Text size="sm" c="dimmed">
          No lists yet. Create one with the + button.
        </Text>
      ) : (
        <ScrollArea maxHeight={240}>
          <Stack gap={2}>
            {lists.map((list) => (
              <ListRow
                key={list.id}
                list={list}
                active={list.id === activeId}
                autoFocus={list.id === focusId}
                onSelect={() => setActive(list.id)}
                onRename={(title) => rename(list.id, title)}
                onExport={() => void exportList(list.id, list.title)}
                onDelete={() => void remove(list.id)}
                onFocused={() => setFocusId(null)}
                canDelete={lists.length > 1}
              />
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
}

interface ListRowProps {
  list: ListMeta;
  active: boolean;
  /** Grab focus and select the name (a freshly created list, ready to rename). */
  autoFocus: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onExport: () => void;
  onDelete: () => void;
  /** Clear the parent's one-shot autofocus flag once consumed. */
  onFocused: () => void;
  /** The last remaining list can't be deleted (there's always one). */
  canDelete: boolean;
}

function ListRow({
  list,
  active,
  autoFocus,
  onSelect,
  onRename,
  onExport,
  onDelete,
  onFocused,
  canDelete,
}: ListRowProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Reveal the row actions on hover or keyboard focus, so tabbing through the
  // row lands on visible buttons instead of invisible (opacity: 0) targets.
  const revealed = hovered || focused;

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
    onFocused();
  }, [autoFocus, onFocused]);

  return (
    <Group
      gap={4}
      wrap="nowrap"
      pr={8}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      style={{
        borderRadius: "var(--mantine-radius-md)",
        background: active ? "var(--mantine-color-default)" : "transparent",
      }}
    >
      {/* Clicking the row selects the list; typing renames it. Selection is on
          click (not focus) so reopening the panel - which restores focus to the
          last-edited field - doesn't silently reselect, and clicking an already
          focused row still works. */}
      <TextInput
        ref={inputRef}
        variant="unstyled"
        placeholder="Untitled"
        value={list.title}
        onClick={onSelect}
        onChange={(e) => onRename(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        style={{ flex: 1, minWidth: 0 }}
        styles={{
          input: {
            padding: "3px 12px",
            fontWeight: active ? 600 : 400,
            height: "auto",
            minHeight: 0,
          },
        }}
      />

      {/* Disk usage at a glance; yields to the action buttons on reveal. */}
      {!revealed && (
        <Text size="10px" c="dimmed" style={{ flexShrink: 0 }}>
          {formatBytes(list.bytes)}
        </Text>
      )}

      {/* Export / delete reveal on hover or focus to keep the row uncluttered. */}
      <Group gap={2} wrap="nowrap" style={{ flexShrink: 0, opacity: revealed ? 1 : 0 }}>
        <IconButton
          icon={IconDownload}
          label={`Export ${list.title || "Untitled"}`}
          onClick={onExport}
        />
        {canDelete && (
          <IconButton
            icon={IconTrash}
            label={`Delete ${list.title || "Untitled"}`}
            onClick={onDelete}
            danger
          />
        )}
      </Group>
    </Group>
  );
}

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { ActionIcon, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import {
  IconArrowBackUp,
  IconArrowLeft,
  IconDownload,
  IconListCheck,
  IconPlus,
  IconTrash,
  IconTrashX,
  IconUpload,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

import {
  exportList,
  importList,
  type ListMeta,
  listTrash,
  purgeList,
  restoreList,
  type TrashMeta,
  useLists,
} from "../lib/lists";
import { IconButton } from "./IconButton";
import { ScrollArea } from "./ScrollArea";

/** Human-readable file size, e.g. "820 B", "12 KB", "3.4 MB". */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Compact relative age, e.g. "just now", "12m ago", "3h ago", "5d ago". */
function timeAgo(ms: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Lists picker shown in the secondary panel. Quick-select any list (focusing a
 * row makes it the active list across windows), rename it inline, create a new
 * one, delete it (deleted lists go to the trash), or open the Trash view to
 * restore or permanently remove a deleted list.
 */
export function Lists() {
  const lists = useLists((s) => s.lists);
  const activeId = useLists((s) => s.activeId);
  const refresh = useLists((s) => s.refresh);
  const setActive = useLists((s) => s.setActive);
  const create = useLists((s) => s.create);
  const remove = useLists((s) => s.remove);
  const rename = useLists((s) => s.rename);

  const [view, setView] = useState<"lists" | "trash">("lists");
  const [trash, setTrash] = useState<TrashMeta[]>([]);

  const loadTrash = useCallback(() => {
    void listTrash().then(setTrash);
  }, []);

  // Re-scan whenever the panel mounts so it reflects edits made while it was
  // hidden; keep the trash count fresh so the Trash button can show it.
  useEffect(() => {
    void refresh();
    loadTrash();
  }, [refresh, loadTrash]);

  if (view === "trash") {
    return (
      <Stack gap="md" w={260}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            <IconTrash size={18} stroke={1.8} />
            <Title order={5}>Trash</Title>
          </Group>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Back to lists"
            onClick={() => setView("lists")}
          >
            <IconArrowLeft size={16} />
          </ActionIcon>
        </Group>

        {trash.length === 0 ? (
          <Text size="sm" c="dimmed">
            Trash is empty. Deleted lists appear here and are removed for good
            after 30 days.
          </Text>
        ) : (
          <>
            <Text size="xs" c="dimmed">
              Deleted lists are removed for good after 30 days.
            </Text>
            <ScrollArea maxHeight={240}>
              <Stack gap={2}>
                {trash.map((list) => (
                  <TrashRow
                    key={list.id}
                    list={list}
                    onRestore={() => void restoreList(list.id).then(loadTrash)}
                    onPurge={() => void purgeList(list.id).then(loadTrash)}
                  />
                ))}
              </Stack>
            </ScrollArea>
          </>
        )}
      </Stack>
    );
  }

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
            aria-label="Trash"
            onClick={() => {
              loadTrash();
              setView("trash");
            }}
          >
            <IconTrash size={16} />
          </ActionIcon>
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
            onClick={() => void create()}
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
                onSelect={() => setActive(list.id)}
                onRename={(title) => rename(list.id, title)}
                onExport={() => void exportList(list.id, list.title)}
                onDelete={() => void remove(list.id).then(loadTrash)}
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
  onSelect: () => void;
  onRename: (title: string) => void;
  onExport: () => void;
  onDelete: () => void;
}

function ListRow({ list, active, onSelect, onRename, onExport, onDelete }: ListRowProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Reveal the row actions on hover or keyboard focus, so tabbing through the
  // row lands on visible buttons instead of invisible (opacity: 0) targets.
  const revealed = hovered || focused;

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
      {/* Focusing the field selects the list; typing renames it. */}
      <TextInput
        variant="unstyled"
        placeholder="Untitled"
        value={list.title}
        onFocus={onSelect}
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
        <IconButton
          icon={IconTrash}
          label={`Delete ${list.title || "Untitled"}`}
          onClick={onDelete}
          danger
        />
      </Group>
    </Group>
  );
}

interface TrashRowProps {
  list: TrashMeta;
  onRestore: () => void;
  onPurge: () => void;
}

function TrashRow({ list, onRestore, onPurge }: TrashRowProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const revealed = hovered || focused;

  return (
    <Group
      gap={4}
      wrap="nowrap"
      pr={8}
      pl={12}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      style={{ borderRadius: "var(--mantine-radius-md)" }}
    >
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" truncate>
          {list.title || "Untitled"}
        </Text>
        <Text size="10px" c="dimmed">
          {`deleted ${timeAgo(list.deletedAt)} · ${formatBytes(list.bytes)}`}
        </Text>
      </Stack>

      {/* Restore / delete-forever reveal on hover or focus. */}
      <Group gap={2} wrap="nowrap" style={{ flexShrink: 0, opacity: revealed ? 1 : 0 }}>
        <IconButton
          icon={IconArrowBackUp}
          label={`Restore ${list.title || "Untitled"}`}
          onClick={onRestore}
        />
        <IconButton
          icon={IconTrashX}
          label={`Delete ${list.title || "Untitled"} forever`}
          onClick={onPurge}
          danger
        />
      </Group>
    </Group>
  );
}

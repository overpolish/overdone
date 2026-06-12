import {
  ActionIcon,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
  useComputedColorScheme,
} from "@mantine/core";
import { IconDownload, IconListCheck, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { exportList, type ListMeta, useLists } from "../lib/lists";
import { dangerBg, dangerFg } from "../lib/styles";
import { ScrollArea } from "./ScrollArea";

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

  // Re-scan whenever the panel mounts so it reflects edits made while it was
  // hidden.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Stack gap="md" w={260}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={8} wrap="nowrap">
          <IconListCheck size={18} stroke={1.8} />
          <Title order={5}>Lists</Title>
        </Group>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label="New list"
          onClick={() => void create()}
        >
          <IconPlus size={16} />
        </ActionIcon>
      </Group>

      {lists.length === 0 ? (
        <Text size="sm" c="dimmed">
          No lists yet. Create one with the + button.
        </Text>
      ) : (
        <ScrollArea maxHeight={240} radius="var(--mantine-radius-md)">
          <Stack gap={2}>
            {lists.map((list) => (
              <ListRow
                key={list.id}
                list={list}
                active={list.id === activeId}
                onSelect={() => setActive(list.id)}
                onRename={(title) => rename(list.id, title)}
                onExport={() => void exportList(list.id, list.title)}
                onDelete={() => void remove(list.id)}
                canDelete={lists.length > 1}
              />
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
}

interface RowButtonProps {
  icon: typeof IconTrash;
  label: string;
  onClick: () => void;
  /** Whether the row is hovered (controls fade-in). */
  visible: boolean;
  /** Destructive styling (red on hover). */
  danger?: boolean;
}

/** A hover-revealed action button on a list row (export / delete). */
function RowButton({ icon: Icon, label, onClick, visible, danger }: RowButtonProps) {
  const [hovered, setHovered] = useState(false);
  const dark = useComputedColorScheme("light") === "dark";

  return (
    <UnstyledButton
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        width: 24,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--mantine-radius-md)",
        color: danger ? dangerFg(dark) : "var(--mantine-color-dimmed)",
        background: hovered
          ? danger
            ? dangerBg(dark)
            : "var(--mantine-color-default-hover)"
          : "transparent",
        opacity: visible ? 1 : 0,
        transition: "opacity 120ms ease, background 120ms ease",
      }}
    >
      <Icon size={14} stroke={2} style={{ display: "block" }} />
    </UnstyledButton>
  );
}

interface ListRowProps {
  list: ListMeta;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onExport: () => void;
  onDelete: () => void;
  /** The last remaining list can't be deleted (there's always one). */
  canDelete: boolean;
}

function ListRow({
  list,
  active,
  onSelect,
  onRename,
  onExport,
  onDelete,
  canDelete,
}: ListRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <Group
      gap={4}
      wrap="nowrap"
      pr={8}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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

      <RowButton
        icon={IconDownload}
        label={`Export ${list.title || "Untitled"}`}
        onClick={onExport}
        visible={hovered}
      />
      {canDelete && (
        <RowButton
          icon={IconTrash}
          label={`Delete ${list.title || "Untitled"}`}
          onClick={onDelete}
          visible={hovered}
          danger
        />
      )}
    </Group>
  );
}

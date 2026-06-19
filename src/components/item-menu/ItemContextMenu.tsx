/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Divider, Text } from "@mantine/core";
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowBarToUp,
  IconCopy,
  IconCornerDownRight,
  IconPin,
  IconPinnedOff,
  IconTrash,
  type IconProps,
} from "@tabler/icons-react";
import { type ComponentType, useEffect } from "react";

import { useItemMenu } from "../../lib/context-menu";
import { useSelection } from "../../lib/selection";
import { useTodos } from "../../lib/todos";
import { itemToText, MenuRow, MenuShell, ROW_HEIGHT, StatusRow } from "./parts";

/**
 * Right-click menu for a todo item: the structural actions (add sub-item,
 * indent, outdent) plus delete. A single instance lives in the main window and
 * positions itself at the cursor, clamped to the viewport. When the right-clicked
 * row is part of a multi-selection it switches to the {@link BulkMenu}.
 */
export function ItemContextMenu() {
  const open = useItemMenu((s) => s.open);
  const hide = useItemMenu((s) => s.hide);
  const items = useTodos((s) => s.items);
  const selectedIds = useSelection((s) => s.ids);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hide]);

  if (!open) return null;

  // Bulk menu when the right-clicked row is part of a multi-selection (TodoItem
  // drops the selection first when an unselected row is right-clicked).
  if (selectedIds.has(open.id) && selectedIds.size > 1) {
    return <BulkMenu x={open.x} y={open.y} hide={hide} />;
  }

  const idx = items.findIndex((i) => i.id === open.id);
  if (idx === -1) return null;

  const item = items[idx];
  const todos = useTodos.getState();
  const isChild = item.depth === 1;
  const canIndent = item.depth === 0 && idx > 0;

  const actions: {
    label: string;
    icon: ComponentType<IconProps>;
    onClick: () => void;
  }[] = [];
  // Pin/unpin floats a top-level item to the top of the list (offered on top
  // items only - a sub-item would have to leave its parent to reach the top).
  if (!isChild)
    actions.push({
      label: item.pinned ? "Unpin" : "Pin to top",
      icon: item.pinned ? IconPinnedOff : IconPin,
      onClick: () => todos.togglePin(open.id),
    });
  // Only worth offering when it isn't already first (a child is never at idx 0,
  // so this also promotes it to a top-level item).
  if (idx > 0)
    actions.push({
      label: "Move to top",
      icon: IconArrowBarToUp,
      onClick: () => todos.moveItem(open.id, 0),
    });
  if (!isChild)
    actions.push({
      label: "Add sub-item",
      icon: IconCornerDownRight,
      onClick: () => todos.addSubItem(open.id),
    });
  if (canIndent)
    actions.push({
      label: "Indent",
      icon: IconArrowBarToRight,
      onClick: () => todos.indentItem(open.id),
    });
  if (isChild)
    actions.push({
      label: "Outdent",
      icon: IconArrowBarToLeft,
      onClick: () => todos.outdentItem(open.id),
    });
  actions.push({
    label: "Copy item",
    icon: IconCopy,
    onClick: () => void navigator.clipboard.writeText(itemToText(item, todos.labels)),
  });

  const rows = actions.length + 1; // + delete
  const height = rows * ROW_HEIGHT + 16;

  return (
    <MenuShell x={open.x} y={open.y} height={height} hide={hide}>
      {actions.map((a) => (
        <MenuRow
          key={a.label}
          label={a.label}
          icon={a.icon}
          onClick={() => {
            a.onClick();
            hide();
          }}
        />
      ))}
      {actions.length > 0 && <Divider my={2} />}
      <MenuRow
        label="Delete"
        icon={IconTrash}
        danger
        onClick={() => {
          todos.deleteItem(open.id);
          hide();
        }}
      />
    </MenuShell>
  );
}

/**
 * Bulk menu shown when several items are selected: set-status row, copy, pin,
 * and delete, each acting on the whole selection in one undo step.
 */
function BulkMenu({ x, y, hide }: { x: number; y: number; hide: () => void }) {
  const items = useTodos((s) => s.items);
  const selectedIds = useSelection((s) => s.ids);
  const todos = useTodos.getState();

  // In display order, so a copy reads top-to-bottom like the list.
  const selected = items.filter((i) => selectedIds.has(i.id));
  const ids = selected.map((i) => i.id);
  const topSelected = selected.filter((i) => i.depth === 0);
  const allPinned = topSelected.length > 0 && topSelected.every((i) => i.pinned);

  const height = 4 * ROW_HEIGHT + 56;

  return (
    <MenuShell x={x} y={y} height={height} hide={hide}>
      <Text size="xs" c="dimmed" px={8} pt={4} pb={2}>
        {selected.length} selected
      </Text>
      <StatusRow
        onPick={(state) => {
          todos.setItemsState(ids, state);
          hide();
        }}
      />
      <Divider my={2} />
      <MenuRow
        label="Copy items"
        icon={IconCopy}
        onClick={() => {
          void navigator.clipboard.writeText(
            selected.map((it) => itemToText(it, todos.labels)).join("\n"),
          );
          hide();
        }}
      />
      <MenuRow
        label={allPinned ? "Unpin" : "Pin to top"}
        icon={allPinned ? IconPinnedOff : IconPin}
        onClick={() => {
          todos.setItemsPinned(ids, !allPinned);
          hide();
        }}
      />
      <Divider my={2} />
      <MenuRow
        label="Delete"
        icon={IconTrash}
        danger
        onClick={() => {
          todos.deleteItems(ids);
          useSelection.getState().clear();
          hide();
        }}
      />
    </MenuShell>
  );
}

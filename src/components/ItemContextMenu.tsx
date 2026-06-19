/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Divider, Paper, Stack, Text, UnstyledButton, useComputedColorScheme } from "@mantine/core";
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowBarToUp,
  IconCopy,
  IconCornerDownRight,
  IconTrash,
  type IconProps,
} from "@tabler/icons-react";
import { type ComponentType, useEffect, useState } from "react";

import { useItemMenu } from "../lib/context-menu";
import { resolveLabels } from "../lib/label";
import { dangerBg, dangerFg } from "../lib/styles";
import { useTodos } from "../lib/todos";

const MENU_WIDTH = 184;
const ROW_HEIGHT = 30;

/**
 * Right-click menu for a todo item: the structural actions (add sub-item,
 * indent, outdent) plus delete. A single instance lives in the main window and
 * positions itself at the cursor, clamped to the viewport.
 */
export function ItemContextMenu() {
  const open = useItemMenu((s) => s.open);
  const hide = useItemMenu((s) => s.hide);
  const items = useTodos((s) => s.items);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hide]);

  if (!open) return null;
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
  // Copy the title plus its labels as `#name` tokens, matching the quick-add
  // syntax so the copied text pastes straight back into a new item.
  actions.push({
    label: "Copy item",
    icon: IconCopy,
    onClick: () => {
      const labels = resolveLabels(item.labels ?? [], todos.labels);
      const tags = labels.map((l) => `#${l.name}`).join(" ");
      const text = [item.text.trim(), tags].filter(Boolean).join(" ");
      void navigator.clipboard.writeText(text);
    },
  });

  const rows = actions.length + 1; // + delete
  const height = rows * ROW_HEIGHT + 16;
  const x = Math.max(4, Math.min(open.x, window.innerWidth - MENU_WIDTH - 4));
  const y = Math.max(4, Math.min(open.y, window.innerHeight - height - 4));

  return (
    <>
      {/* Click-away / right-click-away catcher. */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 1000 }}
        onClick={hide}
        onContextMenu={(e) => {
          e.preventDefault();
          hide();
        }}
      />
      <Paper
        shadow="md"
        radius="md"
        withBorder
        style={{
          position: "fixed",
          left: x,
          top: y,
          width: MENU_WIDTH,
          padding: 4,
          zIndex: 1001,
        }}
      >
        <Stack gap={1}>
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
        </Stack>
      </Paper>
    </>
  );
}

interface MenuRowProps {
  label: string;
  icon: ComponentType<IconProps>;
  onClick: () => void;
  danger?: boolean;
}

function MenuRow({ label, icon: Icon, onClick, danger }: MenuRowProps) {
  const [hovered, setHovered] = useState(false);
  const dark = useComputedColorScheme("light") === "dark";

  return (
    <UnstyledButton
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: "var(--mantine-radius-md)",
        color: danger ? dangerFg(dark) : undefined,
        background: hovered
          ? danger
            ? dangerBg(dark)
            : "var(--mantine-color-default-hover)"
          : "transparent",
      }}
    >
      <Icon size={15} stroke={2} style={{ display: "block" }} />
      <Text size="sm" c="inherit">
        {label}
      </Text>
    </UnstyledButton>
  );
}

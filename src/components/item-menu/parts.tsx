/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Group, Paper, Stack, Text, UnstyledButton, useComputedColorScheme } from "@mantine/core";
import { type IconProps } from "@tabler/icons-react";
import { type ComponentType, type ReactNode, useState } from "react";

import { resolveLabels } from "../../lib/label";
import { dangerBg, dangerFg } from "../../lib/styles";
import { TODO_STATES, type TodoState } from "../../lib/todo";
import { type TodoData } from "../../lib/todos";
import { StateBox } from "../StateBox";

export const MENU_WIDTH = 194;
export const ROW_HEIGHT = 30;

/** Format an item as its title plus its labels as `#name` tokens - the quick-add
 * syntax, so the copied text pastes straight back into a new item. */
export function itemToText(item: TodoData, roster: Parameters<typeof resolveLabels>[1]): string {
  const tags = resolveLabels(item.labels ?? [], roster)
    .map((l) => `#${l.name}`)
    .join(" ");
  return [item.text.trim(), tags].filter(Boolean).join(" ");
}

/** The shared menu chrome: a full-screen click-away catcher plus the positioned,
 * viewport-clamped paper. */
export function MenuShell({
  x,
  y,
  height,
  hide,
  children,
}: {
  x: number;
  y: number;
  height: number;
  hide: () => void;
  children: ReactNode;
}) {
  const left = Math.max(4, Math.min(x, window.innerWidth - MENU_WIDTH - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - height - 4));
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
          left,
          top,
          width: MENU_WIDTH,
          padding: 4,
          zIndex: 1001,
        }}
      >
        <Stack gap={1}>{children}</Stack>
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

/** One clickable menu row: an icon, a label, and a hover wash (danger-tinted for
 * destructive actions). */
export function MenuRow({ label, icon: Icon, onClick, danger }: MenuRowProps) {
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

/** A row of status swatches (the bulk menu); picking one sets every selected item
 * to that state. */
export function StatusRow({ onPick }: { onPick: (state: TodoState) => void }) {
  return (
    <Group gap={4} px={8} py={4} justify="space-between" wrap="nowrap">
      {TODO_STATES.map((s) => (
        <UnstyledButton
          key={s.value}
          aria-label={`Mark ${s.label}`}
          title={s.label}
          onClick={() => onPick(s.value)}
          style={{ display: "flex", borderRadius: "var(--mantine-radius-sm)" }}
        >
          <StateBox state={s.value} />
        </UnstyledButton>
      ))}
    </Group>
  );
}

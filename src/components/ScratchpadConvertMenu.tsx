/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconListCheck } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { MENU_WIDTH } from "./item-menu/parts";

/**
 * The single-action context menu for converting a scratchpad selection into a
 * list item. Positioned at the cursor and clamped to the window, like
 * ItemContextMenu. Escape, clicking away, or right-clicking away dismiss it.
 * `canConvert` is false for a code-block-only selection - the action is shown
 * disabled with a hint, since a code block can't be an item.
 */
export function ScratchpadConvertMenu({
  x,
  y,
  canConvert,
  onConvert,
  onClose,
}: {
  x: number;
  y: number;
  canConvert: boolean;
  onConvert: () => void;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = Math.max(4, Math.min(x, window.innerWidth - MENU_WIDTH - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - (canConvert ? 44 : 62)));

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 1000 }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <Paper
        shadow="md"
        radius="md"
        withBorder
        style={{ position: "fixed", left, top, width: MENU_WIDTH, padding: 4, zIndex: 1001 }}
      >
        <UnstyledButton
          onClick={canConvert ? onConvert : undefined}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: "var(--mantine-radius-md)",
            cursor: canConvert ? "pointer" : "default",
            opacity: canConvert ? 1 : 0.45,
            background: canConvert && hovered ? "var(--mantine-color-default-hover)" : "transparent",
          }}
        >
          <IconListCheck size={15} stroke={2} style={{ display: "block" }} />
          <Stack gap={0}>
            <Text size="sm">Convert to item</Text>
            {!canConvert && (
              <Text size="10px" c="dimmed">
                A code block can't be an item
              </Text>
            )}
          </Stack>
        </UnstyledButton>
      </Paper>
    </>
  );
}

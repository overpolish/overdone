/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Paper, Text, UnstyledButton } from "@mantine/core";
import { IconListCheck } from "@tabler/icons-react";
import { useEffect, useState } from "react";

const MENU_WIDTH = 188;

/**
 * The single-action context menu for converting a scratchpad selection into a
 * list item. Positioned at the cursor and clamped to the window, like
 * ItemContextMenu. Escape, clicking away, or right-clicking away dismiss it.
 */
export function ScratchpadConvertMenu({
  x,
  y,
  onConvert,
  onClose,
}: {
  x: number;
  y: number;
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
  const top = Math.max(4, Math.min(y, window.innerHeight - 44));

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
          onClick={onConvert}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: "var(--mantine-radius-md)",
            background: hovered ? "var(--mantine-color-default-hover)" : "transparent",
          }}
        >
          <IconListCheck size={15} stroke={2} style={{ display: "block" }} />
          <Text size="sm">Convert to item</Text>
        </UnstyledButton>
      </Paper>
    </>
  );
}

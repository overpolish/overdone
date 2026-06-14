/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { Box, Center, Group, UnstyledButton, useComputedColorScheme } from "@mantine/core";
import { IconListCheck, IconMinus, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";

import { openListsPanel, openSearchPanel, openSettingsPanel } from "../lib/panel";
import { useTodos } from "../lib/todos";
import { IconButton } from "./IconButton";

const TITLEBAR_HEIGHT = 38;

/**
 * Custom transparent title bar, shared by macOS and Windows.
 *
 * - The whole bar is a Tauri drag region (`data-tauri-drag-region`).
 * - Native window controls are hidden on both platforms (traffic lights on
 *   macOS, the frame on Windows), so we render our own subtle
 *   minimize / maximize / close buttons.
 * - The logo stays centered and opens the panel.
 */
export function Titlebar() {
  // Resolve "auto" to the actual scheme. The logo is light by default (good on
  // dark backgrounds), so invert it only in light mode.
  const light = useComputedColorScheme("light") === "light";

  return (
    <Box
      data-tauri-drag-region
      h={TITLEBAR_HEIGHT}
      pos="relative"
      style={{ flexShrink: 0, userSelect: "none" }}
    >
      {/*
       * Logo opens the panel. The Center is pointer-events: none so the empty
       * bar stays draggable; the button re-enables events for itself only.
       */}
      <Center h="100%" style={{ pointerEvents: "none" }}>
        <UnstyledButton
          aria-label="Open settings"
          onClick={openSettingsPanel}
          style={{
            pointerEvents: "auto",
            display: "flex",
            lineHeight: 0,
            cursor: "pointer",
            borderRadius: "var(--mantine-radius-sm)",
          }}
        >
          <img
            src="/icon.svg"
            alt="Overdone"
            style={{
              height: 18,
              display: "block",
              filter: light ? "invert(1)" : undefined,
            }}
          />
        </UnstyledButton>
      </Center>

      <Group h="100%" gap={2} pl={8} pos="absolute" top={0} left={0} wrap="nowrap">
        {/* Both hide the app to the tray (never quit - quit is via the tray
            menu), so neither sends the window to the dock. */}
        <IconButton
          label="Close"
          icon={IconX}
          onClick={() => void invoke("hide_to_tray")}
          danger
        />
        <IconButton
          label="Minimize"
          icon={IconMinus}
          onClick={() => void invoke("hide_to_tray")}
        />
      </Group>

      {/* Add + lists on the right, mirroring the window controls on the left. */}
      <Group h="100%" gap={2} pr={8} pos="absolute" top={0} right={0} wrap="nowrap">
        {/* Backup for type-to-create: makes a new item and focuses it. */}
        <IconButton
          label="Add item"
          icon={IconPlus}
          onClick={() => useTodos.getState().addItem()}
        />
        <IconButton label="Search" icon={IconSearch} onClick={openSearchPanel} />
        <IconButton label="Lists" icon={IconListCheck} onClick={openListsPanel} />
      </Group>
    </Box>
  );
}

import { Box, Center, Group, UnstyledButton, useComputedColorScheme } from "@mantine/core";
import { IconListCheck, IconMinus, IconX } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { openPanel } from "../lib/panel";
import { dangerBg, dangerFg } from "../lib/styles";

const TITLEBAR_HEIGHT = 38;

interface WindowButtonProps {
  label: string;
  icon: typeof IconX;
  onClick: () => void;
  /** Close button: tints red on hover. */
  danger?: boolean;
}

/**
 * A single window control. Dimmed and chrome-free at rest so it isn't in your
 * face; it gains a hover surface (red for close) only on pointer-over.
 */
function WindowButton({ label, icon: Icon, onClick, danger }: WindowButtonProps) {
  const [hovered, setHovered] = useState(false);
  const dark = useComputedColorScheme("light") === "dark";

  return (
    <UnstyledButton
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        // Re-enable events for the button; the surrounding bar is a drag region.
        pointerEvents: "auto",
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--mantine-radius-md)",
        opacity: hovered ? 1 : 0.5,
        color: danger && hovered ? dangerFg(dark) : "var(--mantine-color-dimmed)",
        background: hovered
          ? danger
            ? dangerBg(dark)
            : "var(--mantine-color-default-hover)"
          : "transparent",
        transition: "opacity 120ms ease, background 120ms ease, color 120ms ease",
      }}
    >
      <Icon size={14} stroke={2} style={{ display: "block" }} />
    </UnstyledButton>
  );
}

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
          onClick={() => openPanel({ view: "settings" })}
          style={{
            pointerEvents: "auto",
            display: "flex",
            lineHeight: 0,
            cursor: "pointer",
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
        {/* Both hide the app to the tray (never quit — quit is via the tray
            menu), so neither sends the window to the dock. */}
        <WindowButton
          label="Close"
          icon={IconX}
          onClick={() => void invoke("hide_to_tray")}
          danger
        />
        <WindowButton
          label="Minimize"
          icon={IconMinus}
          onClick={() => void invoke("hide_to_tray")}
        />
      </Group>

      {/* Lists picker on the right, mirroring the window controls on the left. */}
      <Group h="100%" gap={2} pr={8} pos="absolute" top={0} right={0} wrap="nowrap">
        <WindowButton
          label="Lists"
          icon={IconListCheck}
          onClick={() => openPanel({ view: "lists" })}
        />
      </Group>
    </Box>
  );
}

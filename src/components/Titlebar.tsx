import {
  ActionIcon,
  Box,
  Center,
  Group,
  useComputedColorScheme,
} from "@mantine/core";
import { IconMinus, IconSquare, IconX } from "@tabler/icons-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";

// `platform()` reads internals injected by the Tauri OS plugin; it throws if
// the page is opened outside the Tauri webview (e.g. a plain browser tab).
function detectOS(): string {
  try {
    return platform();
  } catch {
    return "";
  }
}

const os = detectOS();
const isWindows = os === "windows";

const TITLEBAR_HEIGHT = 38;

/**
 * Custom transparent title bar.
 *
 * - The whole bar is a Tauri drag region (`data-tauri-drag-region`).
 * - macOS keeps its native traffic lights (window config `titleBarStyle:
 *   "Overlay"`); the logo stays centered across the full bar width.
 * - Windows has no native controls here, so we render our own
 *   minimize / maximize / close buttons.
 */
export function Titlebar() {
  const appWindow = getCurrentWindow();
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
      {/* Centered logo - pointer-events off so clicks fall through to drag. */}
      <Center h="100%" style={{ pointerEvents: "none" }}>
        <img
          src="/icon.svg"
          alt="Overdone"
          style={{
            height: 18,
            display: "block",
            filter: light ? "invert(1)" : undefined,
          }}
        />
      </Center>

      {isWindows && (
        <Group h="100%" gap={2} pr={6} pos="absolute" top={0} right={0}>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius="sm"
            aria-label="Minimize"
            onClick={() => void appWindow.minimize()}
          >
            <IconMinus size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius="sm"
            aria-label="Maximize"
            onClick={() => void appWindow.toggleMaximize()}
          >
            <IconSquare size={14} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            radius="sm"
            aria-label="Close"
            onClick={() => void appWindow.close()}
          >
            <IconX size={16} />
          </ActionIcon>
        </Group>
      )}
    </Box>
  );
}

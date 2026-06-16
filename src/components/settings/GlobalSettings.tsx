/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  Kbd,
  Progress,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconDeviceDesktop,
  IconMoon,
  IconSun,
} from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRef, useState } from "react";

import { emitOpenReview } from "../../lib/panel";
import { type MediaCompression, useSettings } from "../../lib/settings";
import { ScrollArea } from "../ScrollArea";

// Modifier glyphs differ per platform: ⌘/⌥/⇧ on macOS, spelled out on Windows.
const IS_MAC =
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? "⌘" : "Ctrl";
const SHIFT = IS_MAC ? "⇧" : "Shift";

/** Keyboard shortcuts shown in settings, keys on the left and action on right. */
const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [MOD, "F"], label: "Search" },
  { keys: [MOD, SHIFT, "F"], label: "Filter" },
  { keys: [MOD, "L"], label: "Lists" },
  { keys: [MOD, ","], label: "Settings" },
  { keys: [MOD, "N"], label: "New item" },
  { keys: ["A–Z"], label: "Type to start a new item" },
  { keys: [MOD, "Z"], label: "Undo" },
  { keys: [MOD, SHIFT, "Z"], label: "Redo" },
  { keys: ["Esc"], label: "Drop focus from the field" },
  { keys: [MOD, "]"], label: "Indent item" },
  { keys: [MOD, "["], label: "Outdent item" },
  { keys: ["↵"], label: "Confirm item" },
  { keys: [SHIFT, "↵"], label: "New line within an item" },
  { keys: ["⌫"], label: "Delete empty item" },
  { keys: ["↑", "↓"], label: "Move between items" },
];

/** Quick-add syntax shown in settings: an example on the left, what it does on
 * the right. Typed into an item's title (and dates also work inside comments). */
const QUICK_ADD: { ex: string; label: string }[] = [
  { ex: "#bug", label: "Add a label (fuzzy-matched)" },
  { ex: "@john", label: "Assign a person" },
  { ex: "assign to sara", label: "Assign, creating if new" },
  { ex: "ask john to ship", label: "Assign; rest becomes the title" },
  { ex: "owner: dana", label: "Assign as the owner" },
  { ex: "due friday", label: "Set a due date" },
  { ex: "remind me tomorrow 3pm", label: "Set a reminder" },
  { ex: "eod, eow, end of month", label: "Due-date shorthands" },
];

/** Progress phase for the one-time ffmpeg download (enabling compression). */
interface FfmpegProgress {
  phase: "starting" | "downloading" | "unpacking" | "done";
  downloaded?: number;
  total?: number;
}

interface DownloadState {
  active: boolean;
  /** 0–100, or null while indeterminate (before byte totals are known). */
  pct: number | null;
  label: string;
  error?: string;
}

type ColorScheme = "light" | "dark" | "auto";

const COLOR_SCHEMES: { value: ColorScheme; label: string; icon: typeof IconSun }[] = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "auto", label: "System", icon: IconDeviceDesktop },
];

/** App-wide preferences: appearance, window behavior, and attachment handling. */
export function GlobalSettings() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const alwaysOnTop = useSettings((state) => state.alwaysOnTop);
  const setAlwaysOnTop = useSettings((state) => state.setAlwaysOnTop);
  const passthrough = useSettings((state) => state.passthrough);
  const setPassthrough = useSettings((state) => state.setPassthrough);
  const launchAtStartup = useSettings((state) => state.launchAtStartup);
  const setLaunchAtStartup = useSettings((state) => state.setLaunchAtStartup);
  const excludeFromCapture = useSettings((state) => state.excludeFromCapture);
  const setExcludeFromCapture = useSettings((state) => state.setExcludeFromCapture);
  const mediaCompression = useSettings((state) => state.mediaCompression);
  const setMediaCompression = useSettings((state) => state.setMediaCompression);
  const dailyReview = useSettings((state) => state.dailyReview);
  const setDailyReview = useSettings((state) => state.setDailyReview);
  const [download, setDownload] = useState<DownloadState | null>(null);
  const downloadingRef = useRef(false);

  // Switching to "Compressed" downloads ffmpeg up front (with progress) rather
  // than silently on first import, so there's clear feedback.
  const onMediaChange = (value: MediaCompression) => {
    setMediaCompression(value);
    if (value === "compressed") void ensureFfmpeg();
  };

  const ensureFfmpeg = async () => {
    if (downloadingRef.current) return;
    if (await invoke<boolean>("ffmpeg_installed").catch(() => false)) return;

    downloadingRef.current = true;
    setDownload({ active: true, pct: null, label: "Preparing download…" });
    let unlisten = () => {};
    try {
      unlisten = await listen<FfmpegProgress>("ffmpeg:progress", (e) => {
        const p = e.payload;
        if (p.phase === "downloading" && p.total) {
          setDownload({
            active: true,
            pct: Math.round((p.downloaded! / p.total) * 100),
            label: "Downloading ffmpeg…",
          });
        } else if (p.phase === "unpacking") {
          setDownload({ active: true, pct: 100, label: "Unpacking…" });
        }
      });
      await invoke("download_ffmpeg");
      setDownload({ active: false, pct: 100, label: "ffmpeg ready" });
    } catch {
      setDownload({
        active: false,
        pct: null,
        label: "",
        error: "ffmpeg download failed - it'll retry on first use.",
      });
    } finally {
      unlisten();
      downloadingRef.current = false;
    }
  };

  return (
    <Group align="flex-start" gap="lg" wrap="nowrap">
      {/* Left column: the preference controls. */}
      <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={500}>
            Appearance
          </Text>
          <Box
            style={{
              display: "flex",
              gap: 2,
              padding: 4,
              // Outer radius = inner chip radius (md, matching the buttons) + the
              // padding, so the corners stay concentric.
              borderRadius: "calc(var(--mantine-radius-md) + 4px)",
              // Matches the unchecked Checkbox surface + border (both resolve to
              // white / gray-4 in light, dark-6 / dark-4 in dark).
              background: "var(--mantine-color-default)",
              border: "1px solid var(--mantine-color-default-border)",
            }}
          >
            {COLOR_SCHEMES.map(({ value, label, icon: Icon }) => {
              const active = colorScheme === value;
              return (
                <Tooltip key={value} label={label} withArrow openDelay={300}>
                  <ActionIcon
                    size="md"
                    radius="md"
                    // Selected = filled primary, matching the app's buttons; the
                    // others stay ghosted.
                    variant={active ? "filled" : "subtle"}
                    color={active ? undefined : "gray"}
                    aria-label={label}
                    aria-pressed={active}
                    onClick={() => setColorScheme(value)}
                  >
                    <Icon size={16} />
                  </ActionIcon>
                </Tooltip>
              );
            })}
          </Box>
        </Group>

        <Group
          component="label"
          justify="space-between"
          wrap="nowrap"
          style={{ cursor: "pointer" }}
        >
          <Text size="sm" fw={500}>
            Always on top
          </Text>
          <Checkbox
            checked={alwaysOnTop}
            onChange={(event) => setAlwaysOnTop(event.currentTarget.checked)}
          />
        </Group>

        <Group
          component="label"
          justify="space-between"
          wrap="nowrap"
          style={{ cursor: "pointer" }}
        >
          <Text size="sm" fw={500}>
            Launch at startup
          </Text>
          <Checkbox
            checked={launchAtStartup}
            onChange={(event) => setLaunchAtStartup(event.currentTarget.checked)}
          />
        </Group>

        <Stack gap={4}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={500}>
              Daily review
            </Text>
            <Group gap={8} wrap="nowrap">
              <Button size="compact-xs" variant="default" onClick={() => emitOpenReview()}>
                Start now
              </Button>
              <Checkbox
                aria-label="Daily review banner"
                checked={dailyReview}
                onChange={(event) => setDailyReview(event.currentTarget.checked)}
              />
            </Group>
          </Group>
          <Text size="xs" c="dimmed">
            Shows a banner to catch up on overdue, due, and stale items.
          </Text>
        </Stack>

        <Stack gap={4}>
          <Group
            component="label"
            justify="space-between"
            wrap="nowrap"
            style={{ cursor: "pointer" }}
          >
            <Text size="sm" fw={500}>
              Hide from screen sharing
            </Text>
            <Checkbox
              checked={excludeFromCapture}
              onChange={(event) => setExcludeFromCapture(event.currentTarget.checked)}
            />
          </Group>
          <Text size="xs" c="dimmed">
            Excludes the window from screen recordings and sharing apps (Zoom,
            Teams, OBS…).
          </Text>
        </Stack>

        <Stack gap={4}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={500}>
              Attachments
            </Text>
            <SegmentedControl
              size="xs"
              value={mediaCompression}
              onChange={(value) => onMediaChange(value as MediaCompression)}
              data={[
                { label: "Lossless", value: "original" },
                { label: "Compressed", value: "compressed" },
              ]}
            />
          </Group>
          <Text size="xs" c="dimmed">
            Compressed re-encodes pasted/added images & videos to save space.
            Lossless keeps originals.
          </Text>

          {download?.active && (
            <Stack gap={2} mt={2}>
              <Progress value={download.pct ?? 100} size="sm" animated />
              <Text size="xs" c="dimmed">
                {download.label}
                {download.pct != null ? ` ${download.pct}%` : ""}
              </Text>
            </Stack>
          )}
          {download && !download.active && download.error && (
            <Text size="xs" c="red">
              {download.error}
            </Text>
          )}
          {download && !download.active && !download.error && (
            <Text size="xs" c="dimmed">
              {download.label}
            </Text>
          )}
        </Stack>

        <Stack gap={4}>
          <Group
            component="label"
            justify="space-between"
            wrap="nowrap"
            style={{ cursor: "pointer" }}
          >
            <Text size="sm" fw={500}>
              Click-through on hover
            </Text>
            <Checkbox
              checked={passthrough}
              onChange={(event) => setPassthrough(event.currentTarget.checked)}
            />
          </Group>
          <Text size="xs" c="dimmed">
            The window hides and passes clicks through while the cursor is over it.
            Hold ⌘ (Ctrl on Windows) to click it; once focused it stays put.
          </Text>
        </Stack>
      </Stack>

      {/* Right column: reference - quick-add syntax and keyboard shortcuts. */}
      <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Quick add
          </Text>
          <Text size="xs" c="dimmed">
            Type these into an item to set its labels, people, and dates inline. A
            date in a comment (due…, remind…) sets the item's reminder/due too,
            leaving the comment as written.
          </Text>
          <ScrollArea maxHeight={110}>
            <Stack gap={0} p={4}>
              {QUICK_ADD.map(({ ex, label }) => (
                <Group key={ex} justify="space-between" wrap="nowrap" gap="md" px={6} py={4}>
                  <Text
                    size="xs"
                    style={{
                      flexShrink: 0,
                      fontFamily: "var(--mantine-font-family-monospace)",
                      color: "var(--mantine-color-text)",
                    }}
                  >
                    {ex}
                  </Text>
                  <Text size="xs" c="dimmed" ta="right">
                    {label}
                  </Text>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        </Stack>

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Keyboard shortcuts
          </Text>
          <ScrollArea maxHeight={110}>
            <Stack gap={0} p={4}>
              {SHORTCUTS.map(({ keys, label }) => (
                <Group key={label} justify="space-between" wrap="nowrap" gap="md" px={6} py={4}>
                  <Group gap={3} wrap="nowrap" style={{ flexShrink: 0 }}>
                    {keys.map((k) => (
                      <Kbd key={k} size="xs">
                        {k}
                      </Kbd>
                    ))}
                  </Group>
                  <Text size="xs" c="dimmed" ta="right">
                    {label}
                  </Text>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        </Stack>
      </Stack>
    </Group>
  );
}

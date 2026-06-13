import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  Progress,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import { IconDeviceDesktop, IconMoon, IconSettings, IconSun } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRef, useState } from "react";

import { type MediaCompression, useSettings } from "../lib/settings";

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

export function Settings() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const alwaysOnTop = useSettings((state) => state.alwaysOnTop);
  const setAlwaysOnTop = useSettings((state) => state.setAlwaysOnTop);
  const passthrough = useSettings((state) => state.passthrough);
  const setPassthrough = useSettings((state) => state.setPassthrough);
  const launchAtStartup = useSettings((state) => state.launchAtStartup);
  const setLaunchAtStartup = useSettings((state) => state.setLaunchAtStartup);
  const mediaCompression = useSettings((state) => state.mediaCompression);
  const setMediaCompression = useSettings((state) => state.setMediaCompression);
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
        error: "ffmpeg download failed — it'll retry on first use.",
      });
    } finally {
      unlisten();
      downloadingRef.current = false;
    }
  };

  return (
    <Stack gap="md" w={300}>
      <Group gap={8} wrap="nowrap">
        <IconSettings size={18} stroke={1.8} />
        <Title order={5}>Settings</Title>
      </Group>

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
  );
}

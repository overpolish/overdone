import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  Progress,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconDeviceDesktop,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSun,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRef, useState } from "react";

import { pickColor, randomColor } from "../lib/assignee";
import { emitRosterAction } from "../lib/panel";
import { type MediaCompression, useSettings } from "../lib/settings";
import { type Assignee } from "../lib/todos";
import { AssigneeAvatar } from "./AssigneeAvatar";
import { IconButton } from "./IconButton";
import { ScrollArea } from "./ScrollArea";

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

/** Which settings category the pill nav is showing. */
type SettingsTab = "global" | "list";

const COLOR_SCHEMES: { value: ColorScheme; label: string; icon: typeof IconSun }[] = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "auto", label: "System", icon: IconDeviceDesktop },
];

export function Settings({ roster = [] }: { roster?: Assignee[] }) {
  const [tab, setTab] = useState<SettingsTab>("global");

  return (
    <Stack gap="md" w={300}>
      <Group justify="space-between" wrap="nowrap" align="center">
        <Group gap={8} wrap="nowrap">
          <IconSettings size={18} stroke={1.8} />
          <Title order={5}>Settings</Title>
        </Group>
        <SegmentedControl
          size="xs"
          value={tab}
          onChange={(value) => setTab(value as SettingsTab)}
          data={[
            { label: "Global", value: "global" },
            { label: "List", value: "list" },
          ]}
        />
      </Group>

      {tab === "list" ? <AssigneeSettings initial={roster} /> : <GlobalSettings />}
    </Stack>
  );
}

/** App-wide preferences: appearance, window behavior, and attachment handling. */
function GlobalSettings() {
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
    <Stack gap="md">
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

/**
 * Per-list assignee roster management. Rename, recolor, or remove people, or add
 * a new one. Holds a local copy (seeded from the list's roster) and edits
 * optimistically, emitting each change to the main window — the sole owner of
 * the list — which applies it to the store and autosaves.
 */
function AssigneeSettings({ initial }: { initial: Assignee[] }) {
  const [roster, setRoster] = useState<Assignee[]>(initial);
  const [name, setName] = useState("");

  const rename = (id: string, value: string) => {
    setRoster((r) => r.map((a) => (a.id === id ? { ...a, name: value } : a)));
    emitRosterAction({ type: "rename", id, name: value });
  };
  const recolor = (id: string, color: string) => {
    setRoster((r) => r.map((a) => (a.id === id ? { ...a, color } : a)));
    emitRosterAction({ type: "recolor", id, color });
  };
  const remove = (id: string) => {
    setRoster((r) => r.filter((a) => a.id !== id));
    emitRosterAction({ type: "remove", id });
  };
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Don't create a second person with the same name.
    if (roster.some((a) => a.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setName("");
      return;
    }
    const assignee: Assignee = { id: crypto.randomUUID(), name: trimmed, color: pickColor(trimmed) };
    setRoster((r) => [...r, assignee]);
    emitRosterAction({ type: "add", assignee });
    setName("");
  };

  // Show the roster alphabetically (keyed by id, so an inline rename keeps focus).
  const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500} px={4}>
        Assignees
      </Text>
      <Text size="xs" c="dimmed" px={4}>
        People you can assign to items in this list.
      </Text>

      {/* Add field stays pinned at the top, outside the scrolling list. Its
          trailing button matches the rows' delete button (same width + gap) so
          the right edges line up. The px matches the scroll's inner padding so
          everything shares one left/right edge. */}
      <Group gap={6} wrap="nowrap" mt={2} px={4}>
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          placeholder="Add a person…"
          leftSection={<IconUserPlus size={14} />}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <ActionIcon variant="default" size={22} aria-label="Add assignee" onClick={add}>
          <IconPlus size={14} />
        </ActionIcon>
      </Group>

      {sorted.length > 0 && (
        <ScrollArea maxHeight={220}>
          {/* Padding keeps the rows' focus rings and hover surfaces clear of the
              container's rounded (clipped) edges and corners. */}
          <Stack gap={4} px={4} py={8}>
            {sorted.map((a) => (
              <Group key={a.id} gap={6} wrap="nowrap">
                <Tooltip label="Change color" withArrow openDelay={400}>
                  <UnstyledButton
                    aria-label={`Change color for ${a.name}`}
                    onClick={() => recolor(a.id, randomColor())}
                    style={{ display: "flex", borderRadius: "50%" }}
                  >
                    <AssigneeAvatar assignee={a} size={24} withTooltip={false} />
                  </UnstyledButton>
                </Tooltip>
                <TextInput
                  size="xs"
                  style={{ flex: 1 }}
                  value={a.name}
                  onChange={(e) => rename(a.id, e.currentTarget.value)}
                />
                <IconButton
                  label={`Remove ${a.name}`}
                  icon={IconTrash}
                  danger
                  onClick={() => remove(a.id)}
                />
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
}

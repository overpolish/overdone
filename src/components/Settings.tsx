import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  Stack,
  Text,
  Title,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";

import { useSettings } from "../lib/settings";

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

  return (
    <Stack gap="md" w={300}>
      <Title order={5}>Settings</Title>

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
    </Stack>
  );
}

import {
  ActionIcon,
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
    <Stack gap="md">
      <Title order={5}>Settings</Title>

      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Appearance
        </Text>
        <ActionIcon.Group>
          {COLOR_SCHEMES.map(({ value, label, icon: Icon }) => {
            const active = colorScheme === value;
            return (
              <Tooltip key={value} label={label} withArrow>
                <ActionIcon
                  size="lg"
                  variant={active ? "filled" : "default"}
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => setColorScheme(value)}
                >
                  <Icon size={16} />
                </ActionIcon>
              </Tooltip>
            );
          })}
        </ActionIcon.Group>
      </Group>

      <Checkbox
        label="Always on top"
        checked={alwaysOnTop}
        onChange={(event) => setAlwaysOnTop(event.currentTarget.checked)}
      />
    </Stack>
  );
}

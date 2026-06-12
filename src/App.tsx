import {
  Button,
  Center,
  SegmentedControl,
  Stack,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconArrowRight,
  IconDeviceDesktop,
  IconMoon,
  IconSun,
} from "@tabler/icons-react";

function App() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <Stack align="center" justify="center" gap="lg" mih="100vh" p="xl">
      <Title order={1}>Overdone</Title>

      <SegmentedControl
        value={colorScheme}
        onChange={(value) =>
          setColorScheme(value as "light" | "dark" | "auto")
        }
        data={[
          {
            value: "light",
            label: (
              <Center style={{ gap: 8 }}>
                <IconSun size={16} />
                <span>Light</span>
              </Center>
            ),
          },
          {
            value: "dark",
            label: (
              <Center style={{ gap: 8 }}>
                <IconMoon size={16} />
                <span>Dark</span>
              </Center>
            ),
          },
          {
            value: "auto",
            label: (
              <Center style={{ gap: 8 }}>
                <IconDeviceDesktop size={16} />
                <span>System</span>
              </Center>
            ),
          },
        ]}
      />

      <Button rightSection={<IconArrowRight size={18} />}>Get started</Button>
    </Stack>
  );
}

export default App;

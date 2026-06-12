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

import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { Titlebar } from "./components/Titlebar";

/** Fire a desktop notification, requesting permission first if needed. */
async function pingNotification() {
  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
  if (!granted) return;

  // Background the app first: on macOS a foreground app suppresses notification
  // banners (they go to Control Center) and won't bounce, so we hide it.
  await invoke("background_app");
  setTimeout(() => {
    void invoke("flag_attention"); // red tray badge + dock bounce
    sendNotification({ title: "Overdone", body: "Dummy message" });
  }, 1000);
}

function App() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100vh" }}
    >
      <Titlebar />

      <div style={{ flex: 1, overflow: "auto" }}>
        <Stack align="center" justify="center" gap="lg" mih="100%" p="xl">
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

          <Button
            rightSection={<IconArrowRight size={18} />}
            onClick={() => void pingNotification()}
          >
            Get started
          </Button>
        </Stack>
      </div>
    </div>
  );
}

export default App;

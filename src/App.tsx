import { Button, Stack, Title } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useEffect } from "react";

import { Titlebar } from "./components/Titlebar";
import { useSettings } from "./lib/settings";

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
  // Apply the persisted always-on-top preference on startup.
  useEffect(() => {
    void invoke("set_always_on_top", {
      value: useSettings.getState().alwaysOnTop,
    });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Titlebar />

      <div style={{ flex: 1, overflow: "auto" }}>
        <Stack align="center" justify="center" gap="lg" mih="100%" p="xl">
          <Title order={1}>Overdone</Title>

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

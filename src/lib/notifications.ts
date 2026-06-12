import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/**
 * Fire a desktop notification, requesting permission first if needed.
 *
 * Extracted here so it can be reused once todos are wired up (e.g. notifying on
 * an overdue item). Currently unused by the UI; re-integrate by importing
 * `notify` where a reminder should fire.
 */
export async function notify(title: string, body: string) {
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
    sendNotification({ title, body });
  }, 1000);
}

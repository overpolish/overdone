/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/**
 * Fire a desktop notification, requesting permission first if needed. Also
 * flags the tray/dock for attention, but leaves the window as-is - the banner
 * shows whether or not the app is foreground.
 */
export async function notify(title: string, body: string) {
  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
  if (!granted) return;

  void invoke("flag_attention"); // red tray badge + dock bounce
  sendNotification({ title, body });
}

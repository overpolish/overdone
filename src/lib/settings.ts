/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import type { MantineColorScheme } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { disable, enable } from "@tauri-apps/plugin-autostart";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Attachment handling: keep originals, or re-encode to save space. */
export type MediaCompression = "original" | "compressed";

export interface SettingsState {
  colorScheme: MantineColorScheme;
  alwaysOnTop: boolean;
  /** Click-through: the window hides + passes clicks through on hover. */
  passthrough: boolean;
  /** Launch the app automatically on login (registered with the OS). */
  launchAtStartup: boolean;
  /**
   * Exclude the app's windows from screen capture / screen-sharing software
   * (e.g. Zoom, Teams, OBS). Defaults on so contents stay private when sharing.
   */
  excludeFromCapture: boolean;
  /** Whether pasted/imported attachments are compressed (via ffmpeg) or kept. */
  mediaCompression: MediaCompression;
  setColorScheme: (value: MantineColorScheme) => void;
  setAlwaysOnTop: (value: boolean) => void;
  setPassthrough: (value: boolean) => void;
  setLaunchAtStartup: (value: boolean) => void;
  setExcludeFromCapture: (value: boolean) => void;
  setMediaCompression: (value: MediaCompression) => void;
}

const STORAGE_NAME = "overdone-settings";
const CHANNEL_NAME = "overdone:settings";
// Mirror the scheme to Mantine's own key so `ColorSchemeScript` (which reads it
// before React renders) avoids a startup flash.
const MANTINE_SCHEME_KEY = "mantine-color-scheme-value";

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      colorScheme: "auto",
      alwaysOnTop: true,
      passthrough: false,
      launchAtStartup: false,
      excludeFromCapture: true,
      mediaCompression: "original",
      setColorScheme: (colorScheme) => set({ colorScheme }),
      setAlwaysOnTop: (alwaysOnTop) => {
        set({ alwaysOnTop });
        // Apply to the main window (handled in Rust). Only the window that
        // initiates the change calls this; remote windows just sync state.
        void invoke("set_always_on_top", { value: alwaysOnTop });
      },
      setPassthrough: (passthrough) => {
        set({ passthrough });
        void invoke("set_passthrough", { value: passthrough });
      },
      setLaunchAtStartup: (launchAtStartup) => {
        set({ launchAtStartup });
        // Register/unregister with the OS login items. Only the window that
        // initiates the change does this; remote windows just sync state.
        void (launchAtStartup ? enable() : disable()).catch(() => {
          // Registration can fail (e.g. unsupported environment); leave the
          // toggle reflecting the request rather than reverting silently.
        });
      },
      setExcludeFromCapture: (excludeFromCapture) => {
        set({ excludeFromCapture });
        // Apply to the app's windows (handled in Rust). Only the window that
        // initiates the change calls this; remote windows just sync state.
        void invoke("set_content_protected", { value: excludeFromCapture });
      },
      setMediaCompression: (mediaCompression) => set({ mediaCompression }),
    }),
    {
      name: STORAGE_NAME,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        colorScheme: state.colorScheme,
        alwaysOnTop: state.alwaysOnTop,
        passthrough: state.passthrough,
        launchAtStartup: state.launchAtStartup,
        excludeFromCapture: state.excludeFromCapture,
        mediaCompression: state.mediaCompression,
      }),
    },
  ),
);

function mirrorScheme(scheme: MantineColorScheme) {
  try {
    localStorage.setItem(MANTINE_SCHEME_KEY, scheme);
  } catch {
    // ignore
  }
}

mirrorScheme(useSettings.getState().colorScheme);

// Cross-window sync. The localStorage `storage` event is unreliable across
// separate Tauri webviews, so changes are broadcast explicitly. `applyingRemote`
// breaks the received -> set -> broadcast echo (Mantine's color-scheme manager
// re-enters `set` when it applies an update).
if (typeof BroadcastChannel !== "undefined") {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  let applyingRemote = false;

  useSettings.subscribe((state, prev) => {
    if (state.colorScheme !== prev.colorScheme) {
      mirrorScheme(state.colorScheme);
    }
    if (applyingRemote) {
      return;
    }
    channel.postMessage({
      colorScheme: state.colorScheme,
      alwaysOnTop: state.alwaysOnTop,
      passthrough: state.passthrough,
      launchAtStartup: state.launchAtStartup,
      excludeFromCapture: state.excludeFromCapture,
      mediaCompression: state.mediaCompression,
    });
  });

  channel.onmessage = (event) => {
    applyingRemote = true;
    try {
      useSettings.setState(event.data as Partial<SettingsState>);
    } finally {
      applyingRemote = false;
    }
  };
}

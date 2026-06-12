import type { MantineColorScheme } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface SettingsState {
  colorScheme: MantineColorScheme;
  alwaysOnTop: boolean;
  /** Click-through: the window hides + passes clicks through on hover. */
  passthrough: boolean;
  setColorScheme: (value: MantineColorScheme) => void;
  setAlwaysOnTop: (value: boolean) => void;
  setPassthrough: (value: boolean) => void;
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
    }),
    {
      name: STORAGE_NAME,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        colorScheme: state.colorScheme,
        alwaysOnTop: state.alwaysOnTop,
        passthrough: state.passthrough,
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

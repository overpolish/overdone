/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import { bindMainWindow } from "./main-sync";
import { useSettings } from "./settings";

export { useGlobalKeyboard } from "./keyboard";
export { useNotificationScheduler, useTrayAlert } from "./notifications-scheduler";
export { usePanelActionListeners } from "./panel-listeners";

/** Subscribe to a Tauri event for the component's lifetime. */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    const unlisten = listen<T>(event, (e) => handler(e.payload));
    return () => {
      void unlisten.then((off) => off());
    };
    // The handler is recreated each render but the listeners are register-once,
    // pure store dispatch - capturing the first is fine (matches the original).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * One-time main-window startup wiring: load the active list and start
 * autosaving, focus the window when clicked through in passthrough mode, and
 * push the persisted window preferences down to the backend.
 */
export function useMainWindowStartup() {
  // Load the active list and start autosaving (main window only).
  useEffect(() => {
    bindMainWindow();
  }, []);

  // In passthrough mode, clicking the (modifier-revealed) window should focus it
  // so it stays interactive. `acceptFirstMouse` delivers the click to the content
  // but doesn't activate the window, so focus it explicitly.
  useEffect(() => {
    const onPointerDown = () => {
      if (useSettings.getState().passthrough) void getCurrentWindow().setFocus();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  // Apply persisted window preferences on startup.
  useEffect(() => {
    const { alwaysOnTop, passthrough, excludeFromCapture } = useSettings.getState();
    void invoke("set_always_on_top", { value: alwaysOnTop });
    void invoke("set_passthrough", { value: passthrough });
    void invoke("set_content_protected", { value: excludeFromCapture });
    // The OS login-item registration is the source of truth for autostart;
    // reconcile the toggle to it (without re-invoking enable/disable).
    void isAutostartEnabled()
      .then((on) => useSettings.setState({ launchAtStartup: on }))
      .catch(() => {});
  }, []);
}

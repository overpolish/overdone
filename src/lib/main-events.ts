/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

import { bindMainWindow } from "./main-sync";
import { notify } from "./notifications";
import {
  type AssigneeAction,
  type DatesAction,
  type DetailsAction,
  type EditActionType,
  type RosterAction,
  type StatusAction,
} from "./panel";
import { useSettings } from "./settings";
import { isStruck } from "./todo";
import { type TodoData, useTodos } from "./todos";

/** Subscribe to a Tauri event for the component's lifetime. */
function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    const unlisten = listen<T>(event, (e) => handler(e.payload));
    return () => {
      void unlisten.then((off) => off());
    };
    // The handler is recreated each render but the listeners are register-once,
    // pure store dispatch — capturing the first is fine (matches the original).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Wire the floating panel windows (and Settings) back into the store. Each panel
 * runs in its own webview and can't reach the store directly, so it emits an
 * event the main window applies here.
 */
export function usePanelActionListeners() {
  // Apply status picks made in the floating panel back to the store.
  useTauriEvent<StatusAction>("status:action", ({ itemId, type, state }) => {
    const todos = useTodos.getState();
    if (type === "delete") todos.deleteItem(itemId);
    else if (state) todos.setItemState(itemId, state);
  });

  // Jump to an item picked from search: focus it and bring the window forward.
  useTauriEvent<string>("search:focus", (id) => {
    useTodos.getState().focusItem(id);
    void getCurrentWindow().setFocus();
  });

  // Apply comment-log changes made in the details panel back to the store.
  useTauriEvent<DetailsAction>("details:action", ({ itemId, comments }) => {
    useTodos.getState().setItemComments(itemId, comments);
  });

  // Apply assignee changes made in the details panel: register any newly created
  // roster members first, then set the item's assignee list.
  useTauriEvent<AssigneeAction>("assignee:action", ({ itemId, assigneeIds, newAssignees }) => {
    const todos = useTodos.getState();
    newAssignees?.forEach((a) => todos.addAssignee(a));
    todos.setItemAssignees(itemId, assigneeIds);
  });

  // Apply notification-time / due-date changes made in the details panel.
  useTauriEvent<DatesAction>("dates:action", ({ itemId, notifyAt, dueDate }) => {
    useTodos.getState().setItemDates(itemId, { notifyAt, dueDate });
  });

  // Clear the "item being edited" row highlight when the panel hides (blur,
  // Escape, status pick, etc.). Opening a panel sets it; this is the close side.
  useTauriEvent("panel:closed", () => {
    useTodos.getState().setEditingId(null);
  });

  // Undo/redo forwarded from a focused panel window (which can't reach the
  // store itself).
  useTauriEvent<EditActionType>("edit:action", (type) => {
    const todos = useTodos.getState();
    if (type === "redo") todos.redo();
    else todos.undo();
  });

  // Apply roster management changes made in Settings back to the store.
  useTauriEvent<RosterAction>("roster:action", (a) => {
    const todos = useTodos.getState();
    if (a.type === "add") todos.addAssignee(a.assignee);
    else if (a.type === "rename") todos.renameAssignee(a.id, a.name);
    else if (a.type === "recolor") todos.setAssigneeColor(a.id, a.color);
    else if (a.type === "remove") todos.removeAssignee(a.id);
  });
}

/**
 * Fire a desktop reminder when an item's notification time arrives. We re-arm a
 * timer per item whenever the item set changes; a past-due time fires at once.
 * Firing flags the item as "needs action" (markNotified clears notifyAt and sets
 * notifiedAt), so it's one-shot — it won't re-fire on the next change or a
 * restart, and stays amber + belled in the list until dismissed.
 */
export function useNotificationScheduler(items: TodoData[]) {
  useEffect(() => {
    // setTimeout overflows past the 32-bit ms range and would fire instantly;
    // skip far-future reminders here — they re-arm once the time is in range
    // (on the next item change or app restart).
    const MAX_DELAY = 2 ** 31 - 1;
    const fire = (item: TodoData) => {
      void notify("Item needs action", item.text);
      useTodos.getState().markNotified(item.id);
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const item of items) {
      // A resolved (done/cancelled) item never notifies; reopening re-arms it.
      if (item.notifyAt == null || isStruck(item.state)) continue;
      const delay = item.notifyAt - Date.now();
      if (delay <= 0) fire(item);
      else if (delay <= MAX_DELAY) timers.push(setTimeout(() => fire(item), delay));
    }
    return () => timers.forEach((t) => clearTimeout(t));
  }, [items]);
}

/**
 * Keep the red tray badge lit while any item has an unacknowledged notification,
 * and clear it once they're all dismissed. The badge tracks pending
 * notifications (not window focus), so it survives focusing the app and persists
 * across restarts (notifiedAt is saved). Only toggle on change to avoid
 * re-setting the tray icon on every keystroke.
 */
export function useTrayAlert(items: TodoData[]) {
  const trayAlertRef = useRef(false);
  useEffect(() => {
    const pending = items.some((i) => i.notifiedAt != null);
    if (pending === trayAlertRef.current) return;
    trayAlertRef.current = pending;
    void invoke("set_tray_alert", { on: pending });
  }, [items]);
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

/** Whether focus is currently in a text field (input/textarea/contenteditable). */
function isEditableFocused() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/**
 * Global keyboard handling. Shortcuts (Cmd/Ctrl+Z / Shift / Y) take priority;
 * otherwise, typing a printable character while no field is focused starts a new
 * item at the top, seeded with that character.
 */
export function useGlobalKeyboard() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod) {
        const key = e.key.toLowerCase();
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) useTodos.getState().redo();
          else useTodos.getState().undo();
        } else if (key === "y") {
          e.preventDefault();
          useTodos.getState().redo();
        }
        return;
      }

      // Escape drops focus out of the current field, so you can esc then type
      // to start a fresh item.
      if (e.key === "Escape") {
        if (isEditableFocused()) (document.activeElement as HTMLElement).blur();
        return;
      }

      // Type-to-create. Skip when a field is already being edited, when Alt is
      // held (Option produces special glyphs), and for non-printable keys
      // (Enter, arrows… all report multi-character `key` names).
      if (e.altKey || e.key.length !== 1) return;
      if (isEditableFocused()) return;
      e.preventDefault();
      useTodos.getState().addItem(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

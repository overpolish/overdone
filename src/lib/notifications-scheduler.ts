/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";

import { notify } from "./notifications";
import { isStruck } from "./todo";
import { type TodoData, useTodos } from "./todos";

/**
 * Fire a desktop reminder when an item's notification time arrives. We re-arm a
 * timer per item whenever the item set changes; a past-due time fires at once.
 * Firing flags the item as "needs action" (markNotified clears notifyAt and sets
 * notifiedAt), so it's one-shot - it won't re-fire on the next change or a
 * restart, and stays amber + belled in the list until dismissed.
 */
export function useNotificationScheduler(items: TodoData[]) {
  useEffect(() => {
    // setTimeout overflows past the 32-bit ms range and would fire instantly;
    // skip far-future reminders here - they re-arm once the time is in range
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

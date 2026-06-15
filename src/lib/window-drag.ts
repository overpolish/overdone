/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Start the title-bar window drag, but suppress the one click that snaps the
 * window. Tauri's built-in `data-tauri-drag-region` begins a native window drag
 * on *every* mousedown on the bar - including the click that brings a
 * background window to the front while the floating panel holds focus. On macOS
 * that activating click starts `performWindowDragWithEvent:` against a stale
 * event, so the window snaps sideways. (This is the bug the always-on-top and
 * window-level juggling kept circling.)
 *
 * The rule: only refuse the drag on the click that reactivates the window *out
 * of a panel*. We track whether a secondary panel is/was the thing holding
 * focus (`panelEngaged`); the first click that returns focus to the main window
 * while that's set just activates it (and dismisses the panel) without
 * dragging. A plain background window - unfocused with no panel in play, e.g.
 * after clicking another app - drags on the first click as before.
 */

// Tracked synchronously so the mousedown handler can decide without an await.
// Focus changes arrive over async IPC, so at the moment of the activating
// mousedown this still reads the pre-click value (false) - exactly what gates
// the drag off. Seeded from the live state for the first press after launch.
let focused = true;

// True from when a secondary panel opens until the main window next regains
// focus. The snap only happens on the click that reactivates the main window
// while a panel held focus, so gating on this keeps that fix while letting an
// ordinary background window drag on the first click.
let panelEngaged = false;

void getCurrentWindow()
  .isFocused()
  .then((f) => {
    focused = f;
  })
  .catch(() => {});

void getCurrentWindow()
  .onFocusChanged(({ payload }) => {
    focused = payload;
    // Regaining focus ends the panel episode: the activating click is done, so
    // subsequent presses drag normally until a panel opens again.
    if (payload) panelEngaged = false;
  })
  .catch(() => {});

void listen("panel:open", () => {
  panelEngaged = true;
}).catch(() => {});

/** Begin dragging the window from the title bar, unless the press is activating
 * it. Call from the bar's `onMouseDown`. */
export function startTitlebarDrag(e: { button: number; target: EventTarget | null }) {
  // Primary button only, and never from the controls (buttons, logo) so their
  // own clicks still work - the rest of the bar (including the gaps around the
  // button groups) drags.
  if (e.button !== 0) return;
  const el = e.target instanceof Element ? e.target : null;
  if (el?.closest("button, a, input, [role='button']")) return;
  // Refuse only the click that reactivates the window out of a panel; an
  // ordinary unfocused window (no panel in play) still drags on the first press.
  if (!focused && panelEngaged) return;
  void getCurrentWindow().startDragging();
}

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Start the title-bar window drag, but only on a click that isn't activating the
 * window. Tauri's built-in `data-tauri-drag-region` begins a native window drag
 * on *every* mousedown on the bar - including the click that merely brings a
 * background window to the front (e.g. while the floating panel holds focus).
 * On macOS that activating click starts `performWindowDragWithEvent:` against a
 * stale event, so the window snaps sideways. (This is the bug the always-on-top
 * and window-level juggling kept circling.)
 *
 * The rule: don't drag the click that focuses the window. We start the native
 * drag only when the window is *already* focused; the first click on an
 * unfocused window just activates it (and dismisses the panel) without dragging.
 * A second press then drags normally - standard "click to focus, then drag".
 */

// Tracked synchronously so the mousedown handler can decide without an await.
// Focus changes arrive over async IPC, so at the moment of the activating
// mousedown this still reads the pre-click value (false) - exactly what gates
// the drag off. Seeded from the live state for the first press after launch.
let focused = true;

void getCurrentWindow()
  .isFocused()
  .then((f) => {
    focused = f;
  })
  .catch(() => {});

void getCurrentWindow()
  .onFocusChanged(({ payload }) => {
    focused = payload;
  })
  .catch(() => {});

/** Begin dragging the window from the title bar, unless the press is activating
 * it. Call from the bar's `onMouseDown`. */
export function startTitlebarDrag(e: { button: number; target: EventTarget | null }) {
  // Primary button only, and never from the controls (buttons, logo) so their
  // own clicks still work - the rest of the bar (including the gaps around the
  // button groups) drags.
  if (e.button !== 0) return;
  const el = e.target instanceof Element ? e.target : null;
  if (el?.closest("button, a, input, [role='button']")) return;
  if (!focused) return;
  void getCurrentWindow().startDragging();
}

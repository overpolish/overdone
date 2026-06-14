/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

//! Click-through ("passthrough") behavior for the main window: while enabled the
//! window hides and passes clicks through when the cursor is over it (unless it's
//! focused or the modifier is held). A click-through window receives no
//! cursor/modifier events, so the inputs are polled on the main thread.

use std::sync::atomic::Ordering;

use tauri::Manager;

use crate::platform::{passthrough_inputs, set_window_alpha};
use crate::window_state::WindowState;

/// Window opacity while hidden by passthrough (0 = fully invisible).
const PASSTHROUGH_HIDDEN_ALPHA: f64 = 0.0;

/// Recompute and apply passthrough for the main window. Active = setting on, the
/// window isn't focused, the modifier isn't held, and the cursor is over it.
pub fn apply_passthrough(app: &tauri::AppHandle) {
    let state = app.state::<WindowState>();
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let active = state.passthrough.load(Ordering::Relaxed)
        && !state.focused.load(Ordering::Relaxed)
        // The secondary panel being open counts as interacting with the app, so
        // don't hide the main window out from under it.
        && !state.panel_open.load(Ordering::Relaxed)
        && passthrough_inputs(&window).map_or(false, |(over, modifier)| over && !modifier);

    // Only touch the window when the state actually flips.
    if state.passthrough_active.swap(active, Ordering::Relaxed) != active {
        let _ = window.set_ignore_cursor_events(active);
        set_window_alpha(&window, if active { PASSTHROUGH_HIDDEN_ALPHA } else { 1.0 });
    }
}

/// Poll passthrough inputs while the setting is on. A click-through window
/// doesn't receive cursor/modifier events, so we sample them on the main thread.
fn start_passthrough_poll(app: tauri::AppHandle) {
    if app
        .state::<WindowState>()
        .passthrough_polling
        .swap(true, Ordering::Relaxed)
    {
        return; // already running
    }
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(40));
        let state = app.state::<WindowState>();
        if !state.passthrough.load(Ordering::Relaxed) {
            state.passthrough_polling.store(false, Ordering::Relaxed);
            break;
        }
        let app2 = app.clone();
        let _ = app.run_on_main_thread(move || apply_passthrough(&app2));
    });
}

/// Enable/disable click-through passthrough for the main window.
#[tauri::command]
pub fn set_passthrough(app: tauri::AppHandle, value: bool, state: tauri::State<WindowState>) {
    state.passthrough.store(value, Ordering::Relaxed);
    if value {
        start_passthrough_poll(app.clone());
    } else if let Some(window) = app.get_webview_window("main") {
        // Restore the window fully when turning the setting off.
        state.passthrough_active.store(false, Ordering::Relaxed);
        let _ = window.set_ignore_cursor_events(false);
        set_window_alpha(&window, 1.0);
    }
    apply_passthrough(&app);
}

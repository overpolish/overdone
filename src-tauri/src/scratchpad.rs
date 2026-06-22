/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

//! The dedicated "scratchpad" window: a persistent, freely-resizable notes pad.
//! Unlike the popover `panel`, it does not auto-dismiss on blur and lives in its
//! own window, so it stays visible while the panel (comments, settings, lists) is
//! also open. Its size and position are remembered by `tauri_plugin_window_state`.

use tauri::{Emitter, Manager};

/// Show the scratchpad window (or reveal it if already created), float it above
/// the main window, and focus it. Emits `scratchpad:shown` so the webview can
/// move the caret to the end of the notes, matching the panel's reopen behavior.
#[tauri::command]
pub fn show_scratchpad(app: tauri::AppHandle) {
    let (Some(main), Some(win)) = (
        app.get_webview_window("main"),
        app.get_webview_window("scratchpad"),
    ) else {
        return;
    };
    let _ = win.show();
    let _ = win.set_focus();
    crate::platform::raise_panel_above(&win, &main);
    let _ = app.emit("scratchpad:shown", ());
}

/// Hide the scratchpad window (its close button). It keeps its contents and size;
/// reopening just shows it again.
#[tauri::command]
pub fn hide_scratchpad(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("scratchpad") {
        let _ = win.hide();
    }
}

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

//! Miscellaneous window/app commands driven from the UI: attention/tray badge,
//! backgrounding, hide-to-tray, and the always-on-top / screen-capture toggles.

use std::sync::atomic::Ordering;

use tauri::Manager;

use crate::tray;
use crate::window_state::WindowState;

/// Grab the user's attention: show the red tray badge and bounce the dock icon
/// (macOS) / flash the taskbar (Windows). The badge persists until every
/// notification is dismissed (see `set_tray_alert`); the dock bounce is cleared
/// by the OS on focus.
#[tauri::command]
pub fn flag_attention(app: tauri::AppHandle) {
    tray::set_alert(&app, true);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
    }
}

/// Set the red tray badge on/off. Driven by the count of unacknowledged
/// notifications, so the badge stays lit until the user dismisses them all.
#[tauri::command]
pub fn set_tray_alert(app: tauri::AppHandle, on: bool) {
    tray::set_alert(&app, on);
}

/// Send the app to the background so a following notification shows as a banner
/// (not just Control Center) and the dock icon can bounce. On macOS minimizing
/// a window leaves the app frontmost, so we hide the whole app instead.
#[tauri::command]
pub fn background_app(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.hide();

    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.minimize();
    }
}

/// Hide the app to the tray: hide the main window (and the panel with it) so the
/// app keeps running in the background, reachable from the tray icon. Backs the
/// custom title bar's close *and* minimize buttons - neither quits the app and
/// neither leaves a minimized window in the dock (quit is via the tray menu).
#[tauri::command]
pub fn hide_to_tray(app: tauri::AppHandle, state: tauri::State<WindowState>) {
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.hide();
    }
    // The scratchpad is a sibling floating window; hide it with the app so it
    // doesn't linger on screen with no main window behind it.
    if let Some(pad) = app.get_webview_window("scratchpad") {
        let _ = pad.hide();
    }
    state.panel_open.store(false, Ordering::Relaxed);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
}

/// Apply the always-on-top preference to the main window. Called from any
/// window (the setting lives in the panel) so it goes through the app handle.
#[tauri::command]
pub fn set_always_on_top(app: tauri::AppHandle, value: bool, state: tauri::State<WindowState>) {
    state.always_on_top.store(value, Ordering::Relaxed);
    // On macOS we own the window level natively (see `set_float_across_spaces`):
    // it sets a menu-bar-class level + all-Spaces collection behavior so the
    // window renders above other apps' full-screen windows. We deliberately do
    // NOT also call Tauri's `set_always_on_top` there - tao applies that a runloop
    // late at the *floating* level, which would clobber our higher level back down
    // and sink the window behind full-screen apps again. On Windows there's no
    // such native path, so Tauri's always-on-top is the mechanism (a topmost
    // window already floats over borderless full-screen apps).
    for label in ["main", "panel", "scratchpad"] {
        if let Some(window) = app.get_webview_window(label) {
            crate::platform::set_float_across_spaces(&window, value);
            #[cfg(not(target_os = "macos"))]
            let _ = window.set_always_on_top(value);
        }
    }
    // Re-raise the open panel above the main window: changing the main window's
    // level could otherwise leave the panel (seated one level above the main
    // window's *previous* level) behind it. The setting lives in the panel, so it
    // can be toggled while the panel is showing.
    if state.panel_open.load(Ordering::Relaxed) {
        if let (Some(main), Some(panel)) =
            (app.get_webview_window("main"), app.get_webview_window("panel"))
        {
            crate::platform::raise_panel_above(&panel, &main);
        }
    }
}

/// Apply the screen-capture exclusion preference to every app window. Called
/// from any window (the setting lives in the panel) so it goes through the app
/// handle. On macOS this sets the windows' sharing type to "none"; on Windows it
/// sets the display affinity to exclude-from-capture.
#[tauri::command]
pub fn set_content_protected(app: tauri::AppHandle, value: bool, state: tauri::State<WindowState>) {
    state.content_protected.store(value, Ordering::Relaxed);
    for label in ["main", "panel", "scratchpad"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.set_content_protected(value);
        }
    }
}

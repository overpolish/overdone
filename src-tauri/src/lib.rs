mod tray;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::Manager;

/// Shared window state.
struct WindowState {
    /// The user's always-on-top preference for the main window.
    always_on_top: AtomicBool,
    /// Whether the secondary panel is open. While it is, the main window's
    /// always-on-top is suspended so the two floating windows don't fight.
    panel_open: AtomicBool,
}

/// Hide the macOS traffic-light buttons (close/minimize/zoom) on a window that
/// uses the transparent title bar style, leaving a borderless surface that still
/// keeps the native rounded corners and shadow.
#[cfg(target_os = "macos")]
fn hide_traffic_lights(window: &tauri::WebviewWindow) {
    use objc2_app_kit::{NSWindow, NSWindowButton};

    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };
    let ns_window = unsafe { &*(ns_window_ptr as *const NSWindow) };

    for button in [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ] {
        if let Some(view) = ns_window.standardWindowButton(button) {
            view.setHidden(true);
        }
    }
}

/// Grab the user's attention: show the red tray badge and bounce the dock icon
/// (macOS) / flash the taskbar (Windows). Cleared automatically on focus.
#[tauri::command]
fn flag_attention(app: tauri::AppHandle) {
    tray::set_alert(&app, true);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
    }
}

/// Send the app to the background so a following notification shows as a banner
/// (not just Control Center) and the dock icon can bounce. On macOS minimizing
/// a window leaves the app frontmost, so we hide the whole app instead.
#[tauri::command]
fn background_app(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.hide();

    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.minimize();
    }
}

/// Show the secondary panel: position it under the main window's title bar,
/// then show and focus it. It hides itself again when it loses focus (see the
/// blur handler in `run`).
#[tauri::command]
fn show_panel(app: tauri::AppHandle, state: tauri::State<WindowState>) {
    let (Some(main), Some(panel)) = (
        app.get_webview_window("main"),
        app.get_webview_window("panel"),
    ) else {
        return;
    };

    if let (Ok(pos), Ok(main_size), Ok(panel_size)) =
        (main.outer_position(), main.inner_size(), panel.outer_size())
    {
        let x = pos.x + (main_size.width as i32 - panel_size.width as i32) / 2;
        // Below the title bar with a gap so the logo stays fully visible.
        let y = pos.y + 64;
        let _ = panel.set_position(tauri::PhysicalPosition::new(x, y));
    }

    // Suspend the main window's always-on-top while the panel is open so the
    // two always-on-top windows don't fight over z-order / focus.
    state.panel_open.store(true, Ordering::Relaxed);
    let _ = main.set_always_on_top(false);

    let _ = panel.show();
    let _ = panel.set_focus();
}

/// Apply the always-on-top preference to the main window. Called from any
/// window (the setting lives in the panel) so it goes through the app handle.
#[tauri::command]
fn set_always_on_top(app: tauri::AppHandle, value: bool, state: tauri::State<WindowState>) {
    state.always_on_top.store(value, Ordering::Relaxed);
    // Don't re-enable always-on-top while the panel is open; the preference is
    // re-applied when the panel closes.
    if !state.panel_open.load(Ordering::Relaxed) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_always_on_top(value);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WindowState {
            always_on_top: AtomicBool::new(true),
            panel_open: AtomicBool::new(false),
        })
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            flag_attention,
            background_app,
            show_panel,
            set_always_on_top
        ])
        .setup(|app| {
            tray::create(app.handle())?;

            if let Some(window) = app.get_webview_window("main") {
                // Windows has no native overlay title bar style, so drop the
                // native frame and let the custom React title bar take over.
                // (macOS keeps its decorations + native traffic lights via the
                // `titleBarStyle: "Overlay"` config.)
                #[cfg(target_os = "windows")]
                let _ = window.set_decorations(false);

                // Window starts hidden in the config to avoid a flash of the
                // native frame; reveal it once it's configured.
                let _ = window.show();

                // Clear the tray badge on focus; hide to the tray instead of
                // quitting when the window is closed (reopened via tray/dock).
                let handle = app.handle().clone();
                let win = window.clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::Focused(true) => tray::set_alert(&handle, false),
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = win.hide();
                        // Hide the secondary panel alongside the main window so it
                        // doesn't linger on screen with no main window behind it.
                        if let Some(panel) = handle.get_webview_window("panel") {
                            let _ = panel.hide();
                            handle
                                .state::<WindowState>()
                                .panel_open
                                .store(false, Ordering::Relaxed);
                        }
                    }
                    _ => {}
                });
            }

            // Auto-dismiss the secondary panel when it loses focus, and restore
            // the main window's always-on-top preference.
            if let Some(panel) = app.get_webview_window("panel") {
                // The panel uses the transparent title bar style so it keeps the
                // native rounded corners and shadow, but it's a floating popover
                // that hides on blur - so hide the traffic-light buttons to leave
                // a clean, chrome-free surface.
                #[cfg(target_os = "macos")]
                hide_traffic_lights(&panel);

                let app_handle = app.handle().clone();
                let panel_window = panel.clone();
                panel.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = panel_window.hide();

                        let state = app_handle.state::<WindowState>();
                        state.panel_open.store(false, Ordering::Relaxed);
                        if let Some(main) = app_handle.get_webview_window("main") {
                            let on_top = state.always_on_top.load(Ordering::Relaxed);
                            let _ = main.set_always_on_top(on_top);
                        }
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // Reopen the main window when the dock icon is clicked (macOS).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                if let Some(window) = _app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        });
}

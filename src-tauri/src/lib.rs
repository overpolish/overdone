/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

mod attachments;
mod commands;
mod panel;
mod passthrough;
mod platform;
mod storage;
mod transcode;
mod tray;
mod window_state;

use std::sync::atomic::Ordering;

use tauri::Manager;

use crate::panel::hide_panel;
use crate::passthrough::apply_passthrough;
use crate::window_state::WindowState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .manage(WindowState::default())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Remember the main window's size and position across launches (restored
        // before it's shown, so there's no flash). The panel is excluded - it's
        // sized and positioned dynamically.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION,
                )
                .with_denylist(&["panel"])
                .build(),
        );

    // Launch-at-startup support. Desktop-only (the plugin has no mobile impl),
    // and the actual enable/disable is driven from the settings UI via the
    // plugin's JS API.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
    }

    builder
        .invoke_handler(tauri::generate_handler![
            commands::flag_attention,
            commands::set_tray_alert,
            commands::background_app,
            panel::open_panel,
            panel::resize_panel,
            panel::set_panel_expanded,
            panel::close_panel,
            panel::set_panel_pinned,
            commands::set_always_on_top,
            passthrough::set_passthrough,
            commands::set_content_protected,
            commands::hide_to_tray,
            storage::list_lists,
            storage::read_list,
            storage::read_text_file,
            storage::write_list,
            storage::delete_list,
            storage::list_trash,
            storage::restore_list,
            storage::purge_list,
            storage::export_list_to_dir,
            attachments::import_attachment,
            attachments::write_attachment,
            transcode::compress_path,
            transcode::compress_bytes,
            attachments::delete_attachments,
            attachments::prune_media,
            attachments::read_file,
            transcode::ffmpeg_installed,
            transcode::download_ffmpeg
        ])
        .setup(|app| {
            // Upgrade any old flat list layout to the folder-per-list layout, and
            // sweep trashed lists past their 30-day retention. Best-effort: a
            // failure here shouldn't block startup.
            let _ = storage::migrate_layout(app.handle());
            let _ = storage::prune_trash(app.handle());

            // Tray-only app on macOS: no dock icon and no Cmd+Tab entry, so the
            // tray icon is the sole entry point (show/hide via click, quit via
            // its menu). Set before any window shows to avoid a dock flash.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::create(app.handle())?;

            if let Some(window) = app.get_webview_window("main") {
                // Windows has no native overlay title bar style, so drop the
                // native frame and let the custom React title bar take over.
                // (macOS keeps its decorations + native traffic lights via the
                // `titleBarStyle: "Overlay"` config.)
                #[cfg(target_os = "windows")]
                let _ = window.set_decorations(false);

                // Hide the native traffic lights so the custom React title bar
                // owns the window controls on macOS too (matching the panel and
                // Windows). The `titleBarStyle: "Overlay"` config keeps the
                // native rounded corners + shadow.
                #[cfg(target_os = "macos")]
                platform::hide_traffic_lights(&window);

                // Exclude from screen capture by default (the setting defaults
                // on). Applied before the window shows so it's never captured in
                // the gap before the webview loads and reconciles the persisted
                // value; the JS startup sync turns it back off if the user opted
                // out.
                let _ = window.set_content_protected(true);

                // Window starts hidden in the config to avoid a flash of the
                // native frame; reveal it once it's configured.
                let _ = window.show();

                // Hide to the tray instead of quitting when the window is closed
                // (reopened via tray/dock). The tray badge is NOT cleared on
                // focus - it tracks unacknowledged notifications (set_tray_alert)
                // and stays lit until they're all dismissed.
                let handle = app.handle().clone();
                let win = window.clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::Focused(focused) => {
                        handle
                            .state::<WindowState>()
                            .focused
                            .store(*focused, Ordering::Relaxed);
                        // Focus makes the window interactive even in passthrough.
                        apply_passthrough(&handle);
                        if *focused
                            && !handle
                                .state::<WindowState>()
                                .panel_pinned
                                .load(Ordering::Relaxed)
                        {
                            // Clicking the main window dismisses the popover panel
                            // - unless it's pinned, which keeps it up so clicking
                            // another item just swaps its content in place.
                            hide_panel(&handle);
                        }
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = win.hide();
                        // Hide the secondary panel alongside the main window so it
                        // doesn't linger on screen with no main window behind it.
                        hide_panel(&handle);
                    }
                    _ => {}
                });
            }

            // Auto-dismiss the secondary panel when it loses focus, and restore
            // the main window's always-on-top preference.
            if let Some(panel) = app.get_webview_window("panel") {
                // Windows has no native overlay title bar style, so drop the
                // native frame here too (matching the main window) and let the
                // custom React title bar take over - otherwise the panel shows a
                // native title bar the main window doesn't have.
                #[cfg(target_os = "windows")]
                let _ = panel.set_decorations(false);

                // The panel uses the transparent title bar style so it keeps the
                // native rounded corners and shadow, but it's a floating popover
                // that hides on blur - so hide the traffic-light buttons to leave
                // a clean, chrome-free surface.
                #[cfg(target_os = "macos")]
                platform::hide_traffic_lights(&panel);

                // Match the main window's default screen-capture exclusion so the
                // popover's contents aren't captured either.
                let _ = panel.set_content_protected(true);

                let app_handle = app.handle().clone();
                panel.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        // A pinned panel stays put when focus leaves to another
                        // app, so you can copy something into a comment without it
                        // vanishing. Clicking the main window still dismisses it
                        // (the main window's focus handler clears the pin too).
                        if app_handle
                            .state::<WindowState>()
                            .panel_pinned
                            .load(Ordering::Relaxed)
                        {
                            return;
                        }
                        // On macOS, ignore focus moving to a same-app system panel
                        // (the emoji & symbols viewer keeps the app active) so it
                        // doesn't dismiss us mid-edit. Switching apps deactivates
                        // the app and still dismisses; clicking the main window is
                        // handled by the main window's focus handler.
                        #[cfg(target_os = "macos")]
                        if platform::app_is_active() {
                            return;
                        }
                        hide_panel(&app_handle);
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

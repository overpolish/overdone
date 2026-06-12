mod tray;

use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![flag_attention, background_app])
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

                // Clear the tray alert badge once the user focuses the window.
                let handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(true) = event {
                        tray::set_alert(&handle, false);
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

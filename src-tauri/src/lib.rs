mod tray;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{LogicalPosition, LogicalSize, Manager, PhysicalPosition};

/// Shared window state.
struct WindowState {
    /// The user's always-on-top preference for the main window.
    always_on_top: AtomicBool,
    /// Whether the secondary panel is open. While it is, the main window's
    /// always-on-top is suspended so the two floating windows don't fight.
    panel_open: AtomicBool,
    /// Whether the panel was opened at a fixed anchor (the status picker, pinned
    /// below an item) rather than centered under the main title bar. Centered
    /// panels re-center when their content resizes; anchored ones stay put.
    panel_anchored: AtomicBool,
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

/// Metadata for one stored list: its file id (uuid stem) and display title
/// (the first `# ` heading in the markdown, or "Untitled" when absent/empty).
#[derive(serde::Serialize)]
struct ListMeta {
    id: String,
    title: String,
}

/// Directory holding the per-list markdown files (`<app data>/lists`).
fn lists_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("lists");
    Ok(dir)
}

/// Resolve the on-disk path for a list id, rejecting anything that isn't a bare
/// filename (no path separators / traversal) so a crafted id can't escape the
/// lists directory.
fn list_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err(format!("invalid list id: {id}"));
    }
    Ok(lists_dir(app)?.join(format!("{id}.md")))
}

/// Extract the display title from markdown: the first `# ` heading, trimmed.
/// Empty when there's no heading (the frontend shows an "Untitled" placeholder).
fn title_from_markdown(content: &str) -> String {
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("# ") {
            return rest.trim().to_string();
        }
    }
    String::new()
}

/// List all stored lists (id + title), sorted case-insensitively by title.
#[tauri::command]
fn list_lists(app: tauri::AppHandle) -> Result<Vec<ListMeta>, String> {
    let dir = lists_dir(&app)?;
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        // No directory yet means no lists.
        Err(_) => return Ok(Vec::new()),
    };

    let mut lists = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        lists.push(ListMeta {
            id: id.to_string(),
            title: title_from_markdown(&content),
        });
    }

    lists.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(lists)
}

/// Read a list's raw markdown.
#[tauri::command]
fn read_list(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let path = list_path(&app, &id)?;
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Write a list's markdown, creating the lists directory as needed. Written to a
/// temp file then renamed so a save can't leave a half-written file behind.
#[tauri::command]
fn write_list(app: tauri::AppHandle, id: String, content: String) -> Result<(), String> {
    let path = list_path(&app, &id)?;
    let dir = lists_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!(".{id}.md.tmp"));
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Copy a list's markdown to a destination path chosen by the user (the export
/// save dialog). Unlike the app-data files, `dest` is an arbitrary location.
#[tauri::command]
fn export_list(app: tauri::AppHandle, id: String, dest: String) -> Result<(), String> {
    let content = read_list(app, id)?;
    std::fs::write(&dest, content).map_err(|e| e.to_string())
}

/// Delete a list's file (ignored if it's already gone).
#[tauri::command]
fn delete_list(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = list_path(&app, &id)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Hide the secondary panel and restore the main window's always-on-top
/// preference (suspended while the panel is open).
fn hide_panel(app: &tauri::AppHandle) {
    let state = app.state::<WindowState>();
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.hide();
    }
    state.panel_open.store(false, Ordering::Relaxed);
    if let Some(main) = app.get_webview_window("main") {
        let on_top = state.always_on_top.load(Ordering::Relaxed);
        let _ = main.set_always_on_top(on_top);
    }
}

/// Whether our app is still the active (frontmost) application. Used to tell a
/// real focus loss (switching apps) from focus moving to a same-app system
/// input panel — the emoji & symbols viewer keeps the app active, so it must not
/// dismiss the popover panel. Clicking the main window is handled separately by
/// the main window's focus handler.
#[cfg(target_os = "macos")]
fn app_is_active() -> bool {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplication;

    let Some(mtm) = MainThreadMarker::new() else {
        return false;
    };
    NSApplication::sharedApplication(mtm).isActive()
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

/// Hide the app to the tray: hide the main window (and the panel with it) so the
/// app keeps running in the background, reachable from the tray icon. Backs the
/// custom title bar's close *and* minimize buttons — neither quits the app and
/// neither leaves a minimized window in the dock (quit is via the tray menu).
#[tauri::command]
fn hide_to_tray(app: tauri::AppHandle, state: tauri::State<WindowState>) {
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.hide();
    }
    state.panel_open.store(false, Ordering::Relaxed);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
}

/// Center the panel horizontally under the main window's title bar, given the
/// panel's logical width. Uses the main window's scale factor to convert to the
/// physical pixels the positioning API expects (avoids reading `outer_size`,
/// which can lag a just-applied `set_size`). Returns the chosen y so a later
/// resize can keep the same vertical position.
fn center_panel_under_main(
    main: &tauri::WebviewWindow,
    panel: &tauri::WebviewWindow,
    width: f64,
    keep_y: Option<i32>,
) {
    let (Ok(pos), Ok(main_size), Ok(scale)) =
        (main.outer_position(), main.inner_size(), main.scale_factor())
    else {
        return;
    };
    let panel_w_phys = (width * scale) as i32;
    let x = pos.x + (main_size.width as i32 - panel_w_phys) / 2;
    // Below the title bar with a gap so the logo stays fully visible.
    let y = keep_y.unwrap_or(pos.y + 64);
    let _ = panel.set_position(PhysicalPosition::new(x, y));
}

/// Show the secondary panel at the given content size (logical px). With an
/// anchor it's pinned there (top-left), used by the status picker to sit just
/// below an item; without one it's centered under the main title bar. The panel
/// webview measures its own content and calls this, so each view (settings,
/// lists, status) gets a window sized to fit. It hides again on blur (see the
/// blur handler in `run`).
#[tauri::command]
fn open_panel(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
    anchor_x: Option<f64>,
    anchor_y: Option<f64>,
    state: tauri::State<WindowState>,
) {
    let (Some(main), Some(panel)) = (
        app.get_webview_window("main"),
        app.get_webview_window("panel"),
    ) else {
        return;
    };

    let _ = panel.set_size(LogicalSize::new(width, height));

    match (anchor_x, anchor_y) {
        (Some(x), Some(y)) => {
            let _ = panel.set_position(LogicalPosition::new(x, y));
            state.panel_anchored.store(true, Ordering::Relaxed);
        }
        _ => {
            center_panel_under_main(&main, &panel, width, None);
            state.panel_anchored.store(false, Ordering::Relaxed);
        }
    }

    // Suspend the main window's always-on-top while the panel is open so the
    // two always-on-top windows don't fight over z-order / focus.
    state.panel_open.store(true, Ordering::Relaxed);
    let _ = main.set_always_on_top(false);

    let _ = panel.show();
    let _ = panel.set_focus();
}

/// Resize the open panel to fit content that changed while it was visible. A
/// centered panel re-centers (keeping its vertical position); an anchored one
/// keeps its top-left and just grows.
#[tauri::command]
fn resize_panel(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
    state: tauri::State<WindowState>,
) {
    let Some(panel) = app.get_webview_window("panel") else {
        return;
    };
    let _ = panel.set_size(LogicalSize::new(width, height));

    if !state.panel_anchored.load(Ordering::Relaxed) {
        if let Some(main) = app.get_webview_window("main") {
            let keep_y = panel.outer_position().ok().map(|p| p.y);
            center_panel_under_main(&main, &panel, width, keep_y);
        }
    }
}

/// Hide the panel (e.g. after picking a status). Mirrors the blur-dismiss path.
#[tauri::command]
fn close_panel(app: tauri::AppHandle) {
    hide_panel(&app);
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
            panel_anchored: AtomicBool::new(false),
        })
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            flag_attention,
            background_app,
            open_panel,
            resize_panel,
            close_panel,
            set_always_on_top,
            hide_to_tray,
            list_lists,
            read_list,
            write_list,
            delete_list,
            export_list
        ])
        .setup(|app| {
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
                hide_traffic_lights(&window);

                // Window starts hidden in the config to avoid a flash of the
                // native frame; reveal it once it's configured.
                let _ = window.show();

                // Clear the tray badge on focus; hide to the tray instead of
                // quitting when the window is closed (reopened via tray/dock).
                let handle = app.handle().clone();
                let win = window.clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::Focused(true) => {
                        tray::set_alert(&handle, false);
                        // Clicking the main window dismisses the popover panel.
                        hide_panel(&handle);
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
                // The panel uses the transparent title bar style so it keeps the
                // native rounded corners and shadow, but it's a floating popover
                // that hides on blur - so hide the traffic-light buttons to leave
                // a clean, chrome-free surface.
                #[cfg(target_os = "macos")]
                hide_traffic_lights(&panel);

                let app_handle = app.handle().clone();
                panel.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        // On macOS, ignore focus moving to a same-app system panel
                        // (the emoji & symbols viewer keeps the app active) so it
                        // doesn't dismiss us mid-edit. Switching apps deactivates
                        // the app and still dismisses; clicking the main window is
                        // handled by the main window's focus handler.
                        #[cfg(target_os = "macos")]
                        if app_is_active() {
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

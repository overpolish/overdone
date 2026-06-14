mod tray;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};

use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition};

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
    /// The panel's physical top-left captured just before it expanded for the
    /// diagram modal, so unexpanding restores the exact pre-expand position
    /// instead of re-deriving it (which drifts when expanding had to clamp the
    /// larger window back on-screen). `i32::MIN` means "nothing saved".
    panel_collapsed_x: AtomicI32,
    panel_collapsed_y: AtomicI32,
    /// Click-through ("passthrough") setting: while on, the main window hides and
    /// passes clicks through when the cursor is over it (unless it's focused or
    /// the modifier is held).
    passthrough: AtomicBool,
    /// Whether the main window currently has focus.
    focused: AtomicBool,
    /// Whether passthrough is currently active (window hidden + click-through),
    /// so we only re-apply on change.
    passthrough_active: AtomicBool,
    /// Whether the passthrough poll loop is running.
    passthrough_polling: AtomicBool,
    /// Exclude the app's windows from screen capture / screen sharing (maps to
    /// `NSWindowSharingNone` on macOS and `WDA_EXCLUDEFROMCAPTURE` on Windows).
    /// Defaults on so the contents stay private during screen shares.
    content_protected: AtomicBool,
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
    /// Disk usage of the list: its markdown plus all its attachments, in bytes.
    bytes: u64,
}

/// Total size (bytes) of all files under `dir`, recursively. 0 if absent.
fn dir_size(dir: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            match entry.metadata() {
                Ok(meta) if meta.is_file() => total += meta.len(),
                Ok(meta) if meta.is_dir() => total += dir_size(&entry.path()),
                _ => {}
            }
        }
    }
    total
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

/// Reject anything that isn't a bare filename component (no path separators /
/// traversal) so a crafted id or name can't escape its directory.
fn is_safe_component(s: &str) -> bool {
    !s.is_empty() && !s.contains('/') && !s.contains('\\') && !s.contains("..")
}

/// Resolve the on-disk path for a list id, rejecting anything that isn't a bare
/// filename (no path separators / traversal) so a crafted id can't escape the
/// lists directory.
fn list_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !is_safe_component(id) {
        return Err(format!("invalid list id: {id}"));
    }
    Ok(lists_dir(app)?.join(format!("{id}.md")))
}

/// Directory holding a list's media attachments (`<app data>/media/<list id>`).
fn media_dir(app: &tauri::AppHandle, list_id: &str) -> Result<PathBuf, String> {
    if !is_safe_component(list_id) {
        return Err(format!("invalid list id: {list_id}"));
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("media")
        .join(list_id);
    Ok(dir)
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
        let md_bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let media_bytes = media_dir(&app, id).map(|d| dir_size(&d)).unwrap_or(0);
        lists.push(ListMeta {
            id: id.to_string(),
            title: title_from_markdown(&content),
            bytes: md_bytes + media_bytes,
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

/// Export a list to a user-chosen folder: its markdown (named `file_name`) plus
/// a `media/` subfolder holding its attachments, so the markdown's relative
/// `media/...` references resolve in the exported folder. The caller supplies
/// the rendered `content` (clean export markdown, not the raw storage format).
#[tauri::command]
fn export_list_to_dir(
    app: tauri::AppHandle,
    id: String,
    dir: String,
    file_name: String,
    content: String,
) -> Result<(), String> {
    if !is_safe_component(&file_name) {
        return Err(format!("invalid file name: {file_name}"));
    }
    let dest_dir = PathBuf::from(&dir);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join(&file_name), content).map_err(|e| e.to_string())?;

    // Copy attachments (the on-disk media folder only holds referenced files,
    // since it's pruned on list open).
    let src_media = media_dir(&app, &id)?;
    if src_media.is_dir() {
        let out = dest_dir.join("media");
        std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(&src_media).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path();
            if path.is_file() {
                let _ = std::fs::copy(&path, out.join(entry.file_name()));
            }
        }
    }
    Ok(())
}

/// Copy an external file into a list's media folder under `file_name` (a bare
/// `<uuid>.<ext>` chosen by the caller). Used by drag-drop and the file picker,
/// which provide an on-disk source path.
#[tauri::command]
fn import_attachment(
    app: tauri::AppHandle,
    list_id: String,
    src: String,
    file_name: String,
) -> Result<(), String> {
    if !is_safe_component(&file_name) {
        return Err(format!("invalid file name: {file_name}"));
    }
    let dir = media_dir(&app, &list_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::copy(&src, dir.join(&file_name)).map_err(|e| e.to_string())?;
    Ok(())
}

/// Write raw bytes into a list's media folder under `file_name`. Used for
/// clipboard paste, where the source is in-memory data rather than a file path.
#[tauri::command]
fn write_attachment(
    app: tauri::AppHandle,
    list_id: String,
    file_name: String,
    data: Vec<u8>,
) -> Result<(), String> {
    if !is_safe_component(&file_name) {
        return Err(format!("invalid file name: {file_name}"));
    }
    let dir = media_dir(&app, &list_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(&file_name), data).map_err(|e| e.to_string())?;
    Ok(())
}

/// Ensure the managed ffmpeg binary is available, downloading it on first use.
fn ensure_ffmpeg() -> Result<(), String> {
    use ffmpeg_sidecar::{command::ffmpeg_is_installed, download::auto_download};
    if ffmpeg_is_installed() {
        return Ok(());
    }
    auto_download().map_err(|e| format!("ffmpeg download failed: {e}"))
}

/// Read a file's bytes from an arbitrary (user-chosen) path. Used to load a
/// dragged/picked image into the webview for canvas-based compression.
#[tauri::command]
fn read_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

/// Whether the managed ffmpeg binary is already installed.
#[tauri::command]
fn ffmpeg_installed() -> bool {
    ffmpeg_sidecar::command::ffmpeg_is_installed()
}

/// Download the managed ffmpeg binary, emitting `ffmpeg:progress` events so the
/// UI can show feedback. Runs off the UI thread; no-ops if already installed.
#[tauri::command]
async fn download_ffmpeg(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use ffmpeg_sidecar::download::{
            auto_download_with_progress, FfmpegDownloadProgressEvent as E,
        };
        auto_download_with_progress(|event| {
            let payload = match event {
                E::Starting => serde_json::json!({ "phase": "starting" }),
                E::Downloading {
                    total_bytes,
                    downloaded_bytes,
                } => serde_json::json!({
                    "phase": "downloading",
                    "downloaded": downloaded_bytes,
                    "total": total_bytes,
                }),
                E::UnpackingArchive => serde_json::json!({ "phase": "unpacking" }),
                E::Done => serde_json::json!({ "phase": "done" }),
            };
            let _ = app.emit("ffmpeg:progress", payload);
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Transcode `src` into `dest`, compressing for size at good quality. Images →
/// WebP (q82); videos → H.264/AAC MP4 — both broadly supported by the webview on
/// macOS (WKWebView) and Windows (WebView2). ffmpeg picks the format from the
/// destination extension.
fn transcode(src: &Path, dest: &Path, kind: &str) -> Result<(), String> {
    use ffmpeg_sidecar::command::FfmpegCommand;
    use ffmpeg_sidecar::event::{FfmpegEvent, LogLevel};
    ensure_ffmpeg()?;

    let mut cmd = FfmpegCommand::new();
    cmd.create_no_window();
    cmd.overwrite().input(src.to_string_lossy());
    if kind == "video" {
        cmd.codec_video("libx264")
            .crf(28)
            .preset("veryfast")
            .pix_fmt("yuv420p")
            .codec_audio("aac")
            .args(["-b:a", "128k", "-movflags", "+faststart"]);
    } else {
        cmd.codec_video("libwebp")
            .args(["-quality", "82", "-compression_level", "6"]);
    }
    cmd.output(dest.to_string_lossy());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    // Drain the event/log stream (also prevents the stderr pipe from filling and
    // stalling ffmpeg) while keeping the error/fatal lines for diagnostics.
    let mut errors = String::new();
    if let Ok(events) = child.iter() {
        for event in events {
            match event {
                FfmpegEvent::Log(LogLevel::Error | LogLevel::Fatal, msg)
                | FfmpegEvent::Error(msg) => {
                    errors.push_str(msg.trim());
                    errors.push('\n');
                }
                _ => {}
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        let detail = errors.trim();
        return Err(if detail.is_empty() {
            "ffmpeg failed to transcode attachment".into()
        } else {
            format!("ffmpeg: {detail}")
        });
    }
    Ok(())
}

/// Compress an on-disk file (drag-drop / picker) into a list's media folder.
#[tauri::command]
fn compress_path(
    app: tauri::AppHandle,
    list_id: String,
    file_name: String,
    src: String,
    kind: String,
) -> Result<(), String> {
    if !is_safe_component(&file_name) {
        return Err(format!("invalid file name: {file_name}"));
    }
    let dir = media_dir(&app, &list_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    transcode(Path::new(&src), &dir.join(&file_name), &kind)
}

/// Compress in-memory bytes (clipboard paste) into a list's media folder.
#[tauri::command]
fn compress_bytes(
    app: tauri::AppHandle,
    list_id: String,
    file_name: String,
    src_ext: String,
    data: Vec<u8>,
    kind: String,
) -> Result<(), String> {
    if !is_safe_component(&file_name) {
        return Err(format!("invalid file name: {file_name}"));
    }
    let dir = media_dir(&app, &list_id)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // ffmpeg needs a file input; stage the bytes in a temp file named with the
    // source extension so ffmpeg picks the right demuxer.
    let ext = if is_safe_component(&src_ext) { src_ext.as_str() } else { "bin" };
    let tmp = std::env::temp_dir().join(format!("overdone-src-{file_name}.{ext}"));
    std::fs::write(&tmp, &data).map_err(|e| e.to_string())?;
    let result = transcode(&tmp, &dir.join(&file_name), &kind);
    let _ = std::fs::remove_file(&tmp);
    result
}

/// Delete specific attachment files from a list's media folder (e.g. when a
/// comment or its image is removed). Targeted — won't touch other files.
#[tauri::command]
fn delete_attachments(
    app: tauri::AppHandle,
    list_id: String,
    files: Vec<String>,
) -> Result<(), String> {
    let dir = media_dir(&app, &list_id)?;
    for file in files {
        if is_safe_component(&file) {
            let _ = std::fs::remove_file(dir.join(&file));
        }
    }
    Ok(())
}

/// Delete any files in a list's media folder not in `keep` (the attachments its
/// markdown still references). Called on list open to clear orphaned files.
#[tauri::command]
fn prune_media(app: tauri::AppHandle, list_id: String, keep: Vec<String>) -> Result<(), String> {
    let dir = media_dir(&app, &list_id)?;
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()), // no media folder yet
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.path().is_file() && !keep.contains(&name) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}

/// Delete a list's file and its media folder (ignored if already gone).
#[tauri::command]
fn delete_list(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = list_path(&app, &id)?;
    // Remove attachments first; a stray media folder is harmless if this fails.
    if let Ok(dir) = media_dir(&app, &id) {
        let _ = std::fs::remove_dir_all(&dir);
    }
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
    // Tell the main window to drop its "item being edited" row highlight.
    let _ = app.emit("panel:closed", ());
    if let Some(main) = app.get_webview_window("main") {
        let on_top = state.always_on_top.load(Ordering::Relaxed);
        let _ = main.set_always_on_top(on_top);
    }
    apply_passthrough(app);
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

/// Window opacity while hidden by passthrough (0 = fully invisible).
const PASSTHROUGH_HIDDEN_ALPHA: f64 = 0.0;

/// Whether the cursor is over the window and whether the passthrough modifier is
/// held, in the platform's screen coordinates. `None` on platforms without an
/// implementation yet (passthrough then stays off).
#[cfg(target_os = "macos")]
fn passthrough_inputs(window: &tauri::WebviewWindow) -> Option<(bool, bool)> {
    use objc2::{msg_send, ClassType, MainThreadMarker};
    use objc2_app_kit::{NSEvent, NSEventModifierFlags, NSWindow};

    // Sampled on the main thread (the poll dispatches there); bail otherwise.
    MainThreadMarker::new()?;
    let ns_ptr = window.ns_window().ok()?;
    let ns_window = unsafe { &*(ns_ptr as *const NSWindow) };
    // `frame` and `mouseLocation` are both Cocoa screen coords (bottom-left),
    // so they compare directly.
    let frame = ns_window.frame();
    let loc = NSEvent::mouseLocation();
    let over = loc.x >= frame.origin.x
        && loc.x <= frame.origin.x + frame.size.width
        && loc.y >= frame.origin.y
        && loc.y <= frame.origin.y + frame.size.height;
    // The class method `+[NSEvent modifierFlags]` (live state) collides with the
    // instance method of the same name, so reach it via `msg_send`.
    let flags: NSEventModifierFlags = unsafe { msg_send![NSEvent::class(), modifierFlags] };
    let modifier = flags.contains(NSEventModifierFlags::Command);
    Some((over, modifier))
}

#[cfg(target_os = "windows")]
fn passthrough_inputs(window: &tauri::WebviewWindow) -> Option<(bool, bool)> {
    // The cursor position and window rect come from Tauri's cross-platform APIs
    // (both physical pixels in screen space), so they compare directly without any
    // Win32 coordinate math.
    let cursor = window.app_handle().cursor_position().ok()?;
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let over = cursor.x >= pos.x as f64
        && cursor.x <= (pos.x + size.width as i32) as f64
        && cursor.y >= pos.y as f64
        && cursor.y <= (pos.y + size.height as i32) as f64;

    // Live modifier state (Ctrl, matching macOS's Cmd) — a click-through window
    // gets no key events, so query it directly. Raw FFI to user32 avoids pinning a
    // `windows` crate version against Tauri's.
    const VK_CONTROL: i32 = 0x11;
    #[link(name = "user32")]
    extern "system" {
        fn GetAsyncKeyState(v_key: i32) -> i16;
    }
    let modifier = unsafe { (GetAsyncKeyState(VK_CONTROL) as u16) & 0x8000 != 0 };
    Some((over, modifier))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn passthrough_inputs(_window: &tauri::WebviewWindow) -> Option<(bool, bool)> {
    // Other platforms have no implementation yet, so passthrough stays off.
    None
}

#[cfg(target_os = "macos")]
fn set_window_alpha(window: &tauri::WebviewWindow, alpha: f64) {
    use objc2_app_kit::NSWindow;
    if let Ok(ns_ptr) = window.ns_window() {
        let ns_window = unsafe { &*(ns_ptr as *const NSWindow) };
        ns_window.setAlphaValue(alpha);
    }
}

#[cfg(target_os = "windows")]
fn set_window_alpha(window: &tauri::WebviewWindow, alpha: f64) {
    use std::ffi::c_void;
    type Hwnd = *mut c_void;
    // GetWindowLongPtr index for the extended style; the layered-window flag and
    // the "use the alpha value" flag for SetLayeredWindowAttributes.
    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_LAYERED: isize = 0x0008_0000;
    const LWA_ALPHA: u32 = 0x0000_0002;
    #[link(name = "user32")]
    extern "system" {
        fn GetWindowLongPtrW(hwnd: Hwnd, index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: Hwnd, index: i32, new: isize) -> isize;
        fn SetLayeredWindowAttributes(hwnd: Hwnd, key: u32, alpha: u8, flags: u32) -> i32;
    }

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let hwnd = hwnd.0 as Hwnd;
    unsafe {
        // A window must be layered before its alpha can be set; add the style once.
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        if ex & WS_EX_LAYERED == 0 {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_LAYERED);
        }
        let byte = (alpha.clamp(0.0, 1.0) * 255.0).round() as u8;
        SetLayeredWindowAttributes(hwnd, 0, byte, LWA_ALPHA);
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn set_window_alpha(_window: &tauri::WebviewWindow, _alpha: f64) {}

/// Recompute and apply passthrough for the main window. Active = setting on, the
/// window isn't focused, the modifier isn't held, and the cursor is over it.
fn apply_passthrough(app: &tauri::AppHandle) {
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
fn set_passthrough(app: tauri::AppHandle, value: bool, state: tauri::State<WindowState>) {
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

/// Grab the user's attention: show the red tray badge and bounce the dock icon
/// (macOS) / flash the taskbar (Windows). The badge persists until every
/// notification is dismissed (see `set_tray_alert`); the dock bounce is cleared
/// by the OS on focus.
#[tauri::command]
fn flag_attention(app: tauri::AppHandle) {
    tray::set_alert(&app, true);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
    }
}

/// Set the red tray badge on/off. Driven by the count of unacknowledged
/// notifications, so the badge stays lit until the user dismisses them all.
#[tauri::command]
fn set_tray_alert(app: tauri::AppHandle, on: bool) {
    tray::set_alert(&app, on);
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

/// Clamp an anchored panel's physical top-left so the whole window (physical
/// `w`×`h`) stays within the work area of the monitor it sits on — otherwise a
/// row near the right or bottom edge would push the panel off-screen. Falls back
/// to the main window's monitor, then the primary, if the point isn't on any.
fn clamp_to_work_area(
    panel: &tauri::WebviewWindow,
    main: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
) -> Option<PhysicalPosition<i32>> {
    let monitor = panel
        .monitor_from_point(x as f64, y as f64)
        .ok()
        .flatten()
        .or_else(|| main.current_monitor().ok().flatten())
        .or_else(|| panel.primary_monitor().ok().flatten())?;
    let area = monitor.work_area();
    let min_x = area.position.x;
    let min_y = area.position.y;
    // Largest top-left that keeps the panel fully visible; clamped to at least
    // the work-area origin so an over-tall panel pins to the top-left corner
    // rather than being shoved off the opposite edge.
    let max_x = (area.position.x + area.size.width as i32 - w).max(min_x);
    let max_y = (area.position.y + area.size.height as i32 - h).max(min_y);
    Some(PhysicalPosition::new(
        x.clamp(min_x, max_x),
        y.clamp(min_y, max_y),
    ))
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
            // The anchor + size are logical (CSS px in the main window's space);
            // convert to physical to compare against the monitor's work area, and
            // clamp so an edge-of-screen row can't push the panel off-screen.
            let scale = main.scale_factor().unwrap_or(1.0);
            let px = (x * scale).round() as i32;
            let py = (y * scale).round() as i32;
            let pw = (width * scale).round() as i32;
            let ph = (height * scale).round() as i32;
            let pos = clamp_to_work_area(&panel, &main, px, py, pw, ph)
                .unwrap_or_else(|| PhysicalPosition::new(px, py));
            let _ = panel.set_position(pos);
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

    // Make sure the main window isn't left hidden by passthrough behind the panel.
    apply_passthrough(&app);
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

    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    if !state.panel_anchored.load(Ordering::Relaxed) {
        let keep_y = panel.outer_position().ok().map(|p| p.y);
        center_panel_under_main(&main, &panel, width, keep_y);
    } else if let (Ok(pos), Ok(scale)) = (panel.outer_position(), panel.scale_factor()) {
        // Anchored panel that grew (e.g. suggestions appeared): keep its
        // top-left but re-clamp so the larger window doesn't spill off-screen.
        let pw = (width * scale).round() as i32;
        let ph = (height * scale).round() as i32;
        if let Some(clamped) = clamp_to_work_area(&panel, &main, pos.x, pos.y, pw, ph) {
            let _ = panel.set_position(clamped);
        }
    }
}

/// Grow/shrink the panel around its horizontal center (keeping its top edge),
/// used to give the in-panel diagram modal ~2x the room while it's open and to
/// restore the size when it closes. `width`/`height` are the panel's base content
/// size (logical px); `expanded` doubles the width. Centered so it doesn't drift
/// to one side or off-screen (re-clamped to the work area).
#[tauri::command]
fn set_panel_expanded(
    app: tauri::AppHandle,
    expanded: bool,
    width: f64,
    height: f64,
    state: tauri::State<WindowState>,
) {
    let (Some(main), Some(panel)) = (
        app.get_webview_window("main"),
        app.get_webview_window("panel"),
    ) else {
        return;
    };
    let (Ok(old_pos), Ok(old_size), Ok(scale)) =
        (panel.outer_position(), panel.outer_size(), panel.scale_factor())
    else {
        return;
    };

    let target_w = if expanded { width * 2.0 } else { width };
    let _ = panel.set_size(LogicalSize::new(target_w, height));

    let new_w = (target_w * scale).round() as i32;
    let new_h = (height * scale).round() as i32;

    let (x, y) = if expanded {
        // Remember exactly where we were so unexpand can return here even if the
        // grown window has to clamp on-screen and shift its center.
        state
            .panel_collapsed_x
            .store(old_pos.x, Ordering::Relaxed);
        state
            .panel_collapsed_y
            .store(old_pos.y, Ordering::Relaxed);
        // Grow around the current center (top edge unchanged).
        let center_x = old_pos.x + old_size.width as i32 / 2;
        (center_x - new_w / 2, old_pos.y)
    } else {
        // Restore the saved pre-expand position; fall back to re-centering if we
        // somehow have nothing saved.
        let saved_x = state.panel_collapsed_x.swap(i32::MIN, Ordering::Relaxed);
        let saved_y = state.panel_collapsed_y.swap(i32::MIN, Ordering::Relaxed);
        if saved_x != i32::MIN && saved_y != i32::MIN {
            (saved_x, saved_y)
        } else {
            let center_x = old_pos.x + old_size.width as i32 / 2;
            (center_x - new_w / 2, old_pos.y)
        }
    };

    let pos = clamp_to_work_area(&panel, &main, x, y, new_w, new_h)
        .unwrap_or_else(|| PhysicalPosition::new(x, y));
    let _ = panel.set_position(pos);
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

/// Apply the screen-capture exclusion preference to every app window. Called
/// from any window (the setting lives in the panel) so it goes through the app
/// handle. On macOS this sets the windows' sharing type to "none"; on Windows it
/// sets the display affinity to exclude-from-capture.
#[tauri::command]
fn set_content_protected(app: tauri::AppHandle, value: bool, state: tauri::State<WindowState>) {
    state.content_protected.store(value, Ordering::Relaxed);
    for label in ["main", "panel"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.set_content_protected(value);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .manage(WindowState {
            always_on_top: AtomicBool::new(true),
            panel_open: AtomicBool::new(false),
            panel_anchored: AtomicBool::new(false),
            panel_collapsed_x: AtomicI32::new(i32::MIN),
            panel_collapsed_y: AtomicI32::new(i32::MIN),
            passthrough: AtomicBool::new(false),
            focused: AtomicBool::new(false),
            passthrough_active: AtomicBool::new(false),
            passthrough_polling: AtomicBool::new(false),
            content_protected: AtomicBool::new(true),
        })
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Remember the main window's size and position across launches (restored
        // before it's shown, so there's no flash). The panel is excluded — it's
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
            flag_attention,
            set_tray_alert,
            background_app,
            open_panel,
            resize_panel,
            set_panel_expanded,
            close_panel,
            set_always_on_top,
            set_passthrough,
            set_content_protected,
            hide_to_tray,
            list_lists,
            read_list,
            write_list,
            delete_list,
            export_list_to_dir,
            import_attachment,
            write_attachment,
            compress_path,
            compress_bytes,
            delete_attachments,
            prune_media,
            read_file,
            ffmpeg_installed,
            download_ffmpeg
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
                // focus — it tracks unacknowledged notifications (set_tray_alert)
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
                        if *focused {
                            // Clicking the main window dismisses the popover panel.
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
                // custom React title bar take over — otherwise the panel shows a
                // native title bar the main window doesn't have.
                #[cfg(target_os = "windows")]
                let _ = panel.set_decorations(false);

                // The panel uses the transparent title bar style so it keeps the
                // native rounded corners and shadow, but it's a floating popover
                // that hides on blur - so hide the traffic-light buttons to leave
                // a clean, chrome-free surface.
                #[cfg(target_os = "macos")]
                hide_traffic_lights(&panel);

                // Match the main window's default screen-capture exclusion so the
                // popover's contents aren't captured either.
                let _ = panel.set_content_protected(true);

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

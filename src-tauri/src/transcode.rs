/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

//! ffmpeg-backed attachment compression: ensuring/downloading the managed
//! binary and transcoding images (→ WebP) and videos (→ H.264/AAC MP4).

use std::path::Path;

use tauri::Emitter;

use crate::storage::{is_safe_component, media_dir};

/// Ensure the managed ffmpeg binary is available, downloading it on first use.
fn ensure_ffmpeg() -> Result<(), String> {
    use ffmpeg_sidecar::{command::ffmpeg_is_installed, download::auto_download};
    if ffmpeg_is_installed() {
        return Ok(());
    }
    auto_download().map_err(|e| format!("ffmpeg download failed: {e}"))
}

/// Whether the managed ffmpeg binary is already installed.
#[tauri::command]
pub fn ffmpeg_installed() -> bool {
    ffmpeg_sidecar::command::ffmpeg_is_installed()
}

/// Download the managed ffmpeg binary, emitting `ffmpeg:progress` events so the
/// UI can show feedback. Runs off the UI thread; no-ops if already installed.
#[tauri::command]
pub async fn download_ffmpeg(app: tauri::AppHandle) -> Result<(), String> {
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
pub fn compress_path(
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
pub fn compress_bytes(
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

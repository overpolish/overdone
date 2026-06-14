/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

//! On-disk list storage: path resolution (with traversal guards), list
//! enumeration, and the read/write/export/delete commands.

use std::path::{Path, PathBuf};

use tauri::Manager;

/// Metadata for one stored list: its file id (uuid stem) and display title
/// (the first `# ` heading in the markdown, or "Untitled" when absent/empty).
#[derive(serde::Serialize)]
pub struct ListMeta {
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
pub fn is_safe_component(s: &str) -> bool {
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
pub fn media_dir(app: &tauri::AppHandle, list_id: &str) -> Result<PathBuf, String> {
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
pub fn list_lists(app: tauri::AppHandle) -> Result<Vec<ListMeta>, String> {
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
pub fn read_list(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let path = list_path(&app, &id)?;
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Write a list's markdown, creating the lists directory as needed. Written to a
/// temp file then renamed so a save can't leave a half-written file behind.
#[tauri::command]
pub fn write_list(app: tauri::AppHandle, id: String, content: String) -> Result<(), String> {
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
pub fn export_list_to_dir(
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

/// Delete a list's file and its media folder (ignored if already gone).
#[tauri::command]
pub fn delete_list(app: tauri::AppHandle, id: String) -> Result<(), String> {
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

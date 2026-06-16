/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

//! On-disk list storage: path resolution (with traversal guards), list
//! enumeration, and the read/write/export/delete commands.
//!
//! Layout is a folder per list, so a list and its attachments move together as
//! one unit (which is what makes the trash/restore below a single rename):
//!
//! ```text
//! <app data>/lists/<id>/list.md          the markdown
//! <app data>/lists/<id>/media/<f>.<ext>  its attachments
//! <app data>/trash/<id>/...              soft-deleted lists (+ a `.trashed` marker)
//! ```
//!
//! Deleting a list moves its folder into `trash/` rather than removing it, so the
//! user can restore it (or it's purged automatically after 30 days). An older
//! flat layout (`lists/<id>.md` + `media/<id>/`) is upgraded once on startup by
//! [`migrate_layout`].

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

/// Filename of the timestamp marker written inside a trashed list's folder; its
/// contents are the epoch-millis instant the list was trashed.
const TRASH_MARKER: &str = ".trashed";

/// How long a trashed list survives before the startup sweep purges it.
const TRASH_TTL_MS: u64 = 30 * 24 * 60 * 60 * 1000;

/// Metadata for one stored list: its file id (uuid stem) and display title
/// (the first `# ` heading in the markdown, or "Untitled" when absent/empty).
#[derive(serde::Serialize)]
pub struct ListMeta {
    id: String,
    title: String,
    /// Disk usage of the list: its markdown plus all its attachments, in bytes.
    bytes: u64,
}

/// Metadata for one trashed list: like [`ListMeta`], plus when it was deleted
/// (epoch millis) so the UI can show its age and order newest-first.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashMeta {
    id: String,
    title: String,
    bytes: u64,
    deleted_at: u64,
}

/// Current time as epoch millis (0 if the clock is before the epoch).
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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

/// Directory holding the per-list folders (`<app data>/lists`).
fn lists_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("lists");
    Ok(dir)
}

/// Directory holding trashed list folders (`<app data>/trash`).
fn trash_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("trash");
    Ok(dir)
}

/// Reject anything that isn't a bare filename component (no path separators /
/// traversal) so a crafted id or name can't escape its directory.
pub fn is_safe_component(s: &str) -> bool {
    !s.is_empty() && !s.contains('/') && !s.contains('\\') && !s.contains("..")
}

/// Resolve a list's folder (`<app data>/lists/<id>`), rejecting any id that isn't
/// a bare filename so a crafted id can't escape the lists directory.
fn list_dir(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !is_safe_component(id) {
        return Err(format!("invalid list id: {id}"));
    }
    Ok(lists_dir(app)?.join(id))
}

/// Resolve the on-disk markdown path for a list id (`.../lists/<id>/list.md`).
fn list_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(list_dir(app, id)?.join("list.md"))
}

/// Directory holding a list's media attachments (`.../lists/<id>/media`).
pub fn media_dir(app: &tauri::AppHandle, list_id: &str) -> Result<PathBuf, String> {
    Ok(list_dir(app, list_id)?.join("media"))
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
        if !path.is_dir() {
            continue; // stray temp files etc.
        }
        let Some(id) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if !is_safe_component(id) {
            continue;
        }
        let md = path.join("list.md");
        if !md.is_file() {
            continue; // not a real list folder (e.g. orphaned media)
        }
        let content = std::fs::read_to_string(&md).unwrap_or_default();
        lists.push(ListMeta {
            id: id.to_string(),
            title: title_from_markdown(&content),
            bytes: dir_size(&path),
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

/// Read a UTF-8 text file the user explicitly picked (e.g. via the import
/// dialog). Unlike `read_list`, the path is an absolute one outside the app's
/// lists directory, so there's no id/component guard - the native file picker is
/// the gate on what can be read.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Write a list's markdown, creating the list's folder as needed. Written to a
/// temp file then renamed so a save can't leave a half-written file behind.
#[tauri::command]
pub fn write_list(app: tauri::AppHandle, id: String, content: String) -> Result<(), String> {
    let dir = list_dir(&app, &id)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("list.md");
    let tmp = dir.join(".list.md.tmp");
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

/// Soft-delete a list: move its folder into the trash (a fast rename, so its
/// media travels with it) and stamp it with the current time for the 30-day
/// auto-purge. The user can restore it from the trash until then. A no-op if the
/// list is already gone.
#[tauri::command]
pub fn delete_list(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let src = list_dir(&app, &id)?;
    if !src.exists() {
        return Ok(());
    }
    let trash = trash_dir(&app)?;
    std::fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let dest = trash.join(&id);
    // Drop any stale trashed copy sharing this id so the rename can't fail.
    if dest.exists() {
        let _ = std::fs::remove_dir_all(&dest);
    }
    std::fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    // Record when it was trashed; a missing marker just means we can't age it
    // out (it stays until purged by hand), so a failed write is non-fatal.
    let _ = std::fs::write(dest.join(TRASH_MARKER), now_ms().to_string());
    Ok(())
}

/// List the trashed lists (id, title, size, and when each was deleted), ordered
/// newest-deleted first.
#[tauri::command]
pub fn list_trash(app: tauri::AppHandle) -> Result<Vec<TrashMeta>, String> {
    let dir = trash_dir(&app)?;
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(Vec::new()),
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(id) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if !is_safe_component(id) {
            continue;
        }
        let content = std::fs::read_to_string(path.join("list.md")).unwrap_or_default();
        let deleted_at = std::fs::read_to_string(path.join(TRASH_MARKER))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0);
        out.push(TrashMeta {
            id: id.to_string(),
            title: title_from_markdown(&content),
            bytes: dir_size(&path),
            deleted_at,
        });
    }

    out.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    Ok(out)
}

/// Restore a trashed list back into the lists directory. Errors if it isn't in
/// the trash, or if a live list already claims that id.
#[tauri::command]
pub fn restore_list(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let src = trash_dir(&app)?.join(&id);
    if !is_safe_component(&id) || !src.is_dir() {
        return Err("list not found in trash".to_string());
    }
    let dest = list_dir(&app, &id)?;
    if dest.exists() {
        return Err("a list with this id already exists".to_string());
    }
    std::fs::create_dir_all(lists_dir(&app)?).map_err(|e| e.to_string())?;
    std::fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(dest.join(TRASH_MARKER));
    Ok(())
}

/// Permanently delete a trashed list (the "delete forever" action). A no-op if
/// it's already gone.
#[tauri::command]
pub fn purge_list(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if !is_safe_component(&id) {
        return Err(format!("invalid list id: {id}"));
    }
    let dir = trash_dir(&app)?.join(&id);
    match std::fs::remove_dir_all(&dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Purge trashed lists older than [`TRASH_TTL_MS`]. Called once on startup.
/// Entries with no readable timestamp are left alone (we can't age what we can't
/// date).
pub fn prune_trash(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = trash_dir(app)?;
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()),
    };
    let now = now_ms();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let deleted_at: Option<u64> = std::fs::read_to_string(path.join(TRASH_MARKER))
            .ok()
            .and_then(|s| s.trim().parse().ok());
        if let Some(t) = deleted_at {
            if now.saturating_sub(t) > TRASH_TTL_MS {
                let _ = std::fs::remove_dir_all(&path);
            }
        }
    }
    Ok(())
}

/// One-time upgrade from the old flat layout (`lists/<id>.md` + `media/<id>/`) to
/// the folder-per-list layout (`lists/<id>/list.md` + `lists/<id>/media/`).
/// Idempotent: a no-op once there are no loose `.md` files directly under
/// `lists/`. Called on startup before the frontend enumerates lists.
pub fn migrate_layout(app: &tauri::AppHandle) -> Result<(), String> {
    let lists = lists_dir(app)?;
    if !lists.is_dir() {
        return Ok(());
    }

    // Collect the old-format files first so we don't mutate the directory while
    // iterating it.
    let mut old: Vec<(String, PathBuf)> = Vec::new();
    for entry in std::fs::read_dir(&lists).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                old.push((stem.to_string(), path));
            }
        }
    }
    if old.is_empty() {
        return Ok(());
    }

    let media_root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("media");

    for (id, md) in old {
        if !is_safe_component(&id) {
            continue;
        }
        let new_dir = lists.join(&id);
        if std::fs::create_dir_all(&new_dir).is_err() {
            continue;
        }
        let _ = std::fs::rename(&md, new_dir.join("list.md"));
        let old_media = media_root.join(&id);
        if old_media.is_dir() {
            let _ = std::fs::rename(&old_media, new_dir.join("media"));
        }
    }

    // Drop the now-empty legacy media root (only succeeds if nothing's left).
    let _ = std::fs::remove_dir(&media_root);
    Ok(())
}

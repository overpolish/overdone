//! Media attachment file ops: importing, writing, pruning, and deleting files in
//! a list's media folder, plus reading an arbitrary file for the webview.

use crate::storage::{is_safe_component, media_dir};

/// Copy an external file into a list's media folder under `file_name` (a bare
/// `<uuid>.<ext>` chosen by the caller). Used by drag-drop and the file picker,
/// which provide an on-disk source path.
#[tauri::command]
pub fn import_attachment(
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
pub fn write_attachment(
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

/// Read a file's bytes from an arbitrary (user-chosen) path. Used to load a
/// dragged/picked image into the webview for canvas-based compression.
#[tauri::command]
pub fn read_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

/// Delete specific attachment files from a list's media folder (e.g. when a
/// comment or its image is removed). Targeted — won't touch other files.
#[tauri::command]
pub fn delete_attachments(
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
pub fn prune_media(app: tauri::AppHandle, list_id: String, keep: Vec<String>) -> Result<(), String> {
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

/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

//! The secondary floating "panel" window: showing it (centered under the main
//! title bar or anchored below a row), keeping it on-screen, resizing it to fit
//! content, expanding it for the diagram modal, and hiding it.

use std::sync::atomic::Ordering;

use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition};

use crate::passthrough::apply_passthrough;
use crate::window_state::WindowState;

/// Hide the secondary panel. The main window's always-on-top level is never
/// touched here: the panel sits one window level *above* the main window (see
/// `open_panel`), so the two never z-fight and there's no level to restore. That
/// keeps this dismissal off the main window's title bar - changing the main
/// window's level mid-click used to re-seat its native drag and snap it sideways.
pub fn hide_panel(app: &tauri::AppHandle) {
    let state = app.state::<WindowState>();
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.hide();
    }
    state.panel_open.store(false, Ordering::Relaxed);
    state.panel_editing.store(false, Ordering::Relaxed);
    state.panel_dirty.store(false, Ordering::Relaxed);
    // Tell the main window to drop its "item being edited" row highlight.
    let _ = app.emit("panel:closed", ());
    // The panel no longer counts as "interacting", so re-evaluate passthrough.
    apply_passthrough(app);
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
    height: f64,
    keep_y: Option<i32>,
) {
    let (Ok(pos), Ok(main_size), Ok(scale)) =
        (main.outer_position(), main.inner_size(), main.scale_factor())
    else {
        return;
    };
    let panel_w_phys = (width * scale) as i32;
    let panel_h_phys = (height * scale) as i32;
    let x = pos.x + (main_size.width as i32 - panel_w_phys) / 2;
    // Below the title bar with a gap so the logo stays fully visible.
    let y = keep_y.unwrap_or(pos.y + 64);
    // Clamp to the work area so a tall panel (full settings, long lists) keeps
    // its bottom on-screen instead of spilling off below - the same on-screen
    // guarantee anchored panels (details) already get.
    let placed = clamp_to_work_area(panel, main, x, y, panel_w_phys, panel_h_phys)
        .unwrap_or_else(|| PhysicalPosition::new(x, y));
    let _ = panel.set_position(placed);
}

/// Clamp an anchored panel's physical top-left so the whole window (physical
/// `w`×`h`) stays within the work area of the monitor it sits on - otherwise a
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
pub fn open_panel(
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
            center_panel_under_main(&main, &panel, width, height, None);
            state.panel_anchored.store(false, Ordering::Relaxed);
        }
    }

    // Keep the panel one window level above the main window so it reliably sits
    // on top without either window's always-on-top level being changed. The main
    // window stays put: we no longer suspend and restore its always-on-top, which
    // is what used to snap it sideways when the panel was dismissed by clicking
    // the title bar (changing the level mid-click re-seats the native drag).
    state.panel_open.store(true, Ordering::Relaxed);

    let _ = panel.show();
    let _ = panel.set_focus();
    // Seat the panel above main last: on Windows the z-order set by
    // `raise_panel_above` is re-evaluated on activation, so it must run after
    // `set_focus` to stick (on macOS the window level persists regardless).
    crate::platform::raise_panel_above(&panel, &main);

    // Make sure the main window isn't left hidden by passthrough behind the panel.
    apply_passthrough(&app);
}

/// Resize the open panel to fit content that changed while it was visible. A
/// centered panel re-centers (keeping its vertical position); an anchored one
/// keeps its top-left and just grows.
#[tauri::command]
pub fn resize_panel(
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
        center_panel_under_main(&main, &panel, width, height, keep_y);
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
pub fn set_panel_expanded(
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
pub fn close_panel(app: tauri::AppHandle) {
    hide_panel(&app);
}

/// Mark the panel as actively being edited (a comment editor in it has focus).
/// While set, the panel survives focus loss to another app, so you can click out
/// to copy something into a comment without it vanishing. The editor sets it on
/// focus and clears it on blur.
///
/// This only flips the flag - it deliberately leaves the window level alone. The
/// panel already sits one level above the main window (set in `open_panel`), and
/// macOS orders window levels globally across apps, so it already floats above
/// other apps you switch to. Toggling `set_always_on_top` here would *lower* it:
/// that change is applied a runloop later, landing after `raise_panel_above` and
/// clobbering the panel's level back to normal, sinking it under the main window.
#[tauri::command]
pub fn set_panel_editing(value: bool, state: tauri::State<WindowState>) {
    state.panel_editing.store(value, Ordering::Relaxed);
}

/// Mark whether the panel holds an unsaved comment draft. While set, a focus loss
/// that would otherwise dismiss the panel (clicking the main window, focusing the
/// scratchpad) instead asks the panel to confirm first, so an in-progress comment
/// isn't thrown away silently; a plain switch to another app keeps it open too.
/// Reset on close. Set by the panel as its draft gains/loses content.
#[tauri::command]
pub fn set_panel_dirty(value: bool, state: tauri::State<WindowState>) {
    state.panel_dirty.store(value, Ordering::Relaxed);
}

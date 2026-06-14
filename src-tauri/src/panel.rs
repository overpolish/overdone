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

/// Hide the secondary panel and restore the main window's always-on-top
/// preference (suspended while the panel is open).
pub fn hide_panel(app: &tauri::AppHandle) {
    let state = app.state::<WindowState>();
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.hide();
    }
    state.panel_open.store(false, Ordering::Relaxed);
    // Tell the main window to drop its "item being edited" row highlight.
    let _ = app.emit("panel:closed", ());
    // Restore the main window's always-on-top level on the *next* main-thread
    // tick rather than inline. When the panel is dismissed by clicking the main
    // title bar, this runs during the same mousedown that the title bar's native
    // drag region uses to start a window drag - changing the window level in the
    // middle of that gesture makes macOS re-seat the drag and snap the window
    // sideways. Deferring it lets the click/drag settle first.
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        let state = app.state::<WindowState>();
        if let Some(main) = app.get_webview_window("main") {
            let on_top = state.always_on_top.load(Ordering::Relaxed);
            let _ = main.set_always_on_top(on_top);
        }
        apply_passthrough(&app);
    });
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

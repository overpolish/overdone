/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

use std::sync::atomic::{AtomicBool, AtomicI32};

/// Shared window state.
pub struct WindowState {
    /// The user's always-on-top preference for the main window.
    pub always_on_top: AtomicBool,
    /// Whether the secondary panel is open. The panel floats one window level
    /// above the main window while open (see `panel::open_panel`), so the main
    /// window keeps its always-on-top level and the two don't z-fight.
    pub panel_open: AtomicBool,
    /// Whether the panel was opened at a fixed anchor (the status picker, pinned
    /// below an item) rather than centered under the main title bar. Centered
    /// panels re-center when their content resizes; anchored ones stay put.
    pub panel_anchored: AtomicBool,
    /// The panel's physical top-left captured just before it expanded for the
    /// diagram modal, so unexpanding restores the exact pre-expand position
    /// instead of re-deriving it (which drifts when expanding had to clamp the
    /// larger window back on-screen). `i32::MIN` means "nothing saved".
    pub panel_collapsed_x: AtomicI32,
    pub panel_collapsed_y: AtomicI32,
    /// Click-through ("passthrough") setting: while on, the main window hides and
    /// passes clicks through when the cursor is over it (unless it's focused or
    /// the modifier is held).
    pub passthrough: AtomicBool,
    /// Whether the main window currently has focus.
    pub focused: AtomicBool,
    /// Whether passthrough is currently active (window hidden + click-through),
    /// so we only re-apply on change.
    pub passthrough_active: AtomicBool,
    /// Whether the passthrough poll loop is running.
    pub passthrough_polling: AtomicBool,
    /// Exclude the app's windows from screen capture / screen sharing (maps to
    /// `NSWindowSharingNone` on macOS and `WDA_EXCLUDEFROMCAPTURE` on Windows).
    /// Defaults on so the contents stay private during screen shares.
    pub content_protected: AtomicBool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
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
        }
    }
}

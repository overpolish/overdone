/*
 * SPDX-FileCopyrightText: 2026 overpolish
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

//! Platform-specific native window helpers (macOS / Windows), with no-op or
//! `None` fallbacks elsewhere. Keeps the cfg-gated FFI out of the cross-platform
//! command and windowing code.

/// Hide the macOS traffic-light buttons (close/minimize/zoom) on a window that
/// uses the transparent title bar style, leaving a borderless surface that still
/// keeps the native rounded corners and shadow.
#[cfg(target_os = "macos")]
pub fn hide_traffic_lights(window: &tauri::WebviewWindow) {
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

/// Whether our app is still the active (frontmost) application. Used to tell a
/// real focus loss (switching apps) from focus moving to a same-app system
/// input panel - the emoji & symbols viewer keeps the app active, so it must not
/// dismiss the popover panel. Clicking the main window is handled separately by
/// the main window's focus handler.
#[cfg(target_os = "macos")]
pub fn app_is_active() -> bool {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplication;

    let Some(mtm) = MainThreadMarker::new() else {
        return false;
    };
    NSApplication::sharedApplication(mtm).isActive()
}

/// Whether the cursor is over the window and whether the passthrough modifier is
/// held, in the platform's screen coordinates. `None` on platforms without an
/// implementation yet (passthrough then stays off).
#[cfg(target_os = "macos")]
pub fn passthrough_inputs(window: &tauri::WebviewWindow) -> Option<(bool, bool)> {
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
pub fn passthrough_inputs(window: &tauri::WebviewWindow) -> Option<(bool, bool)> {
    use tauri::Manager;

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

    // Live modifier state (Ctrl, matching macOS's Cmd) - a click-through window
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
pub fn passthrough_inputs(_window: &tauri::WebviewWindow) -> Option<(bool, bool)> {
    // Other platforms have no implementation yet, so passthrough stays off.
    None
}

/// Raise the floating `panel` one window level above the `main` window's current
/// level, so it reliably sits on top without either window's always-on-top level
/// being toggled. Tauri parks an always-on-top window at a fixed floating level,
/// so two such windows (main + panel) share a level and z-fight; stepping the
/// panel one above resolves that. Reading `main`'s live level (rather than a
/// constant) keeps the panel above it whether always-on-top is currently on or
/// off. No-op on platforms where same-app topmost windows already order by
/// activation.
#[cfg(target_os = "macos")]
pub fn raise_panel_above(panel: &tauri::WebviewWindow, main: &tauri::WebviewWindow) {
    use objc2_app_kit::NSWindow;

    let (Ok(panel_ptr), Ok(main_ptr)) = (panel.ns_window(), main.ns_window()) else {
        return;
    };
    let panel_ns = unsafe { &*(panel_ptr as *const NSWindow) };
    let main_ns = unsafe { &*(main_ptr as *const NSWindow) };
    panel_ns.setLevel(main_ns.level() + 1);
}

/// Windows analog: both windows are always-on-top, so they share the topmost
/// z-band and order only by activation - showing the panel doesn't reliably seat
/// it above the main window, so it can appear behind it. `set_focus` is an
/// unreliable way to raise a window on Windows, so force the order explicitly:
/// `SetWindowPos` with `HWND_TOPMOST` moves the panel to the top of the topmost
/// band (above main) regardless of activation, giving the same always-above-main
/// ordering as macOS. `SWP_NOACTIVATE` leaves focus handling to `set_focus`.
///
/// Note the insert-after semantics: a window is placed *below* its
/// `hwnd_insert_after` target, so passing `main`'s handle would seat the panel
/// behind it - hence `HWND_TOPMOST`, not `main`.
#[cfg(target_os = "windows")]
pub fn raise_panel_above(panel: &tauri::WebviewWindow, _main: &tauri::WebviewWindow) {
    use std::ffi::c_void;
    type Hwnd = *mut c_void;
    const HWND_TOPMOST: isize = -1;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOACTIVATE: u32 = 0x0010;
    #[link(name = "user32")]
    extern "system" {
        fn SetWindowPos(
            hwnd: Hwnd,
            hwnd_insert_after: Hwnd,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
    }

    let Ok(panel_hwnd) = panel.hwnd() else {
        return;
    };
    unsafe {
        SetWindowPos(
            panel_hwnd.0 as Hwnd,
            HWND_TOPMOST as Hwnd,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn raise_panel_above(_panel: &tauri::WebviewWindow, _main: &tauri::WebviewWindow) {}

#[cfg(target_os = "macos")]
pub fn set_window_alpha(window: &tauri::WebviewWindow, alpha: f64) {
    use objc2_app_kit::NSWindow;
    if let Ok(ns_ptr) = window.ns_window() {
        let ns_window = unsafe { &*(ns_ptr as *const NSWindow) };
        ns_window.setAlphaValue(alpha);
    }
}

#[cfg(target_os = "windows")]
pub fn set_window_alpha(window: &tauri::WebviewWindow, alpha: f64) {
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
pub fn set_window_alpha(_window: &tauri::WebviewWindow, _alpha: f64) {}

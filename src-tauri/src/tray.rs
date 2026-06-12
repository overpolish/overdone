use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

const TRAY_ID: &str = "main-tray";

/// Tray icon with a red badge, shown when the app wants attention.
const ALERT_ICON: &[u8] = include_bytes!("../icons/tray-alert.png");

/// The normal tray icon. macOS uses the black version as a monochrome template
/// (adapts to the menu-bar theme); other platforms use the white version for
/// the dark tray.
fn idle_icon_bytes() -> &'static [u8] {
    #[cfg(target_os = "macos")]
    {
        include_bytes!("../icons/tray-template.png")
    }
    #[cfg(not(target_os = "macos"))]
    {
        include_bytes!("../icons/tray-windows.png")
    }
}

/// Create the system tray icon.
///
/// - Left-click toggles the main window (show/hide).
/// - Right-click opens a menu with "Show" and "Quit".
pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Overdone", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Overdone", true, None::<&str>)?;
    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&quit)
        .build()?;

    TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Overdone")
        .icon(Image::from_bytes(idle_icon_bytes())?)
        .icon_as_template(cfg!(target_os = "macos"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Swap the tray icon between its normal and red-badge "alert" states.
pub fn set_alert<R: Runtime>(app: &AppHandle<R>, alert: bool) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    let bytes = if alert { ALERT_ICON } else { idle_icon_bytes() };
    if let Ok(icon) = Image::from_bytes(bytes) {
        let _ = tray.set_icon(Some(icon));
    }

    // The alert icon is colored (red dot), so it can't be a macOS template.
    #[cfg(target_os = "macos")]
    let _ = tray.set_icon_as_template(!alert);
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    // Un-hide the app if it was backgrounded via `app.hide()` (macOS).
    #[cfg(target_os = "macos")]
    let _ = app.show();

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_main_window(app);
        }
    }
}

// Tray icon + popover window + native notification glue.
//
// NOTE: written against the documented Tauri v2 API but not compiled in this
// environment (no Rust toolchain / no macOS here). Run `cargo check` first
// thing after copying this to your Mac -- Tauri's plugin APIs move fast
// enough that something may have shifted since this was written.

use std::sync::Mutex;
use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_notification::NotificationExt;

struct AppState {
    current_band: Mutex<String>,
}

/// Swaps the tray icon image between the three color states. Called from
/// the frontend whenever the day's junk ratio crosses a band boundary.
#[tauri::command]
fn set_tray_icon_state(app: tauri::AppHandle, band: String) -> Result<(), String> {
    let icon_path = match band.as_str() {
        "green" => "icons/tray-states/green.png",
        "amber" => "icons/tray-states/amber.png",
        "red" => "icons/tray-states/red.png",
        other => return Err(format!("unknown band: {other}")),
    };

    let icon = tauri::image::Image::from_path(icon_path).map_err(|e| e.to_string())?;

    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    }

    let state = app.state::<AppState>();
    *state.current_band.lock().unwrap() = band;

    Ok(())
}

/// Fires a native notification for the rolling-window nudge. Kept to plain
/// text for v1 -- see design notes on why actionable buttons are a v2 item.
#[tauri::command]
fn send_nudge_notification(app: tauri::AppHandle, message: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title("Dopamine tracker")
        .body(message)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_popover(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().map_err(|e| e.to_string())?;
        if visible {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
/// Opens the settings window, creating it on first call and just
/// focusing it on subsequent calls. Unlike the popover, this is a normal
/// decorated, resizable window -- editing 11 rate rows doesn't fit the
/// 320x420 popover shape.
#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App("index.html?settings".into()),
    )
    .title("Dopamine tracker settings")
    .inner_size(480.0, 520.0)
    .resizable(true)
    .decorations(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            current_band: Mutex::new("green".to_string()),
        })
        .setup(|app| {
            // Menu bar apps shouldn't show a Dock icon or app switcher entry.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let icon = tauri::image::Image::from_path("icons/tray-states/green.png")?;

            TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // macOS requires explicit opt-in before any notification can be
            // delivered -- ask once, on first launch.
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_notification::PermissionState;
                let handle = app.handle();
                if handle.notification().permission_state()? != PermissionState::Granted {
                    handle.notification().request_permission()?;
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_tray_icon_state,
            send_nudge_notification,
            open_settings_window,
            toggle_popover
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

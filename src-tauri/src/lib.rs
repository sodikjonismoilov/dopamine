// Tray icon + popover window + native notification glue.
//
// NOTE: written against the documented Tauri v2 API but not compiled in this
// environment (no Rust toolchain / no macOS here). Run `cargo check` first
// thing after copying this to your Mac -- Tauri's plugin APIs move fast
// enough that something may have shifted since this was written.

use std::process::Command;
use std::sync::Mutex;
use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_notification::NotificationExt;

struct AppState {
    current_band: Mutex<String>,
}

const KEYCHAIN_SERVICE: &str = "com.sodikjon.dopaminetracker";
const KEYCHAIN_ACCOUNT: &str = "google_api_key";

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
    .inner_size(540.0, 580.0)
    .resizable(true)
    .decorations(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())

}

// ---Keychain-backed API key storage.----------
// Delibrately shells out to the "security" CLI rather than pulling in a crate. 
// The 'keyring' crate just went through a breaking v2 -> v3 change and is actively being split  into a 
// separate 'keyring-core' crate as of this writing. exactly the kind of moving target that broke the tray incod code earlier,
// 'security' has been a stable part fo macOS for decades and needs no dependency at all. 

#[tauri::command]
fn read_api_key() -> Result<String, String> {
    let output = Command::new("security")
    .args([
        "find-generic-password",
        "-a",
        KEYCHAIN_ACCOUNT,
        "-s",
        KEYCHAIN_SERVICE,
        "-w"
    ])
    .output()
    .map_err(|e| format!("failed to run `security`: {e}"))?;

    if !output.status.success() {
        return Err("No API key saved yet -- add one in Settings".into());
    }

    Ok(String::from_utf8(output.stdout)
    .map_err(|e| e.to_string())?
    .trim()
    .to_string())

}

// ---- LLM fallback parsing --------------------------------------------
//
// Runs entirely in Rust so the API key never enters the webview's JS
// runtime -- if the fetch happened in JS after an `invoke('get_api_key')`
// round trip, the raw key would sit in memory inspectable via the
// webview's own devtools. This way it never leaves the Rust process.
//
// Uses Gemini rather than Claude, since the free tier doesn't need a
// credit card. Google's free-tier model lineup rotates fairly often --
// if MODEL below starts 404ing, check the current list at
// https://ai.google.dev/gemini-api/docs/models and swap it in.

#[derive(serde::Deserialize)]
struct LlmParseResult {
    #[serde(rename = "activityName")]
    activity_name: Option<String>,
    #[serde(rename = "durationMinutes")]
    duration_minutes: Option<f64>,
}

#[tauri::command]
async fn parse_with_llm_fallback(
    raw_text: String,
    category_names: Vec<String>,
) -> Result<serde_json::Value, String> {
    let api_key = read_api_key()?;

    let system_prompt = format!(
        "Extract an activity log from free text. Respond with ONLY raw JSON, no markdown \
         fences, matching this shape: {{\"activityName\": string | null, \"durationMinutes\": \
         number | null}}. activityName MUST be exactly one of: {}. If nothing matches, use \
         null. If no duration is stated or inferable, use null.",
        category_names.join(", ")
    );

    const MODEL: &str = "gemini-2.5-flash";
    let url =
        format!("https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent");

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        // Header form, not ?key=... in the URL -- keeps the key out of
        // server logs and any intermediary tooling that logs full URLs.
        .header("x-goog-api-key", api_key)
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "system_instruction": { "parts": [{ "text": system_prompt }] },
            "contents": [{ "role": "user", "parts": [{ "text": raw_text }] }],
            "generationConfig": {
                "maxOutputTokens": 200,
                // Forces raw JSON back, no markdown fences to strip.
                "responseMimeType": "application/json"
            }
        }))
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Gemini API returned {}", response.status()));
    }

    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    let text = body["candidates"]
        .as_array()
        .and_then(|c| c.first())
        .and_then(|c| c["content"]["parts"].as_array())
        .and_then(|parts| parts.first())
        .and_then(|p| p["text"].as_str())
        .ok_or("no text in Gemini response")?;

    let parsed: LlmParseResult =
        serde_json::from_str(text).map_err(|e| format!("model didn't return clean JSON: {e}"))?;

    Ok(serde_json::json!({
        "activityName": parsed.activity_name,
        "durationMinutes": parsed.duration_minutes,
    }))
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
            toggle_popover,
            read_api_key,
            parse_with_llm_fallback
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

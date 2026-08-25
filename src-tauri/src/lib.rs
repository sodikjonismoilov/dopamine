// Tray icon + popover window + native notification glue.
//
// NOTE: written against the documented Tauri v2 API but not compiled in this
// environment (no Rust toolchain / no macOS here). Run `cargo check` first
// thing after copying this to your Mac -- Tauri's plugin APIs move fast
// enough that something may have shifted since this was written.

use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{
    path::BaseDirectory,
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_notification::NotificationExt;

struct AppState {
    current_band: Mutex<String>,
    // Set whenever the popover auto-hides because it lost focus. The tray
    // click handler checks this to tell "user clicked the tray icon to
    // close the open popover" apart from "user clicked the tray icon to
    // open it" -- see the comment on the click handler below for why that
    // distinction needs an explicit flag instead of just `is_visible()`.
    last_blur_hide_at: Mutex<Option<Instant>>,
}

/// Positions the popover directly under the tray icon before showing it,
/// the way every other menu bar app does. Tauri doesn't do this on its
/// own -- left alone, the window just reappears wherever it happened to
/// be last (usually wherever macOS first placed it), which is why the
/// popover looked "wrong" compared to a real menu bar app.
fn position_popover_under_tray(window: &tauri::WebviewWindow, tray_rect: &tauri::Rect) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let tray_pos = tray_rect.position.to_physical::<f64>(scale);
    let tray_size = tray_rect.size.to_physical::<f64>(scale);
    let window_size = window
        .outer_size()
        .unwrap_or(tauri::PhysicalSize::new(320, 480));

    let x = tray_pos.x + tray_size.width / 2.0 - window_size.width as f64 / 2.0;
    let y = tray_pos.y + tray_size.height;

    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: x as i32,
        y: y as i32,
    }));
}

const KEYCHAIN_SERVICE: &str = "com.sodikjon.dopaminetracker";
const KEYCHAIN_ACCOUNT: &str = "google_api_key";

/// Resolves a tray icon's path against the app's bundled resource
/// directory instead of the process's current working directory.
///
/// `Image::from_path("icons/tray-states/green.png")` only worked by
/// accident during local `cargo run`/`tauri dev`, where the CWD happens
/// to be `src-tauri/`. A double-clicked, packaged app is launched by
/// Finder/launchd with an unrelated CWD (frequently `/`), so the bare
/// relative path resolves to nothing -- `Image::from_path` errors, the
/// `?` in `.setup()` propagates it, and Tauri panics during setup,
/// taking the whole process down before any window ever appears. See
/// the matching `"resources"` entry in tauri.conf.json that ships these
/// files inside the bundle so this resolves to something real.
fn tray_icon_path(app: &tauri::AppHandle, file_name: &str) -> tauri::Result<std::path::PathBuf> {
    app.path().resolve(
        format!("icons/tray-states/{file_name}"),
        BaseDirectory::Resource,
    )
}

/// Swaps the tray icon image between the three color states. Called from
/// the frontend whenever the day's junk ratio crosses a band boundary.
#[tauri::command]
fn set_tray_icon_state(app: tauri::AppHandle, band: String) -> Result<(), String> {
    let file_name = match band.as_str() {
        "green" => "green.png",
        "amber" => "amber.png",
        "red" => "red.png",
        other => return Err(format!("unknown band: {other}")),
    };

    let icon_path = tray_icon_path(&app, file_name).map_err(|e| e.to_string())?;
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

// ---- Keychain-backed API key storage --------------------------------
//
// Deliberately shells out to the `security` CLI rather than pulling in a
// crate. The `keyring` crate just went through a breaking v2 -> v3 change
// and is actively being split into a separate `keyring-core` crate as of
// this writing -- exactly the kind of moving target that broke the tray
// icon code earlier. `security` has been a stable part of macOS for
// decades and needs no dependency at all.

#[tauri::command]
fn save_api_key(key: String) -> Result<(), String> {
    // -U updates the item in place if it already exists, so re-saving a
    // replacement key doesn't fail with "the specified item already exists".
    let output = Command::new("security")
        .args([
            "add-generic-password",
            "-a",
            KEYCHAIN_ACCOUNT,
            "-s",
            KEYCHAIN_SERVICE,
            "-w",
            &key,
            "-U",
        ])
        .output()
        .map_err(|e| format!("failed to run `security`: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Keychain save failed: {}", stderr.trim()))
    }
}

#[tauri::command]
fn has_api_key() -> bool {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-a",
            KEYCHAIN_ACCOUNT,
            "-s",
            KEYCHAIN_SERVICE,
        ])
        .output();

    match output {
        Ok(out) => {
            if !out.status.success() {
                // Not surfaced to the UI (a missing key isn't an error state),
                // but printed here so it's visible in the `tauri dev` terminal
                // if something other than "just doesn't exist yet" is wrong.
                eprintln!(
                    "has_api_key: security find-generic-password failed: {}",
                    String::from_utf8_lossy(&out.stderr).trim()
                );
            }
            out.status.success()
        }
        Err(e) => {
            eprintln!("has_api_key: failed to run `security`: {e}");
            false
        }
    }
}

#[tauri::command]
fn delete_api_key() -> Result<(), String> {
    let output = Command::new("security")
        .args([
            "delete-generic-password",
            "-a",
            KEYCHAIN_ACCOUNT,
            "-s",
            KEYCHAIN_SERVICE,
        ])
        .output()
        .map_err(|e| format!("failed to run `security`: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Keychain delete failed: {}", stderr.trim()))
    }
}

/// Not exposed as a command -- internal helper for parse_with_llm_fallback.
/// Deliberately NOT #[tauri::command] -- exposing this would let any JS in
/// the webview call invoke('read_api_key') and get the raw key back in
/// plain text, which defeats the entire point of doing the fetch in Rust.
fn read_api_key() -> Result<String, String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-a",
            KEYCHAIN_ACCOUNT,
            "-s",
            KEYCHAIN_SERVICE,
            "-w",
        ])
        .output()
        .map_err(|e| format!("failed to run `security`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Couldn't read the API key from Keychain: {}",
            stderr.trim()
        ));
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
            last_blur_hide_at: Mutex::new(None),
        })
        .setup(|app| {
            // Menu bar apps shouldn't show a Dock icon or app switcher entry.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let icon = tauri::image::Image::from_path(tray_icon_path(app.handle(), "green.png")?)?;

            TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { rect, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let state = app.state::<AppState>();

                            // Clicking the tray icon while the popover is
                            // open blurs the popover *before* this click
                            // event reaches us -- the WindowEvent::Focused
                            // (false) handler below fires first and hides
                            // it. If we only checked `is_visible()` here
                            // we'd see "already hidden" and immediately
                            // reopen it, so clicking the icon to close the
                            // popover would look like it did nothing. A
                            // short-lived flag set by that blur handler
                            // lets us recognize "this click is the one
                            // that just closed it" and skip reopening.
                            let just_closed_by_this_click = state
                                .last_blur_hide_at
                                .lock()
                                .unwrap()
                                .take()
                                .is_some_and(|t| t.elapsed() < Duration::from_millis(250));

                            if just_closed_by_this_click {
                                return;
                            }

                            let currently_visible = window.is_visible().unwrap_or(false);
                            if currently_visible {
                                let _ = window.hide();
                            } else {
                                position_popover_under_tray(&window, &rect);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Auto-hide the popover when it loses focus -- clicking
            // anywhere outside it should close it, same as every other
            // menu bar app. Without this, the only way to close it was
            // the (also broken, now fixed) tray click toggle above.
            if let Some(window) = app.get_webview_window("main") {
                let window_for_blur = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let state = window_for_blur.state::<AppState>();
                        *state.last_blur_hide_at.lock().unwrap() = Some(Instant::now());
                        let _ = window_for_blur.hide();
                    }
                });
            }

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
            toggle_popover,
            open_settings_window,
            save_api_key,
            has_api_key,
            delete_api_key,
            parse_with_llm_fallback
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
//! App self-update logic.
//!
//! Two flows:
//!   - Desktop (Windows/macOS/Linux): the official `tauri-plugin-updater` handles download +
//!     signature verification + installer launch. The frontend calls it directly via
//!     `@tauri-apps/plugin-updater`; this module only does the version check.
//!   - Android: the official plugin has no APK backend, so we download the APK ourselves
//!     (`download_and_install_apk`) and hand it to the system installer via a JNI bridge.
//!
//! Version checking is shared across platforms: fetch `latest.json` from CDN, semver-compare
//! against the running version, return the result (with the right per-platform download URL).

use semver::Version;
use serde::Serialize;
use tauri::AppHandle;

/// CDN-hosted manifest describing the newest release. Committed to the repo at `update/latest.json`
/// and served via jsDelivr (+ raw.githubusercontent fallback).
///
/// Format matches what `tauri-plugin-updater` expects on the wire: `url` + `signature` at
/// top level (NOT nested under `platforms.<target>`), so the same file works for both the
/// plugin's own check and our custom `check_for_updates` command.
#[derive(Debug, serde::Deserialize)]
struct LatestManifest {
    version: String,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    pub_date: Option<String>,
    /// Download URL for this platform's installer.
    #[serde(default)]
    url: Option<String>,
    /// Minisign/ed25519 signature for verifying the installer.
    #[serde(default)]
    signature: Option<String>,
}

/// Result returned to the frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub has_update: bool,
    /// The latest version available (e.g. "0.3.0"), or null if the check failed.
    pub latest_version: Option<String>,
    /// The currently running version.
    pub current_version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    /// The download URL for the current platform's installer/APK.
    pub download_url: Option<String>,
    /// The updater signature (Windows only; the frontend passes it to the updater plugin).
    pub signature: Option<String>,
    pub is_mobile: bool,
    /// Friendly error message if the check itself failed (network/parse). null on success.
    pub error: Option<String>,
}

/// Endpoints we try, in order. jsDelivr first (CDN-cached, fast in CN), raw.githubusercontent as
/// a fallback when jsDelivr has a hiccup. Both point at the same committed `latest.json`.
const MANIFEST_URLS: [&str; 3] = [
    "https://cdn.jsdelivr.net/gh/mikuYongh/Eishougi@master/update/latest.json",
    "https://raw.githubusercontent.com/mikuYongh/Eishougi/master/update/latest.json",
    "https://ghfast.top/https://raw.githubusercontent.com/mikuYongh/Eishougi/master/update/latest.json",
];



/// Fetch the manifest, trying each CDN URL until one works.
async fn fetch_manifest() -> Result<LatestManifest, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let mut last_err = "no endpoints tried".to_string();
    for &url in MANIFEST_URLS.iter() {
        match client.get(url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<LatestManifest>().await {
                    Ok(m) if !m.version.is_empty() => return Ok(m),
                    Ok(_) => last_err = "manifest has empty version".to_string(),
                    Err(e) => last_err = format!("parse failed: {}", e),
                }
            }
            Ok(resp) => last_err = format!("HTTP {}", resp.status()),
            Err(e) => last_err = format!("network: {}", e),
        }
    }
    Err(last_err)
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();
    let is_mobile = cfg!(target_os = "android");

    let manifest = match fetch_manifest().await {
        Ok(m) => m,
        Err(e) => {
            return Ok(UpdateInfo {
                has_update: false,
                latest_version: None,
                current_version,
                notes: None,
                pub_date: None,
                download_url: None,
                signature: None,
                is_mobile,
                error: Some(e),
            });
        }
    };

    // semver compare. If the latest manifest version can't be parsed, treat as "no update"
    // rather than erroring — we don't want a malformed manifest to nag the user.
    let has_update = {
        let cur = Version::parse(&current_version).ok();
        let lat = Version::parse(&manifest.version).ok();
        match (cur, lat) {
            (Some(c), Some(l)) => l > c,
            _ => false,
        }
    };

    // Pick this platform's asset (download URL + signature).
    // Since latest.json now uses the flat tauri-plugin-updater format,
    // url / signature are at the top level (not nested under platforms.<target>).
    let download_url = manifest.url;
    let signature = manifest.signature;

    Ok(UpdateInfo {
        has_update,
        latest_version: Some(manifest.version),
        current_version,
        notes: manifest.notes,
        pub_date: manifest.pub_date,
        download_url,
        signature,
        is_mobile,
        error: None,
    })
}

/// Android-only: download an APK from `url` into the app's files dir, then trigger the system
/// installer via the JNI bridge. On desktop this returns an error (desktop uses the updater plugin).
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn download_and_install_apk(app: AppHandle, url: String) -> Result<(), String> {
    use tauri::Manager;

    // Download to app_data_dir (always writable on Android, no storage perms needed).
    let app_state = app
        .try_state::<crate::AppState>()
        .ok_or("AppState unavailable")?;
    let dir = app_state.app_data_dir.join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let apk_path = dir.join(format!("eishougi_update_{}.apk", chrono::Utc::now().timestamp_millis()));

    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("download failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("download HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("read body failed: {}", e))?;
    std::fs::write(&apk_path, &bytes).map_err(|e| format!("write failed: {}", e))?;

    // Hand the file to the system installer via the Kotlin bridge.
    crate::jvm_plugin::install_apk(&apk_path.to_string_lossy())
}

/// Desktop stub: not used (desktop goes through @tauri-apps/plugin-updater directly).
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn download_and_install_apk(_app: AppHandle, _url: String) -> Result<(), String> {
    Err("download_and_install_apk is Android-only; desktop uses the updater plugin.".to_string())
}

mod commands;
mod db;
mod comfy_ws;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

use db::connection::Database;

pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub app_data_dir: PathBuf,
}

impl AppState {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        let db = Database::open(&app_data_dir).map_err(|e| format!("数据库初始化失败: {}", e))?;
        Ok(Self {
            db: Arc::new(Mutex::new(db)),
            app_data_dir,
        })
    }
}

#[cfg(target_os = "android")]
pub mod jvm_plugin {
    pub static mut JVM: Option<jni::JavaVM> = None;
    pub static mut MAIN_ACTIVITY_CLASS: Option<jni::objects::GlobalRef> = None;
    pub static mut MAIN_CONTEXT: Option<jni::objects::GlobalRef> = None;

    pub fn save_image_to_gallery(source_path: &str, file_name: &str) -> Result<String, String> {
        unsafe {
            if let Some(vm) = &JVM {
                let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
                if let Some(class) = &MAIN_ACTIVITY_CLASS {
                    let source_path_j = env.new_string(source_path).map_err(|e| e.to_string())?;
                    let file_name_j = env.new_string(file_name).map_err(|e| e.to_string())?;
                    let result = env
                        .call_static_method(
                            class,
                            "saveImageToGallery",
                            "(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;",
                            &[
                                jni::objects::JValue::from(&source_path_j),
                                jni::objects::JValue::from(&file_name_j),
                            ],
                        )
                        .map_err(|e| e.to_string())?;

                    let res_string = result.l().unwrap();
                    let rust_string: String = env.get_string((&res_string).into()).unwrap().into();
                    return Ok(rust_string);
                }
                return Err("MAIN_ACTIVITY_CLASS not initialized".to_string());
            }
            Err("JVM not initialized".to_string())
        }
    }

    /// Reads a packaged asset file (from src/main/assets/) as a UTF-8 string.
    ///
    /// Uses our saved JavaVM and Activity instance (from `storeActivityInstance`)
    /// to call `context.getAssets().open(name)` via JNI — standard Android APIs.
    /// We avoid `ndk_context` here because it is not reliably initialised by the
    /// time the Tauri setup hook fires on some device / Android versions.
    pub fn read_asset_to_string(name: &str) -> Option<String> {
        let vm = unsafe { crate::jvm_plugin::JVM.as_ref()? };
        let mut env = vm.attach_current_thread().ok()?;
        let _ = env.exception_clear();
        let context_obj: &jni::objects::JObject =
            unsafe { crate::jvm_plugin::MAIN_CONTEXT.as_ref()? }.as_ref();

        // context.getAssets() -> AssetManager
        let asset_manager = env
            .call_method(context_obj, "getAssets", "()Landroid/content/res/AssetManager;", &[])
            .ok()?.l().ok()?;

        // assetManager.open(name) -> InputStream
        let jname = env.new_string(name).ok()?;
        let input_stream = env
            .call_method(&asset_manager, "open", "(Ljava/lang/String;)Ljava/io/InputStream;",
                &[jni::objects::JValue::from(&jname)])
            .ok()?.l().ok()?;
        if input_stream.is_null() { return None; }

        let baos_class = env.find_class("java/io/ByteArrayOutputStream").ok()?;
        let baos = env.new_object(&baos_class, "()V", &[]).ok()?;
        let buf = env.new_byte_array(8192).ok()?;
        loop {
            let n = env.call_method(&input_stream, "read", "([B)I",
                &[jni::objects::JValue::from(&buf)]).ok()?.i().ok()?;
            if n < 0 { break; }
            env.call_method(&baos, "write", "([BII)V",
                &[jni::objects::JValue::from(&buf), jni::objects::JValue::Int(0), jni::objects::JValue::Int(n)])
                .ok()?;
        }
        let bytes = env.call_method(&baos, "toByteArray", "()[B", &[]).ok()?.l().ok()?;
        let bytes_array: jni::objects::JByteArray = bytes.into();
        let len = env.get_array_length(&bytes_array).ok()?;
        let mut data = vec![0i8; len as usize];
        env.get_byte_array_region(&bytes_array, 0, &mut data).ok()?;
        let _ = env.call_method(&input_stream, "close", "()V", &[]);
        let data: Vec<u8> = data.into_iter().map(|b| b as u8).collect();
        String::from_utf8(data).ok().filter(|s| !s.is_empty())
    }

    /// Backup the SQLite database file to app-specific external storage
    /// (`/sdcard/Android/data/com.promptmuse.app/files/backups/`). This
    /// survives `pm clear` and app data resets because it lives outside
    /// `/data/data/`. Keeps the last 7 backups and prunes older ones.
    pub fn backup_database(db_path: &std::path::Path) {
        let vm = match unsafe { crate::jvm_plugin::JVM.as_ref() } {
            Some(v) => v,
            None => return,
        };
        let mut env = match vm.attach_current_thread() {
            Ok(e) => e,
            Err(_) => return,
        };
        let _ = env.exception_clear();
        let context_obj: &jni::objects::JObject =
            match unsafe { crate::jvm_plugin::MAIN_CONTEXT.as_ref() } {
                Some(c) => c.as_ref(),
                None => return,
            };

        // context.getExternalFilesDir(null) -> File? (app-specific external dir)
        let external_dir = match env.call_method(
            context_obj,
            "getExternalFilesDir",
            "(Ljava/lang/String;)Ljava/io/File;",
            &[jni::objects::JValue::Object(&jni::objects::JObject::null())],
        ) {
            Ok(v) => match v.l() { Ok(f) => f, Err(_) => return },
            Err(_) => return,
        };
        if external_dir.is_null() { return; }

        // file.getAbsolutePath() -> String
        let path_obj = match env.call_method(
            &external_dir, "getAbsolutePath", "()Ljava/lang/String;", &[],
        ) {
            Ok(v) => match v.l() { Ok(p) => p, Err(_) => return },
            Err(_) => return,
        };
        if path_obj.is_null() { return; }

        let backup_root: String = match env.get_string(&jni::objects::JString::from(path_obj)) {
            Ok(s) => s.into(),
            Err(_) => return,
        };

        let backup_dir = std::path::Path::new(&backup_root).join("backups");
        if std::fs::create_dir_all(&backup_dir).is_err() {
            return;
        }

        // Copy DB with epoch-seconds timestamp.
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let backup_file = backup_dir.join(format!("prompt-muse-{ts}.db"));
        if backup_file.exists() {
            return; // Already backed up this second.
        }
        if std::fs::copy(db_path, &backup_file).is_err() {
            return;
        }

        // Prune old backups: keep the 7 most recent.
        let mut entries: Vec<_> = match std::fs::read_dir(&backup_dir) {
            Ok(e) => e.filter_map(|e| e.ok()).filter(|e| {
                e.file_name().to_string_lossy().starts_with("prompt-muse-")
            }).collect(),
            Err(_) => return,
        };
        entries.sort_by_key(|e| std::cmp::Reverse(e.file_name()));
        for old in entries.into_iter().skip(7) {
            let _ = std::fs::remove_file(old.path());
        }
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn Java_com_promptmuse_app_MainActivity_initJvmContext(
    env: jni::JNIEnv,
    class: jni::objects::JClass,
) {
    if let Ok(vm) = env.get_java_vm() {
        unsafe {
            crate::jvm_plugin::JVM = Some(vm);
            if let Ok(global_ref) = env.new_global_ref(class) {
                crate::jvm_plugin::MAIN_ACTIVITY_CLASS = Some(global_ref);
            }
        }
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_promptmuse_app_MainActivity_storeActivityInstance(
    env: jni::JNIEnv,
    _class: jni::objects::JClass,
    activity: jni::objects::JObject,
) {
    // Store a GlobalRef to the Activity instance so we can use it
    // later to read APK assets (via context.getAssets()) without
    // relying on ndk_context which might not be initialized yet.
    if let Ok(global_ref) = env.new_global_ref(activity) {
        unsafe {
            crate::jvm_plugin::MAIN_CONTEXT = Some(global_ref);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install a panic hook that forwards the panic message to Android logcat
    // (tag: "RustPanic"). Without this, Rust panics on Android write to stderr
    // which goes to /dev/null, making debugging impossible.
    #[cfg(target_os = "android")]
    {
        unsafe extern "C" {
            fn __android_log_write(prio: i32, tag: *const u8, text: *const u8) -> i32;
        }
        let default_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            let location = info
                .location()
                .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
                .unwrap_or_else(|| "<unknown>".to_string());
            let payload = info
                .payload()
                .downcast_ref::<&str>()
                .copied()
                .or_else(|| info.payload().downcast_ref::<String>().map(|s| s.as_str()))
                .unwrap_or("<non-string panic payload>");
            let tag = b"RustPanic\0";
            let text_c = std::ffi::CString::new(format!(
                "RUST PANIC at {}\nmsg: {}",
                location, payload,
            )).unwrap_or_default();
            unsafe { __android_log_write(6, tag.as_ptr(), text_c.as_ptr() as *const u8) };
            default_hook(info);
        }));
    }

    let app_data_dir = get_app_data_dir();
    std::fs::create_dir_all(&app_data_dir).ok();
    let state = AppState::new(app_data_dir.clone()).expect("Failed to initialize app state");

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init());

    let app = builder
        .manage(state)
        .manage(comfy_ws::ComfyState::new())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::prompts::create_prompt,
            commands::prompts::get_prompt,
            commands::prompts::update_prompt,
            commands::prompts::delete_prompt,
            commands::prompts::list_prompts,
            commands::workflows::create_workflow,
            commands::workflows::get_workflow,
            commands::workflows::update_workflow,
            commands::workflows::delete_workflow,
            commands::workflows::list_workflows,
            commands::workflows::set_default_workflow,
            commands::history::save_generated_image,
            commands::history::get_generated_image,
            commands::history::list_generated_images,
            commands::history::delete_generated_image,
            commands::history::toggle_save_image,
            commands::files::save_base64_image,
            commands::files::save_base64_file,
            commands::files::read_image_base64,
            commands::files::read_text_file,
            commands::files::write_bytes_to_file,
            commands::files::read_file_as_bytes,
            commands::favorites::get_favorite_prompts,
            commands::favorites::add_favorite_prompt,
            commands::images::download_comfyui_image,
            commands::images::export_image_to_downloads,
            commands::favorites::delete_favorite_prompt,
            commands::styles::get_custom_styles,
            commands::styles::add_custom_style,
            commands::styles::delete_custom_style,
            commands::mcp::list_mcp_tools,
            commands::mcp::call_mcp_tool,
            commands::data::export_all_data,
            commands::data::import_all_data,
            commands::library::search_characters,
            commands::library::search_artists,
            commands::library::toggle_favorite_character,
            commands::library::toggle_favorite_artist,
            comfy_ws::queue_prompt_and_track,
        ])
        .setup(|app| {
            // Initialize library data (characters / artists) AFTER Tauri runtime
            // is ready. On Android this is critical: reading APK assets requires
            // the JNI/ndk_context that Tauri registers during startup.
            let state = app.state::<AppState>();
            let db = state.db.blocking_lock();
            if let Err(e) = db::init::init_library_data(&db.conn, &state.app_data_dir) {
                log::warn!("Failed to initialize library data: {}", e);
            }
            drop(db);
            // Auto-backup DB to external storage (survives pm clear).
            #[cfg(target_os = "android")]
            crate::jvm_plugin::backup_database(&state.app_data_dir.join("prompt-muse.db"));
            Ok(())
        });

    #[cfg(target_os = "android")]
    {
        // The outer stop_unwind (from tauri's mobile_entry_point) will abort
        // on any panic, obscuring the real error. Catch panics here so we log
        // them before they reach stop_unwind.
        use std::panic::{catch_unwind, AssertUnwindSafe};
        let result = catch_unwind(AssertUnwindSafe(|| {
            app.run(tauri::generate_context!())
        }));
        if let Err(e) = &result {
            // Try to log the panic payload. We've already installed a panic
            // hook that writes to logcat, so this is a second chance to
            // capture the message before the thread exits.
            let msg = if let Some(s) = e.downcast_ref::<&str>() {
                format!("app.run() panicked: {}", s)
            } else if let Some(s) = e.downcast_ref::<String>() {
                format!("app.run() panicked: {}", s)
            } else {
                "app.run() panicked (non-string payload)".to_string()
            };
            let _ = std::fs::write(
                "/data/data/com.promptmuse.app/files/panic_log.txt",
                &msg,
            );
        }
        // Ignore the result to avoid re-panicking into the outer stop_unwind.
        let _ = result;
    }
    #[cfg(not(target_os = "android"))]
    {
        app.run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}
fn get_app_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let mut dir = std::env::var("APPDATA")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        dir.push("prompt-muse");
        dir
    }
    #[cfg(target_os = "macos")]
    {
        let mut dir = std::env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join("Library/Application Support"))
            .unwrap_or_else(|| PathBuf::from("."));
        dir.push("prompt-muse");
        dir
    }
    #[cfg(target_os = "linux")]
    {
        let mut dir = std::env::var("XDG_DATA_HOME")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var("HOME")
                    .ok()
                    .map(|h| PathBuf::from(h).join(".local/share"))
            })
            .unwrap_or_else(|| PathBuf::from("."));
        dir.push("prompt-muse");
        dir
    }
    #[cfg(target_os = "android")]
    {
        PathBuf::from("/data/data/com.promptmuse.app/files")
    }
}


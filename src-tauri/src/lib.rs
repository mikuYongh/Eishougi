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
    /// This uses `ndk_context` to obtain the native Activity instance, then
    /// invokes `Activity.getAssets().open(name)` via JNI — standard Android
    /// Context APIs that are always present, so we do NOT need to add a custom
    /// Kotlin method (which previously caused `NoSuchMethodError` because the
    /// Gradle build sometimes fails to recompile Kotlin sources).
    ///
    /// Returns None if JVM is not ready, the asset is missing, or any JNI call fails.
    pub fn read_asset_to_string(name: &str) -> Option<String> {
        // ndk_context gives us the JNI Environment + the global Activity reference
        // that Tauri registers at startup.
        let context = ndk_context::android_context();
        let vm = context.vm()?;
        let mut env = vm.attach_current_thread().ok()?;
        let activity_obj = context.activity()?;

        // activity.getAssets() -> AssetManager
        let asset_manager = env
            .call_method(
                activity_obj,
                "getAssets",
                "()Landroid/content/res/AssetManager;",
                &[],
            )
            .ok()?
            .l()
            .ok()?;

        // assetManager.open(name) -> InputStream
        let jname = env.new_string(name).ok()?;
        let input_stream = env
            .call_method(
                &asset_manager,
                "open",
                "(Ljava/lang/String;)Ljava/io/InputStream;",
                &[jni::objects::JValue::from(&jname)],
            )
            .ok()?
            .l()
            .ok()?;

        if input_stream.is_null() {
            return None;
        }

        // Read all bytes via a ByteArrayOutputStream.
        let baos_class = env.find_class("java/io/ByteArrayOutputStream").ok()?;
        let baos = env.new_object(&baos_class, "()V", &[]).ok()?;

        let buf = env.new_byte_array(8192).ok()?;
        loop {
            let n = env
                .call_method(
                    &input_stream,
                    "read",
                    "([B)I",
                    &[jni::objects::JValue::from(&buf)],
                )
                .ok()?
                .i()
                .ok()?;
            if n < 0 {
                break;
            }
            env.call_method(
                &baos,
                "write",
                "([BII)V",
                &[
                    jni::objects::JValue::from(&buf),
                    jni::objects::JValue::Int(0),
                    jni::objects::JValue::Int(n),
                ],
            )
            .ok()?;
        }

        let bytes = env
            .call_method(&baos, "toByteArray", "()[B", &[])
            .ok()?
            .l()
            .ok()?;
        let bytes_array: jni::objects::JByteArray = bytes.into();
        let len = env.get_array_length(&bytes_array).ok()?;
        let mut data = vec![0i8; len as usize];
        env.get_byte_array_region(&bytes_array, 0, &mut data).ok()?;

        // Close the input stream to release the asset handle.
        let _ = env.call_method(&input_stream, "close", "()V", &[]);

        // Convert i8 bytes to u8; JSON is ASCII-safe so this is lossless.
        let data: Vec<u8> = data.into_iter().map(|b| b as u8).collect();
        String::from_utf8(data).ok().filter(|s| !s.is_empty())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_data_dir = get_app_data_dir();
    std::fs::create_dir_all(&app_data_dir).ok();
    let state = AppState::new(app_data_dir).expect("Failed to initialize app state");

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init());

    builder
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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

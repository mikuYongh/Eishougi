use rusqlite::{Connection, Result};
use std::path::Path;

pub struct Database {
    pub conn: Connection,
}

impl Database {
    pub fn open(app_data_dir: &Path) -> Result<Self> {
        let db_path = app_data_dir.join("prompt-muse.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        super::migrations::run(&conn)?;
        // NOTE: library data init is deferred to the Tauri setup hook because
        // on Android, reading APK assets requires the JNI/ndk_context which is
        // only available after Tauri runtime starts. See lib.rs setup().
        Ok(Self { conn })
    }
}

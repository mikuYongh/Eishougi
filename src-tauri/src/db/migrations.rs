use rusqlite::{Connection, Result};

pub fn run(conn: &Connection) -> Result<()> {
    let version: i32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;

    let migrations: Vec<(&str, i32)> = vec![
        (MIGRATION_V1, 1),
        (MIGRATION_V2, 2),
        (MIGRATION_V3, 3),
        (MIGRATION_V4, 4),
    ];

    for (sql, ver) in migrations {
        if ver > version {
            conn.execute_batch(sql)?;
            conn.pragma_update(None, "user_version", ver)?;
        }
    }

    Ok(())
}

const MIGRATION_V3: &str = r#"
ALTER TABLE prompts ADD COLUMN workflow_id TEXT;
"#;

const MIGRATION_V1: &str = r#"
CREATE TABLE IF NOT EXISTS prompts (
    id              TEXT PRIMARY KEY NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    positive_prompt TEXT NOT NULL DEFAULT '',
    negative_prompt TEXT NOT NULL DEFAULT '(worst quality:1.5, low quality:1.5, bad anatomy, bad hands, extra fingers, missing fingers, deformed, blurry, watermark, text, signature, nsfw)',
    artist_prompt   TEXT NOT NULL DEFAULT '',
    seed            TEXT NOT NULL DEFAULT '-1',
    width           INTEGER NOT NULL DEFAULT 896,
    height          INTEGER NOT NULL DEFAULT 1088,
    steps           INTEGER NOT NULL DEFAULT 20,
    cfg_scale       REAL    NOT NULL DEFAULT 5.5,
    sampler_name    TEXT NOT NULL DEFAULT 'euler',
    scheduler       TEXT NOT NULL DEFAULT 'normal',
    base_model      TEXT,
    lora_configs    TEXT,
    vae_model       TEXT,
    is_favorite     INTEGER NOT NULL DEFAULT 0,
    is_pinned       INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    deleted_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_prompts_created ON prompts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_fav ON prompts(is_favorite);
CREATE INDEX IF NOT EXISTS idx_prompts_pinned ON prompts(is_pinned);

CREATE TABLE IF NOT EXISTS tags (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL UNIQUE,
    color      TEXT NOT NULL DEFAULT '#B388FF',
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

CREATE TABLE IF NOT EXISTS prompt_tag_cross (
    prompt_id TEXT NOT NULL,
    tag_id    TEXT NOT NULL,
    PRIMARY KEY (prompt_id, tag_id),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id)    REFERENCES tags(id)     ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prompt_images (
    id         TEXT PRIMARY KEY NOT NULL,
    prompt_id  TEXT NOT NULL,
    file_path  TEXT NOT NULL,
    file_name  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflows (
    id                TEXT PRIMARY KEY NOT NULL,
    name              TEXT NOT NULL DEFAULT '',
    description       TEXT NOT NULL DEFAULT '',
    json_content      TEXT NOT NULL,
    parameter_mapping TEXT DEFAULT '{}',
    type              TEXT NOT NULL DEFAULT 'text2img',
    is_default        INTEGER NOT NULL DEFAULT 0,
    is_builtin        INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS generated_images (
    id          TEXT PRIMARY KEY NOT NULL,
    prompt_id   TEXT,
    workflow_id TEXT,
    seed        TEXT,
    output_path TEXT NOT NULL,
    output_type TEXT NOT NULL DEFAULT 'image',
    status      TEXT NOT NULL DEFAULT 'completed',
    error_msg   TEXT,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (prompt_id)   REFERENCES prompts(id)   ON DELETE SET NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_gen_images_created ON generated_images(created_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY NOT NULL,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL,
    content     TEXT,
    tool_calls  TEXT,
    tool_result TEXT,
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at);
"#;

const MIGRATION_V2: &str = r#"
ALTER TABLE prompts ADD COLUMN resolution TEXT;

CREATE TABLE IF NOT EXISTS favorite_prompts (
    id         TEXT PRIMARY KEY NOT NULL,
    content    TEXT NOT NULL,
    type       TEXT NOT NULL, -- 'positive' | 'negative'
    label      TEXT,          -- optional description/remark
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_styles (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL,
    trigger    TEXT NOT NULL,
    category   TEXT NOT NULL DEFAULT '自定义',
    preview    TEXT,
    created_at INTEGER NOT NULL
);
"#;

const MIGRATION_V4: &str = r#"
CREATE TABLE IF NOT EXISTS characters (
    id             TEXT PRIMARY KEY NOT NULL,
    character_tag  TEXT NOT NULL,
    name_en        TEXT NOT NULL,
    name_zh        TEXT,
    copyright      TEXT,
    "trigger"      TEXT NOT NULL,
    core_tags      TEXT,
    "count"        INTEGER NOT NULL DEFAULT 0,
    img_url        TEXT,
    is_favorite    INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_characters_count ON characters("count" DESC);
CREATE INDEX IF NOT EXISTS idx_characters_fav ON characters(is_favorite);

CREATE TABLE IF NOT EXISTS artists (
    id             TEXT PRIMARY KEY NOT NULL,
    artist_tag     TEXT NOT NULL,
    name_en        TEXT NOT NULL,
    name_zh        TEXT,
    "trigger"      TEXT NOT NULL,
    "count"        INTEGER NOT NULL DEFAULT 0,
    img_url        TEXT,
    is_favorite    INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artists_count ON artists("count" DESC);
CREATE INDEX IF NOT EXISTS idx_artists_fav ON artists(is_favorite);

"#;

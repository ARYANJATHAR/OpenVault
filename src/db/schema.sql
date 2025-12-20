-- Vault Password Manager Database Schema
-- Uses SQLCipher for page-level encryption
-- Individual sensitive fields also encrypted at application level

-- Vault metadata (stores encryption parameters)
CREATE TABLE IF NOT EXISTS vault_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL DEFAULT 1,
    salt BLOB NOT NULL,
    key_hash BLOB NOT NULL,
    argon2_mem_cost INTEGER NOT NULL DEFAULT 65536,
    argon2_time_cost INTEGER NOT NULL DEFAULT 3,
    argon2_parallelism INTEGER NOT NULL DEFAULT 4,
    created_at INTEGER NOT NULL,
    last_modified INTEGER NOT NULL,
    last_unlocked INTEGER
);

-- Password entries
CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    title_encrypted TEXT NOT NULL,
    username_encrypted TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    url TEXT,
    notes_encrypted TEXT,
    totp_secret_encrypted TEXT,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    last_used_at INTEGER,
    sync_version INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER
);

-- Folders for organization
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name_encrypted TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    sync_version INTEGER NOT NULL DEFAULT 0
);

-- Sync log for conflict resolution
CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    sync_version INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    synced_at INTEGER
);

-- Device registry for LAN sync
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    public_key BLOB NOT NULL,
    last_seen INTEGER NOT NULL,
    last_sync INTEGER,
    is_trusted INTEGER NOT NULL DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_entries_url ON entries(url);
CREATE INDEX IF NOT EXISTS idx_entries_folder ON entries(folder_id);
CREATE INDEX IF NOT EXISTS idx_entries_modified ON entries(modified_at);
CREATE INDEX IF NOT EXISTS idx_entries_deleted ON entries(is_deleted);
CREATE INDEX IF NOT EXISTS idx_sync_log_entry ON sync_log(entry_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp ON sync_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

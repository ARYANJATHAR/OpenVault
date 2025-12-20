"use strict";
/**
 * Database Module
 *
 * Manages SQLite database with encryption for the password vault.
 * Uses better-sqlite3 for synchronous, high-performance database operations.
 *
 * Note: For production, this should use SQLCipher for page-level encryption.
 * This implementation uses application-level encryption as a fallback.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vaultDb = exports.VaultDatabase = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const crypto_1 = require("../core/crypto");
// ============================================================================
// Database Class
// ============================================================================
class VaultDatabase {
    db = null;
    dbPath = null;
    encryptionKey = null;
    /**
     * Create a new vault database
     */
    create(vaultPath, header, masterKey) {
        this.dbPath = vaultPath;
        this.encryptionKey = masterKey;
        // Create database directory if needed
        const dir = path.dirname(vaultPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Initialize database
        this.db = new better_sqlite3_1.default(vaultPath);
        // Enable WAL mode for better performance
        this.db.pragma('journal_mode = WAL');
        // Create tables
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            this.db.exec(schema);
        }
        else {
            // Inline schema for bundled builds
            this.createTables();
        }
        // Store vault metadata
        const keyHash = (0, crypto_1.hashMasterKey)(masterKey);
        const now = Date.now();
        const stmt = this.db.prepare(`
      INSERT INTO vault_meta (
        id, version, salt, key_hash,
        argon2_mem_cost, argon2_time_cost, argon2_parallelism,
        created_at, last_modified
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(header.version, header.salt, keyHash, header.memoryCost, header.timeCost, header.parallelism, now, now);
    }
    /**
     * Open an existing vault database
     */
    open(vaultPath) {
        if (!fs.existsSync(vaultPath)) {
            throw new Error(`Vault not found: ${vaultPath}`);
        }
        this.dbPath = vaultPath;
        this.db = new better_sqlite3_1.default(vaultPath);
        // Read vault metadata
        const meta = this.db.prepare('SELECT * FROM vault_meta WHERE id = 1').get();
        if (!meta) {
            throw new Error('Invalid vault file: missing metadata');
        }
        return meta;
    }
    /**
     * Set encryption key after password verification
     */
    setEncryptionKey(key) {
        this.encryptionKey = key;
        // Update last unlocked timestamp
        if (this.db) {
            this.db.prepare('UPDATE vault_meta SET last_unlocked = ? WHERE id = 1')
                .run(Date.now());
        }
    }
    /**
     * Close the database
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        this.encryptionKey = null;
    }
    /**
     * Check if database is open and unlocked
     */
    isUnlocked() {
        return this.db !== null && this.encryptionKey !== null;
    }
    // ==========================================================================
    // Entry Operations
    // ==========================================================================
    /**
     * Add a new entry
     */
    addEntry(entry) {
        this.ensureUnlocked();
        const id = (0, uuid_1.v4)();
        const now = Date.now();
        const key = this.encryptionKey;
        const stmt = this.db.prepare(`
      INSERT INTO entries (
        id, title_encrypted, username_encrypted, password_encrypted,
        url, notes_encrypted, totp_secret_encrypted, folder_id,
        created_at, modified_at, sync_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
        stmt.run(id, (0, crypto_1.encryptToString)(entry.title, key), (0, crypto_1.encryptToString)(entry.username, key), (0, crypto_1.encryptToString)(entry.password, key), entry.url || null, entry.notes ? (0, crypto_1.encryptToString)(entry.notes, key) : null, entry.totpSecret ? (0, crypto_1.encryptToString)(entry.totpSecret, key) : null, entry.folderId || null, now, now);
        this.logSync(id, 'create');
        return id;
    }
    /**
     * Get an entry by ID (decrypted)
     */
    getEntry(id) {
        this.ensureUnlocked();
        const row = this.db.prepare('SELECT * FROM entries WHERE id = ? AND is_deleted = 0').get(id);
        if (!row)
            return null;
        return this.decryptEntry(row);
    }
    /**
     * Get all entries (decrypted)
     */
    getAllEntries() {
        this.ensureUnlocked();
        const rows = this.db.prepare('SELECT * FROM entries WHERE is_deleted = 0 ORDER BY modified_at DESC').all();
        return rows.map(row => this.decryptEntry(row)).filter(Boolean);
    }
    /**
     * Search entries by URL domain
     */
    findEntriesByDomain(domain) {
        this.ensureUnlocked();
        const rows = this.db.prepare('SELECT * FROM entries WHERE is_deleted = 0 AND url LIKE ?').all(`%${domain}%`);
        return rows.map(row => this.decryptEntry(row)).filter(Boolean);
    }
    /**
     * Update an entry
     */
    updateEntry(id, updates) {
        this.ensureUnlocked();
        const key = this.encryptionKey;
        const now = Date.now();
        // Get current entry
        const current = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
        if (!current)
            throw new Error(`Entry not found: ${id}`);
        const stmt = this.db.prepare(`
      UPDATE entries SET
        title_encrypted = ?,
        username_encrypted = ?,
        password_encrypted = ?,
        url = ?,
        notes_encrypted = ?,
        totp_secret_encrypted = ?,
        folder_id = ?,
        modified_at = ?,
        sync_version = sync_version + 1
      WHERE id = ?
    `);
        const decrypted = this.decryptEntry(current);
        stmt.run((0, crypto_1.encryptToString)(updates.title ?? decrypted.title, key), (0, crypto_1.encryptToString)(updates.username ?? decrypted.username, key), (0, crypto_1.encryptToString)(updates.password ?? decrypted.password, key), updates.url !== undefined ? updates.url : current.url, updates.notes !== undefined
            ? (updates.notes ? (0, crypto_1.encryptToString)(updates.notes, key) : null)
            : current.notes_encrypted, updates.totpSecret !== undefined
            ? (updates.totpSecret ? (0, crypto_1.encryptToString)(updates.totpSecret, key) : null)
            : current.totp_secret_encrypted, updates.folderId !== undefined ? updates.folderId : current.folder_id, now, id);
        this.logSync(id, 'update');
    }
    /**
     * Delete an entry (soft delete for sync)
     */
    deleteEntry(id) {
        this.ensureUnlocked();
        const now = Date.now();
        this.db.prepare(`
      UPDATE entries SET
        is_deleted = 1,
        deleted_at = ?,
        modified_at = ?,
        sync_version = sync_version + 1
      WHERE id = ?
    `).run(now, now, id);
        this.logSync(id, 'delete');
    }
    /**
     * Record entry usage
     */
    recordEntryUsed(id) {
        if (!this.db)
            return;
        this.db.prepare('UPDATE entries SET last_used_at = ? WHERE id = ?')
            .run(Date.now(), id);
    }
    /**
     * Get entries modified since timestamp (for sync)
     */
    getEntriesModifiedSince(timestamp) {
        this.ensureUnlocked();
        return this.db.prepare('SELECT * FROM entries WHERE modified_at > ?').all(timestamp);
    }
    // ==========================================================================
    // Folder Operations
    // ==========================================================================
    /**
     * Create a folder
     */
    createFolder(name, parentId) {
        this.ensureUnlocked();
        const id = (0, uuid_1.v4)();
        const now = Date.now();
        const key = this.encryptionKey;
        this.db.prepare(`
      INSERT INTO folders (id, name_encrypted, parent_id, created_at, modified_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, (0, crypto_1.encryptToString)(name, key), parentId || null, now, now);
        return id;
    }
    /**
     * Get all folders (decrypted)
     */
    getAllFolders() {
        this.ensureUnlocked();
        const key = this.encryptionKey;
        const rows = this.db.prepare('SELECT * FROM folders').all();
        return rows.map(row => ({
            id: row.id,
            name: (0, crypto_1.decryptFromString)(row.name_encrypted, key),
            parentId: row.parent_id,
            createdAt: row.created_at,
        }));
    }
    // ==========================================================================
    // Sync Operations
    // ==========================================================================
    /**
     * Log a sync operation
     */
    logSync(entryId, operation) {
        if (!this.db)
            return;
        const deviceId = this.getDeviceId();
        const entry = this.db.prepare('SELECT sync_version FROM entries WHERE id = ?').get(entryId);
        this.db.prepare(`
      INSERT INTO sync_log (entry_id, device_id, operation, sync_version, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(entryId, deviceId, operation, entry?.sync_version ?? 0, Date.now());
    }
    /**
     * Get device ID (create if not exists)
     */
    getDeviceId() {
        // For now, use a simple device ID
        // In production, this should be stored persistently
        return 'desktop-' + (process.env.COMPUTERNAME || 'unknown');
    }
    /**
     * Get pending sync operations
     */
    getPendingSyncOps() {
        if (!this.db)
            return [];
        return this.db.prepare('SELECT * FROM sync_log WHERE synced_at IS NULL ORDER BY timestamp').all();
    }
    /**
     * Mark sync operations as synced
     */
    markSynced(ids) {
        if (!this.db || ids.length === 0)
            return;
        const placeholders = ids.map(() => '?').join(',');
        this.db.prepare(`UPDATE sync_log SET synced_at = ? WHERE id IN (${placeholders})`).run(Date.now(), ...ids);
    }
    // ==========================================================================
    // Private Helpers
    // ==========================================================================
    ensureUnlocked() {
        if (!this.db || !this.encryptionKey) {
            throw new Error('Database is not open or unlocked');
        }
    }
    decryptEntry(row) {
        const key = this.encryptionKey;
        try {
            return {
                id: row.id,
                title: (0, crypto_1.decryptFromString)(row.title_encrypted, key),
                username: (0, crypto_1.decryptFromString)(row.username_encrypted, key),
                password: (0, crypto_1.decryptFromString)(row.password_encrypted, key),
                url: row.url,
                notes: row.notes_encrypted ? (0, crypto_1.decryptFromString)(row.notes_encrypted, key) : null,
                totpSecret: row.totp_secret_encrypted ? (0, crypto_1.decryptFromString)(row.totp_secret_encrypted, key) : null,
                folderId: row.folder_id,
                createdAt: row.created_at,
                modifiedAt: row.modified_at,
                lastUsedAt: row.last_used_at,
                syncVersion: row.sync_version,
            };
        }
        catch (error) {
            console.error('Failed to decrypt entry:', row.id, error);
            return null;
        }
    }
    createTables() {
        this.db.exec(`
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
      
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        title_encrypted TEXT NOT NULL,
        username_encrypted TEXT NOT NULL,
        password_encrypted TEXT NOT NULL,
        url TEXT,
        notes_encrypted TEXT,
        totp_secret_encrypted TEXT,
        folder_id TEXT,
        created_at INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        last_used_at INTEGER,
        sync_version INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name_encrypted TEXT NOT NULL,
        parent_id TEXT,
        created_at INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        sync_version INTEGER NOT NULL DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        sync_version INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        synced_at INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public_key BLOB NOT NULL,
        last_seen INTEGER NOT NULL,
        last_sync INTEGER,
        is_trusted INTEGER NOT NULL DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_entries_url ON entries(url);
      CREATE INDEX IF NOT EXISTS idx_entries_modified ON entries(modified_at);
      CREATE INDEX IF NOT EXISTS idx_sync_log_entry ON sync_log(entry_id);
    `);
    }
}
exports.VaultDatabase = VaultDatabase;
// Singleton instance
exports.vaultDb = new VaultDatabase();
//# sourceMappingURL=database.js.map
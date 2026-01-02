/**
 * Database Module
 * 
 * Manages SQLite database with encryption for the password vault.
 * Uses better-sqlite3 for synchronous, high-performance database operations.
 * 
 * Note: For production, this should use SQLCipher for page-level encryption.
 * This implementation uses application-level encryption as a fallback.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
    encryptToString,
    decryptFromString,
    type VaultHeader,
    serializeVaultHeader,
    deserializeVaultHeader,
    hashMasterKey,
} from '../core/crypto';

// ============================================================================
// Types
// ============================================================================

export interface DbEntry {
    id: string;
    title_encrypted: string;
    username_encrypted: string;
    password_encrypted: string;
    url: string | null;
    notes_encrypted: string | null;
    totp_secret_encrypted: string | null;
    folder_id: string | null;
    created_at: number;
    modified_at: number;
    last_used_at: number | null;
    sync_version: number;
    is_deleted: number;
    deleted_at: number | null;
    is_favorite: number;
}

export interface DbFolder {
    id: string;
    name_encrypted: string;
    parent_id: string | null;
    created_at: number;
    modified_at: number;
    sync_version: number;
}

export interface DbVaultMeta {
    id: number;
    version: number;
    salt: Buffer;
    key_hash: Buffer;
    argon2_mem_cost: number;
    argon2_time_cost: number;
    argon2_parallelism: number;
    created_at: number;
    last_modified: number;
    last_unlocked: number | null;
}

export interface DbSyncLog {
    id: number;
    entry_id: string;
    device_id: string;
    operation: 'create' | 'update' | 'delete';
    sync_version: number;
    timestamp: number;
    synced_at: number | null;
}

export interface DbDevice {
    id: string;
    name: string;
    public_key: Buffer;
    last_seen: number;
    last_sync: number | null;
    is_trusted: number;
}

// ============================================================================
// Database Class
// ============================================================================

export class VaultDatabase {
    private db: Database.Database | null = null;
    private dbPath: string | null = null;
    private encryptionKey: Buffer | null = null;

    /**
     * Create a new vault database
     */
    create(vaultPath: string, header: VaultHeader, masterKey: Buffer): void {
        this.dbPath = vaultPath;
        this.encryptionKey = masterKey;

        // Create database directory if needed
        const dir = path.dirname(vaultPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Initialize database
        this.db = new Database(vaultPath);

        // Enable WAL mode for better performance
        this.db.pragma('journal_mode = WAL');

        // Create tables
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            this.db.exec(schema);
        } else {
            // Inline schema for bundled builds
            this.createTables();
        }

        // Store vault metadata
        const keyHash = hashMasterKey(masterKey);
        const now = Date.now();

        const stmt = this.db.prepare(`
      INSERT INTO vault_meta (
        id, version, salt, key_hash,
        argon2_mem_cost, argon2_time_cost, argon2_parallelism,
        created_at, last_modified
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(
            header.version,
            header.salt,
            keyHash,
            header.memoryCost,
            header.timeCost,
            header.parallelism,
            now,
            now
        );
    }

    /**
     * Open an existing vault database
     */
    open(vaultPath: string): DbVaultMeta {
        if (!fs.existsSync(vaultPath)) {
            throw new Error(`Vault not found: ${vaultPath}`);
        }

        this.dbPath = vaultPath;
        this.db = new Database(vaultPath);

        // Migrate: Add is_favorite column if it doesn't exist
        try {
            this.db.exec('ALTER TABLE entries ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0');
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_entries_favorite ON entries(is_favorite)');
        } catch (error) {
            // Column might already exist, ignore error
        }

        // Read vault metadata
        const meta = this.db.prepare('SELECT * FROM vault_meta WHERE id = 1').get() as DbVaultMeta;

        if (!meta) {
            throw new Error('Invalid vault file: missing metadata');
        }

        return meta;
    }

    /**
     * Set encryption key after password verification
     */
    setEncryptionKey(key: Buffer): void {
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
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        this.encryptionKey = null;
    }

    /**
     * Check if database is open and unlocked
     */
    isUnlocked(): boolean {
        return this.db !== null && this.encryptionKey !== null;
    }

    // ==========================================================================
    // Entry Operations
    // ==========================================================================

    /**
     * Add a new entry
     */
    addEntry(entry: {
        title: string;
        username: string;
        password: string;
        url?: string;
        notes?: string;
        totpSecret?: string;
        folderId?: string;
    }): string {
        this.ensureUnlocked();

        const id = uuidv4();
        const now = Date.now();
        const key = this.encryptionKey!;

        const stmt = this.db!.prepare(`
      INSERT INTO entries (
        id, title_encrypted, username_encrypted, password_encrypted,
        url, notes_encrypted, totp_secret_encrypted, folder_id,
        created_at, modified_at, sync_version, is_favorite
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `);

        stmt.run(
            id,
            encryptToString(entry.title, key),
            encryptToString(entry.username, key),
            encryptToString(entry.password, key),
            entry.url || null,
            entry.notes ? encryptToString(entry.notes, key) : null,
            entry.totpSecret ? encryptToString(entry.totpSecret, key) : null,
            entry.folderId || null,
            now,
            now
        );

        this.logSync(id, 'create');

        return id;
    }

    /**
     * Get an entry by ID (decrypted)
     */
    getEntry(id: string): {
        id: string;
        title: string;
        username: string;
        password: string;
        url: string | null;
        notes: string | null;
        totpSecret: string | null;
        folderId: string | null;
        createdAt: number;
        modifiedAt: number;
        lastUsedAt: number | null;
        syncVersion: number;
        isFavorite: boolean;
    } | null {
        this.ensureUnlocked();

        const row = this.db!.prepare(
            'SELECT * FROM entries WHERE id = ? AND is_deleted = 0'
        ).get(id) as DbEntry | undefined;

        if (!row) return null;

        return this.decryptEntry(row);
    }

    /**
     * Get all entries (decrypted)
     */
    getAllEntries(): Array<ReturnType<VaultDatabase['getEntry']>> {
        this.ensureUnlocked();

        const rows = this.db!.prepare(
            'SELECT * FROM entries WHERE is_deleted = 0 ORDER BY modified_at DESC'
        ).all() as DbEntry[];

        return rows.map(row => this.decryptEntry(row)).filter(Boolean) as Array<ReturnType<VaultDatabase['getEntry']>>;
    }

    /**
     * Search entries by URL domain
     */
    findEntriesByDomain(domain: string): Array<ReturnType<VaultDatabase['getEntry']>> {
        this.ensureUnlocked();

        const normalized = domain.trim().toLowerCase().replace(/^www\./, '');
        const wwwVariant = `www.${normalized}`;

        // Match both google.com and www.google.com style URLs.
        // Use LOWER(url) to make it case-insensitive.
        const rows = this.db!.prepare(
            'SELECT * FROM entries WHERE is_deleted = 0 AND url IS NOT NULL AND (LOWER(url) LIKE ? OR LOWER(url) LIKE ?)'
        ).all(`%${normalized}%`, `%${wwwVariant}%`) as DbEntry[];

        return rows.map(row => this.decryptEntry(row)).filter(Boolean) as Array<ReturnType<VaultDatabase['getEntry']>>;
    }

    /**
     * Update an entry
     */
    updateEntry(id: string, updates: {
        title?: string;
        username?: string;
        password?: string;
        url?: string;
        notes?: string;
        totpSecret?: string;
        folderId?: string | null;
    }): void {
        this.ensureUnlocked();

        const key = this.encryptionKey!;
        const now = Date.now();

        // Get current entry
        const current = this.db!.prepare('SELECT * FROM entries WHERE id = ?').get(id) as DbEntry;
        if (!current) throw new Error(`Entry not found: ${id}`);

        const stmt = this.db!.prepare(`
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

        const decrypted = this.decryptEntry(current)!;

        stmt.run(
            encryptToString(updates.title ?? decrypted.title, key),
            encryptToString(updates.username ?? decrypted.username, key),
            encryptToString(updates.password ?? decrypted.password, key),
            updates.url !== undefined ? updates.url : current.url,
            updates.notes !== undefined
                ? (updates.notes ? encryptToString(updates.notes, key) : null)
                : current.notes_encrypted,
            updates.totpSecret !== undefined
                ? (updates.totpSecret ? encryptToString(updates.totpSecret, key) : null)
                : current.totp_secret_encrypted,
            updates.folderId !== undefined ? updates.folderId : current.folder_id,
            now,
            id
        );

        this.logSync(id, 'update');
    }

    /**
     * Delete an entry (soft delete for sync)
     */
    deleteEntry(id: string): void {
        this.ensureUnlocked();

        const now = Date.now();

        this.db!.prepare(`
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
    recordEntryUsed(id: string): void {
        if (!this.db) return;

        this.db.prepare('UPDATE entries SET last_used_at = ? WHERE id = ?')
            .run(Date.now(), id);
    }

    /**
     * Toggle favorite status of an entry
     */
    toggleFavorite(id: string): boolean {
        this.ensureUnlocked();

        const entry = this.db!.prepare('SELECT is_favorite FROM entries WHERE id = ?').get(id) as { is_favorite: number } | undefined;
        if (!entry) {
            throw new Error(`Entry not found: ${id}`);
        }

        const newFavoriteStatus = entry.is_favorite === 0 ? 1 : 0;
        this.db!.prepare('UPDATE entries SET is_favorite = ?, modified_at = ? WHERE id = ?')
            .run(newFavoriteStatus, Date.now(), id);

        this.logSync(id, 'update');
        return newFavoriteStatus === 1;
    }

    /**
     * Get all favorite entries
     */
    getFavoriteEntries(): Array<ReturnType<VaultDatabase['getEntry']>> {
        this.ensureUnlocked();

        const rows = this.db!.prepare(
            'SELECT * FROM entries WHERE is_deleted = 0 AND is_favorite = 1 ORDER BY modified_at DESC'
        ).all() as DbEntry[];

        return rows.map(row => this.decryptEntry(row)).filter(Boolean) as Array<ReturnType<VaultDatabase['getEntry']>>;
    }

    /**
     * Get entries modified since timestamp (for sync)
     */
    getEntriesModifiedSince(timestamp: number): DbEntry[] {
        this.ensureUnlocked();

        return this.db!.prepare(
            'SELECT * FROM entries WHERE modified_at > ?'
        ).all(timestamp) as DbEntry[];
    }

    // ==========================================================================
    // Folder Operations
    // ==========================================================================

    /**
     * Create a folder
     */
    createFolder(name: string, parentId?: string): string {
        this.ensureUnlocked();

        const id = uuidv4();
        const now = Date.now();
        const key = this.encryptionKey!;

        this.db!.prepare(`
      INSERT INTO folders (id, name_encrypted, parent_id, created_at, modified_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, encryptToString(name, key), parentId || null, now, now);

        return id;
    }

    /**
     * Get all folders (decrypted)
     */
    getAllFolders(): Array<{
        id: string;
        name: string;
        parentId: string | null;
        createdAt: number;
    }> {
        this.ensureUnlocked();

        const key = this.encryptionKey!;
        const rows = this.db!.prepare('SELECT * FROM folders').all() as DbFolder[];

        return rows.map(row => ({
            id: row.id,
            name: decryptFromString(row.name_encrypted, key),
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
    private logSync(entryId: string, operation: 'create' | 'update' | 'delete'): void {
        if (!this.db) return;

        const deviceId = this.getDeviceId();
        const entry = this.db.prepare('SELECT sync_version FROM entries WHERE id = ?').get(entryId) as { sync_version: number } | undefined;

        this.db.prepare(`
      INSERT INTO sync_log (entry_id, device_id, operation, sync_version, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(entryId, deviceId, operation, entry?.sync_version ?? 0, Date.now());
    }

    /**
     * Get device ID (create if not exists)
     */
    private getDeviceId(): string {
        // For now, use a simple device ID
        // In production, this should be stored persistently
        return 'desktop-' + (process.env.COMPUTERNAME || 'unknown');
    }

    /**
     * Get pending sync operations
     */
    getPendingSyncOps(): DbSyncLog[] {
        if (!this.db) return [];

        return this.db.prepare(
            'SELECT * FROM sync_log WHERE synced_at IS NULL ORDER BY timestamp'
        ).all() as DbSyncLog[];
    }

    /**
     * Mark sync operations as synced
     */
    markSynced(ids: number[]): void {
        if (!this.db || ids.length === 0) return;

        const placeholders = ids.map(() => '?').join(',');
        this.db.prepare(
            `UPDATE sync_log SET synced_at = ? WHERE id IN (${placeholders})`
        ).run(Date.now(), ...ids);
    }

    // ==========================================================================
    // Private Helpers
    // ==========================================================================

    private ensureUnlocked(): void {
        if (!this.db || !this.encryptionKey) {
            throw new Error('Database is not open or unlocked');
        }
    }

    private decryptEntry(row: DbEntry) {
        const key = this.encryptionKey!;

        try {
            return {
                id: row.id,
                title: decryptFromString(row.title_encrypted, key),
                username: decryptFromString(row.username_encrypted, key),
                password: decryptFromString(row.password_encrypted, key),
                url: row.url,
                notes: row.notes_encrypted ? decryptFromString(row.notes_encrypted, key) : null,
                totpSecret: row.totp_secret_encrypted ? decryptFromString(row.totp_secret_encrypted, key) : null,
                folderId: row.folder_id,
                createdAt: row.created_at,
                modifiedAt: row.modified_at,
                lastUsedAt: row.last_used_at,
                syncVersion: row.sync_version,
                isFavorite: row.is_favorite === 1,
            };
        } catch (error) {
            console.error('Failed to decrypt entry:', row.id, error);
            return null;
        }
    }

    private createTables(): void {
        this.db!.exec(`
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
        deleted_at INTEGER,
        is_favorite INTEGER NOT NULL DEFAULT 0
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
      CREATE INDEX IF NOT EXISTS idx_entries_favorite ON entries(is_favorite);
      CREATE INDEX IF NOT EXISTS idx_sync_log_entry ON sync_log(entry_id);
    `);
    }
}

// Singleton instance
export const vaultDb = new VaultDatabase();

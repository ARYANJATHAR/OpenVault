/**
 * Database Module
 *
 * Manages SQLite database with encryption for the password vault.
 * Uses better-sqlite3 for synchronous, high-performance database operations.
 *
 * Note: For production, this should use SQLCipher for page-level encryption.
 * This implementation uses application-level encryption as a fallback.
 */
import { type VaultHeader } from '../core/crypto';
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
export declare class VaultDatabase {
    private db;
    private dbPath;
    private encryptionKey;
    /**
     * Create a new vault database
     */
    create(vaultPath: string, header: VaultHeader, masterKey: Buffer): void;
    /**
     * Open an existing vault database
     */
    open(vaultPath: string): DbVaultMeta;
    /**
     * Set encryption key after password verification
     */
    setEncryptionKey(key: Buffer): void;
    /**
     * Close the database
     */
    close(): void;
    /**
     * Check if database is open and unlocked
     */
    isUnlocked(): boolean;
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
    }): string;
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
    } | null;
    /**
     * Get all entries (decrypted)
     */
    getAllEntries(): Array<ReturnType<VaultDatabase['getEntry']>>;
    /**
     * Search entries by URL domain
     */
    findEntriesByDomain(domain: string): Array<ReturnType<VaultDatabase['getEntry']>>;
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
    }): void;
    /**
     * Delete an entry (soft delete for sync)
     */
    deleteEntry(id: string): void;
    /**
     * Record entry usage
     */
    recordEntryUsed(id: string): void;
    /**
     * Get entries modified since timestamp (for sync)
     */
    getEntriesModifiedSince(timestamp: number): DbEntry[];
    /**
     * Create a folder
     */
    createFolder(name: string, parentId?: string): string;
    /**
     * Get all folders (decrypted)
     */
    getAllFolders(): Array<{
        id: string;
        name: string;
        parentId: string | null;
        createdAt: number;
    }>;
    /**
     * Log a sync operation
     */
    private logSync;
    /**
     * Get device ID (create if not exists)
     */
    private getDeviceId;
    /**
     * Get pending sync operations
     */
    getPendingSyncOps(): DbSyncLog[];
    /**
     * Mark sync operations as synced
     */
    markSynced(ids: number[]): void;
    private ensureUnlocked;
    private decryptEntry;
    private createTables;
}
export declare const vaultDb: VaultDatabase;
//# sourceMappingURL=database.d.ts.map
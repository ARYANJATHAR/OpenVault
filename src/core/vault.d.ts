/**
 * Vault Module
 *
 * High-level APIs for managing the encrypted password vault:
 * - Create, open, close, and lock vault operations
 * - Entry CRUD with automatic encryption/decryption
 * - Session management with auto-lock
 *
 * The vault is a SQLCipher database with page-level encryption.
 * Individual sensitive fields are also encrypted at the application level.
 */
import { type DerivedKeys, type VaultHeader } from './crypto';
export interface VaultEntry {
    id: string;
    title: string;
    username: string;
    password: string;
    url: string;
    notes: string;
    totpSecret?: string;
    folderId?: string;
    createdAt: number;
    modifiedAt: number;
    lastUsedAt?: number;
    syncVersion: number;
}
export interface VaultFolder {
    id: string;
    name: string;
    parentId?: string;
    createdAt: number;
}
export interface VaultSession {
    /** Whether vault is currently unlocked */
    isUnlocked: boolean;
    /** Derived encryption keys (null when locked) */
    keys: DerivedKeys | null;
    /** Vault header with salt and parameters */
    header: VaultHeader | null;
    /** Path to vault file */
    vaultPath: string | null;
    /** Auto-lock timeout in milliseconds */
    autoLockTimeout: number;
    /** Timer for auto-lock */
    autoLockTimer: NodeJS.Timeout | null;
}
export interface CreateVaultOptions {
    /** Path to create vault file */
    path: string;
    /** Master password */
    password: string;
    /** Auto-lock timeout in milliseconds (default: 5 minutes) */
    autoLockTimeout?: number;
}
export interface OpenVaultOptions {
    /** Path to vault file */
    path: string;
    /** Master password */
    password: string;
    /** Auto-lock timeout in milliseconds (default: 5 minutes) */
    autoLockTimeout?: number;
}
export declare class Vault {
    private session;
    private entries;
    private folders;
    private onLockCallbacks;
    private db;
    /**
     * Create a new vault
     */
    create(options: CreateVaultOptions): Promise<void>;
    /**
     * Open an existing vault
     */
    open(options: OpenVaultOptions): Promise<void>;
    /**
     * Lock the vault (clear keys from memory)
     */
    lock(): void;
    /**
     * Unlock the vault with master password
     */
    unlock(password: string): Promise<boolean>;
    /**
     * Check if vault is unlocked
     */
    isUnlocked(): boolean;
    /**
     * Register callback for when vault is locked
     */
    onLock(callback: () => void): void;
    /**
     * Add a new password entry
     */
    addEntry(entry: Omit<VaultEntry, 'id' | 'createdAt' | 'modifiedAt' | 'syncVersion'>): VaultEntry;
    /**
     * Update an existing entry
     */
    updateEntry(id: string, updates: Partial<Omit<VaultEntry, 'id' | 'createdAt'>>): VaultEntry;
    /**
     * Delete an entry
     */
    deleteEntry(id: string): void;
    /**
     * Get an entry by ID
     */
    getEntry(id: string): VaultEntry | undefined;
    /**
     * Get all entries
     */
    getAllEntries(): VaultEntry[];
    /**
     * Search entries by title or URL
     */
    searchEntries(query: string): VaultEntry[];
    /**
     * Find entries matching a URL (for autofill)
     */
    findEntriesForUrl(url: string): VaultEntry[];
    /**
     * Record that an entry was used (for sorting by frequency)
     */
    recordEntryUsed(id: string): void;
    /**
     * Create a new folder
     */
    createFolder(name: string, parentId?: string): VaultFolder;
    /**
     * Get all folders
     */
    getAllFolders(): VaultFolder[];
    /**
     * Export vault data (encrypted with export key)
     */
    exportVault(): Promise<string>;
    /**
     * Import entries from encrypted export
     */
    importVault(encryptedData: string): Promise<number>;
    private ensureUnlocked;
    private resetAutoLockTimer;
    /**
     * Get sync key for LAN sync (only when unlocked)
     */
    getSyncKey(): Buffer | null;
    /**
     * Get entries modified after a timestamp (for sync)
     */
    getEntriesModifiedAfter(timestamp: number): VaultEntry[];
}
export declare const vault: Vault;
//# sourceMappingURL=vault.d.ts.map
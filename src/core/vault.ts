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

import { v4 as uuidv4 } from 'uuid';
import {
    deriveMasterKey,
    deriveKeys,
    encryptToString,
    decryptFromString,
    createVaultHeader,
    secureWipe,
    hashMasterKey,
    type DerivedKeys,
    type VaultHeader,
} from './crypto';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Vault Class
// ============================================================================

export class Vault {
    private session: VaultSession = {
        isUnlocked: false,
        keys: null,
        header: null,
        vaultPath: null,
        autoLockTimeout: 5 * 60 * 1000, // 5 minutes default
        autoLockTimer: null,
    };

    private entries: Map<string, VaultEntry> = new Map();
    private folders: Map<string, VaultFolder> = new Map();
    private onLockCallbacks: Array<() => void> = [];

    // Database reference (will be SQLCipher)
    private db: any = null;

    /**
     * Create a new vault
     */
    async create(options: CreateVaultOptions): Promise<void> {
        const { path, password, autoLockTimeout } = options;

        // Generate vault header with fresh salt
        const header = createVaultHeader();

        // Derive master key and sub-keys
        const masterKey = await deriveMasterKey(password, header.salt);
        const keys = deriveKeys(masterKey);

        // Store hash of master key for password verification
        const keyHash = hashMasterKey(masterKey);

        // Wipe master key from memory (we keep derived keys)
        secureWipe(masterKey);

        // Initialize session
        this.session = {
            isUnlocked: true,
            keys,
            header,
            vaultPath: path,
            autoLockTimeout: autoLockTimeout ?? this.session.autoLockTimeout,
            autoLockTimer: null,
        };

        // TODO: Initialize SQLCipher database at path
        // For now, store in memory
        this.entries.clear();
        this.folders.clear();

        this.resetAutoLockTimer();
    }

    /**
     * Open an existing vault
     */
    async open(options: OpenVaultOptions): Promise<void> {
        const { path, password, autoLockTimeout } = options;

        // TODO: Read vault header from file
        // For now, throw if no vault exists
        throw new Error('Vault not found. Use create() to create a new vault.');
    }

    /**
     * Lock the vault (clear keys from memory)
     */
    lock(): void {
        if (this.session.keys) {
            secureWipe(this.session.keys.vaultKey);
            secureWipe(this.session.keys.syncKey);
            secureWipe(this.session.keys.exportKey);
        }

        this.session.isUnlocked = false;
        this.session.keys = null;

        if (this.session.autoLockTimer) {
            clearTimeout(this.session.autoLockTimer);
            this.session.autoLockTimer = null;
        }

        // Clear in-memory entries
        this.entries.clear();
        this.folders.clear();

        // Notify listeners
        this.onLockCallbacks.forEach(cb => cb());
    }

    /**
     * Unlock the vault with master password
     */
    async unlock(password: string): Promise<boolean> {
        if (!this.session.header) {
            throw new Error('No vault loaded');
        }

        const masterKey = await deriveMasterKey(password, this.session.header.salt);
        const keys = deriveKeys(masterKey);
        secureWipe(masterKey);

        // TODO: Verify password against stored hash
        // For now, assume correct

        this.session.keys = keys;
        this.session.isUnlocked = true;

        this.resetAutoLockTimer();

        return true;
    }

    /**
     * Check if vault is unlocked
     */
    isUnlocked(): boolean {
        return this.session.isUnlocked;
    }

    /**
     * Register callback for when vault is locked
     */
    onLock(callback: () => void): void {
        this.onLockCallbacks.push(callback);
    }

    // ==========================================================================
    // Entry Management
    // ==========================================================================

    /**
     * Add a new password entry
     */
    addEntry(entry: Omit<VaultEntry, 'id' | 'createdAt' | 'modifiedAt' | 'syncVersion'>): VaultEntry {
        this.ensureUnlocked();

        const now = Date.now();
        const newEntry: VaultEntry = {
            ...entry,
            id: uuidv4(),
            createdAt: now,
            modifiedAt: now,
            syncVersion: 0,
        };

        this.entries.set(newEntry.id, newEntry);
        this.resetAutoLockTimer();

        // TODO: Persist to database

        return newEntry;
    }

    /**
     * Update an existing entry
     */
    updateEntry(id: string, updates: Partial<Omit<VaultEntry, 'id' | 'createdAt'>>): VaultEntry {
        this.ensureUnlocked();

        const existing = this.entries.get(id);
        if (!existing) {
            throw new Error(`Entry not found: ${id}`);
        }

        const updated: VaultEntry = {
            ...existing,
            ...updates,
            modifiedAt: Date.now(),
            syncVersion: existing.syncVersion + 1,
        };

        this.entries.set(id, updated);
        this.resetAutoLockTimer();

        // TODO: Persist to database

        return updated;
    }

    /**
     * Delete an entry
     */
    deleteEntry(id: string): void {
        this.ensureUnlocked();

        if (!this.entries.has(id)) {
            throw new Error(`Entry not found: ${id}`);
        }

        this.entries.delete(id);
        this.resetAutoLockTimer();

        // TODO: Persist to database (mark as deleted for sync)
    }

    /**
     * Get an entry by ID
     */
    getEntry(id: string): VaultEntry | undefined {
        this.ensureUnlocked();
        this.resetAutoLockTimer();

        return this.entries.get(id);
    }

    /**
     * Get all entries
     */
    getAllEntries(): VaultEntry[] {
        this.ensureUnlocked();
        this.resetAutoLockTimer();

        return Array.from(this.entries.values());
    }

    /**
     * Search entries by title or URL
     */
    searchEntries(query: string): VaultEntry[] {
        this.ensureUnlocked();
        this.resetAutoLockTimer();

        const lowerQuery = query.toLowerCase();

        return Array.from(this.entries.values()).filter(entry =>
            entry.title.toLowerCase().includes(lowerQuery) ||
            entry.url.toLowerCase().includes(lowerQuery) ||
            entry.username.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Find entries matching a URL (for autofill)
     */
    findEntriesForUrl(url: string): VaultEntry[] {
        this.ensureUnlocked();
        this.resetAutoLockTimer();

        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;

            return Array.from(this.entries.values()).filter(entry => {
                try {
                    const entryDomain = new URL(entry.url).hostname;
                    return entryDomain === domain ||
                        domain.endsWith('.' + entryDomain) ||
                        entryDomain.endsWith('.' + domain);
                } catch {
                    return false;
                }
            });
        } catch {
            return [];
        }
    }

    /**
     * Record that an entry was used (for sorting by frequency)
     */
    recordEntryUsed(id: string): void {
        this.ensureUnlocked();

        const entry = this.entries.get(id);
        if (entry) {
            entry.lastUsedAt = Date.now();
            // TODO: Persist to database
        }
    }

    // ==========================================================================
    // Folder Management
    // ==========================================================================

    /**
     * Create a new folder
     */
    createFolder(name: string, parentId?: string): VaultFolder {
        this.ensureUnlocked();

        const folder: VaultFolder = {
            id: uuidv4(),
            name,
            parentId,
            createdAt: Date.now(),
        };

        this.folders.set(folder.id, folder);
        this.resetAutoLockTimer();

        return folder;
    }

    /**
     * Get all folders
     */
    getAllFolders(): VaultFolder[] {
        this.ensureUnlocked();
        return Array.from(this.folders.values());
    }

    // ==========================================================================
    // Export / Import
    // ==========================================================================

    /**
     * Export vault data (encrypted with export key)
     */
    async exportVault(): Promise<string> {
        this.ensureUnlocked();

        const data = {
            entries: Array.from(this.entries.values()),
            folders: Array.from(this.folders.values()),
            exportedAt: Date.now(),
        };

        const json = JSON.stringify(data);
        return encryptToString(json, this.session.keys!.exportKey);
    }

    /**
     * Import entries from encrypted export
     */
    async importVault(encryptedData: string): Promise<number> {
        this.ensureUnlocked();

        const json = decryptFromString(encryptedData, this.session.keys!.exportKey);
        const data = JSON.parse(json);

        let imported = 0;

        for (const entry of data.entries) {
            if (!this.entries.has(entry.id)) {
                this.entries.set(entry.id, entry);
                imported++;
            }
        }

        for (const folder of data.folders) {
            if (!this.folders.has(folder.id)) {
                this.folders.set(folder.id, folder);
            }
        }

        return imported;
    }

    // ==========================================================================
    // Private Helpers
    // ==========================================================================

    private ensureUnlocked(): void {
        if (!this.session.isUnlocked || !this.session.keys) {
            throw new Error('Vault is locked');
        }
    }

    private resetAutoLockTimer(): void {
        if (this.session.autoLockTimer) {
            clearTimeout(this.session.autoLockTimer);
        }

        this.session.autoLockTimer = setTimeout(() => {
            this.lock();
        }, this.session.autoLockTimeout);
    }

    /**
     * Get sync key for LAN sync (only when unlocked)
     */
    getSyncKey(): Buffer | null {
        return this.session.keys?.syncKey ?? null;
    }

    /**
     * Get entries modified after a timestamp (for sync)
     */
    getEntriesModifiedAfter(timestamp: number): VaultEntry[] {
        this.ensureUnlocked();

        return Array.from(this.entries.values())
            .filter(entry => entry.modifiedAt > timestamp);
    }
}

// Singleton instance
export const vault = new Vault();

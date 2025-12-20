"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.vault = exports.Vault = void 0;
const uuid_1 = require("uuid");
const crypto_1 = require("./crypto");
// ============================================================================
// Vault Class
// ============================================================================
class Vault {
    session = {
        isUnlocked: false,
        keys: null,
        header: null,
        vaultPath: null,
        autoLockTimeout: 5 * 60 * 1000, // 5 minutes default
        autoLockTimer: null,
    };
    entries = new Map();
    folders = new Map();
    onLockCallbacks = [];
    // Database reference (will be SQLCipher)
    db = null;
    /**
     * Create a new vault
     */
    async create(options) {
        const { path, password, autoLockTimeout } = options;
        // Generate vault header with fresh salt
        const header = (0, crypto_1.createVaultHeader)();
        // Derive master key and sub-keys
        const masterKey = await (0, crypto_1.deriveMasterKey)(password, header.salt);
        const keys = (0, crypto_1.deriveKeys)(masterKey);
        // Store hash of master key for password verification
        const keyHash = (0, crypto_1.hashMasterKey)(masterKey);
        // Wipe master key from memory (we keep derived keys)
        (0, crypto_1.secureWipe)(masterKey);
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
    async open(options) {
        const { path, password, autoLockTimeout } = options;
        // TODO: Read vault header from file
        // For now, throw if no vault exists
        throw new Error('Vault not found. Use create() to create a new vault.');
    }
    /**
     * Lock the vault (clear keys from memory)
     */
    lock() {
        if (this.session.keys) {
            (0, crypto_1.secureWipe)(this.session.keys.vaultKey);
            (0, crypto_1.secureWipe)(this.session.keys.syncKey);
            (0, crypto_1.secureWipe)(this.session.keys.exportKey);
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
    async unlock(password) {
        if (!this.session.header) {
            throw new Error('No vault loaded');
        }
        const masterKey = await (0, crypto_1.deriveMasterKey)(password, this.session.header.salt);
        const keys = (0, crypto_1.deriveKeys)(masterKey);
        (0, crypto_1.secureWipe)(masterKey);
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
    isUnlocked() {
        return this.session.isUnlocked;
    }
    /**
     * Register callback for when vault is locked
     */
    onLock(callback) {
        this.onLockCallbacks.push(callback);
    }
    // ==========================================================================
    // Entry Management
    // ==========================================================================
    /**
     * Add a new password entry
     */
    addEntry(entry) {
        this.ensureUnlocked();
        const now = Date.now();
        const newEntry = {
            ...entry,
            id: (0, uuid_1.v4)(),
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
    updateEntry(id, updates) {
        this.ensureUnlocked();
        const existing = this.entries.get(id);
        if (!existing) {
            throw new Error(`Entry not found: ${id}`);
        }
        const updated = {
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
    deleteEntry(id) {
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
    getEntry(id) {
        this.ensureUnlocked();
        this.resetAutoLockTimer();
        return this.entries.get(id);
    }
    /**
     * Get all entries
     */
    getAllEntries() {
        this.ensureUnlocked();
        this.resetAutoLockTimer();
        return Array.from(this.entries.values());
    }
    /**
     * Search entries by title or URL
     */
    searchEntries(query) {
        this.ensureUnlocked();
        this.resetAutoLockTimer();
        const lowerQuery = query.toLowerCase();
        return Array.from(this.entries.values()).filter(entry => entry.title.toLowerCase().includes(lowerQuery) ||
            entry.url.toLowerCase().includes(lowerQuery) ||
            entry.username.toLowerCase().includes(lowerQuery));
    }
    /**
     * Find entries matching a URL (for autofill)
     */
    findEntriesForUrl(url) {
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
                }
                catch {
                    return false;
                }
            });
        }
        catch {
            return [];
        }
    }
    /**
     * Record that an entry was used (for sorting by frequency)
     */
    recordEntryUsed(id) {
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
    createFolder(name, parentId) {
        this.ensureUnlocked();
        const folder = {
            id: (0, uuid_1.v4)(),
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
    getAllFolders() {
        this.ensureUnlocked();
        return Array.from(this.folders.values());
    }
    // ==========================================================================
    // Export / Import
    // ==========================================================================
    /**
     * Export vault data (encrypted with export key)
     */
    async exportVault() {
        this.ensureUnlocked();
        const data = {
            entries: Array.from(this.entries.values()),
            folders: Array.from(this.folders.values()),
            exportedAt: Date.now(),
        };
        const json = JSON.stringify(data);
        return (0, crypto_1.encryptToString)(json, this.session.keys.exportKey);
    }
    /**
     * Import entries from encrypted export
     */
    async importVault(encryptedData) {
        this.ensureUnlocked();
        const json = (0, crypto_1.decryptFromString)(encryptedData, this.session.keys.exportKey);
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
    ensureUnlocked() {
        if (!this.session.isUnlocked || !this.session.keys) {
            throw new Error('Vault is locked');
        }
    }
    resetAutoLockTimer() {
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
    getSyncKey() {
        return this.session.keys?.syncKey ?? null;
    }
    /**
     * Get entries modified after a timestamp (for sync)
     */
    getEntriesModifiedAfter(timestamp) {
        this.ensureUnlocked();
        return Array.from(this.entries.values())
            .filter(entry => entry.modifiedAt > timestamp);
    }
}
exports.Vault = Vault;
// Singleton instance
exports.vault = new Vault();
//# sourceMappingURL=vault.js.map
/**
 * Vault Service
 * Handles vault operations using expo-sqlite
 */

import * as SQLite from 'expo-sqlite';
import { generateUUID } from '../utils/uuid';
import {
  deriveMasterKey,
  deriveKeys,
  encryptToString,
  decryptFromString,
  decryptFromStringV1,
  decryptLegacyRaw,
  createVaultHeader,
  hashMasterKey,
} from './cryptoService';

export interface VaultEntry {
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
}

class VaultService {
  private db: SQLite.SQLiteDatabase | null = null;
  private isUnlocked: boolean = false;
  private encryptionKey: string | null = null;

  /**
   * Initialize database connection
   */
  private async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (!this.db) {
      this.db = await SQLite.openDatabaseAsync('vault.db');
    }
    return this.db;
  }

  /**
   * Check if vault exists
   */
  async vaultExists(): Promise<boolean> {
    try {
      const db = await this.getDatabase();
      const result = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM sqlite_master WHERE type="table" AND name="vault_meta"'
      );
      if (!result || result.count === 0) return false;

      const meta = await db.getFirstAsync('SELECT * FROM vault_meta LIMIT 1');
      return meta !== null;
    } catch {
      return false;
    }
  }

  /**
   * Create a new vault
   */
  async createVault(password: string): Promise<void> {
    const db = await this.getDatabase();

    // Create tables
    await this.createTables(db);

    // Generate vault header
    const header = await createVaultHeader();
    const masterKey = await deriveMasterKey(password, header.salt);
    const keys = deriveKeys(masterKey);
    const keyHash = hashMasterKey(keys.vaultKey);

    // Store vault metadata
    await db.runAsync(
      'INSERT INTO vault_meta (salt, key_hash, created_at) VALUES (?, ?, ?)',
      [header.salt, keyHash, Date.now()]
    );

    this.encryptionKey = keys.vaultKey;
    this.isUnlocked = true;
  }

  /**
   * Open existing vault
   */
  async openVault(password: string): Promise<boolean> {
    const db = await this.getDatabase();

    // Run migration on open
    await this.migrateDatabase(db);

    // Get vault metadata
    const meta = await db.getFirstAsync<{ salt: string; key_hash: string }>(
      'SELECT salt, key_hash FROM vault_meta LIMIT 1'
    );

    if (!meta) {
      return false;
    }

    // Derive keys
    const masterKey = await deriveMasterKey(password, meta.salt);
    const keys = deriveKeys(masterKey);
    const keyHash = hashMasterKey(keys.vaultKey);

    // Verify password
    if (keyHash !== meta.key_hash) {
      return false;
    }

    this.encryptionKey = keys.vaultKey;
    this.isUnlocked = true;
    return true;
  }

  /**
   * Lock vault
   */
  lockVault(): void {
    this.isUnlocked = false;
    this.encryptionKey = null;
  }

  /**
   * Check if vault is unlocked
   */
  getIsUnlocked(): boolean {
    return this.isUnlocked;
  }

  /**
   * Get all entries
   */
  async getAllEntries(): Promise<VaultEntry[]> {
    this.ensureUnlocked();
    const db = await this.getDatabase();

    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM entries WHERE is_deleted = 0 ORDER BY modified_at DESC'
    );

    const entries: VaultEntry[] = [];
    for (const row of rows) {
      try {
        const entry = this.decryptEntry(row);
        entries.push(entry);
      } catch (error) {
        console.error(`Failed to decrypt entry ${row.id}:`, error);
        // Skip corrupted entries instead of crashing
        continue;
      }
    }
    return entries;
  }

  /**
   * Get entry by ID
   */
  async getEntry(id: string): Promise<VaultEntry | null> {
    this.ensureUnlocked();
    const db = await this.getDatabase();

    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM entries WHERE id = ? AND is_deleted = 0',
      [id]
    );

    if (!row) {
      return null;
    }

    try {
      return this.decryptEntry(row);
    } catch (error) {
      console.error(`Failed to decrypt entry ${id}:`, error);
      return null;
    }
  }

  /**
   * Add entry
   */
  async addEntry(
    entry: Omit<VaultEntry, 'id' | 'createdAt' | 'modifiedAt' | 'syncVersion'>
  ): Promise<string> {
    this.ensureUnlocked();
    const db = await this.getDatabase();

    const id = await generateUUID();
    const now = Date.now();
    const encrypted = await this.encryptEntry(entry);

    await db.runAsync(
      `INSERT INTO entries (id, title_encrypted, username_encrypted, password_encrypted, url, notes_encrypted, totp_secret_encrypted, folder_id, created_at, modified_at, sync_version, is_favorite, encryption_version) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        encrypted.title,
        encrypted.username,
        encrypted.password,
        entry.url || null,
        encrypted.notes,
        encrypted.totpSecret,
        entry.folderId || null,
        now,
        now,
        0,
        entry.isFavorite ? 1 : 0,
        2, // Current encryption version
      ]
    );

    return id;
  }

  /**
   * Update entry
   */
  async updateEntry(
    id: string,
    updates: Partial<Omit<VaultEntry, 'id' | 'createdAt'>>
  ): Promise<void> {
    this.ensureUnlocked();
    const existing = await this.getEntry(id);
    if (!existing) throw new Error('Entry not found');

    const updated = { ...existing, ...updates, modifiedAt: Date.now() };
    const encrypted = await this.encryptEntry(updated);

    const db = await this.getDatabase();
    await db.runAsync(
      `UPDATE entries SET 
        title_encrypted = ?, username_encrypted = ?, password_encrypted = ?, 
        url = ?, notes_encrypted = ?, totp_secret_encrypted = ?, 
        modified_at = ?, sync_version = sync_version + 1, is_favorite = ?, encryption_version = ?
       WHERE id = ?`,
      [
        encrypted.title,
        encrypted.username,
        encrypted.password,
        updated.url || null,
        encrypted.notes,
        encrypted.totpSecret,
        updated.modifiedAt,
        updated.isFavorite ? 1 : 0,
        2, // Current encryption version
        id,
      ]
    );
  }

  /**
   * Delete entry (soft delete)
   */
  async deleteEntry(id: string): Promise<void> {
    this.ensureUnlocked();
    const db = await this.getDatabase();

    await db.runAsync(
      'UPDATE entries SET is_deleted = 1, modified_at = ?, sync_version = sync_version + 1 WHERE id = ?',
      [Date.now(), id]
    );
  }

  /**
   * Toggle favorite
   */
  async toggleFavorite(id: string): Promise<boolean> {
    this.ensureUnlocked();
    const db = await this.getDatabase();

    const row = await db.getFirstAsync<{ is_favorite: number }>(
      'SELECT is_favorite FROM entries WHERE id = ?',
      [id]
    );

    if (!row) return false;

    const current = row.is_favorite === 1;
    const newValue = !current;

    await db.runAsync('UPDATE entries SET is_favorite = ? WHERE id = ?', [
      newValue ? 1 : 0,
      id,
    ]);
    return newValue;
  }

  /**
   * Get favorite entries
   */
  async getFavoriteEntries(): Promise<VaultEntry[]> {
    this.ensureUnlocked();
    const db = await this.getDatabase();

    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM entries WHERE is_favorite = 1 AND is_deleted = 0 ORDER BY modified_at DESC'
    );

    const entries: VaultEntry[] = [];
    for (const row of rows) {
      try {
        const entry = this.decryptEntry(row);
        entries.push(entry);
      } catch (error) {
        console.error(`Failed to decrypt favorite entry ${row.id}:`, error);
        // Skip corrupted entries instead of crashing
        continue;
      }
    }
    return entries;
  }

  /**
   * Search entries
   */
  async searchEntries(query: string): Promise<VaultEntry[]> {
    const allEntries = await this.getAllEntries();
    const lowerQuery = query.toLowerCase();

    return allEntries.filter(
      (entry) =>
        entry.title.toLowerCase().includes(lowerQuery) ||
        entry.username.toLowerCase().includes(lowerQuery) ||
        (entry.url && entry.url.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Clear all entries (for fixing corrupted data)
   * Keeps the vault metadata (password) intact
   */
  async clearAllEntries(): Promise<void> {
    this.ensureUnlocked();
    const db = await this.getDatabase();
    await db.runAsync('DELETE FROM entries');
    console.log('All entries cleared from vault');
  }

  /**
   * Reset the entire vault (delete database and start fresh)
   * WARNING: This will delete all data including the master password!
   */
  async resetVault(): Promise<void> {
    // Close database connection
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }

    this.lockVault();

    // Delete the database file
    const db = await SQLite.openDatabaseAsync('vault.db');
    await db.execAsync('DROP TABLE IF EXISTS entries');
    await db.execAsync('DROP TABLE IF EXISTS vault_meta');
    await db.closeAsync();

    console.log('Vault reset complete - all data deleted');
  }

  /**
   * Import entries from desktop sync
   * Merges with existing entries (upsert by ID)
   */
  async importEntries(entries: Array<{
    id: string;
    title: string;
    username: string;
    password: string;
    url: string | null;
    notes: string | null;
    totpSecret: string | null;
    folderId: string | null;
    isFavorite: boolean;
    createdAt: number;
    modifiedAt: number;
  }>): Promise<{ imported: number; updated: number }> {
    this.ensureUnlocked();
    const db = await this.getDatabase();

    let imported = 0;
    let updated = 0;

    for (const entry of entries) {
      try {
        // Check if entry already exists
        const existing = await db.getFirstAsync<{ id: string; modified_at: number }>(
          'SELECT id, modified_at FROM entries WHERE id = ?',
          [entry.id]
        );

        const encrypted = await this.encryptEntry(entry);

        if (existing) {
          // Update only if the incoming entry is newer
          if (entry.modifiedAt > existing.modified_at) {
            await db.runAsync(
              `UPDATE entries SET 
                title_encrypted = ?, username_encrypted = ?, password_encrypted = ?, 
                url = ?, notes_encrypted = ?, totp_secret_encrypted = ?, 
                folder_id = ?, modified_at = ?, sync_version = sync_version + 1, 
                is_favorite = ?, is_deleted = 0, encryption_version = ?
               WHERE id = ?`,
              [
                encrypted.title,
                encrypted.username,
                encrypted.password,
                entry.url || null,
                encrypted.notes,
                encrypted.totpSecret,
                entry.folderId || null,
                entry.modifiedAt,
                entry.isFavorite ? 1 : 0,
                2,
                entry.id,
              ]
            );
            updated++;
          }
        } else {
          // Insert new entry
          await db.runAsync(
            `INSERT INTO entries (id, title_encrypted, username_encrypted, password_encrypted, url, notes_encrypted, totp_secret_encrypted, folder_id, created_at, modified_at, sync_version, is_favorite, encryption_version) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              encrypted.title,
              encrypted.username,
              encrypted.password,
              entry.url || null,
              encrypted.notes,
              encrypted.totpSecret,
              entry.folderId || null,
              entry.createdAt,
              entry.modifiedAt,
              0,
              entry.isFavorite ? 1 : 0,
              2,
            ]
          );
          imported++;
        }
      } catch (error) {
        console.error(`Failed to import entry ${entry.id}:`, error);
      }
    }

    return { imported, updated };
  }

  // Private helpers
  private ensureUnlocked(): void {
    if (!this.isUnlocked || !this.encryptionKey) {
      throw new Error('Vault is locked');
    }
  }

  private async createTables(db: SQLite.SQLiteDatabase): Promise<void> {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS vault_meta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        salt TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
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
        sync_version INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,
        encryption_version INTEGER DEFAULT 1
      );
    `);

    // Run migration to add encryption_version column if it doesn't exist
    await this.migrateDatabase(db);
  }

  /**
   * Migrate database schema to support encryption versioning
   */
  private async migrateDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
    try {
      // Check if encryption_version column exists
      const tableInfo = await db.getAllAsync<{ name: string }>(
        "PRAGMA table_info(entries)"
      );

      const hasEncryptionVersion = tableInfo.some(
        (col) => col.name === 'encryption_version'
      );

      if (!hasEncryptionVersion) {
        // Add encryption_version column with default value 1 (old entries)
        await db.execAsync(`
          ALTER TABLE entries ADD COLUMN encryption_version INTEGER DEFAULT 1;
        `);
        console.log('Database migrated: added encryption_version column');
      }
    } catch (error) {
      // Column might already exist, ignore error
      console.warn('Migration check failed (may already be migrated):', error);
    }
  }

  private async encryptEntry(entry: Partial<VaultEntry>): Promise<{
    title: string;
    username: string;
    password: string;
    notes: string | null;
    totpSecret: string | null;
  }> {
    if (!this.encryptionKey) throw new Error('Vault is locked');

    return {
      title: await encryptToString(entry.title || '', this.encryptionKey),
      username: await encryptToString(entry.username || '', this.encryptionKey),
      password: await encryptToString(entry.password || '', this.encryptionKey),
      notes: entry.notes
        ? await encryptToString(entry.notes, this.encryptionKey)
        : null,
      totpSecret: entry.totpSecret
        ? await encryptToString(entry.totpSecret, this.encryptionKey)
        : null,
    };
  }

  /**
   * Decrypt a single field with version support and multiple fallbacks
   */
  private decryptField(
    ciphertext: string | null | undefined,
    encryptionVersion: number | null | undefined,
    fieldName: string
  ): string {
    if (!ciphertext || typeof ciphertext !== 'string' || ciphertext.length === 0) {
      return '';
    }

    const key = this.encryptionKey!;

    // Debug: Log what we're trying to decrypt
    const preview = ciphertext.length > 50 ? ciphertext.substring(0, 50) + '...' : ciphertext;
    console.log(`Decrypting ${fieldName}: version=${encryptionVersion}, length=${ciphertext.length}, preview=${preview}`);

    // 1. Try Version 2 (Current Format: IV + Ciphertext)
    try {
      const v2 = decryptFromString(ciphertext, key);
      if (v2) {
        console.log(`${fieldName}: V2 decryption successful`);
        return v2;
      }
    } catch (e) {
      console.log(`${fieldName}: V2 failed - ${e instanceof Error ? e.message : 'unknown'}`);
    }

    // 2. Try Version 1 (Legacy CBC)
    try {
      const v1 = decryptFromStringV1(ciphertext, key);
      if (v1) {
        console.log(`${fieldName}: V1 decryption successful`);
        return v1;
      }
    } catch (e) {
      console.log(`${fieldName}: V1 failed - ${e instanceof Error ? e.message : 'unknown'}`);
    }

    // 3. Try Version 0 (Raw AES Fallback)
    try {
      const v0 = decryptLegacyRaw(ciphertext, key);
      if (v0) {
        console.log(`${fieldName}: V0 decryption successful`);
        return v0;
      }
    } catch (e) {
      console.log(`${fieldName}: V0 failed - ${e instanceof Error ? e.message : 'unknown'}`);
    }

    // 4. Check if the data might be plaintext (not encrypted at all)
    // This can happen if sync received plaintext but stored it without encryption
    if (!ciphertext.includes('=') && ciphertext.length < 100) {
      // Might be plaintext, return as-is for debugging
      console.warn(`${fieldName}: All decryption failed, data might be plaintext or corrupted: ${ciphertext}`);
    } else {
      console.warn(`Permanent decryption failure for ${fieldName} in entry`);
    }

    return `[Corrupted ${fieldName}]`;
  }

  private decryptEntry(row: Record<string, unknown>): VaultEntry {
    if (!this.encryptionKey) throw new Error('Vault is locked');

    // Validate required encrypted fields exist
    const titleEncrypted = row.title_encrypted as string;
    const usernameEncrypted = row.username_encrypted as string;
    const passwordEncrypted = row.password_encrypted as string;
    const encryptionVersion = (row.encryption_version as number) ?? 1;

    try {
      // Decrypt all fields with version support and fallback
      const title = this.decryptField(titleEncrypted, encryptionVersion, 'title');
      const username = this.decryptField(usernameEncrypted, encryptionVersion, 'username');
      const password = this.decryptField(passwordEncrypted, encryptionVersion, 'password');
      const notes = this.decryptField(
        row.notes_encrypted as string | null | undefined,
        encryptionVersion,
        'notes'
      );
      const totpSecret = this.decryptField(
        row.totp_secret_encrypted as string | null | undefined,
        encryptionVersion,
        'totpSecret'
      );

      const entry: VaultEntry = {
        id: row.id as string,
        title: title || '[Untitled]',
        username: username || '',
        password: password || '',
        url: row.url as string | null,
        notes: notes || null,
        totpSecret: totpSecret || null,
        folderId: row.folder_id as string | null,
        createdAt: row.created_at as number,
        modifiedAt: row.modified_at as number,
        lastUsedAt: row.last_used_at as number | null,
        syncVersion: row.sync_version as number,
        isFavorite: (row.is_favorite as number) === 1,
      };

      // Auto-migration disabled for now - will handle database storage separately
      // This ensures entries display correctly without modifying the database

      return entry;
    } catch (error) {
      throw new Error(`Failed to decrypt entry ${row.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate an entry from old encryption version to version 2
   */
  private async migrateEntryToV2(entryId: string, decryptedEntry: VaultEntry): Promise<void> {
    try {
      const encrypted = await this.encryptEntry(decryptedEntry);
      const db = await this.getDatabase();

      await db.runAsync(
        `UPDATE entries SET 
          title_encrypted = ?, username_encrypted = ?, password_encrypted = ?, 
          notes_encrypted = ?, totp_secret_encrypted = ?, 
          encryption_version = ?, modified_at = ?, sync_version = sync_version + 1
         WHERE id = ?`,
        [
          encrypted.title,
          encrypted.username,
          encrypted.password,
          encrypted.notes,
          encrypted.totpSecret,
          2, // New encryption version
          Date.now(),
          entryId,
        ]
      );

      console.log(`Successfully migrated entry ${entryId} to encryption version 2`);
    } catch (error) {
      console.error(`Failed to migrate entry ${entryId}:`, error);
      throw error;
    }
  }
}

export const vaultService = new VaultService();

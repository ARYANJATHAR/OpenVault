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
      entries.push(this.decryptEntry(row));
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

    return this.decryptEntry(row);
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
      `INSERT INTO entries (id, title_encrypted, username_encrypted, password_encrypted, url, notes_encrypted, totp_secret_encrypted, folder_id, created_at, modified_at, sync_version, is_favorite) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        modified_at = ?, sync_version = sync_version + 1, is_favorite = ?
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
      entries.push(this.decryptEntry(row));
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
        is_favorite INTEGER DEFAULT 0
      );
    `);
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

  private decryptEntry(row: Record<string, unknown>): VaultEntry {
    if (!this.encryptionKey) throw new Error('Vault is locked');

    return {
      id: row.id as string,
      title: decryptFromString(row.title_encrypted as string, this.encryptionKey),
      username: decryptFromString(row.username_encrypted as string, this.encryptionKey),
      password: decryptFromString(row.password_encrypted as string, this.encryptionKey),
      url: row.url as string | null,
      notes: row.notes_encrypted
        ? decryptFromString(row.notes_encrypted as string, this.encryptionKey)
        : null,
      totpSecret: row.totp_secret_encrypted
        ? decryptFromString(row.totp_secret_encrypted as string, this.encryptionKey)
        : null,
      folderId: row.folder_id as string | null,
      createdAt: row.created_at as number,
      modifiedAt: row.modified_at as number,
      lastUsedAt: row.last_used_at as number | null,
      syncVersion: row.sync_version as number,
      isFavorite: (row.is_favorite as number) === 1,
    };
  }
}

export const vaultService = new VaultService();

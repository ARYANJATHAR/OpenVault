/**
 * Core Encryption Module
 * 
 * Provides military-grade encryption primitives for the password vault:
 * - AES-256-GCM for symmetric encryption
 * - Argon2id for key derivation (memory-hard, OWASP recommended)
 * - HKDF for deriving multiple keys from master key
 * 
 * SECURITY NOTES:
 * - All keys are derived from master password, never stored directly
 * - Nonces are randomly generated for each encryption operation
 * - Memory is zeroed after use where possible
 */

import * as crypto from 'crypto';
import argon2 from 'argon2';

// ============================================================================
// Constants
// ============================================================================

/** AES-256-GCM key length in bytes */
export const AES_KEY_LENGTH = 32;

/** AES-GCM nonce length in bytes (96 bits recommended by NIST) */
export const AES_NONCE_LENGTH = 12;

/** AES-GCM authentication tag length in bytes */
export const AES_TAG_LENGTH = 16;

/** Salt length for Argon2 in bytes */
export const SALT_LENGTH = 16;

/** Argon2 configuration - OWASP recommended for password hashing */
export const ARGON2_CONFIG = {
    type: argon2.argon2id,      // Hybrid of argon2i and argon2d
    memoryCost: 65536,          // 64 MB
    timeCost: 3,                // 3 iterations
    parallelism: 4,             // 4 parallel threads
    hashLength: 32,             // 256-bit output
} as const;

// ============================================================================
// Types
// ============================================================================

export interface EncryptedData {
    /** Encrypted ciphertext */
    ciphertext: Buffer;
    /** Nonce used for encryption (unique per encryption) */
    nonce: Buffer;
    /** Authentication tag for integrity verification */
    tag: Buffer;
}

export interface DerivedKeys {
    /** Main vault encryption key */
    vaultKey: Buffer;
    /** Key for LAN sync handshake */
    syncKey: Buffer;
    /** Key for encrypted exports */
    exportKey: Buffer;
}

export interface VaultHeader {
    /** Vault format version */
    version: number;
    /** Salt used for key derivation */
    salt: Buffer;
    /** Argon2 memory cost parameter */
    memoryCost: number;
    /** Argon2 time cost parameter */
    timeCost: number;
    /** Argon2 parallelism parameter */
    parallelism: number;
}

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt(): Buffer {
    return crypto.randomBytes(SALT_LENGTH);
}

/**
 * Generate a cryptographically secure random nonce for AES-GCM
 */
export function generateNonce(): Buffer {
    return crypto.randomBytes(AES_NONCE_LENGTH);
}

/**
 * Derive a master key from password using Argon2id
 * 
 * @param password - User's master password
 * @param salt - Random salt (store with vault)
 * @returns 256-bit master key
 */
export async function deriveMasterKey(
    password: string,
    salt: Buffer
): Promise<Buffer> {
    const hash = await argon2.hash(password, {
        ...ARGON2_CONFIG,
        salt,
        raw: true, // Return raw bytes instead of encoded string
    });

    return Buffer.from(hash);
}

/**
 * Derive multiple purpose-specific keys from master key using HKDF
 * 
 * Key Hierarchy:
 * Master Key → HKDF → Vault Key (encrypts entries)
 *                  → Sync Key (LAN handshake)
 *                  → Export Key (backup export)
 * 
 * @param masterKey - 256-bit master key from Argon2
 * @returns Object containing derived keys
 */
export function deriveKeys(masterKey: Buffer): DerivedKeys {
    // Use HKDF to derive purpose-specific keys
    const vaultKey = crypto.hkdfSync(
        'sha256',
        masterKey,
        Buffer.alloc(0), // No salt for HKDF (already salted in Argon2)
        Buffer.from('vault-encryption-key'),
        AES_KEY_LENGTH
    );

    const syncKey = crypto.hkdfSync(
        'sha256',
        masterKey,
        Buffer.alloc(0),
        Buffer.from('sync-handshake-key'),
        AES_KEY_LENGTH
    );

    const exportKey = crypto.hkdfSync(
        'sha256',
        masterKey,
        Buffer.alloc(0),
        Buffer.from('export-encryption-key'),
        AES_KEY_LENGTH
    );

    return {
        vaultKey: Buffer.from(vaultKey),
        syncKey: Buffer.from(syncKey),
        exportKey: Buffer.from(exportKey),
    };
}

// ============================================================================
// Encryption / Decryption (AES-256-GCM)
// ============================================================================

/**
 * Encrypt data using AES-256-GCM
 * 
 * @param plaintext - Data to encrypt
 * @param key - 256-bit encryption key
 * @param associatedData - Optional authenticated data (not encrypted but verified)
 * @returns Encrypted data with nonce and auth tag
 */
export function encrypt(
    plaintext: Buffer | string,
    key: Buffer,
    associatedData?: Buffer
): EncryptedData {
    const nonce = generateNonce();
    const plaintextBuffer = Buffer.isBuffer(plaintext)
        ? plaintext
        : Buffer.from(plaintext, 'utf8');

    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);

    if (associatedData) {
        cipher.setAAD(associatedData);
    }

    const ciphertext = Buffer.concat([
        cipher.update(plaintextBuffer),
        cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return { ciphertext, nonce, tag };
}

/**
 * Decrypt data using AES-256-GCM
 * 
 * @param encryptedData - Encrypted data with nonce and tag
 * @param key - 256-bit decryption key
 * @param associatedData - Optional authenticated data (must match encryption)
 * @returns Decrypted plaintext
 * @throws Error if authentication fails (tampered data)
 */
export function decrypt(
    encryptedData: EncryptedData,
    key: Buffer,
    associatedData?: Buffer
): Buffer {
    const { ciphertext, nonce, tag } = encryptedData;

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);

    if (associatedData) {
        decipher.setAAD(associatedData);
    }

    try {
        const plaintext = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);
        return plaintext;
    } catch (error) {
        throw new Error('Decryption failed: Invalid key or tampered data');
    }
}

/**
 * Encrypt a string and return as base64-encoded bundle
 * Convenient for storing in database
 */
export function encryptToString(
    plaintext: string,
    key: Buffer
): string {
    const encrypted = encrypt(plaintext, key);

    // Pack: nonce (12) + tag (16) + ciphertext
    const packed = Buffer.concat([
        encrypted.nonce,
        encrypted.tag,
        encrypted.ciphertext,
    ]);

    return packed.toString('base64');
}

/**
 * Decrypt a base64-encoded bundle back to string
 */
export function decryptFromString(
    packed: string,
    key: Buffer
): string {
    const buffer = Buffer.from(packed, 'base64');

    const nonce = buffer.subarray(0, AES_NONCE_LENGTH);
    const tag = buffer.subarray(AES_NONCE_LENGTH, AES_NONCE_LENGTH + AES_TAG_LENGTH);
    const ciphertext = buffer.subarray(AES_NONCE_LENGTH + AES_TAG_LENGTH);

    const plaintext = decrypt({ ciphertext, nonce, tag }, key);
    return plaintext.toString('utf8');
}

// ============================================================================
// Secure Memory Utilities
// ============================================================================

/**
 * Securely wipe a buffer by overwriting with zeros
 * Note: Due to JS GC, this is best-effort but better than nothing
 */
export function secureWipe(buffer: Buffer): void {
    buffer.fill(0);
}

/**
 * Create a vault header with default Argon2 parameters
 */
export function createVaultHeader(): VaultHeader {
    return {
        version: 1,
        salt: generateSalt(),
        memoryCost: ARGON2_CONFIG.memoryCost,
        timeCost: ARGON2_CONFIG.timeCost,
        parallelism: ARGON2_CONFIG.parallelism,
    };
}

/**
 * Serialize vault header to buffer for storage
 */
export function serializeVaultHeader(header: VaultHeader): Buffer {
    const buffer = Buffer.alloc(4 + SALT_LENGTH + 4 + 4 + 4);
    let offset = 0;

    buffer.writeUInt32LE(header.version, offset);
    offset += 4;

    header.salt.copy(buffer, offset);
    offset += SALT_LENGTH;

    buffer.writeUInt32LE(header.memoryCost, offset);
    offset += 4;

    buffer.writeUInt32LE(header.timeCost, offset);
    offset += 4;

    buffer.writeUInt32LE(header.parallelism, offset);

    return buffer;
}

/**
 * Deserialize vault header from buffer
 */
export function deserializeVaultHeader(buffer: Buffer): VaultHeader {
    let offset = 0;

    const version = buffer.readUInt32LE(offset);
    offset += 4;

    const salt = buffer.subarray(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;

    const memoryCost = buffer.readUInt32LE(offset);
    offset += 4;

    const timeCost = buffer.readUInt32LE(offset);
    offset += 4;

    const parallelism = buffer.readUInt32LE(offset);

    return {
        version,
        salt: Buffer.from(salt),
        memoryCost,
        timeCost,
        parallelism,
    };
}

/**
 * Verify master password against stored hash
 * Returns true if password is correct
 */
export async function verifyMasterPassword(
    password: string,
    salt: Buffer,
    expectedKeyHash: Buffer
): Promise<boolean> {
    const derivedKey = await deriveMasterKey(password, salt);
    const keyHash = crypto.createHash('sha256').update(derivedKey).digest();

    // Constant-time comparison to prevent timing attacks
    const result = crypto.timingSafeEqual(keyHash, expectedKeyHash);

    // Wipe derived key from memory
    secureWipe(derivedKey);

    return result;
}

/**
 * Generate a hash of the master key for verification
 * Store this hash (not the key!) to verify passwords
 */
export function hashMasterKey(masterKey: Buffer): Buffer {
    return crypto.createHash('sha256').update(masterKey).digest();
}

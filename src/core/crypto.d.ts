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
/** AES-256-GCM key length in bytes */
export declare const AES_KEY_LENGTH = 32;
/** AES-GCM nonce length in bytes (96 bits recommended by NIST) */
export declare const AES_NONCE_LENGTH = 12;
/** AES-GCM authentication tag length in bytes */
export declare const AES_TAG_LENGTH = 16;
/** Salt length for Argon2 in bytes */
export declare const SALT_LENGTH = 16;
/** Argon2 configuration - OWASP recommended for password hashing */
export declare const ARGON2_CONFIG: {
    readonly type: 2;
    readonly memoryCost: 65536;
    readonly timeCost: 3;
    readonly parallelism: 4;
    readonly hashLength: 32;
};
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
/**
 * Generate a cryptographically secure random salt
 */
export declare function generateSalt(): Buffer;
/**
 * Generate a cryptographically secure random nonce for AES-GCM
 */
export declare function generateNonce(): Buffer;
/**
 * Derive a master key from password using Argon2id
 *
 * @param password - User's master password
 * @param salt - Random salt (store with vault)
 * @returns 256-bit master key
 */
export declare function deriveMasterKey(password: string, salt: Buffer): Promise<Buffer>;
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
export declare function deriveKeys(masterKey: Buffer): DerivedKeys;
/**
 * Encrypt data using AES-256-GCM
 *
 * @param plaintext - Data to encrypt
 * @param key - 256-bit encryption key
 * @param associatedData - Optional authenticated data (not encrypted but verified)
 * @returns Encrypted data with nonce and auth tag
 */
export declare function encrypt(plaintext: Buffer | string, key: Buffer, associatedData?: Buffer): EncryptedData;
/**
 * Decrypt data using AES-256-GCM
 *
 * @param encryptedData - Encrypted data with nonce and tag
 * @param key - 256-bit decryption key
 * @param associatedData - Optional authenticated data (must match encryption)
 * @returns Decrypted plaintext
 * @throws Error if authentication fails (tampered data)
 */
export declare function decrypt(encryptedData: EncryptedData, key: Buffer, associatedData?: Buffer): Buffer;
/**
 * Encrypt a string and return as base64-encoded bundle
 * Convenient for storing in database
 */
export declare function encryptToString(plaintext: string, key: Buffer): string;
/**
 * Decrypt a base64-encoded bundle back to string
 */
export declare function decryptFromString(packed: string, key: Buffer): string;
/**
 * Securely wipe a buffer by overwriting with zeros
 * Note: Due to JS GC, this is best-effort but better than nothing
 */
export declare function secureWipe(buffer: Buffer): void;
/**
 * Create a vault header with default Argon2 parameters
 */
export declare function createVaultHeader(): VaultHeader;
/**
 * Serialize vault header to buffer for storage
 */
export declare function serializeVaultHeader(header: VaultHeader): Buffer;
/**
 * Deserialize vault header from buffer
 */
export declare function deserializeVaultHeader(buffer: Buffer): VaultHeader;
/**
 * Verify master password against stored hash
 * Returns true if password is correct
 */
export declare function verifyMasterPassword(password: string, salt: Buffer, expectedKeyHash: Buffer): Promise<boolean>;
/**
 * Generate a hash of the master key for verification
 * Store this hash (not the key!) to verify passwords
 */
export declare function hashMasterKey(masterKey: Buffer): Buffer;
//# sourceMappingURL=crypto.d.ts.map
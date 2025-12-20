"use strict";
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
exports.ARGON2_CONFIG = exports.SALT_LENGTH = exports.AES_TAG_LENGTH = exports.AES_NONCE_LENGTH = exports.AES_KEY_LENGTH = void 0;
exports.generateSalt = generateSalt;
exports.generateNonce = generateNonce;
exports.deriveMasterKey = deriveMasterKey;
exports.deriveKeys = deriveKeys;
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.encryptToString = encryptToString;
exports.decryptFromString = decryptFromString;
exports.secureWipe = secureWipe;
exports.createVaultHeader = createVaultHeader;
exports.serializeVaultHeader = serializeVaultHeader;
exports.deserializeVaultHeader = deserializeVaultHeader;
exports.verifyMasterPassword = verifyMasterPassword;
exports.hashMasterKey = hashMasterKey;
const crypto = __importStar(require("crypto"));
const argon2_1 = __importDefault(require("argon2"));
// ============================================================================
// Constants
// ============================================================================
/** AES-256-GCM key length in bytes */
exports.AES_KEY_LENGTH = 32;
/** AES-GCM nonce length in bytes (96 bits recommended by NIST) */
exports.AES_NONCE_LENGTH = 12;
/** AES-GCM authentication tag length in bytes */
exports.AES_TAG_LENGTH = 16;
/** Salt length for Argon2 in bytes */
exports.SALT_LENGTH = 16;
/** Argon2 configuration - OWASP recommended for password hashing */
exports.ARGON2_CONFIG = {
    type: argon2_1.default.argon2id, // Hybrid of argon2i and argon2d
    memoryCost: 65536, // 64 MB
    timeCost: 3, // 3 iterations
    parallelism: 4, // 4 parallel threads
    hashLength: 32, // 256-bit output
};
// ============================================================================
// Key Derivation
// ============================================================================
/**
 * Generate a cryptographically secure random salt
 */
function generateSalt() {
    return crypto.randomBytes(exports.SALT_LENGTH);
}
/**
 * Generate a cryptographically secure random nonce for AES-GCM
 */
function generateNonce() {
    return crypto.randomBytes(exports.AES_NONCE_LENGTH);
}
/**
 * Derive a master key from password using Argon2id
 *
 * @param password - User's master password
 * @param salt - Random salt (store with vault)
 * @returns 256-bit master key
 */
async function deriveMasterKey(password, salt) {
    const hash = await argon2_1.default.hash(password, {
        ...exports.ARGON2_CONFIG,
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
function deriveKeys(masterKey) {
    // Use HKDF to derive purpose-specific keys
    const vaultKey = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), // No salt for HKDF (already salted in Argon2)
    Buffer.from('vault-encryption-key'), exports.AES_KEY_LENGTH);
    const syncKey = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from('sync-handshake-key'), exports.AES_KEY_LENGTH);
    const exportKey = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from('export-encryption-key'), exports.AES_KEY_LENGTH);
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
function encrypt(plaintext, key, associatedData) {
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
function decrypt(encryptedData, key, associatedData) {
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
    }
    catch (error) {
        throw new Error('Decryption failed: Invalid key or tampered data');
    }
}
/**
 * Encrypt a string and return as base64-encoded bundle
 * Convenient for storing in database
 */
function encryptToString(plaintext, key) {
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
function decryptFromString(packed, key) {
    const buffer = Buffer.from(packed, 'base64');
    const nonce = buffer.subarray(0, exports.AES_NONCE_LENGTH);
    const tag = buffer.subarray(exports.AES_NONCE_LENGTH, exports.AES_NONCE_LENGTH + exports.AES_TAG_LENGTH);
    const ciphertext = buffer.subarray(exports.AES_NONCE_LENGTH + exports.AES_TAG_LENGTH);
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
function secureWipe(buffer) {
    buffer.fill(0);
}
/**
 * Create a vault header with default Argon2 parameters
 */
function createVaultHeader() {
    return {
        version: 1,
        salt: generateSalt(),
        memoryCost: exports.ARGON2_CONFIG.memoryCost,
        timeCost: exports.ARGON2_CONFIG.timeCost,
        parallelism: exports.ARGON2_CONFIG.parallelism,
    };
}
/**
 * Serialize vault header to buffer for storage
 */
function serializeVaultHeader(header) {
    const buffer = Buffer.alloc(4 + exports.SALT_LENGTH + 4 + 4 + 4);
    let offset = 0;
    buffer.writeUInt32LE(header.version, offset);
    offset += 4;
    header.salt.copy(buffer, offset);
    offset += exports.SALT_LENGTH;
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
function deserializeVaultHeader(buffer) {
    let offset = 0;
    const version = buffer.readUInt32LE(offset);
    offset += 4;
    const salt = buffer.subarray(offset, offset + exports.SALT_LENGTH);
    offset += exports.SALT_LENGTH;
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
async function verifyMasterPassword(password, salt, expectedKeyHash) {
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
function hashMasterKey(masterKey) {
    return crypto.createHash('sha256').update(masterKey).digest();
}
//# sourceMappingURL=crypto.js.map
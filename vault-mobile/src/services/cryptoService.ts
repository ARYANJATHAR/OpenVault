/**
 * Crypto Service
 * Encryption/decryption and key derivation for Expo
 * Uses expo-crypto for secure random generation
 */

import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

export interface VaultHeader {
  salt: string; // Base64 encoded
  iterations: number;
  version: number;
}

export interface DerivedKeys {
  vaultKey: string; // Base64 encoded
  syncKey: string; // Base64 encoded
  exportKey: string; // Base64 encoded
}

/**
 * Generate random bytes using expo-crypto
 */
export async function getRandomBytes(length: number): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(length);
  // Convert Uint8Array to base64
  const binary = String.fromCharCode(...bytes);
  return btoa(binary);
}

/**
 * Create vault header with salt
 */
export async function createVaultHeader(): Promise<VaultHeader> {
  const salt = await getRandomBytes(32);
  return {
    salt,
    iterations: 100000, // Match desktop app for cross-device compatibility
    version: 1,
  };
}

/**
 * Derive master key from password using PBKDF2
 * @param password - The master password
 * @param salt - The salt stored in vault_meta
 * @param iterations - Number of PBKDF2 iterations (default 100000 for backwards compatibility)
 */
export async function deriveMasterKey(
  password: string,
  salt: string,
  iterations: number = 100000 // Default to 100k for backwards compatibility with existing vaults
): Promise<string> {
  const keyLength = 256 / 32; // 256 bits = 8 words

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: keyLength,
    iterations: iterations,
  });

  return key.toString(CryptoJS.enc.Base64);
}

/**
 * Derive sub-keys from master key
 */
export function deriveKeys(masterKey: string): DerivedKeys {
  const masterKeyBytes = CryptoJS.enc.Base64.parse(masterKey);

  const vaultKey = CryptoJS.HmacSHA256(masterKeyBytes, 'vault-key').toString(CryptoJS.enc.Base64);
  const syncKey = CryptoJS.HmacSHA256(masterKeyBytes, 'sync-key').toString(CryptoJS.enc.Base64);
  const exportKey = CryptoJS.HmacSHA256(masterKeyBytes, 'export-key').toString(CryptoJS.enc.Base64);

  return { vaultKey, syncKey, exportKey };
}

/**
 * Hash master key for verification
 */
export function hashMasterKey(key: string): string {
  const keyBytes = CryptoJS.enc.Base64.parse(key);
  return CryptoJS.SHA256(keyBytes).toString(CryptoJS.enc.Base64);
}

/**
 * Encrypt string with AES-256-CBC
 * Uses expo-crypto for secure IV generation
 */
export async function encryptToString(plaintext: string, key: string): Promise<string> {
  const keyBytes = CryptoJS.enc.Base64.parse(key);

  // Generate IV using expo-crypto (secure random)
  const ivBytes = await Crypto.getRandomBytesAsync(16);
  // IMPORTANT: CryptoJS WordArray "words" are 32-bit; passing a byte[] makes a 64-byte IV.
  // Build a proper 16-byte WordArray.
  const ivWords: number[] = [];
  for (let i = 0; i < ivBytes.length; i += 4) {
    ivWords.push(
      ((ivBytes[i]! << 24) | (ivBytes[i + 1]! << 16) | (ivBytes[i + 2]! << 8) | ivBytes[i + 3]!) >>> 0
    );
  }
  const iv = CryptoJS.lib.WordArray.create(ivWords, 16);

  const encrypted = CryptoJS.AES.encrypt(plaintext, keyBytes, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // Combine IV + encrypted data
  const combined = iv.concat(encrypted.ciphertext);
  return combined.toString(CryptoJS.enc.Base64);
}

/**
 * Decrypt string with AES (Version 0 - Absolute legacy fallback)
 */
export function decryptLegacyRaw(ciphertext: string, key: string): string {
  if (!ciphertext || !key) return '';
  try {
    const decrypted = CryptoJS.AES.decrypt(ciphertext, key);
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    return result;
  } catch {
    return '';
  }
}

/**
 * Decrypt string with AES-256-CBC (Version 1 - legacy format)
 */
export function decryptFromStringV1(ciphertext: string, key: string): string {
  if (!ciphertext || typeof ciphertext !== 'string') return '';
  if (!key) throw new Error('Encryption key missing');

  try {
    const keyBytes = CryptoJS.enc.Base64.parse(key);
    const decrypted = CryptoJS.AES.decrypt(ciphertext, keyBytes, {
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (!result && ciphertext.length > 0) throw new Error('V1 decryption returned empty');
    return result;
  } catch (error) {
    throw new Error('V1 decryption failed');
  }
}

/**
 * Decrypt string with AES-256-CBC (Version 2 - current format)
 */
export function decryptFromString(ciphertext: string, key: string): string {
  if (!ciphertext || typeof ciphertext !== 'string') return '';
  if (!key) throw new Error('Encryption key missing');

  try {
    const keyBytes = CryptoJS.enc.Base64.parse(key);
    const combined = CryptoJS.enc.Base64.parse(ciphertext);

    // Safety check for WordArray
    if (!combined || !combined.words || combined.words.length < 4) {
      throw new Error('Invalid or too short ciphertext');
    }

    const tryDecryptCbc = (ivWordStart: number, ivWordCount: number, ctWordStart: number, ctSigBytes: number, label: string) => {
      const ivWordsLocal = combined.words.slice(ivWordStart, ivWordStart + ivWordCount);
      const iv = CryptoJS.lib.WordArray.create(ivWordsLocal, 16);
      const ctWordsLocal = combined.words.slice(ctWordStart);
      const encryptedData = CryptoJS.lib.WordArray.create(ctWordsLocal, ctSigBytes);

      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: encryptedData } as CryptoJS.lib.CipherParams,
        keyBytes,
        { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
      );

      if (!decrypted || !decrypted.words || decrypted.words.length === 0) return null;

      try {
        const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
        return plaintext;
      } catch (e) {
        return null;
      }
    };

    // Attempt A (expected format): [16-byte IV][ciphertext...]
    const ctSigBytesA = combined.sigBytes - 16;
    const plaintextA =
      ctSigBytesA > 0 ? tryDecryptCbc(0, 4, 4, ctSigBytesA, 'cbc16') : null;
    if (plaintextA && plaintextA.length > 0) return plaintextA;

    // Attempt B (legacy buggy packing): [64-byte IV-block][ciphertext...]
    // The stored prefix is 16 words (=64 bytes) because IV bytes were incorrectly treated as words.
    const ctSigBytesB = combined.sigBytes - 64;
    const plaintextB =
      ctSigBytesB > 0 && combined.words.length >= 16
        ? tryDecryptCbc(0, 4, 16, ctSigBytesB, 'cbc64')
        : null;
    if (plaintextB !== null) return plaintextB;

    // If A produced empty string, still prefer it over throwing (caller will fallback)
    if (plaintextA !== null) return plaintextA;

    throw new Error('Decryption resulted in no valid plaintext');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Decryption failed: ${msg}`);
  }
}

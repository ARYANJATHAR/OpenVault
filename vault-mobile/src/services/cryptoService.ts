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
    iterations: 100000,
    version: 1,
  };
}

/**
 * Derive master key from password using PBKDF2
 */
export async function deriveMasterKey(password: string, salt: string): Promise<string> {
  const iterations = 100000;
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
  const iv = CryptoJS.lib.WordArray.create(Array.from(ivBytes));
  
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
 * Decrypt string with AES-256-CBC
 */
export function decryptFromString(ciphertext: string, key: string): string {
  const keyBytes = CryptoJS.enc.Base64.parse(key);
  const combined = CryptoJS.enc.Base64.parse(ciphertext);
  
  // Extract IV (first 16 bytes = 4 words) and encrypted data
  const iv = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4));
  const encrypted = CryptoJS.lib.WordArray.create(combined.words.slice(4));
  
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: encrypted } as CryptoJS.lib.CipherParams,
    keyBytes,
    {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );
  
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * UUID Generator
 * Uses expo-crypto for React Native compatibility
 */

import * as Crypto from 'expo-crypto';

/**
 * Generate a UUID v4 using expo-crypto
 */
export async function generateUUID(): Promise<string> {
  // Generate 16 random bytes
  const bytes = await Crypto.getRandomBytesAsync(16);
  
  // Convert Uint8Array to regular array for modification
  const byteArray = Array.from(bytes);
  
  // Set version (4) and variant bits according to RFC 4122
  byteArray[6] = (byteArray[6] & 0x0f) | 0x40; // Version 4
  byteArray[8] = (byteArray[8] & 0x3f) | 0x80; // Variant 10
  
  // Convert to hex string
  const hex = byteArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Format as UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Synchronous UUID generator (uses async internally but returns immediately)
 * For cases where you need a UUID but can't await
 */
export function generateUUIDSync(): string {
  // Fallback: use timestamp + random for sync generation
  // This is less secure but works synchronously
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return `${timestamp}-${random}-${Math.random().toString(36).substring(2)}`.substring(0, 36);
}

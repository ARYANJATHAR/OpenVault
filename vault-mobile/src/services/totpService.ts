/**
 * TOTP Service
 * Generate time-based one-time passwords
 */

import { TOTP } from 'otpauth';

export interface TOTPResult {
  code: string;
  timeRemaining: number;
}

/**
 * Generate TOTP code from secret
 */
export function generateTOTP(secret: string): string {
  try {
    let totp: TOTP;
    
    // Check if it's an otpauth:// URL
    if (secret.startsWith('otpauth://')) {
      totp = TOTP.fromURI(secret) as TOTP;
    } else {
      // Raw secret - clean it up
      const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
      totp = new TOTP({
        secret: cleanSecret,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });
    }
    
    return totp.generate();
  } catch (error) {
    console.error('TOTP generation error:', error);
    throw new Error('Invalid TOTP secret');
  }
}

/**
 * Get time remaining until next code
 */
export function getTOTPTimeRemaining(): number {
  const period = 30;
  const now = Math.floor(Date.now() / 1000);
  return period - (now % period);
}

/**
 * Get TOTP code and time remaining
 */
export function getTOTPResult(secret: string): TOTPResult {
  return {
    code: generateTOTP(secret),
    timeRemaining: getTOTPTimeRemaining(),
  };
}

/**
 * Validate TOTP secret format
 */
export function validateTOTPSecret(secret: string): boolean {
  try {
    if (secret.startsWith('otpauth://')) {
      TOTP.fromURI(secret);
      return true;
    }
    // Check if it's base32
    const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
    const base32Regex = /^[A-Z2-7]+=*$/;
    return base32Regex.test(cleanSecret) && cleanSecret.length >= 16;
  } catch {
    return false;
  }
}

/**
 * Format TOTP code with space in middle (e.g., "123 456")
 */
export function formatTOTPCode(code: string): string {
  if (code.length === 6) {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
  }
  return code;
}

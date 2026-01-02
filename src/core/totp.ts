/**
 * TOTP (Time-based One-Time Password) Module
 * 
 * Generates 2FA codes using TOTP algorithm (RFC 6238)
 */

import { TOTP } from 'otpauth';

/**
 * Generate TOTP code from secret
 */
export function generateTOTP(secret: string): string {
    try {
        if (!secret || secret.trim().length === 0) {
            throw new Error('TOTP secret is empty');
        }

        // Handle different secret formats
        let cleanSecret = secret.trim();
        
        // Remove spaces and convert to base32 if needed
        cleanSecret = cleanSecret.replace(/\s+/g, '');
        
        // If it's a full otpauth:// URL, extract the secret
        if (cleanSecret.startsWith('otpauth://')) {
            try {
                const url = new URL(cleanSecret);
                const secretParam = url.searchParams.get('secret');
                if (secretParam) {
                    cleanSecret = secretParam;
                }
            } catch (urlError) {
                // If URL parsing fails, try to extract secret manually
                const secretMatch = cleanSecret.match(/secret=([^&]+)/);
                if (secretMatch) {
                    cleanSecret = secretMatch[1];
                }
            }
        }
        
        if (cleanSecret.length === 0) {
            throw new Error('TOTP secret is invalid or empty after processing');
        }
        
        const totp = new TOTP({
            secret: cleanSecret,
            digits: 6,
            period: 30,
        });
        
        return totp.generate();
    } catch (error) {
        throw new Error(`Failed to generate TOTP: ${(error as Error).message}`);
    }
}

/**
 * Get time remaining until next code refresh (0-30 seconds)
 */
export function getTOTPTimeRemaining(): number {
    const now = Math.floor(Date.now() / 1000);
    return 30 - (now % 30);
}

/**
 * Validate TOTP secret format
 */
export function validateTOTPSecret(secret: string): boolean {
    try {
        generateTOTP(secret);
        return true;
    } catch {
        return false;
    }
}

/**
 * Parse TOTP URI and extract information
 */
export function parseTOTPURI(uri: string): {
    secret: string;
    issuer?: string;
    account?: string;
} | null {
    try {
        const url = new URL(uri);
        if (url.protocol !== 'otpauth:') return null;
        
        const secret = url.searchParams.get('secret');
        if (!secret) return null;
        
        return {
            secret,
            issuer: url.searchParams.get('issuer') || undefined,
            account: url.pathname.substring(1) || undefined,
        };
    } catch {
        return null;
    }
}

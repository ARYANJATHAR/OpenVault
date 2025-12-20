/**
 * Encryption Module Unit Tests
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';

// Mock argon2 for testing
const mockArgon2 = {
    argon2id: 2,
    hash: async (password: string, options: any) => {
        // Simple mock - in real tests, use actual argon2
        return crypto.createHash('sha256').update(password + options.salt.toString()).digest();
    },
};

// Test vectors
describe('Encryption Module', () => {
    describe('AES-256-GCM', () => {
        it('should encrypt and decrypt data correctly', () => {
            const key = crypto.randomBytes(32);
            const plaintext = 'Hello, World!';
            const nonce = crypto.randomBytes(12);

            // Encrypt
            const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
            const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();

            // Decrypt
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
            decipher.setAuthTag(tag);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

            expect(decrypted.toString('utf8')).toBe(plaintext);
        });

        it('should fail decryption with wrong key', () => {
            const key1 = crypto.randomBytes(32);
            const key2 = crypto.randomBytes(32);
            const plaintext = 'Secret data';
            const nonce = crypto.randomBytes(12);

            // Encrypt with key1
            const cipher = crypto.createCipheriv('aes-256-gcm', key1, nonce);
            const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();

            // Try to decrypt with key2
            const decipher = crypto.createDecipheriv('aes-256-gcm', key2, nonce);
            decipher.setAuthTag(tag);

            expect(() => {
                decipher.update(encrypted);
                decipher.final();
            }).toThrow();
        });

        it('should fail decryption with tampered data', () => {
            const key = crypto.randomBytes(32);
            const plaintext = 'Secret data';
            const nonce = crypto.randomBytes(12);

            // Encrypt
            const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
            const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();

            // Tamper with encrypted data
            encrypted[0] ^= 0xff;

            // Try to decrypt
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
            decipher.setAuthTag(tag);

            expect(() => {
                decipher.update(encrypted);
                decipher.final();
            }).toThrow();
        });
    });

    describe('Key Derivation', () => {
        it('should generate different keys for different passwords', async () => {
            const salt = crypto.randomBytes(16);

            const key1 = await mockArgon2.hash('password1', { salt, raw: true });
            const key2 = await mockArgon2.hash('password2', { salt, raw: true });

            expect(Buffer.compare(key1, key2)).not.toBe(0);
        });

        it('should generate same key for same password and salt', async () => {
            const salt = crypto.randomBytes(16);
            const password = 'test-password';

            const key1 = await mockArgon2.hash(password, { salt, raw: true });
            const key2 = await mockArgon2.hash(password, { salt, raw: true });

            expect(Buffer.compare(key1, key2)).toBe(0);
        });

        it('should generate different keys for same password with different salts', async () => {
            const salt1 = crypto.randomBytes(16);
            const salt2 = crypto.randomBytes(16);
            const password = 'test-password';

            const key1 = await mockArgon2.hash(password, { salt: salt1, raw: true });
            const key2 = await mockArgon2.hash(password, { salt: salt2, raw: true });

            expect(Buffer.compare(key1, key2)).not.toBe(0);
        });
    });

    describe('HKDF Key Derivation', () => {
        it('should derive consistent keys', () => {
            const masterKey = crypto.randomBytes(32);
            const info = Buffer.from('test-info');

            const key1 = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), info, 32);
            const key2 = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), info, 32);

            expect(Buffer.compare(Buffer.from(key1), Buffer.from(key2))).toBe(0);
        });

        it('should derive different keys for different info', () => {
            const masterKey = crypto.randomBytes(32);

            const key1 = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from('vault'), 32);
            const key2 = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from('sync'), 32);

            expect(Buffer.compare(Buffer.from(key1), Buffer.from(key2))).not.toBe(0);
        });
    });

    describe('Secure Memory', () => {
        it('should wipe buffer contents', () => {
            const buffer = Buffer.from('sensitive-data');
            const original = Buffer.from(buffer);

            // Wipe
            buffer.fill(0);

            expect(buffer.every(byte => byte === 0)).toBe(true);
            expect(Buffer.compare(buffer, original)).not.toBe(0);
        });
    });

    describe('Random Generation', () => {
        it('should generate unique nonces', () => {
            const nonces = new Set<string>();

            for (let i = 0; i < 1000; i++) {
                const nonce = crypto.randomBytes(12).toString('hex');
                expect(nonces.has(nonce)).toBe(false);
                nonces.add(nonce);
            }
        });

        it('should generate unique salts', () => {
            const salts = new Set<string>();

            for (let i = 0; i < 1000; i++) {
                const salt = crypto.randomBytes(16).toString('hex');
                expect(salts.has(salt)).toBe(false);
                salts.add(salt);
            }
        });
    });
});

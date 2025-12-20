"use strict";
/**
 * Encryption Module Unit Tests
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
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const crypto = __importStar(require("crypto"));
// Mock argon2 for testing
const mockArgon2 = {
    argon2id: 2,
    hash: async (password, options) => {
        // Simple mock - in real tests, use actual argon2
        return crypto.createHash('sha256').update(password + options.salt.toString()).digest();
    },
};
// Test vectors
(0, vitest_1.describe)('Encryption Module', () => {
    (0, vitest_1.describe)('AES-256-GCM', () => {
        (0, vitest_1.it)('should encrypt and decrypt data correctly', () => {
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
            (0, vitest_1.expect)(decrypted.toString('utf8')).toBe(plaintext);
        });
        (0, vitest_1.it)('should fail decryption with wrong key', () => {
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
            (0, vitest_1.expect)(() => {
                decipher.update(encrypted);
                decipher.final();
            }).toThrow();
        });
        (0, vitest_1.it)('should fail decryption with tampered data', () => {
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
            (0, vitest_1.expect)(() => {
                decipher.update(encrypted);
                decipher.final();
            }).toThrow();
        });
    });
    (0, vitest_1.describe)('Key Derivation', () => {
        (0, vitest_1.it)('should generate different keys for different passwords', async () => {
            const salt = crypto.randomBytes(16);
            const key1 = await mockArgon2.hash('password1', { salt, raw: true });
            const key2 = await mockArgon2.hash('password2', { salt, raw: true });
            (0, vitest_1.expect)(Buffer.compare(key1, key2)).not.toBe(0);
        });
        (0, vitest_1.it)('should generate same key for same password and salt', async () => {
            const salt = crypto.randomBytes(16);
            const password = 'test-password';
            const key1 = await mockArgon2.hash(password, { salt, raw: true });
            const key2 = await mockArgon2.hash(password, { salt, raw: true });
            (0, vitest_1.expect)(Buffer.compare(key1, key2)).toBe(0);
        });
        (0, vitest_1.it)('should generate different keys for same password with different salts', async () => {
            const salt1 = crypto.randomBytes(16);
            const salt2 = crypto.randomBytes(16);
            const password = 'test-password';
            const key1 = await mockArgon2.hash(password, { salt: salt1, raw: true });
            const key2 = await mockArgon2.hash(password, { salt: salt2, raw: true });
            (0, vitest_1.expect)(Buffer.compare(key1, key2)).not.toBe(0);
        });
    });
    (0, vitest_1.describe)('HKDF Key Derivation', () => {
        (0, vitest_1.it)('should derive consistent keys', () => {
            const masterKey = crypto.randomBytes(32);
            const info = Buffer.from('test-info');
            const key1 = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), info, 32);
            const key2 = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), info, 32);
            (0, vitest_1.expect)(Buffer.compare(Buffer.from(key1), Buffer.from(key2))).toBe(0);
        });
        (0, vitest_1.it)('should derive different keys for different info', () => {
            const masterKey = crypto.randomBytes(32);
            const key1 = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from('vault'), 32);
            const key2 = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from('sync'), 32);
            (0, vitest_1.expect)(Buffer.compare(Buffer.from(key1), Buffer.from(key2))).not.toBe(0);
        });
    });
    (0, vitest_1.describe)('Secure Memory', () => {
        (0, vitest_1.it)('should wipe buffer contents', () => {
            const buffer = Buffer.from('sensitive-data');
            const original = Buffer.from(buffer);
            // Wipe
            buffer.fill(0);
            (0, vitest_1.expect)(buffer.every(byte => byte === 0)).toBe(true);
            (0, vitest_1.expect)(Buffer.compare(buffer, original)).not.toBe(0);
        });
    });
    (0, vitest_1.describe)('Random Generation', () => {
        (0, vitest_1.it)('should generate unique nonces', () => {
            const nonces = new Set();
            for (let i = 0; i < 1000; i++) {
                const nonce = crypto.randomBytes(12).toString('hex');
                (0, vitest_1.expect)(nonces.has(nonce)).toBe(false);
                nonces.add(nonce);
            }
        });
        (0, vitest_1.it)('should generate unique salts', () => {
            const salts = new Set();
            for (let i = 0; i < 1000; i++) {
                const salt = crypto.randomBytes(16).toString('hex');
                (0, vitest_1.expect)(salts.has(salt)).toBe(false);
                salts.add(salt);
            }
        });
    });
});
//# sourceMappingURL=crypto.test.js.map
/**
 * Native Messaging Host
 * 
 * Handles communication between browser extensions and the desktop app.
 * Uses Chrome/Firefox native messaging protocol (JSON over stdin/stdout).
 */

import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { app, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { vaultDb } from '../db/database';

const store = new Store({
    defaults: {
        theme: 'dark'
    }
});

// ============================================================================
// Constants
// ============================================================================

const SOCKET_NAME = 'vault-native-messaging';
const SOCKET_PATH = process.platform === 'win32'
    ? `\\\\.\\pipe\\${SOCKET_NAME}`
    : `/tmp/${SOCKET_NAME}.sock`;

let server: net.Server | null = null;

// ============================================================================
// Native Messaging Protocol
// ============================================================================

interface NativeMessage {
    type: string;
    payload?: any;
    requestId?: string;
}

interface NativeResponse {
    type: string;
    payload?: any;
    requestId?: string;
    error?: string;
}

/**
 * Handle incoming message from browser extension
 */
export async function handleMessage(message: NativeMessage): Promise<NativeResponse> {
    const { type, payload, requestId } = message;

    try {
        switch (type) {
            case 'ping':
                return { type: 'pong', requestId };

            case 'openVaultApp': {
                // For WebSocket/dev transport, just focus the running app window.
                // (Custom protocols like vault://... require OS registration.)
                const win = BrowserWindow.getAllWindows()[0];
                if (win) {
                    if (win.isMinimized()) win.restore();
                    win.show();
                    win.focus();
                }

                return {
                    type: 'openVaultApp',
                    payload: { success: true },
                    requestId,
                };
            }

            case 'isUnlocked':
                return {
                    type: 'isUnlocked',
                    payload: { unlocked: vaultDb.isUnlocked() },
                    requestId,
                };

            case 'getCredentials':
                if (!vaultDb.isUnlocked()) {
                    return { type: 'error', error: 'Vault is locked', requestId };
                }

                const url = payload?.url;
                if (!url) {
                    return { type: 'error', error: 'URL required', requestId };
                }

                try {
                    const urlObj = new URL(url);
                    const entries = vaultDb.findEntriesByDomain(urlObj.hostname);

                    return {
                        type: 'credentials',
                        payload: {
                            entries: entries.map(e => ({
                                id: e?.id,
                                title: e?.title,
                                username: e?.username,
                                url: e?.url,
                                totpSecret: e?.totpSecret || null,
                            })),
                        },
                        requestId,
                    };
                } catch {
                    return { type: 'credentials', payload: { entries: [] }, requestId };
                }

            case 'fillCredentials': {
                if (!vaultDb.isUnlocked()) {
                    return { type: 'error', error: 'Vault is locked', requestId };
                }

                const fillEntryId = payload?.entryId;
                if (!fillEntryId) {
                    return { type: 'error', error: 'Entry ID required', requestId };
                }

                const entry = vaultDb.getEntry(fillEntryId);
                if (!entry) {
                    return { type: 'error', error: 'Entry not found', requestId };
                }

                // Record usage
                vaultDb.recordEntryUsed(fillEntryId);

                return {
                    type: 'fill',
                    payload: {
                        username: entry.username,
                        password: entry.password,
                    },
                    requestId,
                };
            }

            case 'saveCredentials': {
                if (!vaultDb.isUnlocked()) {
                    return { type: 'error', error: 'Vault is locked', requestId };
                }

                const { title, username: saveUsername, password: savePassword, siteUrl } = payload || {};
                if (!saveUsername || !savePassword) {
                    return { type: 'error', error: 'Username and password required', requestId };
                }

                const newId = vaultDb.addEntry({
                    title: title || new URL(siteUrl).hostname,
                    username: saveUsername,
                    password: savePassword,
                    url: siteUrl,
                });

                return {
                    type: 'saved',
                    payload: { id: newId },
                    requestId,
                };
            }

            case 'getTheme':
                return {
                    type: 'theme',
                    payload: { theme: store.get('theme', 'dark') },
                    requestId,
                };

            case 'setTheme':
                const theme = payload?.theme;
                if (theme === 'light' || theme === 'dark') {
                    store.set('theme', theme);
                    // Notify main window
                    const { BrowserWindow } = require('electron');
                    const win = BrowserWindow.getAllWindows()[0];
                    if (win) {
                        win.webContents.send('theme-changed', theme);
                    }
                    // Broadcast to WebSocket clients
                    const { broadcastToClients } = require('../main/ws-bridge');
                    broadcastToClients({ type: 'theme-changed', theme });
                    return {
                        type: 'theme-set',
                        payload: { success: true },
                        requestId,
                    };
                }
                return { type: 'error', error: 'Invalid theme', requestId };

            case 'getTOTP': {
                // Get TOTP code for an entry
                const totpEntryId = payload?.entryId;
                if (totpEntryId) {
                    const { VaultDatabase } = require('../db/database');
                    const vaultDb = VaultDatabase.getInstance();
                    const entry = vaultDb.getEntry(totpEntryId);
                    if (entry && entry.totpSecret) {
                        const { generateTOTP, getTOTPTimeRemaining } = require('../core/totp');
                        const code = generateTOTP(entry.totpSecret);
                        const timeRemaining = getTOTPTimeRemaining();
                        return {
                            type: 'totp',
                            payload: { code, timeRemaining },
                            requestId,
                        };
                    }
                }
                return { type: 'error', error: 'No TOTP secret found', requestId };
            }

            case 'checkPasswordStrength': {
                // Check password strength
                const checkPassword = payload?.password;
                if (checkPassword) {
                    const { calculatePasswordStrength } = require('../core/password-strength');
                    const strength = calculatePasswordStrength(checkPassword);
                    return {
                        type: 'password-strength',
                        payload: strength,
                        requestId,
                    };
                }
                return { type: 'error', error: 'No password provided', requestId };
            }

            default:
                return { type: 'error', error: `Unknown message type: ${type}`, requestId };
        }
    } catch (error) {
        return {
            type: 'error',
            error: (error as Error).message,
            requestId,
        };
    }
}

// ============================================================================
// Socket Server
// ============================================================================

/**
 * Setup native messaging socket server
 */
export function setupNativeMessaging(): void {
    // Remove existing socket file on Unix
    if (process.platform !== 'win32' && fs.existsSync(SOCKET_PATH)) {
        fs.unlinkSync(SOCKET_PATH);
    }

    server = net.createServer((socket) => {
        console.log('Browser extension connected');

        let buffer = Buffer.alloc(0);

        socket.on('data', async (data) => {
            buffer = Buffer.concat([buffer, data]);

            // Native messaging uses 4-byte length prefix
            while (buffer.length >= 4) {
                const messageLength = buffer.readUInt32LE(0);

                if (buffer.length < 4 + messageLength) {
                    // Wait for more data
                    break;
                }

                const messageData = buffer.subarray(4, 4 + messageLength);
                buffer = buffer.subarray(4 + messageLength);

                try {
                    const message: NativeMessage = JSON.parse(messageData.toString('utf8'));
                    const response = await handleMessage(message);

                    // Send response
                    const responseJson = JSON.stringify(response);
                    const responseBuffer = Buffer.from(responseJson, 'utf8');
                    const lengthBuffer = Buffer.alloc(4);
                    lengthBuffer.writeUInt32LE(responseBuffer.length, 0);

                    socket.write(Buffer.concat([lengthBuffer, responseBuffer]));
                } catch (error) {
                    console.error('Failed to process message:', error);
                }
            }
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });

        socket.on('close', () => {
            console.log('Browser extension disconnected');
        });
    });

    server.listen(SOCKET_PATH, () => {
        console.log(`Native messaging server listening on ${SOCKET_PATH}`);
    });

    server.on('error', (error) => {
        console.error('Server error:', error);
    });
}

/**
 * Generate native messaging host manifest for browser
 */
export function generateNativeHostManifest(browser: 'chrome' | 'firefox'): object {
    const execPath = app.getPath('exe');

    if (browser === 'chrome') {
        return {
            name: 'com.vault.password_manager',
            description: 'Vault Password Manager Native Host',
            path: execPath,
            type: 'stdio',
            allowed_origins: [
                'chrome-extension://YOUR_EXTENSION_ID/',
            ],
        };
    } else {
        return {
            name: 'com.vault.password_manager',
            description: 'Vault Password Manager Native Host',
            path: execPath,
            type: 'stdio',
            allowed_extensions: [
                'vault@example.com',
            ],
        };
    }
}

/**
 * Cleanup native messaging server
 */
export function cleanupNativeMessaging(): void {
    if (server) {
        server.close();
        server = null;
    }

    // Remove socket file on Unix
    if (process.platform !== 'win32' && fs.existsSync(SOCKET_PATH)) {
        fs.unlinkSync(SOCKET_PATH);
    }
}

/**
 * Electron Main Process
 * 
 * Entry point for the desktop application.
 * Handles window management, system tray, IPC, and native messaging.
 */

import { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { createTray, destroyTray } from './tray';
import { setupNativeMessaging } from './native-messaging';
import { startWebSocketBridge, stopWebSocketBridge } from './ws-bridge';
import { vaultDb } from '../db/database';
import { mobileWSServer } from '../sync/mobile-ws-server';

// Theme store
const store = new Store({
    defaults: {
        theme: 'dark'
    }
});

// ============================================================================
// Constants
// ============================================================================

const isDev = process.env.NODE_ENV === 'development';
const APP_NAME = 'Vault';

// ============================================================================
// Window Management
// ============================================================================

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

async function createMainWindow(): Promise<BrowserWindow> {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: APP_NAME,
        icon: path.join(__dirname, '../../assets/icon.png'),
        show: false, // Show when ready
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a2e' : '#ffffff',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        },
        // Frameless for custom titlebar (optional)
        // frame: false,
        // titleBarStyle: 'hiddenInset',
    });

    // Security: Prevent navigation
    mainWindow.webContents.on('will-navigate', (event) => {
        event.preventDefault();
    });

    // Security: Prevent new windows
    mainWindow.webContents.setWindowOpenHandler(() => {
        return { action: 'deny' };
    });

    // Load the app
    if (isDev) {
        try {
            await mainWindow.loadURL('http://localhost:5173');
            mainWindow.webContents.openDevTools();
        } catch (error) {
            console.error('Failed to load dev URL (http://localhost:5173):', error);
            await mainWindow.loadURL('data:text/plain,Failed%20to%20load%20Vite%20dev%20server.%20Check%20that%20it%20is%20running%20and%20accessible.');
        }
    } else {
        try {
            await mainWindow.loadFile(path.join(__dirname, '../../../dist/renderer/index.html'));
        } catch (error) {
            console.error('Failed to load built renderer HTML:', error);
            await mainWindow.loadURL('data:text/plain,Failed%20to%20load%20built%20renderer%20HTML.');
        }
    }

    // Show when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        // Send initial theme
        const theme = store.get('theme', 'dark') as string;
        mainWindow?.webContents.send('theme-changed', theme);
    });

    // Handle close: minimize to tray instead of quitting
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}

function showWindow(): void {
    if (mainWindow) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
    } else {
        createMainWindow();
    }
}

// ============================================================================
// App Lifecycle
// ============================================================================

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        showWindow();
    });
}

app.whenReady().then(async () => {
    try {
        // Start extension communication servers first (so the extension can connect
        // even if the renderer UI fails to load).
        try {
            setupNativeMessaging();
        } catch (error) {
            console.error('Failed to start native messaging server:', error);
        }

        try {
            startWebSocketBridge(9876, '127.0.0.1');
        } catch (error) {
            console.error('Failed to start WebSocket bridge:', error);
        }

        // Start mobile WebSocket server for mobile app sync
        try {
            await mobileWSServer.start();
            
            // Handle sync messages from mobile
            mobileWSServer.on('message', async (message, connId) => {
                await handleMobileSyncMessage(message, connId);
            });
        } catch (error) {
            console.error('Failed to start mobile WebSocket server:', error);
        }

        // Create main window
        await createMainWindow();

        // Create system tray
        createTray(showWindow, () => {
            isQuitting = true;
            app.quit();
        });

        // Register global shortcut for quick access
        globalShortcut.register('CommandOrControl+Shift+L', () => {
            showWindow();
            // Send message to renderer to trigger autofill search
            mainWindow?.webContents.send('quick-search');
        });
    } catch (error) {
        console.error('App startup failed:', error);
    }
});

app.on('window-all-closed', () => {
    // Don't quit on macOS
    if (process.platform !== 'darwin') {
        // Keep running in tray
    }
});

app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (!mainWindow) {
        createMainWindow();
    }
});

app.on('before-quit', () => {
    isQuitting = true;

    // Cleanup
    globalShortcut.unregisterAll();
    stopWebSocketBridge();
    mobileWSServer.stop();
    destroyTray();
    vaultDb.close();
});

// ============================================================================
// IPC Handlers (Renderer Communication)
// ============================================================================

// Vault operations
ipcMain.handle('vault:create', async (_, options: { path: string; password: string }) => {
    const { deriveMasterKey, deriveKeys, createVaultHeader, hashMasterKey } = await import('../core/crypto');

    const header = createVaultHeader();
    const masterKey = await deriveMasterKey(options.password, header.salt);
    const keys = deriveKeys(masterKey);

    vaultDb.create(options.path, header, keys.vaultKey);

    return { success: true };
});

ipcMain.handle('vault:open', async (_, options: { path: string; password: string }) => {
    const { deriveMasterKey, deriveKeys } = await import('../core/crypto');

    try {
        const meta = vaultDb.open(options.path);
        const masterKey = await deriveMasterKey(options.password, meta.salt);
        const keys = deriveKeys(masterKey);

        // Verify password by checking key hash
        const { hashMasterKey } = await import('../core/crypto');
        const crypto = await import('crypto');
        const keyHash = hashMasterKey(keys.vaultKey);

        if (!crypto.timingSafeEqual(keyHash, meta.key_hash)) {
            vaultDb.close();
            return { success: false, error: 'Invalid password' };
        }

        vaultDb.setEncryptionKey(keys.vaultKey);

        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
});

ipcMain.handle('vault:lock', () => {
    vaultDb.close();
    return { success: true };
});

ipcMain.handle('vault:isUnlocked', () => {
    return vaultDb.isUnlocked();
});

// Entry operations
ipcMain.handle('entries:getAll', () => {
    return vaultDb.getAllEntries();
});

ipcMain.handle('entries:get', (_, id: string) => {
    return vaultDb.getEntry(id);
});

ipcMain.handle('entries:add', (_, entry) => {
    return vaultDb.addEntry(entry);
});

ipcMain.handle('entries:update', (_, id: string, updates) => {
    vaultDb.updateEntry(id, updates);
    return { success: true };
});

ipcMain.handle('entries:delete', (_, id: string) => {
    vaultDb.deleteEntry(id);
    return { success: true };
});

ipcMain.handle('entries:findByUrl', (_, url: string) => {
    try {
        const urlObj = new URL(url);
        return vaultDb.findEntriesByDomain(urlObj.hostname);
    } catch {
        return [];
    }
});

ipcMain.handle('entries:recordUsed', (_, id: string) => {
    vaultDb.recordEntryUsed(id);
    return { success: true };
});

ipcMain.handle('entries:toggleFavorite', (_, id: string) => {
    const isFavorite = vaultDb.toggleFavorite(id);
    return { success: true, isFavorite };
});

ipcMain.handle('entries:getFavorites', () => {
    return vaultDb.getFavoriteEntries();
});

// Folder operations
ipcMain.handle('folders:getAll', () => {
    return vaultDb.getAllFolders();
});

ipcMain.handle('folders:create', (_, name: string, parentId?: string) => {
    return vaultDb.createFolder(name, parentId);
});

// Password generator
ipcMain.handle('password:generate', (_, options: {
    length?: number;
    uppercase?: boolean;
    lowercase?: boolean;
    numbers?: boolean;
    symbols?: boolean;
}) => {
    const {
        length = 16,
        uppercase = true,
        lowercase = true,
        numbers = true,
        symbols = true,
    } = options;

    let charset = '';
    if (uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (numbers) charset += '0123456789';
    if (symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!charset) charset = 'abcdefghijklmnopqrstuvwxyz';

    const crypto = require('crypto');
    const randomBytes = crypto.randomBytes(length);
    let password = '';

    for (let i = 0; i < length; i++) {
        password += charset[randomBytes[i] % charset.length];
    }

    return password;
});

// TOTP operations
ipcMain.handle('totp:generate', (_, secret: string) => {
    const { generateTOTP } = require('../core/totp');
    try {
        const code = generateTOTP(secret);
        return { success: true, code };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
});

ipcMain.handle('totp:getTimeRemaining', () => {
    const { getTOTPTimeRemaining } = require('../core/totp');
    return getTOTPTimeRemaining();
});

ipcMain.handle('totp:validate', (_, secret: string) => {
    const { validateTOTPSecret } = require('../core/totp');
    return validateTOTPSecret(secret);
});

// Password strength
ipcMain.handle('password:checkStrength', (_, password: string) => {
    const { calculatePasswordStrength } = require('../core/password-strength');
    return calculatePasswordStrength(password);
});

// Security audit
ipcMain.handle('security:audit', () => {
    const { performSecurityAudit } = require('../core/security-audit');
    const entries = vaultDb.getAllEntries();
    const entriesForAudit = entries
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .map(e => ({
            id: e.id,
            title: e.title,
            password: e.password,
            createdAt: e.createdAt,
            modifiedAt: e.modifiedAt,
            lastUsedAt: e.lastUsedAt,
        }));
    return performSecurityAudit(entriesForAudit);
});

// App info
ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
});

ipcMain.handle('app:getPlatform', () => {
    return process.platform;
});

// Theme operations
ipcMain.handle('theme:get', () => {
    return store.get('theme', 'dark');
});

ipcMain.handle('theme:set', (_, theme: 'light' | 'dark') => {
    store.set('theme', theme);
    // Notify renderer of theme change
    mainWindow?.webContents.send('theme-changed', theme);
    // Broadcast to WebSocket clients (extension)
    const { broadcastToClients } = require('./ws-bridge');
    broadcastToClients({ type: 'theme-changed', theme });
    return { success: true };
});

// ============================================================================
// Mobile Sync Handlers
// ============================================================================

async function handleMobileSyncMessage(message: any, connId: string) {
    console.log(`Mobile sync message: ${message.type}`);

    switch (message.type) {
        case 'ping':
            mobileWSServer.send({ type: 'pong', payload: {} }, connId);
            break;

        case 'sync-request':
            // Mobile is requesting all entries
            if (!vaultDb.isUnlocked()) {
                mobileWSServer.send({
                    type: 'sync-error',
                    payload: { error: 'Vault is locked' }
                }, connId);
                return;
            }

            // Filter out any potential null entries from the database
            const entries = vaultDb.getAllEntries()
                .filter((e): e is NonNullable<typeof e> => e !== null);

            mobileWSServer.send({
                type: 'sync-response',
                payload: {
                    entries: entries.map(e => ({
                        id: e.id,
                        title: e.title,
                        username: e.username,
                        password: e.password,
                        url: e.url,
                        notes: e.notes,
                        totpSecret: e.totpSecret,
                        folderId: e.folderId,
                        isFavorite: e.isFavorite,
                        createdAt: e.createdAt,
                        modifiedAt: e.modifiedAt,
                    })),
                    totalCount: entries.length,
                }
            }, connId);
            break;

        case 'entry-add':
            // Mobile is adding a new entry
            if (!vaultDb.isUnlocked()) {
                mobileWSServer.send({
                    type: 'entry-error',
                    payload: { error: 'Vault is locked' }
                }, connId);
                return;
            }

            const newId = vaultDb.addEntry(message.payload);
            mobileWSServer.send({
                type: 'entry-added',
                payload: { id: newId }
            }, connId);
            
            // Notify renderer to refresh
            mainWindow?.webContents.send('entry-updated');
            break;

        case 'entry-update':
            // Mobile is updating an entry
            if (!vaultDb.isUnlocked()) {
                mobileWSServer.send({
                    type: 'entry-error',
                    payload: { error: 'Vault is locked' }
                }, connId);
                return;
            }

            vaultDb.updateEntry(message.payload.id, message.payload.updates);
            mobileWSServer.send({
                type: 'entry-updated',
                payload: { id: message.payload.id }
            }, connId);
            
            mainWindow?.webContents.send('entry-updated');
            break;

        case 'entry-delete':
            // Mobile is deleting an entry
            if (!vaultDb.isUnlocked()) {
                mobileWSServer.send({
                    type: 'entry-error',
                    payload: { error: 'Vault is locked' }
                }, connId);
                return;
            }

            vaultDb.deleteEntry(message.payload.id);
            mobileWSServer.send({
                type: 'entry-deleted',
                payload: { id: message.payload.id }
            }, connId);
            
            mainWindow?.webContents.send('entry-updated');
            break;

        case 'sync-response':
            // Mobile is responding to our sync request
            if (!vaultDb.isUnlocked()) {
                console.log('Vault is locked, cannot import entries from mobile');
                return;
            }

            const mobileEntries = message.payload.entries || [];
            if (mobileEntries.length > 0) {
                // Import entries from mobile
                for (const entry of mobileEntries) {
                    try {
                        // Check if entry already exists
                        const existing = vaultDb.getEntry(entry.id);
                        if (existing) {
                            // Update if mobile version is newer
                            if (entry.modifiedAt > existing.modifiedAt) {
                                vaultDb.updateEntry(entry.id, {
                                    title: entry.title,
                                    username: entry.username,
                                    password: entry.password,
                                    url: entry.url,
                                    notes: entry.notes,
                                    totpSecret: entry.totpSecret,
                                    folderId: entry.folderId,
                                });
                                
                                // Update favorite status if different
                                if (entry.isFavorite !== existing.isFavorite) {
                                    // Toggle favorite to match mobile status
                                    if (existing.isFavorite && !entry.isFavorite) {
                                        vaultDb.toggleFavorite(entry.id);
                                    } else if (!existing.isFavorite && entry.isFavorite) {
                                        vaultDb.toggleFavorite(entry.id);
                                    }
                                }
                            }
                        } else {
                            // Add new entry - need to insert with mobile's ID
                            // Use addEntry first, then update the ID and timestamps if needed
                            const newId = vaultDb.addEntry({
                                title: entry.title,
                                username: entry.username,
                                password: entry.password,
                                url: entry.url,
                                notes: entry.notes,
                                totpSecret: entry.totpSecret,
                                folderId: entry.folderId,
                            });
                            
                            // If IDs don't match, we'll keep the new ID (sync will handle conflicts)
                            // Set favorite status if needed
                            if (entry.isFavorite) {
                                vaultDb.toggleFavorite(newId);
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to import entry ${entry.id}:`, error);
                    }
                }
                
                // Notify renderer to refresh
                mainWindow?.webContents.send('entry-updated');
                mainWindow?.webContents.send('mobile-sync-complete', { count: mobileEntries.length });
            }
            break;

        default:
            console.log(`Unknown mobile sync message type: ${message.type}`);
    }
}

// Mobile Sync IPC Handlers
ipcMain.handle('mobileSync:getInfo', () => {
    return mobileWSServer.getConnectionInfo();
});

ipcMain.handle('mobileSync:getLocalIPs', () => {
    return mobileWSServer.getLocalIPs();
});

ipcMain.handle('mobileSync:isRunning', () => {
    return mobileWSServer.isRunning();
});

ipcMain.handle('mobileSync:getConnectedCount', () => {
    return mobileWSServer.getConnectedCount();
});

ipcMain.handle('mobileSync:requestSync', async () => {
    const connectedCount = mobileWSServer.getConnectedCount();
    if (connectedCount === 0) {
        return { success: false, error: 'No mobile devices connected' };
    }

    if (!vaultDb.isUnlocked()) {
        return { success: false, error: 'Vault is locked' };
    }

    // Request sync from all connected mobile devices
    mobileWSServer.broadcast({
        type: 'sync-request',
        payload: {}
    });

    return { success: true };
});

export { mainWindow, showWindow };

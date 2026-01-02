/**
 * Electron Preload Script
 * 
 * Exposes a secure API to the renderer process via context bridge.
 * No direct Node.js access - only whitelisted IPC channels.
 */

import { contextBridge, ipcRenderer } from 'electron';

// ============================================================================
// Exposed API
// ============================================================================

const api = {
    // Vault operations
    vault: {
        create: (options: { path: string; password: string }) =>
            ipcRenderer.invoke('vault:create', options),
        open: (options: { path: string; password: string }) =>
            ipcRenderer.invoke('vault:open', options),
        lock: () =>
            ipcRenderer.invoke('vault:lock'),
        isUnlocked: () =>
            ipcRenderer.invoke('vault:isUnlocked'),
    },

    // Entry operations
    entries: {
        getAll: () =>
            ipcRenderer.invoke('entries:getAll'),
        get: (id: string) =>
            ipcRenderer.invoke('entries:get', id),
        add: (entry: {
            title: string;
            username: string;
            password: string;
            url?: string;
            notes?: string;
            totpSecret?: string;
            folderId?: string;
        }) =>
            ipcRenderer.invoke('entries:add', entry),
        update: (id: string, updates: {
            title?: string;
            username?: string;
            password?: string;
            url?: string;
            notes?: string;
            totpSecret?: string;
            folderId?: string | null;
        }) =>
            ipcRenderer.invoke('entries:update', id, updates),
        delete: (id: string) =>
            ipcRenderer.invoke('entries:delete', id),
        findByUrl: (url: string) =>
            ipcRenderer.invoke('entries:findByUrl', url),
        recordUsed: (id: string) =>
            ipcRenderer.invoke('entries:recordUsed', id),
        toggleFavorite: (id: string) =>
            ipcRenderer.invoke('entries:toggleFavorite', id),
        getFavorites: () =>
            ipcRenderer.invoke('entries:getFavorites'),
    },

    // Folder operations
    folders: {
        getAll: () =>
            ipcRenderer.invoke('folders:getAll'),
        create: (name: string, parentId?: string) =>
            ipcRenderer.invoke('folders:create', name, parentId),
    },

    // Password generator
    password: {
        generate: (options?: {
            length?: number;
            uppercase?: boolean;
            lowercase?: boolean;
            numbers?: boolean;
            symbols?: boolean;
        }) =>
            ipcRenderer.invoke('password:generate', options || {}),
        checkStrength: (password: string) =>
            ipcRenderer.invoke('password:checkStrength', password),
    },

    // TOTP operations
    totp: {
        generate: (secret: string) =>
            ipcRenderer.invoke('totp:generate', secret),
        getTimeRemaining: () =>
            ipcRenderer.invoke('totp:getTimeRemaining'),
        validate: (secret: string) =>
            ipcRenderer.invoke('totp:validate', secret),
    },

    // Security audit
    security: {
        audit: () =>
            ipcRenderer.invoke('security:audit'),
    },

    // App info
    app: {
        getVersion: () =>
            ipcRenderer.invoke('app:getVersion'),
        getPlatform: () =>
            ipcRenderer.invoke('app:getPlatform'),
    },

    // Theme operations
    theme: {
        get: () =>
            ipcRenderer.invoke('theme:get'),
        set: (theme: 'light' | 'dark') =>
            ipcRenderer.invoke('theme:set', theme),
    },

    // Event listeners
    on: (channel: string, callback: (...args: any[]) => void) => {
        const validChannels = ['quick-search', 'vault-locked', 'entry-updated', 'theme-changed'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (_, ...args) => callback(...args));
        }
    },

    off: (channel: string, callback: (...args: any[]) => void) => {
        const validChannels = ['quick-search', 'vault-locked', 'entry-updated', 'theme-changed'];
        if (validChannels.includes(channel)) {
            ipcRenderer.removeListener(channel, callback);
        }
    },
};

// Expose API to renderer
contextBridge.exposeInMainWorld('vaultAPI', api);

// Type declarations for renderer
export type VaultAPI = typeof api;

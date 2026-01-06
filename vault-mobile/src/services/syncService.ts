/**
 * Mobile Sync Service
 * 
 * Connects to desktop Vault app via WebSocket for syncing passwords.
 * Uses standard WebSocket API (works with Expo without native modules).
 */

// Simple EventEmitter implementation for React Native
class EventEmitter {
    private events: Map<string, Array<(...args: any[]) => void>> = new Map();

    on(event: string, listener: (...args: any[]) => void): void {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event)!.push(listener);
    }

    off(event: string, listener: (...args: any[]) => void): void {
        const listeners = this.events.get(event);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event: string, ...args: any[]): void {
        const listeners = this.events.get(event);
        if (listeners) {
            listeners.forEach(listener => listener(...args));
        }
    }

    removeAllListeners(event?: string): void {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }
    }
}

// ============================================================================
// Types
// ============================================================================

export interface SyncMessage {
    type: string;
    payload: any;
    timestamp?: number;
}

export interface ConnectionInfo {
    ip: string;
    port: number;
    deviceId?: string;
    name?: string;
}

export interface SyncEntry {
    id: string;
    title: string;
    username: string;
    password: string;
    url: string | null;
    notes: string | null;
    totpSecret: string | null;
    folderId: string | null;
    isFavorite: boolean;
    createdAt: number;
    modifiedAt: number;
}

export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error';

// ============================================================================
// Sync Service
// ============================================================================

class SyncService extends EventEmitter {
    private ws: WebSocket | null = null;
    private status: SyncStatus = 'disconnected';
    private reconnectTimeout: number | null = null;
    private currentHost: string | null = null;
    private currentPort: number | null = null;
    private desktopInfo: { deviceId: string; deviceName: string } | null = null;

    constructor() {
        super();
    }

    /**
     * Get current connection status
     */
    getStatus(): SyncStatus {
        return this.status;
    }

    /**
     * Get desktop device info (if connected)
     */
    getDesktopInfo() {
        return this.desktopInfo;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * Connect to desktop via WebSocket
     */
    async connect(host: string, port: number = 51821): Promise<boolean> {
        // Close existing connection
        if (this.ws) {
            this.disconnect();
        }

        this.currentHost = host;
        this.currentPort = port;
        this.setStatus('connecting');

        return new Promise((resolve) => {
            try {
                const wsUrl = `ws://${host}:${port}`;
                console.log(`Connecting to ${wsUrl}...`);

                this.ws = new WebSocket(wsUrl);

                // Connection timeout
                const timeout = setTimeout(() => {
                    if (this.ws?.readyState !== WebSocket.OPEN) {
                        console.log('Connection timeout');
                        this.ws?.close();
                        this.setStatus('error');
                        resolve(false);
                    }
                }, 10000);

                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    console.log('WebSocket connected!');
                    this.setStatus('connected');
                    this.emit('connected');
                    resolve(true);
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message: SyncMessage = JSON.parse(event.data as string);
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('Failed to parse message:', error);
                    }
                };

                this.ws.onerror = (error) => {
                    clearTimeout(timeout);
                    console.error('WebSocket error:', error);
                    this.setStatus('error');
                    this.emit('error', error);
                    resolve(false);
                };

                this.ws.onclose = () => {
                    console.log('WebSocket closed');
                    this.setStatus('disconnected');
                    this.desktopInfo = null;
                    this.emit('disconnected');
                };
            } catch (error) {
                console.error('Failed to create WebSocket:', error);
                this.setStatus('error');
                resolve(false);
            }
        });
    }

    /**
     * Disconnect from desktop
     */
    disconnect(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.setStatus('disconnected');
        this.desktopInfo = null;
        this.currentHost = null;
        this.currentPort = null;
    }

    /**
     * Request sync from desktop
     */
    async requestSync(): Promise<SyncEntry[] | null> {
        if (!this.isConnected()) {
            console.error('Not connected to desktop');
            return null;
        }

        this.setStatus('syncing');

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.setStatus('connected');
                resolve(null);
            }, 30000);

            const handler = (entries: SyncEntry[]) => {
                clearTimeout(timeout);
                this.setStatus('connected');
                this.off('sync-response', handler);
                resolve(entries);
            };

            this.on('sync-response', handler);
            this.send({ type: 'sync-request', payload: {} });
        });
    }

    /**
     * Add entry via desktop
     */
    async addEntry(entry: Omit<SyncEntry, 'id' | 'createdAt' | 'modifiedAt'>): Promise<string | null> {
        if (!this.isConnected()) {
            return null;
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 10000);

            const handler = (id: string) => {
                clearTimeout(timeout);
                this.off('entry-added', handler);
                resolve(id);
            };

            this.on('entry-added', handler);
            this.send({ type: 'entry-add', payload: entry });
        });
    }

    /**
     * Update entry via desktop
     */
    async updateEntry(id: string, updates: Partial<SyncEntry>): Promise<boolean> {
        if (!this.isConnected()) {
            return false;
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 10000);

            const handler = () => {
                clearTimeout(timeout);
                this.off('entry-updated', handler);
                resolve(true);
            };

            this.on('entry-updated', handler);
            this.send({ type: 'entry-update', payload: { id, updates } });
        });
    }

    /**
     * Delete entry via desktop
     */
    async deleteEntry(id: string): Promise<boolean> {
        if (!this.isConnected()) {
            return false;
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 10000);

            const handler = () => {
                clearTimeout(timeout);
                this.off('entry-deleted', handler);
                resolve(true);
            };

            this.on('entry-deleted', handler);
            this.send({ type: 'entry-delete', payload: { id } });
        });
    }

    /**
     * Send ping to check connection
     */
    ping(): void {
        this.send({ type: 'ping', payload: {} });
    }

    /**
     * Handle incoming message
     */
    private handleMessage(message: SyncMessage): void {
        console.log(`Received: ${message.type}`);

        switch (message.type) {
            case 'welcome':
                this.desktopInfo = {
                    deviceId: message.payload.deviceId,
                    deviceName: message.payload.deviceName,
                };
                this.emit('welcome', this.desktopInfo);
                break;

            case 'pong':
                this.emit('pong');
                break;

            case 'sync-request':
                // Desktop is requesting entries from mobile
                this.emit('sync-request-received');
                // Response will be handled by the sync screen component
                break;

            case 'sync-response':
                this.emit('sync-response', message.payload.entries || []);
                break;

            case 'sync-error':
                this.emit('sync-error', message.payload.error);
                break;

            case 'entry-added':
                this.emit('entry-added', message.payload.id);
                break;

            case 'entry-updated':
                this.emit('entry-updated', message.payload.id);
                break;

            case 'entry-deleted':
                this.emit('entry-deleted', message.payload.id);
                break;

            case 'entry-error':
                this.emit('entry-error', message.payload.error);
                break;

            default:
                console.log(`Unknown message type: ${message.type}`);
        }
    }

    /**
     * Send sync response to desktop (when desktop requests sync)
     */
    sendSyncResponse(entries: SyncEntry[]): void {
        this.send({
            type: 'sync-response',
            payload: {
                entries,
                totalCount: entries.length,
            }
        });
    }

    /**
     * Send message to desktop
     */
    private send(message: SyncMessage): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            message.timestamp = Date.now();
            this.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Set status and emit event
     */
    private setStatus(status: SyncStatus): void {
        if (this.status !== status) {
            this.status = status;
            this.emit('status-changed', status);
        }
    }

    /**
     * Parse connection info from QR code data
     */
    static parseQRCode(data: string): ConnectionInfo | null {
        try {
            const info = JSON.parse(data);
            if (info.ip && info.port) {
                return {
                    ip: info.ip,
                    port: info.port,
                    deviceId: info.deviceId,
                    name: info.name,
                };
            }
            return null;
        } catch {
            // Try to parse as IP:PORT format
            const match = data.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)$/);
            if (match) {
                return {
                    ip: match[1],
                    port: parseInt(match[2]),
                };
            }
            return null;
        }
    }
}

// Singleton instance
export const syncService = new SyncService();

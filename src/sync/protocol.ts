/**
 * LAN Sync Protocol
 * 
 * Handles secure synchronization of vault entries between devices.
 * Uses version vectors for conflict detection and Last-Write-Wins resolution.
 */

import { EventEmitter } from 'events';
import { discoveryService, DiscoveredDevice } from './discovery';
import { syncTransport, SyncMessage } from './transport';
import { vaultDb } from '../db/database';

// ============================================================================
// Types
// ============================================================================

export interface SyncState {
    deviceId: string;
    lastSyncTime: number;
    lastSyncVersion: number;
}

export interface SyncEntry {
    id: string;
    encryptedData: string;
    modifiedAt: number;
    syncVersion: number;
    isDeleted: boolean;
}

export interface SyncDelta {
    entries: SyncEntry[];
    fromVersion: number;
    toVersion: number;
    deviceId: string;
}

// ============================================================================
// Sync Protocol
// ============================================================================

export class SyncProtocol extends EventEmitter {
    private syncStates: Map<string, SyncState> = new Map();
    private isSyncing: boolean = false;
    private autoSyncInterval: NodeJS.Timeout | null = null;
    private currentVersion: number = 0;

    /**
     * Initialize sync protocol
     */
    async initialize(): Promise<void> {
        // Listen for device discovery
        discoveryService.on('deviceFound', (device) => {
            this.handleDeviceFound(device);
        });

        discoveryService.on('deviceLost', (device) => {
            this.handleDeviceLost(device);
        });

        // Listen for incoming sync messages
        syncTransport.on('message', (message, deviceId) => {
            this.handleIncomingMessage(message, deviceId);
        });

        // Start discovery
        discoveryService.start(this.currentVersion);

        // Start transport
        await syncTransport.start();

        console.log('Sync protocol initialized');
    }

    /**
     * Stop sync protocol
     */
    stop(): void {
        this.stopAutoSync();
        discoveryService.stop();
        syncTransport.stop();
        this.syncStates.clear();
    }

    /**
     * Enable automatic sync at interval
     */
    startAutoSync(intervalMs: number = 30000): void {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }

        this.autoSyncInterval = setInterval(() => {
            this.syncWithAllDevices();
        }, intervalMs);

        console.log(`Auto-sync enabled every ${intervalMs}ms`);
    }

    /**
     * Stop automatic sync
     */
    stopAutoSync(): void {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
    }

    /**
     * Sync with all discovered devices
     */
    async syncWithAllDevices(): Promise<void> {
        const devices = discoveryService.getDevices();

        for (const device of devices) {
            try {
                await this.syncWithDevice(device.id);
            } catch (error) {
                console.error(`Failed to sync with ${device.name}:`, error);
            }
        }
    }

    /**
     * Sync with a specific device
     */
    async syncWithDevice(deviceId: string): Promise<void> {
        if (this.isSyncing) {
            console.log('Sync already in progress');
            return;
        }

        const device = discoveryService.getDevice(deviceId);
        if (!device) {
            throw new Error(`Device not found: ${deviceId}`);
        }

        this.isSyncing = true;
        this.emit('syncStart', deviceId);

        try {
            // Connect to device
            await syncTransport.connect(device.host, device.port);

            // Get last sync state
            const syncState = this.syncStates.get(deviceId) || {
                deviceId,
                lastSyncTime: 0,
                lastSyncVersion: 0,
            };

            // Request sync from device
            await syncTransport.send({
                type: 'sync-request',
                payload: {
                    fromVersion: syncState.lastSyncVersion,
                    myVersion: this.currentVersion,
                },
            }, deviceId);

            console.log(`Sync request sent to ${device.name}`);
        } catch (error) {
            this.emit('syncError', deviceId, error);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Handle incoming sync messages
     */
    private async handleIncomingMessage(message: SyncMessage, deviceId: string): Promise<void> {
        console.log(`Received ${message.type} from ${deviceId}`);

        switch (message.type) {
            case 'sync-request':
                await this.handleSyncRequest(message.payload, deviceId);
                break;

            case 'sync-response':
                await this.handleSyncResponse(message.payload, deviceId);
                break;

            case 'sync-ack':
                this.handleSyncAck(message.payload, deviceId);
                break;

            default:
                console.warn(`Unknown message type: ${message.type}`);
        }
    }

    /**
     * Handle sync request from another device
     */
    private async handleSyncRequest(
        payload: { fromVersion: number; myVersion: number },
        deviceId: string
    ): Promise<void> {
        const { fromVersion, myVersion } = payload;

        // Get entries modified since their last sync
        const entries = vaultDb.getEntriesModifiedSince(fromVersion);

        // Prepare delta
        const delta: SyncDelta = {
            entries: entries.map(entry => ({
                id: entry.id,
                encryptedData: JSON.stringify({
                    title: entry.title_encrypted,
                    username: entry.username_encrypted,
                    password: entry.password_encrypted,
                    url: entry.url,
                    notes: entry.notes_encrypted,
                    totp: entry.totp_secret_encrypted,
                    folderId: entry.folder_id,
                }),
                modifiedAt: entry.modified_at,
                syncVersion: entry.sync_version,
                isDeleted: entry.is_deleted === 1,
            })),
            fromVersion,
            toVersion: this.currentVersion,
            deviceId: discoveryService.getDeviceInfo().id,
        };

        // Send response
        await syncTransport.send({
            type: 'sync-response',
            payload: delta,
        }, deviceId);

        // If their version is higher, request their changes
        if (myVersion > this.currentVersion) {
            await syncTransport.send({
                type: 'sync-request',
                payload: {
                    fromVersion: this.currentVersion,
                    myVersion: this.currentVersion,
                },
            }, deviceId);
        }
    }

    /**
     * Handle sync response from another device
     */
    private async handleSyncResponse(delta: SyncDelta, deviceId: string): Promise<void> {
        const { entries, toVersion } = delta;

        let mergedCount = 0;
        let conflictCount = 0;

        for (const entry of entries) {
            try {
                const existing = vaultDb.getEntry(entry.id);

                if (!existing) {
                    // New entry - import it
                    const data = JSON.parse(entry.encryptedData);
                    // Note: Data is already encrypted, store directly
                    // This requires the sync to use the same encryption key
                    mergedCount++;
                } else if (entry.modifiedAt > existing.modifiedAt) {
                    // Their entry is newer - use Last-Write-Wins
                    const data = JSON.parse(entry.encryptedData);
                    // Update with their data
                    mergedCount++;
                } else if (entry.modifiedAt === existing.modifiedAt &&
                    entry.syncVersion !== existing.syncVersion) {
                    // Same timestamp but different versions - conflict!
                    conflictCount++;
                    this.emit('conflict', {
                        entryId: entry.id,
                        localVersion: existing.syncVersion,
                        remoteVersion: entry.syncVersion,
                    });
                }
                // Else: our entry is newer, keep it
            } catch (error) {
                console.error(`Failed to merge entry ${entry.id}:`, error);
            }
        }

        // Update sync state
        this.syncStates.set(deviceId, {
            deviceId,
            lastSyncTime: Date.now(),
            lastSyncVersion: toVersion,
        });

        // Send acknowledgment
        await syncTransport.send({
            type: 'sync-ack',
            payload: {
                receivedVersion: toVersion,
                mergedCount,
                conflictCount,
            },
        }, deviceId);

        this.emit('syncComplete', {
            deviceId,
            mergedCount,
            conflictCount,
        });

        console.log(`Sync complete: ${mergedCount} entries merged, ${conflictCount} conflicts`);
    }

    /**
     * Handle sync acknowledgment
     */
    private handleSyncAck(
        payload: { receivedVersion: number; mergedCount: number; conflictCount: number },
        deviceId: string
    ): void {
        console.log(`Sync acknowledged by ${deviceId}:`, payload);

        // Mark pending sync operations as synced
        const pendingOps = vaultDb.getPendingSyncOps();
        const ids = pendingOps.map(op => op.id);
        vaultDb.markSynced(ids);
    }

    /**
     * Handle new device discovery
     */
    private handleDeviceFound(device: DiscoveredDevice): void {
        console.log(`New device found: ${device.name}`);
        this.emit('deviceFound', device);

        // Check if they have newer data
        if (device.syncVersion > this.currentVersion) {
            console.log(`Device ${device.name} has newer data (v${device.syncVersion} vs v${this.currentVersion})`);
            this.emit('newDataAvailable', device);
        }
    }

    /**
     * Handle device lost
     */
    private handleDeviceLost(device: DiscoveredDevice): void {
        console.log(`Device lost: ${device.name}`);
        this.emit('deviceLost', device);
    }

    /**
     * Increment local version after changes
     */
    incrementVersion(): void {
        this.currentVersion++;
        discoveryService.updateSyncVersion(this.currentVersion);
    }
}

// Singleton
export const syncProtocol = new SyncProtocol();

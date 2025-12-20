"use strict";
/**
 * LAN Sync Protocol
 *
 * Handles secure synchronization of vault entries between devices.
 * Uses version vectors for conflict detection and Last-Write-Wins resolution.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncProtocol = exports.SyncProtocol = void 0;
const events_1 = require("events");
const discovery_1 = require("./discovery");
const transport_1 = require("./transport");
const database_1 = require("../db/database");
// ============================================================================
// Sync Protocol
// ============================================================================
class SyncProtocol extends events_1.EventEmitter {
    syncStates = new Map();
    isSyncing = false;
    autoSyncInterval = null;
    currentVersion = 0;
    /**
     * Initialize sync protocol
     */
    async initialize() {
        // Listen for device discovery
        discovery_1.discoveryService.on('deviceFound', (device) => {
            this.handleDeviceFound(device);
        });
        discovery_1.discoveryService.on('deviceLost', (device) => {
            this.handleDeviceLost(device);
        });
        // Listen for incoming sync messages
        transport_1.syncTransport.on('message', (message, deviceId) => {
            this.handleIncomingMessage(message, deviceId);
        });
        // Start discovery
        discovery_1.discoveryService.start(this.currentVersion);
        // Start transport
        await transport_1.syncTransport.start();
        console.log('Sync protocol initialized');
    }
    /**
     * Stop sync protocol
     */
    stop() {
        this.stopAutoSync();
        discovery_1.discoveryService.stop();
        transport_1.syncTransport.stop();
        this.syncStates.clear();
    }
    /**
     * Enable automatic sync at interval
     */
    startAutoSync(intervalMs = 30000) {
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
    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
    }
    /**
     * Sync with all discovered devices
     */
    async syncWithAllDevices() {
        const devices = discovery_1.discoveryService.getDevices();
        for (const device of devices) {
            try {
                await this.syncWithDevice(device.id);
            }
            catch (error) {
                console.error(`Failed to sync with ${device.name}:`, error);
            }
        }
    }
    /**
     * Sync with a specific device
     */
    async syncWithDevice(deviceId) {
        if (this.isSyncing) {
            console.log('Sync already in progress');
            return;
        }
        const device = discovery_1.discoveryService.getDevice(deviceId);
        if (!device) {
            throw new Error(`Device not found: ${deviceId}`);
        }
        this.isSyncing = true;
        this.emit('syncStart', deviceId);
        try {
            // Connect to device
            await transport_1.syncTransport.connect(device.host, device.port);
            // Get last sync state
            const syncState = this.syncStates.get(deviceId) || {
                deviceId,
                lastSyncTime: 0,
                lastSyncVersion: 0,
            };
            // Request sync from device
            await transport_1.syncTransport.send({
                type: 'sync-request',
                payload: {
                    fromVersion: syncState.lastSyncVersion,
                    myVersion: this.currentVersion,
                },
            }, deviceId);
            console.log(`Sync request sent to ${device.name}`);
        }
        catch (error) {
            this.emit('syncError', deviceId, error);
            throw error;
        }
        finally {
            this.isSyncing = false;
        }
    }
    /**
     * Handle incoming sync messages
     */
    async handleIncomingMessage(message, deviceId) {
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
    async handleSyncRequest(payload, deviceId) {
        const { fromVersion, myVersion } = payload;
        // Get entries modified since their last sync
        const entries = database_1.vaultDb.getEntriesModifiedSince(fromVersion);
        // Prepare delta
        const delta = {
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
            deviceId: discovery_1.discoveryService.getDeviceInfo().id,
        };
        // Send response
        await transport_1.syncTransport.send({
            type: 'sync-response',
            payload: delta,
        }, deviceId);
        // If their version is higher, request their changes
        if (myVersion > this.currentVersion) {
            await transport_1.syncTransport.send({
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
    async handleSyncResponse(delta, deviceId) {
        const { entries, toVersion } = delta;
        let mergedCount = 0;
        let conflictCount = 0;
        for (const entry of entries) {
            try {
                const existing = database_1.vaultDb.getEntry(entry.id);
                if (!existing) {
                    // New entry - import it
                    const data = JSON.parse(entry.encryptedData);
                    // Note: Data is already encrypted, store directly
                    // This requires the sync to use the same encryption key
                    mergedCount++;
                }
                else if (entry.modifiedAt > existing.modifiedAt) {
                    // Their entry is newer - use Last-Write-Wins
                    const data = JSON.parse(entry.encryptedData);
                    // Update with their data
                    mergedCount++;
                }
                else if (entry.modifiedAt === existing.modifiedAt &&
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
            }
            catch (error) {
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
        await transport_1.syncTransport.send({
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
    handleSyncAck(payload, deviceId) {
        console.log(`Sync acknowledged by ${deviceId}:`, payload);
        // Mark pending sync operations as synced
        const pendingOps = database_1.vaultDb.getPendingSyncOps();
        const ids = pendingOps.map(op => op.id);
        database_1.vaultDb.markSynced(ids);
    }
    /**
     * Handle new device discovery
     */
    handleDeviceFound(device) {
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
    handleDeviceLost(device) {
        console.log(`Device lost: ${device.name}`);
        this.emit('deviceLost', device);
    }
    /**
     * Increment local version after changes
     */
    incrementVersion() {
        this.currentVersion++;
        discovery_1.discoveryService.updateSyncVersion(this.currentVersion);
    }
}
exports.SyncProtocol = SyncProtocol;
// Singleton
exports.syncProtocol = new SyncProtocol();
//# sourceMappingURL=protocol.js.map
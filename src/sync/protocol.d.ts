/**
 * LAN Sync Protocol
 *
 * Handles secure synchronization of vault entries between devices.
 * Uses version vectors for conflict detection and Last-Write-Wins resolution.
 */
import { EventEmitter } from 'events';
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
export declare class SyncProtocol extends EventEmitter {
    private syncStates;
    private isSyncing;
    private autoSyncInterval;
    private currentVersion;
    /**
     * Initialize sync protocol
     */
    initialize(): Promise<void>;
    /**
     * Stop sync protocol
     */
    stop(): void;
    /**
     * Enable automatic sync at interval
     */
    startAutoSync(intervalMs?: number): void;
    /**
     * Stop automatic sync
     */
    stopAutoSync(): void;
    /**
     * Sync with all discovered devices
     */
    syncWithAllDevices(): Promise<void>;
    /**
     * Sync with a specific device
     */
    syncWithDevice(deviceId: string): Promise<void>;
    /**
     * Handle incoming sync messages
     */
    private handleIncomingMessage;
    /**
     * Handle sync request from another device
     */
    private handleSyncRequest;
    /**
     * Handle sync response from another device
     */
    private handleSyncResponse;
    /**
     * Handle sync acknowledgment
     */
    private handleSyncAck;
    /**
     * Handle new device discovery
     */
    private handleDeviceFound;
    /**
     * Handle device lost
     */
    private handleDeviceLost;
    /**
     * Increment local version after changes
     */
    incrementVersion(): void;
}
export declare const syncProtocol: SyncProtocol;
//# sourceMappingURL=protocol.d.ts.map
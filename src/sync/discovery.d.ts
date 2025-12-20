/**
 * LAN Device Discovery
 *
 * Uses mDNS (Bonjour/Avahi) to discover other Vault instances on the local network.
 * Enables zero-configuration device pairing for password synchronization.
 */
import { EventEmitter } from 'events';
export interface DiscoveredDevice {
    id: string;
    name: string;
    host: string;
    port: number;
    publicKey: string;
    lastSeen: number;
    syncVersion: number;
}
export interface DeviceInfo {
    id: string;
    name: string;
    publicKey: string;
    syncVersion: number;
}
export declare class DiscoveryService extends EventEmitter {
    private bonjour;
    private browser;
    private publishedService;
    private deviceId;
    private deviceName;
    private publicKey;
    private syncVersion;
    private discoveredDevices;
    constructor();
    /**
     * Generate a unique device ID
     */
    private generateDeviceId;
    /**
     * Get a friendly computer name
     */
    private getComputerName;
    /**
     * Generate key pair for secure communication
     */
    private generateKeyPair;
    /**
     * Start advertising this device and browsing for others
     */
    start(syncVersion?: number): void;
    /**
     * Stop discovery and advertising
     */
    stop(): void;
    /**
     * Handle discovered service
     */
    private handleServiceFound;
    /**
     * Handle lost service
     */
    private handleServiceLost;
    /**
     * Get all discovered devices
     */
    getDevices(): DiscoveredDevice[];
    /**
     * Get specific device by ID
     */
    getDevice(deviceId: string): DiscoveredDevice | undefined;
    /**
     * Get this device's info
     */
    getDeviceInfo(): DeviceInfo;
    /**
     * Update advertised sync version
     */
    updateSyncVersion(version: number): void;
}
export declare const discoveryService: DiscoveryService;
//# sourceMappingURL=discovery.d.ts.map
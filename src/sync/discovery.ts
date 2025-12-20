/**
 * LAN Device Discovery
 * 
 * Uses mDNS (Bonjour/Avahi) to discover other Vault instances on the local network.
 * Enables zero-configuration device pairing for password synchronization.
 */

import Bonjour, { Service } from 'bonjour-service';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// Constants
// ============================================================================

const SERVICE_TYPE = 'vaultsync';
const SERVICE_PORT = 51820;
const DEVICE_ID_LENGTH = 16;

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Discovery Service
// ============================================================================

export class DiscoveryService extends EventEmitter {
    private bonjour: Bonjour | null = null;
    private browser: any = null;
    private publishedService: Service | null = null;
    private deviceId: string;
    private deviceName: string;
    private publicKey: string;
    private syncVersion: number = 0;
    private discoveredDevices: Map<string, DiscoveredDevice> = new Map();

    constructor() {
        super();
        this.deviceId = this.generateDeviceId();
        this.deviceName = this.getComputerName();
        this.publicKey = this.generateKeyPair();
    }

    /**
     * Generate a unique device ID
     */
    private generateDeviceId(): string {
        // Try to use a persistent ID
        const os = require('os');
        const machineId = os.hostname() + os.platform() + os.arch();
        return crypto.createHash('sha256').update(machineId).digest('hex').slice(0, DEVICE_ID_LENGTH);
    }

    /**
     * Get a friendly computer name
     */
    private getComputerName(): string {
        const os = require('os');
        return os.hostname() || 'Vault Device';
    }

    /**
     * Generate key pair for secure communication
     */
    private generateKeyPair(): string {
        // Generate ECDH key pair for key exchange
        const ecdh = crypto.createECDH('prime256v1');
        ecdh.generateKeys();
        return ecdh.getPublicKey('base64');
    }

    /**
     * Start advertising this device and browsing for others
     */
    start(syncVersion: number = 0): void {
        this.syncVersion = syncVersion;

        try {
            this.bonjour = new Bonjour();

            // Publish our service
            this.publishedService = this.bonjour.publish({
                name: `vault-${this.deviceId}`,
                type: SERVICE_TYPE,
                port: SERVICE_PORT,
                txt: {
                    id: this.deviceId,
                    name: this.deviceName,
                    pk: this.publicKey.slice(0, 64), // Truncate for mDNS limits
                    v: String(this.syncVersion),
                },
            }) as unknown as Service;

            console.log(`Publishing service: vault-${this.deviceId} on port ${SERVICE_PORT}`);

            // Browse for other services
            this.browser = this.bonjour.find({ type: SERVICE_TYPE }, (service: any) => {
                this.handleServiceFound(service);
            });

            // Handle service removal
            this.browser.on('down', (service: any) => {
                this.handleServiceLost(service);
            });

            console.log('Discovery service started');
        } catch (error) {
            console.error('Failed to start discovery:', error);
            this.emit('error', error);
        }
    }

    /**
     * Stop discovery and advertising
     */
    stop(): void {
        if (this.publishedService) {
            this.publishedService.stop?.();
            this.publishedService = null;
        }

        if (this.browser) {
            this.browser.stop();
            this.browser = null;
        }

        if (this.bonjour) {
            this.bonjour.destroy();
            this.bonjour = null;
        }

        this.discoveredDevices.clear();
        console.log('Discovery service stopped');
    }

    /**
     * Handle discovered service
     */
    private handleServiceFound(service: any): void {
        const txt = service.txt || {};
        const deviceId = txt.id;

        // Ignore our own service
        if (deviceId === this.deviceId) return;

        const device: DiscoveredDevice = {
            id: deviceId,
            name: txt.name || service.name,
            host: service.host || service.addresses?.[0],
            port: service.port,
            publicKey: txt.pk || '',
            lastSeen: Date.now(),
            syncVersion: parseInt(txt.v) || 0,
        };

        const isNew = !this.discoveredDevices.has(deviceId);
        this.discoveredDevices.set(deviceId, device);

        if (isNew) {
            console.log(`Discovered device: ${device.name} (${device.id})`);
            this.emit('deviceFound', device);
        } else {
            this.emit('deviceUpdated', device);
        }
    }

    /**
     * Handle lost service
     */
    private handleServiceLost(service: any): void {
        const txt = service.txt || {};
        const deviceId = txt.id;

        if (deviceId && this.discoveredDevices.has(deviceId)) {
            const device = this.discoveredDevices.get(deviceId)!;
            this.discoveredDevices.delete(deviceId);
            console.log(`Lost device: ${device.name} (${device.id})`);
            this.emit('deviceLost', device);
        }
    }

    /**
     * Get all discovered devices
     */
    getDevices(): DiscoveredDevice[] {
        return Array.from(this.discoveredDevices.values());
    }

    /**
     * Get specific device by ID
     */
    getDevice(deviceId: string): DiscoveredDevice | undefined {
        return this.discoveredDevices.get(deviceId);
    }

    /**
     * Get this device's info
     */
    getDeviceInfo(): DeviceInfo {
        return {
            id: this.deviceId,
            name: this.deviceName,
            publicKey: this.publicKey,
            syncVersion: this.syncVersion,
        };
    }

    /**
     * Update advertised sync version
     */
    updateSyncVersion(version: number): void {
        this.syncVersion = version;

        // Re-publish with updated version
        if (this.bonjour && this.publishedService) {
            this.publishedService.stop?.();

            this.publishedService = this.bonjour.publish({
                name: `vault-${this.deviceId}`,
                type: SERVICE_TYPE,
                port: SERVICE_PORT,
                txt: {
                    id: this.deviceId,
                    name: this.deviceName,
                    pk: this.publicKey.slice(0, 64),
                    v: String(this.syncVersion),
                },
            }) as unknown as Service;
        }
    }
}

// Singleton instance
export const discoveryService = new DiscoveryService();

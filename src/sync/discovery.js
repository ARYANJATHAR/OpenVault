"use strict";
/**
 * LAN Device Discovery
 *
 * Uses mDNS (Bonjour/Avahi) to discover other Vault instances on the local network.
 * Enables zero-configuration device pairing for password synchronization.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoveryService = exports.DiscoveryService = void 0;
const bonjour_service_1 = __importDefault(require("bonjour-service"));
const crypto = __importStar(require("crypto"));
const events_1 = require("events");
// ============================================================================
// Constants
// ============================================================================
const SERVICE_TYPE = 'vaultsync';
const SERVICE_PORT = 51820;
const DEVICE_ID_LENGTH = 16;
// ============================================================================
// Discovery Service
// ============================================================================
class DiscoveryService extends events_1.EventEmitter {
    bonjour = null;
    browser = null;
    publishedService = null;
    deviceId;
    deviceName;
    publicKey;
    syncVersion = 0;
    discoveredDevices = new Map();
    constructor() {
        super();
        this.deviceId = this.generateDeviceId();
        this.deviceName = this.getComputerName();
        this.publicKey = this.generateKeyPair();
    }
    /**
     * Generate a unique device ID
     */
    generateDeviceId() {
        // Try to use a persistent ID
        const os = require('os');
        const machineId = os.hostname() + os.platform() + os.arch();
        return crypto.createHash('sha256').update(machineId).digest('hex').slice(0, DEVICE_ID_LENGTH);
    }
    /**
     * Get a friendly computer name
     */
    getComputerName() {
        const os = require('os');
        return os.hostname() || 'Vault Device';
    }
    /**
     * Generate key pair for secure communication
     */
    generateKeyPair() {
        // Generate ECDH key pair for key exchange
        const ecdh = crypto.createECDH('prime256v1');
        ecdh.generateKeys();
        return ecdh.getPublicKey('base64');
    }
    /**
     * Start advertising this device and browsing for others
     */
    start(syncVersion = 0) {
        this.syncVersion = syncVersion;
        try {
            this.bonjour = new bonjour_service_1.default();
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
            });
            console.log(`Publishing service: vault-${this.deviceId} on port ${SERVICE_PORT}`);
            // Browse for other services
            this.browser = this.bonjour.find({ type: SERVICE_TYPE }, (service) => {
                this.handleServiceFound(service);
            });
            // Handle service removal
            this.browser.on('down', (service) => {
                this.handleServiceLost(service);
            });
            console.log('Discovery service started');
        }
        catch (error) {
            console.error('Failed to start discovery:', error);
            this.emit('error', error);
        }
    }
    /**
     * Stop discovery and advertising
     */
    stop() {
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
    handleServiceFound(service) {
        const txt = service.txt || {};
        const deviceId = txt.id;
        // Ignore our own service
        if (deviceId === this.deviceId)
            return;
        const device = {
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
        }
        else {
            this.emit('deviceUpdated', device);
        }
    }
    /**
     * Handle lost service
     */
    handleServiceLost(service) {
        const txt = service.txt || {};
        const deviceId = txt.id;
        if (deviceId && this.discoveredDevices.has(deviceId)) {
            const device = this.discoveredDevices.get(deviceId);
            this.discoveredDevices.delete(deviceId);
            console.log(`Lost device: ${device.name} (${device.id})`);
            this.emit('deviceLost', device);
        }
    }
    /**
     * Get all discovered devices
     */
    getDevices() {
        return Array.from(this.discoveredDevices.values());
    }
    /**
     * Get specific device by ID
     */
    getDevice(deviceId) {
        return this.discoveredDevices.get(deviceId);
    }
    /**
     * Get this device's info
     */
    getDeviceInfo() {
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
    updateSyncVersion(version) {
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
            });
        }
    }
}
exports.DiscoveryService = DiscoveryService;
// Singleton instance
exports.discoveryService = new DiscoveryService();
//# sourceMappingURL=discovery.js.map
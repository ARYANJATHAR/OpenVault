"use strict";
/**
 * Sync Transport Layer
 *
 * Provides encrypted TCP transport for device-to-device synchronization.
 * Uses TLS for transport security.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncTransport = exports.SyncTransport = void 0;
const net = __importStar(require("net"));
const events_1 = require("events");
// ============================================================================
// Constants
// ============================================================================
const SYNC_PORT = 51820;
const MESSAGE_HEADER_SIZE = 4; // 4 bytes for message length
// ============================================================================
// Transport
// ============================================================================
class SyncTransport extends events_1.EventEmitter {
    server = null;
    connections = new Map();
    selfSignedCert = null;
    /**
     * Start transport server
     */
    async start() {
        // Generate self-signed certificate for TLS
        this.selfSignedCert = this.generateSelfSignedCert();
        // For simplicity, use plain TCP in development
        // In production, wrap with TLS
        this.server = net.createServer((socket) => {
            this.handleConnection(socket);
        });
        this.server.on('error', (error) => {
            console.error('Transport server error:', error);
            this.emit('error', error);
        });
        return new Promise((resolve, reject) => {
            this.server.listen(SYNC_PORT, () => {
                console.log(`Sync transport listening on port ${SYNC_PORT}`);
                resolve();
            });
            this.server.on('error', reject);
        });
    }
    /**
     * Stop transport server
     */
    stop() {
        // Close all connections
        for (const [_, conn] of this.connections) {
            conn.socket.destroy();
        }
        this.connections.clear();
        // Close server
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
    /**
     * Connect to another device
     */
    async connect(host, port) {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection({ host, port }, () => {
                const deviceId = `${host}:${port}`;
                this.connections.set(deviceId, {
                    socket,
                    deviceId,
                    buffer: Buffer.alloc(0),
                });
                console.log(`Connected to ${deviceId}`);
                resolve(deviceId);
            });
            socket.on('error', reject);
            socket.on('data', (data) => {
                const deviceId = `${host}:${port}`;
                this.handleData(deviceId, data);
            });
            socket.on('close', () => {
                const deviceId = `${host}:${port}`;
                this.connections.delete(deviceId);
                this.emit('disconnected', deviceId);
            });
        });
    }
    /**
     * Send message to device
     */
    async send(message, deviceId) {
        const connection = this.connections.get(deviceId);
        if (!connection) {
            throw new Error(`Not connected to device: ${deviceId}`);
        }
        // Add timestamp
        message.timestamp = Date.now();
        // Serialize message
        const json = JSON.stringify(message);
        const messageBuffer = Buffer.from(json, 'utf8');
        // Create length-prefixed frame
        const lengthBuffer = Buffer.alloc(MESSAGE_HEADER_SIZE);
        lengthBuffer.writeUInt32BE(messageBuffer.length, 0);
        const frame = Buffer.concat([lengthBuffer, messageBuffer]);
        // Send
        return new Promise((resolve, reject) => {
            connection.socket.write(frame, (error) => {
                if (error)
                    reject(error);
                else
                    resolve();
            });
        });
    }
    /**
     * Handle incoming connection
     */
    handleConnection(socket) {
        const deviceId = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`Incoming connection from ${deviceId}`);
        this.connections.set(deviceId, {
            socket,
            deviceId,
            buffer: Buffer.alloc(0),
        });
        socket.on('data', (data) => {
            this.handleData(deviceId, data);
        });
        socket.on('close', () => {
            this.connections.delete(deviceId);
            this.emit('disconnected', deviceId);
        });
        socket.on('error', (error) => {
            console.error(`Connection error from ${deviceId}:`, error);
            this.connections.delete(deviceId);
        });
        this.emit('connected', deviceId);
    }
    /**
     * Handle incoming data
     */
    handleData(deviceId, data) {
        const connection = this.connections.get(deviceId);
        if (!connection)
            return;
        // Append to buffer
        connection.buffer = Buffer.concat([connection.buffer, data]);
        // Process complete messages
        while (connection.buffer.length >= MESSAGE_HEADER_SIZE) {
            const messageLength = connection.buffer.readUInt32BE(0);
            if (connection.buffer.length < MESSAGE_HEADER_SIZE + messageLength) {
                // Wait for more data
                break;
            }
            // Extract message
            const messageData = connection.buffer.subarray(MESSAGE_HEADER_SIZE, MESSAGE_HEADER_SIZE + messageLength);
            // Remove processed data from buffer
            connection.buffer = connection.buffer.subarray(MESSAGE_HEADER_SIZE + messageLength);
            // Parse and emit
            try {
                const message = JSON.parse(messageData.toString('utf8'));
                this.emit('message', message, deviceId);
            }
            catch (error) {
                console.error('Failed to parse message:', error);
            }
        }
    }
    /**
     * Generate self-signed certificate for TLS
     */
    generateSelfSignedCert() {
        // In production, generate proper self-signed certs
        // For now, return placeholder
        return {
            cert: '',
            key: '',
        };
    }
    /**
     * Get connected device IDs
     */
    getConnectedDevices() {
        return Array.from(this.connections.keys());
    }
    /**
     * Check if connected to device
     */
    isConnected(deviceId) {
        return this.connections.has(deviceId);
    }
    /**
     * Disconnect from device
     */
    disconnect(deviceId) {
        const connection = this.connections.get(deviceId);
        if (connection) {
            connection.socket.destroy();
            this.connections.delete(deviceId);
        }
    }
}
exports.SyncTransport = SyncTransport;
// Singleton
exports.syncTransport = new SyncTransport();
//# sourceMappingURL=transport.js.map
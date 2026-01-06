/**
 * Mobile Sync Server
 * 
 * Simple TCP server that accepts connections from mobile app.
 * No mDNS discovery - uses QR code or manual IP entry.
 */

import * as net from 'net';
import * as os from 'os';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// Constants
// ============================================================================

const SYNC_PORT = 51820;
const MESSAGE_HEADER_SIZE = 4;

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
    deviceId: string;
    deviceName: string;
}

interface Connection {
    socket: net.Socket;
    id: string;
    buffer: Buffer;
    authenticated: boolean;
}

// ============================================================================
// Mobile Sync Server
// ============================================================================

export class MobileSyncServer extends EventEmitter {
    private server: net.Server | null = null;
    private connections: Map<string, Connection> = new Map();
    private pairingCode: string | null = null;
    private deviceId: string;
    private deviceName: string;

    constructor() {
        super();
        this.deviceId = this.generateDeviceId();
        this.deviceName = os.hostname() || 'Desktop Vault';
    }

    /**
     * Generate a unique device ID
     */
    private generateDeviceId(): string {
        const machineId = os.hostname() + os.platform() + os.arch();
        return crypto.createHash('sha256').update(machineId).digest('hex').slice(0, 16);
    }

    /**
     * Get all local IP addresses
     */
    getLocalIPs(): string[] {
        const interfaces = os.networkInterfaces();
        const ips: string[] = [];

        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
                // Skip internal (loopback) and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    ips.push(iface.address);
                }
            }
        }

        return ips;
    }

    /**
     * Generate a one-time pairing code
     */
    generatePairingCode(): string {
        this.pairingCode = crypto.randomBytes(3).toString('hex').toUpperCase();
        // Auto-expire after 5 minutes
        setTimeout(() => {
            this.pairingCode = null;
        }, 5 * 60 * 1000);
        return this.pairingCode;
    }

    /**
     * Get connection info for QR code
     */
    getConnectionInfo(): ConnectionInfo {
        const ips = this.getLocalIPs();
        return {
            ip: ips[0] || '127.0.0.1',
            port: SYNC_PORT,
            deviceId: this.deviceId,
            deviceName: this.deviceName,
        };
    }

    /**
     * Start the sync server
     */
    async start(): Promise<void> {
        if (this.server) {
            console.log('Mobile sync server already running');
            return;
        }

        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket) => {
                this.handleConnection(socket);
            });

            this.server.on('error', (error: NodeJS.ErrnoException) => {
                if (error.code === 'EADDRINUSE') {
                    console.log(`Port ${SYNC_PORT} in use, trying to close existing...`);
                    // Try to recover
                    setTimeout(() => {
                        this.server?.close();
                        this.server?.listen(SYNC_PORT, '0.0.0.0');
                    }, 1000);
                } else {
                    console.error('Mobile sync server error:', error);
                    this.emit('error', error);
                    reject(error);
                }
            });

            this.server.listen(SYNC_PORT, '0.0.0.0', () => {
                console.log(`Mobile sync server listening on port ${SYNC_PORT}`);
                console.log('Available IPs:', this.getLocalIPs());
                this.emit('started');
                resolve();
            });
        });
    }

    /**
     * Stop the sync server
     */
    stop(): void {
        // Close all connections
        for (const [_, conn] of this.connections) {
            conn.socket.destroy();
        }
        this.connections.clear();

        if (this.server) {
            this.server.close();
            this.server = null;
            console.log('Mobile sync server stopped');
            this.emit('stopped');
        }
    }

    /**
     * Handle incoming connection
     */
    private handleConnection(socket: net.Socket): void {
        const connId = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`Mobile connection from ${connId}`);

        const connection: Connection = {
            socket,
            id: connId,
            buffer: Buffer.alloc(0),
            authenticated: false,
        };

        this.connections.set(connId, connection);

        socket.on('data', (data) => {
            this.handleData(connId, data);
        });

        socket.on('close', () => {
            console.log(`Mobile disconnected: ${connId}`);
            this.connections.delete(connId);
            this.emit('disconnected', connId);
        });

        socket.on('error', (error) => {
            console.error(`Connection error from ${connId}:`, error);
            this.connections.delete(connId);
        });

        this.emit('connected', connId);
    }

    /**
     * Handle incoming data
     */
    private handleData(connId: string, data: Buffer): void {
        const connection = this.connections.get(connId);
        if (!connection) return;

        // Append to buffer
        connection.buffer = Buffer.concat([connection.buffer, data]);

        // Process complete messages
        while (connection.buffer.length >= MESSAGE_HEADER_SIZE) {
            const messageLength = connection.buffer.readUInt32BE(0);

            if (connection.buffer.length < MESSAGE_HEADER_SIZE + messageLength) {
                break; // Wait for more data
            }

            // Extract message
            const messageData = connection.buffer.subarray(
                MESSAGE_HEADER_SIZE,
                MESSAGE_HEADER_SIZE + messageLength
            );

            // Remove processed data
            connection.buffer = connection.buffer.subarray(MESSAGE_HEADER_SIZE + messageLength);

            // Parse and emit
            try {
                const message: SyncMessage = JSON.parse(messageData.toString('utf8'));
                console.log(`Received from mobile: ${message.type}`);
                this.emit('message', message, connId);
            } catch (error) {
                console.error('Failed to parse mobile message:', error);
            }
        }
    }

    /**
     * Send message to a connected device
     */
    send(message: SyncMessage, connId: string): void {
        const connection = this.connections.get(connId);
        if (!connection) {
            console.error(`No connection found: ${connId}`);
            return;
        }

        message.timestamp = Date.now();
        const json = JSON.stringify(message);
        const messageBuffer = Buffer.from(json, 'utf8');

        // Create length-prefixed frame
        const lengthBuffer = Buffer.alloc(MESSAGE_HEADER_SIZE);
        lengthBuffer.writeUInt32BE(messageBuffer.length, 0);

        const frame = Buffer.concat([lengthBuffer, messageBuffer]);
        connection.socket.write(frame);
    }

    /**
     * Broadcast message to all connected devices
     */
    broadcast(message: SyncMessage): void {
        for (const [connId] of this.connections) {
            this.send(message, connId);
        }
    }

    /**
     * Get connected device count
     */
    getConnectedCount(): number {
        return this.connections.size;
    }

    /**
     * Check if server is running
     */
    isRunning(): boolean {
        return this.server !== null;
    }
}

// Singleton instance
export const mobileSyncServer = new MobileSyncServer();

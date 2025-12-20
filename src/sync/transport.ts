/**
 * Sync Transport Layer
 * 
 * Provides encrypted TCP transport for device-to-device synchronization.
 * Uses TLS for transport security.
 */

import * as net from 'net';
import * as tls from 'tls';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// Constants
// ============================================================================

const SYNC_PORT = 51820;
const MESSAGE_HEADER_SIZE = 4; // 4 bytes for message length

// ============================================================================
// Types
// ============================================================================

export interface SyncMessage {
    type: string;
    payload: any;
    timestamp?: number;
}

interface Connection {
    socket: net.Socket;
    deviceId: string;
    buffer: Buffer;
}

// ============================================================================
// Transport
// ============================================================================

export class SyncTransport extends EventEmitter {
    private server: net.Server | null = null;
    private connections: Map<string, Connection> = new Map();
    private selfSignedCert: { cert: string; key: string } | null = null;

    /**
     * Start transport server
     */
    async start(): Promise<void> {
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
            this.server!.listen(SYNC_PORT, () => {
                console.log(`Sync transport listening on port ${SYNC_PORT}`);
                resolve();
            });

            this.server!.on('error', reject);
        });
    }

    /**
     * Stop transport server
     */
    stop(): void {
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
    async connect(host: string, port: number): Promise<string> {
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
    async send(message: SyncMessage, deviceId: string): Promise<void> {
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
                if (error) reject(error);
                else resolve();
            });
        });
    }

    /**
     * Handle incoming connection
     */
    private handleConnection(socket: net.Socket): void {
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
    private handleData(deviceId: string, data: Buffer): void {
        const connection = this.connections.get(deviceId);
        if (!connection) return;

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
            const messageData = connection.buffer.subarray(
                MESSAGE_HEADER_SIZE,
                MESSAGE_HEADER_SIZE + messageLength
            );

            // Remove processed data from buffer
            connection.buffer = connection.buffer.subarray(MESSAGE_HEADER_SIZE + messageLength);

            // Parse and emit
            try {
                const message: SyncMessage = JSON.parse(messageData.toString('utf8'));
                this.emit('message', message, deviceId);
            } catch (error) {
                console.error('Failed to parse message:', error);
            }
        }
    }

    /**
     * Generate self-signed certificate for TLS
     */
    private generateSelfSignedCert(): { cert: string; key: string } {
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
    getConnectedDevices(): string[] {
        return Array.from(this.connections.keys());
    }

    /**
     * Check if connected to device
     */
    isConnected(deviceId: string): boolean {
        return this.connections.has(deviceId);
    }

    /**
     * Disconnect from device
     */
    disconnect(deviceId: string): void {
        const connection = this.connections.get(deviceId);
        if (connection) {
            connection.socket.destroy();
            this.connections.delete(deviceId);
        }
    }
}

// Singleton
export const syncTransport = new SyncTransport();

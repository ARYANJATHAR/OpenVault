/**
 * Mobile WebSocket Server
 * 
 * WebSocket server for mobile app sync.
 * Uses WebSocket instead of raw TCP for Expo compatibility.
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as os from 'os';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================================
// Constants
// ============================================================================

const MOBILE_WS_PORT = 51821;

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
    ws: WebSocket;
    id: string;
}

// ============================================================================
// Mobile WebSocket Server
// ============================================================================

export class MobileWebSocketServer extends EventEmitter {
    private wss: WebSocketServer | null = null;
    private connections: Map<string, Connection> = new Map();
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
     * Get connection info for QR code
     */
    getConnectionInfo(): ConnectionInfo {
        const ips = this.getLocalIPs();
        return {
            ip: ips[0] || '127.0.0.1',
            port: MOBILE_WS_PORT,
            deviceId: this.deviceId,
            deviceName: this.deviceName,
        };
    }

    /**
     * Start the WebSocket server
     */
    async start(): Promise<void> {
        if (this.wss) {
            console.log('Mobile WebSocket server already running');
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                this.wss = new WebSocketServer({ 
                    port: MOBILE_WS_PORT,
                    host: '0.0.0.0' // Listen on all interfaces
                });

                this.wss.on('connection', (ws, req) => {
                    this.handleConnection(ws, req);
                });

                this.wss.on('error', (error: NodeJS.ErrnoException) => {
                    console.error('Mobile WebSocket server error:', error);
                    this.emit('error', error);
                    reject(error);
                });

                this.wss.on('listening', () => {
                    console.log(`Mobile WebSocket server listening on ws://0.0.0.0:${MOBILE_WS_PORT}`);
                    console.log('Available IPs:', this.getLocalIPs());
                    this.emit('started');
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Stop the WebSocket server
     */
    stop(): void {
        // Close all connections
        for (const [_, conn] of this.connections) {
            conn.ws.close();
        }
        this.connections.clear();

        if (this.wss) {
            this.wss.close();
            this.wss = null;
            console.log('Mobile WebSocket server stopped');
            this.emit('stopped');
        }
    }

    /**
     * Handle incoming connection
     */
    private handleConnection(ws: WebSocket, req: any): void {
        const connId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
        console.log(`Mobile WebSocket connection from ${connId}`);

        const connection: Connection = {
            ws,
            id: connId,
        };

        this.connections.set(connId, connection);

        ws.on('message', (data) => {
            try {
                const message: SyncMessage = JSON.parse(data.toString());
                console.log(`Received from mobile: ${message.type}`);
                this.emit('message', message, connId);
            } catch (error) {
                console.error('Failed to parse mobile message:', error);
            }
        });

        ws.on('close', () => {
            console.log(`Mobile WebSocket disconnected: ${connId}`);
            this.connections.delete(connId);
            this.emit('disconnected', connId);
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error from ${connId}:`, error);
            this.connections.delete(connId);
        });

        this.emit('connected', connId);

        // Send welcome message
        this.send({
            type: 'welcome',
            payload: {
                deviceId: this.deviceId,
                deviceName: this.deviceName,
            }
        }, connId);
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
        
        if (connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.send(json);
        }
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
        return this.wss !== null;
    }
}

// Singleton instance
export const mobileWSServer = new MobileWebSocketServer();

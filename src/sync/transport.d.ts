/**
 * Sync Transport Layer
 *
 * Provides encrypted TCP transport for device-to-device synchronization.
 * Uses TLS for transport security.
 */
import { EventEmitter } from 'events';
export interface SyncMessage {
    type: string;
    payload: any;
    timestamp?: number;
}
export declare class SyncTransport extends EventEmitter {
    private server;
    private connections;
    private selfSignedCert;
    /**
     * Start transport server
     */
    start(): Promise<void>;
    /**
     * Stop transport server
     */
    stop(): void;
    /**
     * Connect to another device
     */
    connect(host: string, port: number): Promise<string>;
    /**
     * Send message to device
     */
    send(message: SyncMessage, deviceId: string): Promise<void>;
    /**
     * Handle incoming connection
     */
    private handleConnection;
    /**
     * Handle incoming data
     */
    private handleData;
    /**
     * Generate self-signed certificate for TLS
     */
    private generateSelfSignedCert;
    /**
     * Get connected device IDs
     */
    getConnectedDevices(): string[];
    /**
     * Check if connected to device
     */
    isConnected(deviceId: string): boolean;
    /**
     * Disconnect from device
     */
    disconnect(deviceId: string): void;
}
export declare const syncTransport: SyncTransport;
//# sourceMappingURL=transport.d.ts.map
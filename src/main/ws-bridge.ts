import { WebSocketServer, WebSocket } from 'ws';
import { handleMessage } from './native-messaging';

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

export function startWebSocketBridge(port = 9876, host = '127.0.0.1'): void {
    if (wss) return;

    try {
        wss = new WebSocketServer({ port, host });
    } catch (error) {
        wss = null;
        console.error(`Failed to bind WebSocket bridge on ws://${host}:${port}`, error);
        return;
    }

    wss.on('connection', (ws) => {
        clients.add(ws);
        
        ws.on('message', async (data) => {
            try {
                const text = typeof data === 'string' ? data : data.toString('utf8');
                const msg = JSON.parse(text);

                const response = await handleMessage(msg);
                ws.send(JSON.stringify(response));
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                ws.send(JSON.stringify({ type: 'error', error: errMsg }));
            }
        });

        ws.on('close', () => {
            clients.delete(ws);
        });
    });

    wss.on('listening', () => {
        console.log(`WebSocket bridge listening on ws://${host}:${port}`);
    });

    wss.on('error', (error) => {
        console.error('WebSocket bridge error:', error);
    });
}

export function stopWebSocketBridge(): void {
    if (!wss) return;
    try {
        wss.close();
    } finally {
        wss = null;
        clients.clear();
    }
}

export function getWebSocketClients(): Set<WebSocket> {
    return clients;
}

export function broadcastToClients(message: any): void {
    const messageStr = JSON.stringify(message);
    clients.forEach((ws) => {
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(messageStr);
            }
        } catch (error) {
            // Ignore errors
        }
    });
}

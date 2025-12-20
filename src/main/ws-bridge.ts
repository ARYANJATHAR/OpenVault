import { WebSocketServer } from 'ws';
import { handleMessage } from './native-messaging';

let wss: WebSocketServer | null = null;

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
    }
}

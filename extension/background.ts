/**
 * Background Service Worker
 * 
 * Handles communication between content scripts and the native app.
 * Manages credential requests and autofill operations.
 */

// ============================================================================
// Native App Communication
// ============================================================================

interface NativeMessage {
    type: string;
    payload?: any;
    requestId?: string;
}

interface NativeResponse {
    type: string;
    payload?: any;
    requestId?: string;
    error?: string;
}

let socket: WebSocket | null = null;
let pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
}>();

/**
 * Connect to native app via WebSocket
 * Note: In production, this would use Native Messaging API
 * For development, we use a WebSocket connection
 */
async function connectToNativeApp(): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            // Try to connect to local app
            socket = new WebSocket('ws://localhost:9876');

            socket.onopen = () => {
                console.log('Connected to Vault native app');
                resolve(true);
            };

            socket.onmessage = (event) => {
                try {
                    const response: NativeResponse = JSON.parse(event.data);

                    if (response.requestId && pendingRequests.has(response.requestId)) {
                        const { resolve, reject } = pendingRequests.get(response.requestId)!;
                        pendingRequests.delete(response.requestId);

                        if (response.error) {
                            reject(new Error(response.error));
                        } else {
                            resolve(response);
                        }
                    }
                } catch (error) {
                    console.error('Failed to parse native response:', error);
                }
            };

            socket.onerror = () => {
                console.log('Failed to connect to Vault native app');
                resolve(false);
            };

            socket.onclose = () => {
                socket = null;
                console.log('Disconnected from Vault native app');
            };
        } catch {
            resolve(false);
        }
    });
}

/**
 * Send message to native app and wait for response
 */
async function sendToNativeApp(message: NativeMessage): Promise<NativeResponse> {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        const connected = await connectToNativeApp();
        if (!connected) {
            throw new Error('Failed to connect to Vault. Is the app running?');
        }
    }

    const requestId = crypto.randomUUID();
    message.requestId = requestId;

    return new Promise((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });

        socket!.send(JSON.stringify(message));

        // Timeout after 10 seconds
        setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                reject(new Error('Request timed out'));
            }
        }, 10000);
    });
}

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Get credentials for a URL
 */
async function getCredentials(url: string): Promise<any[]> {
    try {
        const response = await sendToNativeApp({
            type: 'getCredentials',
            payload: { url },
        });

        return response.payload?.entries || [];
    } catch (error) {
        console.error('Failed to get credentials:', error);
        return [];
    }
}

/**
 * Get full credential details for autofill
 */
async function getCredentialDetails(entryId: string): Promise<{
    username: string;
    password: string;
} | null> {
    try {
        const response = await sendToNativeApp({
            type: 'fillCredentials',
            payload: { entryId },
        });

        return response.payload || null;
    } catch (error) {
        console.error('Failed to get credential details:', error);
        return null;
    }
}

/**
 * Check if vault is unlocked
 */
async function isVaultUnlocked(): Promise<boolean> {
    try {
        const response = await sendToNativeApp({ type: 'isUnlocked' });
        return response.payload?.unlocked || false;
    } catch {
        return false;
    }
}

/**
 * Save new credentials
 */
async function saveCredentials(
    title: string,
    username: string,
    password: string,
    url: string
): Promise<string | null> {
    try {
        const response = await sendToNativeApp({
            type: 'saveCredentials',
            payload: { title, username, password, siteUrl: url },
        });

        return response.payload?.id || null;
    } catch (error) {
        console.error('Failed to save credentials:', error);
        return null;
    }
}

// ============================================================================
// Extension Message Listener
// ============================================================================

chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    const handleAsync = async () => {
        switch (message.type) {
            case 'getCredentials':
                return await getCredentials(message.url);

            case 'fillCredentials':
                return await getCredentialDetails(message.entryId);

            case 'isUnlocked':
                return await isVaultUnlocked();

            case 'saveCredentials':
                return await saveCredentials(
                    message.title,
                    message.username,
                    message.password,
                    message.url
                );

            case 'openVaultApp':
                // Ask the local desktop app to show/focus itself.
                try {
                    await sendToNativeApp({ type: 'openVaultApp' });
                    return { success: true };
                } catch (error) {
                    console.error('Failed to open Vault app via local bridge:', error);
                    return { success: false, error: String(error) };
                }

            default:
                return { error: 'Unknown message type' };
        }
    };

    handleAsync().then(sendResponse);
    return true; // Keep channel open for async response
});

// ============================================================================
// Command Handlers
// ============================================================================

chrome.commands.onCommand.addListener(async (command: string) => {
    if (command === 'autofill') {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab?.id && tab.url) {
            // Send autofill trigger to content script
            chrome.tabs.sendMessage(tab.id, {
                type: 'triggerAutofill',
                url: tab.url,
            });
        }
    }
});

// ============================================================================
// Lifecycle
// ============================================================================

// Connect on install/update
chrome.runtime.onInstalled.addListener(() => {
    console.log('Vault extension installed/updated');
    connectToNativeApp();
});

// Try to connect on startup
chrome.runtime.onStartup.addListener(() => {
    connectToNativeApp();
});

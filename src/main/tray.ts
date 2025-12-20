/**
 * System Tray Module
 * 
 * Creates and manages the system tray icon and menu.
 * Allows quick access to vault functions without opening the main window.
 */

import { Tray, Menu, nativeImage, app } from 'electron';
import * as path from 'path';

let tray: Tray | null = null;

/**
 * Create the system tray icon and menu
 */
export function createTray(
    onShow: () => void,
    onQuit: () => void
): Tray {
    // Create tray icon
    const iconPath = path.join(__dirname, '../../assets/tray-icon.png');

    // Create a simple icon if the file doesn't exist
    let icon = nativeImage.createEmpty();
    try {
        icon = nativeImage.createFromPath(iconPath);
    } catch {
        // Create a simple 16x16 icon
        icon = nativeImage.createFromBuffer(
            Buffer.from([
                0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG header
            ]),
            { width: 16, height: 16 }
        );
    }

    tray = new Tray(icon);
    tray.setToolTip('Vault Password Manager');

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Vault',
            click: onShow,
        },
        {
            label: 'Quick Search',
            accelerator: 'CommandOrControl+Shift+L',
            click: onShow,
        },
        { type: 'separator' },
        {
            label: 'Lock Vault',
            click: () => {
                // Will be implemented with vault lock
            },
        },
        { type: 'separator' },
        {
            label: 'Settings',
            click: () => {
                onShow();
                // Navigate to settings
            },
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: onQuit,
        },
    ]);

    tray.setContextMenu(contextMenu);

    // Double-click to show window
    tray.on('double-click', onShow);

    return tray;
}

/**
 * Update tray icon based on vault state
 */
export function updateTrayIcon(isLocked: boolean): void {
    if (!tray) return;

    // Could swap icons based on locked/unlocked state
    tray.setToolTip(
        isLocked ? 'Vault - Locked' : 'Vault - Unlocked'
    );
}

/**
 * Show a notification from the tray
 */
export function showTrayNotification(title: string, body: string): void {
    if (!tray) return;

    tray.displayBalloon({
        title,
        content: body,
        iconType: 'info',
    });
}

/**
 * Destroy the tray icon
 */
export function destroyTray(): void {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}

export { tray };

/**
 * QR Code Generator
 * Uses the 'qrcode' library for reliable QR code generation
 */

import QRCode from 'qrcode';

/**
 * Generate QR code as SVG string
 */
export async function generateQRCodeSVG(text: string, size: number = 200): Promise<string> {
    try {
        const svg = await QRCode.toString(text, {
            type: 'svg',
            width: size,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
            errorCorrectionLevel: 'M',
        });
        return svg;
    } catch (error) {
        console.error('Failed to generate QR code:', error);
        return '';
    }
}

/**
 * Generate QR code as data URL (PNG)
 */
export async function generateQRCodeDataURL(text: string, size: number = 200): Promise<string> {
    try {
        return await QRCode.toDataURL(text, {
            width: size,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
            errorCorrectionLevel: 'M',
        });
    } catch (error) {
        console.error('Failed to generate QR code data URL:', error);
        return '';
    }
}

/**
 * Generate QR code as boolean matrix (for custom rendering)
 */
export function generateQRCode(text: string): boolean[][] {
    // Use QRCode.create for synchronous matrix generation
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const modules = qr.modules;
    const size = modules.size;
    
    const matrix: boolean[][] = [];
    for (let row = 0; row < size; row++) {
        const rowData: boolean[] = [];
        for (let col = 0; col < size; col++) {
            rowData.push(modules.get(row, col) === 1);
        }
        matrix.push(rowData);
    }
    
    return matrix;
}

/**
 * Simple QR Code Generator
 * Generates QR codes as a boolean matrix for rendering
 * Based on QR Code specification for alphanumeric data
 */

// QR Code constants
const PATTERNS = {
    FINDER: [
        [1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1],
    ],
    ALIGNMENT: [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
    ],
};

// Error correction levels
const EC_LEVELS = {
    L: 0, // 7% recovery
    M: 1, // 15% recovery
    Q: 2, // 25% recovery
    H: 3, // 30% recovery
};

// Galois Field for Reed-Solomon error correction
class GaloisField {
    private static EXP: number[] = new Array(512);
    private static LOG: number[] = new Array(256);
    private static initialized = false;

    static init() {
        if (this.initialized) return;
        
        let x = 1;
        for (let i = 0; i < 255; i++) {
            this.EXP[i] = x;
            this.LOG[x] = i;
            x *= 2;
            if (x >= 256) {
                x ^= 0x11d; // Primitive polynomial
            }
        }
        for (let i = 255; i < 512; i++) {
            this.EXP[i] = this.EXP[i - 255];
        }
        this.initialized = true;
    }

    static exp(n: number): number {
        this.init();
        return this.EXP[n % 255];
    }

    static log(n: number): number {
        this.init();
        if (n === 0) throw new Error('Log of 0');
        return this.LOG[n];
    }

    static mul(a: number, b: number): number {
        if (a === 0 || b === 0) return 0;
        return this.exp(this.log(a) + this.log(b));
    }
}

// Simple polynomial operations for RS encoding
function generatePolynomial(degree: number): number[] {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
        const newPoly = new Array(poly.length + 1).fill(0);
        for (let j = 0; j < poly.length; j++) {
            newPoly[j] ^= poly[j];
            newPoly[j + 1] ^= GaloisField.mul(poly[j], GaloisField.exp(i));
        }
        poly = newPoly;
    }
    return poly;
}

function rsEncode(data: number[], ecWords: number): number[] {
    const poly = generatePolynomial(ecWords);
    const result = new Array(data.length + ecWords).fill(0);
    
    for (let i = 0; i < data.length; i++) {
        result[i] = data[i];
    }
    
    for (let i = 0; i < data.length; i++) {
        const coef = result[i];
        if (coef !== 0) {
            for (let j = 0; j < poly.length; j++) {
                result[i + j] ^= GaloisField.mul(poly[j], coef);
            }
        }
    }
    
    return result.slice(data.length);
}

// Encode data as bytes
function encodeData(text: string): number[] {
    const bytes: number[] = [];
    
    // Byte mode indicator (0100)
    bytes.push(0x40);
    
    // Character count
    const textBytes = new TextEncoder().encode(text);
    bytes.push(textBytes.length);
    
    // Data
    for (const b of textBytes) {
        bytes.push(b);
    }
    
    return bytes;
}

// Create QR code matrix
export function generateQRCode(text: string, size: number = 25): boolean[][] {
    // Initialize matrix
    const matrix: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));
    const reserved: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));
    
    // Place finder patterns
    placeFinder(matrix, reserved, 0, 0);
    placeFinder(matrix, reserved, size - 7, 0);
    placeFinder(matrix, reserved, 0, size - 7);
    
    // Place timing patterns
    for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = i % 2 === 0;
        matrix[i][6] = i % 2 === 0;
        reserved[6][i] = true;
        reserved[i][6] = true;
    }
    
    // Place alignment pattern (for version 2+)
    if (size >= 25) {
        placeAlignment(matrix, reserved, size - 9, size - 9);
    }
    
    // Reserve format info areas
    for (let i = 0; i < 9; i++) {
        reserved[8][i] = true;
        reserved[i][8] = true;
    }
    for (let i = size - 8; i < size; i++) {
        reserved[8][i] = true;
        reserved[i][8] = true;
    }
    
    // Dark module
    matrix[size - 8][8] = true;
    reserved[size - 8][8] = true;
    
    // Encode data
    const dataBytes = encodeData(text);
    
    // Pad data
    const dataCapacity = getDataCapacity(size);
    while (dataBytes.length < dataCapacity) {
        dataBytes.push(0xEC);
        if (dataBytes.length < dataCapacity) {
            dataBytes.push(0x11);
        }
    }
    
    // Generate error correction
    const ecWords = getECWords(size);
    const ecBytes = rsEncode(dataBytes, ecWords);
    
    // Combine data and EC
    const allBytes = [...dataBytes, ...ecBytes];
    
    // Convert to bits
    const bits: boolean[] = [];
    for (const byte of allBytes) {
        for (let i = 7; i >= 0; i--) {
            bits.push((byte & (1 << i)) !== 0);
        }
    }
    
    // Place data bits
    placeDataBits(matrix, reserved, bits, size);
    
    // Apply mask (using pattern 0 for simplicity)
    applyMask(matrix, reserved, size, 0);
    
    // Place format info
    placeFormatInfo(matrix, size, 0);
    
    return matrix;
}

function placeFinder(matrix: boolean[][], reserved: boolean[][], row: number, col: number) {
    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
            if (row + r < matrix.length && col + c < matrix.length) {
                matrix[row + r][col + c] = PATTERNS.FINDER[r][c] === 1;
                reserved[row + r][col + c] = true;
            }
        }
    }
    // Separator
    for (let i = -1; i <= 7; i++) {
        const positions = [
            [row - 1, col + i],
            [row + 7, col + i],
            [row + i, col - 1],
            [row + i, col + 7],
        ];
        for (const [r, c] of positions) {
            if (r >= 0 && r < matrix.length && c >= 0 && c < matrix.length) {
                reserved[r][c] = true;
            }
        }
    }
}

function placeAlignment(matrix: boolean[][], reserved: boolean[][], row: number, col: number) {
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            matrix[row + r][col + c] = PATTERNS.ALIGNMENT[r][c] === 1;
            reserved[row + r][col + c] = true;
        }
    }
}

function placeDataBits(matrix: boolean[][], reserved: boolean[][], bits: boolean[], size: number) {
    let bitIndex = 0;
    let upward = true;
    
    for (let col = size - 1; col >= 0; col -= 2) {
        if (col === 6) col = 5; // Skip timing pattern column
        
        const rowStart = upward ? size - 1 : 0;
        const rowEnd = upward ? -1 : size;
        const rowStep = upward ? -1 : 1;
        
        for (let row = rowStart; row !== rowEnd; row += rowStep) {
            for (let c = 0; c < 2; c++) {
                const actualCol = col - c;
                if (!reserved[row][actualCol] && bitIndex < bits.length) {
                    matrix[row][actualCol] = bits[bitIndex++];
                }
            }
        }
        upward = !upward;
    }
}

function applyMask(matrix: boolean[][], reserved: boolean[][], size: number, maskPattern: number) {
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (!reserved[row][col]) {
                let shouldFlip = false;
                switch (maskPattern) {
                    case 0: shouldFlip = (row + col) % 2 === 0; break;
                    case 1: shouldFlip = row % 2 === 0; break;
                    case 2: shouldFlip = col % 3 === 0; break;
                    case 3: shouldFlip = (row + col) % 3 === 0; break;
                    case 4: shouldFlip = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0; break;
                    case 5: shouldFlip = (row * col) % 2 + (row * col) % 3 === 0; break;
                    case 6: shouldFlip = ((row * col) % 2 + (row * col) % 3) % 2 === 0; break;
                    case 7: shouldFlip = ((row + col) % 2 + (row * col) % 3) % 2 === 0; break;
                }
                if (shouldFlip) {
                    matrix[row][col] = !matrix[row][col];
                }
            }
        }
    }
}

function placeFormatInfo(matrix: boolean[][], size: number, maskPattern: number) {
    // Format info for EC level M and mask pattern
    const formatInfo = getFormatInfo(EC_LEVELS.M, maskPattern);
    
    // Place around top-left finder
    for (let i = 0; i < 6; i++) {
        matrix[8][i] = formatInfo[i];
        matrix[i][8] = formatInfo[14 - i];
    }
    matrix[8][7] = formatInfo[6];
    matrix[8][8] = formatInfo[7];
    matrix[7][8] = formatInfo[8];
    
    // Place around other finders
    for (let i = 0; i < 8; i++) {
        matrix[8][size - 1 - i] = formatInfo[i];
        matrix[size - 1 - i][8] = formatInfo[14 - i];
    }
}

function getFormatInfo(ecLevel: number, maskPattern: number): boolean[] {
    // Pre-computed format info bits for common combinations
    const formatBits = [
        [true, false, true, false, true, false, false, false, false, false, true, false, false, true, false],
        [true, false, true, true, false, true, true, false, false, true, true, true, false, true, true],
        [true, false, true, true, true, false, false, true, true, true, false, false, true, false, false],
        [true, false, false, false, true, true, true, false, true, false, false, true, true, true, true],
    ];
    return formatBits[maskPattern % 4] || formatBits[0];
}

function getDataCapacity(size: number): number {
    // Approximate data capacity for different sizes (M level EC)
    if (size <= 21) return 16;   // Version 1
    if (size <= 25) return 34;   // Version 2
    if (size <= 29) return 55;   // Version 3
    if (size <= 33) return 80;   // Version 4
    if (size <= 37) return 108;  // Version 5
    if (size <= 41) return 136;  // Version 6
    if (size <= 45) return 156;  // Version 7
    return 192;                   // Version 8+
}

function getECWords(size: number): number {
    // Error correction words for M level
    if (size <= 21) return 10;
    if (size <= 25) return 16;
    if (size <= 29) return 22;
    if (size <= 33) return 28;
    if (size <= 37) return 34;
    if (size <= 41) return 44;
    if (size <= 45) return 52;
    return 60;
}

/**
 * Calculate the required QR code size for given data length
 */
function getRequiredSize(dataLength: number): number {
    // Add overhead: mode indicator (1 byte) + count (1-2 bytes)
    const totalLength = dataLength + 2;
    
    if (totalLength <= 16) return 21;   // Version 1
    if (totalLength <= 34) return 25;   // Version 2
    if (totalLength <= 55) return 29;   // Version 3
    if (totalLength <= 80) return 33;   // Version 4
    if (totalLength <= 108) return 37;  // Version 5
    if (totalLength <= 136) return 41;  // Version 6
    if (totalLength <= 156) return 45;  // Version 7
    return 49;                           // Version 8
}

/**
 * Generate QR code as SVG string
 */
export function generateQRCodeSVG(text: string, size: number = 200, moduleSize?: number): string {
    // Calculate required QR size based on data length
    const textBytes = new TextEncoder().encode(text);
    const requiredQRSize = getRequiredSize(textBytes.length);
    
    const matrix = generateQRCode(text, requiredQRSize);
    const qrSize = matrix.length;
    const cellSize = moduleSize || Math.floor(size / qrSize);
    const actualSize = cellSize * qrSize;
    
    let paths = '';
    for (let row = 0; row < qrSize; row++) {
        for (let col = 0; col < qrSize; col++) {
            if (matrix[row][col]) {
                paths += `M${col * cellSize},${row * cellSize}h${cellSize}v${cellSize}h-${cellSize}z`;
            }
        }
    }
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${actualSize} ${actualSize}" width="${size}" height="${size}">
        <rect width="100%" height="100%" fill="white"/>
        <path d="${paths}" fill="black"/>
    </svg>`;
}

/**
 * Generate QR code as data URL
 */
export function generateQRCodeDataURL(text: string, size: number = 200): string {
    const svg = generateQRCodeSVG(text, size);
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

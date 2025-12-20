/**
 * Network Audit Script
 * 
 * Scans source files for any network-related code to ensure
 * the application remains strictly offline-first.
 * 
 * Run with: npx ts-node scripts/audit-network.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const SOURCE_DIRS = [
    'src',
    'extension',
];

const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

const NETWORK_PATTERNS = [
    // Fetch and HTTP
    /\bfetch\s*\(/g,
    /\baxios\b/g,
    /\bXMLHttpRequest\b/g,
    /\brequire\s*\(\s*['"]https?['"]\s*\)/g,
    /\bimport\s+.*\s+from\s+['"]https?:\/\//g,

    // URLs and domains
    /https?:\/\/(?!localhost)[^\s'"]+/g,
    /\.com\b/g,
    /\.io\b/g,
    /\.net\b/g,
    /\.org\b/g,

    // Analytics and telemetry
    /\banalytics\b/gi,
    /\btelemetry\b/gi,
    /\btracking\b/gi,
    /\bsentry\b/gi,
    /\bdatadog\b/gi,
    /\bnewrelic\b/gi,
    /\bmixpanel\b/gi,
    /\bsegment\b/gi,
    /\bgoogle[\s-_]?analytics\b/gi,
    /\bhotjar\b/gi,
    /\bfullstory\b/gi,

    // Remote resources
    /\bcdn\b/gi,
    /\bapi\b/gi,
    /\bwebhook\b/gi,

    // WebSocket (allowed for local, flag external)
    /wss?:\/\/(?!localhost|127\.0\.0\.1)/g,
];

// Allowed patterns (whitelist)
const ALLOWED_PATTERNS = [
    // Local development only
    /localhost/,
    /127\.0\.0\.1/,
    /0\.0\.0\.0/,

    // Local protocols
    /ws:\/\/localhost/,
    /http:\/\/localhost/,

    // File URLs
    /file:\/\//,

    // Favicons (content script only)
    /google\.com\/s2\/favicons/,

    // Comments and documentation
    /\/\/.*$/,
    /\/\*[\s\S]*?\*\//,
];

// ============================================================================
// Types
// ============================================================================

interface Finding {
    file: string;
    line: number;
    column: number;
    match: string;
    pattern: string;
    severity: 'high' | 'medium' | 'low';
}

// ============================================================================
// Scanner
// ============================================================================

function getAllFiles(dir: string, extensions: string[]): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) {
        return files;
    }

    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
            // Skip node_modules and dist
            if (item.name === 'node_modules' || item.name === 'dist' || item.name === '.git') {
                continue;
            }
            files.push(...getAllFiles(fullPath, extensions));
        } else if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (extensions.includes(ext)) {
                files.push(fullPath);
            }
        }
    }

    return files;
}

function isAllowed(match: string, line: string): boolean {
    // Check if match is in an allowed context
    for (const pattern of ALLOWED_PATTERNS) {
        if (pattern.test(match) || pattern.test(line)) {
            return true;
        }
    }
    return false;
}

function scanFile(filePath: string): Finding[] {
    const findings: Finding[] = [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        for (const pattern of NETWORK_PATTERNS) {
            // Reset regex state
            pattern.lastIndex = 0;

            let match;
            while ((match = pattern.exec(line)) !== null) {
                // Check if this match is allowed
                if (isAllowed(match[0], line)) {
                    continue;
                }

                // Determine severity
                let severity: 'high' | 'medium' | 'low' = 'low';

                if (/analytics|telemetry|tracking|sentry/i.test(match[0])) {
                    severity = 'high';
                } else if (/https?:\/\//.test(match[0])) {
                    severity = 'high';
                } else if (/fetch|axios|XMLHttpRequest/.test(match[0])) {
                    severity = 'medium';
                }

                findings.push({
                    file: filePath,
                    line: lineNum + 1,
                    column: match.index + 1,
                    match: match[0],
                    pattern: pattern.source,
                    severity,
                });
            }
        }
    }

    return findings;
}

// ============================================================================
// Main
// ============================================================================

function main() {
    console.log('🔍 Vault Network Audit\n');
    console.log('Scanning for network calls, external URLs, and telemetry...\n');

    const allFindings: Finding[] = [];
    let filesScanned = 0;

    for (const dir of SOURCE_DIRS) {
        const files = getAllFiles(dir, FILE_EXTENSIONS);

        for (const file of files) {
            const findings = scanFile(file);
            allFindings.push(...findings);
            filesScanned++;
        }
    }

    // Sort by severity
    const sortOrder = { high: 0, medium: 1, low: 2 };
    allFindings.sort((a, b) => sortOrder[a.severity] - sortOrder[b.severity]);

    // Report
    console.log(`Files scanned: ${filesScanned}\n`);

    if (allFindings.length === 0) {
        console.log('✅ No network-related code found!\n');
        console.log('The codebase appears to be offline-first compliant.');
        process.exit(0);
    }

    console.log(`⚠️  Found ${allFindings.length} potential issues:\n`);

    const highCount = allFindings.filter(f => f.severity === 'high').length;
    const mediumCount = allFindings.filter(f => f.severity === 'medium').length;
    const lowCount = allFindings.filter(f => f.severity === 'low').length;

    console.log(`   🔴 High:   ${highCount}`);
    console.log(`   🟡 Medium: ${mediumCount}`);
    console.log(`   🟢 Low:    ${lowCount}\n`);

    // Group by file
    const byFile = new Map<string, Finding[]>();
    for (const finding of allFindings) {
        const existing = byFile.get(finding.file) || [];
        existing.push(finding);
        byFile.set(finding.file, existing);
    }

    for (const [file, findings] of byFile) {
        console.log(`\n📄 ${file}`);

        for (const finding of findings) {
            const icon = finding.severity === 'high' ? '🔴' :
                finding.severity === 'medium' ? '🟡' : '🟢';
            console.log(`   ${icon} Line ${finding.line}: "${finding.match}"`);
        }
    }

    console.log('\n─────────────────────────────────────────────────');
    console.log('\nPlease review each finding to ensure no unintended');
    console.log('network calls are present in the codebase.\n');

    // Exit with error if high severity findings
    if (highCount > 0) {
        console.log('❌ Audit FAILED: High severity issues found.\n');
        process.exit(1);
    }

    console.log('⚠️  Audit completed with warnings.\n');
    process.exit(0);
}

main();

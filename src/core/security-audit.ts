/**
 * Security Audit Module
 * 
 * Analyzes vault for security issues:
 * - Duplicate passwords
 * - Weak passwords
 * - Reused passwords
 * - Old passwords
 */

import { calculatePasswordStrength } from './password-strength';

export interface SecurityIssue {
    type: 'duplicate' | 'weak' | 'reused' | 'old';
    severity: 'low' | 'medium' | 'high' | 'critical';
    entryId: string;
    entryTitle: string;
    message: string;
    recommendation?: string;
}

export interface SecurityAuditResult {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    issues: SecurityIssue[];
    securityScore: number; // 0-100
}

export interface EntryForAudit {
    id: string;
    title: string;
    password: string;
    createdAt: number;
    modifiedAt: number;
    lastUsedAt: number | null;
}

/**
 * Perform security audit on entries
 */
export function performSecurityAudit(entries: EntryForAudit[]): SecurityAuditResult {
    const issues: SecurityIssue[] = [];
    
    // Track password usage
    const passwordMap = new Map<string, Array<{ id: string; title: string }>>();
    
    // Current timestamp
    const now = Date.now();
    const sixMonthsAgo = now - (6 * 30 * 24 * 60 * 60 * 1000);
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);

    entries.forEach(entry => {
        // Check for weak passwords
        const strength = calculatePasswordStrength(entry.password);
        if (strength.level === 'very-weak' || strength.level === 'weak') {
            issues.push({
                type: 'weak',
                severity: strength.level === 'very-weak' ? 'critical' : 'high',
                entryId: entry.id,
                entryTitle: entry.title,
                message: `Weak password (${strength.level})`,
                recommendation: 'Generate a stronger password using the password generator',
            });
        }

        // Track password usage for duplicate/reused detection
        if (!passwordMap.has(entry.password)) {
            passwordMap.set(entry.password, []);
        }
        passwordMap.get(entry.password)!.push({ id: entry.id, title: entry.title });

        // Check for old passwords (not modified in 6+ months)
        if (entry.modifiedAt < sixMonthsAgo) {
            issues.push({
                type: 'old',
                severity: entry.modifiedAt < oneYearAgo ? 'medium' : 'low',
                entryId: entry.id,
                entryTitle: entry.title,
                message: `Password hasn't been changed in ${Math.floor((now - entry.modifiedAt) / (30 * 24 * 60 * 60 * 1000))} months`,
                recommendation: 'Consider updating this password regularly',
            });
        }
    });

    // Find duplicate and reused passwords
    passwordMap.forEach((entries, password) => {
        if (entries.length > 1) {
            // Multiple entries using the same password
            entries.forEach(entry => {
                issues.push({
                    type: entries.length === 2 ? 'reused' : 'duplicate',
                    severity: entries.length > 3 ? 'critical' : entries.length > 2 ? 'high' : 'medium',
                    entryId: entry.id,
                    entryTitle: entry.title,
                    message: `Password is ${entries.length === 2 ? 'reused' : 'duplicated'} across ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`,
                    recommendation: 'Use unique passwords for each account',
                });
            });
        }
    });

    // Count by severity
    const critical = issues.filter(i => i.severity === 'critical').length;
    const high = issues.filter(i => i.severity === 'high').length;
    const medium = issues.filter(i => i.severity === 'medium').length;
    const low = issues.filter(i => i.severity === 'low').length;

    // Calculate security score (100 - penalty points)
    let penalty = 0;
    issues.forEach(issue => {
        switch (issue.severity) {
            case 'critical': penalty += 5; break;
            case 'high': penalty += 3; break;
            case 'medium': penalty += 2; break;
            case 'low': penalty += 1; break;
        }
    });

    const securityScore = Math.max(0, Math.min(100, 100 - penalty));

    return {
        totalIssues: issues.length,
        critical,
        high,
        medium,
        low,
        issues,
        securityScore,
    };
}

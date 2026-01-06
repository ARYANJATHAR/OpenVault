/**
 * Security Audit Service
 * Analyzes vault for security issues:
 * - Duplicate passwords
 * - Weak passwords
 * - Reused passwords
 * - Old passwords
 */

import { calculatePasswordStrength } from './passwordService';
import { VaultEntry } from './vaultService';

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

/**
 * Perform security audit on entries
 */
export function performSecurityAudit(entries: VaultEntry[]): SecurityAuditResult {
  const issues: SecurityIssue[] = [];

  // Track password usage
  const passwordMap = new Map<string, Array<{ id: string; title: string }>>();

  // Current timestamp
  const now = Date.now();
  const sixMonthsAgo = now - 6 * 30 * 24 * 60 * 60 * 1000;
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

  entries.forEach((entry) => {
    // Check for weak passwords
    const strength = calculatePasswordStrength(entry.password);
    if (strength.level === 'very-weak' || strength.level === 'weak') {
      issues.push({
        type: 'weak',
        severity: strength.level === 'very-weak' ? 'critical' : 'high',
        entryId: entry.id,
        entryTitle: entry.title,
        message: `Weak password (${strength.level.replace('-', ' ')})`,
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
      const monthsOld = Math.floor((now - entry.modifiedAt) / (30 * 24 * 60 * 60 * 1000));
      issues.push({
        type: 'old',
        severity: entry.modifiedAt < oneYearAgo ? 'medium' : 'low',
        entryId: entry.id,
        entryTitle: entry.title,
        message: `Password hasn't been changed in ${monthsOld} months`,
        recommendation: 'Consider updating this password regularly',
      });
    }
  });

  // Find duplicate and reused passwords
  passwordMap.forEach((entriesWithPassword) => {
    if (entriesWithPassword.length > 1) {
      // Multiple entries using the same password
      entriesWithPassword.forEach((entry) => {
        issues.push({
          type: entriesWithPassword.length === 2 ? 'reused' : 'duplicate',
          severity:
            entriesWithPassword.length > 3
              ? 'critical'
              : entriesWithPassword.length > 2
                ? 'high'
                : 'medium',
          entryId: entry.id,
          entryTitle: entry.title,
          message: `Password is ${entriesWithPassword.length === 2 ? 'reused' : 'duplicated'} across ${entriesWithPassword.length} entries`,
          recommendation: 'Use unique passwords for each account',
        });
      });
    }
  });

  // Count by severity
  const critical = issues.filter((i) => i.severity === 'critical').length;
  const high = issues.filter((i) => i.severity === 'high').length;
  const medium = issues.filter((i) => i.severity === 'medium').length;
  const low = issues.filter((i) => i.severity === 'low').length;

  // Calculate security score (100 - penalty points)
  let penalty = 0;
  issues.forEach((issue) => {
    switch (issue.severity) {
      case 'critical':
        penalty += 5;
        break;
      case 'high':
        penalty += 3;
        break;
      case 'medium':
        penalty += 2;
        break;
      case 'low':
        penalty += 1;
        break;
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

/**
 * Get color for severity level
 */
export function getSeverityColor(severity: SecurityIssue['severity']): string {
  switch (severity) {
    case 'critical':
      return '#e74c3c';
    case 'high':
      return '#f39c12';
    case 'medium':
      return '#f1c40f';
    case 'low':
      return '#3498db';
    default:
      return '#95a5a6';
  }
}

/**
 * Get color for security score
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return '#2ecc71';
  if (score >= 60) return '#3498db';
  if (score >= 40) return '#f1c40f';
  if (score >= 20) return '#f39c12';
  return '#e74c3c';
}

/**
 * Password Service
 * Password generation and strength checking
 */

import * as Crypto from 'expo-crypto';

export interface PasswordStrength {
  score: number;
  level: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
  feedback: string[];
  color: string;
}

export interface PasswordOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}

const STRENGTH_COLORS = {
  'very-weak': '#e74c3c',
  weak: '#e67e22',
  fair: '#f39c12',
  good: '#27ae60',
  strong: '#2ecc71',
};

/**
 * Generate random password using secure random
 */
export async function generatePassword(options: PasswordOptions = {}): Promise<string> {
  const {
    length = 16,
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
  } = options;

  let charset = '';
  if (uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (numbers) charset += '0123456789';
  if (symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (!charset) charset = 'abcdefghijklmnopqrstuvwxyz';

  // Use expo-crypto for secure random generation
  const randomBytes = await Crypto.getRandomBytesAsync(length);
  
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}

/**
 * Calculate password strength
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  const feedback: string[] = [];

  if (password.length === 0) {
    return {
      score: 0,
      level: 'very-weak',
      feedback: ['Enter a password'],
      color: STRENGTH_COLORS['very-weak'],
    };
  }

  // Length scoring
  if (password.length >= 8) score += 15;
  else feedback.push('Use at least 8 characters');
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  if (password.length >= 20) score += 5;

  // Character variety
  if (/[a-z]/.test(password)) score += 10;
  else feedback.push('Add lowercase letters');
  
  if (/[A-Z]/.test(password)) score += 10;
  else feedback.push('Add uppercase letters');
  
  if (/[0-9]/.test(password)) score += 10;
  else feedback.push('Add numbers');
  
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  else feedback.push('Add special characters');

  // Uniqueness bonus
  const uniqueChars = new Set(password.split('')).size;
  if (uniqueChars >= password.length * 0.7) score += 10;

  // Penalties
  if (/(.)\1{2,}/.test(password)) {
    score -= 15;
    feedback.push('Avoid repeated characters');
  }
  if (/123|abc|qwe|password/i.test(password)) {
    score -= 20;
    feedback.push('Avoid common patterns');
  }

  // Common passwords penalty
  const commonPasswords = [
    'password', '12345678', 'qwerty', 'letmein', 'admin',
    'welcome', 'monkey', 'dragon', 'master', 'login',
  ];
  if (commonPasswords.some((c) => password.toLowerCase().includes(c))) {
    score -= 30;
    feedback.push('Avoid common passwords');
  }

  score = Math.max(0, Math.min(100, score));

  let level: PasswordStrength['level'];
  if (score < 20) level = 'very-weak';
  else if (score < 40) level = 'weak';
  else if (score < 60) level = 'fair';
  else if (score < 80) level = 'good';
  else level = 'strong';

  if (feedback.length === 0) {
    if (level === 'strong') feedback.push('Excellent password!');
    else if (level === 'good') feedback.push('Good password');
  }

  return {
    score,
    level,
    feedback,
    color: STRENGTH_COLORS[level],
  };
}

/**
 * Copy to clipboard with haptic feedback (uses Expo Clipboard)
 */
export function getPasswordMask(length: number): string {
  return '•'.repeat(Math.min(length, 20));
}

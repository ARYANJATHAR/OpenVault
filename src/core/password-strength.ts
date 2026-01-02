/**
 * Password Strength Calculator
 * 
 * Calculates password strength and provides feedback
 */

export interface PasswordStrength {
    score: number; // 0-100
    level: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
    feedback: string[];
}

const COMMON_PASSWORDS = [
    'password', '123456', '12345678', '123456789', '1234567890',
    'qwerty', 'abc123', 'password1', 'welcome', 'monkey',
    'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou',
    'master', 'sunshine', 'ashley', 'bailey', 'passw0rd',
    'shadow', '123123', '654321', 'superman', 'qazwsx',
    'michael', 'football', 'welcome', 'jesus', 'ninja',
    'mustang', 'password123', 'admin', '1234', 'root',
];

/**
 * Calculate password strength
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
    if (!password) {
        return {
            score: 0,
            level: 'very-weak',
            feedback: ['Enter a password'],
        };
    }

    let score = 0;
    const feedback: string[] = [];

    // Length checks
    if (password.length < 8) {
        feedback.push('Use at least 8 characters');
    } else {
        score += 20;
        if (password.length >= 12) {
            score += 10;
        }
        if (password.length >= 16) {
            score += 10;
        }
    }

    // Character variety
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^a-zA-Z0-9]/.test(password);

    let varietyCount = 0;
    if (hasLower) varietyCount++;
    if (hasUpper) varietyCount++;
    if (hasNumber) varietyCount++;
    if (hasSymbol) varietyCount++;

    score += varietyCount * 10;

    if (!hasLower) feedback.push('Add lowercase letters');
    if (!hasUpper) feedback.push('Add uppercase letters');
    if (!hasNumber) feedback.push('Add numbers');
    if (!hasSymbol) feedback.push('Add symbols');

    // Pattern detection
    if (/(.)\1{2,}/.test(password)) {
        score -= 10;
        feedback.push('Avoid repeating characters');
    }

    if (/123|abc|qwe/i.test(password)) {
        score -= 15;
        feedback.push('Avoid common sequences');
    }

    // Common password check
    const lowerPassword = password.toLowerCase();
    if (COMMON_PASSWORDS.some(common => lowerPassword.includes(common))) {
        score -= 30;
        feedback.push('Avoid common passwords');
    }

    // Entropy bonus
    const uniqueChars = new Set(password).size;
    if (uniqueChars / password.length > 0.7) {
        score += 10;
    }

    // Ensure score is between 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine level
    let level: PasswordStrength['level'];
    if (score < 20) level = 'very-weak';
    else if (score < 40) level = 'weak';
    else if (score < 60) level = 'fair';
    else if (score < 80) level = 'good';
    else level = 'strong';

    // Positive feedback for strong passwords
    if (score >= 80 && feedback.length === 0) {
        feedback.push('Excellent password!');
    }

    return { score, level, feedback };
}

/**
 * Get color for password strength
 */
export function getStrengthColor(level: PasswordStrength['level']): string {
    switch (level) {
        case 'very-weak': return '#e74c3c'; // Red
        case 'weak': return '#f39c12'; // Orange
        case 'fair': return '#f1c40f'; // Yellow
        case 'good': return '#3498db'; // Blue
        case 'strong': return '#2ecc71'; // Green
        default: return '#95a5a6';
    }
}

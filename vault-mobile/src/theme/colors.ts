/**
 * Vault Mobile - Color Theme
 * Matches desktop app: Minimalist Carbon & Emerald
 */

export const colors = {
  // Dark Mode (Default)
  dark: {
    bgBase: '#0a0a0a',
    bgSurface: '#141414',
    bgElevated: '#1e1e1e',
    bgGhost: 'rgba(255, 255, 255, 0.05)',
    
    accent: '#2ecc71',
    accentDim: '#27ae60',
    accentGlow: 'rgba(46, 204, 113, 0.15)',
    
    textPrimary: '#ffffff',
    textSecondary: '#a0a0a0',
    textMuted: '#505050',
    
    border: '#262626',
    borderBright: '#404040',
    
    success: '#2ecc71',
    error: '#e74c3c',
    warning: '#f39c12',
    info: '#3498db',
  },
  
  // Light Mode
  light: {
    bgBase: '#ffffff',
    bgSurface: '#f8f9fa',
    bgElevated: '#f0f0f0',
    bgGhost: 'rgba(0, 0, 0, 0.05)',
    
    accent: '#2ecc71',
    accentDim: '#27ae60',
    accentGlow: 'rgba(46, 204, 113, 0.1)',
    
    textPrimary: '#1a1a2e',
    textSecondary: '#4a4a6a',
    textMuted: '#8a8a9a',
    
    border: '#e0e0e0',
    borderBright: '#d0d0d0',
    
    success: '#2ecc71',
    error: '#e74c3c',
    warning: '#f39c12',
    info: '#3498db',
  },
};

export type Theme = 'light' | 'dark';
export type ColorScheme = typeof colors.dark;

export const getColors = (theme: Theme = 'dark'): ColorScheme => {
  return colors[theme];
};

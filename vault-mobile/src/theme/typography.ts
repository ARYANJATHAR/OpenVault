/**
 * Typography - Inter Font Family
 * Matches desktop app styling
 */

export const typography = {
  fontFamily: {
    regular: 'Inter_400Regular',
    light: 'Inter_300Light',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  
  fontSize: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 36,
  },
  
  fontWeight: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
  },
  
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 1,
  },
  
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.8,
  },
};

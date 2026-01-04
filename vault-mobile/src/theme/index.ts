/**
 * Theme Configuration
 */

import { colors, getColors, Theme, ColorScheme } from './colors';
import { typography } from './typography';

export { colors, getColors, typography };
export type { Theme, ColorScheme };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

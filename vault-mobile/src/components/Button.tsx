/**
 * Custom Button Component
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
  fullWidth = false,
}: ButtonProps) {
  const { colors } = useTheme();

  const handlePress = async () => {
    if (!disabled && !loading) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const getBackgroundColor = () => {
    if (disabled) return colors.bgSurface;
    switch (variant) {
      case 'primary':
        return colors.accent;
      case 'secondary':
        return colors.bgSurface;
      case 'danger':
        return colors.error;
      case 'ghost':
        return 'transparent';
      default:
        return colors.accent;
    }
  };

  const getTextColor = () => {
    if (disabled) return colors.textMuted;
    switch (variant) {
      case 'primary':
        return '#000000';
      case 'secondary':
        return colors.textPrimary;
      case 'danger':
        return '#ffffff';
      case 'ghost':
        return colors.textSecondary;
      default:
        return '#000000';
    }
  };

  const getBorderColor = () => {
    switch (variant) {
      case 'secondary':
        return colors.border;
      case 'ghost':
        return 'transparent';
      default:
        return 'transparent';
    }
  };

  const getPadding = () => {
    switch (size) {
      case 'sm':
        return { paddingVertical: 8, paddingHorizontal: 12 };
      case 'lg':
        return { paddingVertical: 16, paddingHorizontal: 24 };
      default:
        return { paddingVertical: 12, paddingHorizontal: 20 };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm':
        return typography.fontSize.sm;
      case 'lg':
        return typography.fontSize.md;
      default:
        return typography.fontSize.base;
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        getPadding(),
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: variant === 'secondary' ? 1 : 0,
          opacity: disabled ? 0.6 : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.text,
              {
                color: getTextColor(),
                fontSize: getFontSize(),
                marginLeft: icon ? 8 : 0,
              },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  fullWidth: {
    width: '100%',
  },
  text: {
    fontWeight: '600',
  },
});

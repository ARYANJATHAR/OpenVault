/**
 * Custom Input Component
 */

import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  rightIcon?: React.ReactNode;
  isPassword?: boolean;
}

export function Input({
  label,
  error,
  rightIcon,
  isPassword = false,
  style,
  ...props
}: InputProps) {
  const { colors } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      )}
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.bgSurface,
            borderColor: error
              ? colors.error
              : isFocused
              ? colors.accent
              : colors.border,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            { color: colors.textPrimary },
            style,
          ]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword && !showPassword}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}
        {rightIcon && <View style={styles.iconButton}>{rightIcon}</View>}
      </View>
      {error && (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: typography.fontSize.base,
  },
  iconButton: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  error: {
    fontSize: typography.fontSize.sm,
    marginTop: 6,
  },
});

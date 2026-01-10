/**
 * Unlock Screen (Index)
 * First screen - create or unlock vault
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../src/context/ThemeContext';
import { useVault } from '../src/context/VaultContext';
import { Input } from '../src/components/Input';
import { Button } from '../src/components/Button';
import { typography } from '../src/theme';

export default function UnlockScreen() {
  const { colors } = useTheme();
  const { vaultExists, isUnlocked, isLoading, unlock, create } = useVault();

  const [isCreateMode, setIsCreateMode] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Animation values
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(30))[0];

  useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!isLoading && isUnlocked) {
      router.replace('/vault');
    }
  }, [isUnlocked, isLoading]);

  useEffect(() => {
    if (!isLoading && !vaultExists) {
      setIsCreateMode(true);
    }
  }, [vaultExists, isLoading]);

  const handleSubmit = async () => {
    setError('');

    if (isCreateMode) {
      // Validate for creation
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      setSubmitting(true);
      try {
        await create(password);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/vault');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create vault';
        setError(message);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setSubmitting(false);
      }
    } else {
      // Unlock existing vault
      setSubmitting(true);
      try {
        const success = await unlock(password);
        if (success) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace('/vault');
        } else {
          setError('Invalid master password');
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to unlock vault';
        setError(message);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const toggleMode = () => {
    setIsCreateMode(!isCreateMode);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgBase }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="shield-checkmark" size={48} color={colors.accent} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bgBase }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Background gradient accent */}
      <LinearGradient
        colors={[colors.accentGlow, 'transparent']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
      />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Logo */}
        <View style={[styles.logoContainer, { borderColor: colors.accent }]}>
          <Ionicons name="shield-checkmark" size={40} color={colors.accent} />
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {isCreateMode ? 'Create Your Vault' : 'Welcome Back'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {isCreateMode
            ? 'Set a strong master password'
            : 'Enter your master password to unlock'}
        </Text>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label="Master Password"
            placeholder="Enter your master password"
            value={password}
            onChangeText={setPassword}
            isPassword
            autoFocus
            onSubmitEditing={isCreateMode ? undefined : handleSubmit}
          />

          {isCreateMode && (
            <Input
              label="Confirm Password"
              placeholder="Confirm your master password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              isPassword
              onSubmitEditing={handleSubmit}
            />
          )}

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>
                {error}
              </Text>
            </View>
          ) : null}

          <Button
            title={isCreateMode ? 'Create Vault' : 'Unlock'}
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
            style={styles.submitButton}
          />

          <Button
            title={isCreateMode ? 'Already have a vault?' : "Don't have a vault?"}
            onPress={toggleMode}
            variant="ghost"
            fullWidth
          />
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '300',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '300',
    marginBottom: 40,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 340,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
  },
  submitButton: {
    marginBottom: 12,
  },
});

/**
 * Add Entry Screen
 * Create a new password entry
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../src/context/ThemeContext';
import { useVault } from '../src/context/VaultContext';
import { Input } from '../src/components/Input';
import { Button } from '../src/components/Button';
import { generatePassword, calculatePasswordStrength } from '../src/services/passwordService';
import { typography } from '../src/theme';

export default function AddEntryScreen() {
  const { colors } = useTheme();
  const { addEntry } = useVault();

  const [formData, setFormData] = useState({
    title: '',
    username: '',
    password: '',
    url: '',
    notes: '',
    totpSecret: '',
  });
  const [isFavorite, setIsFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const passwordStrength = calculatePasswordStrength(formData.password);

  const handleGeneratePassword = async () => {
    setGenerating(true);
    try {
      const newPassword = await generatePassword({
        length: 20,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      });
      setFormData({ ...formData, password: newPassword });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error('Failed to generate password:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Service name is required');
      return;
    }
    if (!formData.username.trim()) {
      Alert.alert('Error', 'Username is required');
      return;
    }
    if (!formData.password.trim()) {
      Alert.alert('Error', 'Password is required');
      return;
    }

    setSaving(true);
    try {
      await addEntry({
        title: formData.title.trim(),
        username: formData.username.trim(),
        password: formData.password,
        url: formData.url.trim() || null,
        notes: formData.notes.trim() || null,
        totpSecret: formData.totpSecret.trim() || null,
        folderId: null,
        lastUsedAt: null,
        isFavorite,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save entry';
      Alert.alert('Error', message);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgBase }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          New Entry
        </Text>
        <TouchableOpacity
          onPress={() => setIsFavorite(!isFavorite)}
          style={styles.favoriteButton}
        >
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={22}
            color={isFavorite ? colors.warning : colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Input
          label="Service *"
          value={formData.title}
          onChangeText={(text) => setFormData({ ...formData, title: text })}
          placeholder="e.g., Google, GitHub, Netflix"
          autoFocus
        />

        <Input
          label="Username / Email *"
          value={formData.username}
          onChangeText={(text) => setFormData({ ...formData, username: text })}
          placeholder="your@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <View style={styles.passwordSection}>
          <Input
            label="Password *"
            value={formData.password}
            onChangeText={(text) => setFormData({ ...formData, password: text })}
            placeholder="Enter or generate password"
            isPassword
          />

          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
            onPress={handleGeneratePassword}
            disabled={generating}
          >
            <Ionicons name="dice-outline" size={18} color={colors.accent} />
            <Text style={[styles.generateButtonText, { color: colors.accent }]}>
              {generating ? 'Generating...' : 'Generate'}
            </Text>
          </TouchableOpacity>

          {formData.password && (
            <View style={styles.strengthContainer}>
              <View style={styles.strengthBar}>
                <View
                  style={[
                    styles.strengthFill,
                    {
                      width: `${passwordStrength.score}%`,
                      backgroundColor: passwordStrength.color,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.strengthText, { color: passwordStrength.color }]}>
                {passwordStrength.level.charAt(0).toUpperCase() + passwordStrength.level.slice(1).replace('-', ' ')}
              </Text>
            </View>
          )}
        </View>

        <Input
          label="Website (optional)"
          value={formData.url}
          onChangeText={(text) => setFormData({ ...formData, url: text })}
          placeholder="https://example.com"
          autoCapitalize="none"
          keyboardType="url"
        />

        <Input
          label="2FA Secret (optional)"
          value={formData.totpSecret}
          onChangeText={(text) => setFormData({ ...formData, totpSecret: text })}
          placeholder="Base32 secret or otpauth:// URL"
          autoCapitalize="none"
        />

        <Input
          label="Notes (optional)"
          value={formData.notes}
          onChangeText={(text) => setFormData({ ...formData, notes: text })}
          placeholder="Additional notes..."
          multiline
          numberOfLines={4}
        />

        <View style={styles.buttonContainer}>
          <Button
            title="Save Entry"
            onPress={handleSave}
            loading={saving}
            fullWidth
            style={styles.saveButton}
          />
          <Button
            title="Cancel"
            onPress={() => router.back()}
            variant="secondary"
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '300',
  },
  favoriteButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  passwordSection: {
    marginBottom: 0,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: -8,
    marginBottom: 16,
  },
  generateButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: -8,
    marginBottom: 16,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500',
    minWidth: 70,
    textAlign: 'right',
  },
  buttonContainer: {
    marginTop: 24,
    gap: 12,
  },
  saveButton: {
    marginBottom: 0,
  },
});

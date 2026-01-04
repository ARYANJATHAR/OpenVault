/**
 * Entry Detail Screen
 * Shows entry details and allows editing
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../src/context/ThemeContext';
import { useVault } from '../../src/context/VaultContext';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { vaultService, VaultEntry } from '../../src/services/vaultService';
import { generateTOTP, getTOTPTimeRemaining, formatTOTPCode } from '../../src/services/totpService';
import { typography } from '../../src/theme';

export default function EntryDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refreshEntries, updateEntry, deleteEntry, toggleFavorite } = useVault();

  const [entry, setEntry] = useState<VaultEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: '',
    username: '',
    password: '',
    url: '',
    notes: '',
    totpSecret: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState<string | null>(null);
  const [totpTimeRemaining, setTotpTimeRemaining] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEntry();
  }, [id]);

  useEffect(() => {
    if (entry?.totpSecret) {
      updateTOTPCode();
      const interval = setInterval(() => {
        updateTOTPCode();
        setTotpTimeRemaining(getTOTPTimeRemaining());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [entry?.totpSecret]);

  const loadEntry = async () => {
    if (!id) return;
    try {
      const loaded = await vaultService.getEntry(id);
      if (loaded) {
        setEntry(loaded);
        setEditData({
          title: loaded.title,
          username: loaded.username,
          password: loaded.password,
          url: loaded.url || '',
          notes: loaded.notes || '',
          totpSecret: loaded.totpSecret || '',
        });
      }
    } catch (error) {
      console.error('Failed to load entry:', error);
    }
  };

  const updateTOTPCode = () => {
    if (entry?.totpSecret) {
      try {
        const code = generateTOTP(entry.totpSecret);
        setTotpCode(code);
        setTotpTimeRemaining(getTOTPTimeRemaining());
      } catch (error) {
        console.error('Failed to generate TOTP:', error);
        setTotpCode(null);
      }
    }
  };

  const handleCopy = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  const handleSave = async () => {
    if (!entry) return;

    setSaving(true);
    try {
      await updateEntry(id!, {
        title: editData.title,
        username: editData.username,
        password: editData.password,
        url: editData.url || null,
        notes: editData.notes || null,
        totpSecret: editData.totpSecret || null,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadEntry();
      setIsEditing(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!entry) return;

    Alert.alert('Delete Entry', `Are you sure you want to delete "${entry.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntry(id!);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to delete';
            Alert.alert('Error', message);
          }
        },
      },
    ]);
  };

  const handleToggleFavorite = async () => {
    if (!entry) return;
    await toggleFavorite(id!);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadEntry();
  };

  if (!entry) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgBase }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgBase }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {isEditing ? 'Edit Entry' : 'Entry Details'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Avatar */}
        <View style={[styles.avatar, { borderColor: colors.accent }]}>
          <Text style={[styles.avatarText, { color: colors.accent }]}>
            {entry.title.charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, { borderColor: colors.border }]}
            onPress={handleToggleFavorite}
          >
            <Ionicons
              name={entry.isFavorite ? 'star' : 'star-outline'}
              size={18}
              color={entry.isFavorite ? colors.warning : colors.textSecondary}
            />
            <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>
              {entry.isFavorite ? 'Favorited' : 'Favorite'}
            </Text>
          </TouchableOpacity>

          {!isEditing ? (
            <>
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: colors.border }]}
                onPress={() => setIsEditing(true)}
              >
                <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>
                  Edit
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: colors.error }]}
                onPress={handleDelete}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={[styles.actionButtonText, { color: colors.error }]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Button
                title="Save"
                onPress={handleSave}
                loading={saving}
                size="sm"
              />
              <Button
                title="Cancel"
                onPress={() => {
                  setIsEditing(false);
                  loadEntry();
                }}
                variant="secondary"
                size="sm"
              />
            </>
          )}
        </View>

        {/* Fields */}
        {!isEditing ? (
          <>
            <FieldDisplay
              label="Service"
              value={entry.title}
              onCopy={() => handleCopy(entry.title, 'Service')}
              colors={colors}
            />
            <FieldDisplay
              label="Username"
              value={entry.username}
              onCopy={() => handleCopy(entry.username, 'Username')}
              colors={colors}
            />
            <FieldDisplay
              label="Password"
              value={showPassword ? entry.password : '••••••••••••'}
              onCopy={() => handleCopy(entry.password, 'Password')}
              colors={colors}
              rightAction={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              }
            />

            {entry.totpSecret && totpCode && (
              <View style={[styles.field, { borderBottomColor: colors.border }]}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                  2FA CODE
                </Text>
                <View style={styles.totpContainer}>
                  <Text style={[styles.totpCode, { color: colors.accent }]}>
                    {formatTOTPCode(totpCode)}
                  </Text>
                  <View style={styles.totpTimer}>
                    <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.totpTime, { color: colors.textMuted }]}>
                      {totpTimeRemaining}s
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyButton, { borderColor: colors.border }]}
                    onPress={() => handleCopy(totpCode, '2FA Code')}
                  >
                    <Ionicons name="copy-outline" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {entry.url && (
              <FieldDisplay
                label="Website"
                value={entry.url}
                colors={colors}
              />
            )}

            {entry.notes && (
              <FieldDisplay
                label="Notes"
                value={entry.notes}
                colors={colors}
                multiline
              />
            )}
          </>
        ) : (
          <>
            <Input
              label="Service"
              value={editData.title}
              onChangeText={(text) => setEditData({ ...editData, title: text })}
              placeholder="e.g., Google, GitHub"
            />
            <Input
              label="Username"
              value={editData.username}
              onChangeText={(text) => setEditData({ ...editData, username: text })}
              placeholder="Email or username"
              autoCapitalize="none"
            />
            <Input
              label="Password"
              value={editData.password}
              onChangeText={(text) => setEditData({ ...editData, password: text })}
              isPassword
            />
            <Input
              label="Website (optional)"
              value={editData.url}
              onChangeText={(text) => setEditData({ ...editData, url: text })}
              placeholder="https://example.com"
              autoCapitalize="none"
              keyboardType="url"
            />
            <Input
              label="2FA Secret (optional)"
              value={editData.totpSecret}
              onChangeText={(text) => setEditData({ ...editData, totpSecret: text })}
              placeholder="Base32 secret or otpauth:// URL"
              autoCapitalize="none"
            />
            <Input
              label="Notes (optional)"
              value={editData.notes}
              onChangeText={(text) => setEditData({ ...editData, notes: text })}
              placeholder="Additional notes"
              multiline
              numberOfLines={4}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

interface FieldDisplayProps {
  label: string;
  value: string;
  onCopy?: () => void;
  rightAction?: React.ReactNode;
  multiline?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}

function FieldDisplay({
  label,
  value,
  onCopy,
  rightAction,
  multiline,
  colors,
}: FieldDisplayProps) {
  return (
    <View style={[fieldStyles.container, { borderBottomColor: colors.border }]}>
      <Text style={[fieldStyles.label, { color: colors.textMuted }]}>
        {label.toUpperCase()}
      </Text>
      <View style={fieldStyles.valueRow}>
        <Text
          style={[
            fieldStyles.value,
            { color: colors.textPrimary },
            multiline && fieldStyles.multiline,
          ]}
          numberOfLines={multiline ? undefined : 1}
        >
          {value}
        </Text>
        <View style={fieldStyles.actions}>
          {rightAction}
          {onCopy && (
            <TouchableOpacity
              style={[fieldStyles.copyButton, { borderColor: colors.border }]}
              onPress={onCopy}
            >
              <Ionicons name="copy-outline" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  value: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: '300',
  },
  multiline: {
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copyButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: typography.fontSize.base,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  avatarText: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '300',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
  },
  field: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  fieldLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 8,
  },
  totpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  totpCode: {
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 4,
    fontFamily: 'monospace',
  },
  totpTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  totpTime: {
    fontSize: typography.fontSize.sm,
  },
  copyButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

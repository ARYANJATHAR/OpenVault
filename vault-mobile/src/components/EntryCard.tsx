/**
 * Entry Card Component
 * Displays a password entry in the list
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme';
import { VaultEntry } from '../services/vaultService';

interface EntryCardProps {
  entry: VaultEntry;
  onPress: () => void;
}

export function EntryCard({ entry, onPress }: EntryCardProps) {
  const { colors } = useTheme();

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  // Get first letter for avatar
  const initial = entry.title.charAt(0).toUpperCase();

  // Get domain from URL if available
  const getDomain = () => {
    if (!entry.url) return null;
    try {
      const url = new URL(
        entry.url.startsWith('http') ? entry.url : `https://${entry.url}`
      );
      return url.hostname.replace('www.', '');
    } catch {
      return entry.url;
    }
  };

  const domain = getDomain();

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.bgSurface }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { borderColor: colors.accent }]}>
        <Text style={[styles.avatarText, { color: colors.accent }]}>
          {initial}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {entry.title}
          </Text>
          {entry.isFavorite && (
            <Ionicons name="star" size={14} color={colors.warning} />
          )}
          {entry.totpSecret && (
            <Ionicons name="key-outline" size={14} color={colors.accent} style={{ marginLeft: 4 }} />
          )}
        </View>
        <Text style={[styles.username, { color: colors.textSecondary }]} numberOfLines={1}>
          {entry.username}
        </Text>
        {domain && (
          <Text style={[styles.url, { color: colors.textMuted }]} numberOfLines={1}>
            {domain}
          </Text>
        )}
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: typography.fontSize.lg,
    fontWeight: '300',
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
    flexShrink: 1,
  },
  username: {
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  url: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
});

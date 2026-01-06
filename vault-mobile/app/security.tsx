/**
 * Security Dashboard Screen
 * Shows security audit results and recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../src/context/ThemeContext';
import { useVault } from '../src/context/VaultContext';
import { vaultService } from '../src/services/vaultService';
import { typography } from '../src/theme';
import {
  performSecurityAudit,
  SecurityAuditResult,
  SecurityIssue,
  getSeverityColor,
  getScoreColor,
} from '../src/services/securityService';

export default function SecurityScreen() {
  const { colors } = useTheme();
  const { isUnlocked } = useVault();

  const [audit, setAudit] = useState<SecurityAuditResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!isUnlocked) {
        router.replace('/');
      } else {
        runAudit();
      }
    }, [isUnlocked])
  );

  const runAudit = async () => {
    setLoading(true);
    try {
      // Get fresh entries directly from vault service to avoid stale state
      const freshEntries = await vaultService.getAllEntries();
      const result = performSecurityAudit(freshEntries);
      setAudit(result);
    } catch (error) {
      console.error('Security audit failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await runAudit();
    setRefreshing(false);
  };

  const handleIssuePress = (issue: SecurityIssue) => {
    router.push(`/entry/${issue.entryId}`);
  };

  const renderScoreSection = () => {
    if (!audit) return null;

    const scoreColor = getScoreColor(audit.securityScore);

    return (
      <View style={[styles.scoreCard, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
        <View style={styles.scoreHeader}>
          <Text style={[styles.scoreTitle, { color: colors.textPrimary }]}>Security Score</Text>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>
            {audit.securityScore}/100
          </Text>
        </View>
        <View style={[styles.scoreBar, { backgroundColor: colors.bgBase }]}>
          <View
            style={[
              styles.scoreFill,
              {
                width: `${audit.securityScore}%`,
                backgroundColor: scoreColor,
              },
            ]}
          />
        </View>
        <Text style={[styles.scoreDescription, { color: colors.textMuted }]}>
          {audit.securityScore >= 80
            ? 'Excellent! Your vault is well secured.'
            : audit.securityScore >= 60
              ? 'Good, but there are some improvements to make.'
              : audit.securityScore >= 40
                ? 'Fair. Consider addressing the issues below.'
                : 'Needs attention. Address the security issues below.'}
        </Text>
      </View>
    );
  };

  const renderSummaryCards = () => {
    if (!audit) return null;

    const cards = [
      { label: 'Critical', count: audit.critical, color: '#e74c3c' },
      { label: 'High', count: audit.high, color: '#f39c12' },
      { label: 'Medium', count: audit.medium, color: '#f1c40f' },
      { label: 'Low', count: audit.low, color: '#3498db' },
    ];

    return (
      <View style={styles.summaryContainer}>
        {cards.map((card) => (
          <View
            key={card.label}
            style={[styles.summaryCard, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
          >
            <Text style={[styles.summaryCount, { color: card.color }]}>
              {card.count}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              {card.label}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderIssuesList = () => {
    if (!audit) return null;

    if (audit.issues.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="shield-checkmark" size={48} color={colors.accent} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            All Clear!
          </Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No security issues found in your vault
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.issuesContainer}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Security Issues ({audit.totalIssues})
        </Text>
        {audit.issues.map((issue, index) => (
          <TouchableOpacity
            key={`${issue.entryId}-${issue.type}-${index}`}
            style={[styles.issueCard, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
            onPress={() => handleIssuePress(issue)}
            activeOpacity={0.7}
          >
            <View style={styles.issueHeader}>
              <View
                style={[styles.severityDot, { backgroundColor: getSeverityColor(issue.severity) }]}
              />
              <View style={styles.issueContent}>
                <Text style={[styles.issueTitle, { color: colors.textPrimary }]}>
                  {issue.type.charAt(0).toUpperCase() + issue.type.slice(1)} - {issue.entryTitle}
                </Text>
                <Text style={[styles.issueMessage, { color: colors.textSecondary }]}>
                  {issue.message}
                </Text>
                {issue.recommendation && (
                  <View style={styles.recommendationRow}>
                    <Ionicons name="bulb-outline" size={12} color={colors.warning} />
                    <Text style={[styles.recommendation, { color: colors.textMuted }]}>
                      {issue.recommendation}
                    </Text>
                  </View>
                )}
              </View>
              <View
                style={[
                  styles.severityBadge,
                  { backgroundColor: getSeverityColor(issue.severity) + '20' },
                ]}
              >
                <Text
                  style={[styles.severityText, { color: getSeverityColor(issue.severity) }]}
                >
                  {issue.severity.toUpperCase()}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  if (loading && !audit) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgBase }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="shield-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Analyzing security...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgBase }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Security
        </Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {renderScoreSection()}
        {renderSummaryCards()}
        {renderIssuesList()}
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
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '300',
    letterSpacing: -0.5,
  },
  refreshButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: typography.fontSize.base,
  },
  scoreCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '400',
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: '300',
  },
  scoreBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  scoreFill: {
    height: '100%',
    borderRadius: 4,
  },
  scoreDescription: {
    fontSize: typography.fontSize.sm,
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  summaryCount: {
    fontSize: 22,
    fontWeight: '300',
  },
  summaryLabel: {
    fontSize: typography.fontSize.xs,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
    marginBottom: 12,
  },
  issuesContainer: {
    gap: 8,
  },
  issueCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  issueHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  issueContent: {
    flex: 1,
  },
  issueTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
    marginBottom: 4,
  },
  issueMessage: {
    fontSize: typography.fontSize.xs,
    marginBottom: 6,
  },
  recommendationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recommendation: {
    fontSize: 11,
    fontStyle: 'italic',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '400',
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    textAlign: 'center',
  },
});

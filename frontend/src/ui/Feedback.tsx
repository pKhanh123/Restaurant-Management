import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { StatusTone } from './tokens';
import { statusTone } from './tokens';

export interface InlineAlertProps {
  message: string;
  tone?: StatusTone;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export const InlineAlert: React.FC<InlineAlertProps> = ({
  message,
  tone = 'danger',
  title,
  actionLabel,
  onAction,
  testID
}) => {
  const colors = statusTone[tone];

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[styles.alert, { backgroundColor: colors.background, borderColor: colors.border }]}
    >
      {title && <Text style={[styles.alertTitle, { color: colors.foreground }]}>{title}</Text>}
      <Text style={[styles.alertMessage, { color: colors.foreground }]}>{message}</Text>
      {actionLabel && onAction && (
        <Text onPress={onAction} style={[styles.alertTitle, { color: colors.foreground, textDecorationLine: 'underline', marginTop: 4 }]}>
          {actionLabel}
        </Text>
      )}
    </View>
  );
};

export interface EmptyStateProps {
  description: string;
  title?: string;
  action?: React.ReactNode;
  testID?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  description,
  title = 'Chưa có dữ liệu',
  action,
  testID
}) => {
  const { theme } = useTheme();

  return (
    <View testID={testID} accessibilityRole="summary" style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>{description}</Text>
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  alert: { borderRadius: radii.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md },
  alertTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  alertMessage: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  emptyState: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl },
  emptyTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, textAlign: 'center' },
  emptyDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, maxWidth: 360, textAlign: 'center' },
  action: { marginTop: spacing.sm }
});

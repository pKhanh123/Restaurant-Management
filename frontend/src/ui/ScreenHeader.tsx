import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { spacing, typography } from '../theme';

export interface ScreenHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, description, actions, leading }) => {
  const { theme } = useTheme();

  return (
    <View style={styles.header}>
      {leading && <View style={styles.leading}>{leading}</View>}
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
        {description && <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>}
      </View>
      {actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  leading: { alignItems: 'center', justifyContent: 'center' },
  copy: { flexBasis: 200, flexGrow: 1, flexShrink: 1, gap: spacing.xs, minWidth: 0 },
  title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xxl, lineHeight: typography.lineHeights.xxl },
  description: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  actions: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', gap: spacing.sm, maxWidth: '100%' }
});

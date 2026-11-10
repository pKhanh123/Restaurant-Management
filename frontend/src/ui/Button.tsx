import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { radii, typography } from '../theme';
import { AppIcon } from './AppIcon';
import { buttonMetrics, buttonTone } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps {
  variant?: ButtonVariant;
  label: string;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  label,
  icon,
  loading = false,
  disabled = false,
  onPress,
  testID
}) => {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const isDisabled = disabled || loading;
  const effectiveVariant: ButtonVariant = (variant && ['primary', 'secondary', 'quiet', 'danger'].includes(variant)) ? variant : 'primary';
  const metrics = buttonMetrics[effectiveVariant];
  const palette = {
    primary: {
      background: theme.mode === 'dark' ? buttonTone.primary.dark.background : theme.interactivePrimary,
      pressed: theme.mode === 'dark' ? buttonTone.primary.dark.pressed : theme.interactivePrimaryPressed,
      text: buttonTone.primary.dark.foreground
    },
    secondary: { background: theme.interactiveSecondary, pressed: theme.interactiveSecondaryPressed, text: theme.textPrimary },
    quiet: { background: theme.interactiveQuiet, pressed: theme.surfaceSunken, text: theme.textPrimary },
    danger: {
      background: theme.mode === 'dark' ? buttonTone.danger.dark.background : theme.interactiveDanger,
      pressed: theme.mode === 'dark' ? buttonTone.danger.dark.pressed : theme.interactiveDangerPressed,
      text: buttonTone.danger.dark.foreground
    }
  }[effectiveVariant];

  return (
    <Pressable
      {...(Platform.OS === 'web' && { dataSet: { interaction: 'button' } })}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={loading ? `${label}, đang xử lý` : label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? palette.pressed : palette.background,
          minHeight: metrics.minHeight,
          paddingHorizontal: metrics.horizontalPadding
        },
        focused && { borderColor: theme.focusRing },
        isDisabled && styles.disabled
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={palette.text} size="small" /> : icon ? <AppIcon icon={icon} color={palette.text} /> : null}
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radii.md,
    borderWidth: 2,
    justifyContent: 'center'
  },
  content: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' },
  label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  disabled: { opacity: 0.55 }
});

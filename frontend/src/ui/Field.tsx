import React, { useState } from 'react';
import type { TextInputProps } from 'react-native';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { radii, spacing, typography } from '../theme';
import { fieldState } from './tokens';

export interface FieldProps extends TextInputProps {
  label: string;
  description?: string;
  error?: string;
  testID?: string;
  webType?: 'date' | 'datetime-local' | 'email' | 'text';
}

export const Field: React.FC<FieldProps> = ({
  label,
  description,
  error,
  testID,
  webType,
  onBlur,
  onFocus,
  accessibilityLabel,
  style: inputStyle,
  ...inputProps
}) => {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const isDisabled = inputProps.editable === false;
  const helperText = error || description;
  const inputColors = isDisabled
    ? {
      backgroundColor: theme[fieldState.disabled.background],
      borderColor: theme[fieldState.disabled.border],
      color: theme[fieldState.disabled.text],
      placeholderColor: theme[fieldState.disabled.placeholder]
    }
    : {
      backgroundColor: theme.surfaceBase,
      borderColor: error ? theme.danger : focused ? theme.focusRing : theme.borderSubtle,
      color: theme.textPrimary,
      placeholderColor: theme.textSecondary
    };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: isDisabled ? theme.textSecondary : theme.textPrimary }]}>{label}</Text>
      <TextInput
        {...inputProps}
        {...(Platform.OS === 'web' && webType ? { type: webType as any } : {})}
        testID={testID}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityState={{ disabled: isDisabled }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={inputColors.placeholderColor}
        style={[
          styles.input,
          inputStyle,
          {
            backgroundColor: inputColors.backgroundColor,
            borderColor: inputColors.borderColor,
            color: inputColors.color
          }
        ]}
      />
      {helperText && (
        <Text
          accessibilityLiveRegion={error ? 'assertive' : 'polite'}
          style={[styles.helper, { color: error ? theme.danger : theme.textSecondary }]}
        >
          {helperText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.md,
    minHeight: spacing.touchTargetMobile,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  helper: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs }
});

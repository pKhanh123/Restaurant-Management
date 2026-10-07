import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import HorizontalColorLogo from '../../assets/brand/crispy-bite-horizontal-color.svg';
import HorizontalMonochromeLogo from '../../assets/brand/crispy-bite-horizontal-monochrome.svg';
import AppIconLogo from '../../assets/brand/crispy-bite-app-icon.svg';

export type BrandMarkVariant = 'color' | 'monochrome' | 'icon';
export type BrandMarkSize = 'small' | 'medium' | 'large';

export interface BrandMarkProps {
  compact?: boolean;
  size?: BrandMarkSize;
  testID?: string;
  variant?: BrandMarkVariant;
}

const horizontalSizes: Record<BrandMarkSize, { height: number; width: number }> = {
  small: { height: 28, width: 132 },
  medium: { height: 36, width: 170 },
  large: { height: 50, width: 236 }
};

const iconSizes: Record<BrandMarkSize, number> = {
  small: 36,
  medium: 48,
  large: 72
};

const logoComponents: Record<BrandMarkVariant, React.FC<SvgProps>> = {
  color: HorizontalColorLogo,
  monochrome: HorizontalMonochromeLogo,
  icon: AppIconLogo
};

const logoTestIDs: Record<BrandMarkVariant, string> = {
  color: 'brand-logo-horizontal-color',
  monochrome: 'brand-logo-horizontal-monochrome',
  icon: 'brand-logo-icon'
};

export const BrandMark: React.FC<BrandMarkProps> = ({ compact = false, size = 'small', testID, variant = 'color' }) => {
  const resolvedVariant: BrandMarkVariant = compact ? 'icon' : variant;
  const Logo = logoComponents[resolvedVariant];
  const dimensions = resolvedVariant === 'icon'
    ? { height: iconSizes[size], width: iconSizes[size] }
    : horizontalSizes[size];

  return (
    <View
      testID={testID}
      accessibilityLabel="Crispy Bite"
      accessibilityRole="image"
      style={[styles.container, dimensions]}
    >
      <Logo
        testID={logoTestIDs[resolvedVariant]}
        width={dimensions.width}
        height={dimensions.height}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' }
});

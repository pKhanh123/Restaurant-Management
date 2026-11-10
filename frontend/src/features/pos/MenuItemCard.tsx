import React, { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SlidersHorizontal, UtensilsCrossed } from 'lucide-react-native';
import { MenuItemDto } from '../../api/contracts';
import { resolveImageUrl } from '../../api/config';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, StatusBadge } from '../../ui';
import { isMenuItemOutOfStock, isMenuItemOrderable } from './menuStock';

interface Props {
  item: MenuItemDto;
  onPress: (item: MenuItemDto) => void;
}

export const MenuItemCard: React.FC<Props> = ({ item, onPress }) => {
  const { theme } = useTheme();
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const imageUrl = item.imageUrl ? resolveImageUrl(item.imageUrl) : undefined;
  const formattedPrice = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(item.basePrice);
  const hasModifiers = Boolean(item.modifierGroups?.length);
  const isOutOfStock = isMenuItemOutOfStock(item);
  const isOrderable = isMenuItemOrderable(item);

  return (
    <Pressable
      {...(Platform.OS === 'web' && { dataSet: { interaction: 'menu-card' } })}
      testID={`menu-item-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formattedPrice}${!item.isAvailable ? ', hết hàng' : isOutOfStock ? ', hết tồn' : ''}`}
      accessibilityState={{ disabled: !isOrderable }}
      disabled={!isOrderable}
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase,
          borderColor: isOrderable ? theme.borderSubtle : theme.borderStrong
        },
        !isOrderable && styles.disabled
      ]}
    >
      <View style={[styles.media, { backgroundColor: theme.surfaceSunken }]}>
        {imageUrl && imageUrl !== failedImageUrl ? (
          <Image source={{ uri: imageUrl }} onError={() => setFailedImageUrl(imageUrl)} style={styles.image} resizeMode="cover" />
        ) : (
          <AppIcon icon={UtensilsCrossed} color={theme.textSecondary} size={28} />
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.copy}>
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>{item.name}</Text>
          {item.description && <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>{item.description}</Text>}
        </View>

        <View style={styles.footer}>
          <Text style={[styles.price, { color: theme.primary }]}>{formattedPrice}</Text>
          {!item.isAvailable ? (
            <StatusBadge tone="danger" label="Hết hàng" />
          ) : isOutOfStock ? (
            <StatusBadge tone="danger" label="Hết tồn" />
          ) : hasModifiers ? (
            <StatusBadge tone="neutral" label="Tùy chọn" icon={SlidersHorizontal} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: radii.md, borderWidth: 1, flex: 1, marginBottom: spacing.md, minHeight: 164, overflow: 'hidden' },
  disabled: { opacity: 0.55 },
  media: { alignItems: 'center', height: 88, justifyContent: 'center', overflow: 'hidden' },
  image: { height: '100%', width: '100%' },
  content: { flex: 1, gap: spacing.md, justifyContent: 'space-between', padding: spacing.md },
  copy: { gap: spacing.xs },
  name: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, lineHeight: typography.lineHeights.md },
  description: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  footer: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  price: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, fontVariant: [...typography.numeric.fontVariant] }
});

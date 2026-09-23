import React from 'react';
import { Alert, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Printer, X } from 'lucide-react-native';
import { OrderDto } from '../../api/contracts';
import { useTheme } from '../../contexts/ThemeContext';
import { elevation, radii, spacing, typography } from '../../theme';
import { AppIcon, Button, StatusBadge } from '../../ui';
import type { StatusTone } from '../../ui';

interface Props {
  visible: boolean;
  order: OrderDto | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<Props> = ({ visible, order, onClose }) => {
  const { theme } = useTheme();
  if (!order) return null;

  const handlePrintOrExport = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.print) {
      window.print();
    } else {
      Alert.alert(
        'Đã xuất hóa đơn',
        `Hóa đơn ${order.code} đã được xuất thành snapshot PDF. Tổng thanh toán: ${order.finalAmount.toLocaleString('vi-VN')} đ.`
      );
    }
  };

  const paymentMethodLabel = order.paymentMethod
    ? {
      CASH: 'Tiền mặt',
      BANK_TRANSFER: 'Chuyển khoản',
      CREDIT_CARD: 'Thẻ tín dụng',
      E_WALLET: 'Ví điện tử'
    }[order.paymentMethod]
    : 'Chưa thanh toán';

  const paymentStatus: { label: string; tone: StatusTone } = {
    PAID: { label: 'Đã thanh toán', tone: 'success' as const },
    VOIDED: { label: 'Đã hủy', tone: 'danger' as const },
    UNPAID: { label: 'Chưa thanh toán', tone: 'warning' as const }
  }[order.paymentStatus];

  const orderDate = new Date(order.paidAt || order.createdAt);
  const formattedDate = Number.isNaN(orderDate.getTime()) ? order.createdAt : orderDate.toLocaleString('vi-VN');

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <SafeAreaView style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View testID="receipt-modal" style={[styles.container, elevation.modal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
          <View style={[styles.topActions, { borderBottomColor: theme.borderSubtle }]}>
            <Text testID="receipt-modal-title" accessibilityRole="header" style={[styles.modalHeading, { color: theme.textPrimary }]}>Hóa đơn bán hàng</Text>
            <Pressable
              testID="btn-close-receipt"
              accessibilityRole="button"
              accessibilityLabel="Đóng hóa đơn"
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}
            >
              <AppIcon icon={X} color={theme.textPrimary} size={20} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.receiptScroll} showsVerticalScrollIndicator={false}>
            <View style={[styles.receiptPaper, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <View style={styles.brandHeader}>
                <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>Crispy Bite QSR</Text>
                <Text style={[styles.brandInfo, { color: theme.textSecondary }]}>123 Nguyễn Huệ, Quận 1, TP. HCM</Text>
                <Text style={[styles.brandInfo, { color: theme.textSecondary }]}>Hotline 1900 8888</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.borderStrong }]} />

              <View style={styles.metaSection}>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Mã hóa đơn</Text>
                  <Text style={[styles.orderCode, { color: theme.textPrimary }]}>{order.code}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Thời gian</Text>
                  <Text style={[styles.metaValue, { color: theme.textPrimary }]}>{formattedDate}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Hình thức</Text>
                  <Text style={[styles.metaValue, { color: theme.textPrimary }]}>
                    {order.orderType === 'DINE_IN'
                      ? `Tại bàn ${order.tableNumber ?? order.tableId ?? 'Chưa gán'}`
                      : `Mang đi · Số nhận món ${order.buzzerNumber ?? 'Chưa gán'}`}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Trạng thái</Text>
                  <StatusBadge tone={paymentStatus.tone} label={paymentStatus.label} />
                </View>
                {order.voidReason && (
                  <View style={[styles.voidReason, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}>
                    <Text style={[styles.voidReasonText, { color: theme.danger }]}>Lý do hủy: {order.voidReason}</Text>
                  </View>
                )}
              </View>

              <View style={[styles.divider, { backgroundColor: theme.borderStrong }]} />

              <View style={styles.itemsSection}>
                <View style={[styles.tableHeader, { borderBottomColor: theme.borderSubtle }]}>
                  <Text style={[styles.itemColumn, styles.headerText, { color: theme.textSecondary }]}>Món</Text>
                  <Text style={[styles.quantityColumn, styles.headerText, { color: theme.textSecondary }]}>SL</Text>
                  <Text style={[styles.amountColumn, styles.headerText, { color: theme.textSecondary }]}>Thành tiền</Text>
                </View>
                {order.items.map((item, index) => (
                  <View key={item.id || index} style={[styles.itemRow, { borderBottomColor: theme.borderSubtle }]}>
                    <View style={styles.itemMainRow}>
                      <View style={styles.itemColumn}>
                        <Text style={[styles.itemName, { color: theme.textPrimary }]}>{item.menuItemName || `Món #${item.menuItemId}`}</Text>
                        {(item.selectedModifiersJson || []).map((modifier, modifierIndex) => (
                          <Text key={`${modifier.optionId}-${modifierIndex}`} style={[styles.itemMeta, { color: theme.textSecondary }]}>
                            {modifier.groupName}: {modifier.optionName}{modifier.priceDelta > 0 ? ` (+${modifier.priceDelta.toLocaleString('vi-VN')} đ)` : ''}
                          </Text>
                        ))}
                        {item.notes && <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>Ghi chú: {item.notes}</Text>}
                        <Text style={[styles.unitPrice, { color: theme.textSecondary }]}>{item.unitPrice.toLocaleString('vi-VN')} đ / món</Text>
                      </View>
                      <Text style={[styles.quantityColumn, styles.itemQuantity, { color: theme.textPrimary }]}>{item.quantity}</Text>
                      <Text style={[styles.amountColumn, styles.itemAmount, { color: theme.textPrimary }]}>{item.subtotal.toLocaleString('vi-VN')} đ</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.totalsSection}>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Cộng tiền món</Text>
                  <Text style={[styles.totalValue, { color: theme.textPrimary }]}>{order.totalAmount.toLocaleString('vi-VN')} đ</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Thuế GTGT (VAT 8%)</Text>
                  <Text style={[styles.totalValue, { color: theme.textPrimary }]}>{order.vatAmount.toLocaleString('vi-VN')} đ</Text>
                </View>
                <View style={[styles.finalRow, { borderTopColor: theme.borderStrong }]}>
                  <Text style={[styles.finalLabel, { color: theme.textPrimary }]}>Tổng thanh toán</Text>
                  <Text style={[styles.finalValue, { color: theme.primary }]}>{order.finalAmount.toLocaleString('vi-VN')} đ</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Phương thức</Text>
                  <Text style={[styles.paymentMethod, { color: theme.textPrimary }]}>{paymentMethodLabel}</Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.borderStrong }]} />
              <View style={styles.footerNotice}>
                <Text style={[styles.footerThanks, { color: theme.textPrimary }]}>Cảm ơn quý khách. Hẹn gặp lại.</Text>
                <Text style={[styles.footerSub, { color: theme.textSecondary }]}>Hóa đơn lưu giá tại thời điểm tạo đơn.</Text>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.modalActions, { borderTopColor: theme.borderSubtle }]}>
            <Button variant="secondary" label="Đóng" onPress={onClose} />
            <Button variant="primary" label="In hoặc xuất PDF" icon={Printer} onPress={handlePrintOrExport} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.md },
  container: { borderRadius: radii.md, borderWidth: 1, maxHeight: '94%', maxWidth: 560, overflow: 'hidden', width: '100%' },
  topActions: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  modalHeading: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  iconButton: { alignItems: 'center', borderRadius: radii.sm, height: 44, justifyContent: 'center', width: 44 },
  receiptScroll: { padding: spacing.md },
  receiptPaper: { borderRadius: radii.md, borderWidth: 1, padding: spacing.lg },
  brandHeader: { alignItems: 'center', gap: spacing.xs },
  brandTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xxl },
  brandInfo: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  divider: { height: 1, marginVertical: spacing.lg },
  metaSection: { gap: spacing.sm },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  metaLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  metaValue: { flexShrink: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs, textAlign: 'right' },
  orderCode: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  voidReason: { borderRadius: radii.xs, borderWidth: 1, marginTop: spacing.xs, padding: spacing.sm },
  voidReasonText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  itemsSection: { gap: spacing.xs },
  tableHeader: { borderBottomWidth: 1, flexDirection: 'row', paddingBottom: spacing.sm },
  headerText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  itemColumn: { flex: 1 },
  quantityColumn: { textAlign: 'center', width: 36 },
  amountColumn: { textAlign: 'right', width: 96 },
  itemRow: { borderBottomWidth: 1, paddingVertical: spacing.sm },
  itemMainRow: { alignItems: 'flex-start', flexDirection: 'row' },
  itemName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  itemMeta: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs, marginTop: 2 },
  unitPrice: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, marginTop: spacing.xs },
  itemQuantity: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  itemAmount: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, fontVariant: [...typography.numeric.fontVariant] },
  totalsSection: { gap: spacing.sm, paddingTop: spacing.lg },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  totalValue: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm, fontVariant: [...typography.numeric.fontVariant] },
  finalRow: { alignItems: 'baseline', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.md },
  finalLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  finalValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, fontVariant: [...typography.numeric.fontVariant] },
  paymentMethod: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  footerNotice: { alignItems: 'center', gap: spacing.xs },
  footerThanks: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  footerSub: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, textAlign: 'center' },
  modalActions: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.md }
});

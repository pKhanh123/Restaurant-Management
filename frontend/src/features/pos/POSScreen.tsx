import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import {
  CheckCircle2,
  FileText,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Truck,
  Utensils,
  UserRound,
  X
} from 'lucide-react-native';
import { MenuItemDto, OrderDto, OrderType, VoucherValidationResultDto } from '../../api/contracts';
import { validateVoucherApi } from '../../api/vouchers';
import { DeliveryPartnerDto, fetchSelectableDeliveryPartnersApi } from '../../api/deliveryPartners';
import { fetchCommissionAssigneesApi, type CommissionAssigneeDto } from '../../api/employeeCommissions';
import { fetchSelectableCustomersApi, SelectableCustomerDto } from '../../api/customers';
import { useAuth } from '../../contexts/AuthContext';
import { CartItem, useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { elevation, radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, Surface } from '../../ui';
import { MenuCategoryPills } from './MenuCategoryPills';
import { MenuItemCard } from './MenuItemCard';
import { ModifierModal } from './ModifierModal';
import { ReceiptModal } from './ReceiptModal';
import { deliveryOrderTotal, validateDeliveryDraft } from '../orders/deliveryPartnerViewModel';
import { CommissionAssigneePicker } from './CommissionAssigneePicker';

const formatVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

interface CartPanelProps {
  cart: CartItem[];
  cartItemCount: number;
  cartSubtotal: number;
  cartVat: number;
  cartTotal: number;
  appliedVoucher: VoucherValidationResultDto | null;
  onApplyVoucher: (voucher: VoucherValidationResultDto | null) => void;
  onClear: () => void;
  onCheckout: () => void;
  onRemove: (index: number) => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  assignees: CommissionAssigneeDto[];
  onUpdateAssignee: (index: number, employeeId: number | null) => void;
}

const CartPanel: React.FC<CartPanelProps> = ({
  cart,
  cartItemCount,
  cartSubtotal,
  cartVat,
  cartTotal,
  appliedVoucher,
  onApplyVoucher,
  onClear,
  onCheckout,
  onRemove,
  onUpdateQuantity,
  assignees,
  onUpdateAssignee
}) => {
  const { theme } = useTheme();
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [isCheckingVoucher, setIsCheckingVoucher] = useState(false);

  const handleApplyVoucher = async () => {
    const code = voucherInput.trim().toUpperCase();
    if (!code) return;
    setIsCheckingVoucher(true);
    setVoucherError(null);
    try {
      const result = await validateVoucherApi(code, cartSubtotal);
      onApplyVoucher(result);
      setVoucherInput('');
    } catch (err: any) {
      setVoucherError(err.message || 'Mã voucher không hợp lệ');
    } finally {
      setIsCheckingVoucher(false);
    }
  };

  return (
    <Surface level="base" style={[styles.cartPanel, { borderLeftColor: theme.borderSubtle }]}>
      <View testID="pos-cart-summary" style={[styles.cartHeader, { borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.cartHeadingCopy}>
          <View style={styles.cartHeadingRow}>
            <AppIcon icon={ShoppingCart} color={theme.primary} size={20} />
            <Text accessibilityRole="header" style={[styles.cartTitle, { color: theme.textPrimary }]}>Giỏ hàng</Text>
          </View>
          <Text style={[styles.cartCount, { color: theme.textSecondary }]}>{cartItemCount} món đã chọn</Text>
        </View>
        {cart.length > 0 && <Button variant="quiet" label="Xóa giỏ" onPress={onClear} />}
      </View>

      {cart.length === 0 ? (
        <EmptyState title="Giỏ hàng trống" description="Chọn một món trong thực đơn để bắt đầu tạo đơn." />
      ) : (
        <ScrollView style={styles.cartItems} contentContainerStyle={styles.cartItemsContent}>
          {cart.map((item, index) => (
            <View key={`${item.menuItem.id}-${index}`} style={[styles.cartItem, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.cartItemTop}>
                <View style={styles.cartItemCopy}>
                  <Text style={[styles.cartItemName, { color: theme.textPrimary }]}>{item.menuItem.name}</Text>
                  {item.selectedModifiers.map((modifier) => (
                    <Text key={`${modifier.modifierGroupId}-${modifier.optionId}`} style={[styles.cartItemMeta, { color: theme.textSecondary }]}>
                      {modifier.groupName}: {modifier.optionName}
                    </Text>
                  ))}
                  {item.notes && <Text style={[styles.cartItemMeta, { color: theme.textSecondary }]}>Ghi chú: {item.notes}</Text>}
                  <CommissionAssigneePicker lineIndex={index} value={item.commissionEmployeeId} assignees={assignees} onChange={employeeId => onUpdateAssignee(index, employeeId)} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Xóa ${item.menuItem.name}`}
                  onPress={() => onRemove(index)}
                  style={({ pressed }) => [styles.iconAction, { backgroundColor: pressed ? theme.surfaceSunken : 'transparent' }]}
                >
                  <AppIcon icon={Trash2} color={theme.danger} size={18} />
                </Pressable>
              </View>
              <View style={styles.cartItemBottom}>
                <View style={styles.quantityControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Giảm số lượng ${item.menuItem.name}`}
                    onPress={() => onUpdateQuantity(index, item.quantity - 1)}
                    style={({ pressed }) => [styles.quantityButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet, borderColor: theme.borderSubtle }]}
                  >
                    <AppIcon icon={Minus} color={theme.textPrimary} size={16} />
                  </Pressable>
                  <Text style={[styles.quantityValue, { color: theme.textPrimary }]}>{item.quantity}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Tăng số lượng ${item.menuItem.name}`}
                    onPress={() => onUpdateQuantity(index, item.quantity + 1)}
                    style={({ pressed }) => [styles.quantityButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet, borderColor: theme.borderSubtle }]}
                  >
                    <AppIcon icon={Plus} color={theme.textPrimary} size={16} />
                  </Pressable>
                </View>
                <Text style={[styles.cartItemPrice, { color: theme.textPrimary }]}>{formatVND(item.subtotal)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={[styles.cartTotals, { borderTopColor: theme.borderSubtle }]}>
        {/* Voucher Section */}
        {appliedVoucher ? (
          <View style={[styles.posVoucherBadge, { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: typography.families.operationalBold, fontSize: typography.sizes.sm, color: theme.primary }}>
                🎟️ {appliedVoucher.code} (-{formatVND(appliedVoucher.discountAmount)})
              </Text>
              <Text style={{ fontFamily: typography.families.body, fontSize: typography.sizes.xs, color: theme.textSecondary }}>
                {appliedVoucher.title}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gỡ voucher"
              onPress={() => onApplyVoucher(null)}
              style={styles.posVoucherRemoveBtn}
            >
              <AppIcon icon={X} color={theme.danger} size={16} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.posVoucherInputRow}>
            <TextInput
              style={[
                styles.posVoucherInput,
                {
                  backgroundColor: theme.surfaceSunken,
                  borderColor: voucherError ? theme.danger : theme.borderSubtle,
                  color: theme.textPrimary
                }
              ]}
              placeholder="Mã voucher (VD: CRISPY10)"
              placeholderTextColor={theme.textSecondary}
              value={voucherInput}
              onChangeText={(t: string) => {
                setVoucherInput(t.toUpperCase());
                if (voucherError) setVoucherError(null);
              }}
              autoCapitalize="characters"
            />
            <Button
              variant="secondary"
              label={isCheckingVoucher ? '...' : 'Áp dụng'}
              disabled={!voucherInput.trim() || isCheckingVoucher}
              onPress={handleApplyVoucher}
            />
          </View>
        )}
        {voucherError && (
          <Text style={{ fontFamily: typography.families.body, fontSize: typography.sizes.xs, color: theme.danger }}>
            ⚠️ {voucherError}
          </Text>
        )}

        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Cộng tiền món</Text>
          <Text style={[styles.totalValue, { color: theme.textPrimary }]}>{formatVND(cartSubtotal)}</Text>
        </View>
        {appliedVoucher && (
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.success }]}>
              Giảm giá ({appliedVoucher.code})
            </Text>
            <Text style={[styles.totalValue, { color: theme.success }]}>
              - {formatVND(appliedVoucher.discountAmount)}
            </Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>VAT 8%</Text>
          <Text style={[styles.totalValue, { color: theme.textPrimary }]}>
            {formatVND(appliedVoucher ? appliedVoucher.vatAmount : cartVat)}
          </Text>
        </View>
        <View style={styles.grandTotalRow}>
          <Text style={[styles.grandTotalLabel, { color: theme.textPrimary }]}>Tổng thanh toán</Text>
          <Text testID="pos-cart-total" style={[styles.grandTotalValue, { color: theme.primary }]}>
            {formatVND(appliedVoucher ? appliedVoucher.finalAmount : cartTotal)}
          </Text>
        </View>
        <Button testID="btn-open-checkout" variant="primary" label="Xác nhận đơn" disabled={cart.length === 0} onPress={onCheckout} />
      </View>
    </Surface>
  );
};

export const POSScreen: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isSplitLayout = width >= 900;
  const menuColumns = width >= 1400 ? 3 : width >= 600 ? 2 : 1;
  const {
    categories,
    allMenuItems,
    filteredMenuItems,
    selectedCategoryId,
    selectCategory,
    isLoadingMenu,
    menuError,
    fetchMenu,
    selectedMenuItemForModal,
    isModifierModalOpen,
    openModifierModal,
    closeModifierModal,
    cart,
    cartSubtotal,
    cartVat,
    cartItemCount,
    cartTotal,
    addToCart,
    updateCartQuantity,
    updateCartCommissionEmployee,
    removeFromCart,
    clearCart,
    tables,
    createOrder
  } = useRestaurant();

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [appliedVoucher, setAppliedVoucher] = useState<VoucherValidationResultDto | null>(null);
  const [deliveryPartners, setDeliveryPartners] = useState<DeliveryPartnerDto[]>([]);
  const [selectedDeliveryPartnerId, setSelectedDeliveryPartnerId] = useState<number | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFeeText, setDeliveryFeeText] = useState('0');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<SelectableCustomerDto[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<SelectableCustomerDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successOrderCode, setSuccessOrderCode] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<OrderDto | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [commissionAssignees, setCommissionAssignees] = useState<CommissionAssigneeDto[]>([]);
  const [safeDefaultCommissionEmployeeId, setSafeDefaultCommissionEmployeeId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void fetchCommissionAssigneesApi(token, 1).then(result => {
      if (!active) return;
      setCommissionAssignees(result.assignees);
      setSafeDefaultCommissionEmployeeId(result.safeDefaultEmployeeId);
    }).catch(() => {
      if (!active) return;
      setCommissionAssignees([]);
      setSafeDefaultCommissionEmployeeId(null);
    });
    return () => { active = false; };
  }, [token]);

  const handleCardPress = (item: MenuItemDto) => {
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      openModifierModal(item);
    } else {
      addToCart(item, 1, [], undefined, safeDefaultCommissionEmployeeId);
      showToast({
        type: 'success',
        message: `Đã thêm "${item.name}" vào giỏ hàng`
      });
    }
  };

  const selectableTables = tables.filter((table) => table.status !== 'NEED_CLEANING');
  const deliveryFee = Number(deliveryFeeText || 0);
  const checkoutTotal = orderType === 'DELIVERY' ? deliveryOrderTotal(cartSubtotal, Number.isFinite(deliveryFee) ? deliveryFee : 0).finalAmount : cartTotal;

  useEffect(() => {
    if (!isConfirmModalOpen || orderType !== 'DELIVERY') return;
    void fetchSelectableDeliveryPartnersApi(token).then(setDeliveryPartners).catch(error => setSubmitError(error.message || 'Không thể tải đối tác giao hàng.'));
  }, [isConfirmModalOpen, orderType, token]);

  useEffect(() => {
    const search = customerSearch.trim();
    if (!isConfirmModalOpen || search.length < 2) { setCustomerSuggestions([]); return; }
    let active = true;
    const timer = setTimeout(() => {
      void fetchSelectableCustomersApi(token, search).then(result => { if (active) setCustomerSuggestions(result); }).catch(error => { if (active) setSubmitError(error.message || 'Không thể tra cứu khách hàng.'); });
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [customerSearch, isConfirmModalOpen, token]);

  const handleOpenConfirmModal = () => {
    setSubmitError(null);
    setSuccessOrderCode(null);
    const firstAvailable = selectableTables.find((table) => table.status === 'AVAILABLE');
    setSelectedTableId(firstAvailable ? firstAvailable.id : selectableTables[0]?.id ?? null);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmOrder = async () => {
    if (orderType === 'DINE_IN' && !selectedTableId) {
      setSubmitError('Vui lòng chọn bàn ăn cho đơn phục vụ tại chỗ.');
      return;
    }
    if (orderType === 'DELIVERY') {
      const deliveryError = validateDeliveryDraft({ partnerId: selectedDeliveryPartnerId, address: deliveryAddress, fee: deliveryFee });
      if (deliveryError) { setSubmitError(deliveryError); return; }
    }

    setIsSubmitting(true);
    setSubmitError(null);
    const result = await createOrder({
      orderType,
      tableId: orderType === 'DINE_IN' ? selectedTableId : undefined,
      customerId: selectedCustomer?.id,
      voucherCode: appliedVoucher?.code,
      deliveryPartnerId: orderType === 'DELIVERY' ? selectedDeliveryPartnerId ?? undefined : undefined,
      deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress.trim() : undefined,
      deliveryFee: orderType === 'DELIVERY' ? deliveryFee : undefined
    });
    setIsSubmitting(false);

    if (result.success && result.order) {
      setSuccessOrderCode(result.order.code);
      setCreatedOrder(result.order);
      setAppliedVoucher(null);
      setSelectedCustomer(null); setCustomerSearch('');
      const chosenTable = tables.find((t) => t.id === selectedTableId);
      showToast({
        type: 'success',
        title: 'Tạo đơn thành công! 🎉',
        message: `Đơn ${result.order.code} (${orderType === 'DINE_IN' ? `Bàn ${chosenTable?.tableNumber ?? ''}` : orderType === 'DELIVERY' ? 'Giao hàng' : 'Mang đi'}) đã được gửi xuống bếp.`
      });
    } else {
      setSubmitError(result.error || 'Gửi đơn thất bại. Vui lòng thử lại.');
      showToast({
        type: 'error',
        title: 'Không thể tạo đơn',
        message: result.error || 'Vui lòng thử lại.'
      });
    }
  };

  const handleCloseConfirmModal = () => {
    if (isSubmitting) return;
    setIsConfirmModalOpen(false);
    setSuccessOrderCode(null);
    setSubmitError(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={styles.workspace}>
        <View style={styles.catalogPane}>
          <View style={styles.catalogHeader}>
            <ScreenHeader
              title="Thực đơn"
              description={`${allMenuItems.length} món sẵn sàng phục vụ`}
              actions={!isSplitLayout ? (
                <View style={[styles.mobileCartStatus, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
                  <Text style={[styles.mobileCartStatusTitle, { color: theme.textPrimary }]}>Giỏ hàng</Text>
                  <Text style={[styles.mobileCartStatusCount, { color: theme.textSecondary }]}>{cartItemCount}</Text>
                </View>
              ) : undefined}
            />
          </View>

          <MenuCategoryPills categories={categories} selectedCategoryId={selectedCategoryId} onSelectCategory={selectCategory} totalItemCount={allMenuItems.length} />

          {isLoadingMenu ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang tải thực đơn...</Text>
            </View>
          ) : menuError ? (
            <View style={styles.centerContainer}>
              <InlineAlert title="Không thể tải thực đơn" message={menuError} />
              <Button variant="secondary" label="Thử lại" onPress={() => void fetchMenu()} />
            </View>
          ) : filteredMenuItems.length === 0 ? (
            <EmptyState title="Không có món phù hợp" description="Chọn danh mục khác để xem các món đang phục vụ." />
          ) : (
            <FlatList
              key={menuColumns}
              data={filteredMenuItems}
              keyExtractor={(item) => item.id.toString()}
              numColumns={menuColumns}
              contentContainerStyle={[styles.listContent, !isSplitLayout && cartItemCount > 0 && styles.listContentWithCart]}
              columnWrapperStyle={menuColumns > 1 ? styles.menuRow : undefined}
              renderItem={({ item }) => <MenuItemCard item={item} onPress={handleCardPress} />}
            />
          )}
        </View>

        {isSplitLayout && (
          <CartPanel
            cart={cart}
            cartItemCount={cartItemCount}
            cartSubtotal={cartSubtotal}
            cartVat={cartVat}
            cartTotal={cartTotal}
            appliedVoucher={appliedVoucher}
            onApplyVoucher={setAppliedVoucher}
            onClear={() => {
              clearCart();
              setAppliedVoucher(null);
            }}
            onCheckout={handleOpenConfirmModal}
            onRemove={removeFromCart}
            onUpdateQuantity={updateCartQuantity}
            assignees={commissionAssignees}
            onUpdateAssignee={updateCartCommissionEmployee}
          />
        )}
      </View>

      {!isSplitLayout && cartItemCount > 0 && (
        <Surface level="raised" style={[styles.mobileCartSummary, elevation.floatingAction]}>
          <View testID="pos-cart-summary" style={styles.mobileCartSummaryCopy}>
            <Text style={[styles.mobileCartLabel, { color: theme.textPrimary }]}>Giỏ hàng · {cartItemCount} món</Text>
            <Text testID="pos-cart-total" style={[styles.mobileCartTotal, { color: theme.primary }]}>
              {formatVND(appliedVoucher ? appliedVoucher.finalAmount : cartTotal)}
            </Text>
          </View>
          <Button testID="btn-open-checkout" variant="primary" label="Xác nhận" onPress={handleOpenConfirmModal} />
        </Surface>
      )}

      <Modal visible={isConfirmModalOpen} transparent animationType="slide" onRequestClose={handleCloseConfirmModal}>
        <View style={[styles.modalBackdrop, isSplitLayout && styles.modalBackdropCentered, { backgroundColor: theme.overlay }]}>
          <Surface level="raised" style={[styles.checkoutModal, isSplitLayout && styles.checkoutModalWide]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.modalHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.modalTitle, { color: theme.textPrimary }]}>Xác nhận đơn</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>{cartItemCount} món · {formatVND(checkoutTotal)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng xác nhận đơn"
                onPress={handleCloseConfirmModal}
                style={({ pressed }) => [styles.modalClose, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}
              >
                <AppIcon icon={X} color={theme.textPrimary} size={20} />
              </Pressable>
            </View>

            {successOrderCode ? (
              <View style={styles.successPanel}>
                <AppIcon icon={CheckCircle2} color={theme.success} size={40} />
                <Text style={[styles.successTitle, { color: theme.textPrimary }]}>Đơn {successOrderCode} đã gửi xuống bếp</Text>
                <Text style={[styles.successDescription, { color: theme.textSecondary }]}>Bạn có thể xem hóa đơn hoặc hoàn tất để tạo đơn mới.</Text>
                <View style={styles.successActionsRow}>
                  <Button testID="btn-view-receipt" variant="primary" label="Xem hóa đơn" icon={FileText} onPress={() => setIsReceiptModalOpen(true)} />
                  <Button testID="btn-done-order" variant="secondary" label="Hoàn tất" onPress={handleCloseConfirmModal} />
                </View>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.checkoutBody}>
                <View style={styles.checkoutSection}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Hình thức phục vụ</Text>
                  <View style={styles.orderTypeRow}>
                    <Pressable
                      testID="btn-dinein"
                      accessibilityRole="radio"
                      accessibilityState={{ selected: orderType === 'DINE_IN' }}
                      onPress={() => { setOrderType('DINE_IN'); setSubmitError(null); }}
                      style={({ pressed }) => [
                        styles.typeButton,
                        { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase, borderColor: theme.borderSubtle },
                        orderType === 'DINE_IN' && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
                      ]}
                    >
                      <AppIcon icon={Utensils} color={orderType === 'DINE_IN' ? theme.primary : theme.textSecondary} />
                      <Text style={[styles.typeButtonText, { color: orderType === 'DINE_IN' ? theme.primary : theme.textPrimary }]}>Tại bàn</Text>
                    </Pressable>
                    <Pressable
                      testID="btn-delivery"
                      accessibilityRole="radio"
                      accessibilityState={{ selected: orderType === 'DELIVERY' }}
                      onPress={() => { setOrderType('DELIVERY'); setSubmitError(null); }}
                      style={({ pressed }) => [
                        styles.typeButton,
                        { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase, borderColor: theme.borderSubtle },
                        orderType === 'DELIVERY' && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
                      ]}
                    >
                      <AppIcon icon={Truck} color={orderType === 'DELIVERY' ? theme.primary : theme.textSecondary} />
                      <Text style={[styles.typeButtonText, { color: orderType === 'DELIVERY' ? theme.primary : theme.textPrimary }]}>Giao hàng</Text>
                    </Pressable>
                    <Pressable
                      testID="btn-takeaway"
                      accessibilityRole="radio"
                      accessibilityState={{ selected: orderType === 'TAKE_AWAY' }}
                      onPress={() => { setOrderType('TAKE_AWAY'); setSubmitError(null); }}
                      style={({ pressed }) => [
                        styles.typeButton,
                        { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase, borderColor: theme.borderSubtle },
                        orderType === 'TAKE_AWAY' && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
                      ]}
                    >
                      <AppIcon icon={ShoppingBag} color={orderType === 'TAKE_AWAY' ? theme.primary : theme.textSecondary} />
                      <Text style={[styles.typeButtonText, { color: orderType === 'TAKE_AWAY' ? theme.primary : theme.textPrimary }]}>Mang đi</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.checkoutSection}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Khách hàng (không bắt buộc)</Text>
                  {selectedCustomer ? <View style={[styles.selectedCustomer, { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
                    <AppIcon icon={UserRound} color={theme.primary} size={17} /><View style={{ flex: 1 }}><Text style={{ color: theme.textPrimary, fontFamily: typography.families.bodySemibold }}>{selectedCustomer.name}</Text><Text style={{ color: theme.textSecondary }}>{selectedCustomer.code}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Bỏ chọn khách hàng" onPress={() => { setSelectedCustomer(null); setCustomerSearch(''); }}><AppIcon icon={X} color={theme.textSecondary} size={18} /></Pressable>
                  </View> : <TextInput accessibilityLabel="Tìm khách theo mã, tên, số điện thoại" value={customerSearch} onChangeText={setCustomerSearch} placeholder="Tìm theo mã, tên, số điện thoại" placeholderTextColor={theme.textSecondary} style={[styles.customerInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]} />}
                  {!selectedCustomer && customerSuggestions.map(customer => <Pressable key={customer.id} accessibilityRole="button" onPress={() => { setSelectedCustomer(customer); setCustomerSuggestions([]); setSubmitError(null); }} style={[styles.customerSuggestion, { borderBottomColor: theme.borderSubtle }]}><View style={{ flex: 1 }}><Text style={{ color: theme.textPrimary, fontFamily: typography.families.bodySemibold }}>{customer.name}</Text><Text style={{ color: theme.textSecondary }}>{customer.code}{customer.phone ? ` · ${customer.phone}` : ''}{customer.group?.name ? ` · ${customer.group.name}` : ''}</Text></View><AppIcon icon={UserRound} color={theme.primary} size={17} /></Pressable>)}
                  {!!customerSearch.trim() && customerSearch.trim().length >= 2 && !customerSuggestions.length && <Text style={{ color: theme.textSecondary }}>Không tìm thấy khách hàng phù hợp.</Text>}
                </View>

                {orderType === 'DINE_IN' && (
                  <View style={styles.checkoutSection}>
                    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Chọn bàn ({selectableTables.length} bàn)</Text>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled showsVerticalScrollIndicator={true}>
                      <View style={styles.tableGrid}>
                        {selectableTables.map((table) => {
                          const isSelected = selectedTableId === table.id;
                          return (
                            <Pressable
                              testID={`pos-table-option-${table.tableNumber}`}
                              key={table.id}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: isSelected }}
                              onPress={() => { setSelectedTableId(table.id); setSubmitError(null); }}
                              style={({ pressed }) => [
                                styles.tableButton,
                                { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase, borderColor: theme.borderSubtle },
                                isSelected && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
                              ]}
                            >
                              <Text style={[styles.tableNumber, { color: isSelected ? theme.primary : theme.textPrimary }]}>Bàn {table.tableNumber.toString().padStart(2, '0')}</Text>
                              <Text style={[styles.tableStatus, { color: theme.textSecondary }]}>{table.status === 'OCCUPIED' ? 'Đang phục vụ' : 'Sẵn sàng'}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                    {selectableTables.length === 0 && <InlineAlert message="Hiện không có bàn sẵn sàng nhận đơn." tone="warning" />}
                  </View>
                )}

                {orderType === 'DELIVERY' && (
                  <View style={styles.checkoutSection}>
                    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Thông tin giao hàng</Text>
                    <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled showsVerticalScrollIndicator={true}>
                      <View style={styles.tableGrid}>
                        {deliveryPartners.map(partner => <Pressable key={partner.id} accessibilityRole="radio" accessibilityState={{ selected: selectedDeliveryPartnerId === partner.id }} onPress={() => { setSelectedDeliveryPartnerId(partner.id); setSubmitError(null); }} style={({ pressed }) => [styles.tableButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase, borderColor: theme.borderSubtle }, selectedDeliveryPartnerId === partner.id && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}><Text style={[styles.tableNumber, { color: selectedDeliveryPartnerId === partner.id ? theme.primary : theme.textPrimary }]}>{partner.name}</Text><Text style={[styles.tableStatus, { color: theme.textSecondary }]}>{partner.code}{partner.phone ? ` · ${partner.phone}` : ''}</Text></Pressable>)}
                      </View>
                    </ScrollView>
                    {deliveryPartners.length === 0 && <InlineAlert message="Chưa có đối tác giao hàng đang hoạt động." tone="warning" />}
                    <TextInput accessibilityLabel="Địa chỉ giao hàng" value={deliveryAddress} onChangeText={setDeliveryAddress} placeholder="Địa chỉ giao hàng" placeholderTextColor={theme.textSecondary} style={[styles.deliveryInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]} />
                    <TextInput accessibilityLabel="Phí giao hàng" value={deliveryFeeText} onChangeText={value => setDeliveryFeeText(value.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder="Phí giao hàng" placeholderTextColor={theme.textSecondary} style={[styles.deliveryInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]} />
                    <Text style={[styles.tableStatus, { color: theme.textSecondary }]}>Tổng đơn giao: {formatVND(checkoutTotal)} (VAT chỉ tính trên tiền món)</Text>
                  </View>
                )}

                {submitError && <InlineAlert title="Chưa thể gửi đơn" message={submitError} />}
                <Button testID="btn-confirm-order" variant="primary" label="Gửi đơn xuống bếp" loading={isSubmitting} onPress={() => void handleConfirmOrder()} />
              </ScrollView>
            )}
          </Surface>
        </View>
      </Modal>

      <ModifierModal visible={isModifierModalOpen} item={selectedMenuItemForModal} onClose={closeModifierModal} onAddToCart={(item, quantity, modifiers, notes) => addToCart(item, quantity, modifiers, notes, safeDefaultCommissionEmployeeId)} />
      <ReceiptModal visible={isReceiptModalOpen} order={createdOrder} onClose={() => setIsReceiptModalOpen(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  workspace: { flex: 1, flexDirection: 'row' },
  catalogPane: { flex: 1, minWidth: 0 },
  catalogHeader: { paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  mobileCartStatus: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  mobileCartStatusTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  mobileCartStatusCount: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  centerContainer: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xl },
  loadingText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  listContentWithCart: { paddingBottom: 112 },
  menuRow: { gap: spacing.md },
  cartPanel: { borderLeftWidth: 1, borderRadius: 0, width: 360 },
  cartHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 76, padding: spacing.lg },
  cartHeadingCopy: { gap: 2 },
  cartHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  cartTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  cartCount: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  cartItems: { flex: 1 },
  cartItemsContent: { paddingHorizontal: spacing.lg },
  cartItem: { borderBottomWidth: 1, gap: spacing.sm, paddingVertical: spacing.lg },
  cartItemTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  cartItemCopy: { flex: 1, gap: 2 },
  cartItemName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  cartItemMeta: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  iconAction: { alignItems: 'center', borderRadius: radii.sm, height: 44, justifyContent: 'center', width: 44 },
  cartItemBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  quantityControls: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  quantityButton: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  quantityValue: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, minWidth: 24, textAlign: 'center' },
  cartItemPrice: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, fontVariant: [...typography.numeric.fontVariant] },
  cartTotals: { borderTopWidth: 1, gap: spacing.sm, padding: spacing.lg },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  totalValue: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm, fontVariant: [...typography.numeric.fontVariant] },
  grandTotalRow: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  grandTotalLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  grandTotalValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xxl, fontVariant: [...typography.numeric.fontVariant] },
  mobileCartSummary: { alignItems: 'center', bottom: spacing.md, flexDirection: 'row', gap: spacing.md, left: spacing.md, padding: spacing.sm, position: 'absolute', right: spacing.md },
  mobileCartSummaryCopy: { flex: 1, paddingLeft: spacing.xs },
  mobileCartLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  mobileCartTotal: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, fontVariant: [...typography.numeric.fontVariant] },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalBackdropCentered: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  checkoutModal: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '92%', overflow: 'hidden', width: '100%' },
  checkoutModalWide: { borderBottomLeftRadius: radii.md, borderBottomRightRadius: radii.md, maxWidth: 620 },
  modalHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg },
  modalHeadingCopy: { flex: 1, gap: 2 },
  modalTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  modalSubtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  modalClose: { alignItems: 'center', borderRadius: radii.sm, height: 44, justifyContent: 'center', width: 44 },
  checkoutBody: { gap: spacing.lg, padding: spacing.lg },
  checkoutSection: { gap: spacing.sm },
  customerInput: { borderRadius: radii.sm, borderWidth: 1, minHeight: 44, paddingHorizontal: spacing.md },
  customerSuggestion: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 48, paddingVertical: spacing.xs },
  selectedCustomer: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 54, paddingHorizontal: spacing.md },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  orderTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: spacing.touchTargetPOS, paddingHorizontal: spacing.md },
  typeButtonText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  tableList: { gap: spacing.sm, paddingBottom: spacing.xs },
  tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.xs },
  tableButton: { borderRadius: radii.md, borderWidth: 1, minHeight: spacing.touchTargetPOS, minWidth: 104, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tableNumber: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  tableStatus: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  deliveryInput: { borderRadius: radii.sm, borderWidth: 1, fontFamily: typography.families.body, minHeight: 44, paddingHorizontal: spacing.md },
  successPanel: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  successTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, textAlign: 'center' },
  successDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, maxWidth: 420, textAlign: 'center' },
  successActionsRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.md, width: '100%' },
  posVoucherBadge: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.sm
  },
  posVoucherRemoveBtn: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  posVoucherInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  posVoucherInput: {
    borderRadius: radii.sm,
    borderWidth: 1,
    flex: 1,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs,
    height: 36,
    paddingHorizontal: spacing.sm
  }
});

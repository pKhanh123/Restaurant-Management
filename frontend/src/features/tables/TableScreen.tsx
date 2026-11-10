import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
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
  ArrowRightLeft,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  CreditCard,
  Landmark,
  LayoutGrid,
  List,
  RefreshCw,
  Trash2,
  Users,
  X
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { DiningTableDto, OrderStatus, PaymentMethod, TableStatus } from '../../api/contracts';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { CashbookAccountChoice } from '../cashbook/CashbookAccountChoice';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { elevation, radii, spacing, statusColors, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
import type { StatusTone } from '../../ui';
import { TableManagementScreen } from './TableManagementScreen';

type TableFilter = 'ALL' | 'AVAILABLE' | 'OCCUPIED' | 'CLEANING';

const formatVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const formatTableNumber = (value: number) => value.toString().padStart(2, '0');

const formatElapsed = (createdAt?: string) => {
  if (!createdAt) return null;
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return 'Vừa tạo';
  if (minutes < 60) return minutes + ' phút';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? hours + ' giờ ' + remainder + ' phút' : hours + ' giờ';
};

const tableStatusConfig = (status: TableStatus): { label: string; tone: StatusTone } => {
  if (status === 'AVAILABLE') return { label: 'Sẵn sàng', tone: 'success' };
  if (status === 'OCCUPIED') return { label: 'Đang phục vụ', tone: 'danger' };
  return { label: 'Chờ dọn', tone: 'warning' };
};

const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING: 'Chờ chế biến',
  PREPARING: 'Đang chế biến',
  READY: 'Sẵn sàng phục vụ',
  COMPLETED: 'Đã hoàn tất',
  CANCELLED: 'Đã hủy'
};

const orderStatusTones: Record<OrderStatus, StatusTone> = {
  PENDING: 'warning',
  PREPARING: 'info',
  READY: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'danger'
};

const paymentOptions: Array<{ value: PaymentMethod; label: string; icon: LucideIcon }> = [
  { value: 'CASH', label: 'Tiền mặt', icon: Banknote },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản', icon: Landmark },
  { value: 'CREDIT_CARD', label: 'Thẻ', icon: CreditCard }
];

export const TableScreen: React.FC = () => {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const { tables, isLoadingTables, fetchTables, payOrder, updateTableStatus, transferTable, voidOrder } = useRestaurant();

  const [filter, setFilter] = useState<TableFilter>('ALL');
  const [workspaceMode, setWorkspaceMode] = useState<'OPERATIONS' | 'MANAGEMENT'>('OPERATIONS');
  const [selectedTable, setSelectedTable] = useState<DiningTableDto | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [financialAccountId, setFinancialAccountId] = useState<number | null>(null);
  const [isProcessingPay, setIsProcessingPay] = useState(false);
  const [paySuccessMsg, setPaySuccessMsg] = useState<string | null>(null);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isProcessingVoid, setIsProcessingVoid] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [isProcessingClean, setIsProcessingClean] = useState(false);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [targetTableId, setTargetTableId] = useState<number | null>(null);
  const [isProcessingTransfer, setIsProcessingTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const orderScrollRef = useRef<ScrollView>(null);

  const scrollOrders = useCallback((offset: number) => {
    if (orderScrollRef.current) {
      if (Platform.OS === 'web') {
        const node = (orderScrollRef.current as any)?.getScrollableNode?.() || orderScrollRef.current;
        if (node && typeof node.scrollLeft === 'number') {
          if (typeof node.scrollBy === 'function') {
            node.scrollBy({ left: offset, behavior: 'smooth' });
          } else {
            node.scrollLeft += offset;
          }
          return;
        }
      }
      orderScrollRef.current?.scrollTo({ x: offset > 0 ? 300 : 0, animated: true });
    }
  }, []);

  const counts = useMemo(() => ({
    all: tables.length,
    available: tables.filter((table) => table.status === 'AVAILABLE').length,
    occupied: tables.filter((table) => table.status === 'OCCUPIED').length,
    cleaning: tables.filter((table) => table.status === 'DIRTY' || table.status === 'NEED_CLEANING').length
  }), [tables]);

  const filteredTables = useMemo(() => tables.filter((table) => {
    if (filter === 'ALL') return true;
    if (filter === 'CLEANING') return table.status === 'DIRTY' || table.status === 'NEED_CLEANING';
    return table.status === filter;
  }), [filter, tables]);

  const activeOrder =
    selectedTable?.orders?.find((order) => order.id === selectedOrderId) ||
    selectedTable?.orders?.[0];
  const isSelectedTableDirty =
    selectedTable?.status === 'DIRTY' || selectedTable?.status === 'NEED_CLEANING';
  const isNarrow = width < 768;
  const cardWidth = width >= 1200 ? '23.5%' : width >= 768 ? '31.8%' : '48%';

  const handleTablePress = (table: DiningTableDto) => {
    setSelectedTable(table);
    setSelectedOrderId(table.orders?.[0]?.id ?? null);
    setIsDetailModalOpen(true);
    setPaySuccessMsg(null);
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setPaySuccessMsg(null);
  };

  const handlePay = async () => {
    if (!selectedTable?.orders || !activeOrder) return;
    setIsProcessingPay(true);
    const result = await payOrder(activeOrder.id, paymentMethod, financialAccountId);
    setIsProcessingPay(false);

    if (!result.success) {
      showToast({
        type: 'error',
        title: 'Thanh toán thất bại',
        message: result.error || 'Vui lòng kiểm tra lại phương thức thanh toán.'
      });
      return;
    }

    const remainingOrders = selectedTable.orders.filter((order) => order.id !== activeOrder.id);
    const nextOrder = remainingOrders[0];
    setSelectedTable({
      ...selectedTable,
      orders: remainingOrders,
      status: nextOrder ? 'OCCUPIED' : 'AVAILABLE',
      currentOrderId: nextOrder?.id ?? null
    });
    setSelectedOrderId(nextOrder?.id ?? null);
    const successText = nextOrder
      ? 'Đã thanh toán đơn ' + activeOrder.code + '. Bàn ' + formatTableNumber(selectedTable.tableNumber) + ' còn ' + remainingOrders.length + ' đơn chưa thanh toán.'
      : 'Đã thanh toán đơn ' + activeOrder.code + '. Bàn ' + formatTableNumber(selectedTable.tableNumber) + ' đã hoàn tất.';
    setPaySuccessMsg(successText);
    showToast({
      type: 'success',
      title: 'Thanh toán thành công! 💳',
      message: successText
    });
    if (!nextOrder) {
      setTimeout(() => {
        setIsDetailModalOpen(false);
        setSelectedTable(null);
      }, 1500);
    }
  };

  const handleCleanTable = async (tableId: number) => {
    setIsProcessingClean(true);
    const result = await updateTableStatus(tableId, 'AVAILABLE');
    setIsProcessingClean(false);
    if (result.success) {
      if (selectedTable?.id === tableId) {
        setSelectedTable((previous) => previous ? { ...previous, status: 'AVAILABLE' } : null);
        setPaySuccessMsg('Đã dọn bàn. Bàn sẵn sàng đón khách mới.');
      }
      showToast({
        type: 'success',
        message: 'Đã dọn dẹp xong! Bàn sẵn sàng đón khách mới.'
      });
    } else {
      showToast({
        type: 'error',
        title: 'Thao tác không thành công',
        message: result.error || 'Không thể cập nhật trạng thái bàn'
      });
    }
  };

  const handleMarkTableDirty = async (tableId: number) => {
    setIsProcessingClean(true);
    const result = await updateTableStatus(tableId, 'DIRTY');
    setIsProcessingClean(false);
    if (result.success) {
      if (selectedTable?.id === tableId) {
        setSelectedTable((previous) => previous ? { ...previous, status: 'DIRTY' } : null);
        setPaySuccessMsg('Đã chuyển bàn sang trạng thái chờ dọn.');
      }
      showToast({
        type: 'info',
        message: 'Đã chuyển bàn sang trạng thái Chờ dọn bàn.'
      });
    } else {
      showToast({
        type: 'error',
        title: 'Thao tác không thành công',
        message: result.error || 'Không thể cập nhật trạng thái bàn'
      });
    }
  };

  const handleOpenVoidModal = () => {
    setVoidReason('');
    setVoidError(null);
    setIsVoidModalOpen(true);
  };

  const handleOpenTransferModal = () => {
    setTargetTableId(null);
    setTransferError(null);
    setIsTransferModalOpen(true);
  };

  const handleConfirmTransfer = async () => {
    if (!selectedTable || !targetTableId) return;
    setIsProcessingTransfer(true);
    setTransferError(null);

    const result = await transferTable(selectedTable.id, targetTableId);
    setIsProcessingTransfer(false);

    if (!result.success) {
      setTransferError(result.error || 'Chuyển bàn thất bại');
      showToast({
        type: 'error',
        title: 'Chuyển bàn thất bại',
        message: result.error || 'Vui lòng kiểm tra lại.'
      });
      return;
    }

    const targetTable = tables.find((t) => t.id === targetTableId);
    showToast({
      type: 'success',
      title: 'Chuyển bàn thành công! 🔀',
      message: `Đã chuyển toàn bộ đơn từ Bàn ${formatTableNumber(selectedTable.tableNumber)} sang Bàn ${targetTable ? formatTableNumber(targetTable.tableNumber) : targetTableId}.`
    });

    setIsTransferModalOpen(false);
    setIsDetailModalOpen(false);
    setSelectedTable(null);
  };

  const handleConfirmVoid = async () => {
    if (!activeOrder) return;
    if (voidReason.trim().length < 3) {
      setVoidError('Lý do hủy đơn phải có ít nhất 3 ký tự');
      return;
    }

    setIsProcessingVoid(true);
    setVoidError(null);
    const result = await voidOrder(activeOrder.id, voidReason.trim());
    setIsProcessingVoid(false);
    if (!result.success) {
      setVoidError(result.error || 'Hủy đơn hàng thất bại');
      showToast({
        type: 'error',
        title: 'Hủy đơn thất bại',
        message: result.error || 'Vui lòng kiểm tra quyền hạn và thử lại.'
      });
      return;
    }

    const remainingOrders = selectedTable?.orders?.filter((order) => order.id !== activeOrder.id) || [];
    const nextOrder = remainingOrders[0];
    setIsVoidModalOpen(false);
    setSelectedTable((previous) => previous ? {
      ...previous,
      orders: remainingOrders,
      status: nextOrder ? 'OCCUPIED' : 'AVAILABLE',
      currentOrderId: nextOrder?.id ?? null
    } : null);
    setSelectedOrderId(nextOrder?.id ?? null);
    const voidSuccessText = nextOrder
      ? 'Đã hủy đơn ' + activeOrder.code + '. Bàn ' + formatTableNumber(selectedTable?.tableNumber || 0) + ' còn ' + remainingOrders.length + ' đơn chưa thanh toán.'
      : 'Đã hủy đơn ' + activeOrder.code + '. Bàn ' + formatTableNumber(selectedTable?.tableNumber || 0) + ' đã sẵn sàng.';
    setPaySuccessMsg(voidSuccessText);
    showToast({
      type: 'warning',
      title: 'Đã hủy đơn hàng',
      message: voidSuccessText
    });
    if (!nextOrder) {
      setTimeout(() => {
        setIsDetailModalOpen(false);
        setSelectedTable(null);
      }, 1800);
    }
  };

  const filters: Array<{ key: TableFilter; label: string }> = [
    { key: 'ALL', label: 'Tất cả (' + counts.all + ')' },
    { key: 'AVAILABLE', label: 'Bàn trống (' + counts.available + ')' },
    { key: 'OCCUPIED', label: 'Đang phục vụ (' + counts.occupied + ')' },
    { key: 'CLEANING', label: 'Chờ dọn (' + counts.cleaning + ')' }
  ];

  const workspaceTabs = user?.role === 'ADMIN' ? <View style={[styles.workspaceTabs, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
    <Button variant={workspaceMode === 'OPERATIONS' ? 'primary' : 'quiet'} label="Sơ đồ phục vụ" icon={LayoutGrid} onPress={() => setWorkspaceMode('OPERATIONS')} />
    <Button variant={workspaceMode === 'MANAGEMENT' ? 'primary' : 'quiet'} label="Danh sách phòng/bàn" icon={List} onPress={() => setWorkspaceMode('MANAGEMENT')} />
  </View> : null;

  if (user?.role === 'ADMIN' && workspaceMode === 'MANAGEMENT') {
    return <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>{workspaceTabs}<TableManagementScreen /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      {workspaceTabs}
      <View style={[styles.header, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <ScreenHeader
          title="Sơ đồ bàn"
          description="Theo dõi bàn trống, đơn đang phục vụ và bàn cần dọn."
          actions={<Button variant="quiet" label="Làm mới" icon={RefreshCw} onPress={() => void fetchTables()} />}
        />
      </View>

      <View style={[styles.filterToolbar, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {filters.map((item) => {
            const selected = filter === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                onPress={() => setFilter(item.key)}
                style={({ pressed }) => [
                  styles.filterButton,
                  {
                    backgroundColor: selected
                      ? theme.interactivePrimary
                      : pressed ? theme.surfaceSunken : theme.surfaceBase,
                    borderColor: selected ? theme.interactivePrimary : theme.borderSubtle
                  }
                ]}
              >
                <Text style={[styles.filterLabel, { color: selected ? theme.textInverse : theme.textPrimary }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoadingTables ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang tải sơ đồ bàn...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.gridContainer}>
          {filteredTables.length === 0 ? (
            <View style={styles.emptyFilter}>
              <EmptyState title="Không có bàn phù hợp" description="Chọn trạng thái khác để xem các bàn đang vận hành." />
            </View>
          ) : filteredTables.map((table) => {
            const status = tableStatusConfig(table.status);
            const palette = statusColors.table[table.status];
            const unpaidOrders = table.orders || [];
            const unpaidTotal = unpaidOrders.reduce((sum, order) => sum + order.finalAmount, 0);
            const oldestOrder = [...unpaidOrders].sort(
              (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
            )[0];
            const elapsed = formatElapsed(oldestOrder?.createdAt);
            const isDirty = table.status === 'DIRTY' || table.status === 'NEED_CLEANING';

            return (
              <Pressable
                testID={'table-card-' + table.tableNumber}
                key={table.id}
                accessibilityRole="button"
                accessibilityLabel={'Bàn ' + formatTableNumber(table.tableNumber) + ', ' + status.label}
                onPress={() => handleTablePress(table)}
                style={({ pressed }) => [
                  styles.tableCard,
                  {
                    backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase,
                    borderColor: theme.borderSubtle,
                    borderLeftColor: palette.border,
                    width: cardWidth
                  }
                ]}
              >
                <View style={styles.tableCardHeader}>
                  <View>
                    <Text style={[styles.tableLabel, { color: theme.textSecondary }]}>Bàn</Text>
                    <Text style={[styles.tableNumber, { color: theme.textPrimary }]}>
                      {formatTableNumber(table.tableNumber)}
                    </Text>
                  </View>
                  <StatusBadge tone={status.tone} label={status.label} />
                </View>

                <View style={styles.capacityRow}>
                  <AppIcon icon={Users} color={theme.textSecondary} size={17} />
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}>{table.capacity} chỗ</Text>
                </View>

                <View style={[styles.tableDivider, { backgroundColor: theme.borderSubtle }]} />

                {unpaidOrders.length > 0 ? (
                  <View style={styles.orderSummary}>
                    <Text style={[styles.orderCount, { color: theme.textSecondary }]}>
                      {unpaidOrders.length} đơn chưa thanh toán
                    </Text>
                    <Text style={[styles.orderTotal, { color: theme.textPrimary }]}>{formatVND(unpaidTotal)}</Text>
                    {elapsed && (
                      <View style={styles.elapsedRow}>
                        <AppIcon icon={Clock3} color={theme.textSecondary} size={15} />
                        <Text style={[styles.elapsedText, { color: theme.textSecondary }]}>{elapsed}</Text>
                      </View>
                    )}
                  </View>
                ) : isDirty ? (
                  <View style={styles.cleaningSummary}>
                    <Text style={[styles.guidanceText, { color: theme.textSecondary }]}>Cần xác nhận sau khi dọn xong.</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={'Đánh dấu đã dọn bàn ' + formatTableNumber(table.tableNumber)}
                      onPress={(event) => {
                        event.stopPropagation();
                        void handleCleanTable(table.id);
                      }}
                      style={({ pressed }) => [
                        styles.inlineAction,
                        { backgroundColor: pressed ? theme.interactiveSecondaryPressed : theme.interactiveSecondary }
                      ]}
                    >
                      <CircleCheck color={theme.textPrimary} size={16} />
                      <Text style={[styles.inlineActionText, { color: theme.textPrimary }]}>Đã dọn</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={[styles.guidanceText, { color: theme.textSecondary }]}>Sẵn sàng đón khách.</Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={isDetailModalOpen} transparent animationType="slide" onRequestClose={closeDetailModal}>
        <View style={[styles.modalBackdrop, isNarrow && styles.modalBackdropNarrow, { backgroundColor: theme.overlay }]}>
          <SafeAreaView
            testID="table-detail-modal"
            style={[
              styles.modalContainer,
              isNarrow && styles.modalContainerNarrow,
              { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.modalHeading}>
                <Text testID="table-detail-title" style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  Bàn {formatTableNumber(selectedTable?.tableNumber || 0)}
                </Text>
                {selectedTable && (
                  <StatusBadge
                    tone={tableStatusConfig(selectedTable.status).tone}
                    label={tableStatusConfig(selectedTable.status).label}
                  />
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng chi tiết bàn"
                onPress={closeDetailModal}
                style={({ pressed }) => [
                  styles.iconButton,
                  {
                    backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet,
                    borderColor: theme.borderSubtle
                  }
                ]}
              >
                <AppIcon icon={X} color={theme.textPrimary} size={20} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              {paySuccessMsg && <InlineAlert tone="success" title="Đã cập nhật" message={paySuccessMsg} />}

              {activeOrder ? (
                <View style={styles.detailSections}>
                  {(selectedTable?.orders?.length || 0) > 1 && (
                    <View style={styles.detailSection}>
                      <View style={styles.orderSelectorHeader}>
                        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                          Đơn tại bàn ({selectedTable?.orders?.length} đơn)
                        </Text>
                        {(selectedTable?.orders?.length || 0) > 2 && (
                          <View style={styles.orderScrollControls}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Cuộn đơn sang trái"
                              onPress={() => scrollOrders(-180)}
                              style={({ pressed }) => [
                                styles.orderNavBtn,
                                {
                                  backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase,
                                  borderColor: theme.borderSubtle
                                }
                              ]}
                            >
                              <AppIcon icon={ChevronLeft} color={theme.textPrimary} size={15} />
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Cuộn đơn sang phải"
                              onPress={() => scrollOrders(180)}
                              style={({ pressed }) => [
                                styles.orderNavBtn,
                                {
                                  backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase,
                                  borderColor: theme.borderSubtle
                                }
                              ]}
                            >
                              <AppIcon icon={ChevronRight} color={theme.textPrimary} size={15} />
                            </Pressable>
                          </View>
                        )}
                      </View>
                      <View
                        style={styles.orderSelectorRow}
                        {...(Platform.OS === 'web'
                          ? {
                              onWheel: (e: any) => {
                                const delta = e.deltaY || e.deltaX;
                                if (delta && orderScrollRef.current) {
                                  const node = (orderScrollRef.current as any)?.getScrollableNode?.() || orderScrollRef.current;
                                  if (node && typeof node.scrollLeft === 'number') {
                                    node.scrollLeft += delta;
                                  }
                                }
                              }
                            }
                          : {})}
                      >
                        <ScrollView
                          ref={orderScrollRef}
                          horizontal
                          showsHorizontalScrollIndicator={true}
                          contentContainerStyle={styles.orderSelectorContent}
                        >
                          {selectedTable?.orders?.map((order) => {
                            const selected = activeOrder.id === order.id;
                            return (
                              <Pressable
                                key={order.id}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                onPress={() => {
                                  setSelectedOrderId(order.id);
                                  setPaySuccessMsg(null);
                                }}
                                style={({ pressed }) => [
                                  styles.orderSelectorButton,
                                  {
                                    backgroundColor: selected
                                      ? theme.interactiveSecondary
                                      : pressed ? theme.surfaceSunken : theme.surfaceBase,
                                    borderColor: selected ? theme.primary : theme.borderSubtle
                                  }
                                ]}
                              >
                                <Text style={[styles.orderSelectorText, { color: selected ? theme.primary : theme.textPrimary }]}>
                                  {order.code} · {formatVND(order.finalAmount)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>
                    </View>
                  )}

                  <Surface level="sunken" style={styles.orderIdentity}>
                    <View style={styles.orderIdentityCopy}>
                      <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Mã đơn</Text>
                      <Text style={[styles.orderCode, { color: theme.textPrimary }]}>{activeOrder.code}</Text>
                    </View>
                    <View style={styles.orderIdentityStatus}>
                      <StatusBadge tone={orderStatusTones[activeOrder.status]} label={orderStatusLabels[activeOrder.status]} />
                      <View style={styles.elapsedRow}>
                        <Clock3 color={theme.textSecondary} size={15} />
                        <Text style={[styles.elapsedText, { color: theme.textSecondary }]}>
                          {formatElapsed(activeOrder.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </Surface>

                  <View style={styles.detailSection}>
                    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Món đã gọi</Text>
                    <View style={[styles.sectionPanel, { borderColor: theme.borderSubtle }]}>
                      {activeOrder.items?.map((item, index) => (
                        <View
                          key={item.id || String(item.menuItemId) + '-' + index}
                          style={[styles.itemRow, index > 0 && { borderTopColor: theme.borderSubtle, borderTopWidth: 1 }]}
                        >
                          <View style={styles.itemCopy}>
                            <Text style={[styles.itemName, { color: theme.textPrimary }]}>
                              {item.quantity} × {item.menuItemName || 'Món #' + item.menuItemId}
                            </Text>
                            {item.notes && (
                              <Text style={[styles.itemNote, { color: theme.textSecondary }]}>Ghi chú: {item.notes}</Text>
                            )}
                          </View>
                          <Text style={[styles.itemAmount, { color: theme.textPrimary }]}>{formatVND(item.subtotal)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Thanh toán</Text>
                    <View style={[styles.sectionPanel, { borderColor: theme.borderSubtle }]}>
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Tạm tính</Text>
                        <Text style={[styles.summaryValue, { color: theme.textPrimary }]}>{formatVND(activeOrder.totalAmount)}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>VAT (8%)</Text>
                        <Text style={[styles.summaryValue, { color: theme.textPrimary }]}>{formatVND(activeOrder.vatAmount)}</Text>
                      </View>
                      <View style={[styles.totalRow, { borderTopColor: theme.borderSubtle }]}>
                        <Text style={[styles.totalLabel, { color: theme.textPrimary }]}>Tổng thanh toán</Text>
                        <Text style={[styles.totalAmount, { color: theme.primary }]}>{formatVND(activeOrder.finalAmount)}</Text>
                      </View>
                    </View>

                    <View style={styles.paymentMethods}>
                      {paymentOptions.map((option) => {
                        const selected = paymentMethod === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            accessibilityRole="radio"
                            accessibilityLabel={option.label}
                            accessibilityState={{ checked: selected }}
                            onPress={() => setPaymentMethod(option.value)}
                            style={({ pressed }) => [
                              styles.paymentMethod,
                              {
                                backgroundColor: selected
                                  ? theme.interactiveSecondary
                                  : pressed ? theme.surfaceSunken : theme.surfaceBase,
                                borderColor: selected ? theme.primary : theme.borderSubtle
                              }
                            ]}
                          >
                            <AppIcon icon={option.icon} color={selected ? theme.primary : theme.textSecondary} size={19} />
                            <Text style={[styles.paymentMethodLabel, { color: selected ? theme.primary : theme.textPrimary }]}>
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <CashbookAccountChoice token={token} paymentMethod={paymentMethod} value={financialAccountId} onChange={setFinancialAccountId} />
                  </View>
                </View>
              ) : isSelectedTableDirty ? (
                <EmptyState
                  title="Bàn đang chờ dọn"
                  description="Dọn sạch bàn ghế, sau đó xác nhận để bàn sẵn sàng đón khách mới."
                />
              ) : (
                <EmptyState
                  title="Bàn đang trống"
                  description="Khách có thể quét mã QR tại bàn hoặc thu ngân có thể tạo đơn mới."
                />
              )}
            </ScrollView>

            <View style={[styles.actionFooter, { backgroundColor: theme.surfaceBase, borderTopColor: theme.borderSubtle }]}>
              {activeOrder ? (
                <View style={[styles.footerActions, isNarrow && styles.footerActionsNarrow]}>
                  {(user?.role === 'CASHIER' || user?.role === 'ADMIN') && (
                    <View style={styles.footerButton}>
                      <Button
                        testID="btn-open-transfer-modal"
                        variant="secondary"
                        label="Chuyển bàn 🔀"
                        icon={ArrowRightLeft}
                        disabled={isProcessingPay || isProcessingVoid || isProcessingTransfer}
                        onPress={handleOpenTransferModal}
                      />
                    </View>
                  )}
                  {user?.role === 'ADMIN' && (
                    <View style={styles.footerButton}>
                      <Button
                        testID="btn-open-void-modal"
                        variant="danger"
                        label="Hủy đơn"
                        icon={Trash2}
                        disabled={isProcessingPay || isProcessingVoid || isProcessingTransfer}
                        onPress={handleOpenVoidModal}
                      />
                    </View>
                  )}
                  <View style={styles.footerButtonPrimary}>
                    <Button
                      testID="btn-confirm-pay"
                      variant="primary"
                      label={'Thu ' + formatVND(activeOrder.finalAmount)}
                      icon={CircleCheck}
                      loading={isProcessingPay}
                      disabled={isProcessingVoid}
                      onPress={() => void handlePay()}
                    />
                  </View>
                </View>
              ) : isSelectedTableDirty && selectedTable ? (
                <Button
                  testID="btn-confirm-clean-table"
                  variant="primary"
                  label="Đánh dấu đã dọn"
                  icon={CircleCheck}
                  loading={isProcessingClean}
                  onPress={() => void handleCleanTable(selectedTable.id)}
                />
              ) : selectedTable ? (
                <Button
                  variant="secondary"
                  label="Chuyển sang chờ dọn"
                  icon={CircleAlert}
                  loading={isProcessingClean}
                  onPress={() => void handleMarkTableDirty(selectedTable.id)}
                />
              ) : null}
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal visible={isVoidModalOpen} transparent animationType="fade" onRequestClose={() => setIsVoidModalOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
          <View style={[styles.voidModal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={styles.voidHeader}>
              <View style={[styles.dangerIcon, { backgroundColor: statusColors.danger.background }]}>
                <AppIcon icon={Trash2} color={statusColors.danger.text} size={22} />
              </View>
              <View style={styles.voidHeadingCopy}>
                <Text style={[styles.voidTitle, { color: theme.textPrimary }]}>Xác nhận hủy đơn</Text>
                <Text style={[styles.voidDescription, { color: theme.textSecondary }]}>
                  Thao tác được lưu vào nhật ký kiểm toán và không thể hoàn tác.
                </Text>
              </View>
            </View>

            <Surface level="sunken" style={styles.voidOrderSummary}>
              <View>
                <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Đơn cần hủy</Text>
                <Text style={[styles.voidOrderCode, { color: theme.textPrimary }]}>{activeOrder?.code}</Text>
              </View>
              <Text style={[styles.voidOrderAmount, { color: theme.danger }]}>
                {activeOrder ? formatVND(activeOrder.finalAmount) : ''}
              </Text>
            </Surface>

            <View style={styles.voidField}>
              <Text style={[styles.voidLabel, { color: theme.textPrimary }]}>Lý do hủy đơn</Text>
              <TextInput
                testID="input-void-reason"
                accessibilityLabel="Lý do hủy đơn"
                style={[
                  styles.voidInput,
                  {
                    backgroundColor: theme.surfaceSunken,
                    borderColor: voidError ? theme.danger : theme.borderStrong,
                    color: theme.textPrimary
                  }
                ]}
                placeholder="Ví dụ: Khách đổi ý hoặc nhập nhầm món"
                placeholderTextColor={theme.textSecondary}
                value={voidReason}
                onChangeText={(text) => {
                  setVoidReason(text);
                  if (voidError) setVoidError(null);
                }}
                multiline
                numberOfLines={3}
              />
              <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>Tối thiểu 3 ký tự.</Text>
            </View>

            {voidError && <InlineAlert message={voidError} />}

            <View style={[styles.voidActions, isNarrow && styles.voidActionsNarrow]}>
              <View style={styles.footerButton}>
                <Button
                  variant="quiet"
                  label="Giữ đơn"
                  disabled={isProcessingVoid}
                  onPress={() => setIsVoidModalOpen(false)}
                />
              </View>
              <View style={styles.footerButtonPrimary}>
                <Button
                  testID="btn-confirm-void"
                  variant="danger"
                  label="Xác nhận hủy đơn"
                  icon={Trash2}
                  loading={isProcessingVoid}
                  disabled={voidReason.trim().length < 3}
                  onPress={() => void handleConfirmVoid()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isTransferModalOpen} transparent animationType="fade" onRequestClose={() => setIsTransferModalOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
          <View style={[styles.voidModal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle, maxWidth: 520 }]}>
            <View style={styles.voidHeader}>
              <View style={[styles.dangerIcon, { backgroundColor: theme.interactiveSecondary }]}>
                <AppIcon icon={ArrowRightLeft} color={theme.primary} size={22} />
              </View>
              <View style={styles.voidHeadingCopy}>
                <Text style={[styles.voidTitle, { color: theme.textPrimary }]}>Chuyển Bàn Ăn 🔀</Text>
                <Text style={[styles.voidDescription, { color: theme.textSecondary }]}>
                  Chuyển đơn từ Bàn {selectedTable ? formatTableNumber(selectedTable.tableNumber) : ''} sang bàn trống mới.
                </Text>
              </View>
            </View>

            <Surface level="sunken" style={styles.voidOrderSummary}>
              <View>
                <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Bàn hiện tại</Text>
                <Text style={[styles.voidOrderCode, { color: theme.textPrimary }]}>
                  Bàn {selectedTable ? formatTableNumber(selectedTable.tableNumber) : ''} ({selectedTable?.orders?.length || 0} đơn)
                </Text>
              </View>
              <Text style={[styles.voidOrderAmount, { color: theme.primary }]}>
                {selectedTable?.orders ? formatVND(selectedTable.orders.reduce((sum, o) => sum + o.finalAmount, 0)) : ''}
              </Text>
            </Surface>

            <View style={styles.voidField}>
              <Text style={[styles.voidLabel, { color: theme.textPrimary }]}>Chọn bàn đích (chỉ hiển thị bàn trống)</Text>
              {tables.filter((t) => t.id !== selectedTable?.id && t.status === 'AVAILABLE').length === 0 ? (
                <InlineAlert message="Hiện tại không có bàn nào đang trống (AVAILABLE) để chuyển sang. Vui lòng dọn bàn hoặc đợi bàn khác thanh toán xong." />
              ) : (
                <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={styles.transferGrid}>
                  {tables
                    .filter((t) => t.id !== selectedTable?.id && t.status === 'AVAILABLE')
                    .map((target) => {
                      const isSelected = targetTableId === target.id;
                      return (
                        <Pressable
                          key={target.id}
                          testID={`target-table-${target.tableNumber}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Chọn Bàn ${formatTableNumber(target.tableNumber)}`}
                          onPress={() => setTargetTableId(target.id)}
                          style={[
                            styles.transferTableCard,
                            {
                              borderColor: isSelected ? theme.primary : theme.borderSubtle,
                              backgroundColor: isSelected ? theme.interactiveSecondary : theme.surfaceSunken
                            }
                          ]}
                        >
                          <Text style={[styles.transferTableNum, { color: isSelected ? theme.primary : theme.textPrimary }]}>
                            Bàn {formatTableNumber(target.tableNumber)}
                          </Text>
                          <Text style={[styles.transferTableCap, { color: theme.textSecondary }]}>
                            {target.capacity} chỗ ngồi
                          </Text>
                        </Pressable>
                      );
                    })}
                </ScrollView>
              )}
            </View>

            {transferError && <InlineAlert message={transferError} />}

            <View style={[styles.voidActions, isNarrow && styles.voidActionsNarrow]}>
              <View style={styles.footerButton}>
                <Button
                  variant="quiet"
                  label="Đóng"
                  disabled={isProcessingTransfer}
                  onPress={() => setIsTransferModalOpen(false)}
                />
              </View>
              <View style={styles.footerButtonPrimary}>
                <Button
                  testID="btn-confirm-transfer-submit"
                  variant="primary"
                  label={targetTableId ? `Chuyển sang Bàn ${formatTableNumber(tables.find(t => t.id === targetTableId)?.tableNumber || 0)}` : 'Chọn bàn đích'}
                  icon={ArrowRightLeft}
                  loading={isProcessingTransfer}
                  disabled={!targetTableId}
                  onPress={() => void handleConfirmTransfer()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  workspaceTabs: { borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  container: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  filterToolbar: { borderBottomWidth: 1 },
  filterContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  filterButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: spacing.touchTargetMobile,
    paddingHorizontal: spacing.lg
  },
  filterLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  centerContainer: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl },
  loadingText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, marginTop: spacing.md },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, padding: spacing.lg },
  emptyFilter: { width: '100%' },
  tableCard: {
    borderLeftWidth: 4,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 184,
    padding: spacing.md
  },
  tableCardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  tableLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  tableNumber: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xxl,
    fontVariant: [...typography.numeric.fontVariant],
    lineHeight: typography.lineHeights.xxl
  },
  capacityRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  metaText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  tableDivider: { height: 1 },
  orderSummary: { gap: spacing.xs },
  orderCount: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  orderTotal: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: [...typography.numeric.fontVariant]
  },
  elapsedRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  elapsedText: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs,
    fontVariant: [...typography.numeric.fontVariant]
  },
  cleaningSummary: { alignItems: 'flex-start', gap: spacing.sm },
  guidanceText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs
  },
  inlineAction: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: spacing.touchTargetMobile,
    paddingHorizontal: spacing.md
  },
  inlineActionText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  modalBackdrop: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.md },
  modalBackdropNarrow: { justifyContent: 'flex-end', padding: 0 },
  modalContainer: {
    borderRadius: radii.md,
    borderWidth: 1,
    maxHeight: '92%',
    maxWidth: 680,
    overflow: 'hidden',
    width: '100%',
    ...elevation.modal
  },
  modalContainerNarrow: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '96%' },
  modalHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg
  },
  modalHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modalTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: [...typography.numeric.fontVariant],
    lineHeight: typography.lineHeights.xl
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    height: spacing.touchTargetMobile,
    justifyContent: 'center',
    width: spacing.touchTargetMobile
  },
  modalBody: { flexShrink: 1 },
  modalBodyContent: { padding: spacing.lg },
  detailSections: { gap: spacing.lg },
  detailSection: { gap: spacing.sm },
  sectionTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md
  },
  orderSelectorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs
  },
  orderScrollControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  orderNavBtn: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  orderSelectorRow: {
    width: '100%'
  },
  orderSelectorContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs
  },
  orderSelectorButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: spacing.touchTargetMobile,
    paddingHorizontal: spacing.md
  },
  orderSelectorText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm,
    fontVariant: [...typography.numeric.fontVariant]
  },
  orderIdentity: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md },
  orderIdentityCopy: { gap: spacing.xs },
  orderIdentityStatus: { alignItems: 'flex-end', gap: spacing.xs },
  metaLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  orderCode: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    lineHeight: typography.lineHeights.xl
  },
  sectionPanel: {
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: spacing.md
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingVertical: spacing.md
  },
  itemCopy: { flex: 1, gap: spacing.xs },
  itemName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  itemNote: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs
  },
  itemAmount: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm,
    fontVariant: [...typography.numeric.fontVariant]
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md
  },
  summaryLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  summaryValue: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.sm,
    fontVariant: [...typography.numeric.fontVariant]
  },
  totalRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingVertical: spacing.md
  },
  totalLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  totalAmount: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: [...typography.numeric.fontVariant]
  },
  paymentMethods: { flexDirection: 'row', gap: spacing.sm },
  paymentMethod: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 64,
    paddingHorizontal: spacing.xs
  },
  paymentMethodLabel: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs,
    textAlign: 'center'
  },
  actionFooter: { borderTopWidth: 1, padding: spacing.md },
  footerActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  footerActionsNarrow: { alignItems: 'stretch', flexDirection: 'column-reverse' },
  footerButton: { flex: 1 },
  footerButtonPrimary: { flex: 2 },
  voidModal: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.lg,
    maxWidth: 520,
    padding: spacing.lg,
    width: '100%',
    ...elevation.modal
  },
  voidHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  dangerIcon: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: spacing.touchTargetMobile,
    justifyContent: 'center',
    width: spacing.touchTargetMobile
  },
  voidHeadingCopy: { flex: 1, gap: spacing.xs },
  voidTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    lineHeight: typography.lineHeights.xl
  },
  voidDescription: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm
  },
  voidOrderSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md
  },
  voidOrderCode: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  voidOrderAmount: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.lg,
    fontVariant: [...typography.numeric.fontVariant]
  },
  voidField: { gap: spacing.xs },
  voidLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  voidInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    minHeight: 88,
    padding: spacing.md,
    textAlignVertical: 'top'
  },
  fieldHint: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  voidActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  voidActionsNarrow: { alignItems: 'stretch', flexDirection: 'column-reverse' },
  transferGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  transferTableCard: {
    borderRadius: radii.md,
    borderWidth: 1.5,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '28%',
    flexGrow: 1
  },
  transferTableNum: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.md
  },
  transferTableCap: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs,
    marginTop: spacing.xs
  }
});

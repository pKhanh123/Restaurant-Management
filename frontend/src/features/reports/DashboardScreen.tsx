import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Gauge,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  Award,
  BarChart2,
  CreditCard,
  QrCode,
  Coins,
  FileDown
} from 'lucide-react-native';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  RefreshControl,
  SafeAreaView,
  useWindowDimensions
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { DailyReportDto, OrderDto } from '../../api/contracts';
import { brandColors, radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
import { ReceiptModal } from '../pos/ReceiptModal';
import { DatePickerModal } from './DatePickerModal';
import { createSalesReportPdfHtml } from './salesReportPdf';
import { exportHtmlAsPdf } from '../../lib/pdfExport';

function formatVietnamDate(dateObj: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(dateObj); // returns YYYY-MM-DD
}

function formatDisplayDateVN(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `Ngày ${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export const DashboardScreen: React.FC = () => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const { fetchDailyReport, kdsOrders } = useRestaurant();

  const [currentDateStr, setCurrentDateStr] = useState<string>(() => formatVietnamDate(new Date()));
  const [report, setReport] = useState<DailyReportDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Date Picker Modal State
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);

  // Receipt Modal State
  const [receiptOrder, setReceiptOrder] = useState<OrderDto | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);

  const isMobile = width < 768;
  const isTabletOrDesktop = width >= 1024;
  const todayVN = useMemo(() => formatVietnamDate(new Date()), []);
  const isToday = currentDateStr === todayVN;

  const loadReport = useCallback(
    async (date: string) => {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await fetchDailyReport(date);
      setIsLoading(false);
      if (res.success && res.report) {
        setReport(res.report);
      } else {
        setErrorMessage(res.error || 'Không thể tải dữ liệu báo cáo');
      }
    },
    [fetchDailyReport]
  );

  useEffect(() => {
    loadReport(currentDateStr);
  }, [currentDateStr, loadReport]);

  const handlePrevDay = () => {
    const current = new Date(`${currentDateStr}T12:00:00+07:00`);
    current.setDate(current.getDate() - 1);
    setCurrentDateStr(formatVietnamDate(current));
  };

  const handleNextDay = () => {
    if (isToday) return; // Không cho chọn ngày tương lai
    const current = new Date(`${currentDateStr}T12:00:00+07:00`);
    current.setDate(current.getDate() + 1);
    setCurrentDateStr(formatVietnamDate(current));
  };

  const handleToday = () => {
    setCurrentDateStr(todayVN);
  };

  // SOS Time formatting
  const prepMinutes = report ? Math.floor(report.averagePrepTimeSec / 60) : 0;
  const prepSeconds = report ? report.averagePrepTimeSec % 60 : 0;

  const getSOSTag = (sec: number): { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' } => {
    if (sec === 0) return { label: 'Chưa có dữ liệu', tone: 'neutral' };
    if (sec <= 180) return { label: 'Dưới 3 phút', tone: 'success' };
    if (sec <= 300) return { label: 'Trong 3–5 phút', tone: 'warning' };
    return { label: 'Trên 5 phút', tone: 'danger' };
  };

  const sosTag = getSOSTag(report?.averagePrepTimeSec || 0);

  // Completed sample orders from KDS store to preview receipt
  const completedOrders = kdsOrders.filter((o) => o.status === 'COMPLETED');
  const completedCount = report?.completedOrders || 0;
  const cancelledCount = report?.cancelledOrders || 0;
  const pendingCount = Math.max(0, (report?.totalOrders || 0) - completedCount - cancelledCount);
  const totalOrdersCount = report?.totalOrders || 0;
  const completionRate =
    totalOrdersCount > 0 ? Math.round((completedCount / totalOrdersCount) * 100) : 0;

  // Payment Breakdown data for Cash & Bank Reconciliation
  const cashData = report?.paymentBreakdown?.cash || { count: 0, total: 0 };
  const bankData = report?.paymentBreakdown?.bankTransfer || { count: 0, total: 0 };
  const otherPaymentData = report?.paymentBreakdown?.other || { count: 0, total: 0 };
  const totalPaidRevenue = cashData.total + bankData.total + otherPaymentData.total;
  const cashPercent = totalPaidRevenue > 0 ? Math.round((cashData.total / totalPaidRevenue) * 100) : 0;
  const bankPercent = totalPaidRevenue > 0 ? Math.round((bankData.total / totalPaidRevenue) * 100) : 0;

  const maxTopSellerQuantity = Math.max(1, ...(report?.topSellers || []).map((item) => item.quantitySold));
  const reportPalette = {
    completed: brandColors.success,
    pending: brandColors.warning,
    cancelled: brandColors.danger,
    ranking: brandColors.primary
  };

  const [selectedTopItem, setSelectedTopItem] = useState<{
    menuItemId: number;
    name: string;
    quantitySold: number;
    revenue: number;
  } | null>(null);

  useEffect(() => {
    if (report?.topSellers && report.topSellers.length > 0) {
      setSelectedTopItem(report.topSellers[0]);
    } else {
      setSelectedTopItem(null);
    }
  }, [report]);

  const barColors = [
    brandColors.primary,
    '#F97316',
    '#F59E0B',
    '#3B82F6',
    '#8B5CF6'
  ];

  const barData = (report?.topSellers || []).map((item, index) => {
    const isSelected = selectedTopItem?.menuItemId === item.menuItemId;
    return {
      value: item.quantitySold,
      label: item.name.length > 8 ? item.name.substring(0, 7) + '…' : item.name,
      frontColor: barColors[index % barColors.length],
      opacity: isSelected ? 1 : 0.75,
      topLabelComponent: () => (
        <Text
          style={{
            color: isSelected ? theme.primary : theme.textSecondary,
            fontSize: 11,
            fontFamily: typography.families.operationalBold,
            marginBottom: 4,
            textAlign: 'center'
          }}
        >
          {item.quantitySold}
        </Text>
      ),
      onPress: () => setSelectedTopItem(item)
    };
  });

  const openReceipt = (order: OrderDto) => {
    setReceiptOrder(order);
    setIsReceiptModalOpen(true);
  };

  const exportSalesReport = async () => {
    if (!report || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportHtmlAsPdf(createSalesReportPdfHtml(report), `Bao_cao_ban_hang_${report.date}.pdf`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Không thể xuất báo cáo PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      {/* Header Toolbar */}
      <View style={[styles.reportHeader, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <ScreenHeader
          title="Hiệu quả bán hàng"
          description="Số liệu theo ngày, tính trên các đơn đã hoàn tất."
          leading={<AppIcon icon={TrendingUp} color={theme.primary} size={22} />}
        />

        {/* Date & Action Controls */}
        <View style={[styles.dateToolbar, isMobile && styles.dateToolbarMobile]}>
          <View style={styles.dateSelector}>
            {/* Prev Day Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ngày trước"
              onPress={handlePrevDay}
              style={({ pressed }) => [
                styles.dateNavButton,
                { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }
              ]}
            >
              <AppIcon icon={ChevronLeft} color={theme.textPrimary} size={18} />
            </Pressable>

            {/* Date Display (Click to open DatePickerModal) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mở bảng chọn ngày"
              onPress={() => setIsDatePickerOpen(true)}
              style={({ pressed }) => [
                styles.dateDisplayTrigger,
                {
                  backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceCanvas,
                  borderColor: theme.borderSubtle
                }
              ]}
            >
              <View style={styles.dateLabelRow}>
                <AppIcon icon={CalendarDays} color={theme.primary} size={17} />
                <Text style={[styles.dateMainText, { color: theme.textPrimary }]}>
                  {formatDisplayDateVN(currentDateStr)}
                </Text>
                <AppIcon icon={ChevronDown} color={theme.textSecondary} size={15} />
              </View>
              <Text style={[styles.dateSubText, { color: theme.textSecondary }]}>
                {isToday ? 'Hôm nay · Chạm để đổi ngày' : 'Lịch sử · Chạm để đổi ngày'}
              </Text>
            </Pressable>

            {/* Next Day Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ngày sau"
              disabled={isToday}
              onPress={handleNextDay}
              style={({ pressed }) => [
                styles.dateNavButton,
                {
                  backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet,
                  opacity: isToday ? 0.35 : 1
                }
              ]}
            >
              <AppIcon icon={ChevronRight} color={theme.textPrimary} size={18} />
            </Pressable>
          </View>

          {/* Quick Actions */}
          <View style={styles.dateActions}>
            <Button
              testID="sales-report-pdf"
              variant="secondary"
              label="Xuất PDF"
              icon={FileDown}
              disabled={!report || isLoading}
              loading={isExportingPdf}
              onPress={exportSalesReport}
            />
            {!isToday && (
              <Button variant="quiet" label="Về hôm nay" onPress={handleToday} />
            )}
            <Button
              variant="secondary"
              label="Tải lại"
              icon={RefreshCw}
              loading={isLoading}
              onPress={() => void loadReport(currentDateStr)}
            />
          </View>
        </View>
      </View>
      {exportError ? <View style={styles.exportError}><InlineAlert title="Không thể xuất báo cáo PDF" message={exportError} /></View> : null}

      <ScrollView
        contentContainerStyle={[styles.scrollContent, isMobile && styles.scrollContentMobile]}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => loadReport(currentDateStr)} />
        }
      >
        {errorMessage && (
          <View style={styles.feedbackStack}>
            <InlineAlert
              title="Không thể tải báo cáo"
              message={`${errorMessage}. Kiểm tra kết nối rồi thử lại.`}
            />
            <View style={styles.retryButton}>
              <Button
                variant="secondary"
                label="Thử lại"
                icon={RefreshCw}
                onPress={() => void loadReport(currentDateStr)}
              />
            </View>
          </View>
        )}

        {/* 4 STANDARDIZED KPI METRIC CARDS */}
        <View style={[styles.kpiGrid, isMobile && styles.kpiGridMobile]}>
          {/* KPI 1: Doanh thu thuần */}
          <View testID="kpi-revenue" style={[styles.kpiCardWrapper, !isMobile && { flex: 1 }]}>
            <Surface
              level="raised"
              style={[
                styles.kpiCard,
                {
                  borderLeftColor: theme.primary,
                  borderLeftWidth: 4
                }
              ]}
            >
              <View style={styles.metricHeaderRow}>
                <Text style={[styles.metricTitle, { color: theme.textSecondary }]}>
                  Doanh thu thuần
                </Text>
                <View style={[styles.iconCircle, { backgroundColor: `${theme.primary}18` }]}>
                  <AppIcon icon={TrendingUp} color={theme.primary} size={18} />
                </View>
              </View>
              <Text style={[styles.revenueNumber, { color: theme.textPrimary }]}>
                {report ? report.totalRevenue.toLocaleString('vi-VN') : 0} đ
              </Text>
              <View style={styles.vatBadgeRow}>
                <StatusBadge tone="neutral" label="Đã gồm VAT 8%" />
              </View>
            </Surface>
          </View>

          {/* KPI 2: Tổng đơn hàng */}
          <View testID="kpi-orders" style={[styles.kpiCardWrapper, !isMobile && { flex: 1 }]}>
            <Surface level="raised" style={styles.kpiCard}>
              <View style={styles.metricHeaderRow}>
                <Text style={[styles.metricTitle, { color: theme.textSecondary }]}>
                  Tổng đơn hàng
                </Text>
                <View style={[styles.iconCircle, { backgroundColor: '#2563EB18' }]}>
                  <AppIcon icon={ReceiptText} color="#2563EB" size={18} />
                </View>
              </View>
              <Text style={[styles.metricNumber, { color: theme.textPrimary }]}>
                {report?.totalOrders || 0}
              </Text>
              <View style={styles.badgeRow}>
                <StatusBadge tone="success" label={`${completedCount} xong`} />
                <StatusBadge tone="danger" label={`${cancelledCount} hủy`} />
              </View>
            </Surface>
          </View>

          {/* KPI 3: Giá trị đơn TB (AOV) */}
          <View testID="kpi-aov" style={[styles.kpiCardWrapper, !isMobile && { flex: 1 }]}>
            <Surface level="raised" style={styles.kpiCard}>
              <View style={styles.metricHeaderRow}>
                <Text style={[styles.metricTitle, { color: theme.textSecondary }]}>
                  Giá trị đơn TB
                </Text>
                <View style={[styles.iconCircle, { backgroundColor: '#F59E0B18' }]}>
                  <AppIcon icon={Gauge} color="#F59E0B" size={18} />
                </View>
              </View>
              <Text style={[styles.metricNumber, { color: theme.textPrimary }]}>
                {report ? report.averageOrderValue.toLocaleString('vi-VN') : 0} đ
              </Text>
              <Text style={[styles.metricSubtext, { color: theme.textSecondary }]}>
                Tính trên mỗi đơn hoàn tất
              </Text>
            </Surface>
          </View>

          {/* KPI 4: Tốc độ phục vụ (SOS) */}
          <View testID="kpi-sos" style={[styles.kpiCardWrapper, !isMobile && { flex: 1 }]}>
            <Surface level="raised" style={styles.kpiCard}>
              <View style={styles.metricHeaderRow}>
                <Text style={[styles.metricTitle, { color: theme.textSecondary }]}>
                  Tốc độ phục vụ (SOS)
                </Text>
                <View style={[styles.iconCircle, { backgroundColor: `${brandColors.success}18` }]}>
                  <AppIcon icon={Clock3} color={brandColors.success} size={18} />
                </View>
              </View>
              <Text style={[styles.metricNumber, { color: theme.textPrimary }]}>
                {report && report.averagePrepTimeSec > 0 ? `${prepMinutes}p ${prepSeconds}s` : '--'}
              </Text>
              <StatusBadge tone={sosTag.tone} label={sosTag.label} />
            </Surface>
          </View>
        </View>

        {/* BALANCED 2-COLUMN DASHBOARD */}
        <View style={[styles.analysisSplit, !isTabletOrDesktop && styles.analysisSplitStacked]}>
          {/* CỘT TRÁI: VẬN HÀNH & ĐỐI SOÁT HÓA ĐƠN (~45%) */}
          <View style={[styles.leftAnalysisCol, !isTabletOrDesktop && styles.fullWidthCol]}>
            {/* 1. TỶ LỆ KẾT QUẢ ĐƠN HÀNG */}
            <Surface level="raised" style={styles.sectionSurface}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                    Kết quả đơn hàng
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                    Tỷ trọng hoàn tất, đang làm và hủy trong ngày.
                  </Text>
                </View>
                {totalOrdersCount > 0 && (
                  <View style={[styles.rateBadge, { backgroundColor: `${brandColors.success}18` }]}>
                    <Text style={[styles.rateBadgeText, { color: brandColors.success }]}>
                      {completionRate}% hoàn tất
                    </Text>
                  </View>
                )}
              </View>

              {report && report.totalOrders > 0 ? (
                <View style={styles.outcomeContent}>
                  {/* Segmented Bar */}
                  <View accessibilityLabel="Phân bổ kết quả đơn hàng" style={[styles.outcomeBar, { backgroundColor: theme.surfaceSunken }]}>
                    {completedCount > 0 && (
                      <View style={{ backgroundColor: reportPalette.completed, flex: completedCount }} />
                    )}
                    {pendingCount > 0 && (
                      <View style={{ backgroundColor: reportPalette.pending, flex: pendingCount }} />
                    )}
                    {cancelledCount > 0 && (
                      <View style={{ backgroundColor: reportPalette.cancelled, flex: cancelledCount }} />
                    )}
                  </View>

                  {/* 3 Mini Stats Box */}
                  <View style={styles.miniStatsGrid}>
                    <View style={[styles.miniStatBox, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
                      <View style={styles.miniStatDotRow}>
                        <View style={[styles.statDot, { backgroundColor: reportPalette.completed }]} />
                        <Text style={[styles.miniStatLabel, { color: theme.textSecondary }]}>Hoàn tất</Text>
                      </View>
                      <Text style={[styles.miniStatVal, { color: theme.textPrimary }]}>
                        {completedCount}
                      </Text>
                      <Text style={[styles.miniStatPercent, { color: reportPalette.completed }]}>
                        {Math.round((completedCount / totalOrdersCount) * 100)}%
                      </Text>
                    </View>

                    <View style={[styles.miniStatBox, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
                      <View style={styles.miniStatDotRow}>
                        <View style={[styles.statDot, { backgroundColor: reportPalette.pending }]} />
                        <Text style={[styles.miniStatLabel, { color: theme.textSecondary }]}>Đang làm</Text>
                      </View>
                      <Text style={[styles.miniStatVal, { color: theme.textPrimary }]}>
                        {pendingCount}
                      </Text>
                      <Text style={[styles.miniStatPercent, { color: reportPalette.pending }]}>
                        {Math.round((pendingCount / totalOrdersCount) * 100)}%
                      </Text>
                    </View>

                    <View style={[styles.miniStatBox, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
                      <View style={styles.miniStatDotRow}>
                        <View style={[styles.statDot, { backgroundColor: reportPalette.cancelled }]} />
                        <Text style={[styles.miniStatLabel, { color: theme.textSecondary }]}>Đã hủy</Text>
                      </View>
                      <Text style={[styles.miniStatVal, { color: theme.textPrimary }]}>
                        {cancelledCount}
                      </Text>
                      <Text style={[styles.miniStatPercent, { color: reportPalette.cancelled }]}>
                        {Math.round((cancelledCount / totalOrdersCount) * 100)}%
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <EmptyState
                  title="Chưa có đơn hàng"
                  description="Chọn ngày khác hoặc tải lại sau khi ca bán hàng bắt đầu."
                />
              )}
            </Surface>

            {/* 2. PHÂN BỔ THANH TOÁN CHỐT KÉT */}
            <Surface level="raised" style={styles.sectionSurface}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                    Phân bổ thanh toán & Chốt két
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                    Đối chiếu tiền mặt trong két và tiền chuyển khoản ngân hàng.
                  </Text>
                </View>
                <AppIcon icon={CreditCard} color={brandColors.primary} size={20} />
              </View>

              {totalPaidRevenue > 0 ? (
                <View style={styles.paymentReconcileContent}>
                  {/* Thanh tỷ trọng tiền mặt vs chuyển khoản */}
                  <View accessibilityLabel="Phân bổ phương thức thanh toán" style={[styles.outcomeBar, { backgroundColor: theme.surfaceSunken }]}>
                    {cashData.total > 0 && (
                      <View style={{ backgroundColor: brandColors.success, flex: cashData.total }} />
                    )}
                    {bankData.total > 0 && (
                      <View style={{ backgroundColor: '#2563EB', flex: bankData.total }} />
                    )}
                    {otherPaymentData.total > 0 && (
                      <View style={{ backgroundColor: '#F59E0B', flex: otherPaymentData.total }} />
                    )}
                  </View>

                  {/* 2 Hộp số liệu đối soát chính */}
                  <View style={[styles.paymentBoxesRow, isMobile && styles.paymentBoxesRowMobile]}>
                    {/* Hộp Tiền mặt CASH */}
                    <View
                      style={[
                        styles.paymentBox,
                        {
                          backgroundColor: theme.surfaceCanvas,
                          borderColor: theme.borderSubtle,
                          borderLeftColor: brandColors.success,
                          borderLeftWidth: 3
                        }
                      ]}
                    >
                      <View style={styles.paymentBoxHeader}>
                        <View style={styles.paymentLabelGroup}>
                          <View style={[styles.paymentIconBadge, { backgroundColor: `${brandColors.success}18` }]}>
                            <AppIcon icon={ReceiptText} color={brandColors.success} size={15} />
                          </View>
                          <Text style={[styles.paymentBoxTitle, { color: theme.textPrimary }]}>
                            Tiền mặt (Trong két)
                          </Text>
                        </View>
                        <View style={[styles.rateBadge, { backgroundColor: `${brandColors.success}18` }]}>
                          <Text style={[styles.rateBadgeText, { color: brandColors.success }]}>
                            {cashPercent}%
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.paymentAmountText, { color: theme.textPrimary }]}>
                        {cashData.total.toLocaleString('vi-VN')} đ
                      </Text>
                      <View style={styles.paymentMetaRow}>
                        <Text style={[styles.paymentMetaText, { color: theme.textSecondary }]}>
                          {cashData.count} đơn · Cần kiểm đếm két
                        </Text>
                      </View>
                    </View>

                    {/* Hộp Chuyển khoản QR */}
                    <View
                      style={[
                        styles.paymentBox,
                        {
                          backgroundColor: theme.surfaceCanvas,
                          borderColor: theme.borderSubtle,
                          borderLeftColor: '#2563EB',
                          borderLeftWidth: 3
                        }
                      ]}
                    >
                      <View style={styles.paymentBoxHeader}>
                        <View style={styles.paymentLabelGroup}>
                          <View style={[styles.paymentIconBadge, { backgroundColor: '#2563EB18' }]}>
                            <AppIcon icon={QrCode} color="#2563EB" size={15} />
                          </View>
                          <Text style={[styles.paymentBoxTitle, { color: theme.textPrimary }]}>
                            Chuyển khoản QR
                          </Text>
                        </View>
                        <View style={[styles.rateBadge, { backgroundColor: '#2563EB18' }]}>
                          <Text style={[styles.rateBadgeText, { color: '#2563EB' }]}>
                            {bankPercent}%
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.paymentAmountText, { color: theme.textPrimary }]}>
                        {bankData.total.toLocaleString('vi-VN')} đ
                      </Text>
                      <View style={styles.paymentMetaRow}>
                        <Text style={[styles.paymentMetaText, { color: theme.textSecondary }]}>
                          {bankData.count} đơn · Đối soát tài khoản
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <EmptyState
                  title="Chưa có dữ liệu thanh toán"
                  description="Doanh thu tiền mặt và chuyển khoản sẽ hiển thị khi có đơn hoàn tất."
                />
              )}
            </Surface>

            {/* 2.5 HIỆU QUẢ GIÁ VỐN & LỢI NHUẬN GỘP (COGS & GROSS PROFIT) */}
            <Surface level="raised" style={styles.sectionSurface}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                    Lợi nhuận gộp & Giá vốn (BOM)
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                    Bóc tách chi phí nguyên liệu tiêu hao và tiền lời thực tế trong ngày.
                  </Text>
                </View>
                <View style={[styles.rateBadge, { backgroundColor: '#10B98118' }]}>
                  <Text style={[styles.rateBadgeText, { color: '#10B981' }]}>
                    {report?.profitSummary ? `${report.profitSummary.grossMargin}% biên lời` : '--'}
                  </Text>
                </View>
              </View>

              <View style={[styles.paymentBoxesRow, isMobile && styles.paymentBoxesRowMobile]}>
                {/* Hộp Giá vốn COGS */}
                <View
                  style={[
                    styles.paymentBox,
                    {
                      backgroundColor: theme.surfaceCanvas,
                      borderColor: theme.borderSubtle,
                      borderLeftColor: '#EF4444',
                      borderLeftWidth: 3
                    }
                  ]}
                >
                  <View style={styles.paymentBoxHeader}>
                    <View style={styles.paymentLabelGroup}>
                      <View style={[styles.paymentIconBadge, { backgroundColor: '#EF444418' }]}>
                        <AppIcon icon={Coins} color="#EF4444" size={15} />
                      </View>
                      <Text style={[styles.paymentBoxTitle, { color: theme.textPrimary }]}>
                        Giá vốn NVL (COGS)
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.paymentAmountText, { color: '#EF4444' }]}>
                    {report?.profitSummary ? report.profitSummary.totalCogs.toLocaleString('vi-VN') : 0} đ
                  </Text>
                  <View style={styles.paymentMetaRow}>
                    <Text style={[styles.paymentMetaText, { color: theme.textSecondary }]}>
                      Tiêu hao tự động theo BOM
                    </Text>
                  </View>
                </View>

                {/* Hộp Lợi nhuận gộp thực tế */}
                <View
                  style={[
                    styles.paymentBox,
                    {
                      backgroundColor: theme.surfaceCanvas,
                      borderColor: theme.borderSubtle,
                      borderLeftColor: '#10B981',
                      borderLeftWidth: 3
                    }
                  ]}
                >
                  <View style={styles.paymentBoxHeader}>
                    <View style={styles.paymentLabelGroup}>
                      <View style={[styles.paymentIconBadge, { backgroundColor: '#10B98118' }]}>
                        <AppIcon icon={TrendingUp} color="#10B981" size={15} />
                      </View>
                      <Text style={[styles.paymentBoxTitle, { color: theme.textPrimary }]}>
                        Tiền lời gộp (Gross Profit)
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.paymentAmountText, { color: '#10B981' }]}>
                    {report?.profitSummary ? report.profitSummary.grossProfit.toLocaleString('vi-VN') : 0} đ
                  </Text>
                  <View style={styles.paymentMetaRow}>
                    <Text style={[styles.paymentMetaText, { color: theme.textSecondary }]}>
                      Doanh thu thuần trừ giá vốn
                    </Text>
                  </View>
                </View>
              </View>
            </Surface>

            {/* 3. ĐỐI SOÁT HÓA ĐƠN TRONG PHIÊN */}
            <Surface level="raised" style={styles.sectionSurface}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                    Đối soát hóa đơn
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                    Xem bản ghi hóa đơn các đơn hoàn tất trong phiên.
                  </Text>
                </View>
                <AppIcon icon={ReceiptText} color={theme.textSecondary} size={20} />
              </View>

              {completedOrders.length > 0 ? (
                <View style={styles.receiptCompactList}>
                  {completedOrders.slice(0, 5).map((order, index) => (
                    <View
                      key={order.id}
                      style={[
                        styles.orderSnapshotRow,
                        index < Math.min(completedOrders.length, 5) - 1 && {
                          borderBottomColor: theme.borderSubtle,
                          borderBottomWidth: 1
                        }
                      ]}
                    >
                      <View style={styles.orderSnapshotInfo}>
                        <Text style={[styles.orderCode, { color: theme.textPrimary }]}>
                          #{order.code}
                        </Text>
                        <Text style={[styles.orderMeta, { color: theme.textSecondary }]}>
                          {order.orderType === 'DINE_IN' ? `Bàn ${order.tableNumber ?? order.tableId}` : 'Mang về'} · {order.finalAmount.toLocaleString('vi-VN')} đ
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Xem hóa đơn #${order.code}`}
                        onPress={() => openReceipt(order)}
                        style={({ pressed }) => [
                          styles.receiptButton,
                          { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }
                        ]}
                      >
                        <AppIcon icon={Eye} color={theme.textPrimary} size={16} />
                        <Text style={[styles.receiptButtonText, { color: theme.textPrimary }]}>
                          Xem
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  title="Chưa có hóa đơn trong ca"
                  description="Hóa đơn đã hoàn tất sẽ hiển thị tại đây để đối soát."
                />
              )}
            </Surface>
          </View>

          {/* CỘT PHẢI: HIỆU QUẢ THỰC ĐƠN TOP 5 (~55%) */}
          <View style={[styles.rightAnalysisCol, !isTabletOrDesktop && styles.fullWidthCol]}>
            <Surface level="raised" style={styles.sectionSurface}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                    Top 5 món bán chạy
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                    Xếp hạng theo số phần bán ra trong các đơn hoàn tất.
                  </Text>
                </View>
                <AppIcon icon={Award} color={brandColors.primary} size={22} />
              </View>

              {report?.topSellers && report.topSellers.length > 0 ? (
                <View style={styles.topSellerSection}>
                  {/* Biểu đồ cột Bar Chart */}
                  <View style={[styles.chartWrapper, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}>
                    <View style={styles.chartLegendRow}>
                      <View style={styles.chartTitleWithIcon}>
                        <AppIcon icon={BarChart2} color={theme.primary} size={15} />
                        <Text style={[styles.chartLegendTitle, { color: theme.textPrimary }]}>
                          Số lượng phần bán ra
                        </Text>
                      </View>
                      <Text style={[styles.chartLegendHint, { color: theme.textSecondary }]}>
                        Chạm cột để xem chi tiết
                      </Text>
                    </View>
                    <View style={styles.chartCanvas}>
                      <BarChart
                        data={barData}
                        barWidth={isMobile ? 22 : 32}
                        spacing={isMobile ? 16 : 24}
                        roundedTop
                        roundedBottom={false}
                        rulesColor={theme.borderSubtle}
                        xAxisColor={theme.borderSubtle}
                        yAxisColor={theme.borderSubtle}
                        yAxisThickness={1}
                        xAxisThickness={1}
                        xAxisLabelTextStyle={{
                          color: theme.textSecondary,
                          fontSize: 10,
                          fontFamily: typography.families.body
                        }}
                        yAxisTextStyle={{
                          color: theme.textSecondary,
                          fontSize: 10,
                          fontFamily: typography.families.body
                        }}
                        noOfSections={4}
                        maxValue={Math.max(5, Math.ceil(maxTopSellerQuantity * 1.25))}
                        height={150}
                        isAnimated
                        animationDuration={350}
                      />
                    </View>
                  </View>

                  {/* Spotlight Card: Món đang được chọn */}
                  {selectedTopItem && (
                    <View style={[styles.selectedItemCard, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
                      <View style={styles.selectedItemHeader}>
                        <View style={[styles.selectedItemBadge, { backgroundColor: brandColors.primary }]}>
                          <Text style={styles.selectedItemBadgeText}>
                            Hạng {(report?.topSellers || []).findIndex((i) => i.menuItemId === selectedTopItem.menuItemId) + 1}
                          </Text>
                        </View>
                        <Text style={[styles.selectedItemTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                          {selectedTopItem.name}
                        </Text>
                      </View>
                      <View style={styles.selectedItemMetrics}>
                        <View style={styles.selectedItemMetricCol}>
                          <Text style={[styles.selectedItemMetricLabel, { color: theme.textSecondary }]}>Đã bán</Text>
                          <Text style={[styles.selectedItemMetricValue, { color: theme.textPrimary }]}>
                            {selectedTopItem.quantitySold} phần
                          </Text>
                        </View>
                        <View style={[styles.selectedItemDivider, { backgroundColor: theme.borderSubtle }]} />
                        <View style={styles.selectedItemMetricCol}>
                          <Text style={[styles.selectedItemMetricLabel, { color: theme.textSecondary }]}>Tổng doanh thu món</Text>
                          <Text style={[styles.selectedItemMetricValue, { color: theme.primary }]}>
                            {selectedTopItem.revenue.toLocaleString('vi-VN')} đ
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Danh sách xếp hạng 5 món */}
                  <View style={styles.topSellerRowsContainer}>
                    {report.topSellers.map((item, index) => {
                      const isSelected = selectedTopItem?.menuItemId === item.menuItemId;
                      const rankColors = [
                        '#EAB308', // Vàng kim #1
                        '#94A3B8', // Bạc #2
                        '#B45309'  // Đồng #3
                      ];
                      const badgeColor = index < 3 ? rankColors[index] : theme.textSecondary;

                      return (
                        <Pressable
                          key={item.menuItemId}
                          accessibilityRole="button"
                          accessibilityLabel={`Chọn món ${item.name}`}
                          onPress={() => setSelectedTopItem(item)}
                          style={({ pressed }) => [
                            styles.topSellerRow,
                            isSelected && {
                              backgroundColor: theme.surfaceCanvas,
                              borderColor: theme.borderSubtle,
                              borderWidth: 1,
                              borderRadius: radii.md
                            },
                            pressed && { opacity: 0.8 }
                          ]}
                        >
                          <View style={[styles.rankBadge, { backgroundColor: `${badgeColor}18` }]}>
                            <Text style={[styles.rankText, { color: badgeColor }]}>
                              #{index + 1}
                            </Text>
                          </View>

                          <View style={styles.topSellerInfo}>
                            <View style={styles.topSellerCopy}>
                              <Text style={[styles.topSellerName, { color: theme.textPrimary }]} numberOfLines={1}>
                                {item.name}
                              </Text>
                              <Text style={[styles.topSellerQuantity, { color: theme.textPrimary }]}>
                                {item.quantitySold} phần
                              </Text>
                            </View>

                            <View style={[styles.itemBarTrack, { backgroundColor: theme.surfaceSunken }]}>
                              <View
                                style={[
                                  styles.itemBarFill,
                                  {
                                    backgroundColor: barColors[index % barColors.length],
                                    width: `${Math.max(8, (item.quantitySold / maxTopSellerQuantity) * 100)}%` as `${number}%`
                                  }
                                ]}
                              />
                            </View>

                            <Text style={[styles.topSellerRevenue, { color: theme.textSecondary }]}>
                              {item.revenue.toLocaleString('vi-VN')} đ doanh thu
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <EmptyState
                  title="Chưa có xếp hạng"
                  description="Món bán chạy sẽ xuất hiện khi có đơn hoàn tất trong ngày."
                />
              )}
            </Surface>
          </View>
        </View>
      </ScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={isDatePickerOpen}
        selectedDate={currentDateStr}
        onSelectDate={(newDate) => setCurrentDateStr(newDate)}
        onClose={() => setIsDatePickerOpen(false)}
      />

      {/* Receipt Modal */}
      <ReceiptModal
        visible={isReceiptModalOpen}
        order={receiptOrder}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  reportHeader: { borderBottomWidth: 1, gap: spacing.md, padding: spacing.lg },
  exportError: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  dateToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between'
  },
  dateToolbarMobile: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: spacing.sm
  },
  dateSelector: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  dateNavButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: spacing.touchTargetMobile,
    justifyContent: 'center',
    width: spacing.touchTargetMobile
  },
  dateDisplayTrigger: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexShrink: 1,
    gap: spacing.xs,
    minWidth: 0,
    minHeight: spacing.touchTargetMobile,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  dateLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  dateMainText: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.sm
  },
  dateSubText: {
    fontFamily: typography.families.body,
    fontSize: 11
  },
  dateActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  scrollContent: {
    gap: spacing.lg,
    padding: spacing.lg
  },
  scrollContentMobile: {
    gap: spacing.md,
    padding: spacing.md
  },
  feedbackStack: {
    gap: spacing.sm
  },
  retryButton: {
    alignSelf: 'flex-start'
  },

  /* 4 STANDARDIZED KPI METRIC CARDS */
  kpiGrid: {
    flexDirection: 'row',
    gap: spacing.md
  },
  kpiGridMobile: {
    flexDirection: 'column'
  },
  kpiCardWrapper: {
    flexGrow: 1
  },
  kpiCard: {
    gap: spacing.xs,
    height: '100%',
    justifyContent: 'space-between',
    minHeight: 128,
    padding: spacing.md
  },
  metricHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  metricTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase'
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  revenueNumber: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5
  },
  metricNumber: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: ['tabular-nums']
  },
  vatBadgeRow: {
    alignSelf: 'flex-start'
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  metricSubtext: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },

  /* BALANCED 2-COLUMN DASHBOARD */
  analysisSplit: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg
  },
  analysisSplitStacked: {
    flexDirection: 'column'
  },
  leftAnalysisCol: {
    flex: 1,
    gap: spacing.lg
  },
  rightAnalysisCol: {
    flex: 1.25,
    gap: spacing.lg
  },
  fullWidthCol: {
    width: '100%'
  },
  sectionSurface: {
    gap: spacing.md,
    padding: spacing.lg,
    width: '100%'
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.md
  },
  sectionSubtitle: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  rateBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2
  },
  rateBadgeText: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xs
  },

  /* Outcome section */
  outcomeContent: {
    gap: spacing.md
  },
  outcomeBar: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    height: 12,
    overflow: 'hidden'
  },
  miniStatsGrid: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  miniStatBox: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    paddingVertical: spacing.sm
  },
  miniStatDotRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4
  },
  statDot: {
    borderRadius: radii.pill,
    height: 8,
    width: 8
  },
  miniStatLabel: {
    fontFamily: typography.families.body,
    fontSize: 11
  },
  miniStatVal: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.md,
    fontVariant: ['tabular-nums']
  },
  miniStatPercent: {
    fontFamily: typography.families.bodySemibold,
    fontSize: 10
  },

  /* Receipt compact list */
  receiptCompactList: {
    gap: spacing.xs
  },
  orderSnapshotRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingVertical: spacing.sm
  },
  orderSnapshotInfo: {
    flex: 1,
    gap: 2
  },
  orderCode: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.sm
  },
  orderMeta: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  receiptButton: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs
  },
  receiptButtonText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },

  /* Top Sellers section */
  topSellerSection: {
    gap: spacing.md
  },
  chartWrapper: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    padding: spacing.md
  },
  chartLegendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  chartTitleWithIcon: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4
  },
  chartLegendTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  chartLegendHint: {
    fontFamily: typography.families.body,
    fontSize: 11
  },
  chartCanvas: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs
  },
  selectedItemCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  selectedItemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  selectedItemBadge: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2
  },
  selectedItemBadgeText: {
    color: '#FFFFFF',
    fontFamily: typography.families.operationalBold,
    fontSize: 11
  },
  selectedItemTitle: {
    flex: 1,
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  selectedItemMetrics: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.xs
  },
  selectedItemMetricCol: {
    alignItems: 'center',
    gap: 2
  },
  selectedItemMetricLabel: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  selectedItemMetricValue: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.sm,
    fontVariant: ['tabular-nums']
  },
  selectedItemDivider: {
    height: 20,
    width: 1
  },
  topSellerRowsContainer: {
    gap: spacing.xs
  },
  topSellerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs + 2
  },
  rankBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  rankText: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xs
  },
  topSellerInfo: {
    flex: 1,
    gap: 4
  },
  topSellerCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between'
  },
  topSellerName: {
    flex: 1,
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  topSellerQuantity: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums']
  },
  itemBarTrack: {
    borderRadius: radii.pill,
    height: 6,
    overflow: 'hidden'
  },
  itemBarFill: {
    borderRadius: radii.pill,
    height: '100%'
  },
  topSellerRevenue: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums']
  },

  /* Payment reconciliation */
  paymentReconcileContent: {
    gap: spacing.md
  },
  paymentBoxesRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  paymentBoxesRowMobile: {
    flexDirection: 'column'
  },
  paymentBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  paymentBoxHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  paymentLabelGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  paymentIconBadge: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 26,
    justifyContent: 'center',
    width: 26
  },
  paymentBoxTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  paymentAmountText: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.lg,
    fontVariant: ['tabular-nums']
  },
  paymentMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4
  },
  paymentMetaText: {
    fontFamily: typography.families.body,
    fontSize: 11
  }
});

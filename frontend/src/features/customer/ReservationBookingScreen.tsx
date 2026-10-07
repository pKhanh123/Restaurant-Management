import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, Copy, X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { PublicReservationResult, createPublicReservationApi, declarePublicReservationPaymentApi, fetchPublicReservationApi, requestReservationCancellationApi } from '../../api/reservations';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, BrandMark, Button, Field, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const tomorrow = () => { const value = new Date(); value.setDate(value.getDate() + 1); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; };
const statusText = (status: PublicReservationResult['depositStatus']) => ({
  UNPAID: 'Chưa thanh toán', WAITING_CONFIRMATION: 'Chờ nhân viên xác nhận', PAID: 'Đã xác nhận cọc', REFUND_PENDING: 'Đang chờ hoàn cọc', REFUNDED: 'Đã hoàn cọc', FORFEITED: 'Cọc đã khấu trừ theo chính sách', APPLIED_TO_BILL: 'Đã trừ vào hóa đơn'
}[status]);

export const ReservationBookingScreen: React.FC<{ accessToken?: string }> = ({ accessToken }) => {
  const { theme } = useTheme();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [date, setDate] = useState(tomorrow()); const [time, setTime] = useState('18:30');
  const [partySize, setPartySize] = useState('2'); const [note, setNote] = useState('');
  const [booking, setBooking] = useState<PublicReservationResult | null>(null); const [error, setError] = useState('');
  const [loading, setLoading] = useState(false); const [copyMessage, setCopyMessage] = useState(''); const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    let active = true; setLoading(true);
    fetchPublicReservationApi(accessToken).then(result => { if (active) setBooking(result); }).catch((failure: Error) => { if (active) setError(failure.message || 'Không thể mở thông tin đặt bàn'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken]);

  const saveBookingLink = (token: string) => {
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href); url.searchParams.set('bookingToken', token); url.searchParams.delete('booking');
      window.history.replaceState(null, '', url.toString());
    }
  };
  const createBooking = async () => {
    setError(''); setLoading(true);
    try {
      const size = Number(partySize);
      if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error('Số khách phải từ 1 đến 100 người.');
      const localDate = new Date(`${date}T${time}:00`);
      if (!Number.isFinite(localDate.getTime()) || localDate.getTime() <= Date.now()) throw new Error('Chọn ngày và giờ trong tương lai.');
      const result = await createPublicReservationApi({ name: name.trim(), phone: phone.trim(), scheduledAt: localDate.toISOString(), partySize: size, note: note.trim() || undefined });
      setBooking(result); saveBookingLink(result.accessToken);
    } catch (failure: any) { setError(failure.message || 'Không thể tạo đặt bàn'); }
    finally { setLoading(false); }
  };
  const declarePayment = async () => {
    if (!booking || loading) return;
    setLoading(true); setError('');
    try { setBooking(await declarePublicReservationPaymentApi(booking.accessToken)); }
    catch (failure: any) { setError(failure.message || 'Không thể khai báo thanh toán'); }
    finally { setLoading(false); }
  };
  const refreshBooking = async () => {
    if (!booking || loading) return;
    setLoading(true); setError('');
    try { setBooking(await fetchPublicReservationApi(booking.accessToken)); }
    catch (failure: any) { setError(failure.message || 'Không thể tải trạng thái đặt bàn'); }
    finally { setLoading(false); }
  };
  const openTableOrder = () => {
    if (!booking?.tableOrder || typeof window === 'undefined') return;
    const target = new URL(window.location.origin + window.location.pathname);
    target.searchParams.set('tableToken', booking.tableOrder.qrCodeToken);
    target.searchParams.set('reservationToken', booking.accessToken);
    window.location.assign(target.toString());
  };
  const cancelBooking = async () => {
    if (!booking || cancelReason.trim().length < 3 || loading) return;
    setLoading(true); setError('');
    try { setBooking(await requestReservationCancellationApi(booking.accessToken, cancelReason.trim())); }
    catch (failure: any) { setError(failure.message || 'Không thể gửi yêu cầu hủy'); }
    finally { setLoading(false); }
  };
  const copyText = async (value: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); setCopyMessage('Đã sao chép nội dung chuyển khoản.'); }
      else setCopyMessage('Hãy chọn và sao chép nội dung chuyển khoản bên dưới.');
    } catch { setCopyMessage('Hãy chọn và sao chép nội dung chuyển khoản bên dưới.'); }
  };

  return <ScrollView style={[styles.page, { backgroundColor: theme.surfaceCanvas }]} contentContainerStyle={styles.pageContent}>
    <View style={styles.pageHeader}>
      <BrandMark compact size="medium" />
      <View style={styles.pageHeaderCopy}>
        <ScreenHeader title="Đặt bàn trước" description="Giữ chỗ bằng tiền cọc. Gọi món sau khi đến quán và được check-in." />
      </View>
    </View>
    {error ? <InlineAlert title="Chưa thể hoàn tất" message={error} /> : null}
    {loading && !booking ? <ActivityIndicator color={theme.primary} style={{ padding: spacing.xl }} /> : !booking ? <Surface level="raised" style={styles.form}>
      <Text style={[styles.formTitle, { color: theme.textPrimary }]}>Thông tin lượt đặt</Text>
      <Text style={{ color: theme.textSecondary }}>Nhà hàng sẽ giữ chỗ sau khi nhân viên đối chiếu tiền cọc.</Text>
      <Field label="Tên người đặt *" value={name} onChangeText={setName} editable={!loading} autoComplete="name" />
      <Field label="Số điện thoại *" value={phone} onChangeText={setPhone} editable={!loading} keyboardType="phone-pad" autoComplete="tel" />
      <View style={styles.formRow}><View style={{ flex: 1 }}><Field label="Ngày (YYYY-MM-DD)" value={date} onChangeText={setDate} editable={!loading} placeholder="2026-09-30" /></View><View style={{ flex: 1 }}><Field label="Giờ (24h)" value={time} onChangeText={setTime} editable={!loading} placeholder="18:30" /></View></View>
      <Field label="Số người" value={partySize} onChangeText={setPartySize} editable={!loading} keyboardType="number-pad" />
      <Field label="Ghi chú cho nhà hàng" value={note} onChangeText={setNote} editable={!loading} multiline maxLength={1000} placeholder="Ví dụ: cần ghế trẻ em, dị ứng thực phẩm…" />
      <Button variant="primary" label="Tạo đặt bàn và xem tiền cọc" loading={loading} disabled={name.trim().length < 2 || phone.trim().length < 8} onPress={() => void createBooking()} />
    </Surface> : <View style={styles.bookingLayout}>
      <Surface level="raised" style={styles.bookingSummary}>
        <View style={styles.bookingTitle}><View style={{ flex: 1 }}><Text style={[styles.formTitle, { color: theme.textPrimary }]}>Mã đặt bàn {booking.code}</Text><Text style={{ color: theme.textSecondary }}>{new Date(booking.scheduledAt).toLocaleString('vi-VN')} · {booking.partySize} người</Text></View><StatusBadge tone={booking.depositStatus === 'PAID' || booking.depositStatus === 'APPLIED_TO_BILL' ? 'success' : booking.depositStatus === 'WAITING_CONFIRMATION' ? 'warning' : booking.depositStatus === 'REFUNDED' || booking.depositStatus === 'FORFEITED' ? 'neutral' : 'info'} label={statusText(booking.depositStatus)} /></View>
        <View style={[styles.depositBanner, { backgroundColor: theme.interactiveSecondary, borderColor: theme.borderSubtle }]}><Text style={{ color: theme.textSecondary }}>Tiền cọc cần chuyển</Text><Text style={[styles.depositAmount, { color: theme.primary }]}>{money(booking.depositAmount)}</Text></View>
        {booking.paymentInstructions ? <View style={styles.paymentRow}>
          <Image source={{ uri: booking.paymentInstructions.qrUrl }} accessibilityLabel="Mã VietQR chuyển tiền cọc" style={styles.qrImage} />
          <View style={styles.paymentDetails}><Text style={[styles.formTitle, { color: theme.textPrimary }]}>Quét mã để chuyển khoản</Text><Text style={{ color: theme.textSecondary }}>Ngân hàng: {booking.paymentInstructions.bankId}</Text><Text style={{ color: theme.textSecondary }}>Số tài khoản: {booking.paymentInstructions.accountNumber}</Text><Text style={{ color: theme.textSecondary }}>Chủ tài khoản: {booking.paymentInstructions.accountName}</Text><Text style={{ color: theme.textSecondary }}>Số tiền: {money(booking.depositAmount)}</Text></View>
        </View> : <View style={[styles.setupNotice, { backgroundColor: theme.surfaceSunken }]}><Text style={{ color: theme.textPrimary }}>Nhà hàng chưa cấu hình tài khoản nhận tiền để tạo QR. Gọi nhà hàng để nhận thông tin chuyển khoản trước khi thanh toán.</Text></View>}
        <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Nội dung chuyển khoản</Text>
        <Pressable accessibilityRole="button" onPress={() => void copyText(booking.transferContent)} style={[styles.transferContent, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}><Text selectable style={[styles.transferText, { color: theme.textPrimary }]}>{booking.transferContent}</Text><AppIcon icon={Copy} color={theme.primary} size={18} /></Pressable>
        {!!copyMessage && <Text accessibilityLiveRegion="polite" style={{ color: theme.success }}>{copyMessage}</Text>}
        {booking.depositStatus === 'UNPAID' && <Button variant="primary" icon={Check} label="Tôi đã chuyển khoản" loading={loading} onPress={() => void declarePayment()} />}
        {booking.depositStatus === 'WAITING_CONFIRMATION' && <View style={[styles.waiting, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceSunken }]}><Text style={[styles.formTitle, { color: theme.textPrimary }]}>Đã nhận khai báo thanh toán</Text><Text style={{ color: theme.textSecondary }}>Nhân viên sẽ đối chiếu giao dịch trước khi xác nhận giữ chỗ. Chưa tạo order hay chuyển món xuống bếp.</Text></View>}
        {booking.status === 'CONFIRMED' && <Button variant="secondary" label="Kiểm tra trạng thái / check-in" loading={loading} onPress={() => void refreshBooking()} />}
        {booking.status === 'CHECKED_IN' && booking.tableOrder && <View style={[styles.waiting, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceSunken }]}><Text style={[styles.formTitle, { color: theme.textPrimary }]}>Đã check-in · Bàn {booking.tableOrder.tableNumber}</Text><Text style={{ color: theme.textSecondary }}>Giờ bạn có thể xem thực đơn và gửi order. Thanh toán sẽ được nhân viên xác nhận trước khi bếp nhận món.</Text><Button variant="primary" label="Mở thực đơn và gọi món" onPress={openTableOrder} /></View>}
        {(booking.status === 'PENDING_DEPOSIT' || booking.status === 'CONFIRMED') && <View style={styles.cancelArea}><Field label="Lý do hủy (nếu cần)" value={cancelReason} onChangeText={setCancelReason} editable={!loading} placeholder="Nhập lý do" /><Button variant="quiet" icon={X} label="Gửi yêu cầu hủy đặt bàn" loading={loading} disabled={cancelReason.trim().length < 3} onPress={() => void cancelBooking()} /></View>}
      </Surface>
      <View style={[styles.nextStep, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]}><Text style={[styles.formTitle, { color: theme.textPrimary }]}>Khi đến quán</Text><Text style={{ color: theme.textSecondary }}>Đưa mã {booking.code} cho nhân viên để check-in và gán bàn. Sau check-in, quét QR tại bàn để gọi món; đơn chỉ được gửi bếp sau khi thanh toán hoặc nhân viên cho phép trả sau.</Text></View>
    </View>}
    <Text style={[styles.footer, { color: theme.textSecondary }]}>Tiền cọc được ghi nhận riêng, không tính thành doanh thu. Việc hủy hoặc không đến áp dụng chính sách đã hiển thị khi đặt bàn.</Text>
  </ScrollView>;
};

const styles = StyleSheet.create({
  page: { flex: 1 }, pageContent: { alignItems: 'center', gap: spacing.lg, padding: spacing.lg }, pageHeader: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', gap: spacing.md, maxWidth: 880, width: '100%' }, pageHeaderCopy: { flex: 1, minWidth: 0 }, form: { alignSelf: 'center', gap: spacing.md, maxWidth: 660, padding: spacing.lg, width: '100%' }, formTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl }, formRow: { flexDirection: 'row', gap: spacing.md }, bookingLayout: { alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, maxWidth: 900, width: '100%' }, bookingSummary: { flex: 1, gap: spacing.md, minWidth: 320, padding: spacing.lg }, bookingTitle: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, depositBanner: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md }, depositAmount: { fontFamily: typography.families.bodyBold, fontSize: typography.sizes.xl }, paymentRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, qrImage: { height: 190, width: 190 }, paymentDetails: { flex: 1, gap: spacing.sm, minWidth: 180 }, setupNotice: { borderRadius: radii.md, padding: spacing.md }, fieldLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, transferContent: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing.md }, transferText: { fontFamily: typography.families.bodyBold, letterSpacing: 0.5 }, waiting: { borderRadius: radii.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md }, cancelArea: { borderTopColor: 'rgba(128,128,128,.2)', borderTopWidth: 1, gap: spacing.sm, paddingTop: spacing.md }, nextStep: { borderRadius: radii.md, borderWidth: 1, flex: 0.7, gap: spacing.sm, minWidth: 260, padding: spacing.lg }, footer: { lineHeight: 21, maxWidth: 880, width: '100%' }
});

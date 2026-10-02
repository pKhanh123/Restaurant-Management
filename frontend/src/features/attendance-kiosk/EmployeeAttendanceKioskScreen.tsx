import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LockKeyhole, Trash2 } from 'lucide-react-native';
import {
  AttendanceKioskApiError,
  KioskPunchRetryState,
  punchAttendanceKioskApi,
  type KioskPunchChoiceRequiredDto,
  type KioskPunchInput,
  type KioskPunchSelection,
  type KioskPunchSuccessDto
} from '../../api/employeeAttendanceKiosk';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { BrandMark } from '../../ui/BrandMark';
import { kioskCredentialStore } from './kioskCredentialStore';

const retryState = () => new KioskPunchRetryState();

function timeLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function recordedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Vừa ghi nhận';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(date);
}

export const EmployeeAttendanceKioskScreen: React.FC = () => {
  const { theme } = useTheme();
  const [credential, setCredential] = useState<string | null>(null);
  const [credentialDraft, setCredentialDraft] = useState('');
  const [credentialLoading, setCredentialLoading] = useState(true);
  const [code, setCode] = useState('');
  const [action, setAction] = useState<KioskPunchSelection['action']>('CHECK_IN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<KioskPunchSuccessDto | null>(null);
  const [choice, setChoice] = useState<KioskPunchChoiceRequiredDto | null>(null);
  const [retrySelection, setRetrySelection] = useState<KioskPunchSelection | null>(null);
  const retry = useRef(retryState());

  useEffect(() => {
    let active = true;
    void kioskCredentialStore.load().then(value => {
      if (active) setCredential(value);
    }).catch(() => {
      if (active) setError('Không đọc được cấu hình thiết bị. Hãy nhập lại mã phiên kiosk.');
    }).finally(() => { if (active) setCredentialLoading(false); });
    return () => { active = false; };
  }, []);

  const saveCredential = async () => {
    setBusy(true);
    setError('');
    try {
      await kioskCredentialStore.save(credentialDraft);
      setCredential(credentialDraft);
      setCredentialDraft('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể lưu cấu hình kiosk.');
    } finally { setBusy(false); }
  };

  const clearCredential = async (message = '') => {
    await kioskCredentialStore.clear().catch(() => undefined);
    setCredential(null);
    setCredentialDraft('');
    setCode('');
    setChoice(null);
    setRetrySelection(null);
    setSuccess(null);
    setError(message);
  };

  const punch = useCallback(async (selection: KioskPunchSelection) => {
    if (!credential || busy) return;
    setBusy(true);
    setError('');
    setSuccess(null);
    setCode('');
    try {
      const input: KioskPunchInput = retry.current.prepare(selection);
      const result = await punchAttendanceKioskApi(credential, input);
      if ('selectionRequired' in result && result.selectionRequired) {
        setRetrySelection(selection);
        setChoice(result);
        return;
      }
      retry.current.confirmSuccess();
      setRetrySelection(null);
      setChoice(null);
      setSuccess(result as KioskPunchSuccessDto);
    } catch (failure) {
      if (failure instanceof AttendanceKioskApiError) {
        // A concrete server response ends this attempt. Drop the in-memory fingerprint
        // (which includes the employee code); only transport uncertainty keeps a retry.
        retry.current.discardPendingAttempt();
        setRetrySelection(null);
        if (['KIOSK_SESSION_INVALID', 'KIOSK_SESSION_EXPIRED', 'KIOSK_SESSION_REVOKED'].includes(failure.code)) {
          await clearCredential('Phiên kiosk đã hết hạn hoặc bị thu hồi. Vui lòng liên hệ Admin để kết nối lại.');
        } else if (failure.code === 'ATTENDANCE_CREDENTIAL_INVALID') {
          setError('Mã chấm công không hợp lệ. Vui lòng kiểm tra và thử lại.');
        } else {
          setError(failure.message);
        }
      } else {
        setRetrySelection(selection);
        setError(failure instanceof Error ? failure.message : 'Không thể kết nối máy chủ. Hãy thử lại.');
      }
    } finally { setBusy(false); }
  }, [busy, credential]);

  const submit = () => {
    if (busy || !code.trim()) return;
    setChoice(null);
    setRetrySelection(null);
    setSuccess(null);
    void punch({ attendanceCode: code.trim(), action });
  };

  const chooseShift = (scheduleRuleId: number, scheduleDate: string) => {
    if (!retrySelection) return;
    void punch({ ...retrySelection, scheduleRuleId, scheduleDate });
  };

  const chooseOutsideSchedule = () => {
    if (!retrySelection) return;
    void punch({ ...retrySelection, outsideScheduleConfirmation: true });
  };

  const retryLast = () => { if (retrySelection) void punch(retrySelection); };

  return <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: theme.surfaceCanvas }]} keyboardShouldPersistTaps="handled">
    <View style={[styles.card, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
      <View style={styles.brand}>
        <BrandMark compact size="large" />
        <Text style={[styles.title, { color: theme.textPrimary }]}>Chấm công nhân viên</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Kiosk dùng chung · Thời gian được ghi nhận từ máy chủ</Text>
      </View>

      {credentialLoading ? <ActivityIndicator color={theme.primary} /> : !credential ? <View style={styles.setup}>
        <LockKeyhole size={22} color={theme.primary} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Kết nối kiosk</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Nhập mã phiên một lần do Admin cấp cho thiết bị này. Mã chỉ lưu trên thiết bị, không nằm trong đường dẫn.</Text>
        <TextInput testID="kiosk-credential-input" value={credentialDraft} onChangeText={setCredentialDraft}
          autoCapitalize="none" autoCorrect={false} secureTextEntry accessibilityLabel="Mã phiên kiosk"
          placeholder="Mã phiên kiosk" placeholderTextColor={theme.textSecondary}
          style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
        <Pressable testID="kiosk-save-credential" accessibilityRole="button" disabled={busy || !credentialDraft.trim()}
          onPress={() => void saveCredential()} style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: busy || !credentialDraft.trim() ? 0.55 : 1 }]}>
          <Text style={styles.primaryText}>{busy ? 'Đang kết nối…' : 'Kết nối thiết bị'}</Text>
        </Pressable>
      </View> : <View style={styles.punchArea}>
        <View style={[styles.actions, { borderColor: theme.borderSubtle }]}>
          {(['CHECK_IN', 'CHECK_OUT'] as const).map(value => <Pressable key={value} testID={value === 'CHECK_IN' ? 'kiosk-action-check-in' : 'kiosk-action-check-out'}
            accessibilityRole="button" accessibilityState={{ selected: action === value }} onPress={() => setAction(value)}
            style={[styles.actionButton, { backgroundColor: action === value ? theme.primary : theme.surfaceBase }]}>
            <Text style={[styles.actionText, { color: action === value ? '#FFFFFF' : theme.textPrimary }]}>{value === 'CHECK_IN' ? 'Vào ca' : 'Tan ca'}</Text>
          </Pressable>)}
        </View>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Nhập mã chấm công</Text>
        <TextInput testID="kiosk-attendance-code" value={code} onChangeText={value => { setCode(value); setError(''); setSuccess(null); }}
          autoCapitalize="characters" autoCorrect={false} secureTextEntry accessibilityLabel="Mã chấm công nhân viên"
          placeholder="Mã nhân viên" placeholderTextColor={theme.textSecondary} editable={!busy}
          style={[styles.codeInput, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
        <Pressable testID="kiosk-punch-submit" accessibilityRole="button" disabled={busy || !code.trim()}
          onPress={submit} style={[styles.primaryButton, styles.submitButton, { backgroundColor: theme.primary, opacity: busy || !code.trim() ? 0.55 : 1 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{action === 'CHECK_IN' ? 'Ghi nhận vào ca' : 'Ghi nhận tan ca'}</Text>}
        </Pressable>
        {busy && <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Đang xác nhận với máy chủ…</Text>}
        {error ? <View accessibilityRole="alert" testID="kiosk-error" style={styles.message}>
          <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
          {retrySelection && <Pressable testID="kiosk-retry" onPress={retryLast} disabled={busy} style={[styles.secondaryButton, { borderColor: theme.borderSubtle }]}>
            <Text style={[styles.actionText, { color: theme.textPrimary }]}>Thử lại cùng yêu cầu</Text>
          </Pressable>}
        </View> : null}
        {choice && retrySelection && <View testID="kiosk-schedule-choice" style={[styles.choiceBox, { borderColor: theme.borderSubtle }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{choice.code === 'OUTSIDE_SCHEDULE_CONFIRMATION_REQUIRED' ? 'Chọn ca hoặc chấm công ngoài lịch' : 'Chọn ca làm việc'}</Text>
          {choice.choices.map(schedule => <Pressable key={`${schedule.scheduleRuleId}:${schedule.scheduleDate}`}
            testID={`kiosk-schedule-choice-${schedule.scheduleRuleId}`} onPress={() => chooseShift(schedule.scheduleRuleId, schedule.scheduleDate)}
            disabled={busy} style={[styles.choiceButton, { borderColor: theme.borderSubtle }]}>
            <Text style={[styles.actionText, { color: theme.textPrimary }]}>{schedule.shiftName} · {timeLabel(schedule.plannedStartMinute)}–{timeLabel(schedule.plannedEndMinute)}</Text>
          </Pressable>)}
          {choice.allowOutsideSchedule && <Pressable testID="kiosk-outside-schedule" onPress={chooseOutsideSchedule} disabled={busy}
            style={[styles.secondaryButton, { borderColor: theme.borderSubtle }]}>
            <Text style={[styles.actionText, { color: theme.textPrimary }]}>Chấm công ngoài lịch</Text>
          </Pressable>}
        </View>}
        {success && <View testID="kiosk-success" accessibilityRole="alert" style={[styles.successBox, { backgroundColor: theme.interactiveSecondary }]}>
          <Text style={[styles.successTitle, { color: theme.primary }]}>{success.action === 'CHECK_IN' ? 'Đã ghi nhận vào ca' : 'Đã ghi nhận tan ca'}</Text>
          <Text style={[styles.successName, { color: theme.textPrimary }]}>{success.employeeName}</Text>
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>{recordedTime(success.recordedAt)} · {success.shiftName ?? (success.linkStatus === 'UNSCHEDULED' ? 'Ngoài lịch' : 'Đang xử lý')}</Text>
        </View>}
        <Pressable testID="kiosk-clear-credential" accessibilityRole="button" onPress={() => void clearCredential()}
          style={[styles.clearButton, { borderColor: theme.borderSubtle }]}>
          <Trash2 size={16} color={theme.textSecondary} /><Text style={[styles.subtitle, { color: theme.textSecondary }]}>Ngắt kết nối thiết bị</Text>
        </Pressable>
      </View>}
      {!credentialLoading && error && !credential && <Text accessibilityRole="alert" style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}
    </View>
  </ScrollView>;
};

const styles = StyleSheet.create({
  screen: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: { borderRadius: radii.md, borderWidth: 1, gap: spacing.lg, maxWidth: 620, padding: spacing.xl, width: '100%' },
  brand: { alignItems: 'center', gap: spacing.sm },
  title: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xl },
  subtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, textAlign: 'center' },
  setup: { alignItems: 'stretch', gap: spacing.md },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, textAlign: 'center' },
  input: { borderRadius: radii.sm, borderWidth: 1, fontFamily: typography.families.body, fontSize: typography.sizes.md, minHeight: 48, paddingHorizontal: spacing.md },
  codeInput: { borderRadius: radii.md, borderWidth: 1, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xl, letterSpacing: 3, minHeight: 76, paddingHorizontal: spacing.lg, textAlign: 'center' },
  punchArea: { alignItems: 'stretch', gap: spacing.md },
  actions: { borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', padding: spacing.xs },
  actionButton: { alignItems: 'center', borderRadius: radii.sm, flex: 1, justifyContent: 'center', minHeight: 54 },
  actionText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  primaryButton: { alignItems: 'center', borderRadius: radii.md, justifyContent: 'center', minHeight: 50, paddingHorizontal: spacing.lg },
  submitButton: { minHeight: 64 },
  primaryText: { color: '#FFFFFF', fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  message: { alignItems: 'center', gap: spacing.sm },
  errorText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, textAlign: 'center' },
  secondaryButton: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.md },
  choiceBox: { borderRadius: radii.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  choiceButton: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, justifyContent: 'center', minHeight: 48, padding: spacing.sm },
  successBox: { alignItems: 'center', borderRadius: radii.md, gap: spacing.xs, padding: spacing.md },
  successTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  successName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xl },
  clearButton: { alignItems: 'center', alignSelf: 'center', borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, minHeight: 40, paddingHorizontal: spacing.md }
});

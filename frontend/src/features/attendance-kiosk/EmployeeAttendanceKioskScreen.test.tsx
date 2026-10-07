import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceKioskApiError } from '../../api/employeeAttendanceKiosk';
import type { KioskPunchResponseDto } from '../../api/employeeAttendanceKiosk';

const { loadCredential, saveCredential, clearCredential, punch } = vi.hoisted(() => ({
  loadCredential: vi.fn(), saveCredential: vi.fn(), clearCredential: vi.fn(), punch: vi.fn()
}));
const { native } = vi.hoisted(() => ({ native: (name: string) => {
  const Component = (props: any) => React.createElement(name, props, props.children);
  Component.displayName = name;
  return Component;
} }));

vi.mock('./kioskCredentialStore', () => ({ kioskCredentialStore: {
  load: loadCredential, save: saveCredential, clear: clearCredential
} }));
vi.mock('../../api/employeeAttendanceKiosk', () => ({
  punchAttendanceKioskApi: punch,
  AttendanceKioskApiError: class AttendanceKioskApiError extends Error {
    code: string;
    constructor(message: string, code: string) { super(message); this.code = code; }
  },
  KioskPunchRetryState: class KioskPunchRetryState {
    private fingerprint = '';
    private key = '';
    prepare(selection: object) {
      const next = JSON.stringify(selection);
      if (next !== this.fingerprint) { this.fingerprint = next; this.key = `retry-${Math.random()}`; }
      return { ...selection, idempotencyKey: this.key };
    }
    confirmSuccess() { this.discardPendingAttempt(); }
    discardPendingAttempt() { this.fingerprint = ''; this.key = ''; }
  }
}));
vi.mock('react-native', () => ({
  ActivityIndicator: native('ActivityIndicator'), AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  Platform: { OS: 'web' }, Pressable: native('Pressable'), ScrollView: native('ScrollView'),
  StyleSheet: { create: (styles: any) => styles }, Text: native('Text'), TextInput: native('TextInput'),
  View: native('View')
}));
vi.mock('lucide-react-native', () => { const Icon = native('Icon'); return { Clock3: Icon, LockKeyhole: Icon, Trash2: Icon }; });
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {
  surfaceBase: '#fff', surfaceCanvas: '#f4f3f0', interactiveSecondary: '#fff1dd', primary: '#b42318',
  textPrimary: '#24211f', textSecondary: '#6b6560', borderSubtle: '#d8d4ce', danger: '#b42318'
} }) }));
vi.mock('../../theme', () => ({ radii: { md: 8, sm: 4, pill: 99 }, spacing: { xs: 4, sm: 8, md: 12, lg: 20 }, typography: {
  families: { bodySemibold: 'Inter', body: 'Inter', display: 'Inter' }, sizes: { sm: 13, md: 16, lg: 21, xl: 28 }
} }));
import { EmployeeAttendanceKioskScreen } from './EmployeeAttendanceKioskScreen';
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('EmployeeAttendanceKioskScreen', () => {
  beforeEach(() => {
    loadCredential.mockReset().mockResolvedValue(null);
    saveCredential.mockReset().mockResolvedValue(undefined);
    clearCredential.mockReset().mockResolvedValue(undefined);
    punch.mockReset();
  });

  it('provisions once, resumes from local storage, and keeps employee code out of the credential store', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceKioskScreen />); await Promise.resolve(); });
    expect(screen.root.findByProps({ testID: 'brand-logo-icon' })).toBeDefined();
    const setupInput = screen.root.findByProps({ testID: 'kiosk-credential-input' });
    await act(async () => { setupInput.props.onChangeText('opaque-session-secret'); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-save-credential' }).props.onPress(); await Promise.resolve(); });
    expect(saveCredential).toHaveBeenCalledWith('opaque-session-secret');
    expect(screen.root.findByProps({ testID: 'kiosk-attendance-code' })).toBeDefined();

    const checkIn = vi.fn(async () => ({ action: 'CHECK_IN', employeeName: 'An', recordedAt: '2026-09-29T01:00:00Z', state: 'OPEN', linkStatus: 'UNSCHEDULED', shiftName: null } satisfies KioskPunchResponseDto));
    punch.mockImplementation(checkIn);
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-attendance-code' }).props.onChangeText('NV000004'); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-action-check-in' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-punch-submit' }).props.onPress(); await Promise.resolve(); });

    expect(checkIn).toHaveBeenCalledWith('opaque-session-secret', expect.objectContaining({ attendanceCode: 'NV000004', action: 'CHECK_IN' }));
    expect(saveCredential).toHaveBeenCalledTimes(1);
    expect(screen.root.findByProps({ testID: 'kiosk-attendance-code' }).props.value).toBe('');
    expect(screen.root.findByProps({ testID: 'kiosk-success' })).toBeDefined();
    await act(async () => screen.unmount());
  });

  it('retains a retry identity through a schedule choice and exposes both approved at-end choices', async () => {
    loadCredential.mockResolvedValue('opaque-session-secret');
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceKioskScreen />); await Promise.resolve(); });
    punch.mockResolvedValueOnce({ selectionRequired: true, code: 'OUTSIDE_SCHEDULE_CONFIRMATION_REQUIRED', allowOutsideSchedule: true,
      choices: [{ scheduleRuleId: 11, scheduleDate: '2026-09-29', shiftName: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720 }] } satisfies KioskPunchResponseDto)
      .mockResolvedValueOnce({ action: 'CHECK_IN', employeeName: 'An', recordedAt: '2026-09-29T01:00:00Z', state: 'OPEN', linkStatus: 'SCHEDULED', shiftName: 'Ca sáng' } satisfies KioskPunchResponseDto);
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-attendance-code' }).props.onChangeText('NV000004'); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-punch-submit' }).props.onPress(); await Promise.resolve(); });
    expect(screen.root.findByProps({ testID: 'kiosk-schedule-choice-11' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'kiosk-outside-schedule' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-schedule-choice-11' }).props.onPress(); await Promise.resolve(); });
    const initial = punch.mock.calls[0][1];
    const confirmed = punch.mock.calls[1][1];
    expect(confirmed).toMatchObject({ attendanceCode: 'NV000004', scheduleRuleId: 11, scheduleDate: '2026-09-29' });
    expect(confirmed.idempotencyKey).not.toBe(initial.idempotencyKey);
    await act(async () => screen.unmount());
  });

  it('keeps outside-schedule confirmation as an explicit choice when no shift is available', async () => {
    loadCredential.mockResolvedValue('opaque-session-secret');
    punch.mockResolvedValueOnce({ selectionRequired: true, code: 'OUTSIDE_SCHEDULE_CONFIRMATION_REQUIRED', allowOutsideSchedule: true, choices: [] } satisfies KioskPunchResponseDto)
      .mockResolvedValueOnce({ action: 'CHECK_IN', employeeName: 'An', recordedAt: '2026-09-29T01:00:00Z', state: 'OPEN', linkStatus: 'UNSCHEDULED', shiftName: null } satisfies KioskPunchResponseDto);
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceKioskScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-attendance-code' }).props.onChangeText('NV000004'); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-punch-submit' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-outside-schedule' }).props.onPress(); await Promise.resolve(); });
    expect(punch.mock.calls[1][1]).toMatchObject({ attendanceCode: 'NV000004', outsideScheduleConfirmation: true });
    expect(punch.mock.calls[1][1].scheduleRuleId).toBeUndefined();
    await act(async () => screen.unmount());
  });

  it('clears an expired/revoked kiosk credential and uses a generic employee-code error', async () => {
    loadCredential.mockResolvedValue('opaque-session-secret');
    punch.mockRejectedValueOnce(new AttendanceKioskApiError('Kiosk expired', 'KIOSK_SESSION_EXPIRED', 401));
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceKioskScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-attendance-code' }).props.onChangeText('NV000004'); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-punch-submit' }).props.onPress(); await Promise.resolve(); });
    expect(clearCredential).toHaveBeenCalledOnce();
    expect(screen.root.findByProps({ testID: 'kiosk-credential-input' })).toBeDefined();
    expect(screen.root.findAllByType('Text').some((node: any) => String(node.props.children).includes('Phiên kiosk đã hết hạn hoặc bị thu hồi'))).toBe(true);
    await act(async () => screen.unmount());
  });

  it('shows the same generic code error and drops the sensitive pending code after a definitive rejection', async () => {
    loadCredential.mockResolvedValue('opaque-session-secret');
    punch.mockRejectedValueOnce(new AttendanceKioskApiError('Employee disabled', 'ATTENDANCE_CREDENTIAL_INVALID', 401));
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceKioskScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-attendance-code' }).props.onChangeText('NV000004'); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-punch-submit' }).props.onPress(); await Promise.resolve(); });
    expect(screen.root.findByProps({ testID: 'kiosk-error' }).findAllByType('Text').some((node: any) => String(node.props.children).includes('Mã chấm công không hợp lệ'))).toBe(true);
    expect(screen.root.findAllByProps({ testID: 'kiosk-retry' })).toHaveLength(0);
    expect(screen.root.findByProps({ testID: 'kiosk-attendance-code' }).props.value).toBe('');
    await act(async () => screen.unmount());
  });
});

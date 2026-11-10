import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Search, Upload } from 'lucide-react-native';
import {
  downloadEmployeeScheduleExportApi, downloadEmployeeScheduleTemplateApi,
  fetchEmployeeScheduleShiftsApi, fetchEmployeeScheduleWeekApi,
  type ScheduleOccurrenceDto, type ScheduleShiftDto, type ScheduleExportFormat, type EmployeeScheduleWeekDto, type ScheduleWeekEmployeeDto
} from '../../api/employeeScheduleManagement';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader } from '../../ui';
import { addWeeksToWeekStart, buildScheduleScreenState, buildWeekDays, formatCompensationProjection, getBusinessDate, getMondayWeekStart, isScheduleDateInPast, toScheduleCellModel } from './employeeScheduleViewModel';
import { EmployeeScheduleImportModal } from './EmployeeScheduleImportModal';
import { EmployeeScheduleModal } from './EmployeeScheduleModal';

const PAGE_SIZE = 50;
function downloadBlob(blob: Blob, fileName: string) {
  if (typeof document === 'undefined') return false;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.style.display = 'none';
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  return true;
}

function shiftTone(shift: ScheduleOccurrenceDto, mode: 'light' | 'dark') {
  const label = `${shift.shiftCode} ${shift.shiftName}`.toLocaleLowerCase('vi');
  if (label.includes('sáng') || label.includes('morning')) return mode === 'dark'
    ? { backgroundColor: '#23354A', color: '#B9D7F5', borderColor: '#35516D' }
    : { backgroundColor: '#E9F1FB', color: '#174A7C', borderColor: '#AFC6E6' };
  if (label.includes('chiều') || label.includes('afternoon')) return mode === 'dark'
    ? { backgroundColor: '#4A3520', color: '#F1C78B', borderColor: '#78542E' }
    : { backgroundColor: '#FFF1DD', color: '#8A480B', borderColor: '#F1C78B' };
  if (label.includes('tối') || label.includes('evening')) return mode === 'dark'
    ? { backgroundColor: '#243E31', color: '#A9D6B4', borderColor: '#3D644B' }
    : { backgroundColor: '#E8F3EA', color: '#126334', borderColor: '#A9D6B4' };
  return mode === 'dark'
    ? { backgroundColor: '#403B37', color: '#F7F5F2', borderColor: '#6B6560' }
    : { backgroundColor: '#F4F3F0', color: '#514C47', borderColor: '#D8D4CE' };
}

interface EmployeeScheduleScreenProps { initialWeekStart?: string }
interface ScheduleCellSelection { employeeId: number; workDate: string }

function getScheduleEmployeeRowHeight(
  employee: ScheduleWeekEmployeeDto,
  days: ReturnType<typeof buildWeekDays>,
  selection: ScheduleCellSelection | null,
  today: string
): number {
  const heights = days.map(day => {
    const count = employee.occurrences.filter(occurrence => occurrence.workDate === day.date).length;
    const contentHeight = count > 0 ? count * 62 + (count - 1) * spacing.xs + 2 * spacing.xs : 112;
    const addButtonHeight = selection && selection.employeeId === employee.id && selection.workDate === day.date && !isScheduleDateInPast(day.date, today)
      ? 40 + spacing.xs
      : 0;
    return Math.max(112, contentHeight + addButtonHeight);
  });
  return Math.max(...heights);
}

export const EmployeeScheduleScreen: React.FC<EmployeeScheduleScreenProps> = ({ initialWeekStart }) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { employeeSchedulesRevision, employeeSettingsRevision } = useRestaurant();
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const [weekStart, setWeekStart] = useState(() => getMondayWeekStart(initialWeekStart ?? getBusinessDate()));
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EmployeeScheduleWeekDto | null>(null);
  const [shifts, setShifts] = useState<ScheduleShiftDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<ScheduleCellSelection | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingOccurrence, setEditingOccurrence] = useState<ScheduleOccurrenceDto | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError('');
    try {
      const result = await fetchEmployeeScheduleWeekApi(token, { weekStart, search: search || undefined, page, pageSize: PAGE_SIZE });
      if (currentRequest !== requestId.current) return;
      setData(result);
      if (result.pagination.totalPages > 0 && page > result.pagination.totalPages) setPage(result.pagination.totalPages);
    } catch (failure) {
      if (currentRequest === requestId.current) setError(failure instanceof Error ? failure.message : 'Không thể tải lịch làm việc');
    } finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [page, search, token, weekStart]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (employeeSchedulesRevision > 0) void load(); }, [employeeSchedulesRevision, load]);
  useEffect(() => { if (employeeSettingsRevision > 0) void load(); }, [employeeSettingsRevision, load]);
  useEffect(() => {
    const browserAvailable = typeof window !== 'undefined' && typeof document !== 'undefined';
    const refreshWhenFocused = () => { if (browserAvailable && document.visibilityState === 'visible') void load(); };
    if (browserAvailable) {
      window.addEventListener('focus', refreshWhenFocused);
      document.addEventListener('visibilitychange', refreshWhenFocused);
    }
    const appStateSubscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => {
      if (browserAvailable) {
        window.removeEventListener('focus', refreshWhenFocused);
        document.removeEventListener('visibilitychange', refreshWhenFocused);
      }
      appStateSubscription?.remove();
    };
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    void fetchEmployeeScheduleShiftsApi(token).then(result => { if (!cancelled) setShifts(result); }).catch(failure => {
      if (!cancelled) setError(failure instanceof Error ? failure.message : 'Không thể tải danh sách ca làm');
    });
    return () => { cancelled = true; };
  }, [token]);
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  const openAdd = (cell: ScheduleCellSelection) => { setSelection(cell); setEditingOccurrence(undefined); setScheduleModalOpen(true); };
  const openEdit = (occurrence: ScheduleOccurrenceDto) => {
    setSelection({ employeeId: occurrence.employeeId, workDate: occurrence.workDate });
    setEditingOccurrence(occurrence);
    setScheduleModalOpen(true);
  };
  const closeScheduleModal = () => { setScheduleModalOpen(false); setSelection(null); setEditingOccurrence(undefined); };
  const closeImport = () => setImportOpen(false);
  const handleSaved = async () => {
    closeScheduleModal();
    await load();
  };
  const handleImportSaved = async () => { await load(); };

  const exportWeek = async (format: ScheduleExportFormat) => {
    try {
      const blob = await downloadEmployeeScheduleExportApi(token, weekStart, format);
      if (!downloadBlob(blob, `lich_lam_viec_${weekStart}.${format}`)) setError('Tải file được hỗ trợ trên trình duyệt web.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thể xuất lịch'); }
  };
  const downloadTemplate = async () => {
    try {
      const blob = await downloadEmployeeScheduleTemplateApi(token);
      if (!downloadBlob(blob, 'mau_lich_lam_viec.xlsx')) setError('Tải file được hỗ trợ trên trình duyệt web.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thể tải file mẫu'); }
  };

  const businessToday = getBusinessDate();
  const days = buildWeekDays(weekStart, businessToday);
  const weekEnd = days[6].date;
  const weekLabel = `Tuần ${weekStart.slice(8, 10)}/${weekStart.slice(5, 7)} – ${weekEnd.slice(8, 10)}/${weekEnd.slice(5, 7)}/${weekEnd.slice(0, 4)}`;
  const scheduleState = buildScheduleScreenState({ loading, error, employees: data?.employees ?? [] });

  const headerActions = <View style={[styles.headerActions, compact && styles.headerActionsCompact]}>
    <Button testID="schedule-import" variant="secondary" label="Import" icon={Upload} onPress={() => setImportOpen(true)} />
    <Button testID="schedule-export-csv" variant="quiet" label="Xuất CSV" icon={Download} onPress={() => void exportWeek('csv')} />
    <Button testID="schedule-export-xlsx" variant="quiet" label={compact ? 'Excel' : 'Xuất file'} icon={FileSpreadsheet} onPress={() => void exportWeek('xlsx')} />
  </View>;

  return <View testID="employee-schedule-screen" style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
    <View style={[styles.pageHeader, compact && styles.pageHeaderCompact]}>
      <ScreenHeader title="Lịch làm việc" description="Phân ca theo nhân viên và theo tuần." actions={compact ? undefined : headerActions} />
    </View>
    {compact && <View style={[styles.compactActions, { borderBottomColor: theme.borderSubtle }]}>{headerActions}</View>}
    <View style={[styles.toolbar, compact && styles.toolbarCompact]}>
      <View style={[styles.searchWrap, compact && styles.searchWrapCompact, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <AppIcon icon={Search} color={theme.textSecondary} size={18} />
        <TextInput testID="schedule-search" accessibilityLabel="Tìm kiếm nhân viên" value={searchText} onChangeText={setSearchText} placeholder="Tìm kiếm nhân viên" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.textPrimary }]} />
      </View>
      <View style={[styles.weekControls, compact && styles.weekControlsCompact]}>
        <Pressable testID="schedule-week-previous" accessibilityRole="button" accessibilityLabel="Tuần trước" onPress={() => { setWeekStart(value => addWeeksToWeekStart(value, -1)); setPage(1); }} style={[styles.iconButton, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}><AppIcon icon={ChevronLeft} color={theme.textPrimary} size={18} /></Pressable>
        <View style={[styles.weekLabelWrap, compact && styles.weekLabelWrapCompact, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}><AppIcon icon={CalendarDays} color={theme.primary} size={16} /><Text style={[styles.weekLabel, { color: theme.textPrimary }]} numberOfLines={1}>{weekLabel}</Text></View>
        <Pressable testID="schedule-week-next" accessibilityRole="button" accessibilityLabel="Tuần sau" onPress={() => { setWeekStart(value => addWeeksToWeekStart(value, 1)); setPage(1); }} style={[styles.iconButton, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}><AppIcon icon={ChevronRight} color={theme.textPrimary} size={18} /></Pressable>
        <Button testID="schedule-week-current" variant="secondary" label="Tuần này" onPress={() => { setWeekStart(getMondayWeekStart(getBusinessDate())); setPage(1); }} />
      </View>
      <View style={[styles.viewMode, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <AppIcon icon={CalendarDays} color={theme.textSecondary} size={16} />
        <Text style={[styles.viewModeText, { color: theme.textPrimary }]}>Xem theo nhân viên</Text>
      </View>
    </View>

    {error && <View style={styles.alertWrap}><InlineAlert title="Không thể tải lịch" message={error} testID="schedule-screen-error" /></View>}
    {loading && <View style={styles.loadingRow}><ActivityIndicator color={theme.primary} /><Text style={{ color: theme.textSecondary }}>Đang tải lịch…</Text></View>}
    {!loading && scheduleState.kind === 'empty' && <EmptyState title="Chưa có nhân viên" description="Thêm hồ sơ nhân viên để bắt đầu xếp lịch." testID="schedule-empty" />}

    <View style={[styles.gridFrame, { backgroundColor: theme.surfaceBase }]}>
      <ScrollView style={styles.gridVertical} showsVerticalScrollIndicator>
        <View style={styles.gridContent}>
          <View testID="schedule-fixed-employee-column" style={[styles.fixedEmployeeColumn, { backgroundColor: theme.surfaceBase }]}>
            <View style={[styles.gridHeader, styles.employeeHeading, { backgroundColor: theme.surfaceSunken, borderBottomColor: theme.borderSubtle, borderRightColor: theme.borderSubtle }]}>
              <Text style={[styles.columnHeader, { color: theme.textPrimary }]}>Nhân viên</Text>
            </View>
            {data?.employees.map(employee => <View key={employee.id} testID={`schedule-employee-name-${employee.id}`} style={[styles.employeeCell, styles.employeeNameRow, { height: getScheduleEmployeeRowHeight(employee, days, selection, businessToday), backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle, borderRightColor: theme.borderSubtle }]}>
              <Text style={[styles.employeeName, { color: theme.textPrimary }]} numberOfLines={1}>{employee.name}</Text>
              <Text style={[styles.employeeCode, { color: theme.textSecondary }]}>{employee.code}</Text>
              {employee.department && <Text style={[styles.employeeDepartment, { color: theme.textSecondary }]} numberOfLines={1}>{employee.department.name}</Text>}
            </View>)}
          </View>
          <ScrollView testID="schedule-days-scroll" horizontal style={styles.dayGridScroll} showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: compact ? 7 * 146 + 170 : 7 * 150 + 170 }}>
            <View>
              <View style={[styles.gridHeader, { backgroundColor: theme.surfaceSunken, borderBottomColor: theme.borderSubtle }]}>
                {days.map(day => {
                  const calendarDay = data?.calendarDays.find(item => item.date === day.date);
                  const calendarLabels = [
                    ...(calendarDay && !calendarDay.isWorkingDay ? ['Ngày không làm việc'] : []),
                    ...(calendarDay?.holidays.map(holiday => holiday.name) ?? [])
                  ];
                  return <View key={day.date} style={[styles.dayHeading, day.isToday && { backgroundColor: theme.interactiveSecondary }, { borderRightColor: theme.borderSubtle }]}>
                    <Text style={[styles.dayLabel, { color: day.isToday ? theme.primary : theme.textSecondary }]}>{day.label}</Text>
                    <Text style={[styles.dayNumber, { color: day.isToday ? theme.primary : theme.textPrimary }]}>{day.dayNumber}</Text>
                    {calendarLabels.length > 0 && <View
                      testID={`schedule-calendar-marker-${day.date}`}
                      accessibilityLabel={calendarLabels.join(', ')}
                      style={[styles.calendarMarker, { backgroundColor: theme.interactiveSecondary }]}
                    >
                      <Text numberOfLines={1} style={[styles.calendarMarkerText, { color: theme.primary }]}>{calendarLabels.join(' · ')}</Text>
                    </View>}
                  </View>;
                })}
                <View style={[styles.compensationHeading, { borderLeftColor: theme.borderSubtle }]}><Text style={[styles.columnHeader, { color: theme.textPrimary }]}>Lương dự kiến</Text></View>
              </View>
              {data?.employees.map(employee => <View key={employee.id} testID={`schedule-calendar-row-${employee.id}`} style={[styles.employeeRow, { height: getScheduleEmployeeRowHeight(employee, days, selection, businessToday), backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
                {days.map(day => {
                  const cellOccurrences = employee.occurrences.filter(occurrence => occurrence.workDate === day.date);
                  const isSelected = selection?.employeeId === employee.id && selection.workDate === day.date;
                  const isPast = isScheduleDateInPast(day.date, businessToday);
                  return <Pressable
                    key={day.date} testID={`schedule-cell-${employee.id}-${day.date}`}
                    accessibilityRole="button" accessibilityLabel={`${employee.name}, ${day.label} ${day.dayNumber}`}
                    accessibilityState={{ disabled: isPast }} disabled={isPast}
                    onPress={() => { setSelection({ employeeId: employee.id, workDate: day.date }); setEditingOccurrence(undefined); }}
                    style={[styles.scheduleCell, { height: getScheduleEmployeeRowHeight(employee, days, selection, businessToday), backgroundColor: isSelected ? theme.interactiveSecondary : theme.surfaceBase, borderRightColor: theme.borderSubtle, opacity: isPast ? 0.8 : 1 }]}
                  >
                    {cellOccurrences.map(occurrence => {
                      const model = toScheduleCellModel(occurrence);
                      const tone = shiftTone(occurrence, theme.mode);
                      const cardStyle = [styles.shiftBlock, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }];
                      const contents = <>
                        <Text style={[styles.shiftBlockTitle, { color: tone.color }]} numberOfLines={1}>{model.title}</Text>
                        <Text style={[styles.shiftBlockTime, { color: tone.color }]}>{model.time}</Text>
                        <Text style={[styles.recurrence, { color: tone.color }]}>{model.recurrenceLabel}</Text>
                      </>;
                      if (isScheduleDateInPast(occurrence.workDate, businessToday)) {
                        return <View key={model.key} testID={`schedule-occurrence-${occurrence.ruleId}-${occurrence.workDate}`} style={cardStyle}>{contents}</View>;
                      }
                      return <Pressable key={model.key} testID={`schedule-occurrence-${occurrence.ruleId}-${occurrence.workDate}`} accessibilityRole="button" accessibilityLabel={`Sửa ${model.title}, ${model.time}`} onPress={() => openEdit(occurrence)} style={cardStyle}>{contents}</Pressable>;
                    })}
                    {isSelected && !isPast && <Pressable testID="schedule-add-cell-button" accessibilityRole="button" onPress={() => openAdd({ employeeId: employee.id, workDate: day.date })} style={[styles.addCellButton, { borderColor: theme.primary, backgroundColor: theme.surfaceBase }]}>
                      <Text style={[styles.addCellText, { color: theme.primary }]}>+ Thêm lịch</Text>
                    </Pressable>}
                  </Pressable>;
                })}
                <View style={[styles.compensationCell, { borderLeftColor: theme.borderSubtle }]}>
                  <Text style={[styles.compensationText, { color: theme.textPrimary }]} numberOfLines={2}>{formatCompensationProjection(employee.compensation)}</Text>
                </View>
              </View>)}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>

    <View style={[styles.pager, { borderTopColor: theme.borderSubtle }]}>
      <Text style={[styles.pagerText, { color: theme.textSecondary }]}>{data?.pagination.totalRows ?? 0} nhân viên</Text>
      <View style={styles.pagerActions}>
        <Pressable testID="schedule-page-previous" accessibilityRole="button" accessibilityLabel="Trang trước" disabled={page <= 1} onPress={() => setPage(value => Math.max(1, value - 1))} style={[styles.pageButton, { borderColor: theme.borderSubtle, opacity: page <= 1 ? 0.5 : 1 }]}><AppIcon icon={ChevronLeft} color={theme.textPrimary} size={16} /></Pressable>
        <Text style={[styles.pagerText, { color: theme.textPrimary }]}>{data?.pagination.totalPages ? page : 0}/{data?.pagination.totalPages ?? 0}</Text>
        <Pressable testID="schedule-page-next" accessibilityRole="button" accessibilityLabel="Trang sau" disabled={page >= (data?.pagination.totalPages ?? 0)} onPress={() => setPage(value => value + 1)} style={[styles.pageButton, { borderColor: theme.borderSubtle, opacity: page >= (data?.pagination.totalPages ?? 0) ? 0.5 : 1 }]}><AppIcon icon={ChevronRight} color={theme.textPrimary} size={16} /></Pressable>
      </View>
    </View>

    {scheduleModalOpen && selection && <EmployeeScheduleModal
      visible workDate={selection.workDate} employeeId={selection.employeeId} employees={data?.employees ?? []} shifts={shifts}
      occurrence={editingOccurrence} onClose={closeScheduleModal} onSaved={handleSaved}
      onShiftCreated={shift => setShifts(current => [...current, shift])}
    />}
    {importOpen && <EmployeeScheduleImportModal visible onClose={closeImport} onSaved={handleImportSaved} onDownloadTemplate={() => void downloadTemplate()} />}
  </View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  calendarMarker: { maxWidth: 132, marginTop: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 999 },
  calendarMarkerText: { fontSize: 9, fontWeight: '600' },
  pageHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  pageHeaderCompact: { paddingHorizontal: spacing.md },
  compactActions: { borderBottomWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  headerActionsCompact: { flexWrap: 'wrap', justifyContent: 'flex-end' },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  toolbarCompact: { alignItems: 'stretch', paddingHorizontal: spacing.md },
  searchWrap: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, height: 44, maxWidth: 320, minWidth: 220, paddingHorizontal: spacing.md },
  searchWrapCompact: { maxWidth: undefined, minWidth: undefined, width: '100%' },
  searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.sm, height: 42, outlineStyle: 'none' } as any,
  weekControls: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  weekControlsCompact: { width: '100%' },
  iconButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, height: 44, justifyContent: 'center', width: 40 },
  weekLabelWrap: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, height: 44, paddingHorizontal: spacing.md },
  weekLabelWrapCompact: { flexShrink: 1 },
  weekLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  viewMode: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  viewModeText: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  alertWrap: { paddingHorizontal: spacing.lg },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  gridFrame: { flex: 1, marginHorizontal: spacing.lg, minHeight: 240, overflow: 'hidden' },
  gridVertical: { flex: 1 },
  gridContent: { flexDirection: 'row', alignItems: 'stretch', minHeight: 0 },
  fixedEmployeeColumn: { width: 190, zIndex: 1 },
  dayGridScroll: { flex: 1, minWidth: 0 },
  gridHeader: { borderBottomWidth: 1, flexDirection: 'row', height: 60 },
  employeeHeading: { alignItems: 'flex-start', borderRightWidth: 1, justifyContent: 'center', paddingHorizontal: spacing.md, width: 190 },
  columnHeader: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  dayHeading: { alignItems: 'center', borderRightWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', width: 150 },
  dayLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  dayNumber: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  compensationHeading: { alignItems: 'center', borderLeftWidth: 1, justifyContent: 'center', width: 170 },
  employeeRow: { borderBottomWidth: 1, flexDirection: 'row', minHeight: 112 },
  employeeNameRow: { borderBottomWidth: 1, minHeight: 112 },
  employeeCell: { borderRightWidth: 1, justifyContent: 'center', paddingHorizontal: spacing.md, width: 190 },
  employeeName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  employeeCode: { fontFamily: typography.families.operational, fontSize: typography.sizes.sm, marginTop: 2 },
  employeeDepartment: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, marginTop: 4 },
  scheduleCell: { borderRightWidth: 1, gap: spacing.xs, justifyContent: 'flex-start', minHeight: 112, padding: spacing.xs, width: 150 },
  shiftBlock: { borderRadius: radii.md, borderWidth: 1, gap: 2, minHeight: 62, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  shiftBlockTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  shiftBlockTime: { fontFamily: typography.families.operational, fontSize: typography.sizes.sm },
  recurrence: { fontFamily: typography.families.body, fontSize: 10 },
  addCellButton: { alignItems: 'center', borderRadius: radii.md, borderStyle: 'dashed', borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing.xs },
  addCellText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  compensationCell: { alignItems: 'center', borderLeftWidth: 1, justifyContent: 'center', paddingHorizontal: spacing.md, width: 170 },
  compensationText: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm, textAlign: 'center' },
  pager: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: spacing.lg },
  pagerText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  pagerActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  pageButton: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
});

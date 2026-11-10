import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BadgeDollarSign, Banknote, CalendarDays, Clock3, Settings, Users } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon } from '../../ui';
import { EmployeeManagementScreen } from './EmployeeManagementScreen';
import { EmployeeScheduleScreen } from './EmployeeScheduleScreen';
import { EmployeeAttendanceScreen } from './EmployeeAttendanceScreen';
import { EmployeePayrollScreen } from './EmployeePayrollScreen';
import { EmployeeCommissionScreen } from './EmployeeCommissionScreen';
import { EmployeeSettingsScreen } from './EmployeeSettingsScreen';

export type EmployeeWorkspaceSection = 'directory' | 'schedule' | 'attendance' | 'payroll' | 'commission' | 'settings';

export const EmployeeWorkspaceScreen: React.FC = () => {
  const { theme } = useTheme();
  const [section, setSection] = useState<EmployeeWorkspaceSection>('directory');
  const navigateFromSettings = (destination: string) => {
    const targets: Record<string, EmployeeWorkspaceSection> = {
      'employee-directory': 'directory', 'employee-schedule': 'schedule', 'employee-attendance': 'attendance', 'employee-payroll': 'payroll'
    };
    const target = targets[destination]; if (target) setSection(target);
  };
  return <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
    <View accessibilityRole="tablist" style={[styles.subnav, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
      <Pressable
        testID="employee-workspace-directory"
        accessibilityRole="tab"
        accessibilityState={{ selected: section === 'directory' }}
        onPress={() => setSection('directory')}
        style={[styles.tab, section === 'directory' && { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}
      >
        <AppIcon icon={Users} color={section === 'directory' ? theme.primary : theme.textSecondary} size={18} />
        <Text style={[styles.tabText, { color: section === 'directory' ? theme.textPrimary : theme.textSecondary }]}>Danh sách nhân viên</Text>
      </Pressable>
      <Pressable
        testID="employee-workspace-schedule"
        accessibilityRole="tab"
        accessibilityState={{ selected: section === 'schedule' }}
        onPress={() => setSection('schedule')}
        style={[styles.tab, section === 'schedule' && { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}
      >
        <AppIcon icon={CalendarDays} color={section === 'schedule' ? theme.primary : theme.textSecondary} size={18} />
        <Text style={[styles.tabText, { color: section === 'schedule' ? theme.textPrimary : theme.textSecondary }]}>Lịch làm việc</Text>
      </Pressable>
      <Pressable
        testID="employee-workspace-attendance"
        accessibilityRole="tab"
        accessibilityState={{ selected: section === 'attendance' }}
        onPress={() => setSection('attendance')}
        style={[styles.tab, section === 'attendance' && { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}
      >
        <AppIcon icon={Clock3} color={section === 'attendance' ? theme.primary : theme.textSecondary} size={18} />
        <Text style={[styles.tabText, { color: section === 'attendance' ? theme.textPrimary : theme.textSecondary }]}>Bảng chấm công</Text>
      </Pressable>
      <Pressable
        testID="employee-workspace-payroll"
        accessibilityRole="tab"
        accessibilityState={{ selected: section === 'payroll' }}
        onPress={() => setSection('payroll')}
        style={[styles.tab, section === 'payroll' && { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}
      >
        <AppIcon icon={Banknote} color={section === 'payroll' ? theme.primary : theme.textSecondary} size={18} />
        <Text style={[styles.tabText, { color: section === 'payroll' ? theme.textPrimary : theme.textSecondary }]}>Bảng lương</Text>
      </Pressable>
      <Pressable
        testID="employee-workspace-commission"
        accessibilityRole="tab"
        accessibilityState={{ selected: section === 'commission' }}
        onPress={() => setSection('commission')}
        style={[styles.tab, section === 'commission' && { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}
      >
        <AppIcon icon={BadgeDollarSign} color={section === 'commission' ? theme.primary : theme.textSecondary} size={18} />
        <Text style={[styles.tabText, { color: section === 'commission' ? theme.textPrimary : theme.textSecondary }]}>Bảng hoa hồng</Text>
      </Pressable>
      <Pressable
        testID="employee-workspace-settings"
        accessibilityRole="tab"
        accessibilityState={{ selected: section === 'settings' }}
        onPress={() => setSection('settings')}
        style={[styles.tab, section === 'settings' && { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}
      >
        <AppIcon icon={Settings} color={section === 'settings' ? theme.primary : theme.textSecondary} size={18} />
        <Text style={[styles.tabText, { color: section === 'settings' ? theme.textPrimary : theme.textSecondary }]}>Thiết lập nhân viên</Text>
      </Pressable>
    </View>
    <View style={styles.content}>
      {section === 'directory'
        ? <EmployeeManagementScreen />
        : section === 'schedule'
          ? <EmployeeScheduleScreen />
          : section === 'attendance'
            ? <EmployeeAttendanceScreen />
            : section === 'payroll'
              ? <EmployeePayrollScreen />
              : section === 'commission'
                ? <EmployeeCommissionScreen />
                : <EmployeeSettingsScreen onNavigate={navigateFromSettings} />}
    </View>
  </View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  subnav: { alignItems: 'stretch', borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg },
  tab: { alignItems: 'center', borderBottomColor: 'transparent', borderBottomWidth: 3, borderTopLeftRadius: radii.sm, borderTopRightRadius: radii.sm, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: spacing.touchTargetMobile, paddingHorizontal: spacing.md },
  tabText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  content: { flex: 1, minHeight: 0 }
});

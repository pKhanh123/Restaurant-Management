import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  BarChart3,
  ChefHat,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Moon,
  ShoppingCart,
  Sun,
  Tag,
  Utensils,
  Warehouse,
  Tags,
  UserRound
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { Role } from '../api/contracts';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { radii, spacing, typography } from '../theme';
import { AppIcon, BrandMark, StatusBadge } from '../ui';
import { POSScreen } from '../features/pos/POSScreen';
import { TableScreen } from '../features/tables/TableScreen';
import { KDSScreen } from '../features/kds/KDSScreen';
import { ReportsWorkspaceScreen } from '../features/reports/ReportsWorkspaceScreen';
import { MenuManagementScreen } from '../features/admin/MenuManagementScreen';
import { AuditLogScreen } from '../features/admin/AuditLogScreen';
import { InventoryScreen } from '../features/admin/InventoryScreen';
import { VoucherManagementScreen } from '../features/admin/VoucherManagementScreen';
import { PriceListScreen } from '../features/admin/PriceListScreen';
import { OrdersScreen } from '../features/orders/OrdersScreen';
import { CustomerManagementScreen } from '../features/admin/CustomerManagementScreen';
import { ReservationManagementScreen } from '../features/admin/ReservationManagementScreen';
import { EmployeeWorkspaceScreen } from '../features/admin/EmployeeWorkspaceScreen';
import { CashbookScreen } from '../features/cashbook/CashbookScreen';

type TabKey = 'pos' | 'tables' | 'kds' | 'reports' | 'menu' | 'pricing' | 'inventory' | 'orders' | 'vouchers' | 'audit' | 'customers' | 'reservations' | 'employees' | 'cashbook';

interface TabItem {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  component: React.ComponentType;
}

const tabsByRole = {
  CASHIER: [
    { key: 'pos', label: 'Bán hàng', icon: ShoppingCart, component: POSScreen },
    { key: 'tables', label: 'Bàn', icon: LayoutGrid, component: TableScreen },
    { key: 'reservations', label: 'Đặt bàn', icon: ClipboardList, component: ReservationManagementScreen },
    { key: 'orders', label: 'Đơn hàng', icon: ClipboardList, component: OrdersScreen },
    { key: 'cashbook', label: 'Sổ quỹ', icon: ClipboardList, component: CashbookScreen }
  ],
  KITCHEN: [
    { key: 'kds', label: 'Bếp', icon: ChefHat, component: KDSScreen }
  ],
  ADMIN: [
    { key: 'reports', label: 'Báo cáo', icon: BarChart3, component: ReportsWorkspaceScreen },
    { key: 'menu', label: 'Thực đơn', icon: Utensils, component: MenuManagementScreen },
    { key: 'pricing', label: 'Bảng giá', icon: Tags, component: PriceListScreen },
    { key: 'inventory', label: 'Kho hàng', icon: Warehouse, component: InventoryScreen },
    { key: 'orders', label: 'Đơn hàng', icon: ClipboardList, component: OrdersScreen },
    { key: 'vouchers', label: 'Ưu đãi', icon: Tag, component: VoucherManagementScreen },
    { key: 'customers', label: 'Khách hàng', icon: UserRound, component: CustomerManagementScreen },
    { key: 'employees', label: 'Nhân viên', icon: UserRound, component: EmployeeWorkspaceScreen },
    { key: 'reservations', label: 'Đặt bàn', icon: ClipboardList, component: ReservationManagementScreen },
    { key: 'tables', label: 'Bàn', icon: LayoutGrid, component: TableScreen },
    { key: 'audit', label: 'Nhật ký', icon: ClipboardList, component: AuditLogScreen },
    { key: 'cashbook', label: 'Sổ quỹ', icon: ClipboardList, component: CashbookScreen }
  ]
} satisfies Record<string, TabItem[]>;

export const getTabsForRole = (role: Role): TabItem[] => tabsByRole[role];

const roleLabels = {
  CASHIER: 'Thu ngân',
  KITCHEN: 'Bếp',
  ADMIN: 'Quản trị'
} as const;

interface NavigationItemsProps {
  tabs: TabItem[];
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
  vertical?: boolean;
}

const NavigationItems: React.FC<NavigationItemsProps> = ({ tabs, activeTab, onSelect, vertical = false }) => {
  const { theme } = useTheme();

  return (
    <View style={vertical ? styles.verticalNav : styles.horizontalNav}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            testID={`tab-${tab.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => onSelect(tab.key)}
            style={({ pressed }) => [
              vertical ? styles.railItem : styles.tabItem,
              { backgroundColor: active ? theme.interactiveSecondary : pressed ? theme.interactiveQuiet : 'transparent', borderColor: 'transparent' },
              active && { borderColor: theme.primary }
            ]}
          >
            <AppIcon icon={tab.icon} color={active ? theme.primary : theme.textSecondary} size={20} />
            <Text style={[styles.navLabel, { color: active ? theme.textPrimary : theme.textSecondary }]} numberOfLines={1}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export const RoleTabs: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1200;
  const isMobile = width < 768;
  const tabs = useMemo(() => getTabsForRole(user?.role || 'ADMIN'), [user?.role]);
  const [activeTab, setActiveTab] = useState<TabKey>(() => tabsByRole[user?.role || 'ADMIN'][0]?.key || 'reports');

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  const selected = tabs.find((tab) => tab.key === activeTab) || tabs[0];
  const ActiveComponent = selected.component;
  const roleLabel = roleLabels[user?.role || 'ADMIN'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={[styles.commandBar, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.identity}>
          <BrandMark compact={isMobile} size={isMobile ? 'small' : 'medium'} />
          {!isMobile && <View style={[styles.separator, { backgroundColor: theme.borderSubtle }]} />}
          <View style={styles.userCopy}>
            <StatusBadge tone={user?.role === 'KITCHEN' ? 'warning' : user?.role === 'ADMIN' ? 'info' : 'neutral'} label={roleLabel} />
            {!isMobile && <Text style={[styles.userName, { color: theme.textSecondary }]} numberOfLines={1}>{user?.name}</Text>}
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            onPress={toggleTheme}
            style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet, borderColor: theme.borderSubtle }]}
          >
            <AppIcon icon={isDark ? Sun : Moon} color={theme.textPrimary} size={18} />
          </Pressable>
          <Pressable
            testID="btn-logout"
            accessibilityRole="button"
            accessibilityLabel="Đăng xuất"
            onPress={logout}
            style={({ pressed }) => [styles.logoutButton, { backgroundColor: pressed ? theme.surfaceSunken : 'transparent', borderColor: theme.borderSubtle }]}
          >
            <AppIcon icon={LogOut} color={theme.danger} size={18} />
            {!isMobile && <Text style={[styles.logoutLabel, { color: theme.danger }]}>Đăng xuất</Text>}
          </Pressable>
        </View>
      </View>

      {!isDesktop && !isMobile && tabs.length > 1 && (
        <View style={[styles.tabletNav, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
          <NavigationItems tabs={tabs} activeTab={selected.key} onSelect={setActiveTab} />
        </View>
      )}

      <View style={styles.workspace}>
        {isDesktop && tabs.length > 1 && (
          <View style={[styles.rail, { backgroundColor: theme.surfaceBase, borderRightColor: theme.borderSubtle }]}>
            <Text style={[styles.railHeading, { color: theme.textSecondary }]}>Khu vực làm việc</Text>
            <NavigationItems tabs={tabs} activeTab={selected.key} onSelect={setActiveTab} vertical />
          </View>
        )}
        <View style={styles.screenContainer}>
          <ActiveComponent />
        </View>
      </View>

      {isMobile && tabs.length > 1 && (
        <View style={[styles.bottomNav, { backgroundColor: theme.surfaceBase, borderTopColor: theme.borderSubtle }]}>
          <NavigationItems tabs={tabs} activeTab={selected.key} onSelect={setActiveTab} />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  commandBar: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  identity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
  separator: { height: 32, width: 1 },
  userCopy: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
  userName: { flexShrink: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  actions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  iconButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  logoutButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  logoutLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  workspace: { flex: 1, flexDirection: 'row' },
  screenContainer: { flex: 1, minWidth: 0 },
  tabletNav: { borderBottomWidth: 1, paddingHorizontal: spacing.md },
  rail: { borderRightWidth: 1, padding: spacing.md, width: 208 },
  railHeading: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs, marginBottom: spacing.sm, paddingHorizontal: spacing.sm },
  verticalNav: { gap: spacing.xs },
  horizontalNav: { flexDirection: 'row', gap: spacing.xs },
  railItem: { alignItems: 'center', borderLeftWidth: 3, borderRadius: radii.sm, flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md },
  tabItem: { alignItems: 'center', borderBottomWidth: 3, borderRadius: radii.sm, flex: 1, gap: 2, justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  navLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  bottomNav: { borderTopWidth: 1, paddingHorizontal: spacing.xs },
});

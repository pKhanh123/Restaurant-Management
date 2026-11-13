import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createNativeComponent } = vi.hoisted(() => ({
  createNativeComponent: (name: string) => {
    const Component = (props: any) => React.createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  }
}));
const { stubScreen } = vi.hoisted(() => ({ stubScreen: () => () => null }));
const { getDocumentAsyncMock, getScreenWidth, setScreenWidth } = vi.hoisted(() => {
  let screenWidth = 1200;
  return { getDocumentAsyncMock: vi.fn(), getScreenWidth: () => screenWidth, setScreenWidth: (width: number) => { screenWidth = width; } };
});

vi.mock('react-native', () => ({
  ActivityIndicator: createNativeComponent('ActivityIndicator'), Alert: { alert: vi.fn() }, Image: createNativeComponent('Image'),
  Modal: createNativeComponent('Modal'), Platform: { OS: 'web' }, Pressable: createNativeComponent('Pressable'),
  ScrollView: createNativeComponent('ScrollView'), StyleSheet: { create: (styles: any) => styles },
  Text: createNativeComponent('Text'), TextInput: createNativeComponent('TextInput'), View: createNativeComponent('View'),
  useWindowDimensions: () => ({ width: getScreenWidth(), height: 900 })
}));
vi.mock('lucide-react-native', () => {
  const Icon = createNativeComponent('Icon');
  return { BarChart3: Icon, BriefcaseBusiness: Icon, Camera: Icon, ChefHat: Icon, ChevronDown: Icon, ChevronUp: Icon, ClipboardList: Icon, Filter: Icon, LayoutGrid: Icon, LogOut: Icon, Moon: Icon, Plus: Icon, RefreshCw: Icon, Search: Icon, ShoppingCart: Icon, Sun: Icon, Tag: Icon, Tags: Icon, Utensils: Icon, UserRound: Icon, Warehouse: Icon, X: Icon };
});
vi.mock('expo-document-picker', () => ({ getDocumentAsync: getDocumentAsyncMock }));
vi.mock('../pos/POSScreen', () => ({ POSScreen: stubScreen() }));
vi.mock('../tables/TableScreen', () => ({ TableScreen: stubScreen() }));
vi.mock('../kds/KDSScreen', () => ({ KDSScreen: stubScreen() }));
vi.mock('../reports/DashboardScreen', () => ({ DashboardScreen: stubScreen() }));
vi.mock('./MenuManagementScreen', () => ({ MenuManagementScreen: stubScreen() }));
vi.mock('./AuditLogScreen', () => ({ AuditLogScreen: stubScreen() }));
vi.mock('./InventoryScreen', () => ({ InventoryScreen: stubScreen() }));
vi.mock('./VoucherManagementScreen', () => ({ VoucherManagementScreen: stubScreen() }));
vi.mock('./PriceListScreen', () => ({ PriceListScreen: stubScreen() }));
vi.mock('../../features/orders/OrdersScreen', () => ({ OrdersScreen: stubScreen() }));
vi.mock('./CustomerManagementScreen', () => ({ CustomerManagementScreen: stubScreen() }));
vi.mock('./ReservationManagementScreen', () => ({ ReservationManagementScreen: stubScreen() }));
vi.mock('./EmployeeSettingsScreen', () => ({ EmployeeSettingsScreen: stubScreen() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-token' }) }));
vi.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: () => ({ employeesRevision: 0 }) }));
vi.mock('../../api/config', () => ({ getApiBaseUrl: () => 'https://api.example.test', resolveImageUrl: (url: string) => url }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {
  surfaceCanvas: '#f6f7f9', surfaceBase: '#fff', surfaceRaised: '#fff', surfaceSunken: '#f3f4f6',
  borderSubtle: '#d4d9e0', borderStrong: '#aab2bd', textPrimary: '#142338', textSecondary: '#67768b',
  primary: '#0878f9', interactivePrimary: '#0878f9', interactivePrimaryPressed: '#0562ce', interactiveSecondary: '#e7f1ff',
  interactiveSecondaryPressed: '#d6e8ff', interactiveQuiet: '#f6f7f9', focusRing: '#0878f9', interactiveDanger: '#ce4949',
  interactiveDangerPressed: '#b23535', textInverse: '#fff', danger: '#c83535'
} }) }));
vi.mock('../../ui', () => ({
  AppIcon: () => React.createElement('Icon'),
  Button: ({ label, onPress, disabled, testID }: any) => React.createElement('Pressable', { onPress, disabled, testID }, React.createElement('Text', null, label)),
  EmptyState: ({ title, description, action, testID }: any) => React.createElement('View', { testID }, React.createElement('Text', null, title), React.createElement('Text', null, description), action),
  Field: ({ label, testID, accessibilityLabel, ...props }: any) => React.createElement('View', null, React.createElement('Text', null, label), React.createElement('TextInput', { testID, accessibilityLabel, ...props })),
  InlineAlert: ({ title, message }: any) => React.createElement('Text', null, `${title || ''}: ${message}`),
  ScreenHeader: ({ title, description, actions }: any) => React.createElement('View', null, React.createElement('Text', null, title), React.createElement('Text', null, description), actions),
  StatusBadge: ({ label }: any) => React.createElement('Text', null, label)
}));
vi.mock('../../api/employeeManagement', () => ({
  appendEmployeeCompensationApi: vi.fn(), createEmployeeApi: vi.fn(), fetchEmployeeApi: vi.fn(),
  fetchEmployeeDepartmentsApi: vi.fn(), fetchEmployeeJobTitlesApi: vi.fn(), fetchEmployeesApi: vi.fn(),
  fetchLinkableUsersApi: vi.fn(), saveEmployeeDepartmentApi: vi.fn(), saveEmployeeJobTitleApi: vi.fn(),
  updateEmployeeApi: vi.fn(), updateEmployeeStatusApi: vi.fn(), uploadEmployeeAvatarApi: vi.fn()
}));

import {
  appendEmployeeCompensationApi, createEmployeeApi, fetchEmployeeApi, fetchEmployeeDepartmentsApi, fetchEmployeeJobTitlesApi, fetchEmployeesApi,
  fetchLinkableUsersApi, updateEmployeeApi, updateEmployeeStatusApi, uploadEmployeeAvatarApi
} from '../../api/employeeManagement';
import { EmployeeManagementScreen } from './EmployeeManagementScreen';
import { getTabsForRole } from '../../navigation/RoleTabs';
import { ReportsWorkspaceScreen } from '../reports/ReportsWorkspaceScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const emptyResult = { items: [], pagination: { page: 1, pageSize: 30, totalRows: 0, totalPages: 0 }, summary: { totalCount: 0, workingCount: 0, resignedCount: 0 } };
const profile = {
  id: 7, code: 'NV000007', attendanceCode: 'CC000007', name: 'Nguyễn Minh Anh', phone: '0903000280', status: 'WORKING',
  nationalId: '••••••••6789', note: null, department: { id: 2, name: 'Bếp', isActive: true }, jobTitle: { id: 3, name: 'Đầu bếp', isActive: true },
  debtAdvance: null, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z'
};

describe('employee management screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setScreenWidth(1200);
    vi.mocked(fetchEmployeesApi).mockResolvedValue(emptyResult);
    vi.mocked(fetchEmployeeDepartmentsApi).mockResolvedValue([{ id: 2, name: 'Bếp', isActive: true }]);
    vi.mocked(fetchEmployeeJobTitlesApi).mockResolvedValue([{ id: 3, name: 'Đầu bếp', isActive: true }]);
    vi.mocked(fetchLinkableUsersApi).mockResolvedValue([{ id: 99, username: 'minhanh', name: 'Nguyễn Minh Anh', role: 'CASHIER' }]);
    getDocumentAsyncMock.mockReset();
    vi.mocked(uploadEmployeeAvatarApi).mockResolvedValue({ avatarUrl: '/uploads/employee_avatar_test.png', fileName: 'employee_avatar_test.png' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders employee list and the actual empty state', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    expect(JSON.stringify(screen.toJSON())).toContain('Chưa có nhân viên');
    expect(JSON.stringify(screen.toJSON())).toContain('Thêm nhân viên');

    vi.mocked(fetchEmployeesApi).mockResolvedValue({ ...emptyResult, items: [profile as any], pagination: { ...emptyResult.pagination, totalRows: 1, totalPages: 1 }, summary: { totalCount: 1, workingCount: 1, resignedCount: 0 } });
    await act(async () => { screen.root.findByProps({ testID: 'employee-refresh' }).props.onPress(); await Promise.resolve(); });
    expect(JSON.stringify(screen.toJSON())).toContain('Nguyễn Minh Anh');
    await act(async () => screen.unmount());
  });

  it('filters by status, department and job title', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-filter-resigned' }).props.onPress(); await Promise.resolve(); });
    expect(fetchEmployeesApi).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ status: 'RESIGNED' }));
    await act(async () => { screen.root.findByProps({ testID: 'employee-department-filter' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-department-2' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-job-title-filter' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-job-title-3' }).props.onPress(); await Promise.resolve(); });
    expect(fetchEmployeesApi).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ status: 'RESIGNED', departmentId: 2, jobTitleId: 3 }));
    await act(async () => screen.unmount());
  });

  it('opens employee form and validates required name and phone', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-add' }).props.onPress(); await Promise.resolve(); });
    expect(screen.root.findByProps({ testID: 'employee-save' }).props.disabled).toBe(true);
    await act(async () => { screen.root.findByProps({ testID: 'employee-name' }).props.onChangeText('Nguyễn Minh Anh'); });
    expect(screen.root.findByProps({ testID: 'employee-save' }).props.disabled).toBe(true);
    await act(async () => { screen.root.findByProps({ testID: 'employee-phone' }).props.onChangeText('0903000280'); });
    expect(screen.root.findByProps({ testID: 'employee-save' }).props.disabled).toBe(false);
    await act(async () => screen.unmount());
  });

  it('resets pagination when the debounced employee search changes', async () => {
    vi.mocked(fetchEmployeesApi).mockImplementation(async (_token, filter) => ({
      ...emptyResult,
      pagination: { page: filter?.page ?? 1, pageSize: 30, totalRows: 31, totalPages: 2 }
    }));
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    const findNextButton = () => screen.root.findAllByType('Pressable').find((node: any) => node.findAllByType('Text').some((text: any) => text.children.includes('Sau')));
    await vi.waitFor(() => expect(findNextButton()?.props.disabled).toBe(false));
    const nextButton = findNextButton();
    expect(nextButton).toBeDefined();
    await act(async () => { nextButton.props.onPress(); });
    await vi.waitFor(() => expect(fetchEmployeesApi).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ page: 2 })));
    await act(async () => { screen.root.findByProps({ testID: 'employee-search' }).props.onChangeText('Minh'); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
    expect(fetchEmployeesApi).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ page: 1, search: 'Minh' }));
    await act(async () => screen.unmount());
  });

  it('saves optional linked user and initial compensation data', async () => {
    vi.mocked(createEmployeeApi).mockResolvedValue({ ...profile, userId: 99, avatarUrl: null, departmentId: 2, jobTitleId: 3, startDate: null, endDate: null, birthDate: null, gender: null, address: null, province: null, ward: null, email: null, facebook: null, bankName: null, bankAccountNumber: null, bankAccountName: null, user: null, compensations: [] } as any);
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-add' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-name' }).props.onChangeText('Nguyễn Minh Anh'); screen.root.findByProps({ testID: 'employee-phone' }).props.onChangeText('0903000280'); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-section-work' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-account-picker' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-user-99' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-form-tab-salary' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-base-rate' }).props.onChangeText('12000000'); screen.root.findByProps({ testID: 'employee-effective-from' }).props.onChangeText('2026-09-01'); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-compensation-note' }).props.onChangeText('Lương thử việc'); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-save' }).props.onPress(); await Promise.resolve(); });
    expect(createEmployeeApi).toHaveBeenCalledWith('admin-token', expect.objectContaining({
      name: 'Nguyễn Minh Anh', phone: '0903000280', userId: 99,
      initialCompensation: { payBasis: 'MONTHLY', baseRate: 12000000, effectiveFrom: '2026-09-01', note: 'Lương thử việc' }
    }));
    await act(async () => screen.unmount());
  });

  it('does not append a duplicate salary history when editing only profile fields', async () => {
    const detail = { ...profile, userId: null, avatarUrl: null, departmentId: 2, jobTitleId: 3, startDate: null, endDate: null, birthDate: null, gender: null, address: null, province: null, ward: null, email: null, facebook: null, bankName: null, bankAccountNumber: null, bankAccountName: null, user: null, compensations: [{ id: 5, employeeId: 7, payBasis: 'MONTHLY', baseRate: 12000000, effectiveFrom: '2026-09-01T00:00:00.000Z', note: null }] };
    vi.mocked(fetchEmployeesApi).mockResolvedValue({ ...emptyResult, items: [profile as any], pagination: { ...emptyResult.pagination, totalRows: 1, totalPages: 1 }, summary: { totalCount: 1, workingCount: 1, resignedCount: 0 } });
    vi.mocked(fetchEmployeeApi).mockResolvedValue(detail as any);
    vi.mocked(updateEmployeeApi).mockResolvedValue(detail as any);
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-row-7' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-name' }).props.onChangeText('Nguyễn Minh Anh mới'); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-save' }).props.onPress(); await Promise.resolve(); });
    expect(updateEmployeeApi).toHaveBeenCalledWith('admin-token', 7, expect.objectContaining({ name: 'Nguyễn Minh Anh mới' }));
    expect(appendEmployeeCompensationApi).not.toHaveBeenCalled();
    await act(async () => screen.unmount());
  });

  it('allows adding a non-duplicate retroactive compensation entry', async () => {
    const detail = { ...profile, userId: null, avatarUrl: null, departmentId: 2, jobTitleId: 3, startDate: null, endDate: null, birthDate: null, gender: null, address: null, province: null, ward: null, email: null, facebook: null, bankName: null, bankAccountNumber: null, bankAccountName: null, user: null, compensations: [{ id: 5, employeeId: 7, payBasis: 'MONTHLY', baseRate: 12000000, effectiveFrom: '2026-09-01T00:00:00.000Z', note: null }] };
    vi.mocked(fetchEmployeesApi).mockResolvedValue({ ...emptyResult, items: [profile as any], pagination: { ...emptyResult.pagination, totalRows: 1, totalPages: 1 }, summary: { totalCount: 1, workingCount: 1, resignedCount: 0 } });
    vi.mocked(fetchEmployeeApi).mockResolvedValue(detail as any);
    vi.mocked(updateEmployeeApi).mockResolvedValue(detail as any);
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-row-7' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-form-tab-salary' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-base-rate' }).props.onChangeText('13000000'); screen.root.findByProps({ testID: 'employee-effective-from' }).props.onChangeText('2026-08-01'); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-save' }).props.onPress(); await Promise.resolve(); });
    expect(appendEmployeeCompensationApi).toHaveBeenCalledWith('admin-token', 7, expect.objectContaining({ baseRate: 13000000, effectiveFrom: '2026-08-01' }));
    await act(async () => screen.unmount());
  });

  it('validates image type and size before requesting an employee avatar upload', async () => {
    getDocumentAsyncMock.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'large.png', mimeType: 'image/png', size: 2 * 1024 * 1024 + 1, base64: 'iVBORw0KGgo=' }] });
    getDocumentAsyncMock.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'avatar.png', mimeType: 'image/png', size: 10, base64: 'iVBORw0KGgo=' }] });
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-add' }).props.onPress(); await Promise.resolve(); });
    await act(async () => {
      screen.root.findByProps({ testID: 'employee-avatar' }).props.onPress();
      await vi.waitFor(() => expect(JSON.stringify(screen.toJSON())).toContain('tối đa 2 MiB'));
    });
    expect(uploadEmployeeAvatarApi).not.toHaveBeenCalled();
    expect(JSON.stringify(screen.toJSON())).toContain('tối đa 2 MiB');
    await act(async () => {
      screen.root.findByProps({ testID: 'employee-avatar' }).props.onPress();
      await vi.waitFor(() => expect(uploadEmployeeAvatarApi).toHaveBeenCalled());
    });
    expect(uploadEmployeeAvatarApi).toHaveBeenCalledWith('admin-token', 'data:image/png;base64,iVBORw0KGgo=', 'avatar.png');
    await act(async () => screen.unmount());
  });

  it('stacks the employee identity and avatar fields on narrow screens', async () => {
    setScreenWidth(390);
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-add' }).props.onPress(); await Promise.resolve(); });
    const identity = screen.root.findByProps({ testID: 'employee-identity-section' });
    expect(identity.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]));
    await act(async () => screen.unmount());
  });

  it('keeps searched login accounts visible if the initial account lookup fails late', async () => {
    const pending: Array<{ resolve: (users: any[]) => void; reject: (error: Error) => void }> = [];
    vi.mocked(fetchLinkableUsersApi).mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })) as any);
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-add' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-section-work' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-account-picker' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-account-search' }).props.onChangeText('Khanh'); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
    expect(fetchLinkableUsersApi).toHaveBeenLastCalledWith('admin-token', 'Khanh');
    expect(pending).toHaveLength(2);
    await act(async () => { pending[1].resolve([{ id: 101, username: 'khanh', name: 'Phan Văn Khánh', role: 'CASHIER' }]); await Promise.resolve(); });
    await act(async () => { pending[0].reject(new Error('Lần tải ban đầu thất bại')); await Promise.resolve(); await Promise.resolve(); });
    expect(JSON.stringify(screen.toJSON())).toContain('Phan Văn Khánh');
    expect(JSON.stringify(screen.toJSON())).not.toContain('Kết quả cũ');
    await act(async () => screen.unmount());
  });

  it('lets an admin resign and reactivate an employee from the edit form', async () => {
    const detail = { ...profile, userId: null, avatarUrl: null, departmentId: 2, jobTitleId: 3, startDate: null, endDate: null, birthDate: null, gender: null, address: null, province: null, ward: null, email: null, facebook: null, bankName: null, bankAccountNumber: null, bankAccountName: null, user: null, compensations: [] };
    vi.mocked(fetchEmployeesApi).mockResolvedValue({ ...emptyResult, items: [profile as any], pagination: { ...emptyResult.pagination, totalRows: 1, totalPages: 1 }, summary: { totalCount: 1, workingCount: 1, resignedCount: 0 } });
    vi.mocked(fetchEmployeeApi).mockResolvedValueOnce(detail as any).mockResolvedValueOnce({ ...detail, status: 'RESIGNED', endDate: '2026-09-29T00:00:00.000Z' } as any);
    vi.mocked(updateEmployeeStatusApi).mockResolvedValue(detail as any);
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-row-7' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-section-work' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-status-toggle' }).props.onPress(); });
    expect(JSON.stringify(screen.toJSON())).toContain('Để trống ngày nghỉ việc để dùng ngày hôm nay');
    await act(async () => { screen.root.findByProps({ testID: 'employee-status-end-date' }).props.onChangeText('2026-09-28'); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-status-confirm' }).props.onPress(); await Promise.resolve(); });
    expect(updateEmployeeStatusApi).toHaveBeenLastCalledWith('admin-token', 7, { status: 'RESIGNED', endDate: '2026-09-28' });

    await act(async () => { screen.root.findByProps({ testID: 'employee-row-7' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-section-work' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-status-toggle' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'employee-status-confirm' }).props.onPress(); await Promise.resolve(); });
    expect(updateEmployeeStatusApi).toHaveBeenLastCalledWith('admin-token', 7, { status: 'WORKING' });
    await act(async () => screen.unmount());
  });

  it('masks national ID and shows unavailable advances as dash', async () => {
    vi.mocked(fetchEmployeesApi).mockResolvedValue({ ...emptyResult, items: [profile as any], pagination: { ...emptyResult.pagination, totalRows: 1, totalPages: 1 }, summary: { totalCount: 1, workingCount: 1, resignedCount: 0 } });
    let screen: any;
    await act(async () => { screen = create(<EmployeeManagementScreen />); await Promise.resolve(); });
    const output = JSON.stringify(screen.toJSON());
    expect(output).toContain('••••••••6789');
    expect(output).toContain('Nợ và tạm ứng');
    expect(output).toContain('—');
    await act(async () => screen.unmount());
  });

  it('adds employee tab only for Admin', () => {
    const adminKeys = getTabsForRole('ADMIN').map(tab => tab.key);
    expect(adminKeys).toContain('employees');
    expect(getTabsForRole('CASHIER').map(tab => tab.key)).not.toContain('employees');
    expect(getTabsForRole('KITCHEN').map(tab => tab.key)).not.toContain('employees');
  });

  it('mounts Reports workspace for ADMIN and keeps other role tabs unchanged', () => {
    expect(getTabsForRole('ADMIN').find(tab => tab.key === 'reports')?.component).toBe(ReportsWorkspaceScreen);
    expect(getTabsForRole('CASHIER').map(tab => tab.key)).toEqual(['pos', 'tables', 'reservations', 'orders', 'cashbook']);
    expect(getTabsForRole('KITCHEN').map(tab => tab.key)).toEqual(['kds']);
  });
});

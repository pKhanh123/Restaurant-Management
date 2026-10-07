import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import {
  CategoryDto,
  CategoryUpsertDto,
  MenuItemDto,
  SelectedModifierDto,
  DiningTableDto,
  OrderDto,
  OrderItemCreateDto,
  PaymentMethod,
  OrderType,
  SocketMenuItemSoldOutChangedPayload,
  SocketMenuStockChangedPayload,
  SocketTableStatusChangedPayload,
  SocketOrderStatusChangedPayload,
  SocketOrderNewPayload,
  ApiResponse,
  MenuItemUpsertDto,
  DailyReportDto,
  LowStockAlertDto,
  MenuBulkAction,
  MenuBulkActionResultDto,
  MenuBulkPayload,
  PriceListDataDto,
  PriceListImportCommitDto,
  PriceListImportPreviewDto,
  PriceFormulaOperation,
  SocketPriceListBulkChangedPayload,
  SocketPriceListItemChangedPayload,
  SocketInventoryChangedPayload
} from '../api/contracts';
import { fetchLowStockAlertsApi } from '../api/inventory';
import { useAuth } from './AuthContext';
import { getApiBaseUrl, getSocketBaseUrl, onServerConfigChanged } from '../api/config';
import { IdempotencyKeyStore } from '../lib/idempotency';
import { subscribeToEmployeeScheduleInvalidation } from '../lib/employeeScheduleRealtime';
import { subscribeToEmployeeAttendanceInvalidation, type AttendanceRealtimeSocket } from '../lib/employeeAttendanceRealtime';
import {
  nextEmployeePayrollRevision,
  subscribeToEmployeePayrollInvalidation,
  type EmployeePayrollRealtimeSocket
} from '../lib/employeePayrollRealtime';
import {
  nextEmployeeCommissionRevision,
  subscribeToEmployeeCommissionInvalidation,
  type EmployeeCommissionRealtimeSocket
} from '../lib/employeeCommissionRealtime';
import { subscribeToEmployeeSettingsWorkspaceInvalidation, type EmployeeSettingsRealtimeSocket } from '../lib/employeeSettingsRealtime';
import { bulkUpdateMenuItemsApi } from '../api/menuBulk';
import { appendOrMergeCommissionCartLine, cartToOrderItems, type CommissionCartLine } from '../features/pos/commissionCart';
import {
  bulkUpdatePriceListApi,
  commitPriceListImportApi,
  downloadPriceListExportApi,
  fetchGeneralPriceListApi,
  previewPriceListImportApi,
  updatePriceListItemApi
} from '../api/priceList';

export type CartItem = CommissionCartLine;

interface RestaurantContextType {
  // Menu State
  categories: CategoryDto[];
  allMenuItems: MenuItemDto[];
  filteredMenuItems: MenuItemDto[];
  selectedCategoryId: number | null;
  isLoadingMenu: boolean;
  menuError: string | null;
  fetchMenu: () => Promise<void>;
  selectCategory: (categoryId: number | null) => void;
  createCategory: (payload: CategoryUpsertDto) => Promise<{ success: boolean; category?: CategoryDto; error?: string }>;
  updateCategory: (id: number, payload: CategoryUpsertDto) => Promise<{ success: boolean; category?: CategoryDto; error?: string }>;
  deleteCategory: (id: number, moveToCategoryId?: number) => Promise<{ success: boolean; error?: string }>;
  reorderCategories: (ids: number[]) => Promise<{ success: boolean; error?: string }>;

  // Modifier Modal State
  selectedMenuItemForModal: MenuItemDto | null;
  isModifierModalOpen: boolean;
  openModifierModal: (item: MenuItemDto) => void;
  closeModifierModal: () => void;

  // Cart State
  cart: CartItem[];
  cartSubtotal: number;
  cartVat: number;
  cartTotal: number;
  cartItemCount: number;
  addToCart: (
    item: MenuItemDto,
    quantity: number,
    selectedModifiers: SelectedModifierDto[],
    notes?: string,
    commissionEmployeeId?: number | null
  ) => void;
  updateCartQuantity: (index: number, quantity: number) => void;
  updateCartCommissionEmployee: (index: number, employeeId: number | null) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;

  // Tables State (Floor Map & Smart Dine-in)
  tables: DiningTableDto[];
  isLoadingTables: boolean;
  activeTableId: number | null;
  activeTableOrder: OrderDto | null;
  fetchTables: () => Promise<void>;
  selectActiveTable: (tableId: number | null) => void;
  createOrder: (payload: {
    orderType: OrderType;
    tableId?: number | null;
    customerId?: number | null;
    qrCodeToken?: string;
    voucherCode?: string;
    deliveryPartnerId?: number;
    deliveryAddress?: string;
    deliveryFee?: number;
    notes?: string;
  }) => Promise<{ success: boolean; order?: OrderDto; error?: string }>;
  createDineInOrder: (tableId: number, notes?: string, qrCodeToken?: string, voucherCode?: string, reservationAccessToken?: string) => Promise<{ success: boolean; order?: OrderDto; error?: string }>;
  payOrder: (orderId: number, paymentMethod: PaymentMethod, financialAccountId?: number | null) => Promise<{ success: boolean; order?: OrderDto; error?: string }>;
  updateTableStatus: (tableId: number, status: 'AVAILABLE' | 'DIRTY' | 'NEED_CLEANING') => Promise<{ success: boolean; table?: DiningTableDto; error?: string }>;
  transferTable: (fromTableId: number, toTableId: number) => Promise<{ success: boolean; data?: { fromTable: DiningTableDto; toTable: DiningTableDto }; error?: string }>;
  voidOrder: (orderId: number, reason: string) => Promise<{ success: boolean; order?: OrderDto; error?: string }>;

  // Real-time Updates
  latestOrderStatusChanged?: SocketOrderStatusChangedPayload | null;
  inventoryRevision: number;
  tablesRevision: number;
  customersRevision: number;
  employeesRevision: number;
  employeeSchedulesRevision: number;
  employeeAttendanceRevision: number;
  employeePayrollRevision: number;
  employeeCommissionRevision: number;
  employeeSettingsRevision: number;
  reservationsRevision: number;
  orderPaymentsRevision: number;
  cashbookRevision: number;

  // KDS State (Bếp thời gian thực)
  kdsOrders: OrderDto[];
  isLoadingKDS: boolean;
  kdsError: string | null;
  fetchKDSOrders: () => Promise<void>;
  updateOrderStatus: (orderId: number, status: 'PREPARING' | 'READY' | 'COMPLETED') => Promise<{ success: boolean; order?: OrderDto; error?: string }>;
  toggleMenuItemSoldOut: (menuItemId: number, isAvailable: boolean) => Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }>;

  // Admin Menu Management & Reports
  createMenuItem: (payload: MenuItemUpsertDto) => Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }>;
  updateMenuItem: (id: number, payload: MenuItemUpsertDto) => Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }>;
  bulkUpdateMenuItems: (ids: number[], action: MenuBulkAction, payload: MenuBulkPayload) => Promise<{ success: boolean; result?: MenuBulkActionResultDto; error?: string }>;
  fetchDailyReport: (date?: string) => Promise<{ success: boolean; report?: DailyReportDto; error?: string }>;

  // Inventory Low Stock Alerts
  lowStockAlerts: LowStockAlertDto[];
  fetchLowStockAlerts: () => Promise<void>;

  // Admin Price List
  priceListData: PriceListDataDto | null;
  isLoadingPriceList: boolean;
  priceListError: string | null;
  fetchPriceList: () => Promise<void>;
  updatePriceListItem: (menuItemId: number, salePrice: number, expectedVersion: number) => Promise<{ success: boolean; error?: string }>;
  bulkUpdatePriceList: (menuItemIds: number[], operation: PriceFormulaOperation) => Promise<{ success: boolean; updatedCount?: number; error?: string }>;
  previewPriceListImport: (fileName: string, fileBase64: string) => Promise<{ success: boolean; preview?: PriceListImportPreviewDto; error?: string }>;
  commitPriceListImport: (fileName: string, fileBase64: string) => Promise<{ success: boolean; result?: PriceListImportCommitDto; error?: string }>;
  downloadPriceListExport: () => Promise<{ success: boolean; blob?: Blob; error?: string }>;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export const RestaurantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, token, handleUnauthorized } = useAuth();
  const [socketUrl, setSocketUrl] = useState<string>(getSocketBaseUrl());

  // Menu State
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isLoadingMenu, setIsLoadingMenu] = useState<boolean>(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  // Modifier Modal State
  const [selectedMenuItemForModal, setSelectedMenuItemForModal] = useState<MenuItemDto | null>(null);
  const [isModifierModalOpen, setIsModifierModalOpen] = useState<boolean>(false);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);

  // Tables State
  const [tables, setTables] = useState<DiningTableDto[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState<boolean>(true);
  const [activeTableId, setActiveTableId] = useState<number | null>(null);
  const [activeTableOrder, setActiveTableOrder] = useState<OrderDto | null>(null);
  const orderIdempotency = useRef(new IdempotencyKeyStore());

  // Real-time Order Updates
  const [latestOrderStatusChanged, setLatestOrderStatusChanged] = useState<SocketOrderStatusChangedPayload | null>(null);

  // KDS State (Bếp thời gian thực)
  const [kdsOrders, setKdsOrders] = useState<OrderDto[]>([]);
  const [isLoadingKDS, setIsLoadingKDS] = useState<boolean>(false);
  const [kdsError, setKdsError] = useState<string | null>(null);

  // Inventory Low Stock Alerts (Bếp & Kho)
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlertDto[]>([]);

  const fetchLowStockAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const alerts = await fetchLowStockAlertsApi(token);
      setLowStockAlerts(alerts);
    } catch {
      // background fail safe
    }
  }, [token]);

  useEffect(() => {
    if (user?.role === 'KITCHEN' || user?.role === 'ADMIN') {
      fetchLowStockAlerts();
    }
  }, [user?.role, fetchLowStockAlerts]);

  // General Price List State
  const [priceListData, setPriceListData] = useState<PriceListDataDto | null>(null);
  const [isLoadingPriceList, setIsLoadingPriceList] = useState(false);
  const [priceListError, setPriceListError] = useState<string | null>(null);
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [tablesRevision, setTablesRevision] = useState(0);
  const [customersRevision, setCustomersRevision] = useState(0);
  const [employeesRevision, setEmployeesRevision] = useState(0);
  const [employeeSchedulesRevision, setEmployeeSchedulesRevision] = useState(0);
  const [employeeAttendanceRevision, setEmployeeAttendanceRevision] = useState(0);
  const [employeePayrollRevision, setEmployeePayrollRevision] = useState(0);
  const [employeeCommissionRevision, setEmployeeCommissionRevision] = useState(0);
  const [employeeSettingsRevision, setEmployeeSettingsRevision] = useState(0);
  const [reservationsRevision, setReservationsRevision] = useState(0);
  const [orderPaymentsRevision, setOrderPaymentsRevision] = useState(0);
  const [cashbookRevision, setCashbookRevision] = useState(0);

  // 1. Fetch Menu from Backend API
  const fetchMenu = useCallback(async () => {
    setIsLoadingMenu(true);
    setMenuError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/menu`);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error?.message || 'Không thể tải thực đơn nhà hàng');
      }

      setCategories(json.data.categories || []);
    } catch (err: any) {
      console.error('Loi tai menu:', err);
      setMenuError(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setIsLoadingMenu(false);
    }
  }, []);

  const createCategory = async (
    payload: CategoryUpsertDto
  ): Promise<{ success: boolean; category?: CategoryDto; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/menu/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }
      const json = await response.json();
      if (!response.ok) return { success: false, error: json.error?.message || 'Không thể tạo nhóm món' };
      await fetchMenu();
      return { success: true, category: json.data.category as CategoryDto };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi tạo nhóm món' };
    }
  };

  const updateCategory = async (
    id: number,
    payload: CategoryUpsertDto
  ): Promise<{ success: boolean; category?: CategoryDto; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/menu/categories/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }
      const json = await response.json();
      if (!response.ok) return { success: false, error: json.error?.message || 'Không thể cập nhật nhóm món' };
      await fetchMenu();
      return { success: true, category: json.data.category as CategoryDto };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi cập nhật nhóm món' };
    }
  };

  const deleteCategory = async (
    id: number,
    moveToCategoryId?: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/menu/categories/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(moveToCategoryId === undefined ? {} : { moveToCategoryId })
      });
      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }
      const json = await response.json();
      if (!response.ok) return { success: false, error: json.error?.message || 'Không thể xóa nhóm món' };
      await fetchMenu();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi xóa nhóm món' };
    }
  };

  const reorderCategories = async (ids: number[]): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/menu/categories/reorder`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ ids })
      });
      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }
      const json = await response.json();
      if (!response.ok) return { success: false, error: json.error?.message || 'Không thể sắp xếp nhóm món' };
      await fetchMenu();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi sắp xếp nhóm món' };
    }
  };

  // 2. Fetch Tables from Backend API
  const fetchTables = useCallback(async () => {
    // Bep khong quan ly so do ban, bo qua de tranh loi 403 Forbidden
    if (user?.role === 'KITCHEN') {
      setTables([]);
      setActiveTableId(null);
      setActiveTableOrder(null);
      setIsLoadingTables(false);
      return;
    }

    setIsLoadingTables(true);
    try {
      if (!token) {
        setTables([]);
        setActiveTableId(null);
        setActiveTableOrder(null);
        return;
      }

      const response = await fetch(`${getApiBaseUrl()}/api/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return;
      }

      if (response.status === 403) {
        setTables([]);
        return;
      }

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error?.message || 'Không thể tải danh sách bàn');
      }

      setTables(json.data.tables || []);
    } catch (err: any) {
      console.error('Loi tai danh sach ban:', err);
    } finally {
      setIsLoadingTables(false);
    }
  }, [user?.role, token, handleUnauthorized]);

  // 3. Fetch KDS Orders from Backend API
  const fetchKDSOrders = useCallback(async () => {
    // Chi KITCHEN va ADMIN moi co quyen xem danh sach KDS Orders
    if (user && user.role !== 'KITCHEN' && user.role !== 'ADMIN') {
      return;
    }

    setIsLoadingKDS(true);
    setKdsError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/orders?status=PENDING,PREPARING,READY`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return;
      }

      if (response.status === 403) {
        return;
      }

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error?.message || 'Không thể tải đơn hàng KDS');
      }

      setKdsOrders(json.data || []);
    } catch (err: any) {
      console.error('Loi tai don hang KDS:', err);
      setKdsError(err.message || 'Lỗi tải đơn hàng KDS');
    } finally {
      setIsLoadingKDS(false);
    }
  }, [user?.role, token, handleUnauthorized]);

  const fetchPriceList = useCallback(async () => {
    if (user?.role !== 'ADMIN' || !token) {
      setPriceListData(null);
      return;
    }
    setIsLoadingPriceList(true);
    setPriceListError(null);
    try {
      setPriceListData(await fetchGeneralPriceListApi(token));
    } catch (err: any) {
      setPriceListError(err.message || 'Không thể tải bảng giá');
    } finally {
      setIsLoadingPriceList(false);
    }
  }, [token, user?.role]);

  // 4. Update Order Status (FSM: PENDING -> PREPARING -> READY -> COMPLETED)
  const updateOrderStatus = useCallback(
    async (orderId: number, nextStatus: 'PREPARING' | 'READY' | 'COMPLETED') => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/orders/${orderId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ status: nextStatus })
        });

        if (response.status === 401) {
          handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
          return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
        }

        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error?.message || 'Không thể cập nhật trạng thái đơn');
        }

        const updatedOrder = json.data as OrderDto;
        setKdsOrders((prev) => {
          if (nextStatus === 'COMPLETED') {
            return prev.filter((o) => o.id !== orderId);
          }
          return prev.map((o) => (o.id === orderId ? { ...o, ...updatedOrder } : o));
        });

        return { success: true, order: updatedOrder };
      } catch (err: any) {
        console.error('Lỗi cập nhật trạng thái đơn bếp:', err);
        return { success: false, error: err.message || 'Lỗi kết nối máy chủ' };
      }
    },
    [token, handleUnauthorized]
  );

  // Lang nghe khi nguoi dung doi IP may chu Backend
  useEffect(() => {
    return onServerConfigChanged((newUrl) => {
      setSocketUrl(newUrl);
      fetchMenu();
      if (user?.role !== 'KITCHEN') {
        fetchTables();
      }
      if (user?.role === 'KITCHEN' || user?.role === 'ADMIN') {
        fetchKDSOrders();
      }
    });
  }, [fetchMenu, fetchTables, fetchKDSOrders, fetchPriceList, user?.role]);

  useEffect(() => {
    fetchMenu();
    if (user?.role !== 'KITCHEN') {
      fetchTables();
    }
    if (user?.role === 'KITCHEN' || user?.role === 'ADMIN') {
      fetchKDSOrders();
    }
    if (user?.role === 'ADMIN') {
      fetchPriceList();
    }
  }, [fetchMenu, fetchTables, fetchKDSOrders, fetchPriceList, user?.role]);

  // 5. Real-time Socket.io listeners
  useEffect(() => {
    const socket: Socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      auth: token ? { token } : undefined
    });
    const unsubscribeEmployeeScheduleInvalidation = subscribeToEmployeeScheduleInvalidation(
      socket,
      () => setEmployeeSchedulesRevision(revision => revision + 1)
    );
    const unsubscribeEmployeeAttendanceInvalidation = subscribeToEmployeeAttendanceInvalidation(
      socket as unknown as AttendanceRealtimeSocket,
      () => setEmployeeAttendanceRevision(revision => revision + 1)
    );
    const unsubscribeEmployeePayrollInvalidation = subscribeToEmployeePayrollInvalidation(
      socket as unknown as EmployeePayrollRealtimeSocket,
      () => setEmployeePayrollRevision(nextEmployeePayrollRevision)
    );
    const unsubscribeEmployeeCommissionInvalidation = subscribeToEmployeeCommissionInvalidation(
      socket as unknown as EmployeeCommissionRealtimeSocket,
      1,
      (payload) => setEmployeeCommissionRevision((current) =>
        nextEmployeeCommissionRevision(current, payload?.revision)
      )
    );
    const unsubscribeEmployeeSettingsInvalidation = subscribeToEmployeeSettingsWorkspaceInvalidation(
      socket as unknown as EmployeeSettingsRealtimeSocket,
      1,
      () => setEmployeeSettingsRevision(revision => revision + 1)
    );

    socket.on('connect', () => {
      console.log('⚡ Socket connected to Crispy Bite Server:', socketUrl);
    });

    socket.on('connect_error', (err) => {
      if (err?.message === 'UNAUTHENTICATED') {
        console.warn('⚡ Socket bi tu choi do token khong hop le (UNAUTHENTICATED) -> dang xuat');
        handleUnauthorized('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }
    });

    // 86'd Sold-out update
    socket.on('menu:itemSoldOutChanged', (payload: SocketMenuItemSoldOutChangedPayload) => {
      setCategories((prevCategories) =>
        prevCategories.map((cat) => ({
          ...cat,
          menuItems: cat.menuItems?.map((item) =>
            item.id === payload.menuItemId ? { ...item, isAvailable: payload.isAvailable } : item
          )
        }))
      );
    });

    socket.on('menu:stockChanged', (payload: SocketMenuStockChangedPayload) => {
      const changes = new Map(payload.items.map((change) => [change.menuItemId, change]));
      setCategories((prevCategories) =>
        prevCategories.map((cat) => ({
          ...cat,
          menuItems: cat.menuItems?.map((item) => {
            const change = changes.get(item.id);
            return change
              ? {
                  ...item,
                  stockQuantity: change.stockQuantity,
                  trackStock: change.trackStock,
                  isAvailable: change.isAvailable
                }
              : item;
          })
        }))
      );
    });

    socket.on('priceList:itemChanged', (payload: SocketPriceListItemChangedPayload) => {
      setPriceListData((current) => current && current.priceList.id === payload.priceListId
        ? {
            ...current,
            items: current.items.map((item) => item.menuItemId === payload.menuItemId
              ? { ...item, salePrice: payload.salePrice, version: payload.version, updatedAt: payload.updatedAt }
              : item)
          }
        : current);
      setCategories((prevCategories) => prevCategories.map((category) => ({
        ...category,
        menuItems: category.menuItems?.map((item) => item.id === payload.menuItemId
          ? { ...item, basePrice: payload.salePrice }
          : item)
      })));
      setCart((previousCart) => previousCart.map((cartItem) => {
        if (cartItem.menuItem.id !== payload.menuItemId) return cartItem;
        const modifierDelta = cartItem.selectedModifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0);
        const unitPrice = payload.salePrice + modifierDelta;
        return {
          ...cartItem,
          menuItem: { ...cartItem.menuItem, basePrice: payload.salePrice },
          unitPrice,
          subtotal: unitPrice * cartItem.quantity
        };
      }));
    });

    socket.on('priceList:bulkChanged', (_payload: SocketPriceListBulkChangedPayload) => {
      if (user?.role === 'ADMIN') fetchPriceList();
      fetchMenu();
    });

    socket.on('inventory:changed', (_payload: SocketInventoryChangedPayload) => {
      setInventoryRevision((revision) => revision + 1);
    });

    socket.on('customers:changed', () => setCustomersRevision(revision => revision + 1));
    socket.on('employees:changed', () => setEmployeesRevision(revision => revision + 1));
    socket.on('reservations:changed', () => setReservationsRevision(revision => revision + 1));
    socket.on('order:paymentChanged', () => setOrderPaymentsRevision(revision => revision + 1));
    socket.on('cashbook:changed', () => setCashbookRevision(revision => revision + 1));

    // Table Status Changed
    socket.on('table:statusChanged', (payload: SocketTableStatusChangedPayload) => {
      setTables((prevTables) =>
        prevTables.map((t) =>
          t.id === payload.tableId
            ? { ...t, status: payload.status, currentOrderId: payload.currentOrderId }
            : t
        )
      );
    });

    socket.on('tables:changed', () => {
      setTablesRevision((revision) => revision + 1);
      if (user?.role !== 'KITCHEN') fetchTables();
    });

    // Order Status Changed
    socket.on('order:statusChanged', (payload: SocketOrderStatusChangedPayload) => {
      setLatestOrderStatusChanged(payload);
      if (user?.role !== 'KITCHEN') {
        fetchTables();
      }
      setActiveTableOrder((prev) => {
        if (prev && prev.id === payload.orderId) {
          return { ...prev, status: payload.status };
        }
        return prev;
      });

      // Sync local tables orders array
      setTables((prevTables) =>
        prevTables.map((tbl) => {
          if (tbl.orders?.some((o) => o.id === payload.orderId)) {
            return {
              ...tbl,
              orders: tbl.orders.map((o) =>
                o.id === payload.orderId
                  ? {
                      ...o,
                      status: payload.status,
                      prepTimeSec: payload.prepTimeSec ?? o.prepTimeSec,
                      preparingAt: payload.preparingAt ?? o.preparingAt,
                      readyAt: payload.readyAt ?? o.readyAt,
                      completedAt: payload.completedAt ?? o.completedAt
                    }
                  : o
              )
            };
          }
          return tbl;
        })
      );

      setKdsOrders((prev) => {
        if (payload.status === 'COMPLETED' || payload.status === 'CANCELLED') {
          return prev.filter((o) => o.id !== payload.orderId);
        }
        return prev.map((o) =>
          o.id === payload.orderId
            ? {
                ...o,
                status: payload.status,
                prepTimeSec: payload.prepTimeSec ?? o.prepTimeSec,
                preparingAt: payload.preparingAt ?? o.preparingAt,
                readyAt: payload.readyAt ?? o.readyAt,
                completedAt: payload.completedAt ?? o.completedAt
              }
            : o
        );
      });
    });

    // Order New (Xuất hiện đơn mới từ POS hoặc QR khách)
    socket.on('order:new', (payload: SocketOrderNewPayload) => {
      // Re-fetch tables to sync fresh floor map (chi khi khong phai la Bep)
      if (user?.role !== 'KITCHEN') {
        fetchTables();
      }
      if (user?.role === 'KITCHEN' || user?.role === 'ADMIN') {
        fetchKDSOrders();
      }
      if (user?.role === 'ADMIN') {
        fetchPriceList();
      }
      if (payload?.order) {
        setKdsOrders((prev) => {
          const exists = prev.some((o) => o.id === payload.order.id);
          if (exists) return prev;
          return [payload.order, ...prev];
        });
      }
    });

    // Table Transferred (Chuyển bàn giữa 2 bàn)
    socket.on('order:tableTransferred', () => {
      if (user?.role === 'KITCHEN' || user?.role === 'ADMIN') {
        fetchKDSOrders();
      }
      if (user?.role !== 'KITCHEN') {
        fetchTables();
      }
    });

    // Inventory Low Stock Alert (Real-time từ Bếp hoặc Thanh toán tự động trừ kho)
    socket.on('inventory:lowStockAlert', (alert: LowStockAlertDto) => {
      setLowStockAlerts((prev) => {
        const idx = prev.findIndex((item) => item.id === alert.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = alert;
          return updated;
        }
        return [...prev, alert];
      });
    });

    return () => {
      unsubscribeEmployeeScheduleInvalidation();
      unsubscribeEmployeeAttendanceInvalidation();
      unsubscribeEmployeePayrollInvalidation();
      unsubscribeEmployeeCommissionInvalidation();
      unsubscribeEmployeeSettingsInvalidation();
      socket.disconnect();
    };
  }, [token, fetchTables, fetchKDSOrders, fetchPriceList, fetchMenu, user?.role]);

  // 4. Computed Menu Items
  const allMenuItems = categories.flatMap((cat) => cat.menuItems || []);
  const filteredMenuItems =
    selectedCategoryId === null
      ? allMenuItems
      : categories.find((c) => c.id === selectedCategoryId)?.menuItems || [];

  const selectCategory = (categoryId: number | null) => {
    setSelectedCategoryId(categoryId);
  };

  // 5. Modal Handlers
  const openModifierModal = (item: MenuItemDto) => {
    setSelectedMenuItemForModal(item);
    setIsModifierModalOpen(true);
  };

  const closeModifierModal = () => {
    setSelectedMenuItemForModal(null);
    setIsModifierModalOpen(false);
  };

  // 6. Cart Handlers
  const addToCart = (
    item: MenuItemDto,
    quantity: number,
    selectedModifiers: SelectedModifierDto[],
    notes?: string,
    commissionEmployeeId: number | null = null
  ) => {
    const modifierPriceTotal = selectedModifiers.reduce((sum, mod) => sum + mod.priceDelta, 0);
    const unitPrice = item.basePrice + modifierPriceTotal;
    const subtotal = unitPrice * quantity;

    const newItem: CartItem = {
      menuItem: item,
      quantity,
      selectedModifiers,
      unitPrice,
      subtotal,
      notes,
      commissionEmployeeId
    };

    setCart((prev) => appendOrMergeCommissionCartLine(prev, newItem));
    closeModifierModal();
  };

  const updateCartQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(index);
      return;
    }
    setCart((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return {
          ...item,
          quantity,
          subtotal: item.unitPrice * quantity
        };
      })
    );
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateCartCommissionEmployee = (index: number, employeeId: number | null) => {
    setCart(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, commissionEmployeeId: employeeId } : item));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Cart financial calculations (8% VAT standard)
  const cartSubtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const cartVat = Math.round(cartSubtotal * 0.08); // 8% VAT
  const cartTotal = cartSubtotal + cartVat;
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // 7. Table & Dine-in Order Handlers
  const selectActiveTable = (tableId: number | null) => {
    setActiveTableId(tableId);
    if (!tableId) {
      setActiveTableOrder(null);
    }
  };

  const createOrder = async ({
    orderType,
    tableId,
    customerId,
    qrCodeToken,
    reservationAccessToken,
    voucherCode,
    deliveryPartnerId,
    deliveryAddress,
    deliveryFee,
    notes
  }: {
    orderType: OrderType;
    tableId?: number | null;
    customerId?: number | null;
    qrCodeToken?: string;
    reservationAccessToken?: string;
    voucherCode?: string;
    deliveryPartnerId?: number;
    deliveryAddress?: string;
    deliveryFee?: number;
    notes?: string;
  }): Promise<{ success: boolean; order?: OrderDto; error?: string }> => {
    if (cart.length === 0) {
      return { success: false, error: 'Giỏ hàng đang trống' };
    }

    if (orderType === 'DINE_IN' && !tableId) {
      return { success: false, error: 'Vui lòng chọn bàn ăn cho đơn tại chỗ' };
    }

    const itemsPayload: OrderItemCreateDto[] = cartToOrderItems(cart, Boolean(qrCodeToken));

    const orderPayload = {
      ...(orderType === 'DINE_IN' && tableId ? { tableId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(orderType === 'DINE_IN' && qrCodeToken ? { qrCodeToken } : {}),
      ...(orderType === 'DINE_IN' && reservationAccessToken ? { reservationAccessToken } : {}),
      ...(voucherCode ? { voucherCode } : {}),
      ...(orderType === 'DELIVERY' ? { deliveryPartnerId, deliveryAddress, deliveryFee } : {}),
      orderType,
      items: itemsPayload,
      notes
    };
    const idempotencyKey = orderIdempotency.current.get(JSON.stringify(orderPayload));

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ ...orderPayload, idempotencyKey })
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể tạo đơn hàng' };
      }

      const order = (json as ApiResponse<{ order: OrderDto }>).data.order;
      orderIdempotency.current.complete(idempotencyKey);
      if (orderType === 'DINE_IN' && tableId) {
        setActiveTableId(tableId);
        setActiveTableOrder(order);
      }
      clearCart();
      await fetchTables();

      return { success: true, order };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi gửi đơn xuống bếp' };
    }
  };

  const createDineInOrder = async (
    tableId: number,
    notes?: string,
    qrCodeToken?: string,
    voucherCode?: string,
    reservationAccessToken?: string
  ): Promise<{ success: boolean; order?: OrderDto; error?: string }> => {
    return createOrder({ orderType: 'DINE_IN', tableId, notes, qrCodeToken, voucherCode, reservationAccessToken });
  };

  const payOrder = async (
    orderId: number,
    paymentMethod: PaymentMethod,
    financialAccountId?: number | null
  ): Promise<{ success: boolean; order?: OrderDto; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/orders/${orderId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ paymentMethod, ...(financialAccountId ? { financialAccountId } : {}) })
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Thanh toán đơn hàng thất bại' };
      }

      const order = (json as ApiResponse<{ order: OrderDto }>).data.order;
      setActiveTableOrder((current) => current?.id === order.id ? null : current);
      await fetchTables();

      return { success: true, order };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi thanh toán' };
    }
  };

  const updateTableStatus = async (
    tableId: number,
    status: 'AVAILABLE' | 'DIRTY' | 'NEED_CLEANING'
  ): Promise<{ success: boolean; table?: DiningTableDto; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/tables/${tableId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status })
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Cập nhật trạng thái bàn thất bại' };
      }

      const table = (json as ApiResponse<{ table: DiningTableDto }>).data.table;
      setTables((prev) => prev.map((t) => (t.id === table.id ? table : t)));
      return { success: true, table };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi cập nhật trạng thái bàn' };
    }
  };

  const transferTable = async (
    fromTableId: number,
    toTableId: number
  ): Promise<{ success: boolean; data?: { fromTable: DiningTableDto; toTable: DiningTableDto }; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/tables/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ fromTableId, toTableId })
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Chuyển bàn thất bại' };
      }

      const result = (json as ApiResponse<{ fromTable: DiningTableDto; toTable: DiningTableDto }>).data;
      await fetchTables();
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi chuyển bàn' };
    }
  };

  const voidOrder = async (
    orderId: number,
    reason: string
  ): Promise<{ success: boolean; order?: OrderDto; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/orders/${orderId}/void`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ reason })
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Hủy đơn hàng thất bại' };
      }

      const order = (json as ApiResponse<{ order: OrderDto }>).data.order;
      setActiveTableOrder((current) => (current?.id === order.id ? null : current));
      await fetchTables();

      return { success: true, order };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi hủy đơn hàng' };
    }
  };

  const toggleMenuItemSoldOut = async (
    menuItemId: number,
    isAvailable: boolean
  ): Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/menu/${menuItemId}/sold-out`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ isAvailable })
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể cập nhật trạng thái món' };
      }

      const updated = json.data.menuItem as MenuItemDto;
      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          menuItems: cat.menuItems?.map((item) => (item.id === updated.id ? updated : item))
        }))
      );

      return { success: true, menuItem: updated };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi cập nhật món hết hàng' };
    }
  };

  const createMenuItem = async (
    payload: MenuItemUpsertDto
  ): Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/menu`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể tạo món ăn mới' };
      }

      const created = json.data.menuItem as MenuItemDto;
      await fetchMenu();
      return { success: true, menuItem: created };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi tạo món ăn' };
    }
  };

  const updateMenuItem = async (
    id: number,
    payload: MenuItemUpsertDto
  ): Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/menu/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể cập nhật món ăn' };
      }

      const updated = json.data.menuItem as MenuItemDto;
      await fetchMenu();
      return { success: true, menuItem: updated };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi cập nhật món ăn' };
    }
  };

  const bulkUpdateMenuItems = async (
    ids: number[],
    action: MenuBulkAction,
    payload: MenuBulkPayload
  ): Promise<{ success: boolean; result?: MenuBulkActionResultDto; error?: string }> => {
    try {
      const result = await bulkUpdateMenuItemsApi(token, ids, action, payload);
      return { success: true, result };
    } catch (err: any) {
      if (err?.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
      }
      return { success: false, error: err.message || 'Lỗi kết nối khi cập nhật hàng loạt menu' };
    }
  };

  const updatePriceListItem = async (menuItemId: number, salePrice: number, expectedVersion: number) => {
    if (!token || !priceListData) return { success: false, error: 'Bạn cần đăng nhập quản trị' };
    try {
      const result = await updatePriceListItemApi(token, priceListData.priceList.id, menuItemId, salePrice, expectedVersion);
      setPriceListData((current) => current ? {
        ...current,
        items: current.items.map((item) => item.menuItemId === menuItemId ? { ...item, ...result.item } : item)
      } : current);
      await fetchMenu();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Không thể cập nhật giá bán' };
    }
  };

  const bulkUpdatePriceList = async (menuItemIds: number[], operation: PriceFormulaOperation) => {
    if (!token || !priceListData) return { success: false, error: 'Bạn cần đăng nhập quản trị' };
    try {
      const result = await bulkUpdatePriceListApi(token, priceListData.priceList.id, menuItemIds, operation);
      await fetchPriceList();
      await fetchMenu();
      return { success: true, updatedCount: result.updatedCount };
    } catch (err: any) {
      return { success: false, error: err.message || 'Không thể cập nhật giá hàng loạt' };
    }
  };

  const previewPriceListImport = async (fileName: string, fileBase64: string) => {
    if (!token || !priceListData) return { success: false, error: 'Bạn cần đăng nhập quản trị' };
    try {
      const preview = await previewPriceListImportApi(token, priceListData.priceList.id, fileName, fileBase64);
      return { success: true, preview };
    } catch (err: any) {
      return { success: false, error: err.message || 'Không thể đối soát file bảng giá' };
    }
  };

  const commitPriceListImport = async (fileName: string, fileBase64: string) => {
    if (!token || !priceListData) return { success: false, error: 'Bạn cần đăng nhập quản trị' };
    try {
      const result = await commitPriceListImportApi(token, priceListData.priceList.id, fileName, fileBase64);
      await fetchPriceList();
      await fetchMenu();
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message || 'Không thể áp dụng file bảng giá' };
    }
  };

  const downloadPriceListExport = async () => {
    if (!token || !priceListData) return { success: false, error: 'Bạn cần đăng nhập quản trị' };
    try {
      const blob = await downloadPriceListExportApi(token, priceListData.priceList.id);
      return { success: true, blob };
    } catch (err: any) {
      return { success: false, error: err.message || 'Không thể tải bảng giá' };
    }
  };

  const fetchDailyReport = async (
    date?: string
  ): Promise<{ success: boolean; report?: DailyReportDto; error?: string }> => {
    try {
      const base = getApiBaseUrl();
      const url = date ? `${base}/api/reports/daily?date=${date}` : `${base}/api/reports/daily`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (response.status === 401) {
        handleUnauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn.');
        return { success: false, error: 'Phiên đăng nhập đã hết hạn' };
      }

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể tải báo cáo doanh thu' };
      }

      return { success: true, report: json.data.report as DailyReportDto };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi tải báo cáo doanh thu' };
    }
  };

  return (
    <RestaurantContext.Provider
      value={{
        categories,
        allMenuItems,
        filteredMenuItems,
        selectedCategoryId,
        isLoadingMenu,
        menuError,
        fetchMenu,
        selectCategory,
        createCategory,
        updateCategory,
        deleteCategory,
        reorderCategories,
        selectedMenuItemForModal,
        isModifierModalOpen,
        openModifierModal,
        closeModifierModal,
        cart,
        cartSubtotal,
        cartVat,
        cartTotal,
        cartItemCount,
        addToCart,
        updateCartQuantity,
        updateCartCommissionEmployee,
        removeFromCart,
        clearCart,
        tables,
        isLoadingTables,
        activeTableId,
        activeTableOrder,
        fetchTables,
        selectActiveTable,
        createOrder,
        createDineInOrder,
        payOrder,
        updateTableStatus,
        transferTable,
        voidOrder,
        latestOrderStatusChanged,
        inventoryRevision,
        tablesRevision,
        customersRevision,
        employeesRevision,
        employeeSchedulesRevision,
        employeeAttendanceRevision,
        employeePayrollRevision,
        employeeCommissionRevision,
        employeeSettingsRevision,
        reservationsRevision,
        orderPaymentsRevision,
        cashbookRevision,
        kdsOrders,
        isLoadingKDS,
        kdsError,
        fetchKDSOrders,
        updateOrderStatus,
        toggleMenuItemSoldOut,
        createMenuItem,
        updateMenuItem,
        bulkUpdateMenuItems,
        fetchDailyReport,
        lowStockAlerts,
        fetchLowStockAlerts,
        priceListData,
        isLoadingPriceList,
        priceListError,
        fetchPriceList,
        updatePriceListItem,
        bulkUpdatePriceList,
        previewPriceListImport,
        commitPriceListImport,
        downloadPriceListExport
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
};

export const useRestaurant = (): RestaurantContextType => {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant must be used within a RestaurantProvider');
  }
  return context;
};

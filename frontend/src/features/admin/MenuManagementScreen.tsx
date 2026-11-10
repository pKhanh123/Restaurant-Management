import React, { useEffect, useState, useMemo } from 'react';
import { ArrowDown, ArrowUp, Check, Download, Eye, FileSpreadsheet, ImageIcon, Pencil, Plus, Search, Sparkles, Trash2, Upload, X } from 'lucide-react-native';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
  Switch,
  Platform,
  useWindowDimensions
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { CategoryDto, MenuBulkAction, MenuBulkPayload, MenuItemDto, MenuItemType, MenuItemUpsertDto, MenuType } from '../../api/contracts';
import { getApiBaseUrl, resolveImageUrl } from '../../api/config';
import { downloadMenuExportApi } from '../../api/menuImport';
import { elevation, radii, spacing, statusColors, typography } from '../../theme';
import { AppIcon, Button, EmptyState, Field, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
import {
  filterMenuManagementItems,
  formatMenuItemCode,
  MenuAvailabilityFilter,
  MenuItemTypeFilter,
  MenuOptionPresenceFilter,
  MenuStockFilter,
  MenuTypeFilter
} from './menuManagementFilters';
import { moveCategory, normalizeCategoryDraft } from './categoryManagement';
import { MenuImportModal } from './MenuImportModal';
import { MenuBulkActions } from './MenuBulkActions';

interface ModifierOptionForm {
  id?: number;
  name: string;
  priceDeltaStr: string;
}

interface ModifierGroupForm {
  id?: number;
  name: string;
  isRequired: boolean;
  minSelectStr: string;
  maxSelectStr: string;
  options: ModifierOptionForm[];
}

interface ModifierPreset {
  id: string;
  label: string;
  group: ModifierGroupForm;
}

const MODIFIER_PRESETS: ModifierPreset[] = [
  {
    id: 'size',
    label: 'Kích cỡ (Tiêu chuẩn / Vừa / Lớn)',
    group: {
      name: 'Kích cỡ',
      isRequired: true,
      minSelectStr: '1',
      maxSelectStr: '1',
      options: [
        { name: 'Cỡ tiêu chuẩn', priceDeltaStr: '0' },
        { name: 'Cỡ vừa (+10k)', priceDeltaStr: '10000' },
        { name: 'Cỡ lớn (+20k)', priceDeltaStr: '20000' }
      ]
    }
  },
  {
    id: 'spicy',
    label: 'Độ cay (Không cay / Cay vừa / Cay nhiều)',
    group: {
      name: 'Độ cay',
      isRequired: true,
      minSelectStr: '1',
      maxSelectStr: '1',
      options: [
        { name: 'Không cay', priceDeltaStr: '0' },
        { name: 'Cay vừa', priceDeltaStr: '0' },
        { name: 'Cay nhiều', priceDeltaStr: '0' }
      ]
    }
  },
  {
    id: 'topping',
    label: 'Topping thêm (Phô mai / Trứng...)',
    group: {
      name: 'Topping thêm',
      isRequired: false,
      minSelectStr: '0',
      maxSelectStr: '3',
      options: [
        { name: 'Thêm phô mai', priceDeltaStr: '10000' },
        { name: 'Thêm trứng ốp la', priceDeltaStr: '10000' },
        { name: 'Thêm sốt đặc biệt', priceDeltaStr: '5000' }
      ]
    }
  }
];

interface MenuItemForm {
  id?: number;
  name: string;
  categoryId: number;
  basePriceStr: string;
  description: string;
  imageUrl: string;
  isAvailable: boolean;
  menuType: MenuType;
  itemType: MenuItemType;
  trackStock: boolean;
  stockQuantityStr: string;
  position: string;
  modifierGroups: ModifierGroupForm[];
}

const MENU_TYPE_OPTIONS: Array<{ value: MenuType; label: string }> = [
  { value: 'FOOD', label: 'Đồ ăn' },
  { value: 'DRINK', label: 'Đồ uống' },
  { value: 'SERVICE', label: 'Dịch vụ' },
  { value: 'OTHER', label: 'Khác' }
];

const ITEM_TYPE_OPTIONS: Array<{ value: MenuItemType; label: string }> = [
  { value: 'REGULAR', label: 'Món thường' },
  { value: 'TOPPING', label: 'Món thêm' },
  { value: 'COMBO', label: 'Combo' },
  { value: 'SERVICE', label: 'Dịch vụ' }
];

const menuTypeLabel = (value: MenuType) => MENU_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
const itemTypeLabel = (value: MenuItemType) => ITEM_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;

export const MenuManagementScreen: React.FC = () => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const { token } = useAuth();
  const { showToast } = useToast();
  const {
    categories,
    allMenuItems,
    toggleMenuItemSoldOut,
    createMenuItem,
    updateMenuItem,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    bulkUpdateMenuItems,
    fetchMenu,
    isLoadingMenu
  } = useRestaurant();

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [availabilityFilter, setAvailabilityFilter] = useState<MenuAvailabilityFilter>('all');
  const [optionPresenceFilter, setOptionPresenceFilter] = useState<MenuOptionPresenceFilter>('all');
  const [menuTypeFilter, setMenuTypeFilter] = useState<MenuTypeFilter>('all');
  const [itemTypeFilter, setItemTypeFilter] = useState<MenuItemTypeFilter>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<MenuStockFilter>('all');
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MenuItemDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [orderedCategories, setOrderedCategories] = useState<CategoryDto[]>([]);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDisplayOrder, setCategoryDisplayOrder] = useState('0');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [isCategorySaving, setIsCategorySaving] = useState(false);
  const [isCategoryReordering, setIsCategoryReordering] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const isMobile = width < 1000;
  const switchAppearance = {
    style: styles.switchTarget,
    thumbColor: theme.surfaceBase,
    ...(Platform.OS === 'web' ? { activeThumbColor: theme.surfaceBase } : {})
  };

  // Form State
  const [form, setForm] = useState<MenuItemForm>({
    name: '',
    categoryId: categories[0]?.id || 1,
    basePriceStr: '',
    description: '',
    imageUrl: '',
    isAvailable: true,
    menuType: 'FOOD',
    itemType: 'REGULAR',
    trackStock: false,
    stockQuantityStr: '0',
    position: '',
    modifierGroups: []
  });

  useEffect(() => {
    setOrderedCategories([...categories].sort((a, b) => a.displayOrder - b.displayOrder));
  }, [categories]);

  // Filter items by category & search query
  const filteredItems = useMemo(() => {
    return filterMenuManagementItems(allMenuItems, categories, {
      searchQuery,
      categoryId: selectedCategoryId,
      availability: availabilityFilter,
      optionPresence: optionPresenceFilter,
      menuType: menuTypeFilter,
      itemType: itemTypeFilter,
      stockStatus: stockStatusFilter
    });
  }, [allMenuItems, categories, selectedCategoryId, searchQuery, availabilityFilter, optionPresenceFilter, menuTypeFilter, itemTypeFilter, stockStatusFilter]);

  const categoryFilters = useMemo(
    () => [
      { id: null, name: 'Tất cả nhóm', count: allMenuItems.length },
      ...categories.map((category) => ({
        id: category.id,
        name: category.name,
        count: allMenuItems.filter((item) => item.categoryId === category.id).length
      }))
    ],
    [allMenuItems, categories]
  );

  const selectedVisibleIds = filteredItems.map((item) => item.id);
  const allVisibleSelected =
    selectedVisibleIds.length > 0 && selectedVisibleIds.every((id) => selectedItemIds.includes(id));

  const toggleItemSelection = (itemId: number) => {
    setSelectedItemIds((previous) =>
      previous.includes(itemId) ? previous.filter((id) => id !== itemId) : [...previous, itemId]
    );
  };

  const toggleVisibleSelection = () => {
    setSelectedItemIds((previous) => {
      if (allVisibleSelected) {
        return previous.filter((id) => !selectedVisibleIds.includes(id));
      }
      return Array.from(new Set([...previous, ...selectedVisibleIds]));
    });
  };

  const clearFilters = () => {
    setSelectedCategoryId(null);
    setSearchQuery('');
    setAvailabilityFilter('all');
    setOptionPresenceFilter('all');
    setMenuTypeFilter('all');
    setItemTypeFilter('all');
    setStockStatusFilter('all');
  };

  const handleBulkSubmit = async (action: MenuBulkAction, payload: MenuBulkPayload): Promise<boolean> => {
    const result = await bulkUpdateMenuItems(selectedItemIds, action, payload);
    if (!result.success) {
      showToast({ type: 'error', title: 'Không thể cập nhật hàng loạt', message: result.error || 'Vui lòng thử lại.' });
      return false;
    }

    await fetchMenu();
    setSelectedItemIds([]);
    showToast({ type: 'success', title: 'Đã cập nhật menu', message: `Đã áp dụng cho ${result.result?.updatedCount ?? selectedItemIds.length} món.` });
    return true;
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setFormError(null);
    setForm({
      name: '',
      categoryId: selectedCategoryId ?? (categories[0]?.id || 1),
      basePriceStr: '',
      description: '',
      imageUrl: '',
      isAvailable: true,
      menuType: 'FOOD',
      itemType: 'REGULAR',
      trackStock: false,
      stockQuantityStr: '0',
      position: '',
      modifierGroups: []
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: MenuItemDto) => {
    setEditingItem(item);
    setFormError(null);
    setForm({
      id: item.id,
      name: item.name,
      categoryId: item.categoryId,
      basePriceStr: item.basePrice.toString(),
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      isAvailable: item.isAvailable,
      menuType: item.menuType,
      itemType: item.itemType,
      trackStock: item.trackStock,
      stockQuantityStr: String(item.stockQuantity ?? 0),
      position: item.position || '',
      modifierGroups: (item.modifierGroups || []).map((group) => ({
        id: group.id,
        name: group.name,
        isRequired: group.isRequired,
        minSelectStr: group.minSelect.toString(),
        maxSelectStr: group.maxSelect.toString(),
        options: group.options.map((opt) => ({
          id: opt.id,
          name: opt.name,
          priceDeltaStr: opt.priceDelta.toString()
        }))
      }))
    });
    setIsModalOpen(true);
  };

  const handlePickFile = () => {
    if (Platform.OS !== 'web') return;
    // Tao the input an, click de mo hop thoai chon file
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      // Doc file thanh base64 data URL
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        if (!dataUrl) return;
        setIsUploadingImage(true);
        try {
          const res = await fetch(`${getApiBaseUrl()}/api/menu/upload-image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token ?? ''}`
            },
            body: JSON.stringify({ dataUrl })
          });
          const json = await res.json();
          if (res.ok && json.data?.imageUrl) {
            setForm((prev) => ({ ...prev, imageUrl: json.data.imageUrl }));
            showToast({
              type: 'success',
              title: 'Tải ảnh thành công',
              message: 'Ảnh món đã được cập nhật vào biểu mẫu!'
            });
          } else {
            showToast({
              type: 'error',
              title: 'Lỗi tải ảnh',
              message: json.message || 'Không thể tải ảnh lên máy chủ.'
            });
          }
        } catch {
          showToast({
            type: 'error',
            title: 'Lỗi mạng',
            message: 'Không thể kết nối đến máy chủ để tải ảnh.'
          });
        } finally {
          setIsUploadingImage(false);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleToggleSoldOut = async (item: MenuItemDto) => {
    setTogglingItemId(item.id);
    const nextState = !item.isAvailable;
    const res = await toggleMenuItemSoldOut(item.id, nextState);
    setTogglingItemId(null);
    if (!res.success) {
      showToast({
        type: 'error',
        title: 'Lỗi cập nhật',
        message: res.error || 'Không thể đổi trạng thái món ăn'
      });
    } else {
      showToast({
        type: nextState ? 'success' : 'warning',
        title: nextState ? 'Đã mở bán lại' : 'Đã báo hết hàng',
        message: `${item.name}: ${nextState ? 'Khách và thu ngân có thể gọi món này' : 'Món đã được gắn nhãn hết hàng (86d)'}`
      });
    }
  };

  // Modifier Group Handlers in Form
  const addModifierGroup = () => {
    setForm((prev) => ({
      ...prev,
      modifierGroups: [
        ...prev.modifierGroups,
        {
          name: '',
          isRequired: false,
          minSelectStr: '0',
          maxSelectStr: '1',
          options: [{ name: '', priceDeltaStr: '0' }]
        }
      ]
    }));
  };

  const applyPreset = (preset: ModifierPreset) => {
    setForm((prev) => ({
      ...prev,
      modifierGroups: [
        ...prev.modifierGroups,
        {
          ...preset.group,
          options: preset.group.options.map((opt) => ({ ...opt }))
        }
      ]
    }));
    showToast({
      type: 'info',
      title: 'Đã thêm mẫu nhanh',
      message: `Đã thêm nhóm "${preset.group.name}". Bạn có thể đổi tên hoặc giá nếu muốn.`
    });
  };

  const removeModifierGroup = (groupIndex: number) => {
    setForm((prev) => ({
      ...prev,
      modifierGroups: prev.modifierGroups.filter((_, idx) => idx !== groupIndex)
    }));
  };

  const updateModifierGroup = (
    groupIndex: number,
    field: keyof ModifierGroupForm,
    value: any
  ) => {
    setForm((prev) => {
      const updated = [...prev.modifierGroups];
      updated[groupIndex] = { ...updated[groupIndex], [field]: value };
      return { ...prev, modifierGroups: updated };
    });
  };

  const addOptionToGroup = (groupIndex: number) => {
    setForm((prev) => {
      const updated = [...prev.modifierGroups];
      updated[groupIndex] = {
        ...updated[groupIndex],
        options: [...updated[groupIndex].options, { name: '', priceDeltaStr: '0' }]
      };
      return { ...prev, modifierGroups: updated };
    });
  };

  const removeOptionFromGroup = (groupIndex: number, optionIndex: number) => {
    setForm((prev) => {
      const updated = [...prev.modifierGroups];
      updated[groupIndex] = {
        ...updated[groupIndex],
        options: updated[groupIndex].options.filter((_, idx) => idx !== optionIndex)
      };
      return { ...prev, modifierGroups: updated };
    });
  };

  const updateOptionInGroup = (
    groupIndex: number,
    optionIndex: number,
    field: keyof ModifierOptionForm,
    value: string
  ) => {
    setForm((prev) => {
      const updated = [...prev.modifierGroups];
      const updatedOptions = [...updated[groupIndex].options];
      updatedOptions[optionIndex] = { ...updatedOptions[optionIndex], [field]: value };
      updated[groupIndex] = { ...updated[groupIndex], options: updatedOptions };
      return { ...prev, modifierGroups: updated };
    });
  };

  const handleSubmitForm = async () => {
    setFormError(null);

    // Validation
    const name = form.name.trim();
    if (!name) {
      setFormError('Tên món ăn không được để trống.');
      return;
    }

    const basePrice = parseInt(form.basePriceStr, 10);
    if (isNaN(basePrice) || basePrice <= 0) {
      setFormError('Giá cơ bản phải là số nguyên lớn hơn 0 (VND).');
      return;
    }

    if (!form.categoryId) {
      setFormError('Vui lòng chọn danh mục cho món ăn.');
      return;
    }

    const stockQuantity = parseInt(form.stockQuantityStr || '0', 10);
    if (Number.isNaN(stockQuantity) || stockQuantity < 0) {
      setFormError('Số lượng tồn phải là số nguyên lớn hơn hoặc bằng 0.');
      return;
    }

    // Validate modifier groups
    for (let i = 0; i < form.modifierGroups.length; i++) {
      const group = form.modifierGroups[i];
      if (!group.name.trim()) {
        setFormError(`Nhóm tùy chọn #${i + 1} thiếu tên nhóm.`);
        return;
      }
      const minSelect = parseInt(group.minSelectStr, 10);
      const maxSelect = parseInt(group.maxSelectStr, 10);
      if (isNaN(minSelect) || minSelect < 0) {
        setFormError(`Nhóm "${group.name}": Tối thiểu (minSelect) phải là số nguyên >= 0.`);
        return;
      }
      if (isNaN(maxSelect) || maxSelect < 1) {
        setFormError(`Nhóm "${group.name}": Tối đa (maxSelect) phải là số nguyên >= 1.`);
        return;
      }
      if (minSelect > maxSelect) {
        setFormError(`Nhóm "${group.name}": Tối thiểu (${minSelect}) không được lớn hơn Tối đa (${maxSelect}).`);
        return;
      }
      if (group.options.length < maxSelect) {
        setFormError(
          `Nhóm "${group.name}": Có ${group.options.length} lựa chọn, nhưng Tối đa cho phép chọn ${maxSelect}. Số lượng lựa chọn phải >= Tối đa.`
        );
        return;
      }
      for (let j = 0; j < group.options.length; j++) {
        const opt = group.options[j];
        if (!opt.name.trim()) {
          setFormError(`Nhóm "${group.name}" - Lựa chọn #${j + 1} thiếu tên.`);
          return;
        }
        const delta = parseInt(opt.priceDeltaStr || '0', 10);
        if (isNaN(delta) || delta < 0) {
          setFormError(`Nhóm "${group.name}" - Lựa chọn "${opt.name}": Phụ phí phải là số nguyên >= 0.`);
          return;
        }
      }
    }

    const payload: MenuItemUpsertDto = {
      categoryId: form.categoryId,
      name,
      basePrice,
      description: form.description.trim() || undefined,
      imageUrl: form.imageUrl.trim() || undefined,
      isAvailable: form.isAvailable,
      menuType: form.menuType,
      itemType: form.itemType,
      trackStock: form.trackStock,
      stockQuantity,
      position: form.position.trim() || null,
      modifierGroups: form.modifierGroups.map((g) => ({
        name: g.name.trim(),
        isRequired: g.isRequired,
        minSelect: parseInt(g.minSelectStr, 10),
        maxSelect: parseInt(g.maxSelectStr, 10),
        options: g.options.map((opt) => ({
          name: opt.name.trim(),
          priceDelta: parseInt(opt.priceDeltaStr || '0', 10),
          isAvailable: true
        }))
      }))
    };

    setIsSubmitting(true);
    let res;
    if (editingItem) {
      res = await updateMenuItem(editingItem.id, payload);
    } else {
      res = await createMenuItem(payload);
    }
    setIsSubmitting(false);

    if (res.success) {
      setIsModalOpen(false);
      showToast({
        type: 'success',
        title: 'Thành công',
        message: editingItem ? `Đã cập nhật món "${name}"!` : `Đã thêm món "${name}" vào thực đơn!`
      });
    } else {
      setFormError(res.error || 'Có lỗi xảy ra khi lưu món ăn.');
      showToast({
        type: 'error',
        title: 'Chưa thể lưu món',
        message: res.error || 'Có lỗi xảy ra khi lưu món ăn.'
      });
    }
  };

  const openCategoryManagement = () => {
    setOrderedCategories([...categories].sort((a, b) => a.displayOrder - b.displayOrder));
    setEditingCategory(null);
    setCategoryName('');
    setCategoryDisplayOrder(String(categories.length));
    setCategoryError(null);
    setIsCategoryModalOpen(true);
  };

  const editCategory = (category: CategoryDto) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryDisplayOrder(String(category.displayOrder));
    setCategoryError(null);
  };

  const resetCategoryDraft = () => {
    setEditingCategory(null);
    setCategoryName('');
    setCategoryDisplayOrder(String(orderedCategories.length));
    setCategoryError(null);
  };

  const saveCategory = async () => {
    setCategoryError(null);
    let payload: { name: string; displayOrder: number };
    try {
      payload = normalizeCategoryDraft(categoryName, categoryDisplayOrder);
    } catch (error: any) {
      setCategoryError(error.message);
      return;
    }

    setIsCategorySaving(true);
    const result = editingCategory
      ? await updateCategory(editingCategory.id, payload)
      : await createCategory(payload);
    setIsCategorySaving(false);

    if (!result.success) {
      setCategoryError(result.error || 'Không thể lưu nhóm món');
      return;
    }

    resetCategoryDraft();
    showToast({
      type: 'success',
      title: editingCategory ? 'Đã cập nhật nhóm món' : 'Đã tạo nhóm món',
      message: payload.name
    });
  };

  const saveCategoryOrder = async () => {
    setIsCategoryReordering(true);
    const result = await reorderCategories(orderedCategories.map(category => category.id));
    setIsCategoryReordering(false);
    if (!result.success) {
      setCategoryError(result.error || 'Không thể sắp xếp nhóm món');
      return;
    }
    showToast({ type: 'success', title: 'Đã lưu thứ tự nhóm món', message: 'Bộ lọc thực đơn đã được cập nhật.' });
  };

  const moveCategoryInList = (index: number, direction: -1 | 1) => {
    setOrderedCategories(previous => moveCategory(previous, index, direction));
  };

  const executeDeleteCategory = async (category: CategoryDto, moveToCategoryId?: number) => {
    setCategoryError(null);
    const result = await deleteCategory(category.id, moveToCategoryId);
    if (!result.success) {
      setCategoryError(result.error || 'Không thể xóa nhóm món');
      return;
    }
    if (editingCategory?.id === category.id) resetCategoryDraft();
    showToast({ type: 'success', title: 'Đã xóa nhóm món', message: category.name });
  };

  const confirmDeleteCategory = (category: CategoryDto) => {
    const targets = orderedCategories.filter(candidate => candidate.id !== category.id);
    const menuItemCount = category.menuItems?.length ?? 0;
    const buttons = [
      { text: 'Hủy', style: 'cancel' as const },
      ...(menuItemCount > 0
        ? targets.map(target => ({
            text: `Chuyển món sang ${target.name}`,
            onPress: () => void executeDeleteCategory(category, target.id)
          }))
        : [{ text: 'Xóa', style: 'destructive' as const, onPress: () => void executeDeleteCategory(category) }])
    ];
    Alert.alert(
      menuItemCount > 0 ? 'Chọn danh mục đích' : 'Xóa nhóm món?',
      menuItemCount > 0
        ? `Nhóm "${category.name}" đang có ${menuItemCount} món. Chọn nơi chuyển món trước khi xóa.`
        : `Xóa nhóm "${category.name}"?`,
      buttons
    );
  };

  const downloadMenu = async (format: 'csv' | 'xlsx') => {
    if (Platform.OS !== 'web') {
      showToast({ type: 'info', title: 'Export trên web', message: 'Hãy mở trang quản trị trên trình duyệt web để tải file menu.' });
      return;
    }

    try {
      const blob = await downloadMenuExportApi(token, format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `menu_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast({ type: 'success', title: 'Đã export menu', message: `File ${format.toUpperCase()} đã sẵn sàng.` });
    } catch (error) {
      showToast({ type: 'error', title: 'Không thể export menu', message: error instanceof Error ? error.message : 'Lỗi tải file menu.' });
    }
  };

  const getCategoryName = (catId: number) => {
    return categories.find((c) => c.id === catId)?.name || 'Khác';
  };

  const getModifierSummary = (item: MenuItemDto) => {
    const groups = item.modifierGroups || [];
    if (groups.length === 0) {
      return 'Không có tùy chọn';
    }
    const optionCount = groups.reduce((total, group) => total + group.options.length, 0);
    return `${groups.length} nhóm · ${optionCount} lựa chọn`;
  };

  const renderCheckbox = (checked: boolean, onPress: () => void, label: string) => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.checkbox,
        {
          backgroundColor: checked ? theme.interactivePrimary : theme.surfaceBase,
          borderColor: checked ? theme.interactivePrimary : theme.borderStrong,
          opacity: pressed ? 0.76 : 1
        }
      ]}
    >
      {checked && <AppIcon icon={Check} color={theme.textInverse} size={14} />}
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={[styles.toolbar, isMobile && styles.toolbarMobile, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <ScreenHeader
          title="Món"
          description={`${filteredItems.length} / ${allMenuItems.length} món đang hiển thị${selectedItemIds.length > 0 ? ` · đã chọn ${selectedItemIds.length}` : ''}`}
          actions={(
            <View style={styles.headerActions}>
              <Button testID="admin-btn-manage-categories" variant="secondary" label="Nhóm món" icon={Pencil} onPress={openCategoryManagement} />
              <Button testID="admin-btn-import-menu" variant="secondary" label="Import menu" icon={Upload} onPress={() => setIsImportModalOpen(true)} />
              <Button testID="admin-btn-export-csv" variant="secondary" label="Export CSV" icon={Download} onPress={() => void downloadMenu('csv')} />
              <Button testID="admin-btn-export-xlsx" variant="secondary" label="Export Excel" icon={FileSpreadsheet} onPress={() => void downloadMenu('xlsx')} />
              <Button testID="admin-btn-add-item" variant="primary" label="Món mới" icon={Plus} onPress={openCreateModal} />
            </View>
          )}
        />
        <View style={[styles.commandBar, isMobile && styles.commandBarMobile]}>
          <View style={[styles.searchBox, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <AppIcon icon={Search} color={theme.textSecondary} size={18} />
            <TextInput
              accessibilityLabel="Tìm món"
              style={[styles.searchInput, { color: theme.textPrimary }]}
              placeholder="Theo mã, tên, nhóm hoặc vị trí"
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm" onPress={() => setSearchQuery('')} style={styles.iconButton}>
                <AppIcon icon={X} color={theme.textSecondary} size={18} />
              </Pressable>
            )}
          </View>
          <View style={styles.toolbarActions}>
            <Button variant="secondary" label="Xóa lọc" onPress={clearFilters} />
          </View>
        </View>
        {selectedItemIds.length > 0 && (
          <MenuBulkActions
            selectedIds={selectedItemIds}
            categories={categories}
            loading={isLoadingMenu}
            onSubmit={handleBulkSubmit}
            onClear={() => setSelectedItemIds([])}
          />
        )}
      </View>

      <View style={[styles.managementBody, isMobile && styles.managementBodyMobile]}>
        {!isMobile && (
          <Surface level="raised" style={styles.filterSidebar}>
            <ScrollView contentContainerStyle={styles.filterContent} showsVerticalScrollIndicator={false}>
              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <Text style={[styles.filterTitle, { color: theme.textPrimary }]}>Nhóm món</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Quản lý nhóm món" onPress={openCategoryManagement}>
                    <Text style={[styles.filterManageLink, { color: theme.primary }]}>Quản lý</Text>
                  </Pressable>
                </View>
                {categoryFilters.map((category) => {
                  const selected = selectedCategoryId === category.id;
                  return (
                    <Pressable
                      key={category.id ?? 'all'}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedCategoryId(category.id)}
                      style={({ pressed }) => [
                        styles.filterOption,
                        {
                          backgroundColor: selected ? theme.interactiveQuiet : 'transparent',
                          opacity: pressed ? 0.76 : 1
                        }
                      ]}
                    >
                      <Text style={[styles.filterOptionText, { color: selected ? theme.primary : theme.textPrimary }]} numberOfLines={1}>{category.name}</Text>
                      <Text style={[styles.filterCount, { color: theme.textSecondary }]}>{category.count}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.filterSection}>
                <Text style={[styles.filterTitle, { color: theme.textPrimary }]}>Cho phép bán</Text>
                {[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'available', label: 'Có' },
                  { value: 'unavailable', label: 'Không' }
                ].map((option) => {
                  const selected = availabilityFilter === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setAvailabilityFilter(option.value as MenuAvailabilityFilter)}
                      style={styles.radioRow}
                    >
                      <View style={[styles.radioDot, { borderColor: selected ? theme.interactivePrimary : theme.borderStrong }]}>
                        {selected && <View style={[styles.radioDotInner, { backgroundColor: theme.interactivePrimary }]} />}
                      </View>
                      <Text style={[styles.filterOptionText, { color: theme.textPrimary }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.filterSection}>
                <Text style={[styles.filterTitle, { color: theme.textPrimary }]}>Loại thực đơn</Text>
                {([{ value: 'all', label: 'Tất cả' }, ...MENU_TYPE_OPTIONS] as Array<{ value: MenuTypeFilter; label: string }>).map((option) => {
                  const selected = menuTypeFilter === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setMenuTypeFilter(option.value)}
                      style={styles.radioRow}
                    >
                      <View style={[styles.radioDot, { borderColor: selected ? theme.interactivePrimary : theme.borderStrong }]}>
                        {selected && <View style={[styles.radioDotInner, { backgroundColor: theme.interactivePrimary }]} />}
                      </View>
                      <Text style={[styles.filterOptionText, { color: theme.textPrimary }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.filterSection}>
                <Text style={[styles.filterTitle, { color: theme.textPrimary }]}>Loại món</Text>
                {([{ value: 'all', label: 'Tất cả' }, ...ITEM_TYPE_OPTIONS] as Array<{ value: MenuItemTypeFilter; label: string }>).map((option) => {
                  const selected = itemTypeFilter === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setItemTypeFilter(option.value)}
                      style={styles.radioRow}
                    >
                      <View style={[styles.radioDot, { borderColor: selected ? theme.interactivePrimary : theme.borderStrong }]}>
                        {selected && <View style={[styles.radioDotInner, { backgroundColor: theme.interactivePrimary }]} />}
                      </View>
                      <Text style={[styles.filterOptionText, { color: theme.textPrimary }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.filterSection}>
                <Text style={[styles.filterTitle, { color: theme.textPrimary }]}>Tồn kho</Text>
                {[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'tracked', label: 'Có theo dõi tồn' },
                  { value: 'untracked', label: 'Không theo dõi tồn' },
                  { value: 'inStock', label: 'Còn tồn' },
                  { value: 'outOfStock', label: 'Hết tồn' }
                ].map((option) => {
                  const selected = stockStatusFilter === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setStockStatusFilter(option.value as MenuStockFilter)}
                      style={styles.radioRow}
                    >
                      <View style={[styles.radioDot, { borderColor: selected ? theme.interactivePrimary : theme.borderStrong }]}>
                        {selected && <View style={[styles.radioDotInner, { backgroundColor: theme.interactivePrimary }]} />}
                      </View>
                      <Text style={[styles.filterOptionText, { color: theme.textPrimary }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.filterSection}>
                <Text style={[styles.filterTitle, { color: theme.textPrimary }]}>Thuộc tính</Text>
                {[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'withOptions', label: 'Có tùy chọn' },
                  { value: 'withoutOptions', label: 'Không tùy chọn' }
                ].map((option) => {
                  const selected = optionPresenceFilter === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setOptionPresenceFilter(option.value as MenuOptionPresenceFilter)}
                      style={styles.radioRow}
                    >
                      <View style={[styles.radioDot, { borderColor: selected ? theme.interactivePrimary : theme.borderStrong }]}>
                        {selected && <View style={[styles.radioDotInner, { backgroundColor: theme.interactivePrimary }]} />}
                      </View>
                      <Text style={[styles.filterOptionText, { color: theme.textPrimary }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Surface>
        )}

        <View style={styles.managementMain}>
          {isMobile && (
            <Surface level="raised" style={styles.mobileFilters}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
                {categoryFilters.map((category) => {
                  const selected = selectedCategoryId === category.id;
                  return (
                    <Pressable
                      key={category.id ?? 'all'}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedCategoryId(category.id)}
                      style={[styles.pill, { backgroundColor: selected ? theme.interactivePrimary : theme.interactiveQuiet }]}
                    >
                      <Text style={[styles.pillText, { color: selected ? theme.textInverse : theme.textPrimary }]}>{category.name} ({category.count})</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.mobileFilterGroup}>
                <Text style={[styles.filterTitle, { color: theme.textPrimary }]}>Loại thực đơn</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: menuTypeFilter === 'all' }} onPress={() => setMenuTypeFilter('all')} style={[styles.pill, { backgroundColor: menuTypeFilter === 'all' ? theme.interactivePrimary : theme.interactiveQuiet }]}>
                    <Text style={[styles.pillText, { color: menuTypeFilter === 'all' ? theme.textInverse : theme.textPrimary }]}>Tất cả</Text>
                  </Pressable>
                  {MENU_TYPE_OPTIONS.map((option) => {
                    const selected = menuTypeFilter === option.value;
                    return (
                      <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setMenuTypeFilter(option.value)} style={[styles.pill, { backgroundColor: selected ? theme.interactivePrimary : theme.interactiveQuiet }]}>
                        <Text style={[styles.pillText, { color: selected ? theme.textInverse : theme.textPrimary }]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.mobileFilterGroup}>
                <Text style={[styles.filterTitle, { color: theme.textPrimary }]}>Loại món</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
                  {([{ value: 'all', label: 'Tất cả' }, ...ITEM_TYPE_OPTIONS] as Array<{ value: MenuItemTypeFilter; label: string }>).map((option) => {
                    const selected = itemTypeFilter === option.value;
                    return (
                      <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setItemTypeFilter(option.value)} style={[styles.pill, { backgroundColor: selected ? theme.interactivePrimary : theme.interactiveQuiet }]}>
                        <Text style={[styles.pillText, { color: selected ? theme.textInverse : theme.textPrimary }]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.mobileFilterGroup}>
                <Text style={[styles.filterTitle, { color: theme.textPrimary }]}>Tồn kho</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
                  {[
                    { value: 'all', label: 'Tất cả' },
                    { value: 'tracked', label: 'Theo dõi tồn' },
                    { value: 'inStock', label: 'Còn tồn' },
                    { value: 'outOfStock', label: 'Hết tồn' }
                  ].map((option) => {
                    const selected = stockStatusFilter === option.value;
                    return (
                      <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setStockStatusFilter(option.value as MenuStockFilter)} style={[styles.pill, { backgroundColor: selected ? theme.interactivePrimary : theme.interactiveQuiet }]}>
                        <Text style={[styles.pillText, { color: selected ? theme.textInverse : theme.textPrimary }]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </Surface>
          )}

          <View style={[styles.noticeBar, { backgroundColor: theme.interactiveQuiet }]}>
            <Text style={[styles.noticeBadge, { backgroundColor: theme.interactivePrimary, color: theme.textInverse }]}>Tính năng mới</Text>
            <Text style={[styles.noticeText, { color: theme.textPrimary }]} numberOfLines={2}>
              Quản lý nhóm tùy chọn, trạng thái bán và giá món trong một bảng thao tác nhanh.
            </Text>
          </View>

          {isLoadingMenu ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang tải thực đơn…</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title="Không có món phù hợp"
              description="Thử từ khóa hoặc bộ lọc khác, hoặc thêm món mới vào thực đơn."
              action={<Button variant="secondary" label="Thêm món" icon={Plus} onPress={openCreateModal} />}
            />
          ) : isMobile ? (
            <ScrollView contentContainerStyle={styles.mobileList}>
              {filteredItems.map((item) => {
                const isToggling = togglingItemId === item.id;
                const selected = selectedItemIds.includes(item.id);
                return (
                  <Surface key={item.id} level="raised" style={[styles.mobileItemCard, !item.isAvailable && styles.itemUnavailable]}>
                    <View style={styles.mobileItemHeader}>
                      {renderCheckbox(selected, () => toggleItemSelection(item.id), `Chọn món ${item.name}`)}
                      <View style={[styles.thumbnailContainer, { backgroundColor: theme.surfaceSunken }]}>
                        {item.imageUrl ? <Image source={{ uri: resolveImageUrl(item.imageUrl) || '' }} style={styles.thumbnail} resizeMode="cover" /> : <AppIcon icon={ImageIcon} color={theme.textSecondary} size={22} />}
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={[styles.itemCode, { color: theme.textSecondary }]}>{item.sku || formatMenuItemCode(item.id)}</Text>
                        <Text style={[styles.itemName, { color: theme.textPrimary }]} numberOfLines={2}>{item.name}</Text>
                        <Text style={[styles.itemMeta, { color: theme.textSecondary }]} numberOfLines={1}>{getCategoryName(item.categoryId)} · {menuTypeLabel(item.menuType)} · {itemTypeLabel(item.itemType)}</Text>
                      </View>
                    </View>
                    {item.description ? <Text style={[styles.itemDescription, { color: theme.textSecondary }]} numberOfLines={2}>{item.description}</Text> : null}
                    <View style={styles.mobileItemFooter}>
                      <Text style={[styles.itemPrice, { color: theme.textPrimary }]}>{item.basePrice.toLocaleString('vi-VN')} đ</Text>
                      <StatusBadge tone={item.isAvailable ? 'success' : 'danger'} label={item.isAvailable ? 'Đang bán' : 'Ngừng bán'} />
                    </View>
                    <View style={styles.mobileItemFooter}>
                      <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>{getModifierSummary(item)}</Text>
                      <StatusBadge
                        tone={!item.trackStock ? 'neutral' : item.stockQuantity > 0 ? 'success' : 'danger'}
                        label={!item.trackStock ? 'Không theo dõi tồn' : item.stockQuantity > 0 ? `${item.stockQuantity} tồn` : 'Hết tồn'}
                      />
                      {isToggling ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <Switch
                          {...switchAppearance}
                          testID={`menu-item-switch-${item.id}`}
                          accessibilityLabel={`${item.isAvailable ? 'Đánh dấu hết món' : 'Mở bán lại'} ${item.name}`}
                          value={item.isAvailable}
                          onValueChange={() => void handleToggleSoldOut(item)}
                          trackColor={{ false: statusColors.danger.border, true: statusColors.success.border }}
                          thumbColor={theme.surfaceBase}
                        />
                      )}
                    </View>
                    <Button variant="secondary" label="Chỉnh sửa" icon={Pencil} onPress={() => openEditModal(item)} />
                  </Surface>
                );
              })}
            </ScrollView>
          ) : (
            <Surface level="raised" style={styles.menuTable}>
              <View style={[styles.tableHeader, { backgroundColor: theme.surfaceSunken, borderBottomColor: theme.borderSubtle }]}>
                <View style={styles.selectColumn}>{renderCheckbox(allVisibleSelected, toggleVisibleSelection, 'Chọn tất cả món đang hiển thị')}</View>
                <Text style={[styles.headerItem, styles.codeColumn, { color: theme.textSecondary }]}>Mã món</Text>
                <Text style={[styles.headerItem, styles.nameColumn, { color: theme.textSecondary }]}>Tên món</Text>
                <Text style={[styles.headerItem, styles.groupColumn, { color: theme.textSecondary }]}>Nhóm món</Text>
                <Text style={[styles.headerItem, styles.optionColumn, { color: theme.textSecondary }]}>Tùy chọn</Text>
                <Text style={[styles.headerItem, styles.statusColumn, { color: theme.textSecondary }]}>Trạng thái</Text>
                <Text style={[styles.headerItem, styles.priceColumn, { color: theme.textSecondary }]}>Giá bán</Text>
                <Text style={[styles.headerItem, styles.actionHeaderColumn, { color: theme.textSecondary }]}>Thao tác</Text>
              </View>

              <ScrollView style={styles.tableScroller} showsVerticalScrollIndicator>
                {filteredItems.map((item, index) => {
                  const isToggling = togglingItemId === item.id;
                  const selected = selectedItemIds.includes(item.id);
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.itemRow,
                        index < filteredItems.length - 1 && { borderBottomColor: theme.borderSubtle, borderBottomWidth: 1 },
                        !item.isAvailable && styles.itemUnavailable
                      ]}
                    >
                      <View style={styles.selectColumn}>{renderCheckbox(selected, () => toggleItemSelection(item.id), `Chọn món ${item.name}`)}</View>
                      <View style={[styles.codeColumn, styles.codeCell]}>
                        <View style={[styles.thumbnailContainer, { backgroundColor: theme.surfaceSunken }]}>
                          {item.imageUrl ? <Image source={{ uri: resolveImageUrl(item.imageUrl) || '' }} style={styles.thumbnail} resizeMode="cover" /> : <AppIcon icon={ImageIcon} color={theme.textSecondary} size={20} />}
                        </View>
                        <Text style={[styles.itemCode, { color: theme.textPrimary }]}>{item.sku || formatMenuItemCode(item.id)}</Text>
                      </View>
                      <View style={styles.nameColumn}>
                        <Text style={[styles.itemName, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                        {item.description ? <Text style={[styles.itemDescription, { color: theme.textSecondary }]} numberOfLines={1}>{item.description}</Text> : null}
                        <Text style={[styles.itemMeta, { color: theme.textSecondary }]} numberOfLines={1}>{menuTypeLabel(item.menuType)} · {itemTypeLabel(item.itemType)}{item.position ? ` · ${item.position}` : ''}</Text>
                      </View>
                      <Text style={[styles.groupColumn, styles.tableText, { color: theme.textPrimary }]} numberOfLines={1}>{getCategoryName(item.categoryId)}</Text>
                      <Text style={[styles.optionColumn, styles.tableText, { color: theme.textSecondary }]} numberOfLines={1}>{getModifierSummary(item)}</Text>
                      <View style={styles.statusColumn}>
                        <StatusBadge tone={item.isAvailable ? 'success' : 'danger'} label={item.isAvailable ? 'Đang bán' : 'Ngừng bán'} />
                        <StatusBadge
                          tone={!item.trackStock ? 'neutral' : item.stockQuantity > 0 ? 'success' : 'danger'}
                          label={!item.trackStock ? 'Không theo dõi' : item.stockQuantity > 0 ? `${item.stockQuantity} tồn` : 'Hết tồn'}
                        />
                      </View>
                      <Text style={[styles.itemPrice, styles.priceColumn, { color: theme.textPrimary }]}>{item.basePrice.toLocaleString('vi-VN')}</Text>
                      <View style={styles.actionColumn}>
                        {isToggling ? (
                          <ActivityIndicator size="small" color={theme.primary} />
                        ) : (
                          <Switch
                            {...switchAppearance}
                            testID={`menu-item-switch-${item.id}`}
                            accessibilityLabel={`${item.isAvailable ? 'Đánh dấu hết món' : 'Mở bán lại'} ${item.name}`}
                            value={item.isAvailable}
                            onValueChange={() => void handleToggleSoldOut(item)}
                            trackColor={{ false: statusColors.danger.border, true: statusColors.success.border }}
                            thumbColor={theme.surfaceBase}
                          />
                        )}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Chỉnh sửa món ${item.name}`}
                          onPress={() => openEditModal(item)}
                          style={({ pressed }) => [styles.iconEditButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}
                        >
                          <AppIcon icon={Pencil} color={theme.textPrimary} size={17} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </Surface>
          )}
        </View>
      </View>

      <MenuImportModal
        visible={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onCommitted={() => void fetchMenu()}
      />

      <Modal visible={isCategoryModalOpen} animationType="slide" transparent onRequestClose={() => setIsCategoryModalOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalCard, styles.categoryModalCard, elevation.modal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.modalHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.modalTitle, { color: theme.textPrimary }]}>Quản lý nhóm món</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>Tạo, đổi tên, xóa và sắp xếp nhóm hiển thị trên menu.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Đóng quản lý nhóm món" onPress={() => setIsCategoryModalOpen(false)} style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}>
                <AppIcon icon={X} color={theme.textPrimary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.categoryModalBody}>
              {categoryError && <InlineAlert title="Chưa thể cập nhật nhóm món" message={categoryError} />}
              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{editingCategory ? 'Sửa nhóm món' : 'Tạo nhóm món mới'}</Text>
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Tên nhóm được chuẩn hóa trước khi gửi lên máy chủ.</Text>
                </View>
                <Field label="Tên nhóm *" placeholder="Ví dụ: Đồ uống" value={categoryName} onChangeText={setCategoryName} />
                <Field label="Thứ tự hiển thị" placeholder="0" keyboardType="numeric" value={categoryDisplayOrder} onChangeText={value => setCategoryDisplayOrder(value.replace(/[^0-9]/g, ''))} />
                <View style={styles.categoryFormActions}>
                  {editingCategory && <Button variant="quiet" label="Tạo mới" onPress={resetCategoryDraft} />}
                  <Button variant="primary" label={editingCategory ? 'Lưu nhóm' : 'Tạo nhóm'} loading={isCategorySaving} onPress={() => void saveCategory()} />
                </View>
              </View>

              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Danh sách nhóm món</Text>
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Dùng mũi tên để đổi vị trí, sau đó lưu thứ tự.</Text>
                </View>
                <View style={styles.categoryList}>
                  {orderedCategories.map((category, index) => (
                    <View key={category.id} style={[styles.categoryRow, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceSunken }]}>
                      <View style={styles.categoryRowCopy}>
                        <Text style={[styles.categoryRowName, { color: theme.textPrimary }]}>{category.name}</Text>
                        <Text style={[styles.categoryRowMeta, { color: theme.textSecondary }]}>{category.menuItems?.length ?? 0} món · thứ tự {index + 1}</Text>
                      </View>
                      <View style={styles.categoryRowActions}>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Đưa ${category.name} lên`} disabled={index === 0} onPress={() => moveCategoryInList(index, -1)} style={[styles.iconButton, { opacity: index === 0 ? 0.35 : 1 }]}>
                          <AppIcon icon={ArrowUp} color={theme.textPrimary} size={17} />
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Đưa ${category.name} xuống`} disabled={index === orderedCategories.length - 1} onPress={() => moveCategoryInList(index, 1)} style={[styles.iconButton, { opacity: index === orderedCategories.length - 1 ? 0.35 : 1 }]}>
                          <AppIcon icon={ArrowDown} color={theme.textPrimary} size={17} />
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Sửa ${category.name}`} onPress={() => editCategory(category)} style={styles.iconButton}>
                          <AppIcon icon={Pencil} color={theme.primary} size={17} />
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${category.name}`} onPress={() => confirmDeleteCategory(category)} style={styles.iconButton}>
                          <AppIcon icon={Trash2} color={theme.danger} size={17} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
                <Button variant="secondary" label="Lưu thứ tự" loading={isCategoryReordering} onPress={() => void saveCategoryOrder()} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={isModalOpen} animationType="slide" transparent onRequestClose={() => setIsModalOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalCard, elevation.modal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.modalHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.modalTitle, { color: theme.textPrimary }]}>{editingItem ? 'Chỉnh sửa món' : 'Thêm món mới'}</Text>
                {editingItem && <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>{editingItem.name}</Text>}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Đóng biểu mẫu" onPress={() => setIsModalOpen(false)} style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}>
                <AppIcon icon={X} color={theme.textPrimary} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {formError && <InlineAlert title="Chưa thể lưu món" message={formError} />}

              {/* === Live Preview Section (Giao diện xem trước thực tế) === */}
              <View style={[styles.previewSection, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}>
                <View style={styles.previewHeader}>
                  <View style={styles.previewBadge}>
                    <AppIcon icon={Eye} size={15} color={theme.primary} />
                    <Text style={[styles.previewTitle, { color: theme.textPrimary }]}>Xem trước hiển thị</Text>
                  </View>
                  <Text style={[styles.previewHint, { color: theme.textSecondary }]}>Mô phỏng như trên máy POS & điện thoại khách</Text>
                </View>

                <View style={[styles.previewCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
                  <View style={[styles.previewImgBox, { backgroundColor: theme.surfaceSunken }]}>
                    {form.imageUrl ? (
                      <Image
                        source={{ uri: resolveImageUrl(form.imageUrl) || '' }}
                        style={styles.previewImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <AppIcon icon={ImageIcon} size={28} color={theme.textSecondary} />
                    )}
                  </View>
                  <View style={styles.previewDetails}>
                    <View style={styles.previewRow}>
                      <Text style={[styles.previewItemName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {form.name.trim() || 'Tên món ăn...'}
                      </Text>
                      <StatusBadge
                        tone={form.isAvailable ? 'success' : 'danger'}
                        label={form.isAvailable ? 'Còn hàng' : 'Hết món'}
                      />
                    </View>
                    <Text style={[styles.previewCategory, { color: theme.textSecondary }]}>
                      {getCategoryName(form.categoryId)}
                    </Text>
                    <Text style={[styles.previewPrice, { color: theme.primary }]}>
                      {form.basePriceStr ? Number(form.basePriceStr).toLocaleString('vi-VN') + ' đ' : '0 đ'}
                    </Text>
                    {form.description.trim() ? (
                      <Text style={[styles.previewDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                        {form.description.trim()}
                      </Text>
                    ) : null}
                    {form.modifierGroups.length > 0 && (
                      <View style={styles.previewTags}>
                        {form.modifierGroups.map((g, idx) => (
                          <View key={idx} style={[styles.previewTag, { backgroundColor: theme.surfaceSunken }]}>
                            <Text style={[styles.previewTagText, { color: theme.textSecondary }]}>
                              {g.name || `Nhóm ${idx + 1}`} ({g.options.length})
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Thông tin món</Text>
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Tên, danh mục và nội dung khách nhìn thấy.</Text>
                </View>
                <Field label="Tên món *" placeholder="Ví dụ: Burger bò phô mai" value={form.name} onChangeText={(value) => setForm((previous) => ({ ...previous, name: value }))} />
                <View style={styles.categoryField}>
                  <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Danh mục *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
                    {categories.map((category) => {
                      const selected = form.categoryId === category.id;
                      return (
                        <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setForm((previous) => ({ ...previous, categoryId: category.id }))} style={[styles.pill, { backgroundColor: selected ? theme.interactivePrimary : theme.interactiveQuiet }]}>
                          <Text style={[styles.pillText, { color: selected ? theme.textInverse : theme.textPrimary }]}>{category.name}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
                {editingItem ? (
                  <Field
                    label="Mã món (SKU)"
                    value={editingItem.sku || formatMenuItemCode(editingItem.id)}
                    editable={false}
                    description="Mã món do hệ thống tự sinh và không thể sửa thủ công."
                  />
                ) : (
                  <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>Mã món (SKU) sẽ được hệ thống tự sinh sau khi tạo, theo dạng SP000001.</Text>
                )}
                <Field label="Mô tả" placeholder="Thành phần hoặc đặc điểm của món" multiline numberOfLines={3} style={styles.textArea} value={form.description} onChangeText={(value) => setForm((previous) => ({ ...previous, description: value }))} />
                {/* === Image Upload Section === */}
                <View style={styles.imageSection}>
                  <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Ảnh món</Text>
                  {/* Preview */}
                  {form.imageUrl ? (
                    <View style={[styles.imagePreviewBox, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}>
                      <Image
                        source={{ uri: resolveImageUrl(form.imageUrl) || '' }}
                        style={styles.imagePreview}
                        resizeMode="cover"
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Xóa ảnh"
                        onPress={() => setForm((prev) => ({ ...prev, imageUrl: '' }))}
                        style={[styles.imageRemoveBtn, { backgroundColor: theme.danger }]}
                      >
                        <AppIcon icon={Trash2} color={theme.textInverse} size={14} />
                      </Pressable>
                    </View>
                  ) : null}
                  {/* Upload button (web only) */}
                  {Platform.OS === 'web' && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Tải ảnh từ máy tính"
                      disabled={isUploadingImage}
                      onPress={handlePickFile}
                      style={({ pressed }) => [
                        styles.uploadButton,
                        {
                          backgroundColor: pressed ? theme.interactiveQuiet : theme.surfaceSunken,
                          borderColor: theme.borderSubtle,
                          opacity: isUploadingImage ? 0.6 : 1
                        }
                      ]}
                    >
                      {isUploadingImage ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <AppIcon icon={Upload} color={theme.textSecondary} size={18} />
                      )}
                      <Text style={[styles.uploadButtonText, { color: theme.textSecondary }]}>
                        {isUploadingImage ? 'Đang tải lên…' : 'Tải ảnh từ máy tính'}
                      </Text>
                    </Pressable>
                  )}
                  {/* Manual URL input */}
                  <Field
                    label={Platform.OS === 'web' ? 'Hoặc dán liên kết ảnh (URL)' : 'Đường dẫn ảnh (URL)'}
                    placeholder="https://example.com/image.jpg"
                    autoCapitalize="none"
                    value={form.imageUrl}
                    onChangeText={(value) => setForm((previous) => ({ ...previous, imageUrl: value }))}
                  />
                </View>
              </View>

              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Phân loại và tồn kho</Text>
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Metadata dùng cho báo cáo, bộ lọc quản trị và vận hành kho.</Text>
                </View>

                <View style={styles.metadataField}>
                  <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Loại thực đơn *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
                    {MENU_TYPE_OPTIONS.map((option) => {
                      const selected = form.menuType === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setForm((previous) => ({ ...previous, menuType: option.value }))}
                          style={[styles.pill, { backgroundColor: selected ? theme.interactivePrimary : theme.interactiveQuiet }]}
                        >
                          <Text style={[styles.pillText, { color: selected ? theme.textInverse : theme.textPrimary }]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.metadataField}>
                  <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Loại món *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPills}>
                    {ITEM_TYPE_OPTIONS.map((option) => {
                      const selected = form.itemType === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setForm((previous) => ({ ...previous, itemType: option.value }))}
                          style={[styles.pill, { backgroundColor: selected ? theme.interactivePrimary : theme.interactiveQuiet }]}
                        >
                          <Text style={[styles.pillText, { color: selected ? theme.textInverse : theme.textPrimary }]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.formAvailability}>
                  <View style={styles.sectionHeading}>
                    <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Theo dõi tồn kho</Text>
                    <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Bật để cảnh báo hết tồn trong quản trị. Quy tắc trừ kho thuộc Phase 7.</Text>
                  </View>
                  <Switch
                    {...switchAppearance}
                    accessibilityLabel="Theo dõi tồn kho"
                    value={form.trackStock}
                    onValueChange={(value) => setForm((previous) => ({ ...previous, trackStock: value }))}
                    trackColor={{ false: theme.borderStrong, true: theme.interactivePrimary }}
                  />
                </View>

                <View style={[styles.formColumns, isMobile && styles.formColumnsMobile]}>
                  <View style={styles.growField}>
                    <Field
                      label="Số lượng tồn"
                      placeholder="0"
                      keyboardType="numeric"
                      editable={form.trackStock}
                      value={form.stockQuantityStr}
                      onChangeText={(value) => setForm((previous) => ({ ...previous, stockQuantityStr: value.replace(/[^0-9]/g, '') }))}
                      description={form.trackStock ? 'Số lượng hiện có của món.' : 'Bật theo dõi tồn kho để nhập số lượng.'}
                    />
                  </View>
                  <View style={styles.growField}>
                    <Field
                      label="Vị trí"
                      placeholder="Ví dụ: Quầy nóng, kho A"
                      value={form.position}
                      onChangeText={(value) => setForm((previous) => ({ ...previous, position: value }))}
                      description="Khu vực/quầy/kho phục vụ quản trị."
                    />
                  </View>
                </View>
              </View>

              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Giá bán</Text>
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Nhập giá cơ bản trước tùy chọn, theo VND.</Text>
                </View>
                <Field label="Giá cơ bản *" placeholder="65000" keyboardType="numeric" value={form.basePriceStr} onChangeText={(value) => setForm((previous) => ({ ...previous, basePriceStr: value.replace(/[^0-9]/g, '') }))} />
              </View>

              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Tình trạng phục vụ</Text>
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Cho phép nhân viên và khách chọn món này ngay sau khi lưu.</Text>
                </View>
                <View style={styles.formAvailability}>
                  <StatusBadge tone={form.isAvailable ? 'success' : 'danger'} label={form.isAvailable ? 'Còn hàng' : 'Hết món'} />
                  <Switch {...switchAppearance} accessibilityLabel="Mở bán món" value={form.isAvailable} onValueChange={(value) => setForm((previous) => ({ ...previous, isAvailable: value }))} trackColor={{ false: statusColors.danger.border, true: statusColors.success.border }} />
                </View>
              </View>

              <View style={[styles.formSection, { borderColor: theme.borderSubtle }]}>
                <View style={[styles.modifierHeader, isMobile && styles.modifierHeaderMobile]}>
                  <View style={styles.sectionHeading}>
                    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Nhóm tùy chọn</Text>
                    <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>Cỡ phần, vị sốt hoặc món thêm đi kèm.</Text>
                  </View>
                  <Button variant="secondary" label="Thêm nhóm" icon={Plus} onPress={addModifierGroup} />
                </View>

                {/* Presets Bar (Mẫu chọn 1 chạm thông dụng) */}
                <View style={styles.presetsContainer}>
                  <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>
                    ⚡ Thêm nhanh mẫu phổ biến:
                  </Text>
                  <View style={styles.presetButtonsRow}>
                    {MODIFIER_PRESETS.map((preset) => (
                      <Pressable
                        key={preset.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Thêm mẫu ${preset.label}`}
                        style={({ pressed }) => [
                          styles.presetChip,
                          {
                            backgroundColor: pressed ? theme.interactiveQuiet : theme.surfaceBase,
                            borderColor: theme.borderSubtle
                          }
                        ]}
                        onPress={() => applyPreset(preset)}
                      >
                        <AppIcon icon={Sparkles} size={13} color={theme.primary} />
                        <Text style={[styles.presetChipText, { color: theme.textPrimary }]}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {form.modifierGroups.length === 0 ? (
                  <EmptyState title="Chưa có nhóm tùy chọn" description="Thêm nhóm khi món cần chọn cỡ, vị hoặc món kèm." />
                ) : form.modifierGroups.map((group, groupIndex) => {
                  const minValue = parseInt(group.minSelectStr || '0', 10);
                  const maxValue = parseInt(group.maxSelectStr || '1', 10);
                  const hasRuleError = minValue > maxValue || group.options.length < maxValue;
                  return (
                    <View key={group.id ?? groupIndex} style={[styles.modifierGroup, { backgroundColor: theme.surfaceSunken, borderColor: hasRuleError ? theme.danger : theme.borderSubtle }]}>
                      <View style={styles.groupHeader}>
                        <Text style={[styles.groupTitle, { color: theme.textPrimary }]}>Nhóm {groupIndex + 1}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Xóa nhóm ${groupIndex + 1}`} onPress={() => removeModifierGroup(groupIndex)} style={styles.destructiveIconButton}>
                          <AppIcon icon={Trash2} color={theme.danger} size={18} />
                        </Pressable>
                      </View>
                      <View style={[styles.formColumns, isMobile && styles.formColumnsMobile]}>
                        <View style={styles.growField}><Field label="Tên nhóm *" placeholder="Ví dụ: Cấp độ cay" value={group.name} onChangeText={(value) => updateModifierGroup(groupIndex, 'name', value)} /></View>
                        <View style={styles.requiredControl}>
                          <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Bắt buộc</Text>
                          <Switch {...switchAppearance} accessibilityLabel={`Bắt buộc nhóm ${groupIndex + 1}`} value={group.isRequired} onValueChange={(value) => updateModifierGroup(groupIndex, 'isRequired', value)} trackColor={{ false: theme.borderStrong, true: theme.interactivePrimary }} />
                        </View>
                      </View>
                      <View style={[styles.formColumns, isMobile && styles.formColumnsMobile]}>
                        <View style={styles.growField}><Field label="Chọn tối thiểu" keyboardType="numeric" value={group.minSelectStr} onChangeText={(value) => updateModifierGroup(groupIndex, 'minSelectStr', value.replace(/[^0-9]/g, ''))} /></View>
                        <View style={styles.growField}><Field label="Chọn tối đa" keyboardType="numeric" value={group.maxSelectStr} onChangeText={(value) => updateModifierGroup(groupIndex, 'maxSelectStr', value.replace(/[^0-9]/g, ''))} /></View>
                      </View>
                      {hasRuleError && <InlineAlert message={minValue > maxValue ? 'Số lượng tối thiểu không được lớn hơn tối đa.' : `Thêm ${maxValue - group.options.length} lựa chọn để đáp ứng số lượng tối đa.`} />}
                      <Text style={[styles.optionsTitle, { color: theme.textPrimary }]}>Lựa chọn ({group.options.length})</Text>
                      {group.options.map((option, optionIndex) => (
                        <View key={option.id ?? optionIndex} style={[styles.optionRow, isMobile && styles.optionRowMobile]}>
                          <View style={styles.optionName}><Field label={`Lựa chọn ${optionIndex + 1}`} placeholder="Tên lựa chọn" value={option.name} onChangeText={(value) => updateOptionInGroup(groupIndex, optionIndex, 'name', value)} /></View>
                          <View style={styles.optionPrice}><Field label="Phụ phí" placeholder="0" keyboardType="numeric" value={option.priceDeltaStr} onChangeText={(value) => updateOptionInGroup(groupIndex, optionIndex, 'priceDeltaStr', value.replace(/[^0-9]/g, ''))} /></View>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Xóa lựa chọn ${optionIndex + 1}`} onPress={() => removeOptionFromGroup(groupIndex, optionIndex)} style={styles.destructiveIconButton}>
                            <AppIcon icon={X} color={theme.danger} size={18} />
                          </Pressable>
                        </View>
                      ))}
                      <Button variant="quiet" label="Thêm lựa chọn" icon={Plus} onPress={() => addOptionToGroup(groupIndex)} />
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { backgroundColor: theme.surfaceBase, borderTopColor: theme.borderSubtle }]}>
              <View style={styles.footerButton}><Button variant="quiet" label="Hủy" disabled={isSubmitting} onPress={() => setIsModalOpen(false)} /></View>
              <View style={styles.footerButtonPrimary}><Button variant="primary" label={editingItem ? 'Lưu thay đổi' : 'Tạo món'} loading={isSubmitting} onPress={() => void handleSubmitForm()} /></View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { borderBottomWidth: 1, gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.md },
  toolbarMobile: { padding: spacing.md },
  commandBar: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  commandBarMobile: { alignItems: 'stretch', flexDirection: 'column' },
  headerActions: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', gap: spacing.sm, minWidth: 0 },
  searchBox: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: spacing.touchTargetMobile, maxWidth: 560, paddingLeft: spacing.md, paddingRight: spacing.xs },
  searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.sm, minHeight: spacing.touchTargetMobile, minWidth: 0 },
  iconButton: { alignItems: 'center', borderRadius: radii.md, height: spacing.touchTargetMobile, justifyContent: 'center', width: spacing.touchTargetMobile },
  toolbarActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  managementBody: { flex: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  managementBodyMobile: { flexDirection: 'column', padding: spacing.sm },
  filterSidebar: { flexShrink: 0, overflow: 'hidden', width: 252 },
  filterContent: { gap: spacing.lg, padding: spacing.md },
  filterSection: { gap: spacing.sm },
  filterSectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  filterTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  filterManageLink: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  filterOption: { alignItems: 'center', borderRadius: radii.sm, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', minHeight: 36, paddingHorizontal: spacing.sm },
  filterOptionText: { flex: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  filterCount: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  radioRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 32 },
  radioDot: { alignItems: 'center', borderRadius: 8, borderWidth: 1.5, height: 16, justifyContent: 'center', width: 16 },
  radioDotInner: { borderRadius: 4, height: 8, width: 8 },
  managementMain: { flex: 1, gap: spacing.md, minWidth: 0 },
  mobileFilters: { padding: spacing.sm },
  categoryPills: { flexDirection: 'row', gap: spacing.sm },
  pill: { borderRadius: radii.pill, justifyContent: 'center', minHeight: spacing.touchTargetMobile, paddingHorizontal: spacing.md },
  pillText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  noticeBar: { alignItems: 'center', borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  noticeBadge: { borderRadius: radii.pill, flexShrink: 0, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: 4 },
  noticeText: { flex: 1, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  centerContainer: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl },
  loadingText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, marginTop: spacing.md },
  menuTable: { flex: 1, overflow: 'hidden' },
  tableScroller: { flex: 1 },
  mobileFilterGroup: { gap: spacing.xs, marginTop: spacing.sm },
  tableHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: spacing.sm },
  headerItem: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  itemRow: { alignItems: 'center', flexDirection: 'row', minHeight: 72, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  itemUnavailable: { opacity: 0.72 },
  selectColumn: { alignItems: 'center', flexShrink: 0, justifyContent: 'center', width: 30 },
  codeColumn: { flexShrink: 0, width: 112 },
  nameColumn: { flex: 1.4, minWidth: 0, paddingRight: spacing.xs },
  groupColumn: { flexShrink: 0, paddingRight: spacing.xs, width: 102 },
  optionColumn: { flexShrink: 0, paddingRight: spacing.xs, width: 104 },
  statusColumn: { alignItems: 'flex-start', flexShrink: 0, width: 92 },
  priceColumn: { flexShrink: 0, textAlign: 'right', width: 82 },
  actionHeaderColumn: { flexShrink: 0, textAlign: 'center', width: 104 },
  actionColumn: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 2, justifyContent: 'flex-end', width: 104 },
  codeCell: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  thumbnailContainer: { alignItems: 'center', borderRadius: radii.sm, height: 36, justifyContent: 'center', overflow: 'hidden', width: 36 },
  thumbnail: { height: '100%', width: '100%' },
  itemInfo: { flex: 1, gap: 2 },
  itemCode: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  itemName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, lineHeight: typography.lineHeights.md },
  itemMeta: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  itemDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  tableText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  itemPrice: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.sm, fontVariant: ['tabular-nums'] },
  switchTarget: { justifyContent: 'center', minHeight: spacing.touchTargetMobile, minWidth: spacing.touchTargetMobile },
  checkbox: { alignItems: 'center', borderRadius: radii.xs, borderWidth: 1.5, height: 18, justifyContent: 'center', width: 18 },
  iconEditButton: { alignItems: 'center', borderRadius: radii.md, height: spacing.touchTargetMobile, justifyContent: 'center', width: spacing.touchTargetMobile },
  mobileList: { gap: spacing.md, paddingBottom: spacing.lg },
  mobileItemCard: { gap: spacing.md, padding: spacing.md },
  mobileItemHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  mobileItemFooter: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  modalOverlay: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.md },
  modalCard: { borderRadius: radii.md, borderWidth: 1, maxHeight: '94%', maxWidth: 760, overflow: 'hidden', width: '100%' },
  modalHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  modalHeadingCopy: { flex: 1, gap: 2 },
  modalTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, lineHeight: typography.lineHeights.xl },
  modalSubtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  modalBody: { gap: spacing.md, padding: spacing.lg },
  categoryModalCard: { maxWidth: 720 },
  categoryModalBody: { gap: spacing.md, padding: spacing.lg },
  categoryFormActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  categoryList: { gap: spacing.sm },
  categoryRow: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  categoryRowCopy: { flex: 1, gap: 2, minWidth: 0 },
  categoryRowName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  categoryRowMeta: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  categoryRowActions: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  formSection: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  sectionHeading: { flex: 1, gap: 2 },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, lineHeight: typography.lineHeights.md },
  sectionDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  fieldLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  fieldHint: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  metadataField: { gap: spacing.xs },
  categoryField: { gap: spacing.xs },
  textArea: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  formAvailability: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', minHeight: spacing.touchTargetMobile },
  modifierHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  modifierHeaderMobile: { alignItems: 'stretch', flexDirection: 'column' },
  modifierGroup: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  groupHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  groupTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  destructiveIconButton: { alignItems: 'center', borderRadius: radii.md, height: spacing.touchTargetMobile, justifyContent: 'center', width: spacing.touchTargetMobile },
  formColumns: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.md },
  formColumnsMobile: { alignItems: 'stretch', flexDirection: 'column' },
  growField: { flex: 1 },
  requiredControl: { gap: spacing.xs, minWidth: 112 },
  optionsTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  optionRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  optionRowMobile: { alignItems: 'stretch', flexWrap: 'wrap' },
  optionName: { flex: 2, minWidth: 180 },
  optionPrice: { flex: 1, minWidth: 120 },
  modalFooter: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.md },
  footerButton: { minWidth: 104 },
  footerButtonPrimary: { minWidth: 152 },
  imageSection: { gap: spacing.sm },
  imagePreviewBox: { borderRadius: radii.md, borderWidth: 1, height: 160, overflow: 'hidden', position: 'relative' },
  imagePreview: { height: '100%', width: '100%' },
  imageRemoveBtn: { alignItems: 'center', borderRadius: radii.sm, bottom: spacing.sm, height: 28, justifyContent: 'center', position: 'absolute', right: spacing.sm, width: 28 },
  uploadButton: { alignItems: 'center', borderRadius: radii.md, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: spacing.touchTargetMobile, paddingHorizontal: spacing.md },
  uploadButtonText: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  previewSection: { borderRadius: radii.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs },
  previewBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  previewTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewHint: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  previewCard: { borderRadius: radii.md, borderWidth: 1, padding: spacing.md, flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  previewImgBox: { width: 64, height: 64, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  previewImg: { width: '100%', height: '100%' },
  previewDetails: { flex: 1, gap: 2 },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  previewItemName: { flex: 1, fontFamily: typography.families.bodyBold, fontSize: typography.sizes.sm },
  previewCategory: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  previewPrice: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.md },
  previewDesc: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  previewTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  previewTag: { borderRadius: radii.xs, paddingHorizontal: 6, paddingVertical: 2 },
  previewTagText: { fontSize: 10, fontFamily: typography.families.bodyMedium },
  presetsContainer: { gap: spacing.xs, marginTop: spacing.xs },
  presetLabel: { fontSize: typography.sizes.xs, fontFamily: typography.families.bodyMedium },
  presetButtonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  presetChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  presetChipText: { fontSize: typography.sizes.xs, fontFamily: typography.families.bodyMedium }
});


import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  useWindowDimensions
} from 'react-native';
import {
  Package,
  Layers,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  FileSpreadsheet,
  AlertTriangle,
  Search,
  Edit2,
  Trash2,
  TrendingDown,
  Coins,
  Warehouse,
  ChevronRight
} from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import {
  IngredientDto,
  MenuItemRecipeDto,
  ExcelPreviewResultDto,
  InventoryCatalogRowDto
} from '../../api/contracts';
import {
  fetchIngredientsApi,
  createIngredientApi,
  updateIngredientApi,
  stockInApi,
  previewExcelApi,
  commitExcelApi,
  fetchRecipeApi,
  updateRecipeApi
} from '../../api/inventory';
import { getApiBaseUrl } from '../../api/config';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
import { InventoryCatalogScreen } from './InventoryCatalogScreen';
import { PurchaseReceiptListScreen } from './PurchaseReceiptListScreen';
import { PurchaseReceiptComposerScreen } from './PurchaseReceiptComposerScreen';
import { InventoryCheckListScreen } from './InventoryCheckListScreen';
import { InventoryCheckComposerScreen } from './InventoryCheckComposerScreen';
import { InventoryWasteListScreen } from './InventoryWasteListScreen';
import { InventoryWasteComposerScreen } from './InventoryWasteComposerScreen';
import { PurchaseReturnListScreen } from './PurchaseReturnListScreen';
import { PurchaseReturnComposerScreen } from './PurchaseReturnComposerScreen';
import { SupplierListScreen } from './SupplierListScreen';

type ActiveTab = 'inventory' | 'bom';
type StockFilter = 'ALL' | 'LOW' | 'NEGATIVE';

const LegacyInventoryOperations: React.FC<{ initialTab?: ActiveTab; initialMenuItemId?: number }> = ({
  initialTab = 'inventory',
  initialMenuItemId
}) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { allMenuItems } = useRestaurant();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [ingredients, setIngredients] = useState<IngredientDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal 1: Create / Edit Ingredient
  const [isIngModalOpen, setIsIngModalOpen] = useState<boolean>(false);
  const [editingIng, setEditingIng] = useState<IngredientDto | null>(null);
  const [ingSku, setIngSku] = useState<string>('');
  const [ingName, setIngName] = useState<string>('');
  const [ingUnit, setIngUnit] = useState<string>('gram');
  const [ingStock, setIngStock] = useState<string>('0');
  const [ingThreshold, setIngThreshold] = useState<string>('1000');
  const [ingCost, setIngCost] = useState<string>('0');
  const [isSavingIng, setIsSavingIng] = useState<boolean>(false);

  // Modal 2: Manual Stock-In
  const [isStockInModalOpen, setIsStockInModalOpen] = useState<boolean>(false);
  const [stockInTarget, setStockInTarget] = useState<IngredientDto | null>(null);
  const [stockInQty, setStockInQty] = useState<string>('');
  const [stockInCost, setStockInCost] = useState<string>('');
  const [stockInNote, setStockInNote] = useState<string>('');
  const [isProcessingStockIn, setIsProcessingStockIn] = useState<boolean>(false);

  // Modal 3: Excel Import & Preview
  const [isExcelModalOpen, setIsExcelModalOpen] = useState<boolean>(false);
  const [isParsingExcel, setIsParsingExcel] = useState<boolean>(false);
  const [excelPreview, setExcelPreview] = useState<ExcelPreviewResultDto | null>(null);
  const [isCommittingExcel, setIsCommittingExcel] = useState<boolean>(false);

  // BOM Recipe State

  const [selectedMenuItemId, setSelectedMenuItemId] = useState<number | null>(initialMenuItemId ?? null);
  const [currentRecipe, setCurrentRecipe] = useState<MenuItemRecipeDto | null>(null);
  const [isLoadingRecipe, setIsLoadingRecipe] = useState<boolean>(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState<boolean>(false);
  const [recipeItems, setRecipeItems] = useState<Array<{ ingredientId: number; quantityRequired: number }>>([]);

  // Load Ingredients List
  const loadIngredients = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const data = await fetchIngredientsApi(token, {
        search: searchQuery || undefined,
        lowStock: stockFilter === 'LOW',
        negativeStock: stockFilter === 'NEGATIVE'
      });
      setIngredients(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tải danh mục nguyên liệu');
    } finally {
      setIsLoading(false);
    }
  }, [token, searchQuery, stockFilter]);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  // Load Recipe when selected
  useEffect(() => {
    if (!selectedMenuItemId && allMenuItems.length > 0) {
      setSelectedMenuItemId(allMenuItems[0].id);
    }
  }, [allMenuItems, selectedMenuItemId]);

  const loadRecipe = useCallback(async (menuItemId: number) => {
    try {
      setIsLoadingRecipe(true);
      const recipe = await fetchRecipeApi(token, menuItemId);
      setCurrentRecipe(recipe);
      setRecipeItems(
        recipe.ingredients.map((i) => ({
          ingredientId: i.ingredientId,
          quantityRequired: i.quantityRequired
        }))
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi tải công thức món');
    } finally {
      setIsLoadingRecipe(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'bom' && selectedMenuItemId) {
      loadRecipe(selectedMenuItemId);
    }
  }, [activeTab, selectedMenuItemId, loadRecipe]);

  // Computed summary stats
  const stats = useMemo(() => {
    const totalItems = ingredients.length;
    const lowCount = ingredients.filter((i) => i.isLowStock).length;
    const negCount = ingredients.filter((i) => i.isNegative).length;
    const totalValue = ingredients.reduce((sum, i) => sum + (i.totalValue || 0), 0);
    return { totalItems, lowCount, negCount, totalValue };
  }, [ingredients]);

  // Handle Create/Edit Ingredient Submit
  const handleSaveIngredient = async () => {
    if (!ingSku.trim() || !ingName.trim()) {
      setErrorMessage('Mã SKU và Tên nguyên liệu là bắt buộc');
      return;
    }

    try {
      setIsSavingIng(true);
      setErrorMessage(null);

      if (editingIng) {
        await updateIngredientApi(token, editingIng.id, {
          name: ingName.trim(),
          unit: ingUnit.trim(),
          minThreshold: parseFloat(ingThreshold) || 0,
          costPerUnit: parseInt(ingCost, 10) || 0
        });
        setSuccessMessage('Đã cập nhật nguyên liệu thành công');
      } else {
        await createIngredientApi(token, {
          sku: ingSku.trim().toUpperCase(),
          name: ingName.trim(),
          unit: ingUnit.trim(),
          currentStock: parseFloat(ingStock) || 0,
          minThreshold: parseFloat(ingThreshold) || 0,
          costPerUnit: parseInt(ingCost, 10) || 0
        });
        setSuccessMessage('Đã tạo nguyên liệu mới thành công');
      }

      setIsIngModalOpen(false);
      loadIngredients();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi lưu nguyên liệu');
    } finally {
      setIsSavingIng(false);
    }
  };

  // Handle Manual Stock-In Submit
  const handleStockInSubmit = async () => {
    if (!stockInTarget) return;
    const qty = parseFloat(stockInQty);
    const cost = parseInt(stockInCost, 10);

    if (isNaN(qty) || qty <= 0) {
      setErrorMessage('Số lượng nhập phải lớn hơn 0');
      return;
    }
    if (isNaN(cost) || cost < 0) {
      setErrorMessage('Đơn giá nhập không được nhỏ hơn 0');
      return;
    }

    try {
      setIsProcessingStockIn(true);
      setErrorMessage(null);

      await stockInApi(token, {
        ingredientId: stockInTarget.id,
        quantity: qty,
        costPerUnit: cost,
        note: stockInNote.trim() || undefined
      });

      setSuccessMessage(`Đã nhập kho thành công cho: ${stockInTarget.name}`);
      setIsStockInModalOpen(false);
      loadIngredients();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi nhập kho');
    } finally {
      setIsProcessingStockIn(false);
    }
  };

  // Live calculation for Stock-In preview
  const liveStockInPreview = useMemo(() => {
    if (!stockInTarget) return null;
    const qty = parseFloat(stockInQty);
    const cost = parseInt(stockInCost, 10);
    if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) return null;

    const curStock = stockInTarget.currentStock;
    const curCost = stockInTarget.costPerUnit;
    const newStock = Math.round((curStock + qty) * 1000) / 1000;

    let newCost = cost;
    if (curStock >= 0) {
      newCost = Math.round((curStock * curCost + qty * cost) / newStock);
    }

    return { newStock, newCost };
  }, [stockInTarget, stockInQty, stockInCost]);

  // Excel File Upload Trigger
  const handlePickExcelFile = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const result = event.target?.result;
          if (typeof result === 'string') {
            const base64 = result.split(',')[1] || result;
            try {
              setIsParsingExcel(true);
              setErrorMessage(null);
              setIsExcelModalOpen(true);
              const previewData = await previewExcelApi(token, base64, file.name);
              setExcelPreview(previewData);
            } catch (err: any) {
              setErrorMessage(err.message || 'Lỗi đọc file Excel');
              setIsExcelModalOpen(false);
            } finally {
              setIsParsingExcel(false);
            }
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } else {
      setErrorMessage('Tính năng tải file Excel hiện tối ưu nhất trên giao diện Web');
    }
  };

  // Commit Excel Stock-In
  const handleCommitExcel = async () => {
    if (!excelPreview || excelPreview.validRows.length === 0) return;

    try {
      setIsCommittingExcel(true);
      setErrorMessage(null);

      const items = excelPreview.validRows.map((r) => ({
        sku: r.sku,
        quantity: r.quantity,
        costPerUnit: r.costPerUnit,
        note: r.note
      }));

      await commitExcelApi(token, items, excelPreview.fileName);
      setSuccessMessage(`Đã nhập kho thành công ${items.length} nguyên liệu từ file Excel!`);
      setIsExcelModalOpen(false);
      setExcelPreview(null);
      loadIngredients();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi nhập kho từ Excel');
    } finally {
      setIsCommittingExcel(false);
    }
  };

  // Download Excel Template
  const handleDownloadTemplate = async () => {
    try {
      setErrorMessage(null);
      const base = getApiBaseUrl();
      const url = `${base}/api/inventory/excel/template`;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Không thể tải file mẫu');
        }
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = 'Mau_Nhap_Kho_CrispyBite.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      } else {
        setErrorMessage(`Vui lòng mở link sau để tải file: ${url}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi tải file mẫu');
    }
  };

  // Export Stock to Excel
  const handleExportStock = async () => {
    try {
      setErrorMessage(null);
      const base = getApiBaseUrl();
      const url = `${base}/api/inventory/excel/export`;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Không thể xuất file tồn kho');
        }
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `Bao_Cao_Ton_Kho_${dateStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      } else {
        setErrorMessage(`Vui lòng mở link sau để xuất file: ${url}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi xuất dữ liệu tồn kho');
    }
  };

  // Save BOM Recipe
  const handleSaveRecipe = async () => {
    if (!selectedMenuItemId) return;

    try {
      setIsSavingRecipe(true);
      setErrorMessage(null);

      const validItems = recipeItems.filter((i) => i.quantityRequired > 0);
      const updated = await updateRecipeApi(token, selectedMenuItemId, validItems);
      setCurrentRecipe(updated);
      setSuccessMessage(`Đã cập nhật công thức cho món: ${updated.menuItemName}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi lưu định lượng');
    } finally {
      setIsSavingRecipe(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <ScreenHeader
        title="Quản Lý Kho & Định Lượng (BOM)"
        description="Theo dõi tồn kho thực tế, giá vốn bình quân (COGS) và nhập xuất Excel"
      />

      {/* Main Tabs (Kho vs BOM) */}
      <View style={[styles.tabBar, { borderBottomColor: theme.borderSubtle }]}>
        <Pressable
          onPress={() => setActiveTab('inventory')}
          style={[
            styles.tabButton,
            activeTab === 'inventory' && { borderBottomColor: theme.primary, borderBottomWidth: 3 }
          ]}
        >
          <AppIcon
            icon={Warehouse}
            color={activeTab === 'inventory' ? theme.primary : theme.textSecondary}
            size={18}
          />
          <Text
            style={[
              styles.tabButtonText,
              { color: activeTab === 'inventory' ? theme.primary : theme.textSecondary }
            ]}
          >
            Nguyên vật liệu
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('bom')}
          style={[
            styles.tabButton,
            activeTab === 'bom' && { borderBottomColor: theme.primary, borderBottomWidth: 3 }
          ]}
        >
          <AppIcon
            icon={Layers}
            color={activeTab === 'bom' ? theme.primary : theme.textSecondary}
            size={18}
          />
          <Text
            style={[
              styles.tabButtonText,
              { color: activeTab === 'bom' ? theme.primary : theme.textSecondary }
            ]}
          >
            Định lượng món
          </Text>
        </Pressable>
      </View>

      {/* Feedback Messages */}
      {errorMessage && (
        <View style={styles.feedbackContainer}>
          <InlineAlert title="Lỗi" message={errorMessage} />
        </View>
      )}
      {successMessage && (
        <View style={styles.feedbackContainer}>
          <InlineAlert title="Thành công" message={successMessage} />
        </View>
      )}

      {/* TAB 1: KHO NGUYEN LIEU */}
      {activeTab === 'inventory' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Summary Stats Row */}
          <View style={[styles.statsRow, isMobile && styles.statsRowMobile]}>
            <Surface level="raised" style={styles.statCard}>
              <View style={styles.statHeader}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Tổng nguyên liệu</Text>
                <AppIcon icon={Package} color={theme.primary} size={18} />
              </View>
              <Text style={[styles.statValue, { color: theme.textPrimary }]}>{stats.totalItems}</Text>
              <Text style={[styles.statSub, { color: theme.textSecondary }]}>Mặt hàng trong kho</Text>
            </Surface>

            <Surface level="raised" style={styles.statCard}>
              <View style={styles.statHeader}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Giá trị kho ước tính</Text>
                <AppIcon icon={Coins} color="#10B981" size={18} />
              </View>
              <Text style={[styles.statValue, { color: '#10B981' }]}>
                {stats.totalValue.toLocaleString('vi-VN')} đ
              </Text>
              <Text style={[styles.statSub, { color: theme.textSecondary }]}>Theo giá vốn bình quân</Text>
            </Surface>

            <Surface level="raised" style={styles.statCard}>
              <View style={styles.statHeader}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Cảnh báo sắp hết</Text>
                <AppIcon icon={AlertTriangle} color="#F59E0B" size={18} />
              </View>
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.lowCount}</Text>
              <Text style={[styles.statSub, { color: theme.textSecondary }]}>Cần mua thêm</Text>
            </Surface>

            <Surface level="raised" style={styles.statCard}>
              <View style={styles.statHeader}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Bán âm (Thiếu tồn)</Text>
                <AppIcon icon={TrendingDown} color="#EF4444" size={18} />
              </View>
              <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.negCount}</Text>
              <Text style={[styles.statSub, { color: theme.textSecondary }]}>Cần bù hóa đơn</Text>
            </Surface>
          </View>

          {/* Action Bar (Search, Filters & Excel buttons) */}
          <Surface level="raised" style={styles.actionBar}>
            <View style={styles.searchBox}>
              <AppIcon icon={Search} color={theme.textSecondary} size={18} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Tìm mã SKU, tên nguyên liệu..."
                placeholderTextColor={theme.textSecondary}
                style={[styles.searchInput, { color: theme.textPrimary }]}
              />
            </View>

            {/* Filters */}
            <View style={styles.filterGroup}>
              <Pressable
                onPress={() => setStockFilter('ALL')}
                style={[
                  styles.filterBtn,
                  stockFilter === 'ALL' && { backgroundColor: theme.interactiveSecondary }
                ]}
              >
                <Text
                  style={[
                    styles.filterBtnText,
                    { color: stockFilter === 'ALL' ? theme.primary : theme.textSecondary }
                  ]}
                >
                  Tất cả
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setStockFilter('LOW')}
                style={[
                  styles.filterBtn,
                  stockFilter === 'LOW' && { backgroundColor: '#F59E0B20' }
                ]}
              >
                <Text
                  style={[
                    styles.filterBtnText,
                    { color: stockFilter === 'LOW' ? '#F59E0B' : theme.textSecondary }
                  ]}
                >
                  Sắp hết ⚠️
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setStockFilter('NEGATIVE')}
                style={[
                  styles.filterBtn,
                  stockFilter === 'NEGATIVE' && { backgroundColor: '#EF444420' }
                ]}
              >
                <Text
                  style={[
                    styles.filterBtnText,
                    { color: stockFilter === 'NEGATIVE' ? '#EF4444' : theme.textSecondary }
                  ]}
                >
                  Bán âm 🔴
                </Text>
              </Pressable>
            </View>

            {/* Buttons */}
            <View style={styles.btnGroup}>
              <Button
                variant="secondary"
                label="Tải file mẫu"
                icon={ArrowDownToLine}
                onPress={handleDownloadTemplate}
              />
              <Button
                variant="secondary"
                label="Nhập Excel"
                icon={FileSpreadsheet}
                onPress={handlePickExcelFile}
              />
              <Button
                variant="secondary"
                label="Xuất tồn kho"
                icon={ArrowUpFromLine}
                onPress={handleExportStock}
              />
              <Button
                variant="primary"
                label="Thêm NVL"
                icon={Plus}
                onPress={() => {
                  setEditingIng(null);
                  setIngSku('');
                  setIngName('');
                  setIngUnit('gram');
                  setIngStock('0');
                  setIngThreshold('1000');
                  setIngCost('0');
                  setIsIngModalOpen(true);
                }}
              />
            </View>
          </Surface>

          {/* Ingredients Table */}
          <Surface level="raised" style={styles.tableSurface}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                  Đang tải danh mục kho...
                </Text>
              </View>
            ) : ingredients.length === 0 ? (
              <EmptyState
                title="Không có nguyên liệu nào"
                description="Thêm nguyên liệu mới hoặc nhập hàng từ file Excel để bắt đầu theo dõi tồn kho."
              />
            ) : (
              <View>
                {/* Table Header */}
                <View style={[styles.tableHeaderRow, { borderBottomColor: theme.borderSubtle }]}>
                  <Text style={[styles.colHeader, { flex: 1.2, color: theme.textSecondary }]}>MÃ SKU</Text>
                  <Text style={[styles.colHeader, { flex: 2, color: theme.textSecondary }]}>TÊN NGUYÊN LIỆU</Text>
                  <Text style={[styles.colHeader, { flex: 1, color: theme.textSecondary }]}>ĐƠN VỊ</Text>
                  <Text style={[styles.colHeader, { flex: 1.5, textAlign: 'right', color: theme.textSecondary }]}>TỒN KHO</Text>
                  <Text style={[styles.colHeader, { flex: 1.5, textAlign: 'right', color: theme.textSecondary }]}>GIÁ VỐN</Text>
                  <Text style={[styles.colHeader, { flex: 1.8, textAlign: 'right', color: theme.textSecondary }]}>THÀNH TIỀN</Text>
                  <Text style={[styles.colHeader, { flex: 1.8, textAlign: 'center', color: theme.textSecondary }]}>THAO TÁC</Text>
                </View>

                {/* Table Body */}
                {ingredients.map((item) => {
                  let stockColor = theme.textPrimary;
                  let badge = null;

                  if (item.isNegative) {
                    stockColor = '#EF4444';
                    badge = <StatusBadge tone="danger" label="Bán âm" />;
                  } else if (item.isLowStock) {
                    stockColor = '#F59E0B';
                    badge = <StatusBadge tone="warning" label="Sắp hết" />;
                  }

                  return (
                    <View
                      key={item.id}
                      style={[styles.tableRow, { borderBottomColor: theme.borderSubtle }]}
                    >
                      <View style={{ flex: 1.2 }}>
                        <Text style={[styles.skuText, { color: theme.primary }]}>{item.sku}</Text>
                      </View>
                      <View style={{ flex: 2 }}>
                        <Text style={[styles.itemName, { color: theme.textPrimary }]}>{item.name}</Text>
                        {badge}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.textSecondary }}>{item.unit}</Text>
                      </View>
                      <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                        <Text style={[styles.stockNumber, { color: stockColor }]}>
                          {item.currentStock.toLocaleString('vi-VN')}
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                          Min: {item.minThreshold}
                        </Text>
                      </View>
                      <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                        <Text style={{ fontWeight: '600', color: theme.textPrimary }}>
                          {item.costPerUnit.toLocaleString('vi-VN')} đ
                        </Text>
                      </View>
                      <View style={{ flex: 1.8, alignItems: 'flex-end' }}>
                        <Text style={{ fontWeight: '700', color: theme.textPrimary }}>
                          {item.totalValue.toLocaleString('vi-VN')} đ
                        </Text>
                      </View>
                      <View style={{ flex: 1.8, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                        <Button
                          variant="secondary"
                          label="Nhập"
                          onPress={() => {
                            setStockInTarget(item);
                            setStockInQty('');
                            setStockInCost(String(item.costPerUnit || ''));
                            setStockInNote('');
                            setIsStockInModalOpen(true);
                          }}
                        />
                        <Button
                          variant="quiet"
                          label="Sửa"
                          icon={Edit2}
                          onPress={() => {
                            setEditingIng(item);
                            setIngSku(item.sku);
                            setIngName(item.name);
                            setIngUnit(item.unit);
                            setIngStock(String(item.currentStock));
                            setIngThreshold(String(item.minThreshold));
                            setIngCost(String(item.costPerUnit));
                            setIsIngModalOpen(true);
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Surface>
        </ScrollView>
      )}

      {/* TAB 2: DINH LUONG MON (BOM RECIPE) */}
      {activeTab === 'bom' && (
        <View style={[styles.bomContainer, isMobile && styles.bomContainerMobile]}>
          {/* Menu Items Selector (Left Panel) */}
          <Surface level="raised" style={[styles.bomLeftPanel, isMobile && styles.fullWidthCol]}>
            <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Danh Sách Món Ăn</Text>
            <ScrollView style={{ maxHeight: 600 }}>
              {allMenuItems.map((menuItem) => {
                const isSelected = menuItem.id === selectedMenuItemId;
                return (
                  <Pressable
                    key={menuItem.id}
                    onPress={() => setSelectedMenuItemId(menuItem.id)}
                    style={[
                      styles.menuItemRow,
                      { borderBottomColor: theme.borderSubtle },
                      isSelected && { backgroundColor: theme.interactiveSecondary }
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuItemRowName, { color: theme.textPrimary }]}>
                        {menuItem.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                        Giá bán: {menuItem.basePrice.toLocaleString('vi-VN')} đ
                      </Text>
                    </View>
                    <AppIcon
                      icon={ChevronRight}
                      color={isSelected ? theme.primary : theme.textSecondary}
                      size={18}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </Surface>

          {/* Recipe Configuration (Right Panel) */}
          <Surface level="raised" style={[styles.bomRightPanel, isMobile && styles.fullWidthCol]}>
            {isLoadingRecipe ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ color: theme.textSecondary, marginTop: 8 }}>Đang tải công thức...</Text>
              </View>
            ) : currentRecipe ? (
              <View>
                {/* Header with KPI cards */}
                <View style={styles.recipeHeader}>
                  <View>
                    <Text style={[styles.recipeTitle, { color: theme.textPrimary }]}>
                      {currentRecipe.menuItemName}
                    </Text>
                    <Text style={{ color: theme.textSecondary }}>
                      Giá bán: {currentRecipe.basePrice.toLocaleString('vi-VN')} đ
                    </Text>
                  </View>

                  <View style={styles.recipeKpis}>
                    <View style={styles.recipeKpiBox}>
                      <Text style={styles.recipeKpiLabel}>GIÁ VỐN (COGS)</Text>
                      <Text style={[styles.recipeKpiVal, { color: '#EF4444' }]}>
                        {currentRecipe.totalCost.toLocaleString('vi-VN')} đ
                      </Text>
                    </View>

                    <View style={styles.recipeKpiBox}>
                      <Text style={styles.recipeKpiLabel}>LỢI NHUẬN GỘP</Text>
                      <Text style={[styles.recipeKpiVal, { color: '#10B981' }]}>
                        {Math.max(0, currentRecipe.basePrice - currentRecipe.totalCost).toLocaleString('vi-VN')} đ
                      </Text>
                      <Text style={{ fontSize: 11, color: '#10B981', fontWeight: 'bold' }}>
                        ({currentRecipe.profitMargin}%)
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Recipe Ingredients Table */}
                <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>
                  Thành phần tiêu hao cho 1 suất món ăn:
                </Text>

                {recipeItems.map((item, idx) => {
                  const ing = ingredients.find((i) => i.id === item.ingredientId);
                  const itemCost = ing ? Math.round(item.quantityRequired * ing.costPerUnit) : 0;

                  return (
                    <View key={idx} style={[styles.recipeItemRow, { borderColor: theme.borderSubtle }]}>
                      <View style={{ flex: 2 }}>
                        <Text style={[styles.recipeItemName, { color: theme.textPrimary }]}>
                          {ing?.name || `NVL #${item.ingredientId}`}
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                          Đơn giá: {ing?.costPerUnit.toLocaleString('vi-VN')} đ / {ing?.unit}
                        </Text>
                      </View>

                      <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextInput
                          value={String(item.quantityRequired)}
                          onChangeText={(val) => {
                            const newQty = parseFloat(val) || 0;
                            setRecipeItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, quantityRequired: newQty } : it))
                            );
                          }}
                          keyboardType="numeric"
                          style={[styles.qtyInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]}
                        />
                        <Text style={{ color: theme.textSecondary }}>{ing?.unit}</Text>
                      </View>

                      <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                        <Text style={{ fontWeight: '700', color: theme.textPrimary }}>
                          {itemCost.toLocaleString('vi-VN')} đ
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => {
                          setRecipeItems((prev) => prev.filter((_, i) => i !== idx));
                        }}
                        style={styles.removeBtn}
                      >
                        <AppIcon icon={Trash2} color="#EF4444" size={16} />
                      </Pressable>
                    </View>
                  );
                })}

                {/* Add Ingredient to Recipe Row */}
                <View style={styles.addIngRow}>
                  <Button
                    variant="secondary"
                    label="+ Thêm NVL vào món"
                    icon={Plus}
                    onPress={() => {
                      // Find first ingredient not already in recipe
                      const existingIds = new Set(recipeItems.map((r) => r.ingredientId));
                      const available = ingredients.find((i) => !existingIds.has(i.id));
                      if (available) {
                        setRecipeItems((prev) => [
                          ...prev,
                          { ingredientId: available.id, quantityRequired: 1 }
                        ]);
                      } else {
                        setErrorMessage('Đã thêm tất cả nguyên liệu vào công thức');
                      }
                    }}
                  />

                  <Button
                    variant="primary"
                    label="Lưu Định Lượng"
                    loading={isSavingRecipe}
                    onPress={handleSaveRecipe}
                  />
                </View>
              </View>
            ) : (
              <EmptyState title="Chọn một món ăn" description="Chọn món từ danh sách bên trái để cấu hình định lượng BOM." />
            )}
          </Surface>
        </View>
      )}

      {/* MODAL 1: CREATE / EDIT INGREDIENT */}
      <Modal visible={isIngModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Surface level="raised" style={styles.modalBox}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              {editingIng ? 'Chỉnh Sửa Nguyên Liệu' : 'Thêm Nguyên Liệu Mới'}
            </Text>

            <View style={styles.formRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Mã SKU:</Text>
              <TextInput
                value={ingSku}
                onChangeText={setIngSku}
                editable={!editingIng}
                placeholder="VD: ING-CHICKEN-01"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.formInput,
                  { color: theme.textPrimary, borderColor: theme.borderSubtle },
                  editingIng && { backgroundColor: theme.surfaceSunken }
                ]}
              />
            </View>

            <View style={styles.formRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Tên nguyên liệu:</Text>
              <TextInput
                value={ingName}
                onChangeText={setIngName}
                placeholder="VD: Thịt gà fillet tươi"
                placeholderTextColor={theme.textSecondary}
                style={[styles.formInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]}
              />
            </View>

            <View style={styles.formRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Đơn vị tính:</Text>
              <TextInput
                value={ingUnit}
                onChangeText={setIngUnit}
                placeholder="gram, ml, cái, lon, kg..."
                placeholderTextColor={theme.textSecondary}
                style={[styles.formInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]}
              />
            </View>

            {!editingIng && (
              <View style={styles.formRow}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Tồn kho ban đầu:</Text>
                <TextInput
                  value={ingStock}
                  onChangeText={setIngStock}
                  keyboardType="numeric"
                  style={[styles.formInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]}
                />
              </View>
            )}

            <View style={styles.formRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Ngưỡng cảnh báo đỏ:</Text>
              <TextInput
                value={ingThreshold}
                onChangeText={setIngThreshold}
                keyboardType="numeric"
                style={[styles.formInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]}
              />
            </View>

            <View style={styles.formRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Đơn giá vốn (VND):</Text>
              <TextInput
                value={ingCost}
                onChangeText={setIngCost}
                keyboardType="numeric"
                placeholder="Đơn giá / đơn vị"
                placeholderTextColor={theme.textSecondary}
                style={[styles.formInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]}
              />
            </View>

            <View style={styles.modalActions}>
              <Button
                variant="quiet"
                label="Hủy"
                onPress={() => setIsIngModalOpen(false)}
                disabled={isSavingIng}
              />
              <Button
                variant="primary"
                label="Lưu Nguyên Liệu"
                loading={isSavingIng}
                onPress={handleSaveIngredient}
              />
            </View>
          </Surface>
        </View>
      </Modal>

      {/* MODAL 2: MANUAL STOCK-IN */}
      <Modal visible={isStockInModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Surface level="raised" style={styles.modalBox}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              Nhập Kho: {stockInTarget?.name}
            </Text>
            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 12 }}>
              Mã SKU: {stockInTarget?.sku} · Tồn hiện tại: {stockInTarget?.currentStock.toLocaleString('vi-VN')} {stockInTarget?.unit}
            </Text>

            <View style={styles.formRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Số lượng nhập ({stockInTarget?.unit}):</Text>
              <TextInput
                value={stockInQty}
                onChangeText={setStockInQty}
                keyboardType="numeric"
                placeholder="VD: 5000"
                placeholderTextColor={theme.textSecondary}
                style={[styles.formInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]}
              />
            </View>

            <View style={styles.formRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Đơn giá nhập (VND):</Text>
              <TextInput
                value={stockInCost}
                onChangeText={setStockInCost}
                keyboardType="numeric"
                placeholder="VD: 85"
                placeholderTextColor={theme.textSecondary}
                style={[styles.formInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]}
              />
            </View>

            <View style={styles.formRow}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Ghi chú:</Text>
              <TextInput
                value={stockInNote}
                onChangeText={setStockInNote}
                placeholder="Nhà cung cấp, lô hàng..."
                placeholderTextColor={theme.textSecondary}
                style={[styles.formInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]}
              />
            </View>

            {/* Live Calculation Preview */}
            {liveStockInPreview && (
              <View style={[styles.livePreviewBox, { backgroundColor: theme.interactiveSecondary }]}>
                <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: 'bold' }}>
                  DỰ PHÓNG SAU KHI NHẬP (BÌNH QUÂN GIA QUYỀN):
                </Text>
                <Text style={{ fontSize: 13, color: theme.textPrimary, marginTop: 4 }}>
                  Tồn kho mới: <Text style={{ fontWeight: 'bold' }}>{liveStockInPreview.newStock.toLocaleString('vi-VN')} {stockInTarget?.unit}</Text>
                </Text>
                <Text style={{ fontSize: 13, color: theme.textPrimary }}>
                  Giá vốn mới: <Text style={{ fontWeight: 'bold' }}>{liveStockInPreview.newCost.toLocaleString('vi-VN')} đ</Text>
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <Button
                variant="quiet"
                label="Hủy"
                onPress={() => setIsStockInModalOpen(false)}
                disabled={isProcessingStockIn}
              />
              <Button
                variant="primary"
                label="Xác Nhận Nhập Kho"
                loading={isProcessingStockIn}
                onPress={handleStockInSubmit}
              />
            </View>
          </Surface>
        </View>
      </Modal>

      {/* MODAL 3: EXCEL PREVIEW & COMMIT */}
      <Modal visible={isExcelModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Surface level="raised" style={[styles.modalBox, { width: '90%', maxWidth: 900 }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              Đối Soát & Nhập Kho Từ File Excel
            </Text>

            {isParsingExcel ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ marginTop: 8, color: theme.textSecondary }}>Đang đọc và phân tích file...</Text>
              </View>
            ) : excelPreview ? (
              <View>
                <Text style={{ color: theme.textSecondary, marginBottom: 12 }}>
                  Tệp: <Text style={{ fontWeight: 'bold' }}>{excelPreview.fileName}</Text> · Tổng cộng:{' '}
                  {excelPreview.totalRows} dòng ({excelPreview.validRows.length} hợp lệ,{' '}
                  {excelPreview.errorRows.length} lỗi)
                </Text>

                {/* Valid Rows Table */}
                {excelPreview.validRows.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#10B981', marginBottom: 6 }}>
                      ✅ Dòng hợp lệ ({excelPreview.validRows.length}):
                    </Text>
                    <ScrollView style={{ maxHeight: 200 }}>
                      {excelPreview.validRows.map((r, idx) => (
                        <View
                          key={idx}
                          style={[styles.previewRow, { borderBottomColor: theme.borderSubtle }]}
                        >
                          <Text style={{ flex: 1, fontWeight: 'bold', color: theme.primary }}>{r.sku}</Text>
                          <Text style={{ flex: 2, color: theme.textPrimary }}>{r.name}</Text>
                          <Text style={{ flex: 1, textAlign: 'right', color: theme.textPrimary }}>
                            +{r.quantity} {r.unit}
                          </Text>
                          <Text style={{ flex: 1.5, textAlign: 'right', color: theme.textPrimary }}>
                            Giá: {r.costPerUnit.toLocaleString('vi-VN')} đ
                          </Text>
                          <Text style={{ flex: 1.5, textAlign: 'right', color: '#10B981', fontWeight: 'bold' }}>
                            Tồn mới: {r.projectedStock}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Error Rows Table */}
                {excelPreview.errorRows.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#EF4444', marginBottom: 6 }}>
                      ❌ Dòng lỗi không thể nhập ({excelPreview.errorRows.length}):
                    </Text>
                    <ScrollView style={{ maxHeight: 150 }}>
                      {excelPreview.errorRows.map((err, idx) => (
                        <View
                          key={idx}
                          style={[styles.previewRow, { backgroundColor: '#EF444410', borderBottomColor: theme.borderSubtle }]}
                        >
                          <Text style={{ flex: 0.8, color: '#EF4444', fontWeight: 'bold' }}>
                            Dòng {err.rowNumber}
                          </Text>
                          <Text style={{ flex: 1.2, color: theme.textPrimary }}>{err.sku}</Text>
                          <Text style={{ flex: 3, color: '#EF4444' }}>{err.error}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <Button
                    variant="quiet"
                    label="Hủy"
                    onPress={() => {
                      setIsExcelModalOpen(false);
                      setExcelPreview(null);
                    }}
                    disabled={isCommittingExcel}
                  />
                  {excelPreview.validRows.length > 0 && (
                    <Button
                      variant="primary"
                      label={`Xác Nhận Nhập ${excelPreview.validRows.length} Dòng Hợp Lệ`}
                      loading={isCommittingExcel}
                      onPress={handleCommitExcel}
                    />
                  )}
                </View>
              </View>
            ) : null}
          </Surface>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export const InventoryScreen: React.FC = () => {
  const { theme } = useTheme();
  const [section, setSection] = useState<'catalog' | 'operations' | 'receipts' | 'receipt-composer' | 'checks' | 'check-composer' | 'wastes' | 'waste-composer' | 'returns' | 'return-composer' | 'suppliers'>('catalog');
  const [legacyTab, setLegacyTab] = useState<ActiveTab>('inventory');
  const [legacyMenuItemId, setLegacyMenuItemId] = useState<number | undefined>();
  const [receiptComposer, setReceiptComposer] = useState<{ mode: 'create' | 'edit'; id: number | null } | null>(null);
  const [checkComposer, setCheckComposer] = useState<{ mode: 'create' | 'edit'; id: number | null } | null>(null);
  const [wasteComposer, setWasteComposer] = useState<{ mode: 'create' | 'edit'; id: number | null } | null>(null);
  const [returnComposer, setReturnComposer] = useState<{ mode: 'create' | 'edit'; id: number | null } | null>(null);

  const openLegacyOperations = (row?: InventoryCatalogRowDto) => {
    setLegacyTab(row?.sourceType === 'MENU_ITEM' ? 'bom' : 'inventory');
    setLegacyMenuItemId(row?.sourceType === 'MENU_ITEM' ? row.sourceId : undefined);
    setSection('operations');
  };

  const openPurchaseReceipts = () => {
    setCheckComposer(null);
    setReceiptComposer(null);
    setSection('receipts');
  };

  const openInventoryChecks = () => {
    setReceiptComposer(null);
    setCheckComposer(null);
    setSection('checks');
  };

  const createInventoryCheck = () => {
    setCheckComposer({ mode: 'create', id: null });
    setSection('check-composer');
  };

  const openInventoryCheck = (id: number) => {
    setCheckComposer({ mode: 'edit', id });
    setSection('check-composer');
  };

  const finishInventoryCheck = () => {
    setCheckComposer(null);
    setSection('checks');
  };

  const openInventoryWastes = () => {
    setWasteComposer(null);
    setSection('wastes');
  };

  const createInventoryWaste = () => {
    setWasteComposer({ mode: 'create', id: null });
    setSection('waste-composer');
  };

  const openInventoryWaste = (id: number) => {
    setWasteComposer({ mode: 'edit', id });
    setSection('waste-composer');
  };

  const finishInventoryWaste = () => {
    setWasteComposer(null);
    setSection('wastes');
  };

  const openPurchaseReturns = () => {
    setReturnComposer(null);
    setSection('returns');
  };
  const createPurchaseReturn = () => {
    setReturnComposer({ mode: 'create', id: null });
    setSection('return-composer');
  };
  const openPurchaseReturn = (id: number) => {
    setReturnComposer({ mode: 'edit', id });
    setSection('return-composer');
  };
  const finishPurchaseReturn = () => {
    setReturnComposer(null);
    setSection('returns');
  };

  const createPurchaseReceipt = () => {
    setReceiptComposer({ mode: 'create', id: null });
    setSection('receipt-composer');
  };

  const openPurchaseReceipt = (id: number) => {
    setReceiptComposer({ mode: 'edit', id });
    setSection('receipt-composer');
  };

  const finishPurchaseReceipt = () => {
    setReceiptComposer(null);
    setSection('receipts');
  };

  return (
    <View style={[shellStyles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={[shellStyles.sectionNav, { borderBottomColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]}>
        <Pressable onPress={() => setSection('catalog')} style={[shellStyles.sectionButton, section === 'catalog' && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
          <Text style={[shellStyles.sectionButtonText, { color: section === 'catalog' ? theme.primary : theme.textSecondary }]}>Danh sách kho hàng</Text>
        </Pressable>
        <Pressable onPress={() => setSection('operations')} style={[shellStyles.sectionButton, section === 'operations' && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
          <Text style={[shellStyles.sectionButtonText, { color: section === 'operations' ? theme.primary : theme.textSecondary }]}>Quản lý nguyên liệu / BOM</Text>
        </Pressable>
        <Pressable onPress={openPurchaseReceipts} style={[shellStyles.sectionButton, (section === 'receipts' || section === 'receipt-composer') && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
          <Text style={[shellStyles.sectionButtonText, { color: (section === 'receipts' || section === 'receipt-composer') ? theme.primary : theme.textSecondary }]}>Phiếu nhập hàng</Text>
        </Pressable>
        <Pressable onPress={openInventoryChecks} style={[shellStyles.sectionButton, (section === 'checks' || section === 'check-composer') && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
          <Text style={[shellStyles.sectionButtonText, { color: (section === 'checks' || section === 'check-composer') ? theme.primary : theme.textSecondary }]}>Kiểm kho</Text>
        </Pressable>
        <Pressable onPress={openInventoryWastes} style={[shellStyles.sectionButton, (section === 'wastes' || section === 'waste-composer') && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
          <Text style={[shellStyles.sectionButtonText, { color: (section === 'wastes' || section === 'waste-composer') ? theme.primary : theme.textSecondary }]}>Xuất hủy</Text>
        </Pressable>
        <Pressable onPress={openPurchaseReturns} style={[shellStyles.sectionButton, (section === 'returns' || section === 'return-composer') && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
          <Text style={[shellStyles.sectionButtonText, { color: (section === 'returns' || section === 'return-composer') ? theme.primary : theme.textSecondary }]}>Trả hàng nhập</Text>
        </Pressable>
        <Pressable onPress={() => setSection('suppliers')} style={[shellStyles.sectionButton, section === 'suppliers' && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }]}>
          <Text style={[shellStyles.sectionButtonText, { color: section === 'suppliers' ? theme.primary : theme.textSecondary }]}>Nhà cung cấp</Text>
        </Pressable>
      </View>
      {section === 'catalog'
        ? <InventoryCatalogScreen onOpenLegacyOperations={openLegacyOperations} onOpenPurchaseReceipts={openPurchaseReceipts} onOpenInventoryChecks={openInventoryChecks} onOpenInventoryWastes={openInventoryWastes} onOpenPurchaseReturns={openPurchaseReturns} onOpenSuppliers={() => setSection('suppliers')} />
        : section === 'suppliers'
          ? <SupplierListScreen onOpenReceipt={openPurchaseReceipt} />
        : section === 'operations'
          ? <LegacyInventoryOperations initialTab={legacyTab} initialMenuItemId={legacyMenuItemId} />
          : section === 'receipts'
            ? <PurchaseReceiptListScreen onCreateReceipt={createPurchaseReceipt} onOpenReceipt={openPurchaseReceipt} />
            : section === 'checks'
              ? <InventoryCheckListScreen onCreateCheck={createInventoryCheck} onOpenCheck={openInventoryCheck} />
              : section === 'check-composer' && checkComposer
                ? <InventoryCheckComposerScreen mode={checkComposer.mode} checkId={checkComposer.id} onFinished={finishInventoryCheck} onCancel={openInventoryChecks} />
                : section === 'wastes'
                  ? <InventoryWasteListScreen onCreateWaste={createInventoryWaste} onOpenWaste={openInventoryWaste} />
                  : section === 'waste-composer' && wasteComposer
                    ? <InventoryWasteComposerScreen mode={wasteComposer.mode} wasteId={wasteComposer.id} onFinished={finishInventoryWaste} onCancel={openInventoryWastes} />
                    : section === 'returns'
                      ? <PurchaseReturnListScreen onCreateReturn={createPurchaseReturn} onOpenReturn={openPurchaseReturn} />
                      : section === 'return-composer' && returnComposer
                        ? <PurchaseReturnComposerScreen mode={returnComposer.mode} returnId={returnComposer.id} onFinished={finishPurchaseReturn} onCancel={openPurchaseReturns} />
                : receiptComposer
                  ? <PurchaseReceiptComposerScreen
                mode={receiptComposer.mode}
                receiptId={receiptComposer.id}
                onFinished={finishPurchaseReceipt}
                onCancel={openPurchaseReceipts}
              />
                  : <PurchaseReceiptListScreen onCreateReceipt={createPurchaseReceipt} onOpenReceipt={openPurchaseReceipt} />}
    </View>
  );
};

const shellStyles = StyleSheet.create({
  container: { flex: 1 },
  sectionNav: { borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sectionButton: { borderColor: 'transparent', borderRadius: radii.md, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  sectionButtonText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }
});

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'transparent'
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 3,
    gap: spacing.sm,
    minHeight: spacing.touchTargetMobile,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md
  },
  tabButtonText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm,
    fontWeight: '600'
  },
  feedbackContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm
  },
  scrollContent: {
    padding: spacing.lg
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg
  },
  statsRowMobile: {
    flexDirection: 'column'
  },
  statCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    marginVertical: 4
  },
  statSub: {
    fontSize: 11
  },
  actionBar: {
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 260
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0
  },
  filterGroup: {
    flexDirection: 'row',
    gap: 6
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: '600'
  },
  btnGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  tableSurface: {
    borderRadius: radii.md,
    overflow: 'hidden'
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1
  },
  colHeader: {
    fontSize: 11,
    fontWeight: '700'
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1
  },
  skuText: {
    fontSize: 12,
    fontWeight: '700'
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2
  },
  stockNumber: {
    fontSize: 14,
    fontWeight: '700'
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14
  },
  bomContainer: {
    flex: 1,
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.lg
  },
  bomContainerMobile: {
    flexDirection: 'column'
  },
  bomLeftPanel: {
    flex: 1.2,
    borderRadius: radii.md,
    padding: spacing.md
  },
  bomRightPanel: {
    flex: 2,
    borderRadius: radii.md,
    padding: spacing.lg
  },
  fullWidthCol: {
    flex: 1
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.md
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    borderBottomWidth: 1
  },
  menuItemRowName: {
    fontSize: 14,
    fontWeight: '600'
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 16,
    marginBottom: 16
  },
  recipeTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4
  },
  recipeKpis: {
    flexDirection: 'row',
    gap: 12
  },
  recipeKpiBox: {
    padding: 10,
    borderRadius: radii.sm,
    backgroundColor: '#F8FAFC',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  recipeKpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B'
  },
  recipeKpiVal: {
    fontSize: 16,
    fontWeight: '800'
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12
  },
  recipeItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radii.sm,
    marginBottom: 8
  },
  recipeItemName: {
    fontSize: 14,
    fontWeight: '600'
  },
  qtyInput: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 70,
    fontSize: 14,
    textAlign: 'center'
  },
  removeBtn: {
    padding: 6,
    marginLeft: 8
  },
  addIngRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalBox: {
    width: '100%',
    maxWidth: 520,
    borderRadius: radii.lg,
    padding: spacing.xl
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16
  },
  formRow: {
    marginBottom: 14
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4
  },
  formInput: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14
  },
  livePreviewBox: {
    padding: 12,
    borderRadius: radii.md,
    marginVertical: 10
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1
  }
});

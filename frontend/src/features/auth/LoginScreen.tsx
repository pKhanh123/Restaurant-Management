import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { ChefHat, Moon, ShieldCheck, Sun, UserRound, Wifi } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Role } from '../../api/contracts';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, BrandMark, Button, Field, InlineAlert, Surface } from '../../ui';
import { ServerConfigModal } from '../../components/ServerConfigModal';
import { getApiBaseUrl } from '../../api/config';

const demoRoles: Array<{ role: Role; label: string; description: string; icon: LucideIcon; testID: string }> = [
  { role: 'CASHIER', label: 'Thu ngân', description: 'Bán hàng và quản lý bàn', icon: UserRound, testID: 'demo-btn-cashier' },
  { role: 'KITCHEN', label: 'Bếp', description: 'Tiếp nhận và chế biến món', icon: ChefHat, testID: 'demo-btn-kitchen' },
  { role: 'ADMIN', label: 'Quản trị', description: 'Thực đơn và báo cáo vận hành', icon: ShieldCheck, testID: 'demo-btn-admin' }
];

export const LoginScreen: React.FC = () => {
  const { login, demoLogin, isLoading, sessionExpiredMessage, clearSessionExpiredMessage } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);

  const currentServerUrl = getApiBaseUrl();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Nhập đầy đủ tên đăng nhập và mật khẩu để tiếp tục.');
      return;
    }

    setErrorMessage(null);
    clearSessionExpiredMessage();
    const result = await login(username.trim(), password);
    if (!result.success) {
      setErrorMessage(result.error || 'Đăng nhập không thành công. Vui lòng thử lại.');
    }
  };

  const handleDemoLogin = async (role: Role) => {
    setErrorMessage(null);
    clearSessionExpiredMessage();
    const result = await demoLogin(role);
    if (!result.success) {
      setErrorMessage(result.error || 'Không thể mở tài khoản dùng thử. Vui lòng thử lại.');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.surfaceCanvas }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]} keyboardShouldPersistTaps="handled">
          <View style={[styles.composition, isDesktop && styles.compositionDesktop]}>
            <View
              style={[
                styles.brandPanel,
                isDesktop && styles.brandPanelDesktop,
                { backgroundColor: isDark ? theme.surfaceSunken : theme.interactivePrimary }
              ]}
            >
              <View style={[styles.brandPlate, { backgroundColor: theme.surfaceBase }]}>
                <BrandMark size="large" />
              </View>
              {isDesktop && <View style={styles.brandMessage}>
                <Text style={[styles.brandHeading, { color: isDark ? theme.textPrimary : theme.textInverse }]}>Ca làm việc bắt đầu tại đây.</Text>
                <Text style={[styles.brandBody, { color: isDark ? theme.textSecondary : theme.textInverse }]}>Một màn hình chung cho quầy, bếp và quản trị nhà hàng.</Text>
              </View>}
              {isDesktop && <View style={[styles.shiftStatus, { borderColor: isDark ? theme.borderStrong : theme.textInverse }]}>
                <View style={[styles.statusDot, { backgroundColor: isDark ? theme.success : theme.textInverse }]} />
                <Text style={[styles.shiftText, { color: isDark ? theme.textPrimary : theme.textInverse }]}>Hệ thống sẵn sàng nhận ca</Text>
              </View>}
            </View>

            <Surface level="base" style={[styles.formPanel, isDesktop && styles.formPanelDesktop]}>
              <View style={styles.formHeader}>
                <View style={styles.titleGroup}>
                  <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Đăng nhập</Text>
                  <Text style={[styles.description, { color: theme.textSecondary }]}>Dùng tài khoản được cấp cho ca làm việc của bạn.</Text>
                </View>
                <View style={styles.headerActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cấu hình kết nối Wi-Fi máy chủ"
                    onPress={() => setIsServerModalOpen(true)}
                    style={({ pressed }) => [styles.themeButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet, borderColor: theme.borderSubtle }]}
                  >
                    <AppIcon icon={Wifi} color={theme.interactivePrimary} size={18} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
                    onPress={toggleTheme}
                    style={({ pressed }) => [styles.themeButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet, borderColor: theme.borderSubtle }]}
                  >
                    <AppIcon icon={isDark ? Sun : Moon} color={theme.textPrimary} size={18} />
                  </Pressable>
                </View>
              </View>

              {/* Server Connection Indicator Banner */}
              <Pressable
                onPress={() => setIsServerModalOpen(true)}
                style={({ pressed }) => [
                  styles.serverBanner,
                  { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle, opacity: pressed ? 0.8 : 1 }
                ]}
              >
                <View style={styles.serverBannerLeft}>
                  <AppIcon icon={Wifi} size={14} color={theme.success} />
                  <Text style={[styles.serverBannerText, { color: theme.textSecondary }]}>
                    Máy chủ: <Text style={{ color: theme.textPrimary, fontWeight: '600' }}>{currentServerUrl}</Text>
                  </Text>
                </View>
                <Text style={[styles.serverBannerChange, { color: theme.interactivePrimary }]}>Cấu hình Wi-Fi</Text>
              </Pressable>

              {sessionExpiredMessage && (
                <InlineAlert
                  tone="warning"
                  title="Phiên đăng nhập"
                  message={sessionExpiredMessage}
                />
              )}

              {errorMessage && <InlineAlert title="Chưa thể đăng nhập" message={errorMessage} />}

              <View style={styles.fields}>
                <Field
                  testID="input-username"
                  label="Tên đăng nhập"
                  placeholder="Ví dụ: cashier"
                  value={username}
                  onChangeText={(val) => {
                    setUsername(val);
                    if (sessionExpiredMessage) clearSessionExpiredMessage();
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                  returnKeyType="next"
                />
                <Field
                  testID="input-password"
                  label="Mật khẩu"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (sessionExpiredMessage) clearSessionExpiredMessage();
                  }}
                  secureTextEntry
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleLogin()}
                />
              </View>

              <Button testID="btn-login" variant="primary" label="Đăng nhập" loading={isLoading} onPress={() => void handleLogin()} />

              <View style={styles.demoSection}>
                <View style={styles.dividerRow}>
                  <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
                  <Text style={[styles.demoTitle, { color: theme.textSecondary }]}>Tài khoản dùng thử</Text>
                  <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />
                </View>
                <View style={[styles.demoList, { borderColor: theme.borderSubtle }]}>
                  {demoRoles.map((item, index) => (
                    <Pressable
                      key={item.role}
                      testID={item.testID}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isLoading }}
                      disabled={isLoading}
                      onPress={() => void handleDemoLogin(item.role)}
                      style={({ pressed }) => [
                        styles.demoRow,
                        index > 0 && { borderTopColor: theme.borderSubtle, borderTopWidth: 1 },
                        pressed && { backgroundColor: theme.surfaceSunken },
                        isLoading && styles.disabled
                      ]}
                    >
                      <View style={[styles.demoIcon, { backgroundColor: theme.interactiveQuiet }]}>
                        <AppIcon icon={item.icon} color={theme.textPrimary} size={19} />
                      </View>
                      <View style={styles.demoCopy}>
                        <Text style={[styles.demoLabel, { color: theme.textPrimary }]}>{item.label}</Text>
                        <Text style={[styles.demoDescription, { color: theme.textSecondary }]}>{item.description}</Text>
                      </View>
                      <Text style={[styles.openLabel, { color: theme.primary }]}>Mở</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </Surface>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ServerConfigModal
        visible={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  scrollContentDesktop: { padding: spacing.xxl },
  composition: { alignSelf: 'center', maxWidth: 1080, width: '100%' },
  compositionDesktop: { flexDirection: 'row', minHeight: 640 },
  brandPanel: { borderRadius: radii.md, gap: spacing.xl, padding: spacing.xl },
  brandPanelDesktop: { borderBottomRightRadius: 0, borderTopRightRadius: 0, justifyContent: 'space-between', padding: spacing.xxl, width: '40%' },
  brandPlate: { alignSelf: 'flex-start', borderRadius: radii.md, padding: spacing.sm },
  brandMessage: { gap: spacing.sm, maxWidth: 360 },
  brandHeading: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xxl, lineHeight: typography.lineHeights.xxl },
  brandBody: { fontFamily: typography.families.body, fontSize: typography.sizes.md, lineHeight: typography.lineHeights.md },
  shiftStatus: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  statusDot: { borderRadius: radii.pill, height: 8, width: 8 },
  shiftText: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  formPanel: { gap: spacing.lg, marginTop: spacing.md, padding: spacing.xl },
  formPanelDesktop: { borderBottomLeftRadius: 0, borderLeftWidth: 0, borderTopLeftRadius: 0, justifyContent: 'center', marginTop: 0, paddingHorizontal: 56, width: '60%' },
  formHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  titleGroup: { flex: 1, gap: spacing.xs },
  title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xxl, lineHeight: typography.lineHeights.xxl },
  description: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, maxWidth: 440 },
  themeButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  serverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1
  },
  serverBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1
  },
  serverBannerText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.families.body
  },
  serverBannerChange: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.families.bodyMedium,
    fontWeight: '600'
  },
  fields: { gap: spacing.md },
  demoSection: { gap: spacing.md, marginTop: spacing.xs },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  divider: { flex: 1, height: 1 },
  demoTitle: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  demoList: { borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  demoRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 58, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  demoIcon: { alignItems: 'center', borderRadius: radii.sm, height: 36, justifyContent: 'center', width: 36 },
  demoCopy: { flex: 1 },
  demoLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  demoDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  openLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  disabled: { opacity: 0.55 }
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../contexts/AuthContext';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { RootNavigator } from '../../navigation/RootNavigator';

const { createNativeComponent } = vi.hoisted(() => ({
  createNativeComponent: (name: string) => {
    const Component = (props: any) => React.createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  }
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const AnimatedValue = class {
    value: number;
    constructor(val: number) { this.value = val; }
    addListener() {}
    removeAllListeners() {}
  };
  const AnimatedView = (props: any) => React.createElement('View', props, props.children);
  AnimatedView.displayName = 'AnimatedView';
  const Animated = {
    Value: AnimatedValue,
    View: AnimatedView,
    Text: (props: any) => React.createElement('Text', props, props.children),
    timing: () => ({ start: (cb?: () => void) => cb?.() }),
    parallel: (animations: any[]) => ({ start: (cb?: () => void) => { animations.forEach(a => a.start()); cb?.(); } }),
    sequence: (animations: any[]) => ({ start: (cb?: () => void) => { animations.forEach(a => a.start()); cb?.(); } }),
    spring: () => ({ start: (cb?: () => void) => cb?.() })
  };
  return {
    ActivityIndicator: createNativeComponent('ActivityIndicator'),
    Animated,
    KeyboardAvoidingView: createNativeComponent('KeyboardAvoidingView'),
    Modal: createNativeComponent('Modal'),
    Platform: { OS: 'web', select: (values: Record<string, any>) => values.web ?? values.default },
    Pressable: createNativeComponent('Pressable'),
    SafeAreaView: createNativeComponent('SafeAreaView'),
    ScrollView: createNativeComponent('ScrollView'),
    StyleSheet: { create: (styles: any) => styles, flatten: (styles: any) => styles },
    Text: createNativeComponent('Text'),
    TextInput: createNativeComponent('TextInput'),
    View: createNativeComponent('View'),
    useWindowDimensions: () => ({ width: 1024, height: 768 })
  };
});

vi.mock('expo-constants', () => ({
  default: { expoConfig: {} }
}));

vi.mock('lucide-react-native', () => {
  const Icon = createNativeComponent('Icon');
  return {
    AlertCircle: Icon,
    ChefHat: Icon,
    Check: Icon,
    CheckCircle2: Icon,
    Info: Icon,
    Moon: Icon,
    Radio: Icon,
    RefreshCw: Icon,
    Server: Icon,
    ShieldCheck: Icon,
    Sun: Icon,
    UserRound: Icon,
    Wifi: Icon,
    X: Icon,
    XCircle: Icon
  };
});

vi.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();

  return {
    default: {
      getItem: vi.fn(async (key: string) => values.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        values.delete(key);
      })
    }
  };
});

vi.mock('../../features/customer/TableOrderScreen', () => ({
  TableOrderScreen: () => null
}));

vi.mock('../../navigation/RoleTabs', () => ({
  RoleTabs: () => null
}));

vi.mock('../../components/ServerConfigModal', () => ({
  ServerConfigModal: () => null
}));

describe('login with invalid credentials', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) {
        return;
      }
      process.stderr.write(`${args.join(' ')}\n`);
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('keeps the login screen mounted and shows the server error', async () => {
    let resolveLogin!: (value: {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }) => void;
    const loginResponse = new Promise<{
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }>((resolve) => {
      resolveLogin = resolve;
    });

    vi.stubGlobal('fetch', vi.fn(() => loginResponse));

    let screen: ReturnType<typeof create>;

    await act(async () => {
      screen = create(
        <ThemeProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      );
    });

    // Wait for restoreSession useEffect to complete (sets isLoading=false → LoginScreen renders)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const inputUsername = screen!.root.findByProps({ testID: 'input-username' });
    const inputPassword = screen!.root.findByProps({ testID: 'input-password' });
    await act(async () => {
      inputUsername.props.onChangeText('not-a-user');
      inputPassword.props.onChangeText('wrong-password');
    });

    await act(async () => {
      screen!.root.findByProps({ testID: 'btn-login' }).props.onPress();
      await Promise.resolve();
    });

    // After login click: isLoading=true (LoginScreen stays mounted; only isRestoringSession unmounts).
    // Resolve with 401 -> error message displayed.
    await act(async () => {
      resolveLogin({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Tên đăng nhập hoặc mật khẩu không chính xác'
          }
        })
      });
      await loginResponse;
    });

    // After 401 response: isLoading=false → LoginScreen renders again with preserved username
    expect(screen!.root.findByProps({ testID: 'input-username' }).props.value).toBe('not-a-user');
    expect(screen!.root.findByProps({ accessibilityRole: 'alert' })).toBeTruthy();
    expect(screen!.root.findByProps({ accessibilityRole: 'alert' }).props.children).toContainEqual(
      expect.objectContaining({
        props: expect.objectContaining({
          children: 'Tên đăng nhập hoặc mật khẩu không chính xác'
        })
      })
    );
  });

  it('offers manual login when a demo account uses an assigned password', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'Tên đăng nhập hoặc mật khẩu không chính xác' } })
    })));

    let screen: ReturnType<typeof create>;
    await act(async () => {
      screen = create(<ThemeProvider><AuthProvider><RootNavigator /></AuthProvider></ThemeProvider>);
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { screen!.root.findByProps({ testID: 'demo-btn-cashier' }).props.onPress(); });

    expect(screen!.root.findByProps({ testID: 'input-username' }).props.value).toBe('cashier');
    expect(screen!.root.findByProps({ testID: 'input-password' }).props.value).toBe('');
    expect(screen!.root.findByProps({ accessibilityRole: 'alert' }).props.children).toContainEqual(
      expect.objectContaining({ props: expect.objectContaining({
        children: 'Tài khoản này dùng mật khẩu riêng. Nhập mật khẩu được cấp để đăng nhập.'
      }) })
    );
  });
});

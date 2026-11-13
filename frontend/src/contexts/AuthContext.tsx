import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserDto, Role, LoginResponseDto, ApiErrorResponse, ApiResponse } from '../api/contracts';
import { getApiBaseUrl } from '../api/config';

interface AuthContextType {
  user: UserDto | null;
  token: string | null;
  isLoading: boolean;
  isRestoringSession: boolean;
  sessionExpiredMessage: string | null;
  login: (username: string, password: string) => Promise<AuthResult>;
  demoLogin: (role: Role) => Promise<AuthResult>;
  logout: () => void;
  handleUnauthorized: (reason?: string) => void;
  clearSessionExpiredMessage: () => void;
}

type AuthResult = { success: boolean; error?: string; code?: string; requiresPassword?: boolean };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_TOKEN_KEY = 'crispy_token';
const STORAGE_USER_KEY = 'crispy_user';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  /**
   * Khoi phuc phien dang nhap khi app khoi dong.
   * Ho tro ca Web (localStorage) va Mobile Native (AsyncStorage).
   */
  useEffect(() => {
    const restoreSession = async () => {
      try {
        let savedToken: string | null = null;
        let savedUser: string | null = null;

        if (typeof window !== 'undefined' && window.localStorage) {
          savedToken = window.localStorage.getItem(STORAGE_TOKEN_KEY);
          savedUser = window.localStorage.getItem(STORAGE_USER_KEY);
        }

        if (!savedToken) {
          savedToken = await AsyncStorage.getItem(STORAGE_TOKEN_KEY);
          savedUser = await AsyncStorage.getItem(STORAGE_USER_KEY);
        }

        if (savedToken && savedUser) {
          const parsedUser = JSON.parse(savedUser) as UserDto;

          // Kiem tra token con hop le voi Backend khong truoc khi dua vao man hinh chinh
          const baseUrl = getApiBaseUrl();
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const verifyRes = await fetch(`${baseUrl}/api/orders?status=PENDING`, {
              headers: { Authorization: `Bearer ${savedToken}` },
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (verifyRes.status === 401) {
              console.warn('⚠️ Token luu tru khong con hop le (401), dang xoa token...');
              await clearStorage();
              setSessionExpiredMessage('Phiên làm việc trước đó đã hết hạn. Vui lòng đăng nhập lại.');
              return;
            }
          } catch {
            // Neu khong ket noi duoc ngay (offline hoac timeout), tam thoi van giu token
          }

          setToken(savedToken);
          setUser(parsedUser);
        }
      } catch (e) {
        console.warn('Khong the khoi phuc phien dang nhap:', e);
      } finally {
        setIsRestoringSession(false);
      }
    };

    restoreSession();
  }, []);

  const clearStorage = async () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_TOKEN_KEY);
      window.localStorage.removeItem(STORAGE_USER_KEY);
    }
    await AsyncStorage.removeItem(STORAGE_TOKEN_KEY);
    await AsyncStorage.removeItem(STORAGE_USER_KEY);
  };

  const handleUnauthorized = useCallback((reason?: string) => {
    setUser(null);
    setToken(null);
    clearStorage();
    setSessionExpiredMessage(reason || 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  }, []);

  const clearSessionExpiredMessage = useCallback(() => {
    setSessionExpiredMessage(null);
  }, []);

  const login = async (username: string, password: string): Promise<AuthResult> => {
    setIsLoading(true);
    setSessionExpiredMessage(null);
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const json = await response.json();

      if (!response.ok) {
        const errJson = json as ApiErrorResponse;
        const msg = errJson.error?.message || 'Đăng nhập thất bại. Vui lòng thử lại.';
        return { success: false, error: msg, code: errJson.error?.code };
      }

      const successData = (json as ApiResponse<LoginResponseDto>).data;
      setToken(successData.token);
      setUser(successData.user);

      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_TOKEN_KEY, successData.token);
        window.localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(successData.user));
      }
      await AsyncStorage.setItem(STORAGE_TOKEN_KEY, successData.token);
      await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(successData.user));

      return { success: true };
    } catch {
      return {
        success: false,
        error: `Không thể kết nối đến máy chủ tại ${baseUrl}. Vui lòng đảm bảo điện thoại và máy tính cùng mạng Wi-Fi.`
      };
    } finally {
      setIsLoading(false);
    }
  };

  const demoLogin = async (role: Role): Promise<AuthResult> => {
    const creds: Record<Role, { u: string; p: string }> = {
      CASHIER: { u: 'cashier', p: 'cashier123' },
      KITCHEN: { u: 'kitchen', p: 'kitchen123' },
      ADMIN: { u: 'admin', p: 'admin123' }
    };
    const { u, p } = creds[role];
    const result = await login(u, p);
    return result.code === 'INVALID_CREDENTIALS' ? { ...result, requiresPassword: true } : result;
  };

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStorage();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isRestoringSession,
        sessionExpiredMessage,
        login,
        demoLogin,
        logout,
        handleUnauthorized,
        clearSessionExpiredMessage
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phai duoc su dung ben trong AuthProvider');
  }
  return context;
};

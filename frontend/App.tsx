import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  useFonts as useBarlowCondensedFonts
} from '@expo-google-fonts/barlow-condensed';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts as useInterFonts
} from '@expo-google-fonts/inter';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { ToastProvider } from './src/contexts/ToastContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { RestaurantProvider } from './src/contexts/RestaurantContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { WebPresentation } from './src/ui/WebPresentation';

function AppContent() {
  const { isDark, setRoleTheme } = useTheme();
  const { user } = useAuth();

  useEffect(() => {
    setRoleTheme(user?.role ?? 'GUEST');
  }, [setRoleTheme, user?.role]);

  return (
    <>
      <WebPresentation />
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  const [barlowFontsLoaded, barlowFontsError] = useBarlowCondensedFonts({
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold
  });
  const [interFontsLoaded, interFontsError] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold
  });

  const fontLoadFailed = Boolean(barlowFontsError || interFontsError);

  if (!fontLoadFailed && (!barlowFontsLoaded || !interFontsLoaded)) {
    return null;
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <RestaurantProvider>
            <AppContent />
          </RestaurantProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}


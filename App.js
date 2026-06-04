import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation';
import { ThemeProvider } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { UserNotificationProvider } from './src/context/UserNotificationContext';
import { CartProvider } from './src/context/CartContext';
import { AppDataProvider } from './src/context/AppDataContext';
import { EventFormProvider } from './src/context/EventFormContext';
import { LocaleProvider } from './src/context/LocaleContext';
import { ToastProvider } from './src/context/ToastContext';
import TermsAcceptanceGate from './src/components/TermsAcceptanceGate';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AuthProvider>
        <LocaleProvider>
          <ThemeProvider>
            <ToastProvider>
              <UserNotificationProvider>
                <CartProvider>
                  <AppDataProvider>
                    <EventFormProvider>
                      <TermsAcceptanceGate>
                        <AppNavigator />
                      </TermsAcceptanceGate>
                      <StatusBar style="auto" />
                    </EventFormProvider>
                  </AppDataProvider>
                </CartProvider>
              </UserNotificationProvider>
            </ToastProvider>
          </ThemeProvider>
        </LocaleProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

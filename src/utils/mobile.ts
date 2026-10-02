import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import toast from 'react-hot-toast';

export const isNative = Capacitor.isNativePlatform();

let isMobileInitialized = false;
let activeBackHandler: (() => boolean) | null = null;
let lastBackPress = 0;

/**
 * Register the active route/page back button action
 */
export function setBackHandler(handler: (() => boolean) | null) {
  activeBackHandler = handler;
}

/**
 * Initializes mobile platform features: Status bar, Splash screen, single Hardware Back Button router
 */
export async function initMobileApp(): Promise<void> {
  if (!isNative || isMobileInitialized) return;
  isMobileInitialized = true;

  try {
    // Hide native splash screen
    await SplashScreen.hide();

    // Dark status bar matching theme
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#090d16' });
  } catch (err) {
    console.warn('[Mobile] Error configuring status bar/splash:', err);
  }

  // Unified Android hardware back button handler
  try {
    await App.addListener('backButton', ({ canGoBack }) => {
      // 1. Check if the active screen (Game or Lobby) handles back button
      if (activeBackHandler) {
        const handled = activeBackHandler();
        if (handled) return;
      }

      // 2. Normal browser/webview history navigation if available
      if (canGoBack) {
        window.history.back();
        return;
      }

      // 3. Home / Auth screen: double-tap back within 2s to exit cleanly
      const now = Date.now();
      if (now - lastBackPress < 2000) {
        App.exitApp();
      } else {
        lastBackPress = now;
        toast('Press BACK again to exit', {
          id: 'back-exit',
          duration: 2000,
          icon: '🚪',
          style: {
            background: '#0f172a',
            color: '#f8fafc',
            border: '2px solid #cbd5e1'
          }
        });
      }
    });
  } catch (err) {
    console.warn('[Mobile] Error attaching backButton listener:', err);
  }
}

/**
 * App lifecycle listener (background / foreground)
 */
export function onAppStateChange(callback: (isActive: boolean) => void): () => void {
  if (!isNative) return () => {};

  try {
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      callback(isActive);
    });
    return () => {
      handle.then((h) => h.remove());
    };
  } catch {
    return () => {};
  }
}

/**
 * Trigger subtle haptic tap on interactive items (safe across web and mobile)
 */
export async function triggerHaptic(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
  if (!isNative) {
    if ('vibrate' in navigator) {
      navigator.vibrate(style === 'light' ? 10 : style === 'medium' ? 25 : 45);
    }
    return;
  }

  try {
    const impactMap = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    };
    await Haptics.impact({ style: impactMap[style] });
  } catch {
    // Ignore unsupported devices
  }
}

/**
 * Trigger celebratory haptic for Bingo, Line Completion, or Victory
 */
export async function triggerSuccessHaptic(): Promise<void> {
  if (!isNative) {
    if ('vibrate' in navigator) {
      navigator.vibrate([40, 60, 40, 60, 100]);
    }
    return;
  }

  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // Ignore
  }
}

/**
 * Check and listen to network connectivity status
 */
export async function getNetworkStatus(): Promise<{ connected: boolean; connectionType: string }> {
  try {
    const status = await Network.getStatus();
    return status;
  } catch {
    return { connected: navigator.onLine, connectionType: 'unknown' };
  }
}

export function onNetworkChange(callback: (status: { connected: boolean }) => void): () => void {
  try {
    const handle = Network.addListener('networkStatusChange', callback);
    return () => {
      handle.then((h) => h.remove());
    };
  } catch {
    const onlineHandler = () => callback({ connected: true });
    const offlineHandler = () => callback({ connected: false });
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }
}

import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Qratex native kabuk (Android/iOS).
 * Uygulama Next.js SSR olduğu için statik export YOK: native kabuk canlı sunucuyu
 * (server.url) yükler. Adres sırası: CAPACITOR_SERVER_URL → NEXT_PUBLIC_APP_URL →
 * NEXTAUTH_URL → https://qratex.com. localhost değerleri yalnız CAPACITOR_SERVER_URL
 * ile açıkça verilirse kullanılır (yanlışlıkla localhost'a bağlı mağaza derlemesi olmasın).
 */
function resolveServerUrl(): string {
  const explicit = process.env.CAPACITOR_SERVER_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  for (const v of [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXTAUTH_URL]) {
    const s = v?.trim();
    if (s && /^https:\/\//.test(s) && !/localhost|127\.0\.0\.1/.test(s)) return s.replace(/\/$/, '');
  }
  return 'https://qratex.com';
}

const serverUrl = resolveServerUrl();

const config: CapacitorConfig = {
  appId: 'com.qratex.app',
  appName: 'Qratex',
  webDir: 'native-shell',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    androidScheme: 'https',
    allowNavigation: [new URL(serverUrl).host],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

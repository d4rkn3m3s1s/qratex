/**
 * Service worker kaydı — tek kaynak (P0-37 / perf O9).
 *
 *  - Üretimde tek SW vardır: next-pwa'nın ürettiği `/sw.js` (precache + çalışma anı önbelleği)
 *    ve onun `importScripts('/push-sw.js')` ile içe aldığı push dinleyicileri.
 *    Eskiden push kancası `/push-sw.js`'i ayrıca `/` kapsamına kaydediyordu; aynı kapsamda
 *    tek SW olabildiği için iki SW birbirinin yerine geçiyordu.
 *  - Geliştirmede next-pwa kapalıdır (`/sw.js` üretilmez; public/ altındaki eski bir build
 *    çıktısı bayat olabilir) → yalnız push testi için bağımsız `/push-sw.js` kaydedilir.
 *  - QR hunisi (anonim müşterinin okuttuğu sayfalar) SW KAYDETMEZ: ilk ziyaret hızlı kalmalı.
 *    Kayıt yalnız panel kabuklarından (components/pwa/service-worker-registrar.tsx) ve push
 *    aboneliği sırasında yapılır.
 */

/** SW kaydedilmeyecek yol önekleri (QR hunisi + kimlik doğrulama + yönetim). */
export const SW_EXCLUDED_PREFIXES = [
  '/feedback',
  '/c/',
  '/surveys',
  '/table-signal',
  '/experience',
  '/auth',
  '/admin',
  '/admin-gate',
] as const;

/** Bu sayfada SW kaydı yapılmalı mı? (saf fonksiyon; test: __tests__/lib/pwa-service-worker.test.ts) */
export function shouldRegisterServiceWorker(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !SW_EXCLUDED_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Ortama göre kaydedilecek SW betiği. */
export function getServiceWorkerScriptUrl(nodeEnv: string | undefined = process.env.NODE_ENV): string {
  return nodeEnv === 'production' ? '/sw.js' : '/push-sw.js';
}

let pendingRegistration: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * SW'yi (bir kez) kaydeder ve kaydı döndürür. Desteklenmeyen tarayıcıda null.
 * Eşzamanlı çağrılar aynı promise'i paylaşır; hata olursa sonraki çağrı yeniden dener.
 */
export function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (pendingRegistration) return pendingRegistration;

  const scriptUrl = getServiceWorkerScriptUrl();
  pendingRegistration = navigator.serviceWorker
    .register(scriptUrl, { scope: '/' })
    .then((registration) => registration)
    .catch((err: unknown) => {
      pendingRegistration = null;
      throw err;
    });
  return pendingRegistration;
}

/** Test yardımcısı: modül içi tekil promise'i sıfırlar. */
export function __resetServiceWorkerRegistrationForTests(): void {
  pendingRegistration = null;
}

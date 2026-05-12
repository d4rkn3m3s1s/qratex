/**
 * Yüzen arayüz katman sırası.
 * Radix dialog/sheet ~50; dropdown/select/popover ~100+ (`components/ui/dropdown-menu.tsx`).
 * Chatbot FAB, dialog/sheet (z-50) altında (~45).
 * Sonner toast kütüphanede çok yüksek z kullanır.
 *
 * Bileşenlerde `floatingZTw.*` kullanın; `tailwind.config.ts` içinde safelist ile JIT purge korunur.
 */
export const floatingZTw = {
  pwaInstall: 'z-[40]',
  cookieConsent: 'z-[70]',
  /** Modal/sheet (z-50) üstünde görünmesin diye daha düşük katman */
  assistant: 'z-[45]',
} as const;

/** Sayısal referans (log / koşul); class için `floatingZTw` kullanın */
export const Z_FLOATING_LAYER = {
  pwaInstall: 40,
  assistant: 45,
  radixOverlay: 50,
  cookieConsent: 70,
} as const;

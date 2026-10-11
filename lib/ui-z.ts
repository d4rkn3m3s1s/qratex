/**
 * Yüzen arayüz katmanları — QDL z-index ölçeğinin (app/globals.css `--z-*`, Tailwind `z-*`)
 * adlandırılmış kullanımları. Keyfi `z-[N]` ve Tailwind safelist'i yok: token sınıfları
 * kaynakta düz metin olarak geçtiği için JIT onları kendiliğinden üretir.
 *
 * Sıra: overlay 40 (PWA bandı) < floating 45 (asistan FAB'ı) < modal 50 (dialog/sheet)
 *       < toast 70 (çerez bandı) < popover 80 (menü/select/popover) < skip 100.
 */
export const floatingZTw = {
  pwaInstall: 'z-overlay',
  cookieConsent: 'z-toast',
  /** Modal/sheet (z-modal) üstünde görünmesin diye daha düşük katman */
  assistant: 'z-floating',
} as const;

/** Sayısal referans (log / koşul); class için `floatingZTw` kullanın */
export const Z_FLOATING_LAYER = {
  pwaInstall: 40,
  assistant: 45,
  radixOverlay: 50,
  cookieConsent: 70,
} as const;

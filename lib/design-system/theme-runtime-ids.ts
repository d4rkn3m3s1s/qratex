/**
 * Tema `<style>` öğelerinin kimlikleri — ayrı dosyada, çünkü istemci kök sağlayıcısı
 * (`lib/apply-runtime-theme`) yalnız bunlara ihtiyaç duyar; `theme-runtime` ise palet
 * kataloğunu (theme-model) taşır ve artık ilk yük JS'ine girmez (perf-2).
 */
export const RUNTIME_THEME_STYLE_ID = 'qx-runtime-theme';
export const RUNTIME_THEME_LIVE_STYLE_ID = 'qx-runtime-theme-live';

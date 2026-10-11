# Genel denetim — Temalar

Tarih: 2026-10-12 · dal `feat/platform-overhaul` · yöntem: kod okuma + tsc (tarayıcı kullanılmadı, sunucu yükü yüzünden)

## Sağlam bulunanlar (kanıt)
- `/admin/themes` → kalıcı yönlendirme `/admin/design-system?tab=temalar` (sorgu korunur). Tema stüdyosu `components/admin/a-tasarim-sistemi/theme/*`.
- Runtime tema: SSR `<style id="qx-runtime-theme">` (app/layout.tsx, `buildRuntimeThemeCss`) + istemci canlı blok (`lib/apply-runtime-theme.ts`, providers.tsx:101). İki mod tek blokta; satır içi stil yok → a11y modları ezilmiyor.
- Özgüllük zinciri doğrulandı: runtime `:root:not(.dark)`/`:root.dark` (0,2,0) < `html:root.high-contrast` (0,2,1) < `html:root.dark.high-contrast` (0,3,1); `prefers-contrast: more` bloğu (0,3,1). Koyu HC bloğu açık HC'nin tüm değişkenlerini yeniden tanımlıyor (sızıntı yok).
- Admin önizlemesi (`preview-canvas.tsx`) `resolvePaletteTokens` = `BASE_THEME_VARS + deriveThemeVars` ile çiziyor; runtime da `deriveThemeVars` kullanıyor; `BASE_THEME_VARS` ↔ globals.css eşitliği `__tests__/design/theme-derive.test.ts` ile korunuyor → önizleme = gerçek görünüm.
- Açık/koyu/sistem: `qratex-theme` erken init script + next-themes; varsayılan mod admin ayarından.
- A11y sınıfları: init script (`qratex-a11y`) + `AccessibilityClassSync`; azaltılmış hareket `useReducedMotionPref` ile dinamik zeminlerde, 3B hediye kutusunda, An/moment sahnesinde, gizemli barda uygulanıyor.
- Ham renk taraması: kalan ham hex/gri kullanımları kasıtlı (oyun paletleri, e-posta önizlemesi, OG görseli, global-error, Leaflet, cam efektli chatbot `dark:` varyantlı, gizemli bar kategori kimlik renkleri). Token'a çevrilecek hatalı kullanım bulunmadı.

## Düzeltilenler
1. **Yıldız alanı iz rengi sabit mordu** — `components/ui/backgrounds/starfield.tsx`: iz rengi artık `--primary`'den (yönetici teması / dönemsel konsept) okunuyor; okunamazsa eski mor.
2. **Admin panelinde kişisel erişilebilirlik ayarı yoktu** — `/admin/settings` → Güvenlik ve kapı bölümüne "Erişilebilirlik" kartı (`section-security.tsx`).
3. **Bayi/admin yazı boyutu seçemiyordu** — `components/settings/accessibility-toggles.tsx` ortak bileşenine Yazı Boyutu (Normal/Büyük/Çok büyük, radiogroup, 44px hedef) eklendi; geriye uyumlu.

## Kalan
- Cihazlar arası a11y senkronu yalnız müşteride ve yalnız Ayarlar → Görünüm açıldığında sunucudan uygulanıyor; açılışta global çekim yok (her yüklemede ek istek = perf alanı). Bayi/admin tercihi cihaz bazlı (UI'da açıkça yazıyor). Öneri: oturum açılışında tek seferlik hafif uç (`/api/me/a11y`) — perf ajanıyla birlikte.
- Yıldız alanı rengi yayın anında değil, efekt yeniden çalıştığında (tema modu/yeniden yükleme) güncellenir.
- 3B sahneler (hediye kutusu, moment) kendi sabit paletini kullanır, şeffaf zemin üzerinde; tasarım gereği tema okumaz — görsel doğrulama yapılmadı.

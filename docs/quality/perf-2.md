# Performans 2. tur — ortak ilk yük JS'i

Ölçüm: `NEXT_DIST_DIR=.next-perf2 npx next build` (Next 16.4 Turbopack, prod). Betik: her
`page_client-reference-manifest.js`'in `entryJSFiles` + `rootMainFiles` birleşimi; 281 sayfanın
en az %90'ına giren parçalar "ortak" sayıldı. Boyutlar gzip.

## Önce / sonra

| Ölçü | Önce | Sonra | Fark |
|---|---|---|---|
| Ortak parça sayısı | 18 | 16 | -2 |
| Ortak JS (gzip) | 255.9 KB | 228.9 KB | **-27.0 KB (-10.5%)** |
| Ortak JS (ham) | 808 KB | 731 KB | -77 KB |
| Sayfa başı ilk yük (medyan, gzip) | 334.7 KB | 319.3 KB | -15.4 KB |

Not: ~125 KB gzip (React/Next çalışma zamanı: 73.8 + 38.6 + 12.9) dokunulamaz taban.

## Ortak yükten çıkarılanlar (kök neden)

| Modül | Neden ortaktı | Şimdi |
|---|---|---|
| Tercih merkezi diyaloğu (Radix Dialog + Switch + RemoveScroll, ~10 KB gz) | `CookieConsentBanner` kök layout'ta `ConsentCenter`'ı statik render ediyordu | `consent-center-lazy.tsx`: ilk "Tercihleri yönet" olayında yüklenir, o olayın yüzeyiyle açık başlar |
| `@capacitor/core` + native köprü | `NativeBridge` web'de de statik içe aktarılıyordu | `native-bridge.tsx` kabuk: yalnız `window.Capacitor.isNativePlatform()` doğruysa `native-bridge-impl` yüklenir |
| Efekt cephesi (`lib/moments/effects` → oyun sesleri, haptic) | `ConfettiProvider` kök sağlayıcıda statik | İlk `fire*()` çağrısında dinamik import |
| Tema palet kataloğu (`theme-runtime` → `theme-model`, 30+ aile) | `ThemeColorsProvider` ilk durumda `runtimeThemeStateFromRows` çağırıyordu | SSR CSS'i zaten basıyor; istemci tembel modülle yeniden yazar. Stil kimlikleri `theme-runtime-ids.ts`'e ayrıldı |

## İncelenip dokunulmayanlar

- **Sentry**: zaten `instrumentation-client.ts`'te DSN koşullu dinamik import (DSN yoksa 0 bayt).
- **PostHog**: zaten `import('posthog-js')` ile tembel; ortakta kalan yalnız ~1-2 KB sağlayıcı kabuğu.
- **framer-motion**: kökte yalnız `LazyMotion` + `MotionPolicyConfig` (~9 KB); özellik paketi zaten tembel.
- **sonner** (~14 KB parça, Toaster + ortak UI): `toast()` her panelden çağrılıyor; erteleme ilk bildirimi kaybettirir.
- **next-auth/react + `messages/tr.json`** (0-qcyam8cvfh4, 24.9 KB gz): `SessionProvider` ve `AppLocaleProvider` her rotada gerekli.
- **Çerez bandı**: LCP/CLS kalite kapısı için bilerek ilk HTML'de basılıyor (landing ajanının alanı).

## Kalanlar (sonraki tur)

1. `tr.json` (53 KB ham) panel bazında bölünmeli (public/customer/dealer/admin ad alanları); `useAppT` anahtar arayüzü korunarak `AppLocaleProvider`'a panel parçası enjekte edilmeli — geniş etkili, ayrı iş.
2. Gözlem: tercih merkezi açıkken çerez bandı diyaloğun üstünde kalıyor (z-index; önceden de böyleydi) — `docs/design/iyilestirme/perf-2/consent-center-lazy-390.png`.

Doğrulama: tsc 0 hata; jest design + badges 369/369; canlı dev'de "Tercihleri yönet" → diyalog açıldı, sayfa hatası yok.

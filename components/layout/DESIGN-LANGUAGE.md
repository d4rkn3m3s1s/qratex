# Qratex Design Language v2 (QDL) — kurallar

Tek kaynak bu sayfa ve bağlantı verdiği dosyalardır. Yaşayan rehber (canlı token, kontrast,
hareket ve bileşen örnekleri): **`/admin/design-system`**. Gerekçe ve geçmiş:
`docs/audit/2026-10-08/sistem/tasarim-sistemi.md`. Eski `design-system/qratex/MASTER.md`
arşivlendi (`docs/archive/`) ve ürünü temsil etmez.

## Nerede ne var

| Konu | Kaynak |
|---|---|
| Renk, yüzey, radius, boşluk, tipografi, elevation, z-index, motion token'ları | `app/globals.css` (değerler) · `tailwind.config.ts` (sınıf eşlemesi) · `lib/design/tokens.ts` (katalog + kontrast sözleşmesi) |
| Çalışma zamanı teması (preset / özel / dönemsel) | `lib/design/theme-derive.ts` (kontrast garantili türetme) · `lib/design-system/theme-runtime.ts` (SSR + istemci tek `<style>`) |
| Bileşenler | `components/ds/README.md` (sayfa, veri, form, a11y, play) · `components/states` (boş/hata/yükleme/onay) · `components/ui` (primitifler) |
| Hareket | `lib/motion/README.md` (token, varyant, `useMotionPolicy`, `Ambient`, `Reveal`) |

## Kurallar (CI korur: `__tests__/design/*`)

1. **Rol token'ı, ham palet değil.** Durum: `text-success|warning|danger|info`, zemin `bg-*-subtle`,
   kenar `border-*-border`, dolgu `bg-*` + `text-*-fg`. Marka: `text-brand` / `text-primary`
   (ikisi de `--brand-text`). Ham `text-emerald-500` vb. yalnız oyun/kimlik yüzeylerinde.
2. **Dolgu rengini metin olarak kullanma.** `text-*` sınıfları zaten metin rolüne gider; her tema
   ve preset'te ≥ 4.5:1 türetilir.
3. **Kimlik renkleri** (rozet kategorisi, oyun, grafik serisi) `--category-1..8`; metin değil.
4. **Sayfa iskeleti:** `PanelPage` + `PageHeader` (`compact` varsayılan, `hero` yalnız panel ana
   sayfası). Eski `DashboardPageHero` / `AdminPremiumHero` / `DashboardPageHeading` kaldırıldı.
5. **Durumlar:** `QueryState` (yükleme/hata/boş), `EmptyState`, `ErrorState`; yıkıcı işlem `ConfirmAction`
   (native `confirm()` yok; tek istisna kaydedilmemiş değişiklikle sayfadan ayrılma koruması).
   Panel `loading.tsx` yalnız içerik iskeleti, panel `error.tsx` yalnız `PanelRouteError` çizer
   (kabuk ve `<main>` layout'ta).
6. **Tipografi:** `qx-display|h1|h2|h3|body|small|caption|overline`; bilgi taşıyan metin ≥ 12px
   (`text-[≤9px]` yasak). `font-mono` = JetBrains Mono (kod/kimlik), `font-display` = Space Grotesk (skor).
7. **Hareket:** `lib/motion` token ve varyantları; ham süre/easing yok; sonsuz döngü yalnız `Ambient`
   içinde ve yalnız `play` kaydında. Uygulama içi "animasyonları azalt" tüm framer + CSS'e ulaşır.
8. **Ad alanı:** projeye özel CSS yardımcıları `qx-` önekli; Tailwind/eklenti adlarını (`animate-in`,
   `fade-in`, `delay-*`) asla yeniden tanımlama.
9. **Katmanlar:** `z-base 0 · raised 10 · sticky 20 · header 30 · overlay 40 · floating 45 · modal 50 ·
   toast 70 · popover 80 · skip 100`; sayfa üstü katmanda keyfi `z-[N≥10]` yok (bileşen içi yerel istif
   `z-[1..9]` serbest). Stagger `staggerDelay(i)` ile bütçeli (toplam ≤ 0,6 sn).
10. **Erişilebilirlik modları** (yüksek kontrast, renk körü, yazı boyutu, hareket azaltma) yalnız rol
    token'larını yeniden tanımlar ve tema paletinden daha özgüldür (tema onları ezemez).

## İki ifade kaydı

| | `ops` — admin, bayi, personel, müşteri ayar/geçmiş | `play` — müşteri ana sayfa, rozet, ödül, oyun |
|---|---|---|
| Yüzey | `bg-card` düz kart, `qx-elevation-1` | `GlowCard`, gradient kenar, `qx-elevation-2/3` |
| Hareket | `fast/base`, sonsuz döngü yok | `celebrate`, spring, `Ambient` |
| Renk | rol token'ları; marka yalnız vurgu | `--category-*`, marka gradyanları |

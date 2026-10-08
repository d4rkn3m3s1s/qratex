# Tasarım Sistemi Denetimi — Qratex (2026-10-08)

> Boyut: **tasarim-sistemi** · Kapsam: `components/ui`, `app/globals.css`, `tailwind.config.ts`, tema/renk token'ları ve çalışma zamanı tema motoru, tipografi, boşluk/radius/gölge, kart/buton/form tutarlılığı, admin–bayi–müşteri(–personel) panelleri arasındaki görsel dil farkları, karanlık mod, motion dili (framer-motion), ikonografi, boş/yükleniyor/hata durumları, `app/admin/design-language` sayfasının gerçek kullanımla uyumu.
> Yöntem: salt okunur. Grep/Glob ile envanter + dosya okuma. Animasyon çakışması iddiası, mevcut derlenmiş CSS'te (`.next/static/css/b62679f663e00d03.css`, 2 Eylül derlemesi; `globals.css` son değişiklik 22 Temmuz, yani derleme güncel kaynağı yansıtıyor) doğrulandı. Kontrast oranları WCAG formülüyle Node üzerinde hesaplandı. Tarayıcıda gözle doğrulama YAPILMADI; bu yüzden görsel sonuç iddiaları "kaynak/derleme çıktısından doğrulandı" düzeyindedir.

---

## 1. Özet

**Puan: 4.5 / 10**

Qratex'in sağlam bir **temeli** var: shadcn/Radix primitifleri, HSL CSS değişkenleriyle tema token'ları, üç panelde ortak kabuk (`Sidebar` + `DashboardHeader` + `#dashboard-main`), ortak sayfa kahramanı (`DashboardPageHero`), tek ikon kütüphanesi (lucide-react, 263 dosya, başka kütüphane yok), global `LazyMotion` + `MotionConfig reducedMotion="user"`, erişilebilirlik modları (renk körü / yüksek kontrast / animasyon azaltma) ve iyi niyetli `InlineLoadingStatus`, `EmptyState` gibi durum bileşenleri.

Ancak bu temel **tek bir dil olarak işlemiyor**. Asıl sorunlar kozmetik değil, yapısal:

1. **Kırık davranışlar (kritik):** `globals.css`'teki özel `.animate-in` sınıfı, `tailwindcss-animate`'in aynı adlı sınıfını eziyor; sonuç olarak **tüm Dialog / Sheet / AlertDialog / Dropdown / Select / Popover açılış animasyonları** tasarlanan zoom/slide yerine 0.5 sn'lik "aşağıdan yukarı fade" oynatıyor (kapanış doğru → asimetrik). Karanlık modda `text-destructive` kontrastı **1.93:1** — form hata mesajları neredeyse görünmüyor (99 kullanım, hiçbirinde dark override yok).
2. **Token sistemi var ama kullanılmıyor:** `--success`, `--warning`, `--info` token'ları tanımlı, Tailwind'e bağlı, **sıfır** kullanımda. Durum renkleri ham palet ile ifade ediliyor: ~2.500 ham renk sınıfı (`text-amber` 400, `text-emerald` 349, `text-red` 208…). Renk körü modu bunların yalnızca 7 sınıfını kapsıyor.
3. **Tema motoru çok yazarlı ve çatışmalı:** Token'lar 5 katmandan yazılıyor (`:root` → `html:not(.dark)` → `.dark` → çalışma zamanı inline stil (preset/custom) → dönemsel konsept). `ThemeColorsProvider` ile `SeasonalConceptApplier` aynı değişkenleri birbirinin üstüne yazıyor/siliyor.
4. **Üç çelişkili "tek kaynak":** `design-system/qratex/MASTER.md` (mavi, Plus Jakarta Sans, "flat, gradient yok") ürünle tamamen çelişiyor; `components/layout/DESIGN-LANGUAGE.md` bir değişiklik günlüğüne dönmüş; `/admin/design-language` sayfası canlı bileşen/token göstermeyen statik metin.
5. **Motion dili yok:** 25+ farklı süre, 10 farklı giriş ofseti, sınırsız `index * 0.1` stagger, `whileHover` ölçeği 1.01'den 1.2'ye; ortak preset dosyası yok. Uygulama içi "animasyonları azalt" ayarı 146 framer-motion dosyasına ve 89 sonsuz döngüye **ulaşmıyor**.
6. **Paneller arası tutarlılık sayfa düzeyinde dağılıyor:** Hero benimsenmesi admin %71, bayi %51, müşteri %29; 3 farklı başlık bileşeni; 5 yerel `StatCard`; `PREMIUM_PANEL_CARD_BASE` sabitinin 6 kullanıcısına karşı 37 satır içi kopyası.

Bu rapor, sorunları önem sırasıyla kanıtlıyor ve **"Qratex Design Language v2"** adıyla tek, profesyonel bir tasarım dili + adım adım geçiş planı öneriyor.

---

## 2. Mevcut durum haritası

### 2.1 Katmanlar

| Katman | Kaynak | Durum |
|---|---|---|
| Ham token'lar (light/dark) | `app/globals.css:9-84` | shadcn HSL değişkenleri; light'ta lila zemin (`264 40% 98%`), dark'ta soğuk lacivert (`222 47% 5%`) |
| Light "okunabilirlik" ezmesi | `app/globals.css:104-114` | `html:not(.dark)` özgüllüğü `:root`'tan yüksek → `:root`'taki `--foreground`, `--muted-foreground`, `--border`, `--input` light değerleri **ölü** |
| Tailwind eşlemesi | `tailwind.config.ts:22-71` | Renk, radius (`--radius`), font, 20+ keyframe, glow/glass gölgeleri |
| Çalışma zamanı tema | `lib/apply-runtime-theme.ts`, `components/providers.tsx:66-189`, `lib/theme-presets.ts` | Admin preset/custom hex → `html` ve `body` üzerine **inline** CSS değişkeni |
| Dönemsel konsept | `components/seasonal/seasonal-concept-applier.tsx:43-55` | Aynı fonksiyonu ayrı paletle tekrar çağırıyor |
| Erişilebilirlik modları | `app/globals.css:824-875`, `lib/accessibility-prefs.ts`, `components/accessibility-class-sync.tsx` | `html.colorblind`, `.high-contrast`, `.reduce-animations` |
| Primitifler | `components/ui/*` (32 dosya, 2.348 satır) | shadcn tabanlı, yerel genişletmeler (`Card glass/hover`, `Button gradient/glass/loading`, `Badge rarity`) |
| Ortak kabuk | `app/{admin,dealer,customer}/layout.tsx`, `components/dashboard/sidebar.tsx` | Üç panelde birebir aynı kabuk (kopya-yapıştır); personel paneli ayrı kabuk (`app/staff/layout.tsx:31-60`) |
| Sayfa kahramanı | `components/admin/admin-premium-hero.tsx` → `components/layout/dashboard-page-hero.tsx` (yeniden adlandırma) | 106 dosyada kullanım |
| Belgeler | `design-system/qratex/MASTER.md`, `design-system/qratex/pages/dashboard.md`, `components/layout/DESIGN-LANGUAGE.md`, `app/admin/design-language/page.tsx` | Birbirleriyle ve kodla çelişkili (bkz. B7) |

### 2.2 Envanter metrikleri (app + components, `.tsx`)

| Metrik | Değer |
|---|---|
| Ham renk sınıfı (`text-*-NNN`) / (`bg-*-NNN`) | 1.559 / 966 |
| Token sınıfı `bg-primary` / `text-primary` | 418 / 644 |
| `success`/`warning`/`info` token kullanımı | **0** |
| Satır içi hex (`#RRGGBB`) | 827 (çoğu oyun/canvas — kabul edilebilir) |
| Marka moru literal (`139,92,246`, `262 83% 58%`, `#7c3aed/#8b5cf6/#9333ea/#a855f7/#a78bfa`) | 37 + 26 + 92 ≈ **155** |
| `text-white` / `bg-white/` | 567 / 267 |
| `dark:` varyant kullanımı | 972 |
| Keyfi yazı boyutu `text-[Npx]` | 574 (309×10px, 184×11px, 35×9px, 10×8px, 1×7px, 1×6px) |
| framer-motion içe aktaran dosya | 146 (120'si `m as Motion`, 5'i hâlâ `motion`) |
| `repeat: Infinity` | 89 |
| `<Button>` / ham `<button>` | 965 / 158 |
| `<Input>` / ham `<input>` | 374 / 19 |
| `<Select>` / ham `<select>` | 93 / 18 (13 dosya) |
| `EmptyState` kullanan dosya | **4** (hepsi `components/team/`) |
| Ad-hoc boş durum bloğu (`text-center py-8..16`) | 78 |
| `Loader2 … animate-spin` | 207 (120 dosya) |
| `Skeleton` / `InlineLoadingStatus` kullanan dosya | 31 / 30 |
| Native `confirm()` / `AlertDialog` kullanan dosya | 14 çağrı / 2 dosya |
| Sayfa kahramanı benimsenmesi (`page.tsx` bazında) | admin 52/73 · bayi 22/43 · müşteri 17/58 · personel 0/2 |

### 2.3 Panel bazında renk/efekt yoğunluğu

| Panel | Satır | Ham renk | Token | Gradient | backdrop-blur | text-white |
|---|---|---|---|---|---|---|
| admin | 30.915 | 1.102 | 2.237 | 97 (3.1/1k) | 108 | 133 |
| bayi | 19.585 | 759 | 1.472 | 40 (2.0/1k) | 82 | 36 |
| müşteri | 16.741 | 793 | 1.357 | 128 (**7.6/1k**) | 74 | 68 |

Müşteri paneli, bayinin ~4 katı gradient yoğunluğuyla bilinçli olarak "oyunlaştırılmış" bir dilde; ancak bu ayrım **belgelenmiş bir kural değil**, dağınık bir sonuç.

### 2.4 Güçlü yanlar (korunmalı)

- Tek ikon kütüphanesi: lucide-react (263 dosya; heroicons/react-icons/radix-icons = 0).
- Ortak kabuk + token'lı sidebar (`components/dashboard/sidebar.tsx:610,663` — `bg-accent`, `text-muted-foreground`).
- Global `:focus-visible` halkası (`app/globals.css:131-133`), primitiflerde 44px dokunma hedefi (`button.tsx:28`, `input.tsx:23`).
- `Input` `aria-invalid` + `aria-describedby` desteği (`components/ui/input.tsx:13-21`), `InlineLoadingStatus` `role="status"` (`inline-loading-status.tsx:29-32`).
- `MotionConfig reducedMotion="user"` + global `LazyMotion` (`components/providers.tsx:232-245`).
- Grafik paleti tek kaynaktan (`lib/chart-palette.ts`, `CHART_BRAND = hsl(var(--primary))`).

---

## 3. Bulgular (önem sırasıyla)

Önem: **Kritik** = kullanıcıya görünür bozukluk/erişilebilirlik ihlali, geniş etki · **Yüksek** = sistemik tutarsızlık, ürün kalitesini doğrudan düşürür · **Orta** = borç, ölçeklenmeyi engeller · **Düşük** = cila.
Efor: **S** ≤ 1 gün · **M** 2–4 gün · **L** 1–2 hafta · **XL** > 2 hafta.

---

### K1 — `.animate-in` çakışması tüm Radix overlay açılış animasyonlarını eziyor · **Kritik** · Efor S

**Kanıt**
- `app/globals.css:603-605` → `@layer utilities { .animate-in { animation: fade-in 0.5s ease-out forwards; } }`
- `node_modules/tailwindcss-animate/index.js:14-21` → aynı adla `.animate-in { animation-name: enter; animation-duration: …; --tw-enter-*: initial }`
- `node_modules/tailwindcss/lib/lib/setupContextUtils.js:786-793` → `@layer` eklentileri (CSS'teki özel sınıflar) kullanıcı eklentilerinden **sonra** kaydediliyor; varyantlarla da üretiliyor.
- Derlenmiş çıktı (`.next/static/css/b62679f663e00d03.css`):
  ```
  .data-\[state\=open\]\:animate-in[data-state=open]{animation-name:enter;animation-duration:.15s;…}
  .data-\[state\=open\]\:animate-in[data-state=open]{animation:fade-in .5s ease-out forwards}
  ```
- Etkilenen primitifler: `components/ui/dialog.tsx:20,38`, `sheet.tsx:20,30`, `alert-dialog.tsx`, `dropdown-menu.tsx:43,61`, `select.tsx:81`, `popover.tsx`.
- Bilinçli bağımlılık: `components/admin/admin-premium-hero.tsx:6,126` çıplak `animate-in` sınıfını bu global tanıma güvenerek kullanıyor.

**Sorun**
`animation` kısaltması, `animation-name: enter` değerini ve `zoom-in-95`, `slide-in-from-right`, `slide-in-from-top-2` gibi değişkenleri boşa çıkarıyor. Sonuç: Dialog zoom yapmıyor; Sheet sağdan kaymak yerine aşağıdan 10px fade ile açılıp **sağa kayarak kapanıyor** (kapanış `animate-out` etkilenmiyor) — asimetrik; dropdown/select menüleri yönlerinden bağımsız aynı 0.5 sn fade ile geliyor (shadcn varsayılanı 150 ms). Menüler için 0.5 sn, ürünü "ağır" hissettiren en sık temas noktası.

**Öneri**
- Global sınıfı `qx-enter` (veya `qx-fade-up`) olarak yeniden adlandırın; `AdminPremiumHero` (`admin-premium-hero.tsx:126`) ve olası diğer çıplak `animate-in` kullanımlarını (5 eşleşme) güncelleyin. `animate-in-slow` ve `delay-100…500` gibi Tailwind/eklenti adlarıyla çakışan diğer özel yardımcıları da (`globals.css:607-630`) `qx-` önekiyle ayırın.
- Kural: **Projeye özel yardımcılar Tailwind veya eklenti ad alanıyla asla çakışmaz; hepsi `qx-` önekli.** Bunu bir stylelint kuralıyla (`selector-class-pattern`) zorlayın.
- Doğrulama: Playwright ile Dialog/Sheet/Dropdown açılışının ilk 3 karesini light/dark ekran görüntüsüyle kayda alın (görsel regresyon tabanı).

---

### K2 — Karanlık modda `--destructive` metin olarak okunmuyor (1.93:1) · **Kritik** · Efor S–M

**Kanıt**
- `app/globals.css:66` → `.dark { --destructive: 0 62% 30%; }` (shadcn'in "dolgu" amaçlı koyu kırmızısı).
- Hesaplanan kontrast: `text-destructive` dark zemin üzerinde **1.93:1**, kart üzerinde **1.84:1** (AA metin için 4.5:1 gerekir).
- 99 `text-destructive` kullanımı; aynı satırda `dark:text-*` override **0**. Örnekler: `app/(auth)/auth/login/page.tsx:419,461`, `app/(auth)/auth/register/page.tsx:334,359`, `app/(auth)/auth/complete/page.tsx:121` (form hata mesajları, `role="alert"`).
- `Alert` destructive varyantı da aynı token'ı metin olarak kullanıyor: `components/ui/alert.tsx:12`.
- Aynı yapısal sorunun hafif hâli: dark'ta `text-primary` = **3.49:1** (644 kullanım; küçük metin için AA altı).

**Sorun**
Tek token hem **dolgu** (buton arka planı) hem **metin** rengi olarak kullanılıyor. Dolgu için koyu kırmızı doğru; metin için yanlış. Kullanıcı karanlık modda giriş/kayıt hatasını göremiyor — doğrudan dönüşüm kaybı ve WCAG 1.4.3 ihlali.

**Öneri**
- Durum renklerini **rol bazlı** token'lara ayırın: `--danger` (dolgu), `--danger-fg` (dolgu üstü metin), `--danger-text` (zemin üstü metin, ≥4.5:1), `--danger-subtle` (açık arka plan), `--danger-border`. Aynısını `brand`, `success`, `warning`, `info` için yapın (bkz. Bölüm 4.1).
- Tailwind'de `text-danger` → `--danger-text`, `bg-danger` → `--danger` eşlensin; böylece geliştirici yanlış rolü seçemez.
- Hızlı yama (Faz 0): dark'ta `--destructive`'i `0 72% 51%` civarına çekip buton dolgusunu `bg-destructive/90` ile koruyun **veya** geçici `.dark .text-destructive { color: hsl(0 85% 68%) }` ekleyin; kalıcı çözüm rol ayrımı.
- CI'da token çiftleri için otomatik kontrast testi (aşağıda 4.6).

---

### Y1 — Token kaynağı 5 katmanlı; çalışma zamanı tema motoru çok yazarlı ve çatışmalı · **Yüksek** · Efor L

**Kanıt**
- Katmanlar: `globals.css:9-45` (`:root`) → `globals.css:104-114` (`html:not(.dark)`, `:root` light değerlerini ezer) → `globals.css:50-84` (`.dark`) → `lib/apply-runtime-theme.ts:16` inline `style.setProperty` (`html` **ve** `body` üzerine, `:20-25`) → `components/seasonal/seasonal-concept-applier.tsx:49-53`.
- **Yazar çatışması:** `SeasonalConceptApplier` `applyRuntimeThemeToRoot`'u yalnızca `primary/secondary/accent` ile çağırıyor; fonksiyonun `else` dalları (`apply-runtime-theme.ts:96-107,117-123`) `--background`, `--card`, `--border`, `--foreground` vb. değişkenleri **siliyor** → admin preset'inin zemin/metin renkleri dönemsel konsept yüklendiğinde kaybolur. Tersine, kullanıcı light/dark değiştirdiğinde `ThemeColorsProvider` (`providers.tsx:138-182`, `resolvedTheme` bağımlılığı) yeniden yazar ve dönemsel palet kaybolur. Dönemsel uygulayıcı mod-duyarlı `…Light` preset çözümlemesi de yapmıyor (`providers.tsx:53-63`'teki mantık orada yok).
- **Kart = zemin:** `apply-runtime-theme.ts:89-91` → preset `background` verildiğinde `--card` ve `--popover` zeminle aynı olur; varsayılan `purple` preset'i dark'ta `#0A0A0B` zemin/kart (`lib/theme-presets.ts:84`) → kartların zeminden ayrışması yalnızca kenarlığa kalır. (`activeTheme`'in canlı DB'de hangi değerde olduğu **doğrulanmadı** — DB'ye dokunulmadı.)
- **Kontrast hesabı yok:** `apply-runtime-theme.ts:47` → `--primary-foreground` her zaman beyaz. Preset'lerde beyaz-üstü kontrast: `royalGold #D4AF37` **2.10:1**, `forestNight #10B981` 2.54, `obsidian #60A5FA` 2.54, `arctic #0EA5E9` 2.77, `royalGoldLight` 2.94 → bu temalarda tüm birincil butonların metni AA altı.
- `--accent-foreground` vurgu renginin parlaklığına değil **moda** göre seçiliyor (`apply-runtime-theme.ts:26-28,75-78`).
- Glass kart varyantı token dışı: `components/ui/card.tsx:19-20` (`bg-white/85`, `dark:bg-white/[0.06]`) → renkli preset zeminlerde beyaz kalır.

**Sorun**
Tema "bir değişken setini boyamak" olarak modellenmiş; öncelik sırası, türetilmiş renkler ve kontrast garantisi yok. Her yeni yazar (preset, kampanya, a11y) diğerlerini bozabiliyor. Sonuç: aynı uygulama farklı oturumlarda farklı ve bazen okunmaz görünüyor.

**Öneri** — tek **ThemeController**:
- Girdiler sabit öncelikle birleştirilir: `base(mode) < adminPreset(mode) < seasonalOverlay(mode, tarih aralığı) < a11y(highContrast, colorblind)`. Her katman yalnızca **tohum** renk verir (brand, secondary, accent, opsiyonel neutral-tint); türetilmiş değişkenler (surface-1/2, border, fg, `*-text`) fonksiyonla hesaplanır (OKLCH tabanlı açıklık ayarı, `fg` için APCA/WCAG kontrast seçimi).
- Hesaplanmış tema **sunucuda** `<style id="qx-theme">:root{…}.dark{…}</style>` olarak layout'a basılır (zaten `getPublicThemeSettings()` SSR'da okunuyor, `app/layout.tsx:147`); istemci inline stil yazmaz, yalnızca önizlemede `<style>` içeriğini değiştirir. Böylece FOUC, `html`/`body` çift yazımı ve mod değişiminde yeniden boyama ortadan kalkar.
- Preset kaydı sırasında (admin `/admin/themes`) kontrast doğrulaması: brand-fg ≥ 4.5:1 değilse otomatik koyu metin seçilir ve admin'e uyarı gösterilir.
- `Card glass` varyantı `--surface-glass` token'ına bağlanır.

---

### Y2 — Semantik durum token'ları tanımlı ama hiç kullanılmıyor; durum dili ham paletle kuruluyor · **Yüksek** · Efor L

**Kanıt**
- Tanım: `globals.css:32-37,71-76`; Tailwind eşlemesi `tailwind.config.ts:60-71`. Kullanım: `text-success|bg-success|text-warning|bg-warning|*-info` = **0**.
- Durum ailesi dağılımı: başarı = `emerald` (548) + `green` (128); uyarı = `amber` (584) + `yellow` (184) + `orange` (122); hata = `red` (341) + `rose` (32); bilgi = `blue` (225) + `sky` (52).
- Primitif bile ham palet kullanıyor: `components/ui/badge.tsx:18,20,22` (`text-green-500`, `text-yellow-500`, `text-blue-500`). Açık zemin üzerinde `yellow-500` **1.92:1**, `green-500` 2.28:1.
- Açık modda AA altı metin/ikon adayları: `text-emerald-500` 158, `text-amber-500` 119, `text-yellow-500` 102, `text-green-500` 40 kullanım (bir kısmı ikon; ikonlar için 3:1 eşiği de çoğunda tutmuyor).
- **Renk körü modu kapsamı dar:** `globals.css:862-875` yalnızca `text-red-500/600`, `text-green-500/600`, `text-emerald-500/600`, `text-destructive`'i eşliyor. `dark:text-emerald-400` (ve benzeri 214 dark durum sınıfı), tüm `bg-*`, `border-*`, `amber/yellow` aileleri kapsam dışı → karanlık modda renk körü modu fiilen çalışmıyor.

**Sorun**
Aynı anlam (ör. "olumlu") ekrandan ekrana farklı tonla gösteriliyor; tema ve erişilebilirlik modları ham palete erişemediği için sistem genelinde uygulanamıyor. Token'lar "var" ama sistem değil.

**Öneri**
- Bölüm 4.1'deki rol bazlı durum token'larını tanımlayın; `StatusBadge`, `StatusText`, `StatusIcon`, `IconChip tone="success|warning|danger|info|brand|neutral"` bileşenleriyle **anlamı** API'ye taşıyın; sayfalar renk değil `tone` seçsin.
- Codemod (jscodeshift/ts-morph + regex) ile `text-(emerald|green)-(500|600)( dark:text-…-400)?` → `text-success`, `text-(amber|yellow)-(500|600)` → `text-warning`, `text-(red|rose)-(500|600)` → `text-danger` dönüşümü; dekoratif/oyun kullanımları (`components/customer/games/**`, `ui/backgrounds/**`) hariç tutulur.
- Renk körü ve yüksek kontrast modları artık **yalnızca token'ları** yeniden tanımlar; `!important` sınıf avcılığı (`globals.css:862-875`) silinir.
- ESLint/özel kural: `app/(admin|dealer|customer)/**` içinde durum ailesi ham renk sınıfları uyarı verir.

---

### Y3 — Panel `loading.tsx` iskeleti kabuğu ikinci kez çiziyor · **Yüksek** · Efor S

**Kanıt**
- `app/admin/loading.tsx:1`, `app/dealer/loading.tsx:1`, `app/customer/loading.tsx:1` → `components/dashboard/dashboard-route-loading.tsx`'i dışa aktarır.
- Bu bileşen tam ekran kabuk çiziyor: `min-h-dvh`, `lg:w-72` sahte sidebar, sahte yapışkan başlık (`dashboard-route-loading.tsx:20-29`).
- Next.js App Router'da segmentin `loading.tsx`'i aynı segmentin `layout.tsx`'inin **içine** (sayfanın Suspense sınırına) yerleşir; layout zaten gerçek `Sidebar` + `DashboardHeader` + `<main>` çiziyor (`app/customer/layout.tsx:32-44`).
- Karşılaştırma: `app/admin/users/loading.tsx`, `app/admin/audit/loading.tsx`, `app/dealer/ai-insights/loading.tsx` doğru biçimde yalnızca içerik iskeleti çiziyor.

**Sorun**
Panel içi her gezinmede (alt segmentin kendi `loading.tsx`'i yoksa — ki çoğunda yok) masaüstünde gerçek sidebar'ın yanında ikinci bir sahte sidebar ve `<main>` içinde ikinci bir başlık şeridi görünür; düzen sıçraması (CLS) ve "uygulama titriyor" algısı. (Kaynak koddan ve Next.js semantiğinden doğrulandı; tarayıcıda gözle doğrulanmadı.)

**Öneri**
- `DashboardRouteLoading`'i yalnızca **içerik** iskeletine indirin: hero şeridi + 3'lü stat ızgarası + liste. Kabuk iskeleti yalnızca kök (`app/loading.tsx`) veya kimlik doğrulama geçişleri için ayrı bir `ShellSkeleton` olarak kalsın.
- Sayfa tipine göre 4 hazır iskelet preseti (`DashboardSkeleton`, `ListPageSkeleton`, `DetailSkeleton`, `FormSkeleton`) — `components/dashboard/dashboard-skeletons.tsx` (şu an 1 kullanıcı) bunun çekirdeği olabilir.

---

### Y4 — Uygulama içi "Animasyonları azalt" framer-motion'a ulaşmıyor; a11y sınıfları geç uygulanıyor · **Yüksek** · Efor S–M

**Kanıt**
- Ayar yalnızca `html.reduce-animations` sınıfı ekliyor (`lib/accessibility-prefs.ts:18-22,46-55`); CSS tarafı `globals.css:825-832`.
- Framer: `components/providers.tsx:232` → `MotionConfig reducedMotion="user"` yalnızca **işletim sistemi** tercihini okur. 146 framer dosyası, 89 `repeat: Infinity` (ör. `components/customer/floating-orbs.tsx:26-35`, `components/customer/glow-card.tsx:37-39`) uygulama ayarından etkilenmiyor. Yalnızca 3 oyun/3B bileşeni sınıfı elle kontrol ediyor (`components/customer/games/boss-3d.tsx:33`, `data-snake-game.tsx:31`).
- `components/accessibility-class-sync.tsx:8-10` yorumu "layout'taki init script de aynı sınıfları erkenden ekler" diyor; `app/layout.tsx:19-32` init betiği **yalnızca tema** sınıfını ekliyor → yorum yanlış; yüksek kontrast/renk körü kullanıcıları ilk boyamada normal paleti görüp hidrasyondan sonra geçiş yaşar.
- Ayrıca `MotionConfig reducedMotion="user"` transform'u kapatır ama opaklık döngülerini sürdürür; sonsuz opaklık/blur döngüleri (FloatingOrbs `filter: blur(40px)` + opacity) pil/GPU maliyeti taşımaya devam eder.

**Öneri**
- `useMotionPolicy()` kancası: `prefers-reduced-motion` **veya** uygulama ayarı → `MotionConfig reducedMotion={policy === 'reduce' ? 'always' : 'user'}`; ayar değişince `qratex:a11y-changed` olayıyla canlı güncellensin.
- Dekoratif sonsuz animasyonlar için tek sarmalayıcı `<Ambient>`: politika "reduce" ise hiç render etmez; görünürlük dışında (`IntersectionObserver`) ve `document.hidden` iken durur.
- Layout init betiğine `qratex-a11y` localStorage okumasını ekleyin (tema betiğiyle aynı desen).

---

### Y5 — Üç çelişkili "tek kaynak" belge; `/admin/design-language` canlı değil · **Yüksek** · Efor M

**Kanıt**
- `design-system/qratex/MASTER.md`: birincil `#0F172A`, CTA `#0369A1` (mavi), "Plus Jakarta Sans", "Style: Flat Design … No gradients/shadows", "❌ Excessive animation". Ürün: mor marka, Inter, glass/glow/gradient ağırlıklı. Dosyanın üst notu bile "product keeps Inter" diyerek kendiyle çelişiyor. `pages/dashboard.md` "Max Width 1200px" diyor; kabukta böyle bir sınır yok.
- `components/layout/DESIGN-LANGUAGE.md`: kuralların ardından "Uygulama durumu" adı altında uzun bir değişiklik günlüğü; ölçülebilir kural (token listesi, bileşen API'si, yasak listesi) yok.
- `app/admin/design-language/page.tsx:14-77`: dört statik metin kartı + repo dosya yolu. Canlı token paleti, bileşen örneği, kontrast tablosu, motion örneği **yok**. Sayfanın kendisi `cyan`, `violet`, `emerald`, `amber` vurgu şeritleriyle (`lib/panel-surface.ts:7-13`) kendi "token dışı palet kullanmayın" kuralını ihlal ediyor.
- `lib/brand-colors.ts:8-10`: `BRAND_PRIMARY_HEX = '#9333ea'` ve yorum "≈ hsl(262 83% 58%)". Gerçekte `#9333ea` = purple-600 (hue ≈ 271); `262 83% 58%` = `#7c3aed` (violet-600) ve bu değer `BRAND_PRIMARY_HEX_DEEP` olarak duruyor. E-posta, PWA, `purple` preset (`lib/theme-presets.ts:10,31`) bu yanlış hex'i kullanıyor → **varsayılan preset uygulandığında marka rengi CSS'teki marka renginden farklı.**
- `VIEWPORT_THEME_COLOR_LIGHT '#fafafa'` / `DARK '#0b1220'` (`brand-colors.ts:38-39`) ile `--background` (`#f9f8fd` lila / `#070b13`) eşleşmiyor (tarayıcı çubuğu ile sayfa arasında ton farkı).

**Öneri**
- `design-system/qratex/MASTER.md` ve `pages/dashboard.md`'yi **arşivleyin** (ürünü temsil etmiyor; yeni geliştirici/AI ajanı yanlış yönlenir — dosyanın "strictly follow" talimatı tehlikeli).
- Tek kaynak: `design-system/tokens.ts` (tohumlar + rol token'ları) → `globals.css` ve `brand-colors.ts` bu dosyadan **üretilir** (küçük bir build-time betiği veya TS sabitleri + CSS değişken jeneratörü). Hex'ler elle senkron tutulmaz.
- `/admin/design-language` → **yaşayan stil rehberi**: gerçek `components/ui` bileşenlerini tüm varyant × light/dark × aktif preset ile render eder; token tablosu (değer + kontrast skoru), motion presetlerini oynatan önizleme, "Yap / Yapma" örnekleri, benimsenme metrikleri (bu rapordaki sayılar, CI'da üretilen JSON'dan). `DESIGN-LANGUAGE.md` kısa kural belgesine indirilir; günlük kısmı `CHANGELOG`'a taşınır.

---

### Y6 — Sayfa başlığı ve sayfa iskeleti üç panelde parçalı · **Yüksek** · Efor L

**Kanıt**
- Üç ayrı başlık bileşeni: `DashboardPageHero`/`AdminPremiumHero` (106 dosya), `PageHeader` (`components/dashboard/page-header.tsx`, 10 dosya, sadece hero'yu sarıyor ve varsayılan eyebrow'u Türkçe sabit `'Yönetim paneli'` — bayi/müşteri sayfasında unutulursa yanlış bağlam), `DashboardPageHeading` (`components/dashboard/page-heading.tsx:18-21`, 34 dosya, **mobilde `hidden`** → mobilde başlık yok).
- Hero'suz sayfalar (dizin bazında): bayi `action-items`, `ai-chat`, `business-outcomes`, `campaigns`, `consumptions`, `incidents`, `innovation`, `radar`, `remedy-queue`, `reviews`, `surveys(+create, results)`…; müşteri `analytics`, `experiences`, `favorites`, `lounge`, `shop`, `squads`, `consumptions/[id]`, 20 oyun sayfası; admin `ekip`, `games`, `gamification-settings`, `menu-groups`, `squads/battles`.
- `admin-premium-hero.tsx` dosya adı ve dışa aktarım adı "Admin…" iken üç panelin ortak bileşeni; `dashboard-page-hero.tsx` yalnızca yeniden adlandırma köprüsü.
- Hero dönüşümünden kalan aksiyon stilleri: `bg-white text-emerald-900` butonlar (11 kopya; ör. `app/admin/ab-testing/page.tsx:101`, `app/admin/ai-dashboard/page.tsx:269`, `app/admin/ai-detailed/page.tsx:106`) artık açık temada açık kart üzerinde beyaz-üstü-beyaz; "hero üstü outline" sınıf dizisi 30 kez kopyalanmış (`dark:border-white/35 dark:bg-white/10 dark:text-white`).

**Öneri**
- Tek `PageHeader` API'si: `variant="hero" | "compact"`, `eyebrow` panel bağlamından **otomatik** (layout'tan React context: `PanelContext { role, label }`), `title`, `description`, `icon`, `actions`, `meta` (chip'ler), `aside`. Mobilde compact varyant her zaman görünür.
- `Button` için `surface="hero"` (veya `variant="on-hero"`) — hero kabının tonunu context'ten okuyup doğru outline/solid stilini seçer; 30+11 kopya silinir.
- Bileşeni `components/layout/page-header/` altına taşıyın, "Admin…" adlandırmasını kaldırın.
- Ortak iskelet: `PanelPage` (`PageHeader` + `PageToolbar` + `PageBody` + standart dikey ritim `space-y-6 lg:space-y-8`) — sayfa düzeni kuralı koda gömülür.

---

### O1 — Marka rengi ~155 yerde sabit kodlanmış; tema preset'lerini izlemiyor · **Orta** · Efor M

**Kanıt**
- `rgba(139, 92, 246, …)` 37, `262 83% 58%` 26, mor hex literal 92 kullanım.
- Örnekler: `components/customer/glow-card.tsx:19,36` (varsayılan glow ve konik gradient), `components/customer/floating-orbs.tsx:6`, `tailwind.config.ts:121-122,166-171` (`glow-pulse`, `shadow-glow`, `shadow-glass` = `rgba(31,38,135)`), `globals.css:297-299,313-328,343-367,400-403,458,684-687` (`.gradient-primary-soft`, `.gradient-mesh`, `.glow*`, `.text-gradient`, `.btn-primary:hover`, `pulse-glow`).
- `components/ui/empty-state.tsx:24` `to-fuchsia-500/10`; `admin-premium-hero.tsx:30` `rgba(34,211,238,0.12)` (cyan sabit).

**Sorun**
Admin "Yeşil" veya "Royal Gold" preset seçtiğinde parıltılar, kenar gradyanları, yörüngeler mor kalır; marka iki renkli görünür.

**Öneri**
Tüm efektler `hsl(var(--brand) / α)` ve `hsl(var(--brand-2) / α)` üzerinden; Tailwind'de `shadow-glow` → `0 0 20px hsl(var(--brand) / .35)`. Codemod ile literal → değişken; oyun/karakter rozeti gibi **kimlik rengi** taşıyan yüzeyler (bkz. `character-badge-system`: kategori rengi = kimlik) bilinçli istisna olarak `--category-*` token'larına alınır.

---

### O2 — Motion dili tanımsız: süre, easing, ofset, stagger ve hover ölçeği rastgele · **Orta** · Efor M

**Kanıt**
- Süreler: `duration: 1` (28), `0.5` (19), `1.5` (17), `2` (16), `0.7` (14), `0.4` (12), `0.6` (10), `0.2` (10), `0.8` (9) … toplam 25+ farklı değer.
- Easing: `'easeInOut'` 31, `'linear'` 25, `'easeOut'` 19, üç farklı cubic-bezier (`[0.22,1,0.36,1]`, `[0.2,0.8,0.2,1]`, `[0.25,0.8,0.25,1]`). Spring: `stiffness` 100–500 arası 10 değer, `damping` 16–34 arası 10 değer.
- Giriş ofseti `initial={{ opacity: 0, y: N }}`: 20 (114), 10 (71), 8 (53), 12 (39), 16 (14), 18, 30, 4, -8, 6.
- Stagger: `delay: index * 0.1` (17), `i * 0.1` (7), `i * 0.5` (2) — **üst sınırsız**; 40 öğeli bir listede son öğe 4 sn gecikir.
- `whileHover` ölçeği: 1.01, 1.02 (14), 1.03, 1.05 (9), 1.06, 1.08, 1.1 (3), 1.15, 1.2.
- CSS tarafı: Tailwind `float` (-20px, `tailwind.config.ts:124-127`) ile `globals.css:691-698` (-10px) aynı adla çakışıyor, derlenmiş CSS'te tek `@keyframes float` (-10px) kalıyor → `animate-float` yapılandırmadaki değeri kullanmıyor. `shimmer` de iki yerde farklı tanımlı (`tailwind.config.ts:98-100` vs `globals.css:652-659`).
- Global `body { transition: background-color .3s }` (`globals.css:100`) ile next-themes `disableTransitionOnChange` (`providers.tsx:229`) amaç olarak çelişiyor.
- `lib/` altında motion preset dosyası **yok**.

**Öneri** — `lib/motion.ts` (tek kaynak) ve CSS eşleniği `--motion-*` değişkenleri:

| Token | Değer | Kullanım |
|---|---|---|
| `duration.instant` | 100 ms | basma geri bildirimi, toggle |
| `duration.fast` | 150 ms | menü, tooltip, popover |
| `duration.base` | 220 ms | dialog, sheet, kart girişi |
| `duration.slow` | 320 ms | sayfa bölümü girişi, hero |
| `duration.celebrate` | 600–1200 ms | yalnızca ödül/rozet/oyun anları |
| `ease.standard` | `[0.2, 0, 0, 1]` | genel |
| `ease.emphasized` | `[0.22, 1, 0.36, 1]` | giriş |
| `ease.exit` | `[0.4, 0, 1, 1]` | çıkış |
| `spring.snappy` | `{ stiffness: 400, damping: 30 }` | sürükle/bırak, toggle |
| `spring.gentle` | `{ stiffness: 200, damping: 24 }` | kart/sayaç |

Presetler: `fadeUp` (y: 8), `fadeIn`, `scaleIn` (0.96), `listStagger` (`staggerChildren: 0.04`, ilk 8 öğeden sonra gecikme yok), `hoverLift` (y: -2, scale yok — düzen kaymasını önler), `press` (scale 0.98). Kural: operasyon panellerinde (admin/bayi/personel) `celebrate` ve sonsuz döngü yasak; müşteri oyun/ödül yüzeylerinde `<Ambient>` sarmalayıcı ile serbest. Kalan 5 `motion` içe aktarımı (`app/dealer/campaigns/page.tsx`, `app/dealer/surveys/page.tsx`, `app/dealer/surveys/create/page.tsx`, `components/team/team-board.tsx`, `components/customer/games/truth-vs-fake-game.tsx`) `m as Motion`'a çevrilir ve `LazyMotion strict` açılır (bundle garantisi).

---

### O3 — Primitif sapmaları: radius, Card varsayılanları, Button loading, Badge, glass varyantı · **Orta** · Efor M

**Kanıt**
- **Radius ölçeği belirsiz:** `--radius: 0.75rem` → `rounded-lg` = 12px; Tailwind varsayılanı `rounded-xl` = 12px → **lg ile xl aynı**. `Card` `rounded-xl` (`card.tsx:15`) `--radius`'a bağlı değil; `Input` `rounded-lg` (`input.tsx:23`), `Textarea` ve `SelectTrigger` `rounded-md` (`textarea.tsx:11`, `select.tsx:19`), `Button sm` `rounded-md` (`button.tsx:29`). Kullanım: `rounded-full` 693, `rounded-xl` 654, `rounded-lg` 434, `rounded-2xl` 324, `rounded-md` 128, keyfi 41. `<Card className>` içinde 56 radius override (43×`rounded-2xl`).
- **Card varsayılanı `h-full flex flex-col`** (`card.tsx:15`): tek başına kullanılan kartlarda ebeveyn yüksekliğine gerilme; geliştiriciler override etmek zorunda.
- **CardTitle `text-2xl`** (`card.tsx:45`): uygulamadaki kart başlıklarının neredeyse hepsi `text-base/lg` ile eziliyor (ör. `app/admin/design-language/page.tsx:36`).
- **Button `loading`** (`button.tsx:59-81`): çocukları "Yükleniyor" metniyle değiştiriyor → buton genişliği zıplar, eylem bağlamı kaybolur (ör. "Sil" → "Yükleniyor").
- **Button `glass`** (`button.tsx:24-25`): `bg-white/10 text-white` açık temada görünmez; bunu telafi etmek için `globals.css:220-236` öznitelik seçicili `!important` "güvenlik ağı" eklenmiş (`[class*='bg-white/15'][class*='text-white']`) — sınıf adına göre stil yamamak, sistem eksikliğinin belirtisi.
- **Badge** `<div>` (`badge.tsx:45-47`): paragraf içinde geçersiz HTML; `legendary` varyantı sarı rozete mor `glow-pulse` uyguluyor (`badge.tsx:28` + `tailwind.config.ts:120-123`).
- Input `error` prop'u **0** kullanımda; form hataları 23+ yerde elle `text-sm text-destructive` paragrafı. `components/ui/form.tsx` yok; `react-hook-form` yalnızca 2 dosyada.
- Ham form öğeleri: 18 `<select>` (13 dosya, `h-9`/`h-10` — primitif `h-11`), 11 `<textarea>`, 19 `<input>`, 158 `<button>`; 14 native `confirm()` (ör. `app/admin/api-keys/page.tsx:66`, `app/admin/coupons/page.tsx:84`, `app/admin/ai-learning/page.tsx:105,223`) karşısında `AlertDialog` 2 dosya.

**Öneri**
- Radius token'ları: `--radius-sm 8px`, `--radius-md 12px` (kontroller: input/select/textarea/button), `--radius-lg 16px` (kart), `--radius-xl 24px` (hero/sheet), `full`. Tailwind `borderRadius`'u bu dört değere bağlayın; `rounded-xl/2xl/3xl` kullanımını codemod ile eşleyin.
- `Card`: `h-full` ve `flex-col`'u kaldırıp `stretch` prop'una alın; `CardTitle` varsayılanı `text-base font-semibold`.
- `Button loading`: etiketi korur, solda spinner gösterir, genişliği sabitler (`aria-busy`, görünmez etiketle genişlik rezervi).
- `glass` varyantını kaldırıp `on-hero`/`on-media` varyantına dönüştürün; `globals.css:220-236` güvenlik ağı silinir.
- `Badge` → `<span>`; rarity varyantları `RarityBadge`'e ayrılır, glow kendi renginden türetilir.
- shadcn `Form` (`FormField`, `FormLabel`, `FormMessage` → `Input error/errorId` otomatik bağlanır) eklenir; `useConfirm()` kancası + `ConfirmDialog` ile tüm `confirm()` çağrıları değiştirilir (ayrıca PWA standalone modda native confirm görünümü platforma göre bozuluyor).

---

### O4 — Boş / yükleniyor / hata durumları standardize değil · **Orta** · Efor M

**Kanıt**
- `EmptyState` (`components/ui/empty-state.tsx`) yalnızca 4 dosyada (hepsi `components/team/`); 78 satır içi "boş" bloğu (`text-center py-8..16`).
- Yükleme: 207 `Loader2 animate-spin`, 31 dosyada `Skeleton`, 30 dosyada `InlineLoadingStatus`; aynı türden ekranlar (liste) farklı stratejilerle yükleniyor. Kök `app/loading.tsx` tam ekran overlay + çift spinner (dönen halka + `Loader2 animate-pulse`) + sabit Türkçe metin (`app/loading.tsx:22-30`).
- Hata sınırları: `app/admin/error.tsx:36-38` `h-12` ikon + `<h1 text-2xl>` + sabit Türkçe; `app/customer/error.tsx`, `app/dealer/error.tsx:73-77` `h-10` + `<h2 text-lg>` + i18n; `app/staff/error.tsx:33` sabit Türkçe. Hepsi panel layout'unun `<main id="dashboard-main">`'i içinde **ikinci bir `<main>`** açıyor (`app/customer/error.tsx:30`, `app/admin/error.tsx:30`, `app/dealer/error.tsx:61`) → iç içe `main` landmark (erişilebilirlik ağacında belirsizlik).
- Sayfa düzeyi `error.tsx` yok; bir widget hatası tüm paneli hata ekranına düşürür. Bölüm düzeyinde `ErrorState`/yeniden dene bileşeni yok (yalnızca `components/customer/character-reveal.tsx:437` yerel `ErrorState`).
- Toast tek kütüphane (sonner, 29 dosya) — iyi; ancak `components/ui/toaster.tsx:28` toast arka planı `bg-background` (kartla ayrışmıyor) ve başarı/hata tonları token'lı değil.

**Öneri**
- **Durum üçlüsü** bileşen ailesi: `EmptyState` (variant: `first-use` | `no-results` | `filtered` | `permission`; birincil/ikincil aksiyon), `ErrorState` (variant: `section` | `page`; `onRetry`, Sentry `digest` gösterimi), `LoadingState` (preset iskeletler). Hepsi aynı ikon halkası, aynı tipografi, aynı dikey ritim.
- `QueryBoundary` sarmalayıcı: TanStack Query sonucunu (`isLoading`, `isError`, `data.length===0`) alıp üçlüyü otomatik seçer; sayfalar yalnızca `empty`/`error` metnini verir.
- Hata sınırlarını tek `PanelErrorBoundary` bileşeninde birleştirin (rol context'ten), `<main>` yerine `<section role="alert">`.

---

### O5 — Kopyala-yapıştır yüzey kalıpları ve yerel kart çeşitleri · **Orta** · Efor M

**Kanıt**
- `PREMIUM_PANEL_CARD_BASE` (`lib/panel-surface.ts:4-5`) 6 dosyada import; aynı dize (`bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg`) 37 kez satır içi.
- "İkon çipi" kalıbı (`w-11 h-11 rounded-xl bg-gradient-to-br from-X-500/20 to-Y-600/10` + `text-X-600 dark:text-X-400`) 27 kopya, 9 dosya, 10 farklı renk ailesi (ör. `app/admin/admin-dashboard-client.tsx:259,296,310,394,477,564,570,571,581,626`).
- Yerel stat kartları: `components/dashboard/stats-card.tsx` (yalnız 1 kullanıcı; `:36` sabit `"son 30 gün"`), `components/customer/dashboard/customer-dashboard.tsx:66` (`any` tipli), `app/admin/inbox/page.tsx:399`, `app/admin/platform-pulse/page.tsx:39`, `app/customer/my-card/page.tsx:69`, `components/admin/admin-progress-stat-card.tsx:87`.
- Yerel ton sisteminden doğan hata: `app/admin/inbox/page.tsx:410` → `tones.split(' ').slice(-1)` dizi döndürür ve `emerald`/`fuchsia` tonlarında yalnızca `dark:text-…` sınıfı kalır → **açık temada ikon rengi yok**.
- Kullanılmayan "efekt" bileşenleri: `components/customer/glass-card.tsx`, `shimmer-card.tsx`, `tilt-card.tsx` barrel'da dışa aktarılıyor (`components/customer/index.ts`) ama hiç import edilmiyor.

**Öneri**
`StatCard` (props: `label`, `value`, `delta`, `period`, `icon`, `tone`, `href`, `loading`), `IconChip` (`tone`, `size`), `Surface` (`level=0|1|2`, `interactive`) ve `MetricGrid` bileşenleri. Altı yerel stat kartı ve 37+27 kopya bunlara taşınır; `tone` → Bölüm 4.1 rol token'ları. Ölü efekt bileşenleri silinir.

---

### O6 — `globals.css` ölü ve çift tanımlarla dolu · **Orta** · Efor S

**Kanıt** (kullanım sayıları `app/components/lib` içinde)
- Kullanılmayan sınıflar: `.btn-primary/.btn-secondary/.btn-ghost/.btn-outline` (`globals.css:447-491`), `.input-base` (`:496-507`), `.badge-common/rare/epic/legendary` (`:543-581`), `.card-hover`, `.card-interactive` (`:373-393`), `.glass-strong` (`:259-272`), `.panel-gradient-hero` (`:279-287`), `.gradient-primary`, `.gradient-primary-soft`, `.gradient-card` (`:292-337`), `.glow-lg`, `.glow-success/warning/destructive` (`:350-368`), `.text-gradient-gold` (`:407-414`), `.divider` (`:586-588`), `.qx-page-fade` (`:928-934`), `.animate-in-slow` (`:607-609`) → hepsi **0**.
- `.skeleton` (`:419-442`) 0 kullanım; `Skeleton` bileşeni kendi shimmer'ını kullanıyor.
- `.glass` 1 kullanım (`app/customer/surprise-boxes/page.tsx:233`).
- `:root` light değerleri `html:not(.dark)` tarafından ezilip ölü (bkz. 2.1).
- `--sidebar-accent` CSS'te tanımsız, yalnızca çalışma zamanında yazılıyor (`lib/apply-runtime-theme.ts:63`).

**Öneri**
Token dosyası (`styles/tokens.css`), temel katman (`styles/base.css`), yardımcılar (`styles/utilities.css`, hepsi `qx-` önekli) ve üçüncü taraf düzeltmeleri (`styles/vendor/html5-qrcode.css`) olarak bölün; ölü sınıfları silin. `:root` ve `html:not(.dark)` birleştirilip tek light tanımı kalsın.

---

### D1 — Tipografi ölçeği tanımsız; 574 keyfi alt-12px boyut; `font-mono` monospace değil · **Düşük–Orta** · Efor M

**Kanıt**
- `text-[10px]` 309, `text-[11px]` 184, `text-[9px]` 35, `text-[8px]` 10, `text-[7px]` 1, `text-[6px]` 1 (`components/dealer/dealer-radar-scope.tsx:259`). 8px örnekleri: `components/customer/character-card.tsx:433`, `components/customer/character-leaderboard.tsx:261,268`, `components/team/task-detail-sheet.tsx:451,462`.
- `h1` ölçeği 8 farklı değer (`text-base`'den `text-6xl`'e: 2xl×39, xl×21, 3xl×14, 4xl×6, lg×4, 6xl×3…).
- `app/layout.tsx:41-45` → `--font-mono` = **Space Grotesk** (orantılı yazı tipi). 132 `font-mono` kullanımı (API yolları, kodlar, ID'ler, JSON önizleme — ör. `app/admin/api-catalog/page.tsx:155`, `app/admin/ai-learning/page.tsx:398-454`) hizalı görünmüyor.
- Ağırlık: `font-bold` 667, `font-semibold` 562, `font-black` 28, `font-extrabold` 15 — başlık ağırlığı kuralı yok.
- `Inter` yalnızca `latin` alt kümesiyle preload ediliyor (`app/layout.tsx:35-39`); derlenmiş CSS'te `latin-ext` `@font-face` mevcut (`u+0100-02ba`) ama preload edilmiyor → Türkçe `ğ ş İ Ş Ğ` ilk ziyarette ayrı bir istekle geç yükleniyor (FOUT riski; büyük değil).

**Öneri**
- Tip ölçeği token'ları + `Text`/`Heading` bileşenleri: `display` 36/40, `h1` 28/34 (mobil 24), `h2` 20/28, `h3` 16/24 semibold, `body` 14/20 (mobil input 16), `small` 13/18, `caption` **12/16 (alt sınır)**, `overline` 11/16 uppercase tracking 0.08em. 9px ve altı yasak (yalnızca dekoratif SVG içinde).
- `--font-mono` → Geist Mono / JetBrains Mono (next/font); `Space Grotesk` gerekiyorsa `--font-display` olarak skor/sayaç başlıklarında.
- `subsets: ['latin', 'latin-ext']`.

---

### D2 — İkonografi: kütüphane tek ama kural yok · **Düşük** · Efor S

**Kanıt**
- lucide boyutları: `h-4` 742, `h-5` 357, `h-3` 159, `h-3.5` 126, `h-6` 66, `h-7..h-12` …; `size-*` ile `h-* w-*` karışık.
- `AdminPremiumHero` ikon rengini `[&_svg]:!text-foreground` ile zorla eziyor (`admin-premium-hero.tsx:203`), çağıran taraf `text-white` veriyor (`app/admin/ai-dashboard/page.tsx:255`) — niyet çatışması.
- 75 dosyada emoji (189 satır); bir kısmı veri ikonu (`app/admin/rewards/page.tsx:83,202,215,503` varsayılan `'🎁'`), bir kısmı arka plan adı önekleri (`app/admin/settings/settings-client.tsx:142-151`).

**Öneri**
`Icon` sarmalayıcı (`size="xs|sm|md|lg"` = 12/16/20/24, `strokeWidth` 1.75 sabit, `tone`). Emoji yalnızca kullanıcı içeriği/ödül verisi için; arayüz etiketlerinde lucide. Hero ikon rengi prop ile yönetilsin, `!important` kalksın.

---

### D3 — z-index ve katman ölçeği yok · **Düşük** · Efor S

**Kanıt** `tailwind.config.ts:11` safelist `z-[40]`, `z-[45]`, `z-[70]`, `z-[100]`; kullanımda `z-[1]`, `z-[2]`, `z-[3]`, `z-[5]`, `z-[9]`, `z-[44]`, `z-[60]` vb. Dropdown/Select `z-[100]` (`dropdown-menu.tsx:43`, `select.tsx:81`), Dialog `z-50` (`dialog.tsx:20`).

**Öneri** `zIndex` token'ları: `base 0`, `raised 10`, `sticky 20`, `header 30`, `overlay 40`, `modal 50`, `popover 60`, `toast 70`, `skip-link 100`. Safelist kalkar.

---

### D4 — Personel paneli ayrı kabuk ve sabit metin · **Düşük** · Efor S

**Kanıt** `app/staff/layout.tsx:31-60` kendi başlığı, `"· Personel"` ve `"Çıkış"` sabit Türkçe; `app/staff/error.tsx:33` sabit metin; hero kullanımı 0/2.
**Öneri** Personel yüzeyi de `PanelShell` (aşağıda) ile `variant="minimal"` olarak çalışsın; metinler i18n'e.

---

## 4. Hedef tasarım dili: **Qratex Design Language v2 (QDL)**

Amaç: "Mor, cam, parıltı" estetiğini **korurken**, onu ölçülebilir kurallara bağlamak; operasyon panellerinde sakin ve yoğun, müşteri ödül/oyun yüzeylerinde ifadeli; her temada okunur.

### 4.1 Token mimarisi (3 katman)

```
tohum (seed)          rol (semantic)                       bileşen (component)
--------------        ---------------------------------    -----------------------------
brand: #7c3aed   ─┐   --brand, --brand-fg, --brand-text,   --button-primary-bg = --brand
brand2, accent    │   --brand-subtle, --brand-border        --card-bg = --surface-1
neutral-tint      ├─► --surface-0/1/2/3, --surface-glass    --input-border = --border-strong
success/warning/  │   --text-1/2/3 (fg, muted, subtle)      --badge-success-bg = --success-subtle
danger/info seeds │   --border-subtle, --border-strong
mode (light/dark) ┘   --{success|warning|danger|info}{,-fg,-text,-subtle,-border}
                      --focus-ring, --overlay
                      --category-{1..8} (rozet/oyun kimlik renkleri)
```

- Tohumlar `design-system/tokens.ts`'te; rol değerleri **fonksiyonla türetilir** (OKLCH; `*-text` için hedef ≥ 4.5:1, `*-fg` için ≥ 4.5:1, `border-strong` için ≥ 3:1 karşı `surface-1`).
- Tailwind `colors` yalnızca rol token'larını açığa çıkarır; ham palet `app/(admin|dealer|customer|staff)` içinde lint ile uyarı.
- Dark mod: `surface-0 < surface-1 < surface-2` açıklık adımı ≥ 3 L*; kart zeminden her temada ayrışır.
- A11y modları yalnızca rol token'larını yeniden tanımlar (yüksek kontrast: border-strong, text-2 koyulaşır; renk körü: success→mavi, danger→turuncu ailesi + ikon/desen zorunlu).

### 4.2 İki ifade kaydı (register)

| | **Operasyon** (admin, bayi, personel, müşteri ayarlar/geçmiş) | **Ödül & Oyun** (müşteri dashboard, rozet, sürpriz kutu, oyunlar, lounge) |
|---|---|---|
| Yüzey | `surface-1` düz kart, ince kenarlık, gölge ≤ `elevation-1` | glass, gradient kenar, `elevation-2/3` serbest |
| Renk | rol token'ları; brand yalnızca vurgu | `--category-*`, brand gradient'leri |
| Motion | `fast/base`, sonsuz döngü yok, hover = renk/gölge | `celebrate`, spring, `<Ambient>` döngüleri (politikaya bağlı) |
| Tipografi | `h1 28`, `body 14`, tabular sayılar | `display` sayılar, `font-display` (Space Grotesk) |

Kayıt, layout'ta `data-register="ops|play"` ile işaretlenir; `play`'e özgü yardımcılar (`qx-glow`, `qx-aurora`) yalnızca `[data-register=play]` altında etkindir. Bu, müşteri panelinin bugünkü 7.6/1k gradient yoğunluğunu **meşru ve sınırlı** kılar; admin'e sızmasını engeller.

### 4.3 Ölçekler

- **Boşluk:** 4px tabanlı; sayfa dikey ritmi `section-gap` 24/32, kart iç boşluk `card-pad` 16 (mobil) / 20 / 24; Tailwind ölçeği korunur, `PanelPage`/`Card` varsayılanlarına gömülür.
- **Radius:** sm 8 · md 12 (kontroller) · lg 16 (kart) · xl 24 (hero, sheet, dialog) · full.
- **Elevation:** 0 (düz), 1 (kart: `0 1px 2px` + kenarlık), 2 (açılır menü), 3 (dialog), glow yalnızca `play`.
- **Tipografi:** 4.1'deki D1 tablosu; minimum 12px.
- **Motion:** O2 tablosu; `lib/motion.ts` + `--motion-duration-*`, `--motion-ease-*` CSS değişkenleri (tailwindcss-animate `duration`/`ease` ile eşlenir).
- **z-index:** D3 tablosu.

### 4.4 Bileşen katmanı (hedef envanter)

| Grup | Bileşenler |
|---|---|
| Kabuk | `PanelShell` (3 layout'taki kopya kabuğun tek hali, `variant=full|minimal`), `PanelContext` (rol, etiket, register) |
| Sayfa | `PanelPage`, `PageHeader` (`hero|compact`), `PageToolbar` (filtre/arama/aksiyon), `Section` |
| Veri | `StatCard`, `MetricGrid`, `IconChip`, `StatusBadge`, `StatusText`, `DataTable` (mevcut `table.tsx` + boş/yükleme/hata entegre), `TrendDelta` |
| Durum | `EmptyState`, `ErrorState`, `LoadingState` + iskelet presetleri, `QueryBoundary`, `PanelErrorBoundary` |
| Form | `Form` (rhf), `FormField`, `FormMessage`, `Field` (label+hint+error), `ConfirmDialog` + `useConfirm()` |
| Hareket | `lib/motion.ts`, `useMotionPolicy()`, `<Ambient>`, `<Reveal>` (stagger sınırlı) |
| İfade (`play`) | `GlowCard`, `RarityBadge`, `FloatingOrbs` — token'lı, politika-duyarlı |

### 4.5 Tema motoru

`ThemeController` (bkz. Y1): SSR'da `<style id="qx-theme">` üretir; öncelik `base < preset < seasonal < a11y`; türetilmiş token'lar + kontrast garantisi; admin önizleme yalnızca bu `<style>`'ı değiştirir; `html`/`body` inline stil yazımı kalkar; `SeasonalConceptApplier` yalnızca **katman bildirir**, boyamaz.

### 4.6 Yönetişim

- **Yaşayan rehber:** `/admin/design-language` gerçek bileşenleri, token tablosunu (kontrast skoruyla), motion presetlerini ve benimsenme metriklerini gösterir.
- **Otomatik kontroller (CI):** (1) token kontrast testi (her preset × light/dark, Jest), (2) ham palet/keyfi boyut sayacı (bu rapordaki grep'ler bir betiğe; eşik aşılırsa uyarı), (3) Playwright görsel regresyon: 10 temsilî sayfa × light/dark × 2 preset, (4) stylelint `qx-` önek kuralı.
- **Belge:** `DESIGN-LANGUAGE.md` ≤ 1 sayfa kural + bağlantılar; `MASTER.md` arşiv.

---

## 5. Adım adım geçiş planı

| Faz | Kapsam | Çıktı | Efor | Bağımlılık |
|---|---|---|---|---|
| **0 — Acil düzeltmeler** | K1 `.animate-in` → `qx-enter`; K2 dark `destructive` metin yaması; Y3 içerik-only `DashboardRouteLoading`; Y4 a11y init betiği + `useMotionPolicy` → `MotionConfig`; `inbox` `tones.split` hatası; `brand-colors.ts` hex düzeltmesi (`#7c3aed`) | Görünür bozukluklar kapanır | S (1–2 gün) | — |
| **1 — Token v2** | `design-system/tokens.ts`; rol token'ları (4.1) + türetme fonksiyonu; Tailwind eşlemesi; `globals.css` bölme + ölü sınıf temizliği (O6); radius/z-index/motion token'ları; kontrast Jest testi | Tek kaynak, test edilebilir palet | L (1 hafta) | Faz 0 |
| **2 — Tema motoru** | `ThemeController` + SSR `<style>`; preset kayıt kontrast doğrulaması; seasonal katmanı; `Card glass` token'a | Çatışmasız tema, preset'lerde AA | M–L | Faz 1 |
| **3 — Bileşen katmanı** | `PanelShell`, `PageHeader`, `PanelPage`, `StatCard`, `IconChip`, `StatusBadge`, durum üçlüsü + `QueryBoundary`, `Form`, `ConfirmDialog`, `lib/motion.ts`, `<Ambient>`; primitif düzeltmeleri (O3) | Hedef envanter (4.4) | L (1–2 hafta) | Faz 1 |
| **4 — Codemod'lar** | Durum renkleri → rol token'ları; marka literal'leri → değişken; `PREMIUM_PANEL_CARD_BASE`/ikon çipi/hero buton kopyaları → bileşen; `text-[≤9px]` → `caption`; `confirm()` → `useConfirm` | Ham palet ve kopya sayısında büyük düşüş | M | Faz 3 |
| **5 — Sayfa göçü (panel panel)** | Sıra: **bayi** (hero benimsenmesi en düşük ticari panel; 17 sayfa) → **müşteri operasyon sayfaları** (`analytics`, `favorites`, `experiences`, `shop`…) → **admin kalan sayfalar** → personel. Her sayfada `PanelPage` + `PageHeader` + durum üçlüsü + motion presetleri | Üç panelde tek iskelet | XL (2–3 hafta, paralelleştirilebilir) | Faz 3–4 |
| **6 — Yönetişim** | Yaşayan `/admin/design-language`; CI metrik betiği + görsel regresyon; lint kuralları uyarı → hata | Gerilemeyi önleyen sistem | M | Faz 1–5 |

### Başarı metrikleri (bu raporun taban değerlerine göre)

| Metrik | Bugün | Faz 5 sonu hedef |
|---|---|---|
| Durum ailesi ham renk sınıfı (panel dizinlerinde) | ~2.000 | < 150 (yalnızca `play` istisnaları) |
| `success/warning/danger/info` token kullanımı | 0 | > 800 |
| Marka moru literal | ~155 | 0 (kimlik renkleri `--category-*`) |
| Token çiftlerinde AA altı kontrast (light/dark × preset) | ≥ 7 tespit (destructive-dark, primary-dark, 5 preset fg) | 0 (CI ile) |
| `text-[≤9px]` | 47 | 0 |
| Hero/PageHeader benimsenmesi (admin/bayi/müşteri) | %71 / %51 / %29 | %100 / %100 / %100 (oyunlar `compact`) |
| `EmptyState` kullanan dosya | 4 | ≥ 60 (78 ad-hoc blok göçü) |
| Native `confirm()` | 14 | 0 |
| Farklı framer süre değeri | 25+ | ≤ 6 (token) |
| `globals.css` ölü sınıf | 20+ | 0 |

---

## 6. Doğrulanmayan / açık noktalar

- Canlı DB'deki `activeTheme` ve `customColors` değerleri okunmadı (kural gereği); Y1'deki "varsayılan purple preset kart=zemin" etkisi preset'in aktif olmasına bağlıdır.
- K1 ve Y3'ün görsel sonucu tarayıcıda gözlenmedi; K1 derlenmiş CSS ile, Y3 Next.js `loading.tsx` yerleşim semantiği ve kaynak kodla doğrulandı.
- `app/lab/` (git'te izlenmeyen deneme dizini) kapsam dışı bırakıldı; sayımlarda yer aldığı yerler (ör. hex en yüksek dosya `app/lab/zoom/zoom-client.tsx`) sonuçları anlamlı ölçüde değiştirmiyor.
- Grep tabanlı sayımlar çok satırlı JSX'te bir miktar eksik sayabilir; oranlar ve sıralama güvenilir, mutlak sayılar ±%5 kabul edilmeli.

# Qratex Sistem Geneli Performans Denetimi

> Tarih: 2026-10-08 · Boyut: **performans** · Kapsam: tüm paneller (public, müşteri, bayi, admin, staff), API katmanı, Prisma/Neon, Redis, varlıklar, PWA
> Yöntem: salt okunur kod incelemesi (Grep/Glob envanteri + dosya okuma), yereldeki 2026-09-02 tarihli `.next` üretim derlemesinin çıktısı ve canlı ortamdan (`demoqratex.vercel.app`) yalnızca **salt okunur GET/HEAD** ölçümleri. Kod değiştirilmedi; veritabanına, build'e, test'e dokunulmadı.
> Canlıdaki chunk hash'leri (ör. `51850-bc55b70853270731.js`) yerel derlemeyle birebir aynı; yani yerel `.next` ölçümleri canlıyı temsil ediyor.

---

## 1. Özet

**Puan: 4 / 10**

Sunucu tarafının "sıcak yol" altyapısı aslında iyi kurulmuş: Vercel `fra1` ile Neon `eu-central-1` aynı bölgede, `connection_limit=5` doğru, 15 ağır agregasyon ucu Redis ile önbelleklenmiş, ayar okuyucuları `unstable_cache` arkasında, three.js / leaflet / html5-qrcode / tesseract / recharts tembel yükleniyor, global `LazyMotion` var, AI analizi `after()` ile yanıt yolunun dışında. Hot tablolarda bileşik indeksler mevcut.

Puanı aşağı çeken şey kod kalitesi değil, **ölçeklenmeyen üç sistemik karar**:

1. **Varlık (asset) katmanı kontrolsüz.** Avatarlar, içine 1024×1024 PNG gömülmüş **3,4 MB'lık SVG**'ler (70 dosya, 226 MB). Lig sıralamasında 14–18 px'lik ikon için 24,5 MB, liderlik tablosunda en kötü durumda **~181 MB** iniyor. Üstüne next-pwa, `public/` klasörünün **tamamını** (259 dosya, ~358 MB) service worker ön belleğine koyuyor ve bu SW **her ziyaretçiye** (QR okutan anonim müşteri dahil) kuruluyor. Canlıda doğrulandı.
2. **Ortak istemci paketi şişkin.** Her sayfaya, QR geri bildirim sayfası dahil, TR+EN sözlüklerinin tamamı (314 KB ham / 98 KB gzip) ve public sayfalarda 27 arka plan varyantının hepsi gidiyor. Canlıda QR sayfası: **37 chunk, 1,44 MB ham JS, ~469 KB aktarım.**
3. **Veri mimarisi "önce boş kabuk, sonra istemciden fetch".** 200 `page.tsx`'in 152'si doğrudan `'use client'`, hiçbir `page.tsx` sunucuda veri çekmiyor, `HydrationBoundary` sıfır. Müşteri ana sayfasının soğuk açılışı yaklaşık **18 API çağrısı + 5 web-vitals beacon'ı** üretiyor, bunların çoğu global ayarları `no-store` ile tekrar tekrar okuyor.

İlk iki madde 1–3 günlük işle büyük ölçüde çözülebilir ve kullanıcı tarafında en büyük kazancı sağlar. Üçüncüsü bir mimari geçiş; aşamalı yapılmalı.

---

## 2. Mevcut durum haritası

### 2.1 Envanter (sayımlar)

| Ölçüt | Değer | Kaynak |
|---|---|---|
| `page.tsx` | 200 (152'si doğrudan `'use client'`) | `find app -name page.tsx` + ilk 3 satır taraması |
| `route.ts` (API) | 399 | `find app -name route.ts` |
| `'use client'` içeren dosya (app+components+hooks+lib) | 376 | grep |
| Sunucuda Prisma ile veri çeken `page.tsx` | **0** | `grep -rl "@/lib/prisma" app --include=page.tsx` |
| `HydrationBoundary` / `dehydrate` | **0** | grep |
| React Query kullanan dosya | 16 | grep `useQuery` |
| `fetch(` içeren client dosyası | 202 | grep |
| İstemcide `cache: 'no-store'` | 99 | grep |
| `next/dynamic` kullanan dosya | 22 | grep |
| `repeat: Infinity` framer animasyonu | 83 kullanım / 42 dosya | grep |
| `visibilitychange` ile duraklatılan polling | 1 dosya (yalnız 3B kutu) | grep |
| `findMany` toplam / `take`'siz | 420 / 137 | özel tarayıcı (scratchpad) |
| Döngü içinde `await prisma.*` (olası N+1) | 92 (çoğu cron/seed/backfill) | özel tarayıcı |
| Redis `redisGetJson/SetJson` ile önbelleklenen uç | 15 | grep |
| `unstable_cache` kullanan dosya | 12 | grep |
| CDN önbellek başlığı (`s-maxage`) veren API | 3 | grep |
| `public/` boyutu | 343 MB (avatar 226 MB, badges 40 MB, "zamanikimizisilerizimizideğil" 71 MB) | `du` |

### 2.2 Ölçülen istemci yükleri

| Sayfa | Chunk | Ham JS | Aktarım (sıkıştırılmış) | Kaynak |
|---|---|---|---|---|
| `/` (landing) | 43 | 1,49 MB | ~488 KB | canlı, `curl` |
| `/feedback/[code]` (QR hunisi) | 37 | 1,44 MB | ~469 KB | canlı, `curl` |
| `/cerez-politikasi` (statik metin) | 40 | 1,41 MB | ~451 KB gzip | yerel `.next` HTML |
| Global CSS | 1 dosya | 301 KB | 43 KB gzip | yerel `.next/static/css` |

QR sayfasındaki en büyük chunk'lar (canlı): `51850-…js` **314 KB** (i18n JSON), `4bd1b696-…` 198 KB (React DOM), `93794-…` 189 KB (Next runtime), `app/(public)/layout-…` **158 KB** (arka plan varyantları), polyfills 113 KB (yalnız eski tarayıcılar).

### 2.3 Müşteri ana sayfası soğuk açılış istek şelalesi

```
HTML (boş kabuk + skeleton)
 └─ JS hydrate (~470 KB)
     ├─ /api/auth/session                         (SessionProvider)
     ├─ /api/settings/theme                       (providers.tsx:111, SSR verisi varken tekrar)
     ├─ /api/settings/seasonal-concept  no-store  (her sayfada, DB sorgusu)
     ├─ /api/settings/sidebar-order     no-store
     ├─ /api/settings/sidebar-groups    no-store
     ├─ /api/settings/visibility        no-store
     ├─ /api/birthday                   no-store
     ├─ HEAD /videos/welcome-customer.mp4
     ├─ /api/notifications?limit=30     (sonra her 20 sn)
     └─ session geldikten SONRA:
         ├─ /api/customer/stats
         ├─ /api/leaderboard?limit=5
         ├─ /api/gamification/rewards
         ├─ /api/gamification/spin
         ├─ /api/customer/discovery     (25k+20k satır tarar, sonra her 60 sn)
         ├─ /api/customer/favorites
         ├─ /api/customer/showcase
         └─ /api/customer/weekly-card
     + 5 × POST /api/user/web-vitals
```

Her biri ayrı bir fonksiyon çağrısı; her birinde `getServerSession` + token-replay Redis okuması + iş sorguları var.

### 2.4 İyi olanlar (korunmalı)

- Bölge eşleşmesi: `vercel.json:5` `fra1` ↔ `.env:1` Neon `eu-central-1`, `connection_limit=5&pgbouncer=true`.
- Redis "get-or-compute" deseni ve fail-safe istemci: `lib/redis.ts:55-88`; 15 ağır uçta kullanılıyor (ör. `app/api/dealer/stats/route.ts:37-39,465`).
- Ayar okuyucuları `unstable_cache` + tag: `lib/get-public-theme-settings.ts:25-43`, `lib/seo-settings.ts`, `lib/module-gate.ts`.
- Ağır kütüphaneler tembel: three.js (`components/rewards/signature-gift-box-lazy.tsx:14`, `components/customer/games/mind-thief-game.tsx:9`), harita (`components/map/nearby-map-lazy.tsx`), QR okuyucu (`app/customer/scan/page.tsx:97`), OCR (`components/ocr/receipt-amount-scanner.tsx:85`), grafikler (`components/charts/chart-lazy.tsx`).
- Global `LazyMotion` (`components/providers.tsx:241`), 146 dosya `m` kullanıyor.
- Landing LCP öğesi animasyonla gizlenmiyor: `components/landing/HeroSection.tsx:102` `initial={{ opacity: 1 }}`.
- AI analizi yanıt sonrası: `app/api/feedbacks/route.ts:452` `after(...)`.
- Feedback/Notification/Consumption tablolarında doğru bileşik indeksler (`prisma/schema.prisma:851-855, 1007-1008, 1597-1599`).

---

## 3. Bulgular (önem sırasıyla)

Önem: **Kritik** = kullanıcıya doğrudan, ölçülebilir büyük zarar veya veri/maliyet patlaması · **Yüksek** = her sayfada veya ana hunide belirgin yavaşlık · **Orta** = belirli sayfalarda veya ölçekle büyüyen risk · **Düşük** = hijyen.
Efor: S (≤1 gün) · M (2–5 gün) · L (1–2 hafta) · XL (>2 hafta, aşamalı).

---

### K1 — PWA service worker `public/` klasörünün tamamını (~358 MB) her ziyaretçiye ön belleğe alıyor · **Kritik** · Efor S (hızlı düzeltme) / M (Serwist'e geçiş)

**Kanıt**
- `next.config.js:3-10`: `withPWA({ dest: 'public', register: true, skipWaiting: true, ... })`; `publicExcludes` ve `buildExcludes` **yok**.
- Canlı `https://demoqratex.vercel.app/sw.js` (salt okunur GET, 125 KB): `precacheAndRoute` içinde **1.213 giriş**: 954 `/_next/` chunk'ı + **259 public dosya**; bunların **70'i `/images/avatar/`, 85'i `/images/badges/`**.
- Yerel aynı derlemede girişlerin dosya boyutları toplandığında public kısmı **~358,5 MB**, `_next` kısmı ~12,6 MB.
- next-pwa public dosyaları `additionalManifestEntries` olarak ekler; Workbox'ın 2 MB `maximumFileSizeToCacheInBytes` sınırı bu girişlere uygulanmaz (3,4 MB avatarlar listede, bu da bunu doğruluyor).
- `register: true` → SW, `/feedback/[code]` dahil **ilk ziyaret edilen her sayfada** kurulur.

**Sorun.** QR okutup tek bir puan vermek isteyen anonim müşterinin telefonu, arka planda yüzlerce MB'lık indirme başlatır: mobil veri, pil ve depolama tüketimi. Kota yetmezse Workbox `install` başarısız olur ve SW her gezinmede yeniden kurulmaya çalışır (bu döngü canlıda tarayıcıyla **doğrulanmadı**; Workbox'ın install semantiğinden çıkarım). Ayrıca 954 JS chunk'ının (admin dahil tüm paneller) önceden indirilmesi, müşteri için gereksiz.

**Öneri (ürün seviyesi)**
- **Hedef deneyim:** SW yalnızca uygulama kabuğunu (offline sayfası, logo, manifest ikonları, giriş rotasının JS'i) önceden alır; görseller ilk gerçek kullanımda `StaleWhileRevalidate`/`CacheFirst` ile sınırlı sayıda (`maxEntries`) tutulur.
- **Hemen (S):** `publicExcludes: ['!images/**/*', '!videos/**/*', '!mascot/**/*', '!logo/chatbot.png', '!noprecache/**/*']` ve `buildExcludes: [/chunks\/app\/(admin|dealer|staff)\//, /\.map$/]` ekleyin. Kurulumu yalnızca oturum açmış müşteri/bayi panellerinde yapın (`register: false` + panel layout'unda `workbox.register()`), QR hunisinde yapmayın.
- **Kalıcı (M):** `next-pwa@5.6` bakımsız ve webpack'e bağımlı; build'in `--webpack`e kilitli olmasının bir nedeni de bu (`package.json` `build` script'i). `@serwist/next`'e geçip precache manifest'ini açıkça tanımlayın (ayrıca bkz. O9, push SW çakışması).
- Doğrulama: DevTools > Application > Cache Storage'da `workbox-precache` boyutu < 3 MB olmalı.

---

### K2 — Avatar ve rozet görselleri: PNG gömülü 3,4 MB'lık SVG'ler, 14 px ikon için megabaytlar · **Kritik** · Efor M

**Kanıt**
- `public/images/avatar/AVATAR ERKEK 1.svg`: 3.470.166 bayt; içinde tek bir `<image width="1024" height="1024" ... data:image/png;base64` var (Illustrator dışa aktarımı). Canlı HEAD: `Content-Length: 3439839`, `Cache-Control: public, max-age=0, must-revalidate`.
- 70 avatar dosyası, toplam 226 MB. `badges/` 85 dosya, 41,6 MB, ortalama 489 KB (yoğun vektör yolu). `zamanikimizisilerizimizideğil/` 71 MB.
- **Lig avatarları:** `lib/league-avatars.ts:7-15` 7 lig → 7 farklı avatar, toplam **24,5 MB**; `app/customer/leaderboard/page.tsx:436` (18 px) ve `:584` (14 px) bunları `next/image` ile çiziyor. `next/image` SVG'yi optimize etmez, olduğu gibi geçirir.
- **Liderlik tablosu varsayılan avatarı:** `app/customer/leaderboard/page.tsx:74` `limit=50`, `:84` `image: user.image || defaultAvatars[i % defaultAvatars.length]` → görseli olmayan her kullanıcıya farklı 3–4 MB'lık SVG atanıyor. İlk 50 varsayılan avatarın toplamı **181,3 MB** (ölçüldü). `:554` bunları Radix `AvatarImage` ile çiziyor; Radix görünürlükten bağımsız olarak `new Image()` ile **hemen** yükler (lazy değil).
- **Header:** `components/dashboard/header.tsx:534` `AvatarImage src={session.user.image}`; kullanıcı avatar seçtiyse her panel sayfasında 3–4 MB'lık SVG (ilk yüklemede).
- **Avatar seçici:** `app/customer/settings/page.tsx:581-606` kategori ızgarası, her hücre ayrı bir 3–4 MB'lık SVG.
- **Rozet ızgarası:** `app/customer/badges/badges-client.tsx:479` `<Image src={badge.icon} width={140}>` (SVG, optimize edilmez; `next/image` varsayılan lazy olduğu için kısmen hafifliyor).
- **Diğer:** `app/customer/journey-score/page.tsx:54-55` maskot 543 KB SVG; `components/chat/chatbot.tsx:624` `AvatarImage src="/logo/chatbot.png"` 1,66 MB PNG ham `<img>` olarak.

**Sorun.** Müşteri panelinin en "oyunlaştırılmış" ve en sık açılan ekranları (liderlik, rozetler, ayarlar) mobil ağda onlarca ila yüzlerce MB indiriyor. Bu LCP'yi, bellek kullanımını (1024² bitmap × 50 decode) ve veri maliyetini doğrudan etkiliyor. Bu sistemdeki en büyük tekil performans sorunu.

**Öneri**
- **Varlık hattı (asset pipeline):** gömülü PNG'leri bir kerelik betikle çıkarıp `sharp` ile **64/128/256/512 px WebP (+AVIF)** üretin. Avatar başına 256 px WebP tipik olarak 15–40 KB olur (~100× küçülme). Dosya adlarını içerik hash'li yapın (`avatar-erkek-1.3f9a.webp`) ve `next.config.js` `headers()` ile `/images/**` için `Cache-Control: public, max-age=31536000, immutable` verin.
- **Veri modeli:** `user.image` alanında dosya yolu yerine **avatar kimliği** (`avatar:erkek-1`) saklayın; `lib/avatar-options.ts` kimlik → boyuta göre URL çözsün. Mevcut kayıtlar için yol → kimlik eşlemesi yapan idempotent bir göç (canlı Neon'a dokunduğu için ayrı onaylı adım olarak).
- **Bileşen:** tek bir `<UserAvatar size="xs|sm|md|lg">` bileşeni (Radix Avatar + `next/image` ile `sizes` ve `loading="lazy"`), header, liderlik ve sohbet bunu kullansın.
- **Liderlik:** görseli olmayan kullanıcıya rastgele avatar atamayın; baş harf (initials) fallback'i kullanın. Lig rozeti için 32 px'lik tek bir sprite yeterli.
- **Rozetler:** SVGO ile yolları sadeleştirin; ızgara için 160 px WebP küçük resim, detay modalında SVG.
- **Kalite kapısı:** CI'da `public/images/**` için dosya başına bütçe (ör. 150 KB) koyan küçük bir betik.

---

### Y1 — TR+EN sözlüklerinin tamamı her sayfanın ortak istemci paketinde · **Yüksek** · Efor L

**Kanıt**
- `i18n/request.ts:7-8`: `import trMessages from '../messages/tr.json'; import enMessages from '../messages/en.json';` (206 KB + 196 KB).
- `lib/app-locale.tsx:1,5`: `'use client'` + `import { defaultLocale, t } from '@/i18n/request'`; `AppLocaleProvider` kök `Providers` içinde (`components/providers.tsx:221`), yani **her sayfada**.
- 146 dosya `i18n/request` / `app-locale` / `use-customer-locale` import ediyor; QR sayfası doğrudan import ediyor (`app/(public)/feedback/[code]/page.tsx:14`).
- Ölçüm: chunk `51850-bc55b70853270731.js` **314.280 bayt ham / 98.438 bayt gzip**; hem "Geri bildirim" hem "Feedback" metnini içeriyor. Canlıda QR sayfasındaki en büyük chunk bu.
- Ek CLS/flash: `lib/app-locale.tsx:21` başlangıç durumu her zaman `defaultLocale`, gerçek dil `useEffect`'te (`:24-29`) uygulanıyor. EN kullanıcıları önce Türkçe metni görüyor, ardından tüm ağaç yeniden render oluyor. Sunucu dili zaten biliyor (`lib/server-locale.ts:6-14`).

**Sorun.** Her sayfada (statik çerez politikası dahil) ~100 KB gzip, parse/compile maliyeti olan ve büyük çoğunluğu o sayfada kullanılmayan metin taşınıyor. Mobilde ana iş parçacığını meşgul eder (TBT/INP), QR hunisini yavaşlatır.

**Öneri**
- **Hedef:** sunucu bileşenleri sözlüğü sunucuda okur; istemciye yalnızca o rotanın ihtiyaç duyduğu **namespace dilimi** ve **tek dil** gider.
- **Uygulama:** `messages/{locale}/{namespace}.json` olarak bölün. Panel layout'u (server) `getServerLocale()` ile dili alıp `AppLocaleProvider initialLocale={locale} messages={pick(ns)}` olarak geçsin. `t()` istemcide yalnız sağlanan dilimden okusun. Büyük namespace'ler (ör. `dealerAiInsights`) `import()` ile rota bazında yüklensin. Alternatif: `next-intl` (RSC desteği, namespace bazlı istemci sağlayıcı).
- **Geçiş:** önce `AppLocaleProvider`'ı `initialLocale` alacak şekilde değiştirin (flash biter, S). Sonra QR hunisi ve landing'i dilimli sağlayıcıya geçirin, en son panelleri.
- **Bütçe:** QR sayfası için ortak paket < 180 KB gzip.

---

### Y2 — Public layout 27 arka plan varyantını statik yüklüyor; varsayılan arka plan 34 sonsuz animasyon çalıştırıyor · **Yüksek** · Efor M

**Kanıt**
- `components/ui/backgrounds/dynamic-background.tsx:4-28`: aurora, matrix, particles, galaxy, christmas, … **27 varyantın hepsi** statik `import` (toplam 7.315 satır).
- `components/landing/LandingBackground.tsx:5` bunu import ediyor; `app/(public)/layout.tsx:5,18` ile **tüm public sayfalarda**, QR hunisi `/feedback/[code]` dahil, render ediliyor. Canlı `app/(public)/layout-…js` chunk'ı 158 KB ham.
- Varsayılan `original` görünümde bile `LandingBackground.tsx:77-140`: `blur-3xl` filtreli **8 orb** + `box-shadow`'lu **26 parçacık**, hepsi `repeat: Infinity` framer animasyonu (x/y/scale/opacity/rotate). Framer bunları ana iş parçacığında kare kare günceller.
- `LandingBackground.tsx:36-47`: sunucu `initialBackgroundEffect` verdiği halde (`app/(public)/layout.tsx:13`) mount'ta `/api/settings/background`'u `no-store` ile tekrar çekiyor; uç her istekte DB'ye gidiyor (`app/api/settings/background/route.ts:7`).

**Sorun.** Ürünün en kritik hunisi (QR okut → puan ver) mobil cihazda ~160 KB fazladan JS, sürekli çalışan 34 animasyon (pil, ısınma, INP) ve fazladan bir DB çağrısı taşıyor. Yıldız/puan seçimi sırasında ana iş parçacığı animasyonlarla yarışıyor.

**Öneri**
- **Rota grubu ayrımı:** `/feedback/[code]`, `/c/[token]` gibi "işlem" sayfalarını `app/(funnel)/` grubuna taşıyın; minimal layout (logo + dil düğmesi), arka plan yok veya statik CSS gradyanı.
- **Varyant bazlı dinamik yükleme:** `const VARIANTS = { aurora: dynamic(() => import('./aurora')), ... }`; yalnız seçili varyantın chunk'ı insin.
- **Varsayılan arka plan:** orb/parçacıkları **CSS `@keyframes`** ile yalnız `transform`/`opacity` animasyonuna çevirin (compositor'da çalışır, JS yok). `IntersectionObserver` + `document.hidden` ile görünmezken durdurun; `prefers-reduced-motion` zaten var, ek olarak düşük donanımda (`navigator.hardwareConcurrency <= 4`) parçacık sayısını azaltın.
- Arka plan ayarını yalnız SSR prop'undan alın; istemci tekrar çekmesin (admin değiştirince tag revalidation yeterli).

---

### Y3 — "Boş kabuk + istemci fetch" mimarisi: sunucu verisi yok, şelale var, global ayarlar her sayfada `no-store` · **Yüksek** · Efor XL (aşamalı)

**Kanıt**
- 152/200 `page.tsx` doğrudan `'use client'`; kalan sunucu sayfalarının çoğu da veri çekmeden tek bir client bileşeni döndürüyor: `app/customer/page.tsx:9-11`, `app/dealer/page.tsx:9-11`, `app/admin/page.tsx:9-11`. Hiçbir `page.tsx` Prisma kullanmıyor; `HydrationBoundary` yok.
- Müşteri ana sayfası: `components/customer/dashboard/customer-dashboard.tsx:133-194` `enabled: !!session?.user` → önce `/api/auth/session` dönmeli, sonra 7 paralel istek (`:166-174`) + `weekly-card` (`:198-206`), `refetchInterval: 60_000` (`:193`).
- Kabuk istekleri: `components/dashboard/sidebar.tsx:348,370,397,400` (3–4 istek, `no-store`), `components/seasonal/seasonal-concept-applier.tsx:30` (her sayfada, DB sorgusu: `app/api/settings/seasonal-concept/route.ts:20`), `components/providers.tsx:110-113` (SSR'da gelen tema verisini mount'ta tekrar çekiyor), `components/customer/customer-birthday-bonus-host.tsx:36`, `components/customer/welcome-video-modal.tsx:53`, `components/dashboard/notification-center.tsx:115`.
- Yalnız 16 dosya React Query kullanıyor; 202 dosya ham `fetch` ile, yani gezinmeler arasında önbellek/tekilleştirme yok.
- Sidebar linkleri `prefetch={false}` (`components/dashboard/sidebar.tsx:516,601`): gezinmede RSC + chunk + istemci verisi seri iniyor.

**Sorun.** Kullanıcı önce skeleton görür; anlamlı içerik (LCP) hidrasyon → oturum → veri zincirinin sonunda gelir. Mobilde ve soğuk fonksiyonlarda bu 1–3 saniyeye çıkar. Her API çağrısı ayrı fonksiyon çağrısı, auth çözümü ve sorgu demek; maliyet ve soğuk başlangıç riski kullanıcı başına ~18 kat.

**Öneri (hedef mimari, bkz. bölüm 4)**
- **Kabuk konfigürasyonu sunucuda:** panel `layout.tsx`'leri (zaten server) tek bir önbellekli `getShellConfig(role)` çağrısıyla menü görünürlüğü, sıra, gruplar, modül kontrolleri, dönemsel konsept ve temayı alıp `Sidebar`/`Providers`'a **prop** olarak geçsin. Bu 5–6 istemci isteğini ve O1'deki menü sıçramasını kaldırır.
- **Sayfa verisi sunucuda başlasın:** kritik sorgu (ör. müşteri `stats`) server `page.tsx`'te `queryClient.prefetchQuery` + `<HydrationBoundary>` ile veya `initialData` prop'u ile gelsin; ikincil bölümler `<Suspense>` ile akarak (streaming) gelsin.
- **BFF/aggregate uç:** `GET /api/customer/home` tek auth çözümüyle bölümleri paralel hesaplasın; global bölümler (keşif/trend, liderlik ilk 5) Redis'ten, kişisel bölümler DB'den.
- **Gezinme:** sidebar'da `prefetch={false}` yerine hover/focus'ta `router.prefetch(href)` (intent-based prefetch).
- **Standart:** yeni sayfalar için "server page + client island" kuralı; istemci veri katmanı React Query'de birleşsin (ham `fetch` + `useEffect` yerine).

---

### Y4 — Global agregasyonlar her istekte, büyük satır kümeleriyle bellekte hesaplanıyor · **Yüksek** · Efor M

**Kanıt**
- `app/api/customer/discovery/route.ts:124-151`: son 30 günün feedback'leri (**25.000 satıra kadar**) ve son 7 günün review'ları (**20.000'e kadar**, ilişkili dealer ile) belleğe çekiliyor; `:20-32` 25k `qrCodeId`'yi 8.000'lik `IN` listeleriyle sorguluyor; `:166-170` dealer'lar için ek sorgu. Bu "trend mekanlar" verisi **kullanıcıya özgü değil** ama Redis önbelleği yok. Müşteri ana sayfası bunu **her 60 sn**'de bir çağırıyor (`customer-dashboard.tsx:174,193`).
- `app/api/dealer/benchmark/route.ts:96-115`: platform geneli yüzdelik için 25.000 feedback + `IN` listesi ile QR eşlemesi; Redis anahtarı bayi başına (`:41-43`), yani aynı global dağılım her bayi için ayrı hesaplanıyor.
- `app/api/admin/analytics/route.ts:116-124`: `startDate`'ten itibaren ve `prevStartDate`'ten itibaren **iki örtüşen** feedback sorgusu (ikincisi birinciyi kapsıyor); `1y` döneminde 2 yıllık satır. `:217-224` her gün için tüm diziyi `filter` ediyor (O(gün × N), 1y'de 365 tur).
- `take` tavanları sessizce yanlış sonuç üretir: veri büyüyünce discovery/benchmark son N satırla sınırlı kalır.
- Hazır ön-agregasyon tablosu **okunmuyor**: `dailyDealerStats` yalnız `app/api/admin/preagg/route.ts:137`'de yazılıyor, hiçbir okuyucu yok.

**Sorun.** Veritabanı ve fonksiyon belleği kullanıcı sayısıyla doğrusal büyüyor. Neon compute ve Vercel GB-saat maliyeti artarken p95 gecikme de yükseliyor; `take` tavanları ise ölçekte doğruluğu bozuyor.

**Öneri**
- **SQL'e it:** `SELECT q."dealerId", COUNT(*), AVG(f.rating) FROM "Feedback" f JOIN "QRCode" q ON q.id=f."qrCodeId" WHERE f."createdAt" >= $1 GROUP BY 1` gibi tek sorgu (Prisma `$queryRaw` veya `groupBy`). Satır taşımak yerine sonuç taşıyın.
- **Global önbellek anahtarı:** `discovery:trending:v1` ve `benchmark:platform-distribution:v1` Redis'te 5–10 dk; kişisel kısım (favoriler, mesafe) ayrı ve hafif.
- **Ön-agregasyon:** mevcut günlük cron (`vercel.json:7`) `DailyDealerStats`'ı doldursun; dealer analytics/benchmark/admin analytics günlük serileri buradan okusun. Böylece "son 1 yıl" grafiği 365 satır okur, 2 yıllık ham feedback değil.
- **Admin analytics:** iki sorguyu birleştirin; günlük kovaları `date_trunc('day', "createdAt")` ile SQL'de oluşturun.

---

### Y5 — Bildirimler için iki paralel mekanizma; polling'ler görünmez sekmede de çalışıyor · **Yüksek** · Efor M

**Kanıt**
- Bayi layout'u SSE akışı açıyor: `app/dealer/layout.tsx:48` → `lib/use-notification-stream.ts:56` → `app/api/dealer/notifications/stream/route.ts`. Sunucu açık bağlantı başına DB'yi **1,2–5 sn**'de bir yokluyor (`:23-25, 75-100`), `maxDuration = 60` (`:8`) sonrası yeniden bağlanma ve her açılışta `count` sorgusu (`:61`).
- Aynı anda header'daki `NotificationCenter` **20 sn**'de bir `/api/notifications` çağırıyor (`components/dashboard/notification-center.tsx:147`), iki sorguyla (`app/api/notifications/route.ts:36-57`).
- Diğerleri: admin ana sayfa 45 sn yenileme + **5 sn'de bir tüm dashboard'u yeniden render eden** tick (`app/admin/admin-dashboard-client.tsx:182-183`, `app/admin/admin-utils.ts:53`), squad savaşı 15 sn (`components/customer/squad-battle-panel.tsx:79`), observability 30 sn (`app/admin/observability/page.tsx:91`), VoC kiosk 20 sn.
- Hiçbiri `document.visibilityState`'e bakmıyor (repo genelinde yalnız 3B kutu bakıyor).

**Sorun.** Açık bırakılmış tek bir bayi sekmesi dakikada ~12–50 + 3 DB sorgusu üretir ve bir fonksiyonu neredeyse sürekli canlı tutar. Arka planda unutulan sekmeler Neon'un otomatik uykuya geçmesini (scale-to-zero) de engeller.

**Öneri**
- **Tek kanal:** bayide rozet sayısı ve toast SSE'den beslensin; `NotificationCenter` SSE varken polling yapmasın (yalnız açıldığında listeyi çeksin).
- **Ucuz yoklama:** bildirim oluşturan tüm yollar Redis'te `notif:ver:{userId}` anahtarını `INCR`lesin; SSE döngüsü önce bu sürümü okusun (Upstash REST, ~ms), yalnız değiştiyse DB'ye insin.
- **Görünürlük:** `document.hidden` iken SSE'yi kapatın, polling'leri durdurun; dönüşte tek seferlik yenileme yapın. React Query'de `refetchIntervalInBackground: false` varsayılanı kullanılabilir.
- Admin "son güncelleme" etiketi için 5 sn tick yerine etiketi ayrı küçük bir bileşende tutun.

---

### Y6 — Geri bildirim fotoğrafları base64 olarak JSON gövdesinde gönderilip veritabanına yazılıyor · **Yüksek** · Efor M

**Kanıt**
- `app/(public)/feedback/[code]/page.tsx:172-182`: dosya başına 5 MB'a kadar, `reader.readAsDataURL(file)` → `images` state'i; `:118-122` `media: images` JSON gövdesinde.
- `lib/validations.ts:100-108`: `media` için `z.string().url()`. Zod v3'ün url kontrolü `new URL()` ile yapılır, `data:image/...;base64,...` geçerli sayılır.
- `app/api/feedbacks/route.ts:249` `media: media ?? []` doğrudan `Feedback.media Json?` kolonuna yazılıyor; `:62-68` liste sorgusu `media: true` seçiyor. `lib/media-validation.ts` bu uçta kullanılmıyor.

**Sorun.** (1) Bir telefon fotoğrafı (3–5 MB) base64'te ~1,33× büyür; tek fotoğraf Vercel'in 4,5 MB istek gövdesi sınırına yaklaşır veya aşar → 413 ve kullanıcı açısından "gönderilemedi" (canlıda **doğrulanmadı**, platform sınırından çıkarım). (2) Başarılı olanlar Postgres'te satır başına MB'larca JSON olarak durur; bayi listeleri ve AI yolları bu satırları taşır; Neon depolama ve egress büyür.

**Öneri**
- **Akış:** istemcide `canvas`/`createImageBitmap` ile 1600 px'e küçültüp WebP'ye sıkıştırın (~150–300 KB) → mevcut R2 altyapısıyla (`lib/r2-storage.ts`) **presigned PUT** → feedback'e yalnız URL yazılsın.
- **Doğrulama:** `media` şemasını R2 public host'u ile sınırlayın (`url().refine(u => u.startsWith(R2_PUBLIC_URL))`), `data:` reddedilsin.
- **Liste sorguları:** liste görünümünde `media` yerine `mediaCount`/ilk küçük resim URL'si dönsün.
- Mevcut base64 satırlarını R2'ye taşıyan backfill (canlı DB'ye dokunduğu için ayrı, onaylı iş).

---

### O1 — Sidebar menüsü önce tam açılıp sonra gizleniyor/yeniden sıralanıyor (CLS + yetki görünümü) · **Orta** · Efor S (Y3'teki kabuk konfigürasyonu ile birlikte)

**Kanıt:** `components/dashboard/sidebar.tsx:327-330` başlangıç `menuVisibility = {}`, `sidebarOrder = null`; `:346-430` üç `no-store` istek sonrası menü öğeleri gizleniyor/yer değiştiriyor.
**Sorun:** her tam yüklemede menü "zıplıyor"; admin'in kapattığı modüller bir an görünüyor.
**Öneri:** konfigürasyon layout'tan prop olarak gelsin (ilk render'da doğru menü). Geçici çözüm olarak veri gelene kadar menü iskeleti gösterin.

---

### O2 — Global/public ayar uçları her istekte DB'ye gidiyor ve CDN'de önbelleklenmiyor · **Orta** · Efor S

**Kanıt:** `app/api/settings/seasonal-concept/route.ts:20` (her sayfa görüntülemesinde, `Providers` içinden), `app/api/settings/background/route.ts:7`, `sidebar-order`, `sidebar-groups` uçları `PRIVATE_NO_STORE_HEADERS` + `force-dynamic`. Repo genelinde yalnız 3 API `s-maxage` kullanıyor (ör. `app/api/settings/theme/route.ts:7`).
**Sorun:** anonim QR ziyaretçisi dahil her sayfa görüntülemesi en az 1–2 fonksiyon çağrısı + DB sorgusu üretiyor; içerik herkes için aynı.
**Öneri:** bu uçları `unstable_cache` (tag'li) + `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` ile servis edin; admin kaydında `revalidateTag`. Uzun vadede Y3 kapsamında RSC prop'una taşıyın ve istemci isteğini tamamen kaldırın.

---

### O3 — Landing her istekte dinamik render; giriş yapmış kullanıcı yönlendirmesi istemcide · **Orta** · Efor M

**Kanıt:** `app/(public)/page.tsx:21-26` `getServerLocale()` → `cookies()` sayfayı dinamik yapıyor; canlıda `/` yanıtı `Cache-Control: private, no-cache, no-store` ve `X-Vercel-Cache: MISS` (3 ölçümde TTFB 0,26–0,32 sn, statik `/blog` HIT 0,25 sn). `app/(public)/home-client.tsx:25-35` oturum açıkken hidrasyon sonrası `router.push`. Ayrıca `proxy.ts:91-93`'teki `pathname === '/'` kontrolü ölü kod: `proxy.ts:124` matcher `/`'yi kapsamıyor.
**Sorun:** sıcakken fark küçük ama soğuk başlangıçta ve trafik artışında landing, CDN yerine fonksiyondan servis ediliyor. Giriş yapmış kullanıcı landing'i indirip hidrate ettikten sonra yönlendiriliyor (boşa ~490 KB).
**Öneri:** landing'i statik/ISR yapın (dil için `?lang=` veya proxy'de çerez → `/en` rewrite). Oturum yönlendirmesini proxy'ye taşıyın (matcher'a `/` ekleyip yalnız token varsa redirect). Ek not (kapsam dışı, güvenlik raporuna): matcher `/staff/:path*`'i de kapsamıyor; `roleRouteMap`'teki `/staff` kontrolü çalışmıyor.

---

### O4 — Geri bildirim gönderim yolu ~15 seri DB/Redis turu içeriyor · **Orta** · Efor S–M

**Kanıt (`app/api/feedbacks/route.ts`):** rate limit `:171` → session `:186` → QR `:201` → QR rate limit `:221` → idempotency `:237` → create `:243` → QR `scanCount` update `:261` → trust `:272` → puan matrisi `:284` → gamification ayarları `:305` → interaktif transaction `:308` (içinde 5–6 ifade) → notification `:373` → analyticsEvent `:391`. Redis rate limit'i tek istek için 2–3 ayrı REST turu: `lib/redis.ts:40-47` (`incr`, ilk seferde `expire`, her seferinde `pttl`).
**Sorun:** QR hunisinin "gönder" anı gereksiz yere seri gecikme biriktiriyor; ayrıca `revalidateTag(LEADERBOARD_RANKING_TAG)` her feedback'te liderlik önbelleğini bayatlatıyor (`:423-426`), yoğun saatte isabet oranını düşürüyor.
**Öneri:** bağımsız okumaları (`session`, QR, iki rate limit, idempotency) `Promise.all` ile paralelleştirin; `scanCount` artırımı, bildirim ve analytics olayını `after()`'a veya mevcut outbox'a taşıyın; Redis rate limit'ini tek `EVAL` (Lua) veya `pipeline` ile tek tura indirin; liderlik tag'ini her feedback yerine 60 sn'lik zamanlayıcıya bırakın.

---

### O5 — Feedback'te `dealerId` yok; bayi sorguları her seferinde QRCode üzerinden join ediyor · **Orta** · Efor M

**Kanıt:** `prisma/schema.prisma:766-856` `Feedback` modelinde yalnız `qrCodeId` var; `app/api` + `lib` içinde **80** sorgu `qrCode: { dealerId }` filtresi kullanıyor.
**Sorun:** bayi panosu, analitik, VoC, benchmark gibi en sık sorgular her seferinde alt sorgu/join ile çalışıyor; `(dealerId, createdAt)` gibi doğrudan bir indeks kurulamıyor.
**Öneri:** `Feedback.dealerId` (denormalize) + `@@index([dealerId, createdAt])` + `@@index([dealerId, deletedAt, createdAt])`; yazma yolunda QR'dan doldurulur; backfill tek SQL. Canlı Neon'a şema değişikliği olduğu için ayrı, onaylı bir göç penceresinde yapılmalı.

---

### O6 — Global arama `ILIKE '%q%'` ile birden çok tabloda; trigram indeksi yok · **Orta** · Efor S

**Kanıt:** `app/api/search/route.ts:43` `{ contains: q, mode: 'insensitive' }`; admin için kullanıcı ad/e-posta/işletme adı ve feedback metninde. Şemada `pg_trgm`/GIN yok (`prisma/schema.prisma` taraması). İstemci debounce'u var (`components/dashboard/header.tsx:188`).
**Sorun:** feedback tablosu büyüdükçe her tuş vuruşu grubu sıralı tarama (seq scan) yapar.
**Öneri:** `CREATE EXTENSION pg_trgm` + `GIN (lower(text) gin_trgm_ops)` indeksleri (göç olarak), ya da feedback araması için `tsvector` kolonu. Arama sonuçlarını kişi + sorgu bazında 30 sn Redis'te tutmak da yeterli bir ara çözüm.

---

### O7 — İsteğe bağlı kütüphaneler statik import edilmiş, tembel yükleme kazanımı kayboluyor · **Orta** · Efor S

**Kanıt**
- `app/dealer/qr-codes/page.tsx:7,65`: `jszip` ve `qrcode` statik (yalnız indirme anında gerekli).
- `components/auth/two-factor-settings.tsx:4`: `qrcode` statik (ayarlar sayfası paketine giriyor).
- `components/gamification/spin-wheel.tsx:5` `canvas-confetti` statik; müşteri ana sayfası SpinWheel'i import ediyor (`components/customer/dashboard/customer-dashboard.tsx:60`), bu da `lib/effects/confetti.ts`'teki tembel yükleme çabasını boşa çıkarıyor. Aynısı `app/customer/quests/page.tsx:35`, `components/customer/games/game-shell.tsx:5`, `lucky-wheel-game.tsx:4`.
- Tam `motion` importu kalan 5 dosya: `app/dealer/campaigns/page.tsx`, `app/dealer/surveys/page.tsx`, `app/dealer/surveys/create/page.tsx`, `components/customer/games/truth-vs-fake-game.tsx`, `components/team/team-board.tsx`.
- `components/providers.tsx:6,241`: `domAnimation` kök pakette senkron; `LazyMotion features={() => import(...).then(m => m.domAnimation)}` ile ertelenebilir.
**Öneri:** bunları `await import()` / `next/dynamic`'e çevirin; ESLint `no-restricted-imports` ile `framer-motion`'dan `motion`, `canvas-confetti`, `jszip`, `qrcode` statik importunu yasaklayın (istisna listesiyle).

---

### O8 — Web Vitals: sayfa başına 5 ayrı kimlik doğrulamalı POST, veri bellekte kayboluyor · **Orta** · Efor S

**Kanıt:** `components/telemetry/web-vitals-reporter.tsx:17-36` her metrik için ayrı `fetch` (LCP/INP/CLS/FCP/TTFB); uç `app/api/user/web-vitals/route.ts:20` `requireAuth` (session + token-replay); `lib/rum-web-vitals.ts:2` "In-memory … samples": örnekler fonksiyon örneği başına bellekte, örnekler arası paylaşılmıyor. Kökte ayrıca Vercel Speed Insights var (`app/layout.tsx:169`).
**Sorun:** her panel sayfası için 5 ekstra fonksiyon çağrısı; toplanan veri ölçekte anlamsız (instance başına).
**Öneri:** Speed Insights yeterliyse bu raporlayıcıyı kaldırın. İç RUM gerekiyorsa `navigator.sendBeacon` ile `visibilitychange`'te tek toplu gönderim, %10 örnekleme, Redis'te `HINCRBY` kovaları (p75 için histogram).

---

### O9 — Push service worker'ı next-pwa SW'si ile aynı kapsamda yarışıyor · **Orta** · Efor S

**Kanıt:** `hooks/use-push-notifications.ts:10-13,21-23` ayarlar bileşeni mount olduğunda `/push-sw.js`'i `scope: "/"` ile kaydediyor; next-pwa `/sw.js`'i de `/` kapsamında kaydediyor (`next.config.js:5`). Canlı `sw.js`'te `push` dinleyicisi yok (yalnız `/push-sw.js` precache girişi olarak geçiyor).
**Sorun:** bir kapsamda tek SW olabilir; ayarlar sayfası açıldığında push-sw, workbox SW'nin yerine geçiyor (offline/precache gidiyor), sonraki tam yüklemede next-pwa tekrar `sw.js`'i kaydediyor ve push dinleyicisi gidiyor. Hem yeniden kurulum maliyeti var hem de push bildirimleri gösterilmeyebilir (canlıda tarayıcıyla **doğrulanmadı**).
**Öneri:** push dinleyicisini tek SW'ye birleştirin (next-pwa `importScripts: ['/push-sw.js']` veya Serwist'te özel worker). Hook yalnız `navigator.serviceWorker.ready` kullansın, `register` çağırmasın.

---

### D1 — `next/image` yapılandırması ve statik varlık önbelleği · **Düşük** · Efor S

**Kanıt:** `next.config.js` `images.remotePatterns` içinde R2 public host'u yok, buna karşın eski Supabase/Netlify/localhost host'ları duruyor; bu yüzden R2 görselleri `unoptimized` ile basılıyor (10 kullanım, ör. `components/customer/showcase-selector.tsx:230,403,443`, `app/dealer/dealer-dashboard-client.tsx:759`). `formats` tanımlı değil (yalnız WebP). Canlı `/images/*` yanıtı `max-age=0, must-revalidate` (her kullanımda yeniden doğrulama turu).
**Öneri:** R2 host'unu ekleyip `unoptimized`'ları kaldırın; `formats: ['image/avif','image/webp']`; hash'li dosya adlarıyla `/images/**` için `immutable` başlık; kullanılmayan host'ları temizleyin.

### D2 — Kök sağlayıcıda gereksiz tekrar fetch ve kök paket fazlalıkları · **Düşük** · Efor S

**Kanıt:** `components/providers.tsx:110-113` SSR'dan gelen tema satırlarına rağmen mount'ta tekrar fetch; `:89` istemci `fetch`inde `next: { revalidate: 60 }` etkisiz. `components/chat/chatbot-lazy.tsx` sohbet botu (797 satır) her sayfada hidrasyondan hemen sonra indiriliyor; `components/chat/chatbot.tsx:624` 1,66 MB `chatbot.png`'yi ham `<img>` ile kullanıyor.
**Öneri:** tema tekrar çekimini yalnız `qratex:theme-palette-changed` olayına bağlayın; chatbot'u `requestIdleCallback` sonrası veya ilk etkileşimde yükleyin, QR hunisinde hiç yüklemeyin; `chatbot.png`'yi 128 px WebP yapın.

### D3 — Küçük sorgu kalıpları · **Düşük** · Efor S

- `app/api/customer/character-leaderboard/route.ts:51-60`: tüm kullanıcıları `groupBy` edip JS'te sıralayıp 20'ye kesiyor → `orderBy: { _count: { userId: 'desc' } }, take: 20`. `UserBadge` için `(badgeId, earnedAt)` bileşik indeksi faydalı (`prisma/schema.prisma:641-642` yalnız tekil indeksler var).
- `lib/character-badges.ts:361-370`: kategori başına döngüde tüm yorum metinlerini çekip uzunluk sayıyor → tek `$queryRaw` ile `COUNT(*) FILTER (WHERE length(trim(text)) >= $min)` ve `GROUP BY "characterCategory"`.
- `app/api/customer/showcase/route.ts:24-31`: `include: { cosmetic: true }` / `include: { badge: true }` tüm kolonları döndürüyor ve dashboard'da 60 sn'de bir çağrılıyor → `select` ile daraltın.
- `app/api/customer/stats/route.ts:28-33`: son 5 feedback'i `select`'siz çekiyor (Y6 nedeniyle `media` base64 dahil olabilir) → `select` ekleyin.

### D4 — Paket hijyeni · **Düşük** · Efor S

`geist`, `zustand`, `@tanstack/react-table` bağımlılıkları kodda hiç import edilmiyor (grep: 0). Paket boyutuna etkisi yok ama kurulum ve denetim yüzeyini büyütüyor. Global CSS tek dosya, 301 KB ham / 43 KB gzip, render'ı bloklar. Tailwind `content` yapılandırması doğru (`tailwind.config.ts:5-11`); büyüklük panellerin toplamından geliyor, kabul edilebilir.

---

## 4. Hedef mimari

### 4.1 İlkeler

1. **Sunucu önce, ada (island) sonra:** `page.tsx` ve `layout.tsx` server component; etkileşimli parçalar küçük client adaları. Veri, sunucuda başlayıp `HydrationBoundary` ile React Query'ye devredilir.
2. **Kabuk bir kere, sunucuda:** rol bazlı menü, modül kontrolleri, tema, dönemsel konsept ve dil `getShellConfig(role, locale)` ile (unstable_cache + tag) layout'ta çözülür, prop olarak iner. İstemcide kabuk için sıfır istek.
3. **Huni rotaları hafif:** `app/(funnel)/` (QR feedback, kart `/c/[token]`) için ayrı minimal layout; bütçe ≤ 150 KB gzip JS, arka plan animasyonu yok, sohbet botu yok, SW kaydı yok.
4. **Global hesap global önbellekte:** kullanıcıdan bağımsız agregasyonlar (trend, platform dağılımı, liderlik) Redis'te global anahtarla veya cron ön-agregasyonunda; kişisel katman hafif ve ayrı.
5. **Gerçek zamanlı tek kanal:** SSE + Redis sürüm sayacı; görünmez sekmede kapalı.
6. **Varlıklar hattan geçer:** her görsel boyut varyantlı WebP/AVIF, hash'li ad, `immutable` önbellek; SVG yalnız gerçek vektör için ve SVGO'dan geçmiş.
7. **Bütçeler CI'da:** bundle analyzer + rota başına JS bütçesi, Lighthouse CI (`/`, `/feedback/[code]`, `/customer`), `public/` dosya boyutu bütçesi.

### 4.2 Müşteri ana sayfası hedef akışı

```
GET /customer  (server)
 ├─ layout: getShellConfig('CUSTOMER', locale)  ← unstable_cache, tek DB/Redis turu
 │    → <Sidebar config=…> <Providers locale=… messages=pick(ns)>
 └─ page:   prefetchQuery(['customer','stats'])  ← kritik, tek sorgu kümesi
      <HydrationBoundary>
        <StatsHero/>                        (anında, SSR)
        <Suspense><TrendingVenues/></Suspense>   ← Redis global anahtar
        <Suspense><RewardsAndSpin/></Suspense>
        <Suspense><LeaderboardTop5/></Suspense>  ← unstable_cache
      </HydrationBoundary>
İstemci: yalnız etkileşimler + görünürken 60 sn'lik hafif yenileme
```

Beklenen etki: soğuk açılışta ~18 API çağrısı → 1 HTML + 0–2 API; LCP hidrasyondan bağımsız.

### 4.3 Hedef metrikler

| Metrik | Bugün (ölçülen/çıkarım) | Hedef |
|---|---|---|
| `/feedback/[code]` JS aktarım | ~469 KB | ≤ 150 KB |
| Landing JS aktarım | ~488 KB | ≤ 200 KB |
| SW precache | ~370 MB (1.213 giriş) | ≤ 3 MB |
| Liderlik sayfası görsel aktarımı (en kötü) | ~181 MB + 24,5 MB | ≤ 1,5 MB |
| Müşteri ana sayfası soğuk açılış API çağrısı | ~18 + 5 beacon | ≤ 3 |
| Açık bayi sekmesi DB sorgusu/dk (boşta) | ~12–50+3 | ~0 (Redis sürüm kontrolü) |

---

## 5. Adım adım geçiş planı

### Faz 0 — Kanamayı durdur (1–3 gün, düşük risk, en yüksek kazanç)
1. **K1:** `next.config.js`'e `publicExcludes` + `buildExcludes`; QR hunisinde SW kaydını kapat. Doğrulama: canlı `sw.js` giriş sayısı ve DevTools Cache Storage boyutu.
2. **K2:** avatar/rozet/maskot/chatbot görsellerini betikle WebP varyantlarına dönüştür (yeni dosyalar; eski SVG'ler bir süre yerinde kalır), `lib/avatar-options.ts` ve `lib/league-avatars.ts`'i yeni URL'lere çevir, liderlikte rastgele varsayılan avatar atamasını kaldır (`app/customer/leaderboard/page.tsx:84`).
3. **O9:** push dinleyicisini tek SW'ye taşı.
4. **O2:** `seasonal-concept`, `background`, `sidebar-order`, `sidebar-groups` uçlarına `unstable_cache` + `s-maxage`.

### Faz 1 — Paket diyeti (1 hafta)
5. **Y2:** `app/(funnel)` rota grubu + minimal layout; arka plan varyantlarını dinamik yap; varsayılan arka planı CSS keyframes'e çevir.
6. **Y1-a:** `AppLocaleProvider initialLocale` (dil flash'ı biter).
7. **O7:** jszip/qrcode/confetti/motion statik importlarını kaldır + ESLint kuralı.
8. **D2:** chatbot'u idle/etkileşimde yükle, huni rotalarında hiç yükleme.
9. Bundle bütçesi: `npm run analyze` çıktısını CI'da rota başına eşiklerle kontrol et.

### Faz 2 — Kabuk ve gerçek zamanlı (1–2 hafta)
10. **Y3-a / O1:** `getShellConfig` ile layout'tan Sidebar/Providers'a prop; sidebar, seasonal, tema istemci isteklerini kaldır.
11. **Y5:** SSE + Redis `notif:ver` sayacı; `NotificationCenter` polling'ini SSE'ye bağla; tüm `setInterval` polling'lerine görünürlük koruması (ortak `useVisibleInterval` hook'u).
12. **O8:** web-vitals raporlayıcısını kaldır veya beacon + örnekleme.
13. **Y1-b:** sözlükleri namespace + dil bazında böl; önce huni ve landing, sonra paneller.

### Faz 3 — Veri mimarisi (2–4 hafta, sayfa sayfa)
14. **Y4:** discovery/benchmark/admin analytics'i SQL `GROUP BY` + global Redis anahtarına taşı; günlük cron `DailyDealerStats`'ı doldursun, okuyucular oradan beslensin.
15. **Y3-b:** en çok trafik alan 10 sayfayı (müşteri ana, liderlik, rozetler, ödüller, bayi ana, bayi feedback'ler, bayi analitik, admin ana, QR huni, kart) "server page + HydrationBoundary + Suspense" desenine geçir; `/api/customer/home` BFF ucu.
16. Sidebar'da intent-based prefetch.
17. **O4:** feedback POST yolunu paralelleştir, yan etkileri `after()`/outbox'a taşı, Redis rate limit'ini tek tura indir.

### Faz 4 — Veritabanı (onaylı göç pencereleri, canlı Neon)
18. **Y6:** presigned R2 upload + istemci sıkıştırma; `media` doğrulamasını sıkılaştır; base64 satırları için backfill.
19. **O5:** `Feedback.dealerId` + bileşik indeksler + backfill; sorguları kademeli olarak `dealerId`'ye çevir.
20. **O6:** `pg_trgm` GIN indeksleri.
21. **D3:** küçük sorgu düzeltmeleri, `UserBadge(badgeId, earnedAt)` indeksi.

### Sürekli
- Lighthouse CI (mobil profil) `/`, `/feedback/[code]`, `/customer` için; LCP ≤ 2,5 sn, INP ≤ 200 ms, CLS ≤ 0,1 eşikleri.
- `public/` boyut bütçesi betiği; yeni görseller için PR kontrolü.
- Speed Insights'ta rota bazlı p75 takibi (mevcut, `app/layout.tsx:169`).

---

## 6. Doğrulanmayan / sınırlı noktalar

- SW install'ının kota aşımında tekrar tekrar denenip denenmediği ve push/precache SW'lerinin birbirinin yerine geçtiği, gerçek tarayıcıda gözlemlenmedi; Workbox ve Service Worker semantiğinden çıkarım (K1, O9).
- Vercel 4,5 MB gövde sınırına takılan feedback gönderimleri canlıda denenmedi (Y6). Kodda base64'ün kabul edildiği doğrulandı.
- `components/charts/index.ts` barrel'inden yalnız `RatingDistributionBar`/`MiniSparkline` import eden bayi ana sayfasına recharts'ın sızıp sızmadığı derleme manifestinden kesinleştirilemedi (`app/dealer/dealer-dashboard-client.tsx:44`). Bundle analyzer ile bakılmalı.
- Canlı veri hacmi (feedback satır sayısı) bilinmediği için Y4'teki tavanların bugün ne sıklıkla dolduğu ölçülmedi. Veritabanına dokunulmadı.

---

## Uygulama sonrası durum

> Tarih: 2026-10-11 · Dal: `feat/platform-overhaul` · Yöntem: her bulgu ŞİMDİKİ koda karşı yeniden denetlendi (dosya okuma + grep + yerel ölçüm; DB'ye, dev server'a ve build'e dokunulmadı). Bu turun commit'leri: `ef803ba2` (paket/varlık/sıcak yol) ve ardından gelen bildirim tek kanal + arama önbelleği + korkuluk testi commit'i. Önceki dalgalarda kapatılanlar (P0-37, nav kabuğu `fc16832f`, landing `67763e8d`, gözlemlenebilirlik `3b039bcc`, mimari-api B9 `01827121`) kanıtıyla birlikte sayıldı.

### Bulgu bulgu

| # | Durum | Kanıt (şimdiki kod) |
|---|---|---|
| **K1** SW tüm `public/`'i precache ediyor | **KAPANDI** | `config/pwa.js`: `PUBLIC_EXCLUDES` (images/videos/mascot/logo/uploads hariç), `BUILD_EXCLUDES` yalnız kabuk chunk'ları (webpack/main-app/framework/polyfills/CSS/font/manifest), `register: false`; SW yalnız oturumlu panelde ve tarayıcı boşa düşünce kaydedilir (`components/pwa/service-worker-registrar.tsx`, `lib/pwa/service-worker.ts`), QR hunisi hiç kaydetmez. Görseller çalışma anında `maxEntries`'li önbelleklerde. `__tests__/config/pwa-options.test.ts`. `public/` 343 MB → **52 MB**. |
| **K2** 3,4 MB avatar SVG'leri, rozetler | **KAPANDI** | Avatarlar aynı yolda ~25 KB ince SVG + içerik hash'li 512 px WebP (`public/images/avatar/opt`, ~11 KB), `/images/(avatar/badges)/opt/*` 1 yıl `immutable` (`config/security-headers.js`). Bu tur: **Radix `AvatarImage` hazır avatar yolunu tek yerden WebP'ye çözer** (`components/ui/avatar.tsx` → `resolveAvatarImage`) — header, sidebar, ekip, lig, klan, sohbet dahil ~30 nokta. Rozetler 320 px WebP küçük resim (`lib/badge-images.ts`); bu tur kalan ham SVG noktaları da geçti: admin rozet galerisi/katalog/sheet (`a-rozetler/parts.tsx` `glyphSource`, `badge-editor.tsx`), karakter açılışı (`character-reveal.tsx`), Yılım rozetleri (`m-yilim/parts.tsx`). Sohbet maskotu 1,66 MB PNG → **7 KB WebP** (`public/logo/chatbot-mascot.webp`). Lig ekranı görselsiz kullanıcıda baş harf gösterir (`m-lig/lig-avatar.tsx`), rastgele avatar atanmaz. Korkuluk: izin listesi dışında 300 KB üstü public dosyası ve arayüzde `/logo/chatbot.png` CI'da düşer. |
| **Y1** TR+EN sözlüğün tamamı her sayfada | **KAPANDI** | `i18n/core.ts` sözlüksüz çekirdek (dil listesi + saf `translate`); `i18n/request.ts` yalnız sunucu; `lib/app-locale.tsx` yalnız **TR**'yi statik alır, EN yalnız seçilince ayrı parça olarak bir kez iner. Koddan hiç anılmayan **82 ölü namespace** `messages/{tr,en}.json`'dan çıkarıldı (kalan 25 namespace HEAD ile birebir aynı, doğrulandı). Ortak paketteki sözlük payı **314 KB ham / ~98 KB gzip → 66 KB ham / ~17 KB gzip** (yalnız TR). Korkuluk: istemci modülünden `@/i18n/request` ya da `messages/en.json` statik içe aktarımı CI'da düşer. |
| **Y2** 27 arka plan varyantı + 34 sonsuz animasyon + tekrar fetch | **KAPANDI** | Varsayılan zemin statik gradyan, JS animasyonu yok; özel/sezonluk zemin `next/dynamic` + `<Ambient>` (gizli sekme ve azaltılmış harekette durur), değer SSR prop'u (`components/public/p-landing/public-backdrop.tsx`); QR hunisi ayrı `app/(funnel)/` grubu. Bu tur: `dynamic-background.tsx` 27 varyantı statik import etmiyor — **seçili varyant `React.lazy` ile tek başına** iner (≈7.300 satırın yalnız biri); ayar ucu CDN önbelleğini atlamıyor. Korkuluk: varyant modülünün statik içe aktarımı CI'da düşer. |
| **Y3** Boş kabuk + istemci fetch şelalesi | **KAPANDI** | 247 `page.tsx`'in yalnız **3**'ü `'use client'` (152/200'den); müşteri ana sayfası sunucuda `loadCustomerHome` + `HydrationBoundary` (`app/customer/page.tsx`), 20 sayfa aynı desende; panel kabuğu (menü görünürlüğü/sıra/gruplar/modül) sunucuda çözülüp prop iner (`fc16832f`); sidebar'da `prefetch={false}` yok; React Query 265 dosyada. Kabukta kalan istemci istekleri: bayi rozet sayısı, dönemsel konsept ve tema — son ikisi CDN önbellekli (`s-maxage`), DB'ye gitmez. |
| **Y4** Global agregasyonlar bellekte | **KAPANDI** | Keşif sinyalleri bu tur **iki `GROUP BY`** (`lib/discovery/compute.server.ts` `loadSignals`): 25k+20k satır taşınmıyor, `take` tavanı (sessiz eksik sayım) ve diziyi her öğede kopyalayan kuadratik `push` yok; sonuç 120 sn global Redis anahtarı (`discovery:signals:v3`), ad/görsel yalnız gösterilen ≤11 işletme için. Eski `/api/dealer/benchmark` emekli (yenisi k-anonim, önbellekli); eski `/api/admin/analytics` silindi, yerine tamamen SQL `GROUP BY`/`date_trunc` (`lib/admin-analytics/load.ts`); okuyucusuz preagg emekli (tablo düşürme veri-modeli şema isteğinde). |
| **Y5** İki paralel bildirim mekanizması, görünmez sekmede polling | **KAPANDI** | Ağ yoklayan tüm `setInterval`'ler görünürlük korumalı ya da React Query (arka planda durur); kalan `setInterval`'ler yalnız yerel saat etiketi. SSE gizli sekmede kapanır, imleçle yeniden bağlanır (`01827121`); sunucu yoklaması uyarlanır (1,2–5 sn). Bu tur **tek kanal**: SSE canlıyken bildirim merkezi 20 sn yoklamayı bırakır, liste akış olayıyla (400 ms birleştirilmiş tek istek) + 5 dk güvenlik turuyla tazelenir; akış kopunca anında eski yoklamaya döner (`lib/notification-stream-bus.ts`). Admin'in 5 sn'lik tüm-pano tick'i dosyasıyla birlikte kalktı. |
| **Y6** Fotoğraflar base64 JSON → DB | **KAPANDI (kod)** / veri işlemi isteği | Yeni huni R2'ye yükler; `acceptedMediaUrls` yalnız kendi R2 host'umuz + QR'a bağlı anahtarı kabul eder, `data:` reddedilir (`lib/feedback-funnel/media.ts`; eski `POST /api/feedbacks` de aynı çekirdek). Bu tur müşteri istatistiği son geri bildirimleri `select` ile okur. **Eski base64 satırların R2'ye taşınması** canlı veri işlemi → `SCHEMA-REQUESTS.md` (performans). |
| **O1** Menü önce açılıp sonra gizleniyor | **KAPANDI** | Menü yapılandırması layout'tan prop (`fc16832f`); `sidebar.tsx`'te görünürlük/sıra/grup isteği yok. |
| **O2** Global ayar uçları her istekte DB, CDN yok | **KAPANDI** | `seasonal-concept` ve `background` `public, s-maxage=60, stale-while-revalidate=300`; tema `s-maxage`; sidebar-order/groups istemci istekleri kalktı (kabuk sunucuda). |
| **O3** Landing dinamik, istemci yönlendirmesi | **KAPANDI (bilinçli dinamik)** | Oturumlu kullanıcı SUNUCUDA `roleHome`'a yönlenir (istemci `router.push` ve ~490 KB boşa indirme yok); veri (istatistik, planlar, kazanç önizlemesi) önbellekli ve fail-safe; ölü `proxy.ts` `/` kontrolü kaldırıldı, `/staff` matcher'da. Sayfa dil çerezi + oturum nedeniyle istek başına render'lanır (ölçülen TTFB 0,26–0,32 sn); CDN'e almak dil için ayrı `/en` rotası gerektirir — ürün kararı, performans borcu değil. |
| **O4** Gönderim yolu ~15 seri tur | **KAPANDI** | Yan etkiler (`scanCount`, bildirim, analitik, AI) `scheduleFeedbackSideEffects` ile yanıt sonrası; liderlik etiketi `revalidateTag(tag, 'max')` (bayat-sun-arkada-yenile). Bu tur: QR hız sınırı + personel + çıkar çatışması + puan matrisi **tek `Promise.all`** turunda (`lib/feedback-funnel/submit.ts`); Redis oran sınırı **INCR+PEXPIRE+PTTL tek Lua turu** (`lib/redis.ts`) — `defineRoute`'taki TÜM oran sınırlı uçlarda 2–3 sıralı REST turu → 1; TTL'siz kalmış sayacın kalıcı kilit olması da onarıldı. |
| **O5** `Feedback.dealerId` yok | **KALDI (şema)** | Şema değişikliği ajanlara yasak → `SCHEMA-REQUESTS.md` (göç + backfill + kademeli okuyucu planı). Mevcut `(qrCodeId, deletedAt, createdAt)` bileşik indeksi bayi gelen kutusunu karşılıyor. |
| **O6** Arama ILIKE, trigram yok | **KAPANDI (ara çözüm)** / şema isteği | `/api/search` kişi + rol + sorgu anahtarıyla 30 sn Redis önbellekli (önerilen ara çözüm), oran sınırlı, tür başına `take: 5`. `pg_trgm` GIN indeksleri `SCHEMA-REQUESTS.md`'de. |
| **O7** İsteğe bağlı kütüphaneler statik | **KAPANDI** | three/leaflet/recharts/qrcode/confetti `dynamic`/`lazyChart`/`import()` arkasında; tam `motion` importu sıfır. Bu tur: 2FA `qrcode` yalnız kurulumda; ekip panosu ve grafik barrel'ı recharts'ı tembel sürümle verir (rapor §6'daki barrel sızıntı şüphesi de kapandı). Korkuluk (`__tests__/architecture/perf-bundle-guards.test.ts`): ağır kütüphane modülünün istemciden statik içe aktarımı ve tam `motion` CI'da düşer (paylaşılan ESLint yapılandırmasına dokunmadan jest). Kök `domAnimation` senkron bırakıldı (~15 KB gzip): tembel yüklemek `initial` durumundaki öğeleri özellikler inene kadar görünmez bırakır (LCP riski). |
| **O8** Web Vitals: 5 ayrı POST, bellekte kayboluyor | **KAPANDI** | `components/telemetry/web-vitals-reporter.tsx`: sayfa gizlenince TEK `sendBeacon`, sunucu tarafı derece, Upstash saatlik kovalarda kalıcı p75 (`3b039bcc`). |
| **O9** Push SW ile next-pwa SW yarışı | **KAPANDI** | Tek SW: `importScripts: ['/push-sw.js']` (`config/pwa.js`); `register` yalnız `lib/pwa/service-worker.ts`'te. |
| **D1** `next/image` / statik varlık önbelleği | **KAPANDI** | R2 host'u env'den `remotePatterns`'e ekleniyor, joker Supabase/Netlify host'ları kalktı; `/images,/icons,/logo,/mascot,/videos` `max-age=86400, stale-while-revalidate=30 gün` (eskiden `max-age=0`), hash'li çıktı `immutable`. Kalan `unoptimized` kullanımları bilinçli: SVG kozmetik/ödül görseli ve keyfi uzak host (etkinlik görseli). |
| **D2** Kökte tekrar fetch, sohbet botu hemen iniyor | **KAPANDI** | Sohbet botu parçası bu tur **tarayıcı boşa düşünce** (en geç 4 sn) iner, huni ve çıplak yüzeylerde hiç inmez (`components/chat/chatbot-lazy.tsx`); maskot 7 KB WebP, gereksiz `priority` kalktı. Tema SSR satırlarıyla hazır başlar; mount'taki tek doğrulama isteği CDN önbellekli `/api/settings/theme`'e gider (DB yok) — tasarım-sistemi sahibinin bilinçli tazelik kontrolü, korundu. |
| **D3** Küçük sorgu kalıpları | **KAPANDI** / 1 şema isteği | Karakter haftalık liderliği haftaya pencereli `groupBy` (kullanıcının gerçek sırası için grup sayımı gerekli — bilinçli); müşteri istatistiği `select`; karakter barı uzunluk-şartlı sayım kullanıcı başına tek küçük sorgu. `UserBadge(badgeId, earnedAt)` indeksi `SCHEMA-REQUESTS.md`'de. |
| **D4** Kullanılmayan bağımlılıklar | **KALDI** | `geist`, `zustand`, `@tanstack/react-table` hâlâ `package.json`'da, kodda 0 import. Çıkarmak lockfile'ı yeniden üretmeyi gerektirir (`npm install` bu turda yasak; lockfile'sız `package.json` değişikliği Vercel `npm ci`'yi kırar). Paket boyutuna etkisi yok. |

### Önce / sonra

| Ölçüt | Denetimde | Şimdi |
|---|---|---|
| SW precache | ~370 MB / 1.213 giriş | yalnız kabuk (webpack/framework/main-app/polyfills/CSS/font) |
| `public/` | 343 MB | 52 MB (41 MB'ı rozet vektör kaynakları; arayüz 320 px küçük resim kullanır) |
| Avatar (14–48 px) | 3,4 MB SVG | ~11 KB WebP, 1 yıl immutable |
| Sohbet maskotu | 1,66 MB PNG | 7 KB WebP |
| Ortak paketteki i18n | 314 KB ham / ~98 KB gzip (TR+EN) | 66 KB ham / ~17 KB gzip (yalnız TR; EN istenince ayrı parça) |
| Public arka plan | 27 varyant statik + 34 sonsuz framer animasyonu | statik gradyan; özel zemin yalnız seçili varyant, gizlide durur |
| `'use client'` `page.tsx` | 152 / 200 | 3 / 247 |
| Müşteri ana sayfası açılış verisi | ~18 API + 5 beacon | SSR + HydrationBoundary (açılışta veri isteği yok) + tek beacon |
| Keşif sinyali | 45k satır belleğe, 25k tavan | 2 GROUP BY, tavansız, 120 sn global Redis |
| Oran sınırı (her uç) | 2–3 sıralı Upstash turu | 1 Lua turu |
| Açık bayi sekmesi | SSE + 20 sn bildirim yoklaması | yalnız SSE (+5 dk güvenlik turu), gizlide kapalı |

### Dalgaların getirdiği regresyon taraması

- **Döngü içinde `await prisma` (N+1):** `app/api` + `lib` (cron/iç iş hariç) tarandı; kalanlar admin toplu işlemleri (sınırlı, kayıt başına yazma zorunlu), kullanıcı başına birkaç öğeli görev döngüleri ya da tarayıcı yanlış pozitifi. Sıcak yolda yeni N+1 yok.
- **Sınırsız `findMany`:** müşteri/bayi/public uçları + ana sayfa/lig/huni yükleyicileri tarandı; `take`'siz kalanlar kullanıcı başına oyun günü kovalı sorgular.
- **Statik ağır kütüphane / tam `motion`:** bulunan son noktalar (ekip panosu grafikleri, 2FA qrcode, grafik barrel'ı) bu turda kapandı; korkuluk testi yenilerini engelliyor.
- **Ham büyük görsel:** dalga 2'de yazılan rozet/karakter/yıl ekranlarında ham SVG kalmıştı (admin katalog, karakter açılışı, Yılım) — küçük resme geçti.

### Kalan maddeler

1. **O5** `Feedback.dealerId` + bileşik indeks (şema isteği, göç penceresi).
2. **O6** `pg_trgm` GIN indeksleri (şema isteği; ara çözüm canlıda).
3. **Y6** eski base64 `media` satırlarının R2'ye taşınması (canlı veri işlemi; şema isteği dosyasında ölçüm sorgusu ve plan).
4. **D3** `UserBadge(badgeId, earnedAt)` indeksi (şema isteği).
5. **D4** üç kullanılmayan bağımlılığın lockfile ile birlikte çıkarılması (`npm install` gerektirir).
6. Ölçüm: bu turdaki paket kazanımları build alınmadan koddan hesaplandı; bir sonraki deploy'da `/feedback/[code]` ve `/` chunk aktarımı ile Speed Insights p75 yeniden ölçülmeli (Lighthouse CI hâlâ yok).

### Yeni puan: **9 / 10**

Gerekçe: denetimin puanı aşağı çeken üç sistemik karar (kontrolsüz varlık katmanı + her ziyaretçiye 370 MB SW, şişkin ortak paket, boş kabuk + istemci şelalesi) tamamen kapandı ve korkuluk testleriyle kilitlendi; sıcak yolun kalan seri turları (oran sınırı, huni gönderimi, bildirim çift kanalı, keşif agregasyonu) bu turda tek tura/SQL'e indi. 10'a engel olanlar kod dışı: üç şema/göç isteği (Feedback.dealerId, trigram, UserBadge indeksi), eski base64 satır backfill'i ve gerçek build/Lighthouse ölçümüyle doğrulanmamış paket bütçesi.

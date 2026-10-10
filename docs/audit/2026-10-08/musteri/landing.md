# /

**Amaç** · Qratex'in herkese açık vitrini: ziyaretçiye ürünü anlatmak, güven vermek ve kayda (`/auth/register`) yönlendirmek; oturumu açık kullanıcıyı rolüne göre paneline göndermek. Müşteri (tüketici) gözünden: QR okutup puan/XP/rozet/lig/oyun/ödül dünyasına adım attığı ilk temas noktası. **Fiilen ise sayfa yalnızca işletme sahibine (B2B) konuşuyor**; tüketiciye tek bir değer önerisi sunmuyor.

**Genel puan: 4.5 / 10** · **Karar: yeniden tasarla** (iskelet, SEO altyapısı ve admin modül anahtarları sağlam; ama sosyal kanıt sahte/bozuk, demo bölümü yer tutucu, fiyatlar gerçek faturalama tablosundan kopuk, çerez onayı dekoratif ve hedef kitle yanlış kurgulanmış.)

İncelenen dosyalar: `app/(public)/page.tsx`, `app/(public)/home-client.tsx`, `app/(public)/layout.tsx`, `app/(public)/loading.tsx`, `app/layout.tsx`, `components/providers.tsx`, `components/landing/*` (Hero, Features, AdMarquee, Demo, HowItWorks, Pricing, CTA, FAQ, Testimonials, LandingBackground), `components/layout/{header,footer,cookie-consent-banner,skip-to-main,language-switcher,page-transition}.tsx`, `components/ui/{hyper-text,aurora-text,spotlight,gradient-cta-card,card,sheet}.tsx`, `components/analytics/posthog-provider.tsx`, `lib/{landing-content,seo-settings,module-gate,module-controls,get-background-effect,server-locale,app-locale,slogans,plan-limits,ai-engine}.ts(x)`, `i18n/request.ts`, `messages/tr.json`, `app/api/public/stats/route.ts`, `app/api/settings/background/route.ts`, `proxy.ts`, `next.config.js` (headers/CSP), `app/globals.css`, `app/(auth)/auth/register/page.tsx`.
Prisma modelleri: `User` (schema.prisma:29, `role` — `Role` enum ADMIN/DEALER/CUSTOMER/STAFF, aktiflik alanı yok), `Feedback` (schema.prisma:766, `rating` 1-5, `deletedAt` soft-delete), `Settings` (schema.prisma:899), `PricingPlan` (schema.prisma:1430).

Not: Hiçbir kod çalıştırılmadı (dev server/build/DB yok); tüm bulgular kod okumasıyla doğrulandı. Canlı ortam değişkenlerine (video URL'leri, PostHog anahtarı) bağlı olanlar "koşullu" olarak işaretlendi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Bölümler render oluyor ve admin anahtarları çalışıyor; ama istatistik bileşeni gerçek veriyi bozuyor/göstermiyor, marquee ve yedek sayılar sahte, demo yer tutucu, fiyat CTA'ları plan/rol niyetini kaybediyor. |
| UX | 4/10 | Ürünün yarısı (tüketici oyunlaştırması) vitrinde yok; tek kitleye (işletme) yazılmış jenerik SaaS şablonu, tüketiciyi "Ücretsiz Başla — işletmenizi ekleyin" metniyle karşılıyor. |
| Görsel | 6/10 | Cam/aurora dili tutarlı ve temiz; ancak şablon hissi güçlü, Spotlight efekti geçersiz CSS yüzünden hiç çizilmiyor, footer'da "Powered by ReverBot" yer tutucusu duruyor. |
| Mimari | 4/10 | Tüm bölümler istemci bileşeni; fiyat iki ayrı sabit kaynakta + DB'de üçüncü kaynak; arka plan efekti 3 kez okunuyor (biri ölü değişken); yönlendirme istemcide `router.push` ile. |
| Performans | 5/10 | İstatistikler Redis+CDN önbellekli ve alt bölümler code-split; fakat sayfa `cookies()` yüzünden her istekte dinamik, ~400 KB TR+EN sözlüğü istemciye gidiyor, 40 sonsuz framer animasyonu (blur'lu) sabit katmanda dönüyor, her ziyarette önbelleksiz bir DB sorgusu var. |
| Erişilebilirlik + mobil | 5/10 | Skip-link, 44 px dokunma alanları, `MotionConfig reducedMotion="user"` iyi; ama marquee durdurulamıyor ve iki kez okunuyor, HyperText ekran okuyucuya harf harf/rastgele okunuyor, mobil menü diyaloğunun başlığı yok, logo linki SSR'da isimsiz, gizlenen header odağı örtüyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (title/description/canonical, sayfa bazlı override) | KISMİ | page.tsx:9-18; app/layout.tsx:51-54 | Çalışıyor ama `title` düz string → kök şablon uygulanıyor: "QRateX - QR Tabanlı Geri Bildirim Platformu \| QRateX" (marka iki kez). `title.absolute` kullanılmalı. |
| 2 | Organization/WebSite/Breadcrumb JSON-LD | KISMİ | page.tsx:34-61, 130-133 | Metin alanları `sanitizeSeoString` ile temizleniyor; `base`/`seo.locale` temizlenmiyor ve `JSON.stringify` `<` kaçışlamıyor (admin girdisi; düşük risk). `inLanguage` görünen dilden bağımsız. |
| 3 | FAQPage JSON-LD | ÇALIŞIYOR | page.tsx:63-74 | Sunucu çerez diline göre; görünen içerik istemci diline göre → dil ayrışabilir (Bulgu 11). |
| 4 | Fiyat (ItemList/Product) JSON-LD | KISMİ | page.tsx:76-114 | Fiyatlar `'299'`, `'699'` sabit; `landing-content.ts:47-51` ile kopya, `PricingPlan` tablosundan kopuk (Bulgu 5). Modül kapalıyken doğru gizleniyor. |
| 5 | VideoObject JSON-LD | KISMİ | page.tsx:116-126 | `uploadDate` her istekte `new Date()`; `thumbnailUrl` yok → Google için geçersiz zengin sonuç. |
| 6 | Admin modül anahtarı: fiyatlandırma bölümü | ÇALIŞIYOR | page.tsx:30, 150; home-client.tsx:48; lib/module-controls.ts:53 | Kapatıldığında header/footer'daki `/#pricing` linkleri ölü kalıyor (Bulgu 13). |
| 7 | Admin modül anahtarı: reklam şeridi | ÇALIŞIYOR | page.tsx:32; home-client.tsx:45; lib/module-controls.ts:54 | |
| 8 | Oturumlu kullanıcıyı role göre yönlendirme | KISMİ | home-client.tsx:25-35 | İstemci tarafında, landing tamamen render edildikten sonra; `router.push` → geri tuşu tuzağı; STAFF eşlemesi yok (proxy'nin `/` kuralı matcher dışında: proxy.ts:90, 152-154). |
| 9 | Ortak hareketli arka plan (orb + 26 parçacık + 6 yıldız) | KISMİ | LandingBackground.tsx:79-161 | OS reduce-motion'a uyuyor (50-56) ama uygulama içi "animasyonları azalt" sınıfına (globals.css:824-831) uymuyor; 40 sonsuz JS animasyonu. |
| 10 | Arka plan efektinin admin'den seçilmesi | KISMİ | layout.tsx:13,18; LandingBackground.tsx:36-48; api/settings/background/route.ts:12-24 | Sunucu değeri zaten geliyor; istemci yine `no-store` fetch ile DB'ye gidiyor. page.tsx:23'te okunan `backgroundEffect` hiç kullanılmıyor (ölü). |
| 11 | Skip-link "İçeriğe atla" | ÇALIŞIYOR | layout.tsx:19; skip-to-main.tsx | Metin sabit TR. |
| 12 | Header: logo → ana sayfa | KISMİ | header.tsx:171-229 | Görseller yalnız `mounted` sonrası → SSR'da isimsiz boş link + kayma; 4 `priority` görselin 2'si CSS ile gizli ama yine önyükleniyor. |
| 13 | Header: Özellikler / Fiyatlandırma / Blog / Neden Qratex linkleri | KISMİ | header.tsx:26-31, 233-247 | Aktif durum `/#features` için hiç eşleşmiyor; `/#pricing` modül kapalıyken ölü. Tüketiciye yönelik hiçbir link yok. |
| 14 | Header: dil seçici | KISMİ | language-switcher.tsx:30-49 | İstemci metinleri değişiyor; SSR metadata/JSON-LD/`<html lang>` güncellenmiyor (router.refresh yok). |
| 15 | Header: tema seçici | KISMİ | header.tsx:120-156 | Çalışıyor; ama `ThemeSwitcher` render içinde tanımlı bileşen → her scroll state değişiminde yeniden mount (açık menü kapanabilir). `onSelect` + `onClick` çift çağrı. |
| 16 | Header: Giriş / Ücretsiz Başla / Panel butonları | KISMİ | header.tsx:255-284, 108-118 | `getDashboardLink` STAFF'ı `/customer`'a yolluyor (proxy ikinci yönlendirme yapıyor). |
| 17 | Header: aşağı kaydırınca gizlen | KISMİ | header.tsx:73-101, 159-167 | rAF throttle iyi; klavye odağı gizli header'a girdiğinde header geri gelmiyor (WCAG 2.4.11). |
| 18 | Mobil menü (Sheet) | KISMİ | header.tsx:293-416 | `SheetTitle` yok (sheet.tsx:55-75 otomatik eklemiyor) → diyalog isimsiz, Radix konsol hatası. |
| 19 | Hero rozet ("Yeni: AI Destekli Duygu Analizi") | KISMİ | HeroSection.tsx:103-106; tr.json:2109 | Statik metin; "Yeni" ibaresi tarihsiz ve kalıcı. |
| 20 | Hero başlık (AuroraText) + alt metin | ÇALIŞIYOR | HeroSection.tsx:107-116; aurora-text.tsx:29-38 | LCP için opacity:1 başlangıcı doğru düşünülmüş; `sr-only` kopya ile erişilebilir. Metin tamamen B2B. |
| 21 | Hero "Ücretsiz Başla" CTA | KISMİ | HeroSection.tsx:118-123 | `/auth/register`'a rol/niyet parametresi olmadan gidiyor; kayıt sayfası CUSTOMER varsayılanıyla açılıyor (register/page.tsx:63) — B2B metinle çelişki. |
| 22 | Hero "Demo İzle" CTA | SAHTE | HeroSection.tsx:124-129 → DemoSection | Video yoksa yer tutucuya iniyor (#33). |
| 23 | Hero arka plan videosu (opsiyonel) | BOZUK (koşullu) | HeroSection.tsx:74, 82-94; next.config.js:345-353 | Harici URL CSP `default-src 'self'` (media-src tanımsız) tarafından engellenir. Yerelde env yok. |
| 24 | Hero istatistik kartı (canlı sayılar) | BOZUK | HeroSection.tsx:38-71, 138-145; hyper-text.tsx:46-48, 89-122 | Gerçek veri ya hiç görünmüyor ya bozuk görünüyor ("12++", "450") — Bulgu 2. |
| 25 | İstatistik yedek değerleri (10K+/500+/1M+/4.9) | SAHTE | HeroSection.tsx:40-48 | SSR'da her zaman bunlar basılıyor; botlar ve JS'siz ziyaretçi uydurma sayı görüyor. |
| 26 | `/api/public/stats` uç noktası | KISMİ | api/public/stats/route.ts:12-51 | Redis + `s-maxage` önbellek iyi; "aktif kullanıcı" = tüm kullanıcılar (admin/bayi/personel dahil), silinmiş geri bildirimler sayılıyor, veri yoksa 4.9 uyduruluyor. |
| 27 | Scroll göstergesi + "İçeriğe kaydır" butonu | ÇALIŞIYOR | HeroSection.tsx:151-169 | Odak #features'a taşınıyor (tabIndex -1, FeaturesSection.tsx:22) — iyi. |
| 28 | Özellik kartları (6 adet) | KISMİ | FeaturesSection.tsx:38-58; landing-content.ts:13-44 | Statik; `hover` efekti tıklanabilirlik ima ediyor ama kartlar link değil. "OpenAI ile" metni gerçek sağlayıcıyla (Groq öncelikli, lib/ai-engine.ts:44-58,74) uyuşmuyor. |
| 29 | Reklam / "Bize güvenen işletmeler" şeridi | SAHTE | AdMarquee.tsx:38-49; home-client.tsx:45; tr.json:2162 | `items` hiç verilmiyor → 8 uydurma marka "bize güvenen işletmeler" başlığıyla gösteriliyor. |
| 30 | Marquee hover'da durma / reduce-motion | KISMİ | globals.css:937-953 | Yalnız fareyle durur; dokunmatik/klavye için durdurma kontrolü yok; liste iki kez ekran okuyucuya gidiyor (AdMarquee.tsx:51, 67). |
| 31 | Demo video gömme (YouTube/Vimeo/doğrudan) | BOZUK (koşullu) | DemoSection.tsx:10-25, 50-68; next.config.js:353 | `frame-src 'self' https://vercel.live` YouTube/Vimeo iframe'ini engeller; doğrudan video `default-src 'self'` ile engellenir. |
| 32 | Demo yer tutucu poster (sahte QR + tarama çizgisi + sahte kart) | SAHTE | DemoSection.tsx:69-131 | Tarama çizgisi `top` animasyonu → reduce-motion'da da sonsuz döner (MotionConfig yalnız transform'u keser). |
| 33 | Yer tutucu metni "Demo video veya canlı önizleme burada yer alabilir." | SAHTE | DemoSection.tsx:124; tr.json:2171 | Geliştirici notu ziyaretçiye gösteriliyor. |
| 34 | "Nasıl Çalışır" 3 adım | KISMİ | HowItWorksSection.tsx:25-45; landing-content.ts:54-58 | Yalnız işletme akışı (kayıt → QR oluştur → topla); tüketici akışı yok. Bölümün `id`'si yok (bağlantılanamaz). |
| 35 | Fiyat kartları (3 plan) | KISMİ | PricingSection.tsx:36-91; landing-content.ts:47-51 | `PricingPlan` tablosundan değil sabit koddan; admin fiyat değiştirince landing güncellenmez. |
| 36 | Plan özellik vaatleri ("Aylık 100 Geri Bildirim" vb.) | SAHTE | tr.json:2205, 2231-2232; lib/plan-limits.ts:1-27 | Yalnız QR/şube kotası uygulanıyor; aylık geri bildirim limiti kodda yok. "7/24 Destek", "API Erişimi" doğrulanmadı. |
| 37 | Plan CTA'ları ("Planı Seç") | KISMİ | PricingSection.tsx:79-85 | Plan kimliği ve DEALER rolü aktarılmıyor; kullanıcı kayıtta CUSTOMER olarak başlıyor, ödeme akışına bağlanmıyor. |
| 38 | CTA bölümü (Ücretsiz Deneyin) | KISMİ | CTASection.tsx:33-38 | #21 ile aynı sorun. |
| 39 | "Satış ile Görüşün" | KISMİ | CTASection.tsx:39-41 | Yalnız `mailto:`; mail istemcisi olmayan cihazda hiçbir şey olmaz; form/takvim yok. |
| 40 | Spotlight efekti | BOZUK | CTASection.tsx:18; spotlight.tsx:27 | `fill="hsl(var(--primary))"` + `${fill}40` → `hsl(var(--primary))40` geçersiz renk; gradyan hiç çizilmez. |
| 41 | SSS (4 madde, hep açık kartlar) | ÇALIŞIYOR | FAQSection.tsx:30-47 | Arama/accordion yok; tüketici sorusu (puan nasıl kazanılır, ödül nasıl alınır) yok. |
| 42 | Müşteri yorumları bölümü | EKSİK (ölü kod) | TestimonialsSection.tsx; home-client.tsx:7-15 | Bileşen import edilmiyor; içindeki uydurma alıntılar ("%40 artırdık") iyi ki yayında değil — kaldırılmalı ya da gerçek veriye bağlanmalı. |
| 43 | Footer linkleri (Ürün/Şirket/Destek/Yasal) | KISMİ | footer.tsx:12-33, 121-186 | "Hakkımızda" → `/#features` (yanıltıcı); tüm metinler sabit TR (i18n yok); `/#pricing` modül kapalıyken ölü. |
| 44 | Footer sosyal linkleri | KISMİ (doğrulanmadı) | footer.tsx:35-40 | Hesapların varlığı doğrulanmadı; Twitter ikonu/adı eski marka. |
| 45 | Footer rastgele slogan | KISMİ | footer.tsx:51-53, 97-102; lib/slogans.ts:5-15 | Mount sonrası belirip kayma yaratıyor; yazım hatası "Sadakatınız" (slogans.ts:9). |
| 46 | Footer "Powered by ReverBot" | SAHTE | footer.tsx:208-212 | Kodda "placeholder" diye işaretli. |
| 47 | Çerez onay bandı | SAHTE | cookie-consent-banner.tsx:23-39; posthog-provider.tsx:12-27, 50-52 | Seçim hiçbir analitiği etkilemiyor; onay anahtarını okuyan başka kod yok (Bulgu 1). |
| 48 | Segment yükleme ekranı | KISMİ | (public)/loading.tsx:13-96 | `fixed inset-0 z-[100]` tam ekran perde; header'ı da örter; "Yükleniyor" ve "Qratex" sabit (marka yazımı tutarsız: QRateX/Qratex). |
| 49 | Azaltılmış hareket desteği | KISMİ | providers.tsx:232; globals.css:801-817; LandingBackground.tsx:50-56 | Framer transform'ları ve CSS animasyonları kesiliyor; HyperText (JS) ve Demo tarama çizgisi (`top`) kesilmiyor; uygulama içi tercih JS animasyonlarına uygulanmıyor. |
| 50 | Hata durumu (istatistik/arka plan fetch hatası) | ÇALIŞIYOR | HeroSection.tsx:65; LandingBackground.tsx:44 | Sessiz yedek — ama yedek sahte veri (bkz. #25). |
| 51 | Tüketiciye yönelik değer önerisi (puan/XP/rozet/lig/oyun/ödül) | EKSİK | — | Sayfada tek cümle yok; yalnız footer sloganlarında dolaylı geçiyor. |
| 52 | Anonim ziyaretçi için "QR Okut" girişi | EKSİK | — | `/customer/scan` var ama oturum gerektiriyor; landing'de giriş noktası yok. |
| 53 | PWA yükleme çağrısı | KISMİ | providers.tsx:243 (InstallBanner) | Global banner var; landing'de bağlamsal "uygulamayı yükle" yok. |

Toplam: 53 özellik — ÇALIŞIYOR 8 · KISMİ 30 · BOZUK 4 · SAHTE 8 · EKSİK 3.

---

## Bulgular

### 1. Çerez onayı dekoratif; analitik/oturum kaydı onaydan bağımsız yükleniyor
- **Önem:** kritik (koşullu: `NEXT_PUBLIC_POSTHOG_KEY` tanımlıysa) · **Kategori:** güvenlik / KVKK
- **Kanıt:** `components/layout/cookie-consent-banner.tsx:23-39` yalnızca localStorage'a yazıp olay yayınlıyor; `qratex_cookie_consent_v1`/`optionalRejected` anahtarını okuyan tek tüketici `components/pwa/install-banner.tsx:52` (sadece PWA banner'ı). `components/analytics/posthog-provider.tsx:12-27, 50-52` ilk mount'ta koşulsuz `posthog.init` çağırıyor; `autocapture: true`, `disable_session_recording: false`.
- **Sorun:** Ziyaretçi "Opsiyonelleri reddet" dese de (veya hiç seçmeden) tıklama izleme ve oturum kaydı başlıyor. Bu, açık rıza gerektiren işlemenin rızasız yapılması demek; çerez politikası sayfasıyla da çelişir. Ek olarak CSP `connect-src` listesinde (next.config.js:351) PostHog alan adı yok — yani anahtar tanımlıysa hem rıza ihlali var hem de istekler büyük olasılıkla CSP'de düşüyor (huni verisi boş olabilir; canlıda doğrulanmadı).
- **Öneri:** Tek bir `ConsentProvider` (context + `useConsent()`) kurun: `necessary | analytics | marketing` kategorileri, sürümlü kayıt ve "tercihleri yönet" sayfası. PostHog `opt_out_capturing_by_default: true` ile başlatılsın, yalnız `analytics` onayında `opt_in_capturing()`; session recording ayrı onaya bağlansın. Onay olayı oturum açık kullanıcıda sunucuya da yazılsın (KVKK ispat yükü). CSP'ye PostHog host'ları eklenmeli ya da reverse-proxy (`/ingest`) kullanılmalı.
- **Efor:** M

### 2. Canlı istatistikler HyperText yüzünden ya hiç görünmüyor ya bozuk görünüyor
- **Önem:** yüksek · **Kategori:** hata / veri doğruluğu
- **Kanıt:** `components/ui/hyper-text.tsx:46-48` `displayText` yalnız ilk render'da `children`'dan kuruluyor; `89-122` efekti `!isAnimating` iken erken dönüyor ve eski dizi uzunluğu üzerinden `children[index]` eşliyor; `+` karakterini eski diziden koruyor (104-105). `HeroSection.tsx:38-71` önce yedek değerle render edip fetch sonrası `children`'ı değiştiriyor; `key={i}` (139) aynı örneği koruyor.
- **Sorun:** İki senaryo: (a) fetch animasyon bittikten sonra gelirse ekranda yedek sahte değer ("500+") kalıcı kalır; (b) önce gelirse uzunluk farkı yüzünden "500+"→"12+" geçişi **"12++"**, "1M+"→"450+" geçişi **"450"** olarak görünür. Hover (`animateOnHover`) tekrar tetiklediğinde de aynı bozulma yaşanır. Sonuç zamanlamaya bağlı, yani testte görünüp canlıda görünmeyebilir.
- **Öneri:** İstatistikleri sunucuda (RSC) Redis'ten okuyup ilk HTML'e gerçek değeri basın; istemci fetch'ini kaldırın. Sayaç animasyonu için `children` değişince `displayText`'i sıfırlayan, `prefers-reduced-motion`'a uyan, `aria-label={finalValue}` + harfleri `aria-hidden` yapan bir `AnimatedStat` (ör. `useMotionValue` + `animate` ile sayıdan sayıya akış) yazın. Rastgele harf karıştırma sayılar için yanlış metafor; Revolut/Monzo tarzı rakam yuvarlama daha okunur.
- **Efor:** S

### 3. Sahte sosyal kanıt: uydurma marka şeridi ve uydurma istatistikler
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / güven
- **Kanıt:** `AdMarquee.tsx:38-49` `DEMO_ITEMS` (Kafe Aroma, Lezzet Durağı, ...) varsayılan; `home-client.tsx:45` `items` vermiyor; başlık "Bize güvenen işletmeler" (`messages/tr.json:2162`). `HeroSection.tsx:40-48` SSR'da her zaman `10K+ / 500+ / 1M+ / 4.9`; `api/public/stats/route.ts:29-31` veri yokken ortalamayı 4.9 uyduruyor.
- **Sorun:** Var olmayan işletmeler "bize güvenen" diye sunuluyor ve botlar/JS'siz ziyaretçiler uydurma kullanım sayıları görüyor. Bu hem güveni (gerçek bir işletme bu markaları aradığında) hem de yanıltıcı ticari reklam açısından risk; ayrıca Hero'daki gerçek sayılar küçükse "10K+"tan "37+"ya düşüş görsel olarak güveni yıkar.
- **Öneri:** Marquee'yi DB'ye bağlayın: `User` (DEALER) için `showcaseConsent` + `businessLogo` alanlarıyla rıza veren aktif işletmeleri dönen önbellekli bir `getShowcaseBusinesses()` (Redis, 10 dk). Eşik (ör. 8 işletme) altında bölüm hiç render edilmesin. İstatistiklerde eşik altı için sayı yerine nitel ifade ("Erken erişimde") kullanın; 4.9 yedeğini kaldırın.
- **Efor:** M

### 4. İstatistik sorguları yanlış şeyi sayıyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu
- **Kanıt:** `api/public/stats/route.ts:23-27`: `prisma.user.count()` (tüm roller), `prisma.feedback.aggregate({ _count, _avg })` filtresiz. `Feedback.deletedAt` soft-delete alanı var (schema.prisma, Feedback modeli `deletedAt DateTime?`, indeks `@@index([deletedAt])`). Etiket "Aktif Kullanıcı" (`tr.json:2117`); `User` modelinde aktiflik alanı yok.
- **Sorun:** Admin/personel/bayi hesapları "aktif kullanıcı"ya, spam diye silinmiş geri bildirimler hem sayıya hem ortalama puana giriyor. Spam silme işlemi vitrindeki puanı düzeltmiyor.
- **Öneri:** `users` → `role: 'CUSTOMER'` ve son 30 günde geri bildirim/oturum olan kullanıcılar (ör. `feedbacks: { some: { createdAt: { gte } } }` veya `loginStreakLastDay`); `feedback` → `where: { deletedAt: null }`. Etiketi ölçüyle eşleştirin ("Son 30 günde aktif tüketici"). Hesaplamayı cron'daki cache-warm adımına taşıyıp uç noktayı salt Redis okuyucu yapın.
- **Efor:** S

### 5. Fiyatlandırma faturalama sisteminden kopuk; vaatler uygulanmıyor; plan niyeti kayboluyor
- **Önem:** yüksek · **Kategori:** mimari / gelir
- **Kanıt:** Fiyat üç yerde: `lib/landing-content.ts:47-51`, `app/(public)/page.tsx:94-108` (JSON-LD), `app/lab/zoom/zoom-client.tsx:1688-1690`; gerçek kaynak `PricingPlan` (schema.prisma:1430, `stripePriceId`, `maxQRCodes`) ve `app/api/admin/pricing/route.ts`. `lib/plan-limits.ts` yalnız QR/şube kotası uyguluyor; "Aylık 100 Geri Bildirim" (`tr.json:2205`) için kodda limit yok. `PricingSection.tsx:84` ve `register/page.tsx:63` → plan ve DEALER rolü aktarılmıyor.
- **Sorun:** Admin fiyatı değiştirdiğinde vitrin eski fiyatı gösterir; ücretsiz planın "100 geri bildirim" sınırı yalnız pazarlama metni; "Başlangıç ₺299 — Planı Seç" diyen işletme sahibi kayıtta "Müşteri" seçili halde karşılanıyor ve ödeme adımına hiç ulaşmıyor.
- **Öneri:** `getPublicPricingPlans()` (Prisma `isActive`, `order`; Redis + build fail-safe varsayılanı) ile RSC'den bölüme veri geçin; JSON-LD aynı kaynaktan üretilsin. CTA `href="/auth/register?role=DEALER&plan=<id>"`; kayıt sayfası bu parametreleri okuyup rolü kilitlesin ve kayıt sonrası `/dealer/billing?plan=<id>` checkout'una yönlendirsin. Uygulanmayan vaatler ya metinden çıkarılsın ya da `plan-limits.ts`'e `maxMonthlyFeedback` eklensin.
- **Efor:** L

### 6. Hedef kitle yanlış: tüketici için hiçbir değer önerisi yok
- **Önem:** yüksek · **Kategori:** UX / bilgi mimarisi
- **Kanıt:** Hero (`tr.json:2109-2117`), HowItWorks (`landing-content.ts:54-58`: kayıt → QR oluştur → topla), Pricing, CTA ("işletmenizin nasıl dönüştüğünü görün") tamamen işletme dili. Tüketici özellikleri (oyunlar, rozetler, lig, ödüller, sürpriz kutular, my-year) `app/customer/*` altında zengin ama landing'de tek bölüm yok. Tüm CTA'lar ise CUSTOMER varsayılan kayda gidiyor.
- **Sorun:** Bir masada QR okutup gelen, ya da arkadaşının referans linkiyle siteye düşen tüketici "Müşteri Deneyimini Dönüştürün / işletmenizi ekleyin" ile karşılaşıyor; neden kayıt olacağını anlamıyor. Öte yandan işletme sahibi CTA'ya basınca tüketici kaydına düşüyor. İki kitle de kaybediyor.
- **Öneri:** Hero'nun altında iki kitle anahtarı ("Ödül kazanmak istiyorum" / "İşletmem için") — segment URL'de (`/?for=business`) tutulsun, SEO için iki ayrı alt sayfa (`/` tüketici, `/isletmeler` B2B) daha temiz. Tüketici akışı: "Okut → Puan & XP kazan → Rozet aç, ligde yüksel → Ödülü al" 4 adımlı görsel hikâye; canlı "bu hafta dağıtılan ödül" sayacı; örnek rozet/karakter vitrini (mevcut rozet bileşenlerinden statik önizleme); "Yakınındaki işletmeler" teaser'ı. CTA `register?role=CUSTOMER` ve `?ref=` korunarak.
- **Efor:** L

### 7. Demo bölümü yer tutucu; video yapılandırılsa bile CSP engelliyor
- **Önem:** yüksek · **Kategori:** işlevsellik
- **Kanıt:** `DemoSection.tsx:124` + `tr.json:2171` "Demo video veya canlı önizleme burada yer alabilir."; `HeroSection.tsx:124-129` "Demo İzle" buraya iniyor. `next.config.js:353` `frame-src 'self' https://vercel.live` (YouTube/Vimeo yok), `media-src` tanımsız → `default-src 'self'` harici video/hero videosunu (HeroSection.tsx:82-94) engeller. Yerel `.env`'de iki video değişkeni de yok.
- **Sorun:** Birincil ikincil CTA ("Demo İzle") ziyaretçiyi geliştirici notuna götürüyor. Video eklendiğinde ise tarayıcı sessizce bloklayacak; ekip "env'i girdim, çalışıyor" sanacak.
- **Öneri:** Kısa vadede: video yoksa "Demo İzle" CTA'sını ve demo bölümünü gizleyin. Orta vadede: gerçek video yerine **etkileşimli demo** — sahte QR'a tıklayınca 3 adımda geri bildirim verip puan/rozet animasyonu gören bir sandbox (mevcut feedback ve rozet açılış bileşenleri mock veriyle). Video kalacaksa CSP'ye `frame-src https://www.youtube-nocookie.com https://player.vimeo.com` ve `media-src 'self' <R2 host>` ekleyin; iframe'e `loading="lazy"` ve facade (tıklayınca yüklenen poster) uygulayın.
- **Efor:** M

### 8. Oturumlu kullanıcı yönlendirmesi istemcide ve geri tuşu tuzağı kuruyor
- **Önem:** orta · **Kategori:** UX / mimari
- **Kanıt:** `home-client.tsx:25-35` `useSession` sonucu bekleniyor, landing tamamen render edildikten sonra `router.push(...)`. `proxy.ts:152-154` matcher'da `/` yok, dolayısıyla `proxy.ts:90` STAFF kuralı ölü; STAFF önce `/customer`'a, sonra proxy ile `/staff`'a iki kez yönleniyor.
- **Sorun:** Giriş yapmış kullanıcı önce pazarlama sayfasını görüp sonra sıçrıyor (flash), `push` geçmişe kayıt eklediği için panelde geri tuşuna basınca `/`'e dönüp tekrar ileri itiliyor — geri tuşu döngüsü. Her oturumlu ziyaret boşa tam landing render + istatistik fetch'i demek.
- **Öneri:** Sunucuda karar verin: `page.tsx`'te `getServerSession(authOptions)` → `redirect(roleHome(role))` (sayfa zaten `cookies()` nedeniyle dinamik, ek maliyet yok) veya proxy matcher'a `'/'` ekleyin. Rol→ana sayfa eşlemesini tek `lib/role-home.ts`'de toplayıp header, login ve proxy'de kullanın (şu an 4 kopya). İstemci tarafı kalacaksa `router.replace`.
- **Efor:** S

### 9. Performans: dinamik SSR, istemciye giden iki dilli sözlük, sürekli animasyon, önbelleksiz DB çağrısı
- **Önem:** orta · **Kategori:** performans
- **Kanıt:** `page.tsx:24` `getServerLocale()` → `cookies()` (lib/server-locale.ts:9) → sayfa her istekte dinamik, ISR yok. `i18n/request.ts:7-8` `tr.json` (206 KB) + `en.json` (196 KB) statik import; `lib/app-locale.tsx:5` (istemci) ve `PricingSection.tsx:11`, `FAQSection.tsx:7` bunu istemci paketine çekiyor. `LandingBackground.tsx:82-159` 8 blur'lu orb + 26 parçacık + 6 yıldız = 40 sonsuz framer animasyonu, `fixed` katmanda tüm public sayfalarda. `LandingBackground.tsx:38` + `api/settings/background/route.ts:5,13-23` her sayfa yüklemesinde `no-store` DB sorgusu (sunucu değeri zaten prop olarak geliyor). `page.tsx:21-23` `getBackgroundEffect()` sonucu kullanılmıyor. `hyper-text.tsx:4` `motion` (LazyMotion dışı tam bileşen) kullanıyor.
- **Sorun:** Landing, sitenin en çok trafik alan ve en çok önbelleklenmesi gereken sayfası; şu an her ziyaret fonksiyon çalıştırıyor, ~100 KB+ (gzip, tahmini) gereksiz JSON indiriyor ve canlı Neon'a önbelleksiz bir sorgu atıyor. Blur filtreli ölçek animasyonları düşük donanımlı telefonda GPU/batarya tüketir.
- **Öneri:** (1) Landing'i statik/ISR yapın: dil için `cookies()` yerine `[locale]` segmenti veya `/en` yolu; metin sunucuda çözülsün, istemciye yalnız ilgili namespace (`landing`) props olarak geçsin. (2) `i18n/request.ts`'i dil başına dinamik import'a bölün. (3) `LandingBackground`'daki istemci fetch'ini silin (admin değişikliği `revalidateTag('settings')` ile yansısın). (4) Arka planı tek bir CSS/Canvas katmanına indirin (orb'lar için `@keyframes` + `will-change: transform`, parçacıkları ≤10'a düşürün, `IntersectionObserver`/`document.hidden` ile durdurun). (5) Bölümleri RSC yapıp yalnız etkileşimli adaları istemci bileşeni bırakın.
- **Efor:** L

### 10. Erişilebilirlik açıkları
- **Önem:** orta · **Kategori:** erişilebilirlik
- **Kanıt:** Marquee: durdurma kontrolü yok, yalnız `:hover` (globals.css:940-942), kopya liste ekran okuyucuya açık (`AdMarquee.tsx:51, 67` `aria-hidden={false}`), aynı SVG gradyan id'si iki kez DOM'da (18-22). HyperText: her harf ayrı `span`, animasyonda rastgele harfler, `aria-label` yok (hyper-text.tsx:124-142); JS animasyonu reduce-motion'a uymuyor. Mobil menü: `SheetTitle` yok (header.tsx:308-415; sheet.tsx:55-75). Logo linki SSR'da boş (header.tsx:171-202). Header aşağı kaydırmada gizleniyor, `focus-within`'de geri gelmiyor (header.tsx:159-167). Demo tarama çizgisi `top` animasyonu reduce-motion'da da sürüyor (DemoSection.tsx:98-103). Uygulama içi "animasyonları azalt" sınıfı (globals.css:824-831) framer JS animasyonlarını etkilemiyor (LandingBackground yalnız OS medya sorgusunu dinliyor, 50-56).
- **Sorun:** WCAG 2.2.2 (durdur/duraklat), 1.3.1, 4.1.2 (isimsiz diyalog/link), 2.4.11 (odak örtülmesi) ihlalleri; ekran okuyucu kullanıcısı istatistikleri "1, 0, K, artı" ya da rastgele harfler olarak duyar.
- **Öneri:** Marquee'ye görünür duraklat düğmesi + `:focus-within` duraklatma; ikinci kopyayı `aria-hidden="true"` yapın; logoları gerçek `<a>` yapın. Ortak `useReducedMotionPref()` hook'u (OS + `html.reduce-animations`) yazıp tüm JS animasyonlarına (HyperText, arka plan, tarama çizgisi) bağlayın; `MotionConfig reducedMotion` değerini bu hook'tan besleyin. `SheetTitle` (görsel olarak gizli) ekleyin. Logo için SSR'da `<span className="sr-only">QRateX</span>` ve tema bağımsız tek SVG logo. Header'a `focus-within:translate-y-0`.
- **Efor:** M

### 11. Dil karışıklığı ve sunucu/istemci dil ayrışması
- **Önem:** orta · **Kategori:** i18n
- **Kanıt:** `AppLocaleProvider` her zaman `'tr'` ile başlıyor ve tercihi effect'te uyguluyor (`lib/app-locale.tsx:21, 24-29`) → EN kullanıcı önce TR görüyor (flash). `page.tsx:24-28,63-74` JSON-LD'yi çerez diline göre üretiyor; `app/layout.tsx:162` `lang="tr"` sabit, `alternates.languages` yalnız `tr` (app/layout.tsx:66). Footer tamamen sabit TR (footer.tsx:12-33, 95, 123-173, 192), `loading.tsx:19,44,74` ve skip-link (layout.tsx:19) sabit TR. Marka yazımı: "QRateX" (footer, i18n), "Qratex" (loading.tsx:44).
- **Sorun:** EN seçen ziyaretçi TR footer, TR yükleme ekranı ve ilk boyamada TR hero görüyor; arama motoruna EN JSON-LD + TR HTML gidebiliyor.
- **Öneri:** Sunucu dilini `AppLocaleProvider`'a `initialLocale` prop'u olarak geçin; footer/loading/skip metinlerini `messages`'a taşıyın; `<html lang>`'ı sunucu dilinden basın; EN için ayrı URL + `hreflang`. Marka yazımını tek sabitte (`BRAND_NAME`) toplayın.
- **Efor:** M

### 12. CTA bölümündeki Spotlight efekti geçersiz CSS ile hiç çizilmiyor
- **Önem:** düşük · **Kategori:** görsel hata
- **Kanıt:** `CTASection.tsx:18` `fill="hsl(var(--primary))"`; `spotlight.tsx:27` `` `radial-gradient(ellipse at center, ${fill}40, transparent 70%)` `` → `hsl(var(--primary))40`.
- **Sorun:** Hex için yazılmış alfa eki HSL değişkenine eklenmiş; tarayıcı tüm `background` bildirimini düşürüyor. Bileşen DOM'da ama görünmez.
- **Öneri:** `fill` için `hsl(var(--primary) / 0.25)` biçimini destekleyen bir `opacity` prop'u ekleyin ya da `color-mix(in srgb, ${fill} 25%, transparent)` kullanın.
- **Efor:** S

### 13. Ölü/yanıltıcı linkler ve yer tutucular
- **Önem:** düşük · **Kategori:** içerik
- **Kanıt:** `/#pricing` header'da (header.tsx:28) ve footer'da (footer.tsx:15) modül kapalıyken (page.tsx:30) hedefsiz. "Hakkımızda" → `/#features` (footer.tsx:18). "Powered by ReverBot" placeholder (footer.tsx:208-212). Header aktif link karşılaştırması `/#features` ile `pathname` (`/`) hiç eşleşmiyor (header.tsx:239). Slogan yazım hatası "Sadakatınız" (lib/slogans.ts:9). "OpenAI ile duygu analizi" (tr.json:2134) — birincil sağlayıcı Groq (lib/ai-engine.ts:44-47, 74).
- **Öneri:** Nav öğelerini modül durumuna göre sunucuda filtreleyin; Hakkımızda için gerçek sayfa ya da linki kaldırın; sağlayıcı adını metinden çıkarın ("yapay zekâ ile"); scroll-spy ile aktif bölüm vurgusu.
- **Efor:** S

### 14. SEO ayrıntıları
- **Önem:** düşük · **Kategori:** SEO
- **Kanıt:** Başlıkta marka tekrarı (page.tsx:14 + app/layout.tsx:53); `VideoObject.uploadDate` her istekte değişiyor, `thumbnailUrl` yok (page.tsx:117-126); JSON-LD `JSON.stringify` çıktısında `<` kaçışlanmıyor ve `base` sanitize edilmiyor (page.tsx:42, 130-148; seo-settings.ts:66-69 yalnız tag siler).
- **Öneri:** `title: { absolute: ... }`; video meta verisini admin ayarına (`uploadDate`, `thumbnailUrl`, `duration`) taşıyın; JSON-LD için `JSON.stringify(x).replace(/</g, '\\u003c')` yardımcı fonksiyonu.
- **Efor:** S

### 15. Header'da render içinde bileşen tanımı
- **Önem:** düşük · **Kategori:** React / mimari
- **Kanıt:** `header.tsx:120-156` `ThemeSwitcher` fonksiyon bileşeni `Header` gövdesinde tanımlı; `isScrolled/isHidden` her değiştiğinde (73-101) yeni bileşen tipi oluşuyor. Menü öğelerinde `onSelect` ve `onClick` ikisi birden (145-153).
- **Sorun:** React her render'da alt ağacı unmount/mount eder; açık tema menüsü scroll sırasında kapanabilir, odak kaybolur.
- **Öneri:** `ThemeSwitcher`'ı modül seviyesine taşıyıp ayrı dosya yapın; yalnız `onSelect` kullanın. Logo için tek, `currentColor`'lu SVG.
- **Efor:** S

### 16. Segment yükleme ekranı tam ekran perde
- **Önem:** düşük · **Kategori:** UX / performans algısı
- **Kanıt:** `app/(public)/loading.tsx:15` `fixed inset-0 z-[100] bg-background`; sayfa dinamik olduğundan (Bulgu 9) Suspense sınırı devreye giriyor.
- **Sorun:** `/blog` → `/` gibi istemci gezinmesinde header dahil tüm ekran markalı splash ile kapanıyor; ilk yüklemede görünüp görünmediği akış zamanlamasına bağlı (doğrulanmadı).
- **Öneri:** Landing için loading.tsx'i kaldırın (statik hale gelince gereksiz), diğer public sayfalar için header'ı örtmeyen iskelet (skeleton) kullanın.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Tüketici değer önerisi ve ödül vitrini** (Starbucks Rewards ana sayfası): "Okut, kazan, harca" döngüsü, örnek ödüller, seviye/kademe tablosu (bronz→efsanevi), "ilk geri bildirime X puan hoş geldin bonusu" vaadi.
2. **Oyunlaştırma önizlemesi** (Duolingo): seri (streak) sayacı, lig tablosu teaser'ı, rozet/karakter koleksiyonundan 3-4 kart, mini oyun önizlemesi — ziyaretçi kayıt olmadan "neye kavuşacağını" görsün.
3. **Anonim "QR Okut" / "Yakınımdaki işletmeler" girişi** (Revolut/Monzo'nun tek dokunuşla eylem hissi): kamera ile okut → okuttuğu işletmenin geri bildirim sayfasına; konum izniyle yakın işletme haritası (`/customer/nearby` mevcut, herkese açık hafif sürümü yok).
4. **Gerçek, rızalı sosyal kanıt**: DB'den gelen işletme logoları, gerçek moderasyondan geçmiş kısa tüketici alıntıları, canlı "bugün N geri bildirim / N ödül" sayaçları.
5. **Spotify Wrapped tarzı paylaşılabilir hikâye**: `my-year` deneyiminin anonim örnek bir "yıl özeti" kartı — paylaşılabilir OG görselli; büyüme motoru.
6. **Kitle ayrımı + plan → ödeme hunisi**: "Tüketici / İşletme" anahtarı, plan seçiminin rol ve plan kimliğiyle kayda ve Stripe checkout'a taşınması, yıllık/aylık fiyat geçişi, plan karşılaştırma tablosu.

---

## Yeniden tasarım vizyonu

**Hedef deneyim.** Ziyaretçi 5 saniyede "bu benim için mi?" sorusunun cevabını almalı. Varsayılan kitle tüketici (QR'dan ve referans linkinden gelen trafik), işletme tarafı ayrı ve eşit kalitede bir yol. Ton: Duolingo'nun oyunsu sıcaklığı + Revolut'un net, sayısal güveni. Sahte hiçbir sayı/marka yok; veri azsa nitel dil.

**Yerleşim (tüketici `/`).**
1. *Hero:* "Fikrini söyle, ödülünü al." + tek birincil CTA "Hemen başla" (`register?role=CUSTOMER`) + ikincil "QR okut". Sağda (mobilde altta) telefon çerçevesinde otomatik oynayan 3 karelik mikro hikâye: QR okutma → yıldız verme → "+50 puan, yeni rozet" açılışı.
2. *Kazanç döngüsü:* 4 adımlı yatay şerit (Okut → Puan & XP → Rozet & Lig → Ödül), her adımda gerçek UI parçası.
3. *Koleksiyon vitrini:* karakter rozetlerinden 4 kart (gizemli kart dahil), "kaçını toplayabilirsin?" sorusu.
4. *Canlı nabız:* DB'den gerçek sayılar (eşik üstündeyse) + rızalı işletme logoları.
5. *Yakınındaki işletmeler* (konum izni opsiyonel).
6. *SSS (tüketici soruları)* + *işletmeler için şerit* → `/isletmeler`.

**Yerleşim (işletme `/isletmeler`).** Mevcut Features/HowItWorks/Pricing/CTA/FAQ içeriği burada yaşar; Pricing `PricingPlan`'dan, CTA `register?role=DEALER&plan=` ile checkout'a bağlanır, "Satış ile görüşün" gerçek form (Lead kaydı + bildirim).

**Motion / 3D.** Ölçülü: tek bir "imza an" — hero'daki rozet açılışı için mevcut three.js sürpriz kutusu/rozet bileşeninin hafif, tek seferlik, `IntersectionObserver` ile tetiklenen sürümü (görünür olmadan yüklenmesin, `prefers-reduced-motion`'da statik görsel). Global arka plan 40 animasyondan, sayfa görünmezken duran tek bir CSS gradyan katmanına iner. Sayılar karıştırma yerine yumuşak rakam yuvarlama. Tüm hareket tek `useReducedMotionPref()` kaynağından kontrol edilir.

**Veri / API değişiklikleri.**
- `app/(public)/page.tsx` RSC'de: `getServerSession` → rol yönlendirmesi; `getPublicStats()` (Redis, `deletedAt: null`, aktif tüketici tanımı, eşik bayrağı); `getShowcaseBusinesses()` (rızalı DEALER); `getPublicPricingPlans()` (yalnız `/isletmeler`). Hepsi build-time DB fail-safe (try/catch + varsayılan) ile.
- `User`'a `showcaseConsent Boolean @default(false)` (işletme vitrini rızası).
- Dil: `[locale]` segmenti veya `/en` önekli rota; sözlük namespace bazlı sunucuda çözülür.
- `ConsentProvider` + PostHog opt-in; CSP güncellemesi (PostHog, video sağlayıcıları).
- `lib/role-home.ts` tek kaynak.

---

## Çakışmalar / birleştirme önerisi

- **`/neden-qratex`** (app/(public)/neden-qratex/page.tsx, 145 satır): Features bölümüyle aynı "neden biz" anlatısını ikinci kez yapıyor. Öneri: `/isletmeler` altında karşılaştırma bölümü olarak birleştirin, eski URL'ye 301.
- **`app/lab/zoom`** (izlenmeyen deneme; zoom-client.tsx:1688-1690'da fiyatlar üçüncü kez kopyalanmış): Landing yeniden tasarım denemesi. Ya bu rapordaki vizyonla birleşip ana sayfanın yerini alsın ya da silinsin; fiyat kopyası her durumda kaldırılmalı.
- **`TestimonialsSection`**: ölü kod + uydurma alıntılar; silin ya da gerçek, rızalı veriye bağlayın.
- **Rol → ana sayfa eşlemesi** 4 yerde (home-client.tsx:27-31, header.tsx:108-118, proxy.ts:64-69, login sayfası): tek yardımcıya birleştirin.
- **Fiyat kaynağı** 3 sabit kopya + DB: tek kaynak `PricingPlan`.
- Sayfa kaldırılmamalı; tüketici ve işletme olarak ikiye ayrılıp yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: her iddia, çağıran/çağrılan kod, `proxy.ts`, `next.config.js` CSP'si, Prisma şeması ve seed okunarak çürütülmeye çalışıldı. Kod çalıştırılmadı, veritabanına dokunulmadı.

### 1. Çerez onayı hiçbir analitiği kontrol etmiyor: **DOĞRULANDI** (ağ etkisi kısmen CSP'ye bağlı)
- `components/analytics/posthog-provider.tsx:48-51` her sayfada (kök `app/layout.tsx:170`) ilk mount'ta `initPostHog()` çağırıyor; `:18-25` `autocapture: true`, `disable_session_recording: false`. Onayı okuyan hiçbir koşul yok.
- `components/layout/cookie-consent-banner.tsx:31-39` "Opsiyonelleri reddet" yalnızca `localStorage`'a `optionalRejected: true` yazıp bir event atıyor. Repo genelinde `qratex_cookie_consent_v1` / `optionalRejected` / `qratex-cookie-consent-complete` değerlerini okuyan başka kod yok; yalnızca banner dosyasının kendisi eşleşiyor.
- "Koşullu" kısmı çürütüldü: proje hafızasına (2026-08-13 oturumu) göre `NEXT_PUBLIC_POSTHOG_KEY` Vercel production'da tanımlı ve deploy'a gömülü. Yani kod canlıda aktif.
- CSP ayrıntısı: `/` için yalnızca `next.config.js:352` geçerli, çünkü proxy matcher'ı (`proxy.ts:124`) public sayfaları kapsamıyor. Bu `connect-src` PostHog host'unu içermediğinden landing'de olay gönderimi büyük olasılıkla bloklanıyor. Buna karşılık `/customer/*` ve `/dealer/*` için `proxy.ts:26` `connect-src ... https:` veriyor; iki başlığın birlikte nasıl uygulandığı kod okumasıyla kesinleşmiyor (doğrulanmadı). CSP'den bağımsız olarak `posthog.init` varsayılan kalıcılık ayarıyla (`localStorage+cookie`), ziyaretçi reddetse bile `ph_<key>_posthog` tanımlayıcısını yazar.
- Yeniden üretim: canlıda gizli pencere → `/` → "Opsiyonelleri reddet" → DevTools Application sekmesinde `ph_phc_..._posthog` çerezi/localStorage kaydı görünür. `/customer` sayfalarında Network sekmesinde `eu.i.posthog.com` istekleri izlenebilir.
- Öneri: tek kaynak olarak bir `ConsentProvider` (`useSyncExternalStore` ile localStorage + event) kurulmalı. `PostHogProvider` yalnızca `analytics === 'granted'` iken `init` etmeli; reddedilirse `posthog.opt_out_capturing()` + `persistence: 'memory'` kullanılmalı. `track/identify` (`lib/analytics.ts`) aynı bayrağa bakmalı. CSP'ye `https://eu.i.posthog.com https://eu-assets.i.posthog.com` bilinçli olarak eklenmeli ya da bir reverse-proxy (`/ingest`) kurulmalı. Vercel Analytics/Speed Insights çerezsiz olduğu için zorunlu kategoride kalabilir.

### 2. HyperText istatistik bileşeni gerçek veriyi bozuk gösteriyor: **DOĞRULANDI** (bir örnek yanlış hesaplanmış)
- `components/ui/hyper-text.tsx:46-48`: `displayText` yalnızca ilk `children` ile kuruluyor, `children` değişince yeniden kurulmuyor. `:89-90`: animasyon yokken effect erken dönüyor. `:102-109`: döngü eski dizinin uzunluğu üzerinden dönüyor; `+`, `.`, `,` ve boşluk *eski* harfe bakılarak korunuyor. `components/landing/HeroSection.tsx:138-140`: `key={i}` olduğu için bileşen yeniden mount edilmiyor.
- Senaryo A (fetch animasyon bittikten sonra gelir; örneğin yavaş mobil ağ veya soğuk Redis): `setStats` yeni `children` veriyor ama `isAnimating=false` olduğu için ekranda sahte `10K+ / 500+ / 1M+` kalıcı olarak kalıyor (fare üzerine gelene kadar).
- Senaryo B (fetch animasyondan önce veya animasyon sırasında gelir): `'500+'` (4 karakter) → `'12+'` (3 karakter) geçişinde indeks 3'teki eski `+` korunuyor ve **`12++`** görünüyor. `'10K+'` → `'50+'` geçişi **`50++`** veriyor. İddiadaki `'1M+'→'450+'` = `'450'` hesabı yanlış: eski dizinin 2. indeksi `+` olduğundan sonuç **`45+`** oluyor. Bu yine yanlış bir değer (450 yerine 45 okunuyor). Puanda `4.9`→`4.3` gibi eşit uzunluktaki geçişler doğru gösteriliyor.
- Öneri: `HyperText`, değer değiştiğinde `displayText`'i yeni `children`'tan yeniden kurmalı (effect içinde `setDisplayText(children.split(''))` ve koruma kontrolünü `children[index]` üzerinden yapmak). Hızlı çözüm olarak istatistiklere `key={stat.value}` verilebilir. Daha doğrusu istatistiği RSC'de (`getPublicStats()`, Redis + fail-safe) hesaplayıp SSR'da gerçek değerle basmak; istemci fetch'i ve yedek değer tamamen kaldırılır.

### 3. Ana sayfada sahte sosyal kanıt yayında: **DOĞRULANDI** (yayında olup olmadığı DB'deki modül ayarına bağlı)
- `components/landing/AdMarquee.tsx:38-47` uydurma işletmeler içeriyor (`Kafe Aroma`, `Lezzet Durağı`...); `:50` varsayılanı `items = DEMO_ITEMS`. `app/(public)/home-client.tsx:45` bileşeni `items` vermeden render ediyor. Başlık `messages/tr.json:2162`: "Bize güvenen işletmeler".
- `app/(public)/page.tsx:32`: şerit `landing_marquee !== false` iken açık, yani varsayılan olarak AÇIK (`lib/module-controls.ts:54`). Canlı DB'de kapatılıp kapatılmadığı doğrulanmadı.
- `HeroSection.tsx:40-48`'deki yedek `10K+ / 500+ / 1M+ / 4.9` değerleri SSR HTML'ine giriyor (client component'in ilk render'ı SSR'da yapılıyor). Botlar ve JS'siz istemciler bu değerleri görüyor. `app/api/public/stats/route.ts:29-31` hiç değerlendirme yoksa ortalama puanı `4.9` olarak uyduruyor; `HeroSection.tsx:56` kullanıcı sayısı 0'dan büyükse bunu "Ortalama Puan 4.9" olarak gösteriyor.
- Etki ürün ve hukuk düzeyinde: Tüketicinin Korunması Hakkında Kanun / Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği kapsamında yanıltıcı beyan riski var. Kullanıcı verisine dokunmuyor. YÜKSEK önem uygun.
- Öneri: demo listesi kaldırılmalı. Şerit yalnızca `showcaseConsent=true` olan gerçek DEALER'lardan beslenmeli; sayı eşiğin altındaysa bölüm hiç render edilmemeli. Hero istatistikleri RSC verisiyle ve eşik bayrağıyla gelmeli (`belowThreshold` ise gizlenmeli ya da "Yeni başlıyoruz" gibi dürüst bir metin gösterilmeli). Rating `null` ise gizlenmeli.

### 4. Public stats yanlış metrikleri sayıyor: **DOĞRULANDI** (önemi ORTA, KRİTİK değil)
- `app/api/public/stats/route.ts:24`: `prisma.user.count()` filtresiz çağrılıyor; `Role` enum'u ADMIN/DEALER/CUSTOMER/STAFF değerlerini içeriyor (`prisma/schema.prisma`, `enum Role`). Etiket `messages/tr.json:2117`: "Aktif Kullanıcı". Bu yüzden işletme, personel ve admin hesapları da "aktif kullanıcı" sayılıyor; "aktif" için hiçbir zaman veya etkinlik ölçütü yok.
- `:26`: `prisma.feedback.aggregate` çağrısında `deletedAt` filtresi yok. `Feedback.deletedAt` bir soft-delete alanı ve `lib/prisma.ts`'te bunu otomatik filtreleyen bir `$extends`/middleware yok. Admin'in spam diye sildiği kayıtlar (`app/api/admin/feedbacks/route.ts:368`) sayıya ve ortalama puana giriyor. Diğer uçların hepsi (`app/api/admin/dashboard/route.ts:239`, `app/api/dealer/analytics/route.ts:150`) `deletedAt: null` kullanıyor; bu uç onlarla tutarsız.
- `businesses` yalnızca rolü sayıyor; silinmiş veya askıya alınmış bayileri ayırmıyor. Yeniden üretim: spam saldırısıyla 1 yıldızlı 200 kayıt geliyor, admin bunları siliyor; landing ortalaması 5 dakikalık Redis TTL dolduktan sonra da silinmiş kayıtlarla hesaplanmaya devam ediyor.
- Öneri: bir `getPublicStats()` sunucu yardımcısı yazılmalı: `user.count({ where: { role: 'CUSTOMER', lastActiveAt >= now-30g } })` (ya da etiket "Kayıtlı Kullanıcı" yapılmalı), `feedback.aggregate({ where: { deletedAt: null } })` ve DEALER için aktif/onaylı filtresi. Eski değerin TTL dolana kadar sızmaması için Redis anahtarı versiyonlanmalı (`stats:public:v2`).

### 5. Landing fiyatları gerçek faturalama/kota sisteminden kopuk: **KISMEN DOĞRULANDI** (önemi ORTA; alt iddialardan biri çürütüldü)
- Doğru olan: `lib/landing-content.ts:47-51` ve `app/(public)/page.tsx:94-108` (JSON-LD `Offer.price`) `299/699` değerlerini sabit tutuyor; özellik listesi de `messages/tr.json` içinde (2205 civarı) sabit. Gerçek planlar `PricingPlan` modelinde; admin bunları `app/api/admin/pricing/route.ts` ile düzenliyor, bayi faturalaması `app/api/dealer/billing/route.ts:29-30`'da DB'den okuyor. Seed (`prisma/seed.ts:781,802`) bugün aynı fiyatları yazıyor, yani sapma şu an *gizil*: admin fiyatı değiştirdiği anda vitrin ve Google'a giden yapılandırılmış veri eski fiyatta kalır. Canlı DB değerleri doğrulanmadı.
- Doğru olan: "Aylık 100/500 Geri Bildirim" limiti kodda yok. `lib/plan-limits.ts` yalnızca QR/şube kotası uyguluyor; repo genelinde aylık geri bildirim kotası yok. Ayrıca seed'deki planlarda `maxQRCodes` set edilmediğinden (`null` = sınırsız, `lib/plan-limits.ts:51`) "Başlangıç: 10 QR Kod" vaadi de uygulanmıyor. Hatta "Ücretsiz" planı atanmış bir bayi sınırsız QR açabiliyor, plansız bayi ise 3 QR ile sınırlı (`:23-26`). Bu kullanıcıya zarar vermiyor; gelir kaçağı ve vaat tutarsızlığı yaratıyor.
- Çürütülen alt iddia: "ücretli plan seçen işletme tüketici olarak kaydolur ve checkout'a ulaşmaz" ifadesi abartılı. `register/page.tsx:62,88` varsayılanı `CUSTOMER` yapıyor ve `PricingSection.tsx:84` rol/plan parametresi geçmiyor; bu kısmı doğru. Ancak kayıt formunda görünür bir rol seçici var (`register/page.tsx:24-25, 146-148, 221`); işletme DEALER'ı seçip `/dealer/billing`'e ulaşabiliyor. Sorun bir engel değil, funnel sürtünmesi: seçilen plan kayboluyor ve kullanıcının rolü elle seçmesi gerekiyor.
- Öneri: tek kaynak olarak bir `getPublicPricingPlans()` yazılmalı (RSC, `isActive` + `order`, Redis cache + build-time fail-safe); kartlar ve JSON-LD bu veriden üretilmeli. Özellik metinleri `features` JSON'undan, kotalar `maxQRCodes/maxBranches` alanlarından türetilmeli; böylece vitrin ile uygulama aynı veriden beslenir. CTA `register?role=DEALER&plan=<id>` olmalı. Kayıt sayfası `role` parametresini okuyup ön-seçmeli ve doğrulamadan sonra `/dealer/billing?plan=<id>`'ye yönlendirmeli. Uygulanmayan "aylık geri bildirim" limiti ya uygulanmalı (feedback POST'ta aylık sayım) ya da metinden kaldırılmalı.

### Özet
| # | İddia | Karar | Gerçek önem |
|---|---|---|---|
| 1 | Çerez onayı analitiği kontrol etmiyor | Doğrulandı | YÜKSEK (KVKK rızası) |
| 2 | HyperText bozuk istatistik | Doğrulandı (örnek düzeltildi: `45+`) | ORTA-YÜKSEK (görünür hatalı sayı) |
| 3 | Sahte sosyal kanıt | Doğrulandı (modül ayarına bağlı) | YÜKSEK (yanıltıcı reklam) |
| 4 | Yanlış metrik sayımı | Doğrulandı | ORTA |
| 5 | Fiyat/kota kopukluğu | Kısmen doğrulandı | ORTA |

---

## Uygulama (Dalga 2)

Sahip: `p-landing`. Commit'ler: `67763e8` (yeniden inşa), `9d24ab3` (public kabuk: header/footer), `c0df701` (takip düzeltmeleri).
Yeni dosyalar: `lib/landing/{public-stats-core,public-stats,public-pricing-core,public-pricing,earn-preview-core,earn-preview,seo,content-dates}.ts`, `components/public/p-landing/**`, `public/.well-known/security.txt`, test `__tests__/lib/landing-public.test.ts` (20 test, yeşil).
Silinen: `app/(public)/home-client.tsx`, `components/landing/` altındaki Hero/Features/AdMarquee/Demo/HowItWorks/Pricing/CTA/FAQ/Testimonials bölümleri, `lib/landing-content.ts` (`LandingBackground.tsx` yalnız `app/lab/zoom` için duruyor; lab'a dokunulmadı).

**Yeni yapı.** `app/(public)/page.tsx` tamamen sunucu bileşeni: oturum açık kullanıcı sunucuda `roleHome()` ile yönlenir; istatistik (`getPublicStats`), puan kuralları (`getEarnPreview`), planlar (`getPublicPricingPlans`) sunucuda, `unstable_cache` + Redis + try/catch (build-time fail-safe). Sayfa sırası: Hero (tüketici + işletme CTA, telefon mikro-hikâyesi) → gerçek rakam bandı → "Dört adımda kazan" (puan matrisinden) → "Geri bildirimin kaç puan eder?" deneme alanı → karakter kategorileri + lig basamakları + davet/seri → işletme şeridi (DB'den başlangıç fiyatı) → SSS (`<details>`, FAQPage JSON-LD) → kapanış CTA. İstemci adaları: `HeroStory`, `TryIt`, `CtaLink`, `LocaleSync`, `Reveal`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Metadata | ÇALIŞIYOR | `buildPublicMetadata` (`title.absolute`, canonical, tam OG/Twitter, admin override); TR'de admin varsayılan başlığı, EN'de çeviri |
| 2 | Organization/WebSite/Breadcrumb JSON-LD | ÇALIŞIYOR | `jsonLdHtml` `<`, `>`, `&`, U+2028/2029 kaçışlar; `inLanguage` görünen dille aynı |
| 3 | FAQPage JSON-LD | ÇALIŞIYOR | Görünen SSS ile aynı dizi, aynı dil (sunucuda çevrilir) |
| 4 | Fiyat JSON-LD | ÇALIŞIYOR (taşındı) | `/neden-qratex`'te, kartlarla aynı `PricingPlan` verisinden; uydurma `priceValidUntil` yok |
| 5 | VideoObject JSON-LD | KALDIRILDI | Demo videosu yok (CSP de engelliyordu); sahte meta yayınlanmaz |
| 6 | Fiyat modül anahtarı | ÇALIŞIYOR | Kapalıyken landing fiyat cümlesi/linki ve `/neden-qratex` plan kartları gizlenir, iletişim durumuna düşer; header/footer linki ölü kalmaz |
| 7 | Reklam şeridi modül anahtarı | KALDIRILDI | Şerit sahteydi (8 uydurma marka); rızalı işletme verisi olmadan geri gelmez → ŞEMA İSTEĞİ |
| 8 | Oturumlu kullanıcı yönlendirmesi | ÇALIŞIYOR | Sunucuda `redirect(roleHome(role))`; STAFF dahil, flaş ve geri tuşu döngüsü yok |
| 9 | Hareketli arka plan | ÇALIŞIYOR | `PublicBackdrop`: statik gradyan + 2 statik ışık; 40 sonsuz animasyon kalktı |
| 10 | Admin arka plan seçimi | ÇALIŞIYOR | Sunucu prop'u; önbelleksiz istemci isteği yok; sezonluk zemin lazy + `<Ambient>` (gizli sekmede/azaltılmış harekette durur) |
| 11 | Skip-link | ÇALIŞIYOR | TR/EN |
| 12 | Header logo | ÇALIŞIYOR | SSR'da `sr-only` ad; gizli varyantların `priority` önyüklemesi kaldırıldı |
| 13 | Header linkleri | ÇALIŞIYOR | "Nasıl çalışır" (tüketici) + özellik/fiyat → `/neden-qratex#…`; aktif durum yalnız tam yolda |
| 14 | Dil seçici | ÇALIŞIYOR | `LocaleSync`: istemci dili sunucunun bastığından farklıysa tek `router.refresh()` (döngüsüz) |
| 15 | Tema seçici | ÇALIŞIYOR | Modül düzeyinde bileşen; tek `onSelect` |
| 16 | Giriş/Kayıt/Panel butonları | ÇALIŞIYOR | Panel linki `roleHome` (STAFF → `/staff`) |
| 17 | Kaydırınca gizlenen header | ÇALIŞIYOR | `focus-within:translate-y-0` (WCAG 2.4.11) |
| 18 | Mobil menü | ÇALIŞIYOR | `SheetTitle` (sr-only) |
| 19 | Hero rozeti ("Yeni: AI…") | KALDIRILDI | Yerine kalıcı değer önerisi rozeti ("Geri bildirim ver, ödül kazan") |
| 20 | Hero başlık | ÇALIŞIYOR | LCP öğesi ilk HTML'de opak, statik CSS gradyan vurgu (JS beklemez) |
| 21 | Hero birincil CTA | ÇALIŞIYOR | `register?role=CUSTOMER&src=landing_hero`; ikincil "İşletmem için" → `/neden-qratex` |
| 22 | "Demo İzle" | KALDIRILDI | Yerine çalışan etkileşimli deneme alanı (#33) |
| 23 | Hero arka plan videosu | KALDIRILDI | CSP'de engelliydi, env yoktu; hero görseli telefon mikro-hikâyesi |
| 24 | Canlı istatistik kartı | ÇALIŞIYOR | Sunucuda gerçek değer; HyperText kaldırıldı, ekran okuyucu tek değer okur |
| 25 | Yedek 10K+/500+/1M+/4.9 | KALDIRILDI | Eşik altı metrik gizlenir; hiçbiri geçmezse dürüst "Yeni başlıyoruz" kartı; kaynak yoksa bant hiç çizilmez |
| 26 | `/api/public/stats` | ÇALIŞIYOR | Yalnız gerçek tüketici/işletme (demo, anonim, askıdaki hariç), silinmiş + demo geri bildirim hariç, ortalama ≥30 örneklemde; hata 503 zarfı; Redis anahtarı `stats:public:v2`; eski alan adları korunur |
| 27 | Scroll göstergesi | KALDIRILDI | Sonsuz dekoratif döngüydü; hero artık tam ekran değil |
| 28 | Özellik kartları | ÇALIŞIYOR (yeniden yazıldı) | Tüketici "kazanç döngüsü" (ekonomi değerleriyle) + işletme özellikleri `/neden-qratex#ozellikler`; "OpenAI ile" yanlış iddiası yok |
| 29 | Reklam / "Bize güvenen işletmeler" | KALDIRILDI | Uydurma sosyal kanıt → ŞEMA İSTEĞİ (`User.showcaseConsent`) |
| 30 | Marquee durdurma | KALDIRILDI | Şeritle birlikte |
| 31 | Demo video gömme | KALDIRILDI | — |
| 32 | Demo sahte poster | KALDIRILDI | — |
| 33 | Yer tutucu metni | KALDIRILDI | Yerine `TryIt`: yıldız + metin → ekonominin gerçek eşik kuralıyla canlı puan/XP; hiçbir şey göndermez, `aria-live` |
| 34 | "Nasıl çalışır" | ÇALIŞIYOR | `#nasil-calisir`, 4 adım, rakamlar puan matrisi/lig/karakter kataloğundan; işletme akışı `/neden-qratex#nasil-baslanir` |
| 35 | Fiyat kartları | ÇALIŞIYOR (taşındı) | `PricingPlan` tek kaynak (`/neden-qratex#fiyatlar`); landing'de DB'den "₺X'ten başlayan" |
| 36 | Plan vaatleri | ÇALIŞIYOR | Yalnız uygulanan kotalar (`maxQRCodes/maxBranches`) + admin'in plan özellikleri; sabit "aylık 100 geri bildirim" yok |
| 37 | Plan CTA'ları | ÇALIŞIYOR | `register?role=DEALER&plan=<id>&src=pricing&callbackUrl=/dealer/billing?plan=<id>` (kayıt sayfası `role` okuyor) |
| 38 | CTA bölümü | ÇALIŞIYOR | Kapanış CTA'sı iki rol, `src` ile |
| 39 | "Satış ile Görüşün" | ÇALIŞIYOR (kısmi kapsam) | Görünür e-posta adresi + mailto (`/neden-qratex` hero ve fiyat boş durumu); form için ŞEMA İSTEĞİ (Lead) |
| 40 | Spotlight | KALDIRILDI | Geçersiz CSS'li dekor bileşeniyle birlikte |
| 41 | SSS | ÇALIŞIYOR | `<details>` akordeon; tüketici + işletme soruları; puan rakamları sunucudan |
| 42 | Testimonials (ölü kod) | KALDIRILDI | Dosya silindi; rızalı gerçek alıntı için ŞEMA İSTEĞİ |
| 43 | Footer linkleri | ÇALIŞIYOR | "Hakkımızda → /#features" kaldırıldı, SSS → `/#sss`, TR/EN |
| 44 | Footer sosyal linkleri | KISMİ (açık) | Hesapların varlığı hâlâ doğrulanmadı — proje sahibinin onayı gerekir |
| 45 | Footer slogan | ÇALIŞIYOR | "Sadakatiniz" yazımı düzeltildi; EN arayüzde TR slogan gösterilmez (mount sonrası belirme duruyor) |
| 46 | "Powered by ReverBot" | KALDIRILDI | Yer tutucu |
| 47 | Çerez onayı | ÇALIŞIYOR | P0-31 (Dalga 1) ile rızaya bağlandı; `CtaLink` olayları da `track()` üzerinden rızaya bağlı |
| 48 | Yükleme ekranı | ÇALIŞIYOR | Statik iskelet, header/footer görünür, tam ekran perde yok |
| 49 | Azaltılmış hareket | ÇALIŞIYOR | Hikâye `<Ambient>` (OS + uygulama ayarı), `Reveal` aynı politika, arka plan statik |
| 50 | Hata durumu | ÇALIŞIYOR | İstatistik/plan okunamazsa bant gizli / dürüst plan durumu; sahte yedek yok |
| 51 | Tüketici değer önerisi | ÇALIŞIYOR | Hero, kazanç döngüsü, deneme alanı, koleksiyon/lig |
| 52 | Anonim "QR Okut" girişi | KISMİ (açık) | Hero'da "telefon kamerasıyla okut, uygulama gerekmez" yönlendirmesi var (QR doğrudan geri bildirim sayfasını açar); oturumsuz tarayıcı içi tarayıcı yok — `lib/qr-resolve` m-tara'nın, herkese açık tarama sayfası bu yüzeyin kapsamı dışında |
| 53 | PWA yükleme çağrısı | KISMİ (açık) | Global `InstallBanner` sürüyor; bağlamsal çağrı eklenmedi (düşük değer) |

**Kapanan bulgular:** 1 (Dalga 1'de; landing olayları da rızaya bağlı), 2, 3, 4, 5 (fiyat kaynağı + vaatler + rol/plan niyeti), 6, 7, 8, 9 (sayfa dil çerezi ve oturum yüzünden dinamik kaldı ama tüm veri önbellekli; bu sayfa için ~400 KB sözlük istemciye gitmiyor, 40 animasyon ve önbelleksiz DB isteği yok), 10, 11 (sayfa düzeyi), 12, 13, 14, 15, 16 → **16/16**.

**Eksik özelliklerden uygulananlar:** 1 (tüketici değer önerisi + ödül döngüsü), 2 (oyunlaştırma önizlemesi: karakter kategorileri, lig basamakları, seri/davet/çark), 4 (gerçek, eşikli canlı sayaçlar), 6 (kitle ayrımı + plan → kayıt → faturalama hunisi). Uygulanmayanlar: 3 (anonim tarayıcı içi QR tarayıcı, yakındaki işletmeler herkese açık sürümü — konum + işletme rızası gerektirir), 5 (Wrapped tarzı örnek kart — uydurma veriyle yapılamaz).

**Kalanlar (gerekçe):**
- ŞEMA İSTEĞİ: `User.showcaseConsent Boolean @default(false)` (+ vitrin logosu onayı) → rızalı "bize güvenen işletmeler" şeridi; rızalı müşteri alıntıları için `Testimonial` (ya da `Feedback.showcaseConsentAt`); satış iletişim formu için `Lead` modeli.
- Admin modül anahtarı `landing_marquee` artık tüketicisiz (`lib/module-controls.ts`, admin sahibinin işi: kaldırılmalı ya da showcase gelince bağlanmalı). `landing_pricing` açıklaması "landing + /neden-qratex planları" olarak güncellenmeli.
- `messages/{tr,en}.json` içindeki `landing.*` ad alanı artık kullanılmıyor (paylaşılan dosya; i18n sahibi temizleyebilir).
- `<html lang>` ve kök `alternates.languages` kök layout'ta (`app/layout.tsx`, paylaşılan) sabit `tr`; ayrı EN URL'si yok.
- Kayıt sayfası `src`/`plan` parametrelerini `user_registered` olayına eklemiyor (p-auth); `/dealer/billing` `?plan=` ile planı öne çıkarmıyor (b-ayarlar).
- Görsel doğrulama: dev server/build bu dalgada yasak olduğu için ekran görüntüsü alınmadı; tsc (bu yüzeyin dosyalarında 0 hata) ve jest ile doğrulandı.

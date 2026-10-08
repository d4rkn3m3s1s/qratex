# /neden-qratex

**Amaç:** Herkese açık (giriş gerektirmeyen) pazarlama / SEO sayfası. QRateX'i "klasik geri bildirim yöntemleri" ile 5 satırlık bir karşılaştırmayla konumlandırıp ziyaretçiyi kayda (`/auth/register`) veya fiyatlandırmaya (`/#pricing`) yönlendirmek. Header ve footer'daki "Neden QRateX?" linklerinin hedefi (`components/layout/header.tsx:30`, `components/layout/footer.tsx:20`), sitemap'te (`app/sitemap.ts:67`) yer alıyor.

**Genel puan: 5/10** · **Karar: yeniden tasarla**

> Kapsam notu: Denetim "müşteri paneli" (tüketici) bağlamında istendi; ancak sayfanın metni açıkça **işletmeye (B2B, bayi)** konuşuyor ("rakiplerinizden ayrışın" — `page.tsx:11`, "Fiyatlandırma" CTA'sı — `page.tsx:136-139`). Tüketiciye (QR okutup puan/rozet/lig kazanan kişiye) hitap eden tek bir cümle yok. Bu, aşağıdaki bulguların ana eksenlerinden biri.

Sayfa tamamen statik bir Server Component (145 satır). Kendi API çağrısı, formu, client state'i yok. Tek veri erişimi `getSeoSettings()` → `prisma.settings.findUnique({ key: 'seo' })` (`lib/seo-settings.ts:88-119`, `unstable_cache` 60 sn + try/catch ile varsayılan döner → build-time DB fail-safe kuralına uyuyor). Layout üzerinden ayrıca `getBackgroundEffect()` (`lib/get-background-effect.ts:11-26`, `Settings` modeli `prisma/schema.prisma:899`) ve client tarafında `/api/settings/background` çağrılıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Render edilen her şey çalışıyor ama SEO meta katmanı bozuk (canonical ana sayfaya işaret ediyor, OG görseli düşüyor) ve iki CTA da bağlama göre yanlış yere/yanlış varsayılan role gidiyor. |
| UX | 4/10 | Karşılaştırma iki ayrı karta bölündüğü için satır eşleşmesi kayboluyor; mobilde "Manuel", "Yok", "Değişken" gibi bağlamsız değerler kalıyor; hedef kitle belirsiz (işletme mi, tüketici mi). |
| Görsel | 5/10 | Temiz ve tutarlı shadcn kartları, ama landing'in motion/3D diline göre belirgin şekilde "boş" ve tek ekranlık; görsel kanıt (ekran görüntüsü, rakam, logo) yok. |
| Mimari | 5/10 | Kardeş sayfaların (`/guven`) kullandığı `generateMetadata` + `getPageSeo` + `WebPageJsonLd` + `BreadcrumbJsonLd` desenini terk edip statik `metadata` ve elle JSON-LD yazıyor; i18n'siz sabit Türkçe metin. |
| Performans | 8/10 | Sıfır client JS'li statik sayfa; tek eksi layout'tan gelen her public layout montajında önbelleksiz `/api/settings/background` → canlı DB sorgusu. |
| Erişilebilirlik + mobil | 5/10 | Breadcrumb, skip-link ve global focus ring iyi; ama karşılaştırma tablo/list semantiği taşımıyor, ekran okuyucu "X Manuel, X Yok…" gibi anlamsız bir dizi duyuyor; mobilde karşılaştırma fiilen çöküyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa `<title>` ("Neden QRateX? \| QRateX") | ÇALIŞIYOR | `page.tsx:9`, şablon `app/layout.tsx:51-54` | Root template ile birleşiyor. |
| 2 | Meta description | ÇALIŞIYOR | `page.tsx:10-11` | Admin SEO panelinden değiştirilemez (bkz. #5). |
| 3 | Canonical URL | BOZUK | Sayfa `alternates` tanımlamıyor; root `alternates.canonical: '/'` (`app/layout.tsx:66-67`) miras kalıyor | `/neden-qratex` için `<link rel="canonical">` ana sayfayı gösteriyor → arama motoru bu sayfayı ana sayfanın kopyası sayabilir. `/guven` bunu doğru yapıyor (`guven/page.tsx:17`). |
| 4 | OpenGraph meta | BOZUK | `page.tsx:12-16` yalnızca `title` + `description` veriyor | Next.js metadata birleştirmesi sığdır: alt segmentteki `openGraph` nesnesi üst segmentinkini **tamamen** değiştirir. Root'taki `images`, `url`, `siteName`, `locale`, `type` (`app/layout.tsx:69-85`) bu sayfada düşüyor → WhatsApp/LinkedIn/X paylaşımında görselsiz kart. |
| 5 | Admin SEO override (`getPageSeo`) | EKSİK | `page.tsx:8` statik `metadata`; `getPageSeo` hiç çağrılmıyor | Admin'in path bazlı başlık/açıklama/canonical override'ı bu sayfada etkisiz. Diğer public sayfalar (`guven`, `kullanim-sartlari`, `gizlilik-politikasi`…) `generateMetadata` kullanıyor. |
| 6 | Twitter kartı | KISMİ | Sayfa `twitter` tanımlamıyor; root `twitter.title = seo.defaultTitle` (`app/layout.tsx:87-93`) | X kartında sayfa başlığı değil site varsayılan başlığı görünür. |
| 7 | WebPage JSON-LD | ÇALIŞIYOR | `page.tsx:51-65` | Ortak `WebPageJsonLd` bileşeni (`components/seo/webpage-json-ld.tsx`) yerine elle yazılmış kopya; içerik sabit olduğu için XSS riski yok, ama desen tekrarı. |
| 8 | BreadcrumbList JSON-LD | EKSİK | Sayfada `BreadcrumbJsonLd` yok; `/guven` kullanıyor (`guven/page.tsx:31`) | Görsel breadcrumb var, yapısal veri yok. |
| 9 | Görsel breadcrumb ("Ana Sayfa › Neden QRateX?") | ÇALIŞIYOR | `page.tsx:67-72`, `components/seo/breadcrumb-nav.tsx:10-35` | `aria-label`, `aria-current="page"`, focus ring mevcut. |
| 10 | "Karşılaştırma" eyebrow etiketi | ÇALIŞIYOR | `page.tsx:73-75` | Dekoratif. |
| 11 | H1 + giriş paragrafı | ÇALIŞIYOR | `page.tsx:76-80` | E2E smoke testi bu başlığı doğruluyor (`e2e/smoke.spec.ts:20-23`). |
| 12 | "QRateX ile" kartı (5 madde, ✓ ikon) | ÇALIŞIYOR (statik) | `page.tsx:84-104`, veri `page.tsx:19-45` | Sabit kodlu dizi; CMS/i18n yok. `qratex: true` alanı hiç okunmuyor (ölü alan) — her satır zaten ✓. |
| 13 | "Klasik yöntemler" kartı (5 değer, ✗ ikon) | KISMİ | `page.tsx:106-125` | Satırda özellik adı yok, yalnızca `row.classic` basılıyor (`page.tsx:121`). İki kart ayrı akışta olduğundan satırlar arası eşleşme yalnızca görsel hizaya bağlı; mobilde (`md:grid-cols-2` altında, `page.tsx:82`) kartlar alt alta düşünce "Form / e-posta, Manuel, Yok, Ayrı araçlar, Değişken" bağlamsız kalır. "Değişken" gibi nötr bir değerin yanında da ✗ ikonu var (`page.tsx:119`) — iddia ile ikon çelişiyor. |
| 14 | Karşılaştırma semantiği (tablo / liste) | EKSİK | `page.tsx:95-123` sadece `<div>` | `<table>`/`<th scope>` ya da `<ul>/<li>` yok; ekran okuyucu satır-sütun ilişkisini kuramaz. |
| 15 | CTA "Ücretsiz Başla" | KISMİ | `page.tsx:129-134` → `/auth/register` | Kayıt sayfası rolü her zaman `CUSTOMER` ile başlatıyor (`app/(auth)/auth/register/page.tsx:63`, `:88`) ve `?role=` parametresi okumuyor (yalnız `ref` okunuyor, `:60`). B2B pitch'ten gelen işletme sahibi tüketici hesabı açmaya yönlendiriliyor. |
| 16 | CTA "Fiyatlandırma" | KISMİ | `page.tsx:135-140` → `/#pricing` | Fiyat bölümü admin modül anahtarına bağlı (`app/(public)/page.tsx:30`, `home-client.tsx:49`); kapalıyken `#pricing` çapası yok → kullanıcı ana sayfanın tepesine düşer. Oturum açık kullanıcı `/`'e gelince `home-client.tsx:24-34` onu paneline `router.push` eder → fiyatlara hiç ulaşamaz. |
| 17 | CTA tıklama analitiği | EKSİK | `page.tsx:129-140` düz `Link` | Bu sayfanın dönüşüme katkısı ölçülemiyor (kayıt sayfası sadece `user_registered` izliyor, `register/page.tsx:113`; kaynak sayfa bilgisi yok). |
| 18 | Çok dillilik (EN) | BOZUK | Header etiketi i18n'li (`messages/en.json:1857` "Why QRateX?"), sayfa metni sabit Türkçe (`page.tsx:9-140`) | EN dil tercihli ziyaretçi "Why QRateX?" linkine tıklayıp tamamen Türkçe sayfaya düşüyor. Landing ise `useAppT` ile çevrilmiş (`components/landing/FeaturesSection.tsx:20`). |
| 19 | Yükleniyor durumu | KISMİ | `app/(public)/loading.tsx:14-95` | Statik bir sayfa için tam ekran `fixed inset-0 z-[100]` overlay + sonsuz animasyon; marka yazımı "Qratex" (`loading.tsx:44`) sayfadaki "QRateX" ile tutarsız. |
| 20 | Hata durumu | ÇALIŞIYOR (genel) | `(public)` altında `error.tsx` yok; `app/error.tsx` devreye girer | DB hatası `getSeoSettings` içinde yutulup varsayılana düşüyor (`lib/seo-settings.ts:112-114`), sayfa pratikte hata vermez. |
| 21 | Hareketli arka plan (layout) | ÇALIŞIYOR | `app/(public)/layout.tsx:16`, `components/landing/LandingBackground.tsx` | `prefers-reduced-motion` destekli (`LandingBackground.tsx:50-56`). |
| 22 | Arka plan ayarının client'ta tekrar çekilmesi | KISMİ (perf) | `LandingBackground.tsx:35-48` → `app/api/settings/background/route.ts:7,12-24` | Sunucu zaten `initialBackgroundEffect`'i veriyor; client yine `cache: 'no-store'` ile `force-dynamic` uca gidip canlı DB'ye sorgu atıyor. Layout seviyesinde, tüm public sayfaları etkiler. |
| 23 | "İçeriğe atla" linki | ÇALIŞIYOR | `app/(public)/layout.tsx:17`, `main#main-content` `:22-26` | |
| 24 | Klavye odak halkası (CTA'lar) | ÇALIŞIYOR | Global `:focus-visible` kuralı `app/globals.css:131-133` | CTA'larda ayrıca sınıf yok ama global kural kapsıyor. |
| 25 | Karanlık tema | ÇALIŞIYOR | `page.tsx:137` `dark:` sınıfları; kartlar token tabanlı | |
| 26 | Sitemap kaydı | ÇALIŞIYOR | `app/sitemap.ts:66-71` | `lastModified: new Date()` her üretimde "şimdi" — gerçek değişiklik tarihini yansıtmaz (sitemap genelinde aynı desen). |
| 27 | Header/footer'dan erişim | ÇALIŞIYOR | `header.tsx:30`, `footer.tsx:20` | Footer'da "Şirket" grubu altında; "Hakkımızda" linki ise `/#features`'a gidiyor (`footer.tsx:18`) — ayrı bir sorun. |
| 28 | Motion / scroll reveal | EKSİK (bilinçli olabilir) | Sayfada hiç `Motion` yok | Landing bölümleri `whileInView` kullanırken bu sayfa tamamen durağan; tutarlılık açısından eksik. |
| 29 | Sosyal kanıt (rakam, müşteri logosu, alıntı) | EKSİK | — | Landing'de `TestimonialsSection.tsx` var ama burada kullanılmıyor. |
| 30 | Tüketiciye yönelik değer önerisi (puan/rozet/lig/oyun/ödül) | EKSİK | Metin tamamen işletme odaklı (`page.tsx:11,78-79`) | Müşteri panelinin en güçlü özellikleri (karakter rozeti, lig, mini oyunlar, ödüller) bu "neden" sayfasında hiç anılmıyor. |
| 31 | SSS / itiraz giderme | EKSİK | — | "Neden X" sayfalarının standart parçası; `FAQSection` landing'de var. |

**Sayım:** 31 özellik — ÇALIŞIYOR 15 · KISMİ 6 · BOZUK 3 · SAHTE 0 · EKSİK 7.

---

## Bulgular

### 1. Canonical etiketi ana sayfayı gösteriyor
- **Önem:** yüksek · **Kategori:** SEO / mimari · **Efor:** S
- **Kanıt:** `app/layout.tsx:66-67` (`alternates: { canonical: '/' }`), `app/(public)/neden-qratex/page.tsx:8-17` (alternates yok).
- **Sorun:** Next.js'te alt segment `alternates` vermezse root'unki miras kalır; `metadataBase` ile çözülünce `/neden-qratex`'in canonical'ı `https://<site>/` olur. Google bu sayfayı ana sayfanın kopyası olarak değerlendirip dizinden düşürebilir; sitemap'te (`app/sitemap.ts:67`) yer alması ile çelişen bir sinyal oluşur. Bu, sayfanın var olma sebebini (organik "neden QRateX / alternatif" aramaları) doğrudan boşa çıkarır.
- **Öneri:** Sayfayı `/guven`'deki desene taşıyın: `generateMetadata()` içinde `getPageSeo('/neden-qratex')` + `getSeoSettings()` ile `alternates.canonical = override?.canonical ?? \`${base}/neden-qratex\``. Aynı denetim, `alternates` vermeyen tüm public sayfalara bir script/grep ile uygulanmalı (root'taki `canonical: '/'` aslında yalnız ana sayfaya ait olmalı; daha sağlamı root'tan kaldırıp `app/(public)/page.tsx`'e taşımak).

### 2. OpenGraph override'ı OG görselini ve URL'yi siliyor
- **Önem:** yüksek · **Kategori:** SEO / paylaşım · **Efor:** S
- **Kanıt:** `page.tsx:12-16`; root OG nesnesi `app/layout.tsx:69-85`.
- **Sorun:** Next.js metadata birleştirmesi `openGraph` gibi iç içe alanlarda sığdır; sayfadaki `openGraph: { title, description }` root'taki `images`, `url`, `siteName`, `locale`, `type` alanlarını tamamen ezer. "Neden QRateX?" linki satış ekibi/WhatsApp/LinkedIn üzerinden paylaşıldığında görselsiz, site adısız bir kart çıkar — tam da paylaşılmak için yazılmış bir sayfa için en kötü sonuç. Ayrıca `twitter` verilmediği için X kartı sayfa yerine site varsayılan başlığını gösterir (`app/layout.tsx:89`).
- **Öneri:** `generateMetadata` içinde OG ve Twitter'ı tam kurun (`images: [{ url: seo.ogImageUrl, width, height }]`, `url`, `siteName`, `type: 'website'`). Daha iyisi: sayfaya özel bir OG görseli (`app/(public)/neden-qratex/opengraph-image.tsx` ile `ImageResponse` — karşılaştırma tablosunun mini görseli). Tekrarı önlemek için `lib/seo-settings.ts`'e `buildPageMetadata({ path, title, description })` yardımcıyı ekleyip tüm public sayfalarda kullanın.

### 3. Karşılaştırma iki ayrı karta bölünmüş; satır ilişkisi kayboluyor (özellikle mobilde)
- **Önem:** yüksek · **Kategori:** UX / erişilebilirlik · **Efor:** M
- **Kanıt:** `page.tsx:82` (`md:grid-cols-2`), `page.tsx:95-102` ve `116-123` (iki bağımsız `map`), `page.tsx:121` (klasik kartta yalnız `row.classic`).
- **Sorun:** Sayfanın tek içeriği olan karşılaştırma, satır-sütun ilişkisini yalnızca iki kartın yan yana tesadüfi hizasına emanet ediyor. 768 px altında kartlar alt alta düşünce ikinci kart "Form / e-posta · Manuel · Yok · Ayrı araçlar · Değişken" gibi neyle kıyaslandığı belli olmayan beş kelimeye dönüşüyor. Ekran okuyucu için `<div>` dizisi, ilişkisiz iki liste. Masaüstünde de bir satır sarılırsa (ör. "Puan, rozet, görevler (gamification)") hizalar kayar. "Değişken" değerinin yanında ✗ ikonu (`page.tsx:119`) da iddiayı abartıyor ve güvenilirliği düşürüyor.
- **Öneri:** Tek bir karşılaştırma bileşenine geçin (`components/marketing/comparison-table.tsx`): masaüstünde gerçek `<table>` (`<th scope="col">` "QRateX" / "Klasik", `<th scope="row">` özellik adı), mobilde her satırın bir kart olduğu "özellik başlığı + iki değer" yığını (aynı veri, CSS ile iki düzen). Her hücrede ikon + metin (yalnız ✓/✗ değil: "Anında, QR ile" vs "Form / e-posta, gün sonra"). Nötr değerler için ✗ yerine "–" veya uyarı ikonu. Veri `lib/landing-content.ts` içinde tipli bir diziye taşınıp i18n anahtarlarına bağlanmalı.

### 4. "Ücretsiz Başla" işletme sahibini tüketici kaydına götürüyor
- **Önem:** orta · **Kategori:** dönüşüm / akış · **Efor:** S
- **Kanıt:** `page.tsx:130`; `app/(auth)/auth/register/page.tsx:60,63,88` (rol daima `CUSTOMER` başlar; `?role` okunmuyor).
- **Sorun:** Sayfanın tüm metni işletmeye satış yapıyor ("rakiplerinizden ayrışın", "Fiyatlandırma"). CTA'ya basan işletme sahibi formda "Müşteri" seçili halde geliyor; fark etmezse tüketici hesabı açıp `/customer`'a düşüyor (`register/page.tsx:137`) ve bayi paneline hiç ulaşamıyor. Bu, en değerli dönüşümün sessizce kaybı.
- **Öneri:** Kayıt sayfası `searchParams.get('role')` (`dealer|customer`) ile başlangıç rolünü seçsin; bu sayfadaki işletme CTA'sı `/auth/register?role=dealer&src=neden-qratex` olsun. Sayfa iki kitleye de konuşacaksa iki ayrı CTA: "İşletmem için başla" (dealer) ve "Puan kazanmaya başla" (customer). `src` parametresi `user_registered` olayına eklenerek sayfanın dönüşümü ölçülsün.

### 5. "Fiyatlandırma" CTA'sı modül kapalıyken ve oturum açıkken kırılıyor
- **Önem:** orta · **Kategori:** işlevsellik / link · **Efor:** S
- **Kanıt:** `page.tsx:136`; `app/(public)/page.tsx:30`; `app/(public)/home-client.tsx:24-34,49`.
- **Sorun:** (a) Admin `landing_pricing` modülünü kapatırsa `#pricing` DOM'da yok, link ana sayfa tepesine düşer — header (`header.tsx:28`) ve footer (`footer.tsx:15`) da aynı sorunu taşır. (b) Giriş yapmış bir kullanıcı (ör. fiyat bakan bayi) `/`'e gidince `HomeClient` onu paneline yönlendirir; fiyatlara hiç ulaşamaz.
- **Öneri:** Modül durumunu sayfada okuyup (`getModuleControls()`, landing ile aynı kaynak) kapalıyken CTA'yı gizleyin veya "Satışla görüşün" alternatifine çevirin. Uzun vadede fiyatlandırmayı kendi rotasına (`/fiyatlandirma`) çıkarın; çapa tabanlı derin link, yönlendiren bir ana sayfaya bağlı kalmasın.

### 6. Sayfa i18n dışında: EN kullanıcı "Why QRateX?" deyip Türkçe sayfaya düşüyor
- **Önem:** orta · **Kategori:** i18n / tutarlılık · **Efor:** M
- **Kanıt:** `messages/en.json:1857` (`navWhyQratex: "Why QRateX?"`), `header.tsx:30`; sayfa metni sabit Türkçe `page.tsx:9-140`; landing çevrili (`FeaturesSection.tsx:20`, `app/(public)/page.tsx:4-5` `getMessages`/`getServerLocale`).
- **Sorun:** Uygulama EN locale'i destekliyor (`lib/server-locale.ts`), header ve landing çeviriyor; bu sayfa ise tek dilli. Dil karışıklığı güveni zedeler ve EN için SEO meta da yok.
- **Öneri:** Metinleri `messages/{tr,en}.json` altında `whyPage.*` anahtarlarına taşıyın, `getServerLocale()` + `getMessages()` ile sunucuda çevirin (landing'deki desen). `generateMetadata` da locale'e göre başlık/açıklama üretsin.

### 7. Kardeş sayfa desenlerinden sapma: admin SEO override ve BreadcrumbList JSON-LD yok
- **Önem:** orta · **Kategori:** mimari · **Efor:** S
- **Kanıt:** `page.tsx:8` (statik `metadata`), `page.tsx:51-65` (elle JSON-LD); karşılaştırma `app/(public)/guven/page.tsx:10-19,30-31`.
- **Sorun:** Admin SEO panelindeki path-bazlı override'lar bu sayfada hiçbir şey yapmıyor (admin değiştirdiğini sanar, değişmez). `BreadcrumbList` yapısal verisi yok; arama sonuçlarında breadcrumb zenginleşmesi kaçıyor. JSON-LD ortak bileşen yerine kopyalanmış; ileride sanitize kuralı değişirse bu sayfa geride kalır.
- **Öneri:** `generateMetadata` + `getPageSeo`, `<WebPageJsonLd>` ve `<BreadcrumbJsonLd>` kullanın; sayfayı `/guven` ile aynı iskelete hizalayın. Karşılaştırma içerikli olduğu için ek olarak `FAQPage` JSON-LD (SSS bölümü eklenirse) değer katar.

### 8. Hedef kitle belirsiz; tüketiciye yönelik değer önerisi hiç yok
- **Önem:** orta · **Kategori:** ürün / bilgi mimarisi · **Efor:** M
- **Kanıt:** `page.tsx:11` ("rakiplerinizden ayrışın"), `page.tsx:78-79`, `page.tsx:19-45` (5 satırın 5'i de işletme faydası).
- **Sorun:** Header'daki "Neden QRateX?" linki, QR okutup gelen tüketici dahil herkese görünüyor. Tüketici için asıl motivasyon (her geri bildirimde puan/XP, karakter rozeti koleksiyonu, lig, mini oyunlar, ödül kataloğu) sayfada yok; işletme için de somut kanıt (rakam, ekran görüntüsü, referans) yok. Sonuç: iki kitleye de zayıf konuşan, tek ekranlık bir liste.
- **Öneri:** Sayfanın üstüne kitle anahtarı ("İşletmeler için / Müşteriler için" segment kontrolü, URL'de `?for=business|customer` ile paylaşılabilir). İşletme görünümü: karşılaştırma tablosu + panel ekran görüntüleri + ROI rakamları + bayi CTA'sı. Müşteri görünümü: "Bir QR, üç adım, ödül" akışı; rozet/lig/oyun önizlemeleri; tüketici CTA'sı. Alternatif olarak tüketici anlatısı landing'de kalıp bu sayfa net biçimde "İşletmeler için neden QRateX" olarak yeniden adlandırılabilir.

### 9. Layout'tan her public sayfa girişinde önbelleksiz DB sorgusu
- **Önem:** düşük · **Kategori:** performans (layout seviyesi, paylaşılan) · **Efor:** S
- **Kanıt:** `components/landing/LandingBackground.tsx:35-48` (`fetch('/api/settings/background', { cache: 'no-store' })`), `app/api/settings/background/route.ts:7` (`force-dynamic`), `:14-17` (Prisma); sunucu zaten `getBackgroundEffect()` ile değeri geçiyor (`app/(public)/layout.tsx:13,16`, 60 sn cache).
- **Sorun:** Doğrudan açılan her public sayfa ziyareti canlı Neon'a ek bir sorgu ve ekstra bir ağ turu üretiyor; değer zaten SSR ile gelmiş durumda. Bu sayfaya özgü değil ama bu sayfanın tek "dinamik" maliyeti bu.
- **Öneri:** Client fetch'i kaldırın (admin değişikliği `revalidateTag('settings')` ile 60 sn içinde zaten yansıyor) ya da endpoint'i `s-maxage` + Redis cache ile önbellekli hale getirin.

### 10. Tam ekran yükleme overlay'i statik sayfa için aşırı; marka yazımı tutarsız
- **Önem:** düşük · **Kategori:** UX / tutarlılık · **Efor:** S
- **Kanıt:** `app/(public)/loading.tsx:14-15` (`fixed inset-0 z-[100]`), `:44` ("Qratex"); sayfa "QRateX" (`page.tsx:9,54,76`). Depoda "QRateX" 70, "Qratex" 16 dosyada geçiyor.
- **Sorun:** Header'dan bu sayfaya client navigasyonu sırasında RSC yüklenene kadar tüm ekranı kaplayan, header'ı da gizleyen bir splash çıkabiliyor; statik ve hafif bir sayfa için "ağır" his. Marka iki farklı yazımla görünüyor.
- **Öneri:** Public alt sayfalar için içerik iskeleti (başlık + iki kart skeleton) gösteren hafif bir `loading.tsx`, header/footer görünür kalsın. Marka yazımını tek sabit (`seo.siteName` / `lib/brand`) üzerinden üretin.

### 11. Küçük kod kalitesi notları
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- `comparisons[].qratex` alanı hiç okunmuyor (`page.tsx:22,27,32,37,42`) — ölü veri; ya kaldırılmalı ya da "kısmi" gibi üç durumlu bir modele dönüştürülmeli.
- `container` zaten `padding: '2rem'` tanımlı (`tailwind.config.*`, container ayarı) — `px-4` (`page.tsx:66`) mobilde 2rem'i 1rem'e indiriyor; bu, landing ile kenar boşluğu farkı yaratabilir (doğrulanmadı: görsel olarak ölçülmedi).
- `sitemap.ts:69` `lastModified: new Date()` her istekte değişir; gerçek içerik tarihini sabit tutmak tarayıcı bütçesi için daha doğru.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kitleye göre anlatı** — Starbucks Rewards "how it works" sayfası tüketiciye 3 adımlık (Join → Earn Stars → Redeem) akış anlatır; Duolingo'nun "neden" sayfaları kullanıcı kazancını (seri, lig, rozet) görselleştirir. Burada tüketici anlatısı tamamen yok.
2. **Somut kanıt ve rakamlar** — Revolut/Monzo pazarlama sayfaları ürün ekran görüntüsü, kullanıcı sayısı, puanlama ve basın logoları ile güven kurar. Bu sayfada sıfır görsel kanıt, sıfır metrik var.
3. **Etkileşimli ürün önizlemesi** — Spotify Wrapped tarzı "senin yıl özetin" örnek kartı ya da canlı demo QR'ı (landing'deki `DemoSection` yeniden kullanılabilir); okuyucunun ürünü 10 saniyede "hissetmesi".
4. **SSS / itiraz giderme** — "Müşterilerim QR okutur mu?", "Veri kimin?", "KVKK?" gibi soruları yanıtlayan, `FAQPage` JSON-LD'li bir bölüm (`/guven`'e derin link ile).
5. **Ölçülebilir dönüşüm** — CTA'lara kaynak (`src`) parametresi ve PostHog olayı; sayfanın kaç kayıt getirdiği bilinmiyor.
6. **Rakip/alternatif odaklı SEO içeriği** — "Google Form vs QRateX", "anket kağıdı vs QR" gibi alt başlıklar veya ayrı karşılaştırma sayfaları; "neden X" sayfalarının asıl organik trafiği bu sorgulardan gelir.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Ziyaretçi ilk 5 saniyede "bu benim için mi" sorusunu yanıtlar (işletme / müşteri anahtarı), 30 saniyede QRateX'in klasik yönteme göre farkını tek bakışta okunabilir bir tabloda görür, sonunda kendi rolüne uygun tek bir CTA ile kayda geçer.

**Yerleşim (yukarıdan aşağıya):**
1. **Hero** — H1 "Neden QRateX?", tek cümlelik değer önerisi, `İşletmeler için | Müşteriler için` segment kontrolü (Radix `ToggleGroup`, URL query senkronlu, SSR'da varsayılan `business`).
2. **Üç kanıt rakamı** — gerçek veriden (toplam geri bildirim, ortalama yanıt süresi, aktif işletme). Server Component'te `unstable_cache` + Redis ile günlük hesaplanan bir `getPublicStats()` (try/catch + varsayılan; build-time fail-safe kuralı). Gerçek veri yoksa bu blok hiç gösterilmez — uydurma sayı yazılmaz.
3. **Karşılaştırma tablosu** — tek bileşen; masaüstünde `<table>`, mobilde satır başına kart. 6–8 satır; her hücre ikon + kısa açıklama. Müşteri görünümünde tablo "Klasik sadakat kartı vs QRateX" (puan, rozet, lig, oyun, anında ödül).
4. **Nasıl çalışır (3 adım)** — QR okut → geri bildirim/puan → panelde AI analizi / ödül. `HowItWorksSection` içeriği yeniden kullanılabilir.
5. **Ürün önizlemesi** — işletme için panel ekran görüntüsü (next/image, AVIF), müşteri için rozet koleksiyonu ve lig kartının statik görselleri.
6. **SSS** (4–6 soru, `FAQPage` JSON-LD) + `/guven` linki.
7. **Rol bazlı kapanış CTA'sı** — `/auth/register?role=dealer&src=neden-qratex` veya `?role=customer`.

**Motion / 3D (ölçülü):** Sayfa bir okuma/karar sayfası; three.js burada gereksiz ağırlık olur. Önerilen: tablo satırlarına `whileInView` ile 40–60 ms stagger'lı fade-up (landing'deki `FeaturesSection` varyantlarıyla aynı, `m as Motion`), segment değişiminde içerik için `AnimatePresence` ile kısa çapraz geçiş, ✓ ikonlarında tek seferlik çizim animasyonu. Global `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) zaten azaltılmış hareketi kapsıyor. Müşteri görünümünde rozet küresinin yalnızca **statik render görseli** (3B sahne değil) kullanılabilir.

**Veri / API değişiklikleri:**
- `generateMetadata` + `buildPageMetadata()` yardımcısı (canonical, tam OG/Twitter, locale).
- `messages/{tr,en}.json` → `whyPage.*`; karşılaştırma verisi `lib/landing-content.ts`'te tipli dizi.
- Kayıt sayfasında `?role=` ve `?src=` desteği; `user_registered` olayına `source` alanı.
- Opsiyonel `getPublicStats()` (Redis cache'li, yalnız toplam sayılar, PII yok).
- `opengraph-image.tsx` ile sayfaya özel OG görseli.

---

## Çakışmalar / birleştirme önerisi

- **Landing `FeaturesSection` ile içerik çakışması:** Aynı üç iddia (QR geri bildirim, AI analizi, gamification) landing'de çevrili ve animasyonlu olarak zaten var (`components/landing/FeaturesSection.tsx`, `messages/tr.json:2112`). Mevcut haliyle bu sayfa landing'in daha zayıf, tek dilli bir özeti. Ayrı URL'nin SEO değeri (ve header'daki yeri) korunmaya değer, ama ancak **karşılaştırma + kanıt + SSS** ile landing'den farklılaşırsa. Farklılaşmayacaksa sayfa kaldırılıp `/neden-qratex` → `/#features` 301 yönlendirmesi yapılmalı.
- **`/guven` ile kısmi çakışma:** "KVKK uyumlu, güvenli altyapı" satırı (`page.tsx:41-44`) `/guven`'in konusu; burada tek satırla tekrar etmek yerine o satırı `/guven`'e derin link yapın.
- **Footer bilgi mimarisi:** "Hakkımızda" linki `/#features`'a gidiyor (`footer.tsx:18`), "Neden QRateX?" ise ayrı sayfa — iki link aynı soruyu farklı yerlere yönlendiriyor. Yeniden tasarımda "Hakkımızda" ya gerçek bir sayfaya ya da bu sayfaya bağlanmalı.
- **Önerilen karar:** Birleştirme değil, **yeniden tasarım**: sayfa "işletme/müşteri" segmentli, karşılaştırma odaklı, i18n'li ve SEO meta'sı düzeltilmiş bir karar sayfasına dönüştürülsün. En acil ve ucuz kısım (Bulgu 1, 2, 7) tek bir `generateMetadata` değişikliğiyle bugün kapatılabilir.

---

## Doğrulama (şüpheci inceleme)

İnceleme yöntemi: sayfa, kök layout, `(public)/layout.tsx`, `app/opengraph-image.tsx`, `app/sitemap.ts` ve projede kurulu Next.js 16.1.6'nın metadata birleştirme kaynağı (`node_modules/next/dist/lib/metadata/resolve-metadata.js`) satır satır okundu. Hiçbir kod/DB/build çalıştırılmadı.

### 1. Canonical URL ana sayfaya işaret ediyor — **Karar: DOĞRULANDI**

- `app/layout.tsx:65-69` → `metadataBase: new URL(base)`, `alternates: { canonical: '/', languages: { tr: base, 'x-default': base } }`.
- `app/(public)/layout.tsx` hiç metadata export etmiyor; `app/(public)/neden-qratex/page.tsx:8-17` `alternates` tanımlamıyor.
- Next.js birleştirmesi anahtar bazlı: `resolve-metadata.js:175-178` yalnızca segment `alternates` verirse üzerine yazar; vermezse kökte çözülmüş değer (`https://<base>/`) olduğu gibi miras kalır.
- Kardeş sayfalar bunu biliyor ve kendileri override ediyor (ör. `app/(public)/guven/page.tsx:17` `alternates: { canonical: \`${base}/guven\` }`); `/neden-qratex` istisna.
- **Yeniden üretim:** `/neden-qratex` HTML'inde `<link rel="canonical" href="https://<site>/">` ve `hreflang="tr"`/`x-default` da köke gider. Aynı URL `app/sitemap.ts:67`'de "indekslenecek sayfa" olarak bildirildiği için arama motoruna çelişkili sinyal gider (sitemap: bu sayfa; canonical: ana sayfa). Google canonical'ı ipucu olarak alır ve içerik farklı olduğundan bazen yok sayar, ama Search Console'da "Alternatif sayfa, uygun canonical etiketi var" ile dizin dışı kalma riski gerçek.
- **Ciddiyet notu:** Güvenlik/veri bulgusu değil; SEO açısından YÜKSEK tutarlı.

### 2. openGraph override'ı OG görselini ve url/siteName'i siliyor — **Karar: DOĞRULANDI (twitter kısmı nüanslı)**

- Sayfa `openGraph` nesnesi yalnız `title`/`description` içeriyor (`page.tsx:12-16`).
- `resolve-metadata.js:180-183`: segment `openGraph` verdiğinde `newResolvedMetadata.openGraph` tamamen yeniden çözülür; kökteki `images`, `url`, `siteName`, `locale`, `type` (`app/layout.tsx:70-85`) taşınmaz (derin birleştirme yok).
- Kurtarıcı gibi görünen `app/opengraph-image.tsx` de devreye girmiyor: dosya tabanlı OG görseli yalnız tanımlandığı segmentte `mergeStaticMetadata` ile işlenir (`resolve-metadata.js:146-156`, `421`) ve kökte `source.openGraph.images` zaten tanımlı olduğu için orada bile atlanır; alt segmente taşınmaz.
- **Yeniden üretim:** Sayfa linki WhatsApp/LinkedIn/Facebook'ta paylaşıldığında `og:title`/`og:description` doğru, ama `og:image`, `og:url`, `og:site_name`, `og:type`, `og:locale` etiketleri yok → görselsiz, sitesiz küçük önizleme kartı.
- **Twitter/X nüansı:** Sayfa `twitter` tanımlamadığı için kökteki `twitter` (`app/layout.tsx:86-92`) miras kalır. `postProcessMetadata` (`resolve-metadata.js:602-636`) OG'den otomatik doldurmayı yalnız twitter başlığı/açıklaması/görseli **yoksa** yapar; kökten gelen başlık dolu olduğundan doldurmaz. Sonuç: X kartı **görsel içerir** (kökteki `seo.ogImageUrl`) ama başlık/açıklama sayfanın değil sitenin varsayılanıdır (`seo.defaultTitle`/`defaultDescription`). Yani iddianın "X kartı site varsayılan başlığını gösterir" kısmı doğru; "görselsiz kart" kısmı yalnız OG tüketicileri için geçerli.
- **Öneri (ürün seviyesi):** Sayfaya özel kopyala-yapıştır yerine ortak bir `buildPageMetadata({ path, title, description, image? })` yardımcısı: `getSeoSettings()` + `getCanonicalBase()` ile `alternates.canonical`/`languages`, tam `openGraph` (url, siteName, locale, type, images) ve `twitter` (card, title, description, images) üretsin; `/neden-qratex` `export const metadata` yerine `generateMetadata` ile bunu çağırsın. Aynı yardımcı `alternates` tanımlamayan diğer public sayfalarda da (ör. `blog` liste sayfası, `experience`, `feedback` — ayrıca kontrol edilmeli, bu incelemede doğrulanmadı) aynı mirası kapatır. İstenirse `app/(public)/neden-qratex/opengraph-image.tsx` ile sayfaya özel görsel eklenebilir; o durumda sayfa `openGraph.images` vermemeli ki dosya tabanlı görsel uygulanabilsin.

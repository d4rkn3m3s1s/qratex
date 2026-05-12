# QRATEX Geliştirme, Hata ve SEO Raporu

Bu dokümanda ana sayfa ve public sayfalar için yapılan incelemeler, tespit edilen hatalar, SEO iyileştirmeleri ve öneriler yer alır.

---

## 1. Yapılan Düzeltmeler (Bu Turda)

| Konu | Yapılan |
|------|--------|
| **Sitemap** | `/guven` sayfası sitemap'e eklendi (footer'da link vardı, indekslenmesi için). |
| **JSON-LD** | Ana sayfaya Organization + WebSite şeması eklendi (zengin sonuçlar / rich snippets için). |
| **Canonical & metadata** | `/guven`, `/gizlilik-politikasi`, `/kvkk-aydinlatma-metni`, `/cerez-politikasi`, `/kullanim-sartlari` sayfalarına `title`, `description` ve `canonical` metadata eklendi. |
| **Erişilebilirlik** | Public layout'a "İçeriğe atla" (skip to content) linki ve `main` için `id="main-content"` eklendi. |

---

## 2. SEO Özeti

### Güçlü Yönler
- Root layout'ta `metadataBase`, `openGraph`, `twitter`, `robots`, `manifest` tanımlı.
- `lang="tr"`, `locale: 'tr_TR'` kullanımı doğru.
- `sitemap.xml` ve `robots.txt` dinamik; demo site için crawl kısıtlaması var.
- Ana sayfada tek `h1`, bölümlerde `h2`/`h3` hiyerarşisi mantıklı.

### Öneriler (İsteğe Bağlı)
- **Ana sayfa meta description**: Root layout'taki description genel; ana sayfa için daha uzun/özelleştirilmiş bir paragraf düşünülebilir (şu an template ile paylaşılıyor).
- **Görsel alt metinleri**: Tüm dekoratif görsellerde `alt=""` veya `aria-hidden="true"` kullanımı (zaten logo/Image bileşenlerinde alt var).
- **Blog / içerik sayfaları**: İleride blog eklenirse her yazı için `Article` JSON-LD ve `datePublished`/`dateModified` eklenebilir.
- **BreadcrumbList**: Alt sayfalarda (Güven, Kullanım Şartları vb.) breadcrumb JSON-LD eklenebilir.

---

## 3. Olası Hatalar / Dikkat Edilecekler

| Konu | Açıklama |
|------|----------|
| **Manifest shortcut'ları** | `manifest.json` içinde "QR Tara" → `/customer/scan`, "Dashboard" → `/customer` tanımlı. Giriş yapmamış kullanıcı bu linklere giderse login'e yönlendirilir; PWA kısayolu olarak kabul edilebilir, bilinen bir durum. |
| **OG görsel boyutu** | Layout'ta OG image 512x512. Twitter/OG için 1200x630 önerilir; ileride özel bir OG görseli (1200x630) eklenebilir. |
| **Canonical ana sayfa** | Root layout'ta `alternates.canonical: '/'`; ana sayfa için doğru. Alt sayfalar kendi canonical'larını export ediyor. |

---

## 4. Erişilebilirlik (A11y)

- **Skip link**: "İçeriğe atla" eklendi; klavye ile Tab ile odaklanıp Enter ile `#main-content`'e atlanıyor.
- **Tema değiştir / Menü**: Header'da `sr-only` ile "Tema Değiştir", "Menü" etiketleri mevcut.
- **Sosyal linkler**: Footer'da her ikon için `sr-only` ile açıklama var.
- **Kontrast**: Metinler `text-foreground` / `text-muted-foreground` ile tema renklerine bağlı; genel kullanımda sorun yok. İleride WCAG 2.1 AA kontrast kontrolü yapılabilir.

---

## 5. Performans Önerileri

- **Fontlar**: `next/font` (Inter, Space Grotesk) ile otomatik optimize; `display: 'swap'` kullanılıyor.
- **Hero animasyonları**: Çok sayıda motion div (orbs, snow, sparkles) var; düşük performanslı cihazlarda `prefers-reduced-motion: reduce` ile azaltma düşünülebilir.
- **Görsel boyutları**: Logo/Image bileşenlerinde `width`/`height` verilmiş; layout shift riski az.

---

## 6. Kod / Yapı Önerileri

- **Public sayfa metadata**: Tüm public sayfalar artık kendi `title`, `description` ve `canonical` değerlerini export ediyor; tutarlılık için yeni public sayfalarda da aynı pattern kullanılmalı.
- **Hata sınırları**: `app/error.tsx` ve `app/not-found.tsx` mevcut; kullanıcıya anlamlı mesaj ve ana sayfa linki verildiğinden emin olun.
- **Rate limit / güvenlik**: API ve auth tarafında rate limit, CSRF ve güvenlik başlıkları proje genelinde (middleware, API routes) kontrol edilmeli.

---

## 7. Özet Checklist

- [x] Sitemap'te tüm public sayfalar (guven dahil)
- [x] Ana sayfa JSON-LD (Organization, WebSite)
- [x] Public sayfalarda title, description, canonical
- [x] Skip to content (a11y)
- [x] OG image 1200x630 (opengraph-image.tsx + Admin SEO’dan yönetilebilir)
- [x] prefers-reduced-motion ile hero animasyonları azaltma
- [x] BreadcrumbList JSON-LD (guven, kullanim-sartlari, gizlilik, kvkk, cerez)
- [x] **Admin SEO Motoru**: /admin/seo — Genel meta, OG, Twitter, JSON-LD, Robots, Sitemap, Sayfa override’ları

## 8. Admin SEO Motoru

**Konum:** `/admin` → **SEO Motoru** (sidebar).

**Sekmeler:**
- **Genel:** Varsayılan başlık, açıklama, site adı, site URL, canonical base, OG görsel URL ve boyutları, Twitter handle/kart, locale, anahtar kelimeler.
- **JSON-LD:** Organization adı/açıklaması, WebSite açıklaması (schema.org).
- **Robots & Sitemap:** index/follow, ek disallow yolları, sitemap etkin.
- **Sayfa Override:** Sayfa yolu bazlı özel title/description (ileride generateMetadata’da kullanılabilir).

**Veri:** `Settings` tablosu, `key: 'seo'`, `value: { global, pageOverrides }`.

**Gerçekten çalışan bağlantılar:** Layout `generateMetadata()`, `opengraph-image.tsx`, `robots.ts`, `sitemap.ts` hepsi `getSeoSettings()` ile Admin ayarlarını kullanıyor. Tüm Genel + Robots & Sitemap alanları canlıda uygulanıyor.

Son güncelleme: Admin SEO motoru eklendi; robots + sitemap Admin ayarlarına bağlandı.

---

## 9. Derin Geliştirme ve Düzeltme Fırsatları

Aşağıdaki maddeler, SEO motorunu ve siteyi bir üst seviyeye taşımak için yapılabilecek, düzeltilebilecek ve geliştirilebilecek işleri grupluyor.

### 9.1 SEO / Admin Motoru — Eksik Bağlantılar

| # | Konu | Açıklama | Öncelik |
|---|------|----------|--------|
| 1 | **Ana sayfa JSON-LD Admin’den gelmeli** | Şu an ana sayfadaki Organization/WebSite JSON-LD sabit (`siteUrl`, "QRATEX", sabit açıklamalar). Admin’deki JSON-LD alanları (organizationName, organizationDescription, websiteDescription) ve siteUrl kullanılmıyor. Çözüm: Ana sayfayı server wrapper + client bölüp, server’da `getSeoSettings()` ile JSON-LD üretmek veya public API ile client’a vermek. | Yüksek |
| 2 | **Sayfa override’ları kullanılmıyor** | Admin’de kaydedilen “Sayfa Override” (yol, başlık, açıklama) hiçbir yerde okunmuyor. `/guven`, `/kullanim-sartlari` vb. kendi statik metadata export ediyor. Çözüm: Public layout veya her public sayfada `generateMetadata()` içinde pathname’e göre `getSeoSettingsFull().pageOverrides` ile eşleştirip title/description/canonical override uygulamak. | Yüksek |
| 3 | **getSeoSettings cache** | Her sayfa/robots/sitemap/OG isteğinde DB’e gidiliyor. `unstable_cache` (Next.js) veya kısa TTL ile (örn. 60 sn) cache eklenebilir; Admin’de “Kaydet” sonrası cache invalidate edilmeli. | Orta |
| 4 | **Admin’de URL / format validasyonu** | `ogImageUrl`, `siteUrl`, `canonicalBase` için URL formatı ve (opsiyonel) erişilebilirlik kontrolü. Kaydetmeden önce client veya API’de validasyon. | Orta |
| 5 | **FAQPage JSON-LD** | Ana sayfadaki SSS bölümü için Schema.org FAQPage eklenebilir; Google’da genişletilmiş snippet şansı artar. | Orta |
| 6 | **Önizleme linkleri** | Admin SEO sayfasına “Google Rich Results Test”, “Facebook Paylaşım Debugger”, “Twitter Kart Validator” linkleri eklenebilir; kullanıcı kaydettikten sonra hızlıca test eder. | Düşük |
| 7 | **SEO değişikliği audit log** | Diğer admin settings’te olduğu gibi SEO PUT sonrası `AuditLog` kaydı (entity: 'settings', entityId: seo row, oldData/newData). | Orta |
| 8 | **Sitemap’e override / özel URL** | İsteğe bağlı: Admin’de “Sitemap’e eklenecek ek URL’ler” (path + priority, changeFreq) ile sitemap.ts bu listeyi merge edebilir. | Düşük |

### 9.2 Düzeltmeler

| # | Konu | Açıklama |
|---|------|----------|
| 9 | **opengraph-image güvenli slice** | `seo.defaultDescription.slice(0, 120)` — description yoksa veya çok kısaysa sorun çıkmaz ama `desc?.slice(0, 120) ?? ''` ile null-safe yapılabilir. |
| 10 | **Hata sayfalarında noindex** | `error.tsx` ve `not-found.tsx` için metadata ile `robots: { index: false, follow: false }` eklenebilir; hata/404 sayfalarının indekslenmemesi iyi pratiktir. |
| 11 | **OG image alt metni** | `opengraph-image.tsx` içinde `alt` export’u var; Admin’deki siteName ile dinamik yapılabilir. |

### 9.3 Performans

| # | Konu | Açıklama |
|---|------|----------|
| 12 | **OP image cache** | Next.js OP image’ları varsayılan cache’leyebilir; production’da Cache-Control ile süre netleştirilebilir (örn. 1 saat). |
| 13 | **Ana sayfa LCP** | Hero’da çok fazla motion div var; reduced-motion dışında da “low-end” cihazlar için basit bir mod (daha az parçacık) veya lazy render düşünülebilir. |

### 9.4 Güvenlik / İdari

| # | Konu | Açıklama |
|---|------|----------|
| 14 | **Admin SEO API rate limit** | PUT/GET `/api/admin/seo` için rate limit (örn. dakikada 30 istek); abuse ve yanlışlıkla çok sık kaydetmeyi sınırlar. |
| 15 | **XSS / script injection** | Admin’den gelen title, description vb. layout’ta doğrudan meta’ya gidiyor; Next/React escape eder. JSON-LD’de kullanıcı girdisi varsa (ileride serbest metin alanları eklenirse) sanitize veya allowlist gerekir. |

### 9.5 İçerik / UX

| # | Konu | Açıklama |
|---|------|----------|
| 16 | **Blog / makale** | İleride blog varsa her yazı için Article JSON-LD, datePublished/dateModified, yazar; ayrıca sitemap’e blog URL’leri. |
| 17 | **Çok dilli (hreflang)** | İkinci dil eklenirse `alternates.languages` ile hreflang; Admin’de “desteklenen diller” ve sitemap’te dil varyantları. |
| 18 | **Structured data genişletme** | İşletme sayfaları, ürün/hizmet sayfaları için LocalBusiness, Product vb. schema’lar. |

### 9.6 Özet Öncelik Sırası (Uygulama İçin)

1. **Hemen:** Ana sayfa JSON-LD’yi Admin’den besle (#1); Sayfa override’ları public sayfalarda kullan (#2).  
2. **Kısa vadede:** getSeoSettings cache (#3); SEO audit log (#7); error/not-found noindex (#10).  
3. **Orta vadede:** FAQPage JSON-LD (#5); Admin validasyon (#4); rate limit (#14).  
4. **İsteğe bağlı:** Önizleme linkleri (#6); sitemap’e ek URL (#8); OP cache (#12); hreflang (#17).

**Uygulama durumu:** 1–4 arası maddelerin hepsi yapıldı (ana sayfa JSON-LD/FAQPage Admin’den, sayfa override getPageSeo, cache+revalidateTag, audit log, URL validasyon, rate limit, önizleme linkleri, ek sitemap, OP revalidate, noindex, sanitize). Ayrıca Admin–Bayi–Müşteri bağlantısı eklendi: admin/dealer/customer layout’larda `generateMetadata()` ile getSeoSettings() kullanılıyor (varsayılan başlık: Yönetim, Bayi Paneli, Müşteri Alanı); Sidebar bileşenine `siteName` prop’u ile Admin SEO’daki site adı iletiliyor (logo alt metni ve marka metni tek kaynaktan).

---

## 10. Başka neler yapılabilir (derin fikirler)

Bölüm 9 dışında, ileride düşünülebilecek ek geliştirmeler:

| Alan | Fikir | Açıklama |
|------|--------|----------|
| **Structured data** | WebPage / AboutPage | `/guven` gibi sayfalara WebPage veya AboutPage schema; sayfa türü netleşir. |
| **Auth sayfaları** | noindex | `/auth/login`, `/auth/register` için metadata ile robots noindex. |
| **Admin SEO** | Çakışan path uyarısı | Aynı path için iki override girildiğinde uyarı. |
| **Admin SEO** | Meta önizleme kartı | "Google'da böyle görünür" başlık/açıklama/OG önizlemesi. |
| **Admin SEO** | İçe / dışa aktarma | SEO ayarlarını JSON export/import (yedek). |
| **Admin SEO** | Audit'ten geri alma | Audit log'dan önceki sürüme dön. |
| **Performans** | LCP | Hero dışı animasyonları lazy; content-visibility ile aşağı bölümler. |
| **Sitemap** | lastModified | Sayfa bazlı son güncelleme tarihi kullanımı. |
| **Sitemap** | Sitemap index | Çok URL'de sitemap bölüp sitemap-index. |
| **İçerik** | Fiyatlandırma schema | Ana sayfa fiyat blokları için Product/Offer schema. |
| **İçerik** | Demo video | VideoObject schema (demo video eklenirse). |
| **Güvenlik** | CSP | Content-Security-Policy header. |
| **Çok dil** | hreflang | alternates.languages + sitemap dil varyantları. |
| **RSS** | Blog feed | Blog gelirse /feed.xml ve link rel=alternate. |

**Uygulama durumu (Bölüm 10):** Tüm maddeler uygulandı: WebPage/AboutPage schema (guven, kullanim-sartlari, gizlilik, kvkk, cerez); auth login/register noindex; Admin SEO çakışan path uyarısı, meta önizleme kartı, dışa/içe aktarma, audit geçmişi ve geri alma; LCP için content-visibility (features, demo, how it works, pricing, testimonials, faq); sitemap extra URL’lerde lastModified + Admin’de tarih alanı; ana sayfada Product/Offer (ItemList) + VideoObject (NEXT_PUBLIC_DEMO_VIDEO_URL ile); CSP header (middleware); hreflang (alternates.languages tr + x-default); RSS link + /feed.xml placeholder route.

---

## 11. Ek Geliştirme Fikirleri (İleride Eklenebilir)

Bölüm 9 ve 10 dışında, ürün ve teknik borç tarafında düşünülebilecek maddeler:

### 11.1 Ürün / Kullanıcı Deneyimi

| Alan | Fikir | Açıklama |
|------|--------|----------|
| **Onboarding** | Kayıt sonrası rehber | Yeni kullanıcıya “İlk QR kodunu oluştur”, “İlk geri bildirimi gör” gibi adımlarla kısa tur. |
| **Bildirimler** | Push / in-app | PWA push bildirimleri; dealer/customer için in-app bildirim merkezi (zaten badge var, liste genişletilebilir). |
| **Dark/Light** | Sistem + manuel | Tema seçimi: sistem, açık, koyu; tercih localStorage veya hesap ayarında saklanabilir. |
| **Çoklu dil** | tr + en | İkinci dil (örn. İngilizce); i18n key’leri, alternates.languages, sitemap dil varyantları. |
| **Offline** | Bayi tarayıcı | Dealer scan/offline-sync zaten var; müşteri tarafında “Kartım” özetinin offline cache’i. |
| **Erişilebilirlik** | WCAG kontrolü | Kontrast, focus visible, ekran okuyucu testi; eksik aria-label’ların taranması. |

### 11.2 Admin / Operasyon

| Alan | Fikir | Açıklama |
|------|--------|----------|
| **Dashboard** | Özelleştirilebilir widget’lar | KPI kartlarının sırası/görünürlüğü; “Favori” metrikler. |
| **Raporlama** | PDF/Excel export | Mevcut export’ların genişletilmesi; tarih aralığı, segment filtreli rapor indirme. |
| **Bulk işlem** | Toplu kullanıcı / kart | Çoklu seçimle rol atama, kart toplu atama/silme. |
| **Webhook** | Dış sistemlere olay | Geri bildirim, rozet kazanımı vb. için webhook URL’leri; Admin’de yapılandırma. |
| **API anahtarları** | Harici entegrasyon | Admin’de API key oluşturma/yönetimi; rate limit ve scope. |

### 11.3 Teknik / Performans

| Alan | Fikir | Açıklama |
|------|--------|----------|
| **Görsel optimizasyonu** | next/image + CDN | Tüm görsellerde boyut/format; isteğe bağlı görsel CDN (OG, upload’lar). |
| **API cache** | Stale-while-revalidate | Okuma ağırlıklı route’larda kısa cache header’ları; listelerde ETag. |
| **Monitoring** | Health endpoint | `/api/health` (DB, cache, kritik servisler); uptime checker veya Sentry heartbeat. |
| **E2E testler** | Kritik akışlar | Kayıt → giriş → QR tara → geri bildirim; Playwright/Cypress. |
| **Bundle analizi** | Boyut takibi | next/bundle-analyzer; büyük bağımlılıkların lazy load’u. |

### 11.4 Güvenlik / Uyumluluk

| Alan | Fikir | Açıklama |
|------|--------|----------|
| **2FA** | TOTP / e-posta kodu | Hesap güvenliği için iki adımlı doğrulama (özellikle admin/dealer). |
| **Oturum yönetimi** | Aktif oturumlar | Kullanıcının gördüğü cihaz/oturum listesi; “Diğer oturumları sonlandır”. |
| **Denetim** | Genişletilmiş audit | Tüm kritik işlemlerde AuditLog; Admin’de filtreli listeleme ve export. |
| **CSP raporlama** | report-uri | CSP’ye report-only veya report-to ile ihlal raporlarının toplanması. |

### 11.5 İçerik / Pazarlama

| Alan | Fikir | Açıklama |
|------|--------|----------|
| **Blog** | /blog | Makale listesi + detay; Article JSON-LD, RSS feed doldurma, sitemap. |
| **Vaka çalışmaları** | Müşteri hikayeleri | Ana sayfa veya ayrı sayfa; testimonial’ların genişletilmiş hali. |
| **Karşılaştırma** | Rakipler / fiyat | “Neden QRATEX?” sayfası; fiyat karşılaştırma tablosu (schema ile). |
| **Demo / sandbox** | Canlı deneme | Kayıt gerektirmeyen sınırlı demo (tek QR, örnek geri bildirimler). |

Bu liste önceliğe göre seçilebilecek fikirlerdir; hepsi aynı anda yapılmak zorunda değildir.

**Uygulama durumu (Bölüm 11):** Webhook ve API anahtarları eklendi: Prisma’da `Webhook` ve `ApiKey` modelleri; `GET/POST/DELETE /api/admin/webhooks`, `GET/POST/DELETE /api/admin/api-keys`; Admin sidebar’da "Webhook'lar" (`/admin/webhooks`) ve "API Anahtarları" (`/admin/api-keys`) sayfaları. `prisma db push` ile veritabanı güncellendi.

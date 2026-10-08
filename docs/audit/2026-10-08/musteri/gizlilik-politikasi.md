# /gizlilik-politikasi

**Amaç:** QR okutup geri bildirim veren, puan/rozet/lig kazanan tüketiciye (ve işletmeye) Qratex'in hangi kişisel verileri hangi amaçla işlediğini, kimlerle paylaştığını, ne kadar sakladığını ve kullanıcının haklarını nasıl kullanacağını anlatan yasal metin sayfası. Kayıt formundan (`app/(auth)/auth/register/page.tsx:437`), çerez bandından (`components/layout/cookie-consent-banner.tsx:73`), footer'dan (`components/layout/footer.tsx:29`) ve `/guven` sayfasından (`app/(public)/guven/page.tsx:89`) bağlanır; yani kullanıcının "onay verdiği" metin budur.

**Genel puan: 3.5 / 10**

**Karar: yeniden-inşa** (paylaşılan bir `LegalDocument` altyapısıyla, içeriği hukuken eksiksiz biçimde yeniden yazılarak; KVKK/çerez sayfalarıyla ortak bir "Gizlilik Merkezi" altında birleştirilmesi önerilir)

> Not: Sayfa 63 satırlık, tamamen statik bir server component. Hiçbir API'ye fetch yapmıyor, client etkileşimi yok. Tek veri kaynağı `prisma.settings` (`key = 'seo'`) satırı (`lib/seo-settings.ts:90`). Asıl sorunlar kod hatasından çok **içerik doğruluğu, yasal yeterlilik ve sistemle tutarsızlık** tarafında.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Sayfa render oluyor ama metin, kendi giriş paragrafında söz verdiği "kimlerle paylaşırız" ve "ne kadar saklarız" bölümlerini hiç içermiyor; "Son güncelleme" tarihi sahte. |
| UX | 3/10 | Dört kısa paragraf, içindekiler yok, haklar için uygulamadaki gerçek "verimi indir / hesabımı sil" araçlarına yönlendirme yok; kullanıcı ne yapacağını bilemiyor. |
| Görsel | 3/10 | Tek bir shadcn `Card` içinde `text-sm text-muted-foreground` düz paragraflar; ürünün geri kalanındaki görsel dil (rozet, mod, cila) burada hiç yok, okunabilirlik zayıf. |
| Mimari | 4/10 | 4 yasal sayfa neredeyse birebir kopya (aynı iskelet, aynı sahte tarih); metin kodda sabit, sürümleme/CMS yok; JSON-LD'de iki farklı base URL kaynağı. |
| Performans | 7/10 | Server component, SEO verisi `unstable_cache` + `react.cache` ile tekilleştirilmiş; yalnızca layout'taki hareketli arka plan ve tam ekran loading overlay gereksiz yük. |
| Erişilebilirlik + Mobil | 5/10 | Skip-link ve breadcrumb doğru, mobilde taşma yok; ama sayfada `h1` yok (başlık `h3`), metin 14px gri, başlık hiyerarşisi yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | `generateMetadata`: title/description/canonical + admin SEO override | ÇALIŞIYOR | `app/(public)/gizlilik-politikasi/page.tsx:9-18` | Override yoksa sabit metne düşüyor. Açıklama "saklama süreleri" vaat ediyor ama içerikte yok (bkz. #6). |
| 2 | WebPage JSON-LD | ÇALIŞIYOR | `page.tsx:28`, `components/seo/webpage-json-ld.tsx:72-85` | `name/description` `sanitizeSeoString` ile temizleniyor; `url` temizlenmiyor ama admin kontrollü. |
| 3 | BreadcrumbList JSON-LD | KISMİ | `page.tsx:29`, `components/seo/breadcrumb-json-ld.tsx:13` | `getCanonicalUrl` env tabanlı `siteUrl` kullanıyor; sayfa canonical'ı ise DB'deki `canonicalBase` (`page.tsx:12,16`). Admin canonicalBase'i değiştirirse iki farklı domain yayınlanır. |
| 4 | Görsel breadcrumb (Ana Sayfa › Gizlilik Politikası) | ÇALIŞIYOR | `page.tsx:31`, `components/seo/breadcrumb-nav.tsx:36-60` | `aria-current="page"`, focus ring mevcut. |
| 5 | Sayfa başlığı | KISMİ | `page.tsx:34`, `components/ui/card.tsx:44` | `CardTitle` bir `h3` render ediyor; sayfada hiç `h1` yok. Ayrıca admin override başlığı (`page.tsx:24`) JSON-LD'ye gidiyor ama görünen başlık sabit kalıyor. |
| 6 | Giriş paragrafı ("kimlerle paylaştığımızı ve ne kadar süre sakladığımızı açıklar") | SAHTE | `page.tsx:37-40` | Söz verilen iki bölüm sayfada yok. Kullanıcıya karşı yanlış beyan. |
| 7 | İşlenen veri kategorileri | KISMİ | `page.tsx:41-44` | Gerçekte işlenen konum (`prisma/schema.prisma:87-88`, `app/customer/nearby/page.tsx` geolocation), doğum tarihi (`schema.prisma:1906`), telefon (`schema.prisma:35`), push abonelikleri (`web-push`), oturum kaydı/ısı haritası (`components/analytics/posthog-provider.tsx:23-24`) ve AI ile geri bildirim analizi (`lib/ai-engine.ts:47`) anılmıyor. |
| 8 | İşleme amaçları | KISMİ | `page.tsx:45-48` | KVKK m.5/m.6 hukuki sebepleri, amaç–veri eşlemesi ve oyunlaştırma/profil çıkarımı (rozet, lig, karakter kategorisi) yok. |
| 9 | KVKK Aydınlatma Metni bağlantısı | ÇALIŞIYOR | `page.tsx:49-55` | Link doğru; ancak KVKK metni de aynı ölçüde yüzeysel. |
| 10 | "Son güncelleme" tarihi | BOZUK | `page.tsx:56` | `new Date().toLocaleDateString('tr-TR')` — metnin gerçek değişiklik tarihi değil, render/ISR anının tarihi. Aynı kalıp 4 yasal sayfada var. |
| 11 | Üçüncü taraflar / alıcı grupları / yurt dışı aktarım | EKSİK | — | Bağımlılıklar: Groq (ABD, `lib/ai-engine.ts:47`), PostHog, Sentry, Vercel Analytics/Speed Insights (`app/layout.tsx:168-170`), Stripe, Resend/nodemailer, Cloudflare R2 (`@aws-sdk/client-s3`), Upstash Redis (`package.json`). Hiçbiri anılmıyor. |
| 12 | Saklama süreleri | EKSİK | — | Kodda gerçek kurallar var (ör. okunmuş bildirim 30 gün: `app/api/cron/db-cleanup/route.ts:29,44`) ama politikada yok. |
| 13 | Veri sorumlusu kimliği ve iletişim | EKSİK | — | Unvan, adres, MERSİS/VERBİS, iletişim e-postası yok. (KVKK sayfasında yalnızca `info@qratex.com` var: `app/(public)/kvkk-aydinlatma-metni/page.tsx:57`.) |
| 14 | Kullanıcı hakları + self-servis araçlara yönlendirme | EKSİK | — | Uygulamada gerçek veri dışa aktarma ve hesap silme var (`app/api/user/data-export/route.ts`, `app/api/user/delete-account/route.ts`, UI: `app/customer/settings/page.tsx:454,482`) ama politika bunlara bağlantı vermiyor. |
| 15 | Çerez Politikası bağlantısı | EKSİK | `page.tsx` | Çerez bandı bu sayfaya yolluyor; bu sayfa çerez politikasına geri bağlanmıyor. |
| 16 | İçindekiler / bölüm çapaları / başlık hiyerarşisi | EKSİK | `page.tsx:36-57` | Yalnızca `<p>` blokları. |
| 17 | Sürüm geçmişi / değişiklik bildirimi / yeniden onay | EKSİK | — | `consentVersion`/`policyVersion` benzeri hiçbir alan yok (schema ve kod araması boş döndü). |
| 18 | İngilizce sürüm | EKSİK | `messages/en.json` (çerez bandı EN) | Uygulama EN destekliyor, çerez bandı EN çevirili linkle buraya yolluyor; sayfa yalnızca TR. |
| 19 | Yazdır / PDF / kalıcı bağlantı | EKSİK | — | Yasal metinler için beklenen bir kolaylık. |
| 20 | Yükleniyor durumu | KISMİ | `app/(public)/loading.tsx:14-31,58-62` | Statik metin sayfası için tam ekran (`fixed inset-0 z-[100]`) sonsuz animasyonlu overlay; kendi `LazyMotion strict` sarmalayıcısı var (global LazyMotion ile mükerrer); `prefers-reduced-motion` desteği yok. |
| 21 | Hata / DB erişilemezlik dayanıklılığı | ÇALIŞIYOR | `lib/seo-settings.ts:112-114`, `lib/get-background-effect.ts:18-20` | try/catch ile varsayılana düşüyor; build-time fail-safe kuralına uygun. |
| 22 | Hareketli arka plan (layout) | ÇALIŞIYOR | `app/(public)/layout.tsx:19`, `components/landing/LandingBackground.tsx:51,79` | Reduced-motion'a saygılı. Yasal okuma sayfası için gereksiz görsel gürültü. |
| 23 | "İçeriğe atla" linki | ÇALIŞIYOR | `app/(public)/layout.tsx:20,22-26` | `main` tabIndex -1 + focus ring. |
| 24 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:30` | `container px-4`; taşma yok. Ancak okuma genişliği/tipografi optimize değil. |
| 25 | Giriş yapmış müşterinin panelden erişimi | EKSİK | `components/settings/privacy-security.tsx` (link yok), `app/customer` altında `gizlilik-politikasi` referansı yok | Müşteri paneli içinden politikaya giden yol bulunamadı (grep: yalnızca register, guven, kullanim-sartlari, çerez bandı, footer, sitemap). |
| 26 | Çerez bandındaki "isteğe bağlıları reddet" ile politikanın tutarlılığı | BOZUK | `components/layout/cookie-consent-banner.tsx:31-35`, `components/analytics/posthog-provider.tsx:18-25` | `optionalRejected` yazılıyor ama hiçbir yerde okunmuyor; PostHog autocapture + session replay rıza beklemeden açılıyor. Bu sayfa da bunu açıklamıyor. |
| 27 | Sitemap kaydı | KISMİ | `app/sitemap.ts:42-46` | `lastModified: new Date()` — her üretimde "değişti" sinyali; gerçek sürüm tarihi olmalı. |

**Durum özeti:** ÇALIŞIYOR 9 · KISMİ 7 · BOZUK 2 · SAHTE 1 · EKSİK 9 (toplam 28)

---

## Bulgular

### 1. Çerez reddi hiçbir izlemeyi durdurmuyor; politika da bunu açıklamıyor
- **Önem:** kritik · **Kategori:** gizlilik / uyum / veri bütünlüğü
- **Kanıt:** `components/layout/cookie-consent-banner.tsx:31-35` (`optionalRejected: true` yazılıyor); `optionalRejected` ve `qratex_cookie_consent_v1` anahtarı repo genelinde yalnızca bu dosyada geçiyor (grep). `components/analytics/posthog-provider.tsx:18-25` rızaya bakmadan `autocapture: true`, `disable_session_recording: false` ile başlatıyor; `app/layout.tsx:168-170` Vercel Analytics + Speed Insights + PostHog'u koşulsuz mount ediyor.
- **Sorun:** Bu sayfa çerez bandından "Gizlilik Politikası" linkiyle açılıyor. Kullanıcı "isteğe bağlıları reddet" dese bile oturum kaydı ve tıklama izleme devam ediyor; politikada ise ne PostHog ne oturum kaydı geçiyor. Hem çerez politikasındaki "tercihe bağlıdır" beyanı (`app/(public)/cerez-politikasi/page.tsx:45-46`) hem de bu sayfanın sessizliği gerçeklikle çelişiyor. Bu, KVKK'nın açık rıza ve aydınlatma yükümlülüğü açısından doğrudan risk.
- **Öneri:** Tek bir `ConsentProvider` (client context + `consent` çerezi, sunucu tarafından da okunabilir) kurulmalı; PostHog `opt_out_capturing_by_default: true` ile başlatılıp yalnızca "analitik" onayıyla `opt_in_capturing()`; session replay ayrı bir kategori olarak "deneyim iyileştirme" onayına bağlanmalı; Vercel Analytics `beforeSend` ile rızaya göre filtrelenmeli. Gizlilik politikasında bu kategoriler, sağlayıcı adlarıyla ve "tercihlerimi değiştir" butonuyla birlikte listelenmeli. Ayrıca girişli kullanıcı için onay `User` üzerinde sürümlü kayıt olarak tutulmalı (bkz. Bulgu 5).
- **Efor:** M

### 2. "Son güncelleme" tarihi sahte (her render'da bugünün tarihi)
- **Önem:** yüksek · **Kategori:** veri doğruluğu / yasal
- **Kanıt:** `app/(public)/gizlilik-politikasi/page.tsx:56` — `new Date().toLocaleDateString('tr-TR')`. Aynı kalıp `kvkk-aydinlatma-metni/page.tsx:59`, `cerez-politikasi/page.tsx:56`, `kullanim-sartlari/page.tsx:60`. Sitemap'te de `lastModified: new Date()` (`app/sitemap.ts:44`).
- **Sorun:** Yasal metnin yürürlük tarihi, kullanıcının hangi sürüme onay verdiğinin kanıtıdır. Tarih; build/ISR yenileme anını (sayfa statik ise) ya da her isteğin anını (dinamik ise — hangisi olduğu build çıktısı görülmeden **doğrulanmadı**) gösteriyor; her iki durumda da gerçek değişiklik tarihi değil. Bir uyuşmazlıkta "metin dün değişti" izlenimi verir; ayrıca sunucu UTC'de çalıştığı için TR gece yarısı civarında bir gün kayabilir.
- **Öneri:** Metin bir sürüm nesnesi olarak tutulmalı: `{ version: '2026.10', effectiveAt: '2026-10-01', changes: [...] }`. Sayfa `effectiveAt`'i gösterir, `<time dateTime>` ile işaretler; sitemap `lastModified`'ı aynı alandan beslenir. Önceki sürümler `/gizlilik-politikasi/surumler` altında arşivlenir.
- **Efor:** S

### 3. Politika kendi vaat ettiği bölümleri içermiyor; gerçek veri işleme envanteriyle uyuşmuyor
- **Önem:** yüksek · **Kategori:** içerik / yasal yeterlilik
- **Kanıt:** Giriş `page.tsx:38-39` "kimlerle paylaştığımızı ve ne kadar süre sakladığımızı açıklar" diyor; meta açıklama da "saklama süreleri" diyor (`page.tsx:15,25`); bu bölümler yok. Gerçekte işlenen ama anılmayan veriler: konum (`prisma/schema.prisma:87-88,752-753`; `app/customer/nearby/page.tsx` `navigator.geolocation`), doğum tarihi (`schema.prisma:1906`), telefon (`schema.prisma:35`), IP + user-agent kayıtları (`schema.prisma:1114-1115,1644-1645,1928-1929`), push abonelikleri (`web-push`), oturum kaydı (`posthog-provider.tsx:24`), geri bildirim metninin AI ile analizi (Groq, ABD: `lib/ai-engine.ts:47`, `lib/ai-learning.ts:31`). Alıcılar: PostHog, Sentry, Vercel, Stripe, Resend, Cloudflare R2, Upstash (`package.json`).
- **Sorun:** Kullanıcının kayıtta "okudum" saydığı metin, ürünün yaptığı işlemenin küçük bir kısmını anlatıyor. Özellikle yurt dışına aktarım (KVKK m.9) ve otomatik profil çıkarımı (rozet karakter kategorisi, lig, churn sinyali) hiç geçmiyor. Bu bir yazılım hatası değil ama ürünün en büyük uyum açığı ve sayfanın varlık sebebini boşa çıkarıyor.
- **Öneri:** Hukukçu onaylı, katmanlı bir metin: (a) "Kısaca" özet kartı, (b) veri kategorisi × amaç × hukuki sebep × saklama süresi tablosu, (c) alıcı/alt işleyen tablosu (ad, ülke, amaç, aktarım dayanağı), (d) otomatik karar/profil çıkarımı bölümü (puan, rozet, lig, AI duygu analizi), (e) çocuklar, (f) güvenlik önlemleri (`/guven` ile bağlantılı). Envanter kod içinde `lib/legal/processing-inventory.ts` gibi tek bir kaynaktan üretilirse geliştiriciler yeni bir sağlayıcı eklediğinde politikayı da güncellemek zorunda kalır (CI'da `package.json` bağımlılıklarıyla karşılaştıran basit bir kontrol eklenebilir).
- **Efor:** L (içerik + hukuk onayı), teknik kısım M

### 4. Haklar bölümü yok; gerçek self-servis araçlar görünmez kalıyor
- **Önem:** yüksek · **Kategori:** UX / uyum
- **Kanıt:** Sayfada hak listesi ve başvuru kanalı yok (`page.tsx:36-57`). Ürün tarafında veri dışa aktarma (`app/api/user/data-export/route.ts`, `requireAuth` ile korumalı) ve hesap silme/anonimleştirme (`app/api/user/delete-account/route.ts:14-17`) var; UI: `app/customer/settings/page.tsx:454,482`, `components/settings/privacy-security.tsx:111,131`.
- **Sorun:** Revolut/Monzo seviyesindeki ürünlerde gizlilik sayfası "haklarını şimdi kullan" eylemlerine açılan bir kapıdır. Burada kullanıcı, uygulamada zaten çalışan özellikleri bulamıyor ve e-postayla başvurmaya yönlendirilmiyor bile.
- **Öneri:** "Haklarınız" bölümünde her hak için bir eylem kartı: "Verilerimi indir" → `/customer/settings?tab=privacy` (girişli değilse `/auth/login?callbackUrl=...`), "Hesabımı sil", "Pazarlama iletişimini kapat", "Çerez tercihlerini değiştir" (bandı yeniden açan bir event), "Başvuru formu" (KVKK m.13 – 30 gün yanıt süresi). Sunucu tarafında oturum varsa kartlar doğrudan eylem butonu olur, yoksa açıklama + giriş CTA'sı.
- **Efor:** M

### 5. Politika sürümü ve kullanıcı onayı kayıt altına alınmıyor
- **Önem:** yüksek · **Kategori:** mimari / uyum
- **Kanıt:** Kayıt formu yalnızca pasif metin gösteriyor (`app/(auth)/auth/register/page.tsx:427-443`), onay kutusu yok; schema'da `consentVersion`/`policyVersion`/`acceptedTerms` benzeri alan yok (grep sonucu yalnızca çerez bandı dosyası döndü). Çerez onayı yalnızca `localStorage`'da (`cookie-consent-banner.tsx:24`).
- **Sorun:** Politika değiştiğinde kimin hangi sürüme onay verdiği kanıtlanamıyor; kullanıcıya "politikamız güncellendi" bildirimi gönderilemiyor.
- **Öneri:** `LegalDocumentVersion` (slug, version, effectiveAt, contentHash) + `UserConsent` (userId, documentSlug, version, acceptedAt, ip hash) modelleri. Kayıtta ve önemli değişikliklerde müşteri panelinde tek seferlik "Gizlilik politikamız güncellendi — değişiklikleri gör" bottom-sheet'i (mevcut bildirim altyapısıyla). Çerez onayı da girişli kullanıcıda sunucuya yazılır.
- **Efor:** L

### 6. Dört yasal sayfa kopyala-yapıştır; metin kodda sabit
- **Önem:** orta · **Kategori:** mimari
- **Kanıt:** `gizlilik-politikasi/page.tsx`, `kvkk-aydinlatma-metni/page.tsx`, `cerez-politikasi/page.tsx`, `kullanim-sartlari/page.tsx` — her biri 63-66 satır, aynı `generateMetadata`, aynı JSON-LD, aynı `Card`, aynı sahte tarih; yol dizesi her dosyada 4-5 kez tekrar ediyor (`page.tsx:10,16,23,28,29,31`).
- **Sorun:** Bir düzeltme dört yerde yapılmak zorunda; metin değişikliği deploy gerektiriyor; hukuk ekibi metni kendi başına güncelleyemiyor.
- **Öneri:** `components/legal/LegalDocumentPage.tsx` (başlık, özet, TOC, bölümler, sürüm bandı, ilgili belgeler) + içerik kaynağı olarak MDX dosyaları (`content/legal/tr/gizlilik.mdx`, `en/privacy.mdx`) ya da admin'den düzenlenebilir, sürümlü `Settings`/ayrı tablo. Her rota 5 satıra iner: `export default () => <LegalDocumentPage slug="gizlilik" />`. Ortak `buildLegalMetadata(slug)` helper'ı.
- **Efor:** M

### 7. Sayfada `h1` yok, başlık hiyerarşisi ve okunabilirlik zayıf
- **Önem:** orta · **Kategori:** erişilebilirlik / SEO / görsel
- **Kanıt:** `page.tsx:34` `CardTitle` → `components/ui/card.tsx:44` `<h3>`; içerik `text-sm leading-6 text-muted-foreground` (`page.tsx:36`); başlıksız `<p>` blokları.
- **Sorun:** Ekran okuyucu kullanıcı başlıklarla gezinemiyor; arama motoru sayfanın ana başlığını bulamıyor; uzun yasal metin 14px gri yazıyla ve tam genişlikte (`container`) okunmaya zorlanıyor.
- **Öneri:** `h1` sayfa başlığı, her bölüm `h2` + `id` (çapa), alt başlıklar `h3`. Metin `text-base`, `text-foreground/85`, satır uzunluğu `max-w-[68ch]`; masaüstünde sol tarafta yapışkan içindekiler (`nav aria-label="İçindekiler"`), mobilde açılır "Bu sayfada" menüsü. Tablolar `overflow-x-auto` sarmalayıcıda.
- **Efor:** S

### 8. İngilizce kullanıcı TR metne düşüyor; panel içinden erişim yok
- **Önem:** orta · **Kategori:** i18n / bilgi mimarisi
- **Kanıt:** Çerez bandı `useAppT` ile çevriliyor (`cookie-consent-banner.tsx:15,76`; anahtarlar `messages/en.json`), link ise yalnız TR olan bu sayfaya gidiyor. Müşteri panelinde (`app/customer/**`, `components/settings/privacy-security.tsx`) bu sayfaya hiçbir bağlantı bulunamadı.
- **Sorun:** EN kullanıcı anlayamadığı bir metne onay vermiş sayılıyor; girişli müşteri, gizlilik ayarlarının hemen yanında politikayı göremiyor.
- **Öneri:** `LegalDocumentPage` locale'e göre içerik seçsin (`lib/server-locale.ts` ile), EN sürüm yoksa açık bir "This document is available in Turkish only; summary in English below" özeti gösterilsin. `privacy-security.tsx` içine "Gizlilik Politikası · KVKK · Çerezler" bağlantı satırı ve politika sürüm rozeti eklensin.
- **Efor:** M

### 9. JSON-LD ve canonical farklı base URL kaynaklarından besleniyor
- **Önem:** düşük · **Kategori:** SEO / mimari
- **Kanıt:** Canonical: `getCanonicalBase(seo)` → DB `canonicalBase || siteUrl` (`page.tsx:12,16`, `lib/seo-settings.ts:145-147`); Breadcrumb JSON-LD: env `siteUrl` (`components/seo/breadcrumb-json-ld.tsx:13`, `lib/site-config.ts:26-29`).
- **Sorun:** Admin canonical domain'i değiştirdiğinde breadcrumb yapılandırılmış verisi eski domain'i göstermeye devam eder.
- **Öneri:** `BreadcrumbJsonLd`'ye `base` prop'u eklenip sayfadan `getCanonicalBase(seo)` geçirilmeli ya da tek bir `resolveCanonicalUrl(path)` server helper'ı kullanılmalı.
- **Efor:** S

### 10. Yasal metin sayfası için ağır, hareketli yükleme ekranı ve arka plan
- **Önem:** düşük · **Kategori:** performans / motion
- **Kanıt:** `app/(public)/loading.tsx:14-31` (`fixed inset-0 z-[100]`, kendi `LazyMotion strict`), `:56-62` sonsuz `repeat: Infinity`, reduced-motion kontrolü yok; `app/(public)/layout.tsx:19` tüm public sayfalarda `LandingBackground`.
- **Sorun:** Saniyeler içinde render olacak statik bir metin için tam ekran marka animasyonu algılanan hızı düşürüyor; reduced-motion kullanıcıları için hareket durmuyor. Global LazyMotion varken ikinci bir sarmalayıcı gereksiz.
- **Öneri:** Yasal sayfalar için `app/(public)/(legal)/` route grubu: sakin, statik arka plan ve içerik iskeleti şeklinde bir `loading.tsx` (başlık + paragraf skeleton). Public loading'de `useReducedMotion()` ile animasyon kapatılmalı, iç `LazyMotion` kaldırılmalı.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Katmanlı "Kısaca" özeti** (Spotify/Monzo tarzı): en üstte 4-6 maddelik sade dil kartı ("Neyi topluyoruz · Neden · Kimle paylaşıyoruz · Ne kadar · Ne yapabilirsin"), altında tam metin.
2. **Gizlilik eylem merkezi** (Revolut/Google Hesabım tarzı): "Verilerimi indir", "Hesabımı sil", "Çerez tercihleri", "Bildirim/pazarlama izinleri" kartları — mevcut API'lere doğrudan bağlı.
3. **Oyunlaştırma verisi şeffaflığı** (Duolingo/Starbucks Rewards): puan, XP, rozet karakter kategorisi, lig ve sıralama tablolarında **diğer kullanıcılara neyin göründüğü** (takma ad, avatar, ilçe vb.) ve görünürlüğü kapatma seçeneği.
4. **Sürüm geçmişi + değişiklik özeti + güncelleme bildirimi**: "1 Ekim 2026'da neler değişti" diff kartı ve panelde tek seferlik bilgilendirme.
5. **Alt işleyen / yurt dışı aktarım tablosu**: sağlayıcı, ülke, amaç, dayanak — Groq, PostHog, Sentry, Vercel, Stripe, Resend, Cloudflare R2, Upstash.
6. **Çok dilli sürüm, yazdırılabilir görünüm ve kalıcı sürüm bağlantısı** (`/gizlilik-politikasi?v=2026.10`).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı sayfayı açtığında 10 saniyede "Qratex benim verimle ne yapıyor ve ben ne yapabilirim?" sorusunun cevabını alır; ayrıntı isteyen her başlığa tek dokunuşla iner; hakkını kullanmak istediğinde sayfadan ayrılmadan ilgili eyleme geçer. Ton: sakin, güven veren, okunabilir — oyunlaştırma ekranlarının enerjisi değil, Monzo'nun "plain English" şeffaflığı.

**Yerleşim:**
- **Üst bant:** `h1` "Gizlilik Politikası", altında sürüm rozeti ("Sürüm 2026.10 · Yürürlük: 1 Ekim 2026 · Değişiklikleri gör"), dil seçici, yazdır butonu.
- **"Kısaca" kartları:** 2×3 grid (mobilde dikey yığın), her kart ikon + tek cümle + "Ayrıntı" çapası.
- **Gövde:** Masaüstünde 2 kolon — solda yapışkan içindekiler (aktif bölüm IntersectionObserver ile vurgulanır), sağda `max-w-[68ch]` metin. Mobilde üstte açılır "Bu sayfada" menüsü.
- **Tablolar:** Veri kategorisi × amaç × hukuki sebep × saklama süresi; alt işleyenler tablosu. Mobilde kart listesine dönüşür.
- **"Haklarınız" eylem paneli:** oturum varsa doğrudan butonlar (dışa aktar, sil, çerez tercihleri), yoksa giriş CTA'sı.
- **Alt bilgi:** veri sorumlusu kimliği, iletişim (e-posta metin olarak), KVKK başvuru formu, ilgili belgeler (KVKK · Çerez · Kullanım Şartları · Güven).

**Motion/3D:** Yasal sayfada 3D veya dekoratif hareket **olmamalı**. Ölçülü olanlar: içindekiler aktif-durum geçişi (150 ms), "Kısaca" kartlarının ilk görünümde tek seferlik hafif fade/translate (stagger ≤ 40 ms, `useReducedMotion` ile kapanır), akordeon açılış yüksekliği animasyonu. Hareketli `LandingBackground` bu route grubunda sakin, statik bir zemine çekilmeli.

**Veri/API değişiklikleri:**
- `content/legal/{locale}/{slug}.mdx` + frontmatter (`version`, `effectiveAt`, `changes`) **veya** admin'den düzenlenebilir `LegalDocumentVersion` tablosu (slug, locale, version, effectiveAt, bodyMdx, contentHash, publishedBy).
- `UserConsent` tablosu (userId, slug, version, acceptedAt, channel) + `POST /api/user/consents` (oturumlu; rate-limit'li).
- `lib/legal/processing-inventory.ts`: veri kategorisi/alt işleyen envanterinin tek kaynağı; hem politika tablosunu hem `/guven` sayfasını besler.
- `ConsentProvider` + PostHog/Vercel Analytics'in rızaya bağlanması (Bulgu 1).
- Sitemap `lastModified` ve sayfa "yürürlük" tarihi aynı `effectiveAt`'ten.
- Statik üretim korunmalı (`export const revalidate = 3600` veya `generateStaticParams` + tag tabanlı revalidate); DB erişimi try/catch + varsayılan kuralına uymaya devam etmeli.

---

## Çakışmalar / birleştirme önerisi

- **`/kvkk-aydinlatma-metni`**: İçerik büyük ölçüde örtüşüyor (veri kategorileri, amaçlar, aktarım, haklar). KVKK m.10 aydınlatma metni hukuken ayrı bir belge olarak kalabilir, ama ikisi aynı `processing-inventory` kaynağından beslenmeli ve tek bir **Gizlilik Merkezi** (`/gizlilik`) altında sekmeler/alt sayfalar olarak sunulmalı: Politika · KVKK Aydınlatma · Çerezler · Haklarım.
- **`/cerez-politikasi`**: Çerez tablosu ve tercih yönetimi bu merkeze taşınmalı; "Çerez tercihlerini değiştir" butonu bandı yeniden açmalı.
- **`/kullanim-sartlari`**: Ayrı kalmalı ama aynı `LegalDocumentPage` bileşenini kullanmalı.
- **`/guven`**: Teknik güvenlik özeti; "Veri Politikaları" kartı (`app/(public)/guven/page.tsx:75-100`) Gizlilik Merkezi'ne tek bağlantıyla sadeleştirilebilir. İçerikte iç yol isimleri (`lib/pii-redact`, `guven/page.tsx:67`) son kullanıcıya gösterilmemeli.
- **`/customer/settings` (gizlilik sekmesi)**: Politikanın "Haklarım" bölümü bu ekrana derin bağlantı vermeli, ekran da politikaya geri bağlanmalı; ikisi aynı eylem bileşenlerini paylaşmalı.
- Rota kaldırılmamalı: kayıt formu, çerez bandı, footer ve sitemap bu URL'ye bağlı. Birleştirme yapılırsa eski URL 308 ile yeni merkez sekmesine yönlendirilmeli.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod, veritabanı, build veya test çalıştırılmadı. Her iddia çürütülmeye çalışıldı.

### 1. Çerez bandındaki "isteğe bağlıları reddet" etkisiz — **DOĞRULANDI**

- `components/layout/cookie-consent-banner.tsx:31-39`: `rejectOptional()` yalnızca `localStorage`'a `{ accepted: true, optionalRejected: true }` yazıp `qratex-cookie-consent-complete` olayını tetikliyor. Repo genelinde (docs hariç) `optionalRejected` ve `qratex_cookie_consent_v1` anahtarını okuyan başka hiçbir kod yok; olayı dinleyen tek yer `components/pwa/install-banner.tsx:52` (yalnızca PWA kurulum bandı).
- `components/analytics/posthog-provider.tsx:12-28`: `posthog.init` rıza kontrolü olmadan `autocapture: true` ve `disable_session_recording: false` ile çalışıyor; `PageviewTracker` (31-46) her rota değişiminde `$pageview` gönderiyor. `lib/analytics.ts:17-25` `identify(userId)` de rıza kontrolsüz.
- `app/layout.tsx:168-170`: `<Analytics />`, `<SpeedInsights />`, `<PostHogProvider />` koşulsuz mount.
- Tek çürütme yolu üretimde `NEXT_PUBLIC_POSTHOG_KEY` olmamasıydı: yerel `.env`'de yok, ancak proje hafızası (`session-2026-08-13-work.md:19`) anahtarın Vercel'de tanımlı ve deploy'a gömülü olduğunun doğrulandığını kaydediyor. Vercel ortamı bu incelemede doğrudan görülmedi.
- Not: Vercel Analytics/Speed Insights çerezsizdir; asıl rızasız işleme PostHog'dadır (çerez/`localStorage` kimliği + oturum kaydı + tıklama yakalama).
- **Yeniden üretim:** Canlı sitede gizli pencere aç → bantta "İsteğe bağlıları reddet"e tıkla → DevTools Network'te `eu.i.posthog.com` isteklerinin (`/e/`, `/s/` session recording) sürdüğünü, Application sekmesinde `ph_*` çerezi/anahtarının oluştuğunu gör. `/cerez-politikasi` (`page.tsx:45-46`) ise analitiği "Tercihe bağlıdır" diye tanımlıyor; beyan ile davranış çelişiyor.

### 2. "Son güncelleme" tarihi gerçek değil — **DOĞRULANDI** (önem: orta; tek başına veri sızıntısı değil, hukuki ispat/doğruluk sorunu)

- `app/(public)/gizlilik-politikasi/page.tsx:56` `new Date().toLocaleDateString('tr-TR')`; aynı kalıp `kvkk-aydinlatma-metni/page.tsx`, `cerez-politikasi/page.tsx:56` ve `kullanim-sartlari`'nda var. `app/sitemap.ts` her yasal sayfa için `lastModified: new Date()`.
- Sayfa dinamik API kullanmıyor; veri `unstable_cache(..., { revalidate: 60 })` (`lib/seo-settings.ts:118`) üzerinden geliyor. Dolayısıyla tarih ya build/ISR yeniden üretim anını ya da istek anını gösterir — hangisi olursa olsun metnin gerçek değişiklik tarihi değildir (render modu build çıktısı görülmeden doğrulanmadı).
- Somut kanıt: `git log` bu dosyanın içeriğinin en son 2026-07-22'de (`dd9eb6c`) değiştiğini gösteriyor; sayfa ise bugün 08.10.2026 (veya son deploy/yeniden üretim tarihini) gösteriyor.
- Ek bağlam: Kayıt formu (`app/(auth)/auth/register/page.tsx:427-443`) "kayıt olarak kabul edersiniz" türü örtük kabul kullanıyor ve şemada hangi politika sürümünün kabul edildiğini tutan alan yok; bu yüzden yanıltıcı tarih, kabul edilen sürümün ispatını tamamen imkânsız kılıyor.
- **Yeniden üretim:** Sayfayı bugün aç → "Son güncelleme: 08.10.2026"; yarın (veya bir sonraki deploy/yeniden üretimden sonra) aç → içerik aynıyken tarih değişmiş.

### 3. Politika gerçek işlemeyi ve yurt dışı aktarımı açıklamıyor — **DOĞRULANDI** (kanıtlarda düzeltme ile)

- `page.tsx:37-40` "kimlerle paylaştığımızı ve ne kadar süre sakladığımızı açıklar" diyor; sayfanın geri kalanında (41-55) ne alıcı/alt işleyen listesi ne de saklama süresi var. Vaat edilen bölümler gerçekten yok; `/kvkk-aydinlatma-metni` de yalnızca genel "sınırlı şekilde aktarılır" cümlesi içeriyor, yurt dışı aktarım (KVKK m.9) ve alıcı grupları adlandırılmıyor.
- Doğrulanan yurt dışı/üçüncü taraf işleyenler: Groq (`lib/ai-engine.ts:43-47`, `api.groq.com`), PostHog (EU), Sentry, Stripe, Resend, R2 (`@aws-sdk/client-s3`), Upstash (`package.json:35,56,60,85,93,96`); hiçbiri politikada geçmiyor.
- Doğrulanan veri kategorileri: `UserBirthday.birthDate` (`schema.prisma:1906`), `AuditLog.ipAddress/userAgent` (`schema.prisma:1114-1115`; politika IP/UA'yı genel olarak anıyor, bu kısım kısmen açıklanmış).
- **Kanıt düzeltmesi:** `schema.prisma:87-88` `latitude/longitude` müşterinin değil işletme profilinin koordinatıdır. Müşteri konumu ise `app/customer/nearby/page.tsx:118-133` ile alınıp `localStorage`'a yazılıyor ve `/api/customer/discovery?lat=..&lng=..` sorgusuyla (`:181-193`) sunucuya gönderiliyor; yani kalıcı saklama doğrulanmadı ama sunucuda işleniyor ve bu da politikada geçmiyor.
- Otomatik profil çıkarımı (rozet kategorisi, AI duygu analizi) metinde hiç anılmıyor; bu iddia doğru.
- **Senaryo:** Kayıt olan müşteri politikayı okuyup onaylıyor; geri bildirim metni Groq'a (ABD) gönderiliyor, oturumu PostHog'a kaydediliyor, doğum tarihi saklanıyor — kullanıcı bunların hiçbirinden metin üzerinden haberdar olamıyor. Hukuki değerlendirme bu incelemenin kapsamı dışında; teknik olgular kodla doğrulandı.

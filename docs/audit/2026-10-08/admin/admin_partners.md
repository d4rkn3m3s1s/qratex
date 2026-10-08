# /admin/partners

**Amaç:** POS, ajans ve dijital menü entegrasyon partnerlerini kaydetmek, her partnere bir kerelik gösterilen API anahtarı vermek ve partnerin webhook adresini tutmak.
**Genel puan:** 3/10
**Karar:** **birleştir** (`/admin/api-keys` ve `/admin/webhooks` ile tek bir "Entegrasyonlar / Partnerler" merkezinde; Partner, ApiKey ve Webhook kayıtlarının sahibi olan varlık olmalı)

> Özet: Sayfa görünüşte düzgün çalışıyor: liste yükleniyor, form kayıt oluşturuyor, anahtar gösteriliyor. Ama verdiği **API anahtarı sistemde hiçbir yerde doğrulanmıyor**. Partner API'si (`/api/partner/v1/*`) yalnızca `ApiKey` tablosundaki `qrx_` anahtarlarını kabul ediyor; bu sayfanın ürettiği `qrk_` anahtarlarını reddediyor. Partner'ın `webhookUrl` alanına da hiçbir şey gönderilmiyor. Yani sayfa, işe yaramayan bir kimlik bilgisi ve hiç kullanılmayan bir adres saklıyor. Okuma/yazma dışında düzenleme, pasifleştirme, silme, anahtar iptali, denetim günlüğü ve hız sınırı da yok.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Kayıt oluşuyor ama ürettiği anahtar ve webhook adresi hiçbir akışa bağlı değil; düzenleme, pasifleştirme ve silme yok. |
| UX | 3/10 | Tek seferlik anahtar penceresi dışarı tıklayınca onaysız kapanıyor; doğrulama hataları `[object Object]` olarak çıkıyor; liste yenilenmiyor. |
| Görsel | 4/10 | Ortak hero ve shadcn kartlarıyla tutarlı ama bilgi yoğunluğu çok düşük; ham enum değerleri (`dijital_menu`) ve anlamsız anahtar ikonu var. |
| Mimari | 2/10 | `Partner.apiKeyHash` (bcrypt, `qrk_`) ile `ApiKey.keyHash` (SHA-256, `qrx_`) iki ayrı kimlik sistemi; Partner ile ApiKey/Webhook arasında ilişki yok; audit ve hız sınırı eksik. |
| Performans | 7/10 | Tek sorgu, küçük veri; ancak `findMany` sınırsız (`take` yok) ve sayfalama yok. |
| Erişilebilirlik + Mobil | 4/10 | Label'lar input'lara bağlı değil (`htmlFor`/`id` yok); kopyala için ekran okuyucuya bildirim yok; mobilde tek sütun kabul edilebilir. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa hero'su (başlık + açıklama + ikon) | ÇALIŞIYOR | `app/admin/partners/page.tsx:109-113` | Ortak `AdminPremiumHero`; metinler sabit Türkçe, i18n'e bağlı değil. |
| 2 | Sidebar / admin menü girişi | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:195`, `app/admin/admin-utils.ts:123` | İki ayrı nav kaynağında tanımlı. |
| 3 | Yetki kontrolü (yalnız ADMIN) | ÇALIŞIYOR | `app/api/admin/partners/route.ts:25-26`, `:46-47` | `requireAuth(['ADMIN'])`; IDOR yok (kayıtlar zaten global). |
| 4 | Partner listesini yükleme (GET) | KISMİ | `page.tsx:44-54` | `res.ok` kontrol edilmiyor; 401/403/500'de `data.partners` olmadığı için sessizce boş liste kalıyor. |
| 5 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:184-185` | Yalnız ilk yüklemede; yenilemelerde göstergesi yok. |
| 6 | Boş durum | KISMİ | `page.tsx:186-192` | Hata durumunda da "Henüz partner yok" gösteriyor, yani yanlış bilgi veriyor. |
| 7 | Hata durumu | KISMİ | `page.tsx:49-50` | Yalnız ağ/JSON hatasında toast; sayfada hata kutusu ve "Tekrar dene" yok. |
| 8 | Partner kartı: ad | ÇALIŞIYOR | `page.tsx:200` | |
| 9 | Tür rozeti | KISMİ | `page.tsx:202` | Ham değer basılıyor (`ajans`, `dijital_menu`); formdaki etiketlerle (`Ajans`, `Dijital Menü`, `:160-161`) tutarsız. |
| 10 | Aktif rozeti | KISMİ | `page.tsx:203` | Yalnız aktifken var; pasif kayıtlar için "Pasif" göstergesi yok. Pasifleştirmenin yolu da yok. |
| 11 | Webhook URL gösterimi | KISMİ | `page.tsx:205-207` | `truncate max-w-xs` ile kesiliyor ama `title` veya kopyalama yok; URL zaten hiçbir yerde kullanılmıyor (#23). |
| 12 | Kart sağındaki `Key` ikonu | SAHTE | `page.tsx:209` | Dekoratif. Tıklanmıyor, anahtar durumunu (prefix, son kullanım, iptal) göstermiyor; sanki etkileşimli bir şey varmış izlenimi veriyor. |
| 13 | Kart giriş animasyonu | ÇALIŞIYOR | `page.tsx:196` | `Motion.div` fade/slide; azaltılmış hareket global `MotionConfig reducedMotion="user"` ile karşılanıyor (`components/providers.tsx:232`). |
| 14 | "Yeni Partner" butonu ve dialog | ÇALIŞIYOR | `page.tsx:116-123` | |
| 15 | Form: Partner adı | KISMİ | `page.tsx:144-151`, `:61-64`; API `route.ts:17` | İstemci yalnız boşluğu kontrol ediyor, API `min(2)` istiyor; 1 karakterlik ad sunucuda reddedilince #18'deki `[object Object]` hatası çıkıyor. Label input'a bağlı değil. |
| 16 | Form: Tür seçimi (POS / Ajans / Dijital Menü) | ÇALIŞIYOR | `page.tsx:152-164`, `route.ts:18` | Enum istemci ile sunucuda aynı. Türün davranışa etkisi yok (hiçbir yerde okunmuyor). |
| 17 | Form: Webhook URL (opsiyonel) | KISMİ | `page.tsx:165-172`, `route.ts:19` | `type="url"` ve istemci doğrulaması yok; `http://`, iç ağ adresleri ve `javascript:` gibi şemalar `z.string().url()` ile kabul ediliyor. Ekranda düz metin olarak basıldığı için bugün XSS riski yok (doğrulandı: `<p>` içinde, `href` değil). |
| 18 | "Oluştur" aksiyonu (POST) | KISMİ | `page.tsx:60-89`, `route.ts:56-59` | Bekleme (pending) durumu yok, çift tıklama iki partner ve iki anahtar oluşturur. Zod hatasında `error` bir nesne (`parsed.error.flatten()`), `new Error(obj)` toast'ta `[object Object]` gösteriyor (`page.tsx:76`). |
| 19 | "İptal" | ÇALIŞIYOR | `page.tsx:175` | Formu sıfırlamıyor; tekrar açınca eski değerler duruyor. |
| 20 | Tek seferlik API anahtarı gösterimi | SAHTE | `route.ts:61-62, 84`; `lib/partner-api-auth.ts:19-26` | Anahtar `qrk_` önekli ve bcrypt ile hash'leniyor. Partner API'si yalnız `qrx_` önekli ve SHA-256 ile `prisma.apiKey` tablosuna bakıyor. `Partner.apiKeyHash` tüm kod tabanında hiç okunmuyor (grep: yalnız yazma, `route.ts:68`). Partner bu anahtarla her istekte `401 Geçersiz anahtar biçimi` alır. |
| 21 | "Kopyala" | KISMİ | `page.tsx:98-105` | `navigator.clipboard.writeText` beklenmiyor ve hata yakalanmıyor; izin reddi veya güvensiz bağlamda da "Kopyalandı" diyor. `setTimeout` temizlenmiyor. |
| 22 | "Tamam" (kapat + listeyi yenile) | ÇALIŞIYOR | `page.tsx:91-96`, `:138` | |
| 23 | Partner webhook teslimatı | SAHTE | `lib/webhook-dispatch.ts:1-60` (yalnız `Webhook` modeli); `app/api/internal/inngest/partner-digest-webhook/route.ts:15-16` (`innovationPlatform.partnerDigest.webhookUrl`) | `Partner.webhookUrl` hiçbir dağıtıcıda kullanılmıyor. Partner digest webhook'u tek bir global URL'ye, `/admin/innovation` ayarından gidiyor. |
| 24 | Dialog'u dış tıklama / ESC / X ile kapatma (anahtar görünürken) | BOZUK | `page.tsx:116` | `onOpenChange` yalnız `setCreatedKey(null)` yapıyor: liste yenilenmiyor (yeni partner görünmüyor), form sıfırlanmıyor ve tek seferlik anahtar onay sorulmadan kalıcı olarak kayboluyor. |
| 25 | `metadata` alanı | EKSİK | `route.ts:20, 37, 70`; `schema.prisma:1461` | API kabul edip döndürüyor; UI'da ne girişi ne gösterimi var. `PartnerItem` tipinde de tanımlı değil (`page.tsx:26-33`). |
| 26 | `createdAt` gösterimi | EKSİK | `page.tsx:32` | Tipte var, ekranda hiç kullanılmıyor. |
| 27 | Düzenleme / pasifleştirme / silme | EKSİK | `route.ts` yalnız `GET` + `POST` | `isActive` alanı var ama değiştirmenin yolu yok; yanlış oluşturulan partner silinemiyor. |
| 28 | Anahtarı döndürme / iptal etme | EKSİK | — | Anahtar sızarsa (gerçekten çalışsaydı) iptal etmenin yolu yok. |
| 29 | Arama / filtre (tür, durum) / sıralama | EKSİK | `page.tsx:194-214` | Sabit `createdAt desc`; `route.ts:28-30` için `take` sınırı da yok. |
| 30 | Denetim günlüğü (AuditLog) | EKSİK | `route.ts:64-72` | Kardeş uç `api-keys/route.ts:73-83` her oluşturmada `CREATE_API_KEY` yazıyor; partner kimlik bilgisi üretimi iz bırakmıyor. |
| 31 | Admin hız sınırı | EKSİK | `route.ts:45-47` | `api-keys` ve `webhooks` uçları `checkAdminRateLimit` kullanıyor (`api-keys/route.ts:36`); burada yok. |
| 32 | i18n / dil tutarlılığı | KISMİ | `page.tsx:36, 185` | `useAppT` yalnız yükleniyor etiketi için kullanılıyor; geri kalan 20+ metin sabit Türkçe. EN dilinde sayfa karışık dilli görünür. |
| 33 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:194` | `md:grid-cols-2`, mobilde tek sütun; dialog shadcn varsayılanı. |

**Sayım:** ÇALIŞIYOR 12 · KISMİ 11 · BOZUK 1 · SAHTE 3 · EKSİK 6 → toplam 33.

---

## Bulgular

### 1. Partner API anahtarı hiçbir yerde doğrulanmıyor; sayfa işe yaramayan kimlik bilgisi üretiyor
- **Önem:** Yüksek · **Kategori:** İşlevsellik / mimari / veri bütünlüğü
- **Kanıt:** `app/api/admin/partners/route.ts:61-62` (`qrk_` + `bcrypt.hash`); `lib/partner-api-auth.ts:19-26` (yalnız `qrx_` + SHA-256 + `prisma.apiKey`); `Partner.apiKeyHash` için okuma yapan kod yok (grep: tek yazma `route.ts:68`).
- **Sorun:** Admin partneri oluşturuyor, "tekrar gösterilmez, güvenli saklayın" uyarısıyla anahtarı iletiyor. Partner `GET /api/partner/v1/catalog` veya `/digest` çağırdığında her seferinde `401 Geçersiz anahtar biçimi` alıyor. Çalışan anahtar ise başka bir sayfada (`/admin/api-keys`) üretiliyor ve Partner kaydıyla hiçbir ilişkisi yok. Ürün bir "partner kanalı" vaat ediyor ama bu sayfa o kanala bağlı değil.
- **Öneri:** Tek kimlik sistemi kurun. `ApiKey` modeline `partnerId String?` ilişkisi ekleyin; partner oluşturma ve anahtar üretmeyi `ApiKey` üzerinden (SHA-256, `qrx_`, `keyPrefix`, `scope`) yapın. `Partner.apiKeyHash` kolonunu kaldırın. Varsa mevcut `qrk_` kayıtları hiç doğrulanmadıkları için güvenle geçersiz sayılabilir; geçişte bunu admin'e bildirin. `authenticatePartnerApiKey` dönüşüne `partnerId` ekleyin ve `Partner.isActive=false` olan partnerin anahtarlarını reddedin.
- **Efor:** M

### 2. Tek seferlik anahtar penceresi onaysız kapanıyor; liste ve form durumu bozuluyor
- **Önem:** Orta · **Kategori:** UX / durum yönetimi
- **Kanıt:** `page.tsx:116` (`onOpenChange` yalnız `setCreatedKey(null)`), `:91-96` (doğru kapatma yalnız "Tamam"da).
- **Sorun:** Anahtar görünürken dışarı tıklamak veya ESC'ye basmak pencereyi kapatıyor. Anahtar kalıcı olarak kayboluyor, yeni partner listede görünmüyor (yenileme yok) ve form eski değerlerle kalıyor. Stripe ve GitHub benzeri ürünler bu adımda pencereyi "kopyaladım" onayı alınana kadar kilitler.
- **Öneri:** Anahtar adımında `onInteractOutside`/`onEscapeKeyDown` ile kapanmayı engelleyin. Kapatma butonunu "Anahtarı kopyaladım" onay kutusuna bağlayın. Tüm kapanış yollarını tek bir `resetAndRefresh()` fonksiyonundan geçirin. Listeyi `useSWR` ile yönetip oluşturmadan sonra `mutate()` ile iyimser ekleme yapın.
- **Efor:** S

### 3. Sunucu doğrulama hataları `[object Object]` olarak gösteriliyor
- **Önem:** Orta · **Kategori:** Hata yönetimi
- **Kanıt:** `route.ts:58` (`error: parsed.error.flatten()` nesne döner), `page.tsx:76` (`new Error(data.error || ...)`).
- **Sorun:** Tek karakterlik ad veya geçersiz URL girildiğinde kullanıcı anlamsız bir toast görüyor; hangi alanın hatalı olduğu belli değil.
- **Öneri:** API'yi kardeş uçlarla aynı sözleşmeye getirin (`{ error: string, details }`, bkz. `api-keys/route.ts:53-54`). İstemcide zod şemasını paylaşın (`lib/validations-admin`) ve `react-hook-form` + `zodResolver` ile alan altı hata mesajları gösterin.
- **Efor:** S

### 4. Oluştur butonunda bekleme durumu yok; çift gönderim mümkün
- **Önem:** Orta · **Kategori:** Yarış koşulu / veri bütünlüğü
- **Kanıt:** `page.tsx:60-89`, `:176` (disabled/pending yok); `route.ts` hız sınırı yok.
- **Sorun:** Bcrypt hash'i (cost 10) yanıtı yavaşlatıyor. Bu sırada ikinci tıklama ikinci bir partner kaydı oluşturuyor; ilk anahtar ekranda hiç görünmeden kayboluyor.
- **Öneri:** `isSubmitting` ile butonu kilitleyin ve spinner gösterin. Sunucuda `checkAdminRateLimit` ekleyin ve isteğe bağlı olarak `Idempotency-Key` başlığı kabul edin. `name` için benzersizlik (en azından aktif partnerler arasında) düşünün.
- **Efor:** S

### 5. Kimlik bilgisi üretimi denetim günlüğüne yazılmıyor ve hız sınırı yok
- **Önem:** Orta · **Kategori:** Güvenlik / uyumluluk
- **Kanıt:** `route.ts:45-86`; karşılaştırma: `app/api/admin/api-keys/route.ts:36, 73-83`.
- **Sorun:** Diğer entegrasyon uçları `AuditLog` yazıp `checkAdminRateLimit` uygularken partner uçları ikisini de yapmıyor. Bulgu 1 düzelip anahtar çalışır hale geldiğinde, kim hangi partnere ne zaman anahtar verdi sorusu yanıtsız kalacak.
- **Öneri:** `CREATE_PARTNER`, `ROTATE_PARTNER_KEY`, `DEACTIVATE_PARTNER` eylemlerini `getAuditRequestMeta` ile kaydedin. Kayıtları partner detay görünümünde "Etkinlik" sekmesinde gösterin.
- **Efor:** S

### 6. Liste hata ve yetki yanıtlarını sessizce "boş" gösteriyor
- **Önem:** Orta · **Kategori:** Hata yönetimi / UX
- **Kanıt:** `page.tsx:46-48` (`res.ok` yok), `:186-192`; `route.ts:28` (try/catch yok).
- **Sorun:** Oturum düşerse (401) veya DB hata verirse admin "Henüz partner yok" görüyor ve yanlışlıkla yeniden oluşturmaya yöneliyor.
- **Öneri:** Üç durumu (yükleniyor / hata + Tekrar dene / boş) ayrı tasarlayın. Sunucuda try/catch ile tutarlı JSON hata döndürün. Bunu `useSWR` ile `error` dalı üzerinden kurun.
- **Efor:** S

### 7. Partner'ın `webhookUrl` ve `type` alanları hiçbir davranışa bağlı değil
- **Önem:** Orta · **Kategori:** Sahte özellik / mimari
- **Kanıt:** `lib/webhook-dispatch.ts` yalnız `prisma.webhook` kullanıyor; partner digest tek global URL'ye gidiyor (`partner-digest-webhook/route.ts:16`); `type` hiçbir yerde okunmuyor.
- **Sorun:** Admin partner başına webhook girdiğini düşünüyor ama olaylar o adrese hiç gönderilmiyor. Ayrıca URL'de SSRF koruması yok; ileride dağıtıma bağlanırsa iç ağ adresleri (`http://169.254.169.254`, `localhost`) kabul edilecek.
- **Öneri:** `Webhook` modeline `partnerId` ekleyip partner webhook'larını oradan yönetin. Abonelik (event seçimi), imza sırrı, teslim günlüğü (`/api/admin/webhooks/deliveries` zaten var) ve "Test gönder" butonunu partner detayına taşıyın. URL doğrulamasında yalnız `https:` kabul edin ve özel/loopback IP aralıklarını reddedin. `type` için tür başına hazır olay setleri veya entegrasyon şablonları tanımlayın.
- **Efor:** M

### 8. Partner API'sinde partner ile bayi arasında yetki sınırı yok (ilgili uç, sayfa dışı)
- **Önem:** Orta · **Kategori:** Güvenlik / veri izolasyonu
- **Kanıt:** `app/api/partner/v1/digest/route.ts:27-29` (`dealerId` sorgu parametresi serbest), `lib/partner-digest-core.ts:21-28` (filtre yoksa tüm bayiler).
- **Sorun:** `read:partner_digest` yetkili herhangi bir anahtar tüm bayilerin 24 saatlik NPS ve geri bildirim özetini veya istediği bayiyi okuyabiliyor. Partner modelinde bayi ilişkisi olmadığı için "bu POS yalnız kendi müşterisi olan bayileri görsün" kuralı kurulamıyor. Bugün anahtarlar yalnız admin tarafından veriliyor, yani bu bir tasarım açığı; doğrudan istismar değil.
- **Öneri:** `PartnerDealer` (çoktan çoğa) ilişki tablosu ekleyin. `authenticatePartnerApiKey` `partnerId` döndürsün; digest bu partnere bağlı bayilerle sınırlansın, kapsam dışı `dealerId` için 403 dönsün. Partner detayında "Bağlı bayiler" sekmesi açın.
- **Efor:** M

### 9. Görünen bilgi yetersiz: ham enum, pasif durumu yok, tarih yok, anlamsız ikon
- **Önem:** Düşük · **Kategori:** Görsel / bilgi mimarisi
- **Kanıt:** `page.tsx:202, 203, 209`; `createdAt` kullanılmıyor (`:32`).
- **Sorun:** Kart yalnız ad, ham tür ve "Aktif" gösteriyor. Operatör partnerin anahtarının çalışıp çalışmadığını, en son ne zaman çağrı yaptığını veya webhook teslimlerinin başarılı olup olmadığını göremiyor.
- **Öneri:** Kartları yoğun bir tabloya çevirin. Sütunlar: Ad · Tür (etiketli) · Durum (Aktif/Pasif) · Anahtar (`qrx_ab12…`, son kullanım `ApiKey.lastUsedAt`) · Webhook sağlığı (son 24 saat başarı oranı) · Oluşturulma. Tür etiketleri için tek bir `PARTNER_TYPE_LABELS` sözlüğü kullanın.
- **Efor:** S

### 10. Erişilebilirlik ve i18n eksikleri
- **Önem:** Düşük · **Kategori:** Erişilebilirlik / dil
- **Kanıt:** `page.tsx:145-171` (`<Label>` için `htmlFor` yok, `<Input>` için `id` yok); `:98-105` (kopyala sonucu ekran okuyucuya duyurulmuyor); `:110-190` sabit Türkçe metinler.
- **Sorun:** Ekran okuyucu alanları adsız okuyor. Kopyala ikon değişimi yalnız görsel. EN dilinde sayfa yarı Türkçe kalıyor; `messages/en.json` içinde yalnız `adminInlineLoading.partners` ve menü etiketi var.
- **Öneri:** `htmlFor`/`id` eşleştirin. Kopyala butonuna `aria-live="polite"` durum metni ekleyin. Anahtar kutusunu `readOnly` input yapın (tek tıkla seçim, klavye erişimi). Tüm metinleri `adminPartners.*` anahtarlarına taşıyın.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Partner detay görünümü**: Genel bakış, API anahtarları (çoklu, prefix, son kullanım, kapsam), webhook uç noktaları ve teslim günlüğü, bağlı bayiler, etkinlik/denetim sekmeleri (Stripe "Connected account" detayı gibi).
2. **Anahtar yaşam döngüsü**: döndürme (eski anahtar için 24 saatlik ek süre), iptal, son kullanım, kapsam seçimi (`read:partner_digest`, `read:catalog`), isteğe bağlı IP izin listesi.
3. **Webhook test ve gözlemlenebilirlik**: "Test olayı gönder", teslim geçmişi, yeniden deneme, imza sırrı döndürme, başarı oranı grafiği (Stripe Webhooks paneli).
4. **Durum yönetimi**: aktif/pasif geçişi, arşivleme, onaylı silme (tür adını yazdırma), toplu işlemler.
5. **Arama, filtre ve sıralama**: tür ve durum filtresi, ad araması, sayfalama (`take`/cursor).
6. **Entegrasyon dokümantasyonu**: partnere gönderilecek hazır "kurulum paketi" (base URL, örnek `curl`, olay kataloğu `lib/partner-integration-catalog.ts`'den); bugün bu bilgi `/admin/innovation` içinde dağınık (`app/admin/innovation/page.tsx:517-530`).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör tek bir "Entegrasyonlar" ekranında hangi partnerin bağlı olduğunu, anahtarının en son ne zaman kullanıldığını ve webhook'larının sağlıklı olup olmadığını 5 saniyede görebilmeli. Yeni bir POS partnerini 1 dakikada, kimlik bilgisini kaybetme riski olmadan bağlayabilmeli.

**Yerleşim:**
- **Üst şerit:** kompakt hero yerine (bu bir iç araç) 4 KPI: aktif partner, son 24 saatte çağrı yapan partner, webhook başarı oranı, 30 günden uzun süredir kullanılmayan anahtar sayısı.
- **Ana tablo** (Linear/Stripe yoğunluğu): Ad · Tür · Durum · Anahtar (prefix + son kullanım) · Webhook sağlığı (mini sparkline) · Bağlı bayi sayısı · ⋯ menüsü (Düzenle, Anahtar döndür, Pasifleştir, Sil). Üstünde arama + tür/durum filtreleri. Mobilde tablo, satır başına kart listesine dönüşür.
- **Sağ çekmece (Sheet) detay:** sekmeler Genel / Anahtarlar / Webhook'lar / Bayiler / Etkinlik.
- **Oluşturma sihirbazı (3 adım):** (1) Ad + tür + bağlı bayiler → (2) Kapsamlar + webhook (https zorunlu, "Test gönder") → (3) Anahtar gösterimi: kilitli pencere, kopyala, "kaydettim" onayı, `.env` örneği ve `curl` örneği.

**Motion:** Ölçülü olmalı. Satır ekleme ve silmede `layout` animasyonu, çekmece için kısa slide, anahtar adımında kopyalandı onayı için mikro tik animasyonu yeterli. 3B veya dekoratif motion bu operasyonel ekrana uygun değil; global `reducedMotion="user"` korunsun.

**Veri / API değişiklikleri:**
- Prisma: `ApiKey.partnerId String?` + ilişki; `Webhook.partnerId String?` + ilişki; `PartnerDealer { partnerId, dealerId, @@id([partnerId, dealerId]) }`; `Partner.apiKeyHash` kaldırılır.
- API: `GET/POST /api/admin/partners`, `GET/PATCH/DELETE /api/admin/partners/[id]`, `POST /api/admin/partners/[id]/keys` (oluştur/döndür), `DELETE /api/admin/partners/[id]/keys/[keyId]`, `POST /api/admin/partners/[id]/webhooks/test`. Hepsinde `requireAuth(['ADMIN'])` + `checkAdminRateLimit` + `AuditLog` olmalı.
- `authenticatePartnerApiKey`: `partnerId` döndürür, pasif partneri reddeder; digest partnere bağlı bayilerle sınırlanır.
- İstemci: `useSWR('/api/admin/partners')` + `mutate`; zod şeması `lib/validations-admin`'de paylaşılır.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/api-keys`** (`app/admin/api-keys/page.tsx`, `app/api/admin/api-keys/route.ts`): Partner API'sinin gerçekte kabul ettiği anahtarlar burada üretiliyor. `/admin/partners` ise kopya ve çalışmayan bir anahtar sistemi kuruyor. **Doğrudan çakışma.**
- **`/admin/webhooks`** (`app/api/admin/webhooks/route.ts`, `lib/webhook-dispatch.ts`): Gerçek webhook dağıtımı ve teslim günlüğü burada. `Partner.webhookUrl` bunun işlevsiz bir kopyası. **Doğrudan çakışma.**
- **`/admin/innovation`** (`app/admin/innovation/page.tsx:440-530`): Partner digest webhook URL/sırrı ve "Partner entegrasyon paketi" açıklaması burada. Partner'a ait ayarlar üç sayfaya dağılmış durumda.

**Öneri:** Bu üç yüzeyi tek bir **"Entegrasyonlar"** merkezinde birleştirin: Partnerler (sahip varlık) → Anahtarlar → Webhook'lar → Teslim günlüğü → Dokümantasyon. `/admin/api-keys` ve `/admin/webhooks` partner'a bağlı olmayan iç amaçlı kayıtlar için "Partnersiz" filtresiyle aynı tabloda yaşayabilir. `/admin/innovation`'daki partner digest ayarları partner detayındaki webhook aboneliğine (`partner.digest.24h` olayı) taşınmalı. Sidebar'da (`components/dashboard/sidebar.tsx:195`, `app/admin/admin-utils.ts:123`) üç giriş tek bir "Entegrasyonlar" girişine indirilmeli.

---

## Doğrulama (şüpheci inceleme)

### 1. Partner sayfasının ürettiği API anahtarı sistemde hiçbir yerde kabul edilmiyor — **DOĞRULANDI**

Çürütme denemesi: Partner anahtarını kabul eden ikinci bir doğrulama yolu, `Partner.apiKeyHash`'i okuyan bir kod ya da `qrk_` önekini tanıyan bir middleware/proxy aradım; hiçbiri yok.

Kanıt:
- Üretim: `app/api/admin/partners/route.ts:61` `qrk_` + 48 hex karakter; `:62` bcrypt (cost 10); `:68` yalnızca `Partner.apiKeyHash`'e yazılıyor; `:84` ham anahtar bir kez dönüyor. İstemci bunu `app/admin/partners/page.tsx:77-79` adresinde "tekrar gösterilmez" uyarısıyla gösteriyor.
- Kabul: `lib/partner-api-auth.ts:19-21` `qrx_` ile başlamayan her token'ı `401 'Geçersiz anahtar biçimi'` ile reddediyor; `:22-26` SHA-256 özetini `prisma.apiKey` (`keyHash`) tablosunda arıyor. `Partner` tablosuna hiç bakmıyor.
- Tüketiciler: `authenticatePartnerApiKey` fonksiyonunu kullanan yalnızca iki uç var: `app/api/partner/v1/catalog/route.ts:10` ve `app/api/partner/v1/digest/route.ts:19-22`. Ayrıca `partner-digest-webhook` (Inngest), `Partner` modelini değil `innovationPlatform.partnerDigest` ayarını kullanıyor.
- `apiKeyHash` repo genelinde (docs hariç) yalnızca `prisma/schema.prisma:1459` ve yazıldığı `route.ts` içinde geçiyor. Okuyan kod yok. `prisma.partner.*` çağrıları sadece `findMany` ve `create`'ten ibaret (`route.ts:28,64`).
- Çalışan anahtarı üreten tek yer `app/api/admin/api-keys/route.ts:59`: `qrx_` + base64url, SHA-256 ile `ApiKey` tablosuna yazılıyor. `ApiKey` modelinde (`prisma/schema.prisma:1232-1244`) `partnerId` alanı yok, yani Partner kaydıyla ilişki kurulamıyor.

Yeniden üretim:
1. Admin `/admin/partners` sayfasında "X POS" partnerini oluşturur ve `qrk_ab12…` anahtarını alır.
2. Partner `GET /api/partner/v1/catalog` isteğini `Authorization: Bearer qrk_ab12…` ile gönderir.
3. Yanıt her zaman `401 {"error":"Geçersiz anahtar biçimi"}` olur. Önek `qrx_` yapılsa bile özet `ApiKey` tablosunda bulunmadığı için `401 'Geçersiz API anahtarı'` döner.

Not: Bu bir güvenlik açığı değil, işlevsel bir kırılma. Yanlışlıkla erişim açılmıyor, aksine meşru erişim hiç verilemiyor. Etki şu: Partner kanalı bu sayfa üzerinden işlevsiz. Admin geçersiz bir kimlik bilgisini "tek seferlik sır" diye dağıtıyor ve sorun ancak partnerin entegrasyonu başarısız olduğunda ortaya çıkıyor. Bu yüzden önem derecesi YÜKSEK (ürün/işlev) olarak yerinde. Raporun önerdiği düzeltme yönü kodla uyumlu: `ApiKey.partnerId` ilişkisi eklenmeli, anahtar üretimi `qrx_`/SHA-256 yoluna taşınmalı, `authenticatePartnerApiKey` `partnerId` döndürmeli ve pasif partneri reddetmeli, `Partner.apiKeyHash` kaldırılmalı.

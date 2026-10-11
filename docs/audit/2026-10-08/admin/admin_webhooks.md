# /admin/webhooks

**Amaç:** Platform operatörünün, Qratex içinde gerçekleşen olayları (geri bildirim, rozet, olay/incident vb.) HMAC imzalı HTTP POST ile dış sistemlere ileten webhook aboneliklerini oluşturması, listelemesi, silmesi ve teslim sağlığını izlemesi.

**Genel puan:** 4.5 / 10 · **Karar:** yeniden tasarla (ve `/admin/tech/add` içindeki ikinci webhook formunu bu sayfaya birleştir)

Kısa özet: Sayfa küçük ve temiz bir CRUD; ancak ürün vaadinin büyük kısmı gerçek değil. Seçilebilen 5 olaydan **yalnızca `feedback.created` gerçekten tetikleniyor**; webhook `secret` değeri GET yanıtıyla **düz metin olarak tarayıcıya gidiyor**; aktif/pasif, düzenleme, test gönderimi, yeniden deneme gibi bir webhook yönetim ekranının temel öğeleri yok; teslim sağlığı istatistiği global "son 500 kayıt" penceresinden hesaplandığı için yanıltıcı olabiliyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Ekle/sil/listele çalışıyor ama 5 olaydan 4'ü hiç tetiklenmiyor; pasifleştirme, düzenleme, test, retry yok. |
| UX | 4/10 | Tek sütunlu basit form anlaşılır; fakat hata durumu "Henüz webhook yok" olarak görünüyor, native `confirm()`, başarısız teslimde hangi webhook olduğu belirsiz. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` + shadcn kartlarla tutarlı; ancak native checkbox'lar, çıplak "Yükleniyor..." metni ve yoğun tek satırlık istatistik metni sade/ham. |
| Mimari | 4/10 | Secret istemciye sızıyor, olay listesi üç yerde ayrı ayrı tanımlı (sayfa, dispatcher, tech/add) ve uyumsuz; sunucu tarafında olay whitelist'i ve SSRF koruması yok. |
| Performans | 7/10 | İki hafif istek, `take` limitleri var; tek sorun deliveries ucunun JSON'u uygulama katmanında toplaması (500 satır). |
| Erişilebilirlik + Mobil | 4/10 | `Label` alanlara bağlı değil, ikon butonda `aria-label` yok, sağlık rozeti yalnızca renkle anlam taşıyor; layout padding'ine ek `p-6` mobilde alanı daraltıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlık + açıklama | KISMİ | app/admin/webhooks/page.tsx:124-128 | Açıklama "Geri bildirim, rozet, görev vb. olayları" diyor; "görev" diye bir olay yok, "rozet" hiç tetiklenmiyor. Yanıltıcı metin. |
| 2 | URL alanı | KISMİ | page.tsx:138-145 | İstemci doğrulaması yok (yalnızca boşluk kontrolü, :86-90); `Label` `htmlFor` ile bağlı değil; https zorunluluğu yok. |
| 3 | Secret alanı (HMAC) | KISMİ | page.tsx:146-154 | `type="password"` ama `autoComplete="new-password"` yok → tarayıcının kayıtlı admin parolasını bu alana otomatik doldurma riski (doğrulanmadı, Chrome davranışına bağlı). "Güçlü secret üret" yok. |
| 4 | Olay seçimi (5 checkbox) | SAHTE | page.tsx:23-30, 155-170; lib/webhook-dispatch.ts:71; tek çağıran app/api/feedbacks/route.ts:402-412 | Yorum "Dispatcher'ın gerçekten fire ettiği olaylarla hizalı" diyor; kod tabanında `dispatchWebhookEvent` yalnızca `feedback.created` ile çağrılıyor. `feedback.replied`, `remedy.created`, `incident.created`, `badge.earned` hiçbir yerde tetiklenmiyor. |
| 5 | Hiç olay seçilmezse davranış | KISMİ | page.tsx:161-164; app/api/admin/webhooks/route.ts:57-59 | Kullanıcı tüm kutuları kaldırabiliyor; sunucu sessizce `['feedback.created']` atıyor. Kullanıcıya bildirilmiyor. |
| 6 | "Ekle" butonu + yükleniyor durumu | ÇALIŞIYOR | page.tsx:171-174 | Spinner ve `disabled` var. |
| 7 | Başarı sonrası form sıfırlama + listeyi yenileme | ÇALIŞIYOR | page.tsx:100-104 | Teslim özeti (`fetchDeliveries`) yenilenmiyor ama yeni webhook için zaten teslim yok. |
| 8 | Ekleme hata bildirimi | ÇALIŞIYOR | page.tsx:99, 106 | Toast önekleri `lib/admin-toast.ts` içinde "Basarili:" / "Dikkat:" — Türkçe karakter eksik (global sorun). |
| 9 | Liste yükleniyor durumu | ÇALIŞIYOR | page.tsx:183-184 | Yalnızca düz metin; iskelet yok. |
| 10 | Boş durum | KISMİ | page.tsx:185-186 | "Henüz webhook yok." — ilk webhook'u yönlendiren CTA/ açıklama yok; ayrıca hata durumunda da bu gösteriliyor (bkz. #11). |
| 11 | Liste hata durumu | BOZUK | page.tsx:60-66 | `r.ok` kontrol edilmiyor; 401/403/500 JSON `{error}` döndüğünde `Array.isArray` false → `setList([])` → kullanıcı "Henüz webhook yok" görür, toast çıkmaz. Yalnızca ağ hatası yakalanıyor. |
| 12 | Satır: URL gösterimi | ÇALIŞIYOR | page.tsx:204 | `font-mono break-all`. |
| 13 | Satır: olaylar + oluşturulma tarihi | ÇALIŞIYOR | page.tsx:205-207 | |
| 14 | Satır: oluşturan kişi | EKSİK | route.ts:19; page.tsx:20 | `createdBy` çekiliyor ama hiç gösterilmiyor (ölü veri). |
| 15 | Aktif/pasif durumu + anahtar | EKSİK | page.tsx:9 (`Switch` import edilmiş, kullanılmıyor); prisma/schema.prisma:1220; route.ts'de PATCH yok | `isActive` alanı var, dispatcher ona göre filtreliyor (webhook-dispatch.ts:78), dashboard "aktif" sayısı gösteriyor (app/api/admin/tech-summary/route.ts:22) ama hiçbir UI/API onu değiştiremiyor. Bir entegrasyonu geçici durdurmanın tek yolu silmek. |
| 16 | Sağlık rozeti (%başarı) | KISMİ | page.tsx:190-211; deliveries/route.ts:23-31 | Oran, tüm webhook'lar için ortak "en yeni 500 teslim" penceresinden hesaplanıyor; yoğun bir webhook diğerlerini pencereden itebilir → onlarda "Teslim yok" görünür. Zaman penceresi belirtilmiyor. Anlam yalnızca renkle veriliyor. |
| 17 | Satır: teslim özeti (toplam/başarılı/başarısız/son hata/HTTP) | KISMİ | page.tsx:218-227 | Tek satır yoğun metin; ham hata mesajı (ör. "This operation was aborted") kullanıcı dostu değil. |
| 18 | Sil butonu | ÇALIŞIYOR | page.tsx:110-120, 213-215 | İkon buton `aria-label` içermiyor. |
| 19 | Silme onayı | KISMİ | page.tsx:111 | Native `confirm()`; diğer admin sayfalarındaki AlertDialog deseniyle tutarsız, hangi URL'nin silindiği diyalogda yazmıyor. |
| 20 | "Son başarısız teslimler" kartı | KISMİ | page.tsx:237-260 | Hangi webhook'a (URL) ait olduğu gösterilmiyor (`webhookId` var ama render edilmiyor); `key={i}`; hiç başarısızlık yoksa kart tamamen gizleniyor → "her şey yolunda" olumlu durumu yok; silinmiş webhook'ların hataları da listeleniyor. |
| 21 | Teslim geçmişi hata durumu | KISMİ | page.tsx:68-76 | Hata bilinçli olarak sessizce yutuluyor; `r.ok` kontrolü yok. Kullanıcı istatistiklerin neden boş olduğunu anlayamaz. |
| 22 | Webhook düzenleme (URL/olay/secret) | EKSİK | route.ts (yalnızca GET/POST/DELETE) | Olay eklemek için sil-yeniden oluştur gerekiyor → teslim geçmişi kopar (yeni id). |
| 23 | Test olayı gönder (ping) | EKSİK | — | Stripe/GitHub standardı; entegrasyon kurulumunda en çok kullanılan aksiyon. |
| 24 | Başarısız teslimi yeniden dene / replay | EKSİK | — | Payload saklanmadığı için şu an teknik olarak da mümkün değil (webhook-dispatch.ts:104-115 yalnızca durum kodunu yazıyor). |
| 25 | Teslim detayı (istek gövdesi, yanıt kodu/gövdesi, süre) | EKSİK | webhook-dispatch.ts:53 | Yanıt gövdesi ve süre loglanmıyor. |
| 26 | Secret yönetimi (maskeli gösterim, kopyala, döndür/rotate) | EKSİK | — | Secret ayarlanıp ayarlanmadığı bile listede gösterilmiyor. |
| 27 | Arama / filtre / sıralama | EKSİK | — | 500 webhook'a kadar listeleniyor (route.ts:18) ama filtre yok. |
| 28 | Manuel yenile / otomatik yenileme | EKSİK | page.tsx:78-81 | Yalnızca mount'ta bir kez yükleniyor. |
| 29 | API yetki kontrolü (ADMIN) | ÇALIŞIYOR | route.ts:13, 29, 89; deliveries/route.ts:17 | `requireAuth(['ADMIN'])` + token-replay kontrolü (lib/api-auth.ts:52-77). |
| 30 | Secret'ın istemciye gönderilmemesi | BOZUK | route.ts:16-20 (select yok), 61-69, 81; page.tsx:16 | GET ve POST yanıtı `secret` alanını düz metin döndürüyor. |
| 31 | Audit log (oluşturma/silme) | KISMİ | route.ts:70-80, 100-110 | Secret audit'e yazılmıyor (doğru). Ancak audit yazımı webhook oluşturulduktan sonra aynı try içinde; audit hata verirse webhook oluşmuş olsa da 500 döner → kullanıcı tekrar dener → çift kayıt. Transaction yok. |
| 32 | Rate limit | KISMİ | route.ts:31-43 | Yalnızca POST'ta; DELETE'te yok. Sayaç bellek-içi (lib/rate-limit.ts:303-320) → instance başına. |
| 33 | Sunucu URL doğrulaması | KISMİ | route.ts:51-56 | Yalnızca `new URL()`; şema (`http:`/`https:`) ve özel/iç ağ adresleri (localhost, 10.x, 169.254.x, 127.x) engellenmiyor. |
| 34 | Sunucu olay whitelist'i | EKSİK | lib/validations-admin.ts:79-83 | `events: z.array(z.string())` — herhangi bir string kabul ediliyor. `/admin/tech/add` zaten var olmayan `quest.completed`, `reward.claimed` olaylarıyla webhook oluşturabiliyor (app/admin/tech/add/page.tsx:23). |
| 35 | HMAC imza | KISMİ | webhook-dispatch.ts:25-28, 42-48 | `X-Qratex-Signature: sha256=...` var; imzada zaman damgası/teslim kimliği yok (replay koruması alıcıya kalıyor), `X-Qratex-Delivery` gibi idempotency başlığı yok. |
| 36 | Teslim sonucu loglama | ÇALIŞIYOR | webhook-dispatch.ts:102-119 | `AnalyticsEvent` (category `webhook`). |
| 37 | Otomatik yeniden deneme (backoff) | EKSİK | webhook-dispatch.ts:100 | Tek deneme; 8 sn timeout sonrası kayıp. |
| 38 | Teslim güvenilirliği (serverless) | KISMİ | app/api/feedbacks/route.ts:402-412 | Aynı dosyada diğer arka plan işleri `after()` ile korunurken (route.ts:453, 537) webhook dispatch'i çıplak `import().then()` ile ateşle-unut; yanıt döndükten sonra fonksiyon dondurulursa teslim yarıda kalabilir (çalışma zamanında doğrulanmadı). |
| 39 | Mobil yerleşim | KISMİ | page.tsx:123, 202, 249 | `flex-wrap` sayesinde kırılmıyor; ancak layout'un kendi padding'ine ek `p-6` (app/admin/layout.tsx:31-38) mobilde içeriği daraltıyor, checkbox'ların dokunma alanı ~16px. |
| 40 | Klavye / ekran okuyucu erişilebilirliği | KISMİ | page.tsx:139, 147, 157-167, 213 | Native checkbox'lar klavyeyle çalışır; `Label`-input ilişkisi yok, ikon butonda isim yok, rozet anlamı yalnızca renk. |
| 41 | i18n | EKSİK | page.tsx tümü; components/dashboard/sidebar.tsx:221 | Sidebar `labelKey` ile i18n kullanırken sayfa metinleri sabit Türkçe. |
| 42 | Payload şeması / imza doğrulama dokümantasyonu | EKSİK | page.tsx:135 | Yalnızca "payload JSON" deniyor; gövde yapısı (`{event, timestamp, data}`, webhook-dispatch.ts:94-98) ve imza doğrulama örneği yok. `/admin/innovation` partner webhook'u için bu açıklama mevcut (app/admin/innovation/page.tsx:527). |

**Sayım:** 42 özellik · ÇALIŞIYOR 9 · KISMİ 17 · BOZUK 2 · SAHTE 1 · EKSİK 13

---

## Bulgular

### 1. Webhook secret'ı düz metin olarak tarayıcıya gönderiliyor
- **Önem:** yüksek · **Kategori:** güvenlik
- **Kanıt:** app/api/admin/webhooks/route.ts:16-20 (`findMany` + `include`, `select` yok → tüm kolonlar), :61-69 ve :81 (POST yanıtı da `secret` içeriyor); page.tsx:16 tipte `secret` bekliyor ama hiç kullanmıyor.
- **Sorun:** HMAC secret'ı, alıcının Qratex'ten geldiğini doğrulamasının tek dayanağı. Her sayfa açılışında tüm secret'lar ağ yanıtında, tarayıcı DevTools'ta, olası tarayıcı eklentilerinde ve herhangi bir admin XSS'inde okunabilir. Aynı projede `ApiKey` modeli doğru deseni uyguluyor (yalnızca hash saklanıyor, ham anahtar bir kez gösteriliyor — prisma/schema.prisma:1231-1235).
- **Öneri:** GET'te açık `select` ile `secret` yerine `hasSecret: boolean` ve son 4 karakter (`secretHint`) döndürün. POST yanıtından secret'ı çıkarın. Secret'ı yalnızca oluşturma/rotate anında bir kez gösterip "kopyala" sunan bir akış kurun (sunucu tarafında `crypto.randomBytes(32)` ile `whsec_...` önekiyle üretim). Uzun vadede secret'ı uygulama anahtarıyla şifreli (AES-GCM) saklayın; dispatcher çözerek imzalasın.
- **Efor:** S (sızıntıyı kapatmak) / M (rotate + şifreli saklama)

### 2. Seçilebilen 5 olaydan 4'ü hiçbir zaman tetiklenmiyor
- **Önem:** yüksek · **Kategori:** işlevsellik / sahte özellik
- **Kanıt:** page.tsx:23-30 (yorum: "gerçekten fire ettiği olaylarla hizalı"); lib/webhook-dispatch.ts:15-20 tip tanımı; kod tabanındaki tek çağrı app/api/feedbacks/route.ts:402-412 (`feedback.created`). `feedback.replied`, `remedy.created`, `incident.created`, `badge.earned` için hiç `dispatchWebhookEvent` çağrısı yok (grep ile doğrulandı). Ayrıca `/admin/tech/add` başka bir liste sunuyor: `quest.completed`, `reward.claimed` (app/admin/tech/add/page.tsx:23) — bunlar dispatcher tipinde bile yok.
- **Sorun:** Operatör bir CRM'i `badge.earned` için bağlar, entegrasyon hiç veri almaz; sayfa "Teslim yok" gösterir ve kök neden görünmez. Bu, güveni doğrudan zedeleyen bir sahte özellik.
- **Öneri:** Tek bir olay kataloğu modülü oluşturun (`lib/webhook-events.ts`): her olay için `key`, Türkçe etiket, açıklama, örnek payload ve `implemented: boolean`. Sayfa, dispatcher tipi, zod şeması ve `/admin/tech/add` bu kataloğu import etsin. Uygulanmamış olayları UI'da "yakında" rozetiyle devre dışı gösterin ya da gerçekten bağlayın: `feedback.replied` → yanıt kaydının oluştuğu route, `badge.earned` → `lib/surprise-badges` / `lib/activity-badges` ödül yazımı, `incident.created`/`remedy.created` → ilgili create uçları. Her bağlantı `after()` içinde yapılmalı.
- **Efor:** M

### 3. Sunucu tarafında olay whitelist'i ve SSRF koruması yok
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü
- **Kanıt:** lib/validations-admin.ts:79-83 (`events: z.array(z.string())`, URL için yalnızca uzunluk); route.ts:51-56 (yalnızca `new URL()`); lib/webhook-dispatch.ts:43-52 (`fetch` varsayılan `redirect: 'follow'`, hedef kısıtı yok).
- **Sorun:** (a) Herhangi bir olay adı kaydedilebiliyor (zaten tech/add sayfası geçersiz olay kaydediyor). (b) URL `http://localhost:...`, `http://10.x`, `http://169.254.169.254/...` veya `http:` düz metin olabilir; sunucu her geri bildirimde bu adrese POST atar. Admin yetkisi gerektirdiği için doğrudan istismar yüzeyi dar, ancak ele geçirilmiş bir admin oturumu veya yönlendirme (302) zinciriyle iç ağa istek kapısı açılır. Ayrıca `http:` hedefe imzalı payload açık ağda gider.
- **Öneri:** Zod şemasını `z.enum(WEBHOOK_EVENT_KEYS)` ve `z.string().url().refine(u => u.startsWith('https://'))` ile sıkılaştırın (geliştirme için env bayrağıyla `http` izni). Dispatcher'da DNS çözümlemesi sonrası özel/loopback/link-local IP'leri reddeden bir `assertPublicHost` yardımcısı ve `redirect: 'manual'` kullanın. Aynı yardımcıyı partner-digest webhook'u da kullansın.
- **Efor:** M

### 4. Liste hata durumu "boş liste" olarak görünüyor
- **Önem:** orta · **Kategori:** hata yönetimi / UX
- **Kanıt:** page.tsx:60-66 ve 68-76 — `r.ok` kontrol edilmiyor; `{error: ...}` gövdesi `Array.isArray` testini geçemeyip `[]` olarak set ediliyor.
- **Sorun:** Oturum süresi dolduğunda, token-replay koruması 403 döndüğünde (lib/api-auth.ts:70-76) ya da DB hatasında operatör "Henüz webhook yok." görür. Üretimde webhook'ları silindi sanıp yeniden oluşturması mümkün → çift abonelik → alıcıda çift olay.
- **Öneri:** Ortak bir `adminFetch` (ok kontrolü + tipli hata) veya SWR'a geçin; `error` durumunu ayrı state olarak tutup kart içinde "Liste yüklenemedi — Tekrar dene" bileşeni gösterin. Teslim istatistiği hatası için de satır içi uyarı gösterin, sessizce yutmayın.
- **Efor:** S

### 5. Aktif/pasif anahtarı yok; `isActive` yalnızca okunuyor
- **Önem:** orta · **Kategori:** işlevsellik / ölü kod
- **Kanıt:** page.tsx:9 (`Switch` import edilmiş, kullanılmıyor), page.tsx:18 (`isActive` tipte var, render edilmiyor); route.ts'de PATCH yok; lib/webhook-dispatch.ts:78 `isActive: true` filtresi; app/api/admin/tech-summary/route.ts:22 dashboard'da "aktif" sayısı.
- **Sorun:** Bir alıcı bakımdayken ya da sürekli 5xx dönerken tek seçenek silmek; silmek teslim geçmişini yetim bırakıyor. Dashboard'daki "N aktif" metni her zaman toplamla eşit olduğu için bilgi taşımıyor.
- **Öneri:** `PATCH /api/admin/webhooks/[id]` ucu (isActive, url, events, description) + audit log. Satırda `Switch` ile anında pasifleştirme (iyimser güncelleme + geri alma toast'ı). İleri adım: art arda N başarısızlıktan sonra otomatik pasifleştirme (`disabledReason: 'auto_failures'`, `failureCount` alanı) ve admin'e bildirim — Stripe'ın davranışı.
- **Efor:** M

### 6. Teslim sağlığı istatistiği yanıltıcı pencereden hesaplanıyor
- **Önem:** orta · **Kategori:** veri doğruluğu
- **Kanıt:** app/api/admin/webhooks/deliveries/route.ts:23-31 (tüm webhook'lar için ortak `take: 500`), :54-81 (uygulama katmanında toplama); page.tsx:191-211.
- **Sorun:** Yoğun bir webhook (her geri bildirimde tetiklenen) son 500 kaydı doldurursa, diğer webhook'lar "Teslim yok" veya çok küçük örneklemden hesaplanmış %oran gösterir. Kullanıcı oranın hangi zaman aralığına ait olduğunu bilmiyor. Silinmiş webhook'ların kayıtları da pencereyi tüketiyor. Sayfa "en yeni 100 içinden" diyor (page.tsx:241) ama özet 500 üzerinden.
- **Öneri:** Sağlığı webhook başına ve zaman pencereli hesaplayın (ör. son 24 saat / 7 gün). Kalıcı çözüm: `AnalyticsEvent` JSON'u yerine ayrı bir `WebhookDelivery` modeli (`webhookId` FK + indeks, `event`, `status`, `ok`, `durationMs`, `requestBody`, `responseSnippet`, `attempt`, `createdAt`) ve `groupBy({ by: ['webhookId','ok'], where: { createdAt: { gte } } })`. Rozette "Son 24s: %98 · 412 teslim" gibi açık etiket.
- **Efor:** M

### 7. Teslim tek deneme, `after()` dışında ateşle-unut, yeniden deneme/replay yok
- **Önem:** orta · **Kategori:** güvenilirlik / mimari
- **Kanıt:** app/api/feedbacks/route.ts:402-412 (çıplak promise) vs aynı dosyada `after()` kullanımları :453, :537; lib/webhook-dispatch.ts:22 (8 sn timeout), :100 (tek `Promise.all`), :53 (yanıt gövdesi tüketilmiyor/loglanmıyor).
- **Sorun:** Serverless ortamda yanıt döndükten sonra bekleyen promise'in tamamlanması garanti değil (çalışma zamanında doğrulanmadı; proje hafızası da benzer `after()` güvenilirlik düzeltmesini kayıt altına almış). Geçici 502/timeout kalıcı veri kaybına dönüşüyor; payload saklanmadığı için manuel yeniden gönderim bile imkânsız.
- **Öneri:** Dispatch'i `after()` içine alın; orta vadede projede zaten bulunan Inngest altyapısıyla (app/api/inngest/route.ts) olay başına bir step fonksiyonu: üstel geri çekilmeli 5-8 deneme, her denemenin `WebhookDelivery` kaydı, `X-Qratex-Delivery` (idempotency id) ve `X-Qratex-Timestamp` başlığı, imzanın `timestamp.body` üzerinden hesaplanması. UI'da teslim satırında "Yeniden gönder" aksiyonu.
- **Efor:** L

### 8. Oluşturma: audit log hatası çift kayda yol açabilir
- **Önem:** düşük · **Kategori:** veri bütünlüğü
- **Kanıt:** route.ts:61-84 — `webhook.create` başarılı olduktan sonra `auditLog.create` aynı `try` içinde; o patlarsa 500 "Webhook eklenemedi" döner.
- **Sorun:** Kullanıcı hata görüp tekrar dener → aynı URL'ye iki abonelik → alıcıya çift olay. URL+olay için tekillik kontrolü de yok.
- **Öneri:** `prisma.$transaction([create, auditLog.create])` veya audit'i ayrı try ile best-effort yapın; aynı URL için mevcut kayıt varsa 409 ve "mevcut aboneliği düzenle" yönlendirmesi.
- **Efor:** S

### 9. Başarısız teslimler kartı bağlamsız
- **Önem:** düşük · **Kategori:** UX
- **Kanıt:** page.tsx:245-256 (`webhookId` render edilmiyor, `key={i}`), :237 (başarısızlık yoksa kart yok).
- **Sorun:** Birden çok webhook varken "feedback.created · HTTP 500" satırının hangi hedefe ait olduğu anlaşılmıyor. Olumlu durum (son 24 saatte hata yok) iletilmiyor.
- **Öneri:** Bu kartı webhook detay görünümündeki "Teslimler" sekmesine taşıyın; global görünümde hedef URL'nin host'unu ve tıklanabilir detay bağlantısını gösterin. Hata yoksa küçük bir "Son 24 saatte başarısız teslim yok" durumu.
- **Efor:** S

### 10. Erişilebilirlik ve tutarlılık eksikleri
- **Önem:** düşük · **Kategori:** erişilebilirlik / tutarlılık
- **Kanıt:** page.tsx:139, 147 (`Label` `htmlFor` yok), :158 (native checkbox, shadcn `Checkbox` yerine), :213 (ikon butonda `aria-label` yok), :111 (native `confirm`), :210 (anlam yalnızca renk); lib/admin-toast.ts ("Basarili:", "Dikkat:" önekleri Türkçe karaktersiz).
- **Öneri:** `Label htmlFor` + `id`; olay seçimini shadcn `Checkbox` ile açıklamalı liste (etiket + tek satır açıklama) yapın; sil butonuna `aria-label={`${w.url} webhook'unu sil`}`; `AlertDialog` ile URL'yi gösteren onay; rozete ikon (CheckCircle/AlertTriangle) ekleyin. `admin-toast` öneklerini "Başarılı:" olarak düzeltin (tüm admin'i etkiler).
- **Efor:** S

### 11. İkinci webhook oluşturma formu (`/admin/tech/add`) ve dağınık webhook yüzeyleri
- **Önem:** düşük · **Kategori:** bilgi mimarisi
- **Kanıt:** app/admin/tech/add/page.tsx:23, 81-115 (aynı `/api/admin/webhooks` POST'u, farklı olay listesi); app/admin/innovation/page.tsx:440-527 (partner digest webhook'u, ayrı yapılandırma); app/admin/partners/page.tsx:166-206 (partner başına `webhookUrl`); app/admin/observability/page.tsx:536-539 (24s teslim sayısı).
- **Sorun:** Aynı kavram dört farklı yerde, farklı kurallarla yönetiliyor; tech/add formu geçersiz olaylar kaydediyor.
- **Öneri:** Bkz. "Çakışmalar" bölümü.
- **Efor:** M

---

## Eksik özellikler (kıyas: Stripe Webhooks, Svix, GitHub, Linear)

1. **Test olayı gönder:** Olay türü seçip örnek payload ile anında POST, yanıt kodu/gövdesi/süresinin inline gösterimi (Stripe "Send test webhook").
2. **Teslim günlüğü + detay + yeniden gönder:** Her teslim için istek başlıkları/gövdesi, yanıt kodu/gövde parçası, süre, deneme sayısı; tek tık "Resend" ve filtre (başarılı/başarısız, olay türü, tarih).
3. **Otomatik yeniden deneme ve otomatik devre dışı bırakma:** Üstel backoff, ardışık hata eşiğinde pasifleştirme ve operatöre bildirim.
4. **Secret yaşam döngüsü:** Sunucu tarafı üretim, bir kez gösterme, rotate (geçiş süresince eski+yeni imza), "secret var/yok" göstergesi.
5. **Düzenleme ve pasifleştirme:** URL/olay/açıklama düzenleme, aktif/pasif anahtarı, açıklama/etiket alanı (hangi ekip/entegrasyon).
6. **Olay kataloğu ve imza dokümantasyonu:** Her olay için şema ve örnek JSON, Node/Python imza doğrulama snippet'i, zaman damgalı imza (`t=...,v1=...`).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında tek bakışta "entegrasyonlarım sağlıklı mı?" sorusunun cevabını görür; bir alıcı sorunluysa iki tıkla hatanın gövdesine, ardından "yeniden gönder"e ulaşır; yeni entegrasyonu kurarken test olayı atıp yeşil tiki görmeden çıkmaz.

**Yerleşim:**
- **Üst şerit (KPI'lar):** Toplam uç nokta · Aktif · Son 24s teslim · Başarı oranı · Başarısız (tıklanınca filtreli günlük). Hero'yu bu şeride indirgemek; dekoratif hero yerine operasyonel veri.
- **Ana tablo (uç noktalar):** Sütunlar: Durum noktası (aktif/pasif/otomatik-durduruldu) · URL (host vurgulu, path soluk) · Olaylar (chip, 3+ ise "+2") · 24s başarı (mini sparkline, 24 kova) · Son teslim (göreli zaman) · Aksiyon menüsü (Test gönder, Düzenle, Pasifleştir, Secret'ı döndür, Sil). Mobilde kart listesine dönüşür.
- **Sağ çekmece (Sheet) — uç nokta detayı:** Sekmeler: *Genel* (URL, açıklama, olaylar, secret ipucu + rotate), *Teslimler* (sanal liste; satır genişleyince istek/yanıt JSON'u, süre, deneme no, "Yeniden gönder"), *Test* (olay seç → gönder → yanıt paneli).
- **"Uç nokta ekle" diyaloğu:** URL (https doğrulaması anlık), açıklama, olay kataloğundan açıklamalı checkbox grubu (uygulanmamış olaylar "yakında" ve devre dışı), kaydettikten sonra secret'ı bir kez gösteren ve "Test olayı gönder" CTA'lı başarı ekranı.

**Motion (ölçülü):** framer-motion (`m as Motion`) yalnızca işlevsel yerlerde: yeni satırın tabloya kısa fade/slide ile girişi, test gönderiminde bekleme → sonuç rozetinin (yeşil/kırmızı) yumuşak geçişi, çekmece açılışı. 3D veya dekoratif animasyon bu sayfaya uygun değil; operasyonel bir araç. `useReducedMotion` ile tüm geçişler anlık hale gelmeli.

**Veri / API değişiklikleri:**
- `lib/webhook-events.ts`: tek olay kataloğu (key, etiket, açıklama, örnek payload, implemented).
- Prisma: `Webhook`'a `description`, `failureCount`, `disabledReason`, `secretHint`; yeni `WebhookDelivery` modeli (`webhookId` FK `onDelete: Cascade`, `@@index([webhookId, createdAt])`).
- API: `GET /api/admin/webhooks` (secret'sız, 24s istatistik ile birleşik), `PATCH/DELETE /api/admin/webhooks/[id]`, `POST /api/admin/webhooks/[id]/test`, `POST /api/admin/webhooks/[id]/rotate-secret`, `GET /api/admin/webhooks/[id]/deliveries?cursor=&status=`, `POST /api/admin/webhook-deliveries/[id]/resend`.
- Dispatcher: Inngest step fonksiyonu (retry/backoff), SSRF koruması, `redirect: 'manual'`, zaman damgalı imza, idempotency başlığı; tüm çağrılar `after()` veya Inngest event olarak.
- İstemci: SWR (odak/yeniden doğrulama), ortak `adminFetch` hata modeli.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/tech/add` (webhook sekmesi):** Aynı uca POST eden ikinci bir oluşturma formu, üstelik dispatcher'da olmayan olaylarla (app/admin/tech/add/page.tsx:23). **Öneri:** Bu sekmeyi kaldırıp `/admin/webhooks?new=1` diyaloğuna yönlendirin.
- **`/admin/innovation` → Partner webhook (24s özet):** Ayrı URL/secret/aktif yapılandırması (app/admin/innovation/page.tsx:440-527) aynı imza şemasını kullanıyor. **Öneri:** Kavramsal olarak bu da bir "olay aboneliği" (`partner.digest.daily`); orta vadede olay kataloğuna eklenip bu sayfadan yönetilmeli, innovation sayfasında yalnızca bağlantı kalmalı.
- **`/admin/partners` → partner başına `webhookUrl`:** Partner kaydında serbest metin URL (app/admin/partners/page.tsx:166-206). **Öneri:** Partner'a bağlı webhook'u `Webhook` modeline `partnerId` ile bağlayın; partner detayında bu sayfanın filtrelenmiş görünümünü gösterin.
- **`/admin/observability`:** 24s teslim/başarısızlık sayacı (app/admin/observability/page.tsx:536-539) tekrar değil, tamamlayıcı; oradan bu sayfanın "başarısız" filtresine derin bağlantı verilmeli.
- **Sayfa kaldırılmamalı:** Platformun tek genel giden-olay yönetim noktası; karar "yeniden tasarla + yukarıdaki dağınık webhook yüzeylerini buraya topla".

---

## Doğrulama (şüpheci inceleme)

İncelenen kod: `app/admin/webhooks/page.tsx`, `app/api/admin/webhooks/route.ts`, `app/api/admin/webhooks/deliveries/route.ts`, `lib/webhook-dispatch.ts`, `app/api/feedbacks/route.ts:400-412`, `lib/api-auth.ts:52-80`, `proxy.ts:103-124`, `lib/validations-admin.ts:79-83`, `prisma/schema.prisma:1215-1244` (Webhook + ApiKey), `next.config.js` (PWA runtimeCaching), `vercel.json`, `app/admin/tech/add/page.tsx:23,81-113`. Hiçbir kod değiştirilmedi, DB'ye dokunulmadı.

### 1. "Webhook HMAC secret'ı admin istemcisine düz metin sızıyor" — **ÇÜRÜTÜLDÜ (KRİTİK/YÜKSEK olarak)**

- **Olgu doğru:** `route.ts:16-20` `include` + `select`'siz `findMany` ile `secret` dahil tüm skaler kolonları döndürüyor; POST yanıtı `route.ts:81` da secret'ı içeriyor. Sayfa tipi `secret` alanını taşıyor (`page.tsx:16`) ama hiçbir yerde render etmiyor.
- **Neden kritik/yüksek değil:** Tek okuyucu `requireAuth(['ADMIN'])` (`route.ts:13`, `lib/api-auth.ts:60-63`) geçen kullanıcı. Bu kullanıcı aynı uçla kendi URL'sine yeni webhook açıp tüm `feedback.created` akışını alabiliyor, webhook silebiliyor ve diğer tüm admin API'lerine erişiyor; secret'ı okumak ona yeni bir yetki kazandırmıyor. Bir güven sınırı aşılmıyor. Yanıt `Cache-Control: private, no-store` (`lib/api-http.ts:8-10`) ile dönüyor ve PWA runtime cache'i `/api/` yollarını açıkça dışlıyor (`next.config.js:141`), yani paylaşılan/kalıcı önbelleğe düşmüyor.
- **Yan not (ayrı ve gerçek bir bulgu, bu iddianın kanıtı değil):** `proxy.ts:105-117` `/api/*` isteklerini admin gizli kapı (gate cookie) kontrolünden geçirmeden geçiriyor; kapı yalnızca `/admin` sayfalarında uygulanıyor (`proxy.ts:84-94`) ve `requireAuth` gate cookie'ye bakmıyor. Yani "rolü kazara ADMIN yapılan" bir hesap gizli rakamı bilmeden `/api/admin/*` uçlarını doğrudan çağırabilir. Bu, secret'tan çok daha geniş bir konu ve tüm admin API'lerini kapsıyor; ayrı bir sistem-çapı bulgu olarak ele alınmalı.
- **ApiKey benzetmesi yanlış:** `ApiKey.keyHash` (`schema.prisma:1235`) gelen isteği doğrulamak için tutulur, hash yeter. Webhook secret'ı ise sunucunun giden gövdeyi imzalaması için düz değer olarak gerekir (`lib/webhook-dispatch.ts:25-28`); hash'lenemez.
- **Önerilen düzeltme (düşük/orta öncelik, hijyen):** GET'te `select` ile `secret` yerine `hasSecret: boolean` + `secretHint` (son 4 karakter) döndürün; POST yanıtında secret'ı yalnızca oluşturma anında "bir kez göster" ekranında verin; secret'ı DB'de uygulama anahtarıyla şifreli (AES-GCM, `WEBHOOK_SECRET_KEY`) saklayın ve "Secret'ı döndür" uç noktası ekleyin. Bu, DB dökümü/yedek sızıntısında (bkz. R2'ye DB yedeği betikleri) etkiyi azaltır.

### 2. "5 olaydan 4'ü hiç tetiklenmiyor ama UI ve kod yorumu tetiklendiğini iddia ediyor" — **DOĞRULANDI** (önem: güvenlik değil, işlevsel; orta-yüksek)

- `dispatchWebhookEvent` tanımı `lib/webhook-dispatch.ts:71`; depo genelinde (node_modules/.next/docs hariç) tek çağrı `app/api/feedbacks/route.ts:402-404` (`'feedback.created'`). `feedback.replied`, `remedy.created`, `incident.created`, `badge.earned` için hiçbir çağrı yok; `prisma.webhook` başka bir dispatcher tarafından da okunmuyor (yalnızca `route.ts` CRUD ve `tech-summary` sayımları).
- `page.tsx:23` yorumu ("gerçekten fire ettiği olaylarla hizalı") ve hero açıklaması "Geri bildirim, rozet, görev vb." (`page.tsx:126`) yanıltıcı.
- Sunucu olayları whitelist'lemiyor: `events: z.array(z.string()).optional()` (`lib/validations-admin.ts:82`). `app/admin/tech/add/page.tsx:23` `quest.completed` ve `reward.claimed` seçeneklerini sunuyor; bunlar `WebhookEvent` tipinde bile yok, sonsuza dek sessiz kalır.
- **Yeniden üretim:** /admin/webhooks'ta yalnızca `badge.earned` işaretli bir webhook ekleyin (örn. requestbin URL'si). Bir müşteri rozet kazansın → alıcıya hiçbir istek gelmez, `analyticsEvent` içinde `webhook_delivery` kaydı oluşmaz, sayfa "Teslim yok" gösterir; admin bunun bir yapılandırma hatası mı yoksa hiç desteklenmeyen bir olay mı olduğunu ayırt edemez.
- **Ek gözlem (doğrulanmadı, çalışma zamanı davranışı):** Tek çalışan çağrı da `after()`/`waitUntil` olmadan çıplak `import().then(...)` ile ateşle-unut (`feedbacks/route.ts:402-412`). Vercel serverless'ta yanıt döndükten sonra fonksiyon dondurulabildiği için `feedback.created` teslimi de garantili değil.
- **Öneri:** Tek kaynaklı `lib/webhook-events.ts` kataloğu (key, etiket, açıklama, örnek payload, `implemented`); zod şemasında `z.enum(IMPLEMENTED_EVENTS)`; UI ve `/admin/tech/add` bu katalogdan beslensin, uygulanmamış olaylar "yakında" olarak devre dışı gösterilsin. Kalan dört olay için ilgili yazma yollarına (yanıt, remedy, incident, rozet atama) `after(() => dispatchWebhookEvent(...))` çağrıları eklensin. Mevcut kayıtlarda desteklenmeyen olay içeren abonelikler bir kerelik raporlanmalı.

### 3. "Webhook URL'sinde SSRF/şema koruması yok" — **ÇÜRÜTÜLDÜ (KRİTİK/YÜKSEK olarak)**

- **Olgu doğru:** `route.ts:51-56` yalnızca `new URL()` ile ayrıştırıyor; `http:`, `localhost`, özel/link-local IP'ler kabul ediliyor. `lib/webhook-dispatch.ts:43-52` `fetch` varsayılan `redirect: 'follow'` ile çalışıyor ve hedef IP çözümleme kontrolü yok. Teslim sonucu (HTTP durum kodu ve hata mesajı) sayfada gösteriliyor (`page.tsx:222-225`, `250-253`), yani kör ama durum-kodu kâhinli bir SSRF ilkeli mevcut.
- **Neden kritik/yüksek değil:** (a) Webhook oluşturma yalnızca ADMIN (`route.ts:29-30`); saldırgan zaten admin yetkisine sahip olmalı ve bu yetki uygulama verisine doğrudan erişim veriyor. (b) Dağıtım Vercel serverless (`vercel.json`, `regions: ["fra1"]`); AWS Lambda tabanlı fonksiyonlarda EC2 tarzı `169.254.169.254` metadata servisi yok, kimlik bilgileri ortam değişkenlerinde; projede Secure Compute/özel VPC yapılandırması görülmedi. Ulaşılabilecek anlamlı bir iç ağ hedefi kod okumasıyla gösterilemiyor. (c) İstek gövdesi sabit (feedback payload'ı), yöntem POST; 301/302'de `fetch` POST'u GET'e çevirir ve yanıt gövdesi hiçbir yerde döndürülmez — yalnızca durum kodu loglanır. Somut bir kullanıcı/veri etkisi senaryosu kurulamadı.
- **Yine de yapılmalı (orta öncelik, derinlemesine savunma):** Kayıt anında `https:` zorunluluğu ve host'u DNS ile çözüp loopback/RFC1918/link-local/ULA aralıklarını reddetme; teslim anında aynı kontrolün tekrarı (DNS rebinding'e karşı) ve `redirect: 'manual'` (3xx başarısız sayılsın); hata mesajını UI'da ham `err.message` yerine normalize kategoriyle (timeout/dns/tls/http_4xx/http_5xx) göstermek. Bu kontroller `lib/webhook-dispatch.ts` içinde tek bir `assertPublicHttpsUrl()` yardımcıda toplanıp hem `route.ts` POST'u hem dispatcher tarafından çağrılmalı; `/admin/innovation` partner digest webhook'u da aynı yardımcıyı kullanmalı.

### Özet

| # | İddia | Karar | Gerçek önem |
|---|---|---|---|
| 1 | Secret düz metin admin istemcisine dönüyor | Çürütüldü (kritik/yüksek olarak) | Düşük — hijyen; asıl sistem-çapı risk `/api/admin/*` uçlarının gate cookie'siz erişilebilmesi |
| 2 | 5 olaydan 4'ü hiç tetiklenmiyor | Doğrulandı | Orta-yüksek — işlevsel, sessiz veri kaybı + yanıltıcı UI |
| 3 | URL'de SSRF/şema koruması yok | Çürütüldü (kritik/yüksek olarak) | Orta — yalnız admin, Vercel'de somut iç hedef yok; derinlemesine savunma olarak yapılmalı |

## Uygulama (Dalga 2)

**Yeni yer:** `/admin/integrations` (Entegrasyon Merkezi) — sekmeler: API anahtarları · Webhook'lar · Partnerler · API kataloğu · Dokümantasyon. Eski rota `permanentRedirect` ile ilgili sekmeye yönlenir (sorgu parametreleri korunur).

**Mimari:** BFF `/api/admin/integrations/*` (hepsi `defineRoute`: ADMIN + zod + Redis'li rate limit + idempotency; `requireAuth` artık admin gizli kapısını da API'de doğruluyor). Servis `lib/integrations/server.ts`; sözleşme `lib/integrations/contract.ts` (kapsam + olay kataloğu tek kaynak); meta zarfı `lib/integrations/meta.ts`; SSRF `lib/integrations/url-safety.ts`; sır kasası `lib/integrations/secret-box.ts`; UI `components/admin/a-entegrasyonlar/**` (QDL v2 PanelPage/SectionTabs/DataTable/DetailSheet/QueryState, ops kaydı, azaltılmış hareket). Sunucu bileşeni KPI + aktif sekmenin ilk verisini ön yükler; katalog ve dokümantasyon sekmeleri lazy. Testler: `__tests__/lib/integrations.test.ts` (23 test).

**Şema kısıtı:** Şema dalgası kapalı olduğu için yaşam döngüsü alanları mevcut Json kolonlarında sürümlü zarfla tutuluyor (`ApiKey.scope` → `{v:2, scopes, dealerId, partnerId, expiresAt, revokedAt, suffix, ipAllowlist…}`, `Webhook.events` → `{v:2, events, description, partnerId, archivedAt, disabledReason, secretHint}`, `Partner.metadata` → irtibat/bayiler/arşiv). Okuyucular eski dizi biçimini de anlar.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Başlık + açıklama | ÇALIŞIYOR — yanıltıcı "rozet, görev" ifadesi kaldırıldı |
| 2 | URL alanı | ÇALIŞIYOR — https zorunlu, anlık uyarı, Label bağlı |
| 3 | Secret alanı | KALDIRILDI — sır artık sunucuda üretiliyor (`whsec_` + 32 bayt), bir kez gösteriliyor |
| 4 | Olay seçimi | ÇALIŞIYOR — yalnız gerçekten tetiklenen olaylar: `feedback.created`, `incident.created` (kriz radarı) |
| 5 | Olay seçilmezse | ÇALIŞIYOR — en az bir olay zorunlu (sessiz varsayılan yok) |
| 6 | Ekle + yükleniyor | ÇALIŞIYOR |
| 7 | Form sıfırlama + yenileme | ÇALIŞIYOR |
| 8 | Ekleme hata bildirimi | ÇALIŞIYOR — alan altı + satır içi hata |
| 9 | Liste yükleniyor | ÇALIŞIYOR — iskelet |
| 10 | Boş durum | ÇALIŞIYOR — CTA |
| 11 | Liste hata durumu | ÇALIŞIYOR — QueryState |
| 12 | URL gösterimi | ÇALIŞIYOR — host vurgulu, path soluk |
| 13 | Olaylar + tarih | ÇALIŞIYOR — çipler (+N), desteklenmeyen eski olay rozeti |
| 14 | Oluşturan | ÇALIŞIYOR (detay) |
| 15 | Aktif/pasif | ÇALIŞIYOR — Duraklat/Etkinleştir (PATCH, denetimli) |
| 16 | Sağlık rozeti | ÇALIŞIYOR — webhook başına SQL toplamı, açık pencere ("son 24 saat · N teslim"), test teslimleri hariç, ikon+metin |
| 17 | Teslim özeti | ÇALIŞIYOR — normalize hata türü (zaman aşımı/ağ/4xx/5xx/yönlendirme/engellendi) |
| 18 | Sil | KALDIRILDI — arşiv (teslim geçmişi korunur, geri alınabilir) |
| 19 | Silme onayı | ÇALIŞIYOR — arşiv için ConfirmAction |
| 20 | Son başarısız teslimler | ÇALIŞIYOR — "Teslim günlüğü" kartı: hedef host, filtre, "başarısız teslim yok" olumlu durum |
| 21 | Teslim geçmişi hatası | ÇALIŞIYOR — QueryState |
| 22 | Düzenleme | ÇALIŞIYOR — URL/olay/açıklama/partner (aynı id, geçmiş kopmaz) |
| 23 | Test olayı | ÇALIŞIYOR — örnek payload yalnız bu uca, kod/süre/yanıt satır içi |
| 24 | Yeniden dene / replay | ÇALIŞIYOR — gövde saklanıyor (≤16 KB), "Yeniden gönder" |
| 25 | Teslim detayı | ÇALIŞIYOR — istek gövdesi, yanıt parçası (500 kr.), süre, deneme sayısı |
| 26 | Secret yönetimi | ÇALIŞIYOR — "tanımlı · …ipucu", döndür (bir kez göster), AES-256-GCM şifreli saklama |
| 27 | Arama / filtre | ÇALIŞIYOR — adres/açıklama + durum (etkin/duraklatılan/arşiv) |
| 28 | Yenile | ÇALIŞIYOR — Yenile butonu, odakta tazeleme |
| 29 | API yetkisi | ÇALIŞIYOR |
| 30 | Secret istemciye gönderilmemesi | ÇALIŞIYOR — GET'te yalnız `hasSecret` + ipucu |
| 31 | Audit log | ÇALIŞIYOR — transaction; aynı URL için 409 (çift kayıt yok) |
| 32 | Rate limit | ÇALIŞIYOR — tüm mutasyonlarda Redis öncelikli |
| 33 | Sunucu URL doğrulaması | ÇALIŞIYOR — https, kimlik bilgisi yok, DNS sonrası özel/loopback/link-local/CGNAT/ULA reddi |
| 34 | Olay whitelist'i | ÇALIŞIYOR — `z.enum(WEBHOOK_EVENT_KEYS)` |
| 35 | HMAC imza | ÇALIŞIYOR — eski `X-Qratex-Signature` korunur + `X-Qratex-Signature-V2: t=,v1=`, `X-Qratex-Timestamp`, `X-Qratex-Delivery` |
| 36 | Teslim loglama | ÇALIŞIYOR — genişletilmiş kayıt |
| 37 | Otomatik yeniden deneme | ÇALIŞIYOR — geçici hatada 3 deneme (1 sn, 3 sn) |
| 38 | Serverless güvenilirlik | ÇALIŞIYOR — çağıranlar `after()`/`runAfter` içinde (feedback-funnel, radar) |
| 39 | Mobil | ÇALIŞIYOR |
| 40 | Klavye / ekran okuyucu | ÇALIŞIYOR — shadcn Checkbox + Label, aria-expanded teslim satırları |
| 41 | i18n | KALAN — tam Türkçe; EN kapsam dışı |
| 42 | Payload / imza dokümantasyonu | ÇALIŞIYOR — Dokümantasyon sekmesi: olay örnek JSON'ları + Node doğrulama örneği |

### Kapanan bulgular (11/11)
1 secret sızıntısı (+ şifreli saklama) · 2 sahte olaylar (katalog yalnız tetiklenenler; `incident.created` radar'da zaten bağlıydı, artık seçilebilir) · 3 olay whitelist + SSRF (kayıt ve teslim anında, `redirect: 'manual'`) · 4 hata=boş liste · 5 aktif/pasif + art arda 15 hatada otomatik duraklatma (denetimli) · 6 sağlık penceresi · 7 yeniden deneme/replay/`after()` · 8 audit transaction + 409 çift kayıt · 9 bağlamsız başarısız teslimler · 10 erişilebilirlik · 11 dağınık yüzeyler (tech/add ve partner `webhookUrl` buraya toplandı).

### Kalanlar
- `/admin/innovation` partner digest webhook'u (ayrı ayar) bu merkeze taşınmadı — sahiplik dışı.
- Uzun vadeli kuyruk (Inngest step) yerine istek sonrası `after()` içinde sınırlı yeniden deneme.
- **ŞEMA İSTEĞİ:** ayrı `WebhookDelivery` modeli (`webhookId` FK + `@@index([webhookId, createdAt])`), `Webhook.description/partnerId/disabledReason` kolonları (şimdi Json zarfında).

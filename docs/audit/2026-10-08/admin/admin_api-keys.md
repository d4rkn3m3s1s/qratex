# /admin/api-keys

**Amaç:** Harici entegrasyonlar (POS, partner, BI) için `qrx_` önekli Bearer API anahtarı üretmek, listelemek ve silmek. Anahtarlar `lib/partner-api-auth.ts` üzerinden `/api/partner/v1/*` uçlarında doğrulanır.

**Genel puan:** 4.3 / 10 · **Karar:** yeniden tasarla (Partner modelindeki ikinci anahtar sistemiyle birleştirilerek)

Kısa özet: Temel CRUD iskeleti (üret → bir kez göster → listele → sil) güvenli bir şekilde kurulmuş: 192 bit rastgelelik, yalnız SHA-256 hash saklanıyor, audit log yazılıyor, rate limit var. Ancak sayfanın ürettiği anahtar, sistemin asıl tüketicisi olan `GET /api/partner/v1/digest` ucunda **çalışmıyor**, çünkü UI kapsam (scope) atayamıyor ve uç kapsam zorunlu tutuyor. Bunun yanında anahtarlar bayiye bağlanmıyor, iptal/süre sonu/rotasyon yok, hata durumu "boş liste" gibi görünüyor. Platformda ayrıca `Partner.apiKeyHash` diye ikinci bir anahtar sistemi daha var ve o hiçbir yerde doğrulanmıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Üretme/silme çalışıyor ama UI'dan üretilen anahtar asıl uçta (digest) 403 alıyor. Kapsam, iptal, süre sonu ve düzenleme yok. |
| UX | 4/10 | Tek seferlik anahtar akışı doğru kurgulanmış. Ancak hata boş liste gibi görünüyor, native `confirm()` kullanılıyor, "kaydettim" adımı yok, oluşturan ve tarih gösterilmiyor. |
| Görsel | 5/10 | Ortak hero ve kart dili tutarlı. Liste ham `<ul>`, durum/kapsam rozeti yok, hiyerarşi zayıf. |
| Mimari | 4/10 | İki paralel anahtar sistemi var (ApiKey + Partner). Audit transaction dışında. Modül kontrolü bağlı değil. `createdBy` Cascade. Kiracı bağlaması yok. |
| Performans | 7/10 | Sayfa hafif. Ama doğrulama `keyHash` üzerinde indeksiz `findFirst` yapıyor ve her istekte `lastUsedAt` UPDATE ediyor. |
| Erişilebilirlik + mobil | 5/10 | `flex-wrap` sayesinde mobil kırılmıyor. Silme ikon butonunda `aria-label` yok, Label/Input bağlı değil, Enter ile gönderilemiyor, çift padding var. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlık + açıklama ("Authorization: Bearer") | ÇALIŞIYOR | `app/admin/api-keys/page.tsx:86-90` | Hangi uçların bu anahtarla çağrılacağı yazmıyor. |
| 2 | Sayfa erişimi (ADMIN rolü + gizli kapı çerezi) | ÇALIŞIYOR | `proxy.ts:60-88` | Sayfa rotası korunuyor. |
| 3 | API yetkisi (`requireAuth(['ADMIN'])`) | KISMİ | `app/api/admin/api-keys/route.ts:18,34,96`; `proxy.ts:104-118` | `/api/*` istekleri `authMiddleware`'e girmiyor, bu yüzden gizli kapı çerezi API'de denetlenmiyor (Bulgu 3). |
| 4 | İsim alanı | ÇALIŞIYOR | `page.tsx:100-107` | `maxLength` yok. Label `htmlFor` ile bağlı değil. |
| 5 | İstemci tarafında boş isim kontrolü | ÇALIŞIYOR | `page.tsx:41-45` | |
| 6 | Sunucu doğrulaması (zod) | KISMİ | `lib/validations-admin.ts:30-33` | `name` 1-100 aralığında doğrulanıyor. `scope: z.array(z.string())` herhangi bir dizeyi, `'*'` dahil, kabul ediyor. İzinli liste yok. |
| 7 | Oluştur butonu + spinner + disabled | ÇALIŞIYOR | `page.tsx:118-121` | |
| 8 | Enter ile gönderme (`<form onSubmit>`) | EKSİK | `page.tsx:99-122` | Form öğesi yok. Enter'a basınca hiçbir şey olmuyor. |
| 9 | Admin mutation rate limit | KISMİ | `route.ts:36-48`; `lib/rate-limit.ts:12,303` | Bellek içi `Map` kullanılıyor, serverless'ta her instance ayrı sayıyor. Ayrıca DELETE'te uygulanmıyor. |
| 10 | Anahtar üretimi (`qrx_` + 24 bayt base64url, SHA-256) | ÇALIŞIYOR | `route.ts:59-61` | Entropi yeterli. |
| 11 | Ham anahtarı tek seferlik gösteren panel | ÇALIŞIYOR | `page.tsx:108-117`; `route.ts:84-88` | |
| 12 | Kopyala butonu | KISMİ | `page.tsx:77-82` | `writeText` beklenmiyor ve hatası yakalanmıyor. Kopyalama başarısız olsa da "Panoya kopyalandı" gösteriliyor. |
| 13 | "Kaydettim, kapat" onayı / paneli kapatma | EKSİK | `page.tsx:26,108` | Panel bir sonraki oluşturmaya kadar ekranda açık kalıyor. Kullanıcıdan saklama onayı alınmıyor. |
| 14 | Kapsam (scope) seçimi | EKSİK | `page.tsx:51` (yalnız `{ name }` gönderiliyor) | API `scope` kabul ediyor (`route.ts:56,62`) ama UI bunu kullanmıyor. |
| 15 | UI'dan üretilen anahtarın `/api/partner/v1/digest` ucunda çalışması | BOZUK | `lib/partner-api-auth.ts:30-34`; `app/api/partner/v1/digest/route.ts:19-22` | Kapsam `null` olduğu için yanıt `403 Gerekli yetki: read:partner_digest`. Bulgu 1'e bakın. |
| 16 | Liste yükleme | KISMİ | `page.tsx:28-34` | `r.ok` kontrol edilmiyor, 401/429/500 gövdesi dizi gibi işleniyor. |
| 17 | Yükleniyor durumu | KISMİ | `page.tsx:130-131` | Düz metin, iskelet yok. Yenileme sırasında (`fetchList` sonrası) gösterge yok. |
| 18 | Hata durumu | BOZUK | `page.tsx:31-32` | 500 yanıtında `{error}` dönüyor, `setList([])` çağrılıyor, ekranda "Henüz API anahtarı yok." çıkıyor ve toast gösterilmiyor. |
| 19 | Boş durum | KISMİ | `page.tsx:132-133` | Metin var ama CTA ve entegrasyon rehberi yok. Hata durumuyla ayırt edilemiyor. |
| 20 | Satırda isim | ÇALIŞIYOR | `page.tsx:142` | |
| 21 | Önek gösterimi | KISMİ | `page.tsx:144`; `route.ts:61` | Önek 8 karakter ve ilk 4'ü sabit `qrx_`. Ayırt edici kısım yalnızca 4 karakter, bu yüzden çakışma olası. Sonek (son 4 karakter) gösterilmiyor. |
| 22 | Son kullanım zamanı | ÇALIŞIYOR | `page.tsx:144`; `lib/partner-api-auth.ts:36-39` | Mutlak zaman gösteriliyor. "3 gün önce" gibi göreli zaman ve "hiç kullanılmadı" vurgusu yok. |
| 23 | Oluşturan kişi | EKSİK | `route.ts:24` veriyi çekiyor, `page.tsx:18` tipte var | Veri hazır ama render edilmiyor. Ölü veri. |
| 24 | Oluşturma tarihi | EKSİK | `page.tsx:17` | Veri var, gösterilmiyor. |
| 25 | Kapsam rozetleri | EKSİK | `ApiKeyRow` tipinde `scope` yok (`page.tsx:12-19`) | |
| 26 | Silme | ÇALIŞIYOR | `page.tsx:65-75`; `route.ts:95-123` | Kalıcı silme yapılıyor (`delete`), iptal kaydı kalmıyor. |
| 27 | Silme onayı | KISMİ | `page.tsx:66` | Native `confirm()`. Anahtar adı ve son kullanım bilgisi gösterilmiyor. Admin'in diğer sayfalarıyla tutarsız. |
| 28 | Audit log (CREATE/DELETE_API_KEY) | KISMİ | `route.ts:74-83,108-117` | Transaction dışında. Audit yazılamazsa anahtar oluşmuş/silinmiş olduğu halde istemciye 500 dönüyor. |
| 29 | Sayfada anahtar bazlı audit geçmişi | EKSİK | — | Bilgi yalnızca `/admin/audit` içinde. |
| 30 | Arama / filtre / sıralama | EKSİK | `page.tsx:135-152` | |
| 31 | Sayfalama | KISMİ | `route.ts:23` (`take: 500`) | 500 kayıttan sonrası sessizce kesiliyor ve bu belirtilmiyor. |
| 32 | İptal (revoke), süre sonu, rotasyon, yeniden adlandırma | EKSİK | `prisma/schema.prisma:1232-1246` | Modelde `revokedAt`, `expiresAt` alanları yok. PATCH ucu yok. |
| 33 | Kullanım analitiği / istek günlüğü | EKSİK | — | Yalnızca `lastUsedAt` tutuluyor. |
| 34 | Entegrasyon dokümantasyonu / örnek istek | EKSİK | — | Uç listesi `/admin/innovation` içinde kalmış (`app/admin/innovation/page.tsx:515-531`). |
| 35 | Toast dili | KISMİ | `lib/admin-toast.ts` (`'Basarili: '`, `'Dikkat: '`) | Önekler Türkçe karaktersiz. "Basarili: Anahtar oluşturuldu" gibi karışık metin çıkıyor. |
| 36 | i18n | EKSİK | `page.tsx` metinlerin tamamı sabit Türkçe | Sidebar `messages/en.json:2525` üzerinden çevrilmiş, sayfa çevrilmemiş. |
| 37 | Modül kontrolü `api_keys` ("critical") | SAHTE | `lib/module-controls.ts:51`; route ve `partner-api-auth` içinde `module-gate` çağrısı yok | Ayarlardan kapatılabilir görünüyor ama hiçbir etkisi yok. |
| 38 | Dashboard sayaç kartı | ÇALIŞIYOR | `app/admin/admin-dashboard-client.tsx:571`; `app/api/admin/tech-summary/route.ts:23` | |
| 39 | Mobil yerleşim | KISMİ | `page.tsx:85` (`p-6`); `app/admin/layout.tsx:33-38` | `flex-wrap` sayesinde taşma yok. Layout padding'ine ek `p-6` ile 400px genişlikte içerik daralıyor. |
| 40 | Klavye / ekran okuyucu | KISMİ | `page.tsx:147` (ikon buton, `aria-label` yok); `page.tsx:101` (Label bağlı değil); yeni anahtar paneli `aria-live` değil | |
| 41 | Azaltılmış hareket | ÇALIŞIYOR | `components/admin/admin-premium-hero.tsx:9,35` | Hero `useReducedMotion` kullanıyor. |
| 42 | Anahtarı bayiye (kiracıya) bağlama | EKSİK | `schema.prisma:1232-1246`; `lib/partner-digest-core.ts:24-29` | Bulgu 2'ye bakın. |

**Durum özeti:** ÇALIŞIYOR 12 · KISMİ 14 · BOZUK 2 · SAHTE 1 · EKSİK 13 · Toplam 42

---

## Bulgular

### 1. [YÜKSEK · İşlevsellik] UI'dan üretilen anahtar asıl tüketicide (digest) çalışmıyor
- **Kanıt:** `page.tsx:51` yalnızca `{ name }` gönderiyor. `route.ts:62` scope boşsa `null` yazıyor. `lib/partner-api-auth.ts:30-34` istenen kapsamı arıyor: `scopes = []` olduğundan `403`. `app/api/partner/v1/digest/route.ts:19-22` `'read:partner_digest'` kapsamını zorunlu tutuyor. `lib/innovation-config.ts:66` ise `partnerDigestApi: true` varsayılanıyla bu ucun açık olduğunu gösteriyor.
- **Sorun:** Admin bir anahtar oluşturup partnere veriyor. Partner digest ucunu çağırdığında 403 alıyor. Kapsamsız anahtarla çalışan tek uç olan `/api/partner/v1/catalog` ise yalnızca statik bir katalog döndürüyor (`app/api/partner/v1/catalog/route.ts:15-24`). Pratikte sayfanın ürettiği anahtar işe yaramıyor. Kapsam verilmek istenirse bunun tek yolu API'ye elle POST atmak.
- **Öneri:** Kapsamlar `lib/partner-scopes.ts` gibi tek bir kaynakta tip güvenli bir katalog olarak tanımlanmalı (`read:partner_digest`, `read:catalog`, ileride `write:*`). Oluşturma diyaloğunda gruplu onay kutularıyla seçilmeli, "Salt okuma" ve "Tam erişim" gibi ön ayarlar sunulmalı. zod şemasında `z.array(z.enum(SCOPES)).min(1)` kullanılmalı ve `'*'` yalnızca ayrı bir onayla verilebilmeli. Mevcut kapsamsız anahtarlar için listede "Kapsam yok, hiçbir korumalı uçta çalışmaz" uyarı rozeti gösterilmeli ve kapsam düzenleme için bir PATCH ucu eklenmeli.
- **Efor:** M

### 2. [YÜKSEK · Güvenlik/Veri] Anahtarlar kiracıya bağlı değil; kapsamlı her anahtar tüm bayilerin verisini okuyabiliyor
- **Kanıt:** `ApiKey` modelinde `dealerId` yok (`schema.prisma:1232-1246`). `digest/route.ts:28-29` `dealerId` değerini sorgu parametresinden, yani çağıranın seçimiyle alıyor. Parametre verilmezse `partner-digest-core.ts:24-29` filtresiz olarak tüm bayileri, `businessName` dahil (`:53-66`), döndürüyor.
- **Sorun:** Tek bir restoranın POS entegratörüne verilen anahtar, platformdaki bütün bayilerin isim, NPS ve puan ortalamalarını çekebilir. Bu bir IDOR ve kiracılar arası veri sızıntısı riski. Sayfa da bu ayrımı hiç sunmuyor: anahtar "platform geneli" mi, "tek bayi" mi belli değil.
- **Öneri:** `ApiKey`'e `dealerId String?` (null = platform geneli, açık onay gerektirir) ve `@@index([dealerId])` eklenmeli. `authenticatePartnerApiKey` dönüşüne `dealerId` eklenmeli. Digest ucu, anahtar bayiye bağlıysa sorgu parametresini yok saymalı ve bağlı bayiye zorlamalı. UI'da "Erişim alanı: Platform / Bayi seç (aranabilir combobox)" seçimi olmalı, listede bayi rozeti gösterilmeli.
- **Efor:** M

### 3. [YÜKSEK · Güvenlik — sistem geneli] Admin gizli kapısı API katmanında uygulanmıyor
- **Kanıt:** `proxy.ts:104-118`'de `/api/*` istekleri `authMiddleware`'e girmeden `NextResponse.next()` alıyor. Gizli kapı kontrolü yalnızca sayfa yolunda yapılıyor (`proxy.ts:79-88`). `requireAuth` (`lib/api-auth.ts:52-80`) gate çerezine bakmıyor. `lib/admin-gate` yalnızca gate'in kendi uçlarından import ediliyor.
- **Sorun:** Kapının amacı, "rolü kazara ADMIN olmuş" bir hesabı bile durdurmak (`proxy.ts:76-77` yorumu). Böyle bir hesap gate cevabını bilmeden `POST /api/admin/api-keys` ile kalıcı bir dış erişim anahtarı üretebilir. Bu, gate'i aşmanın en kalıcı yolu. Aynı sorun tüm `/api/admin/*` uçları için geçerli, ama bu sayfa en yüksek etkili örneği.
- **Öneri:** `requireAuth(['ADMIN'])` içinde, ya da ayrı bir `requireAdmin()` yardımcısında, `verifyGateCookie` doğrulanmalı. En azından anahtar üretme/silme gibi kritik mutasyonlarda "adım yükseltme" (step-up: gate cevabı veya parola yeniden doğrulama) istenmeli. Uygulama öncesinde gate cookie'nin API isteklerine gittiği doğrulanmalı (path=/ olmalı).
- **Efor:** S (yardımcı fonksiyon) / M (step-up UX)

### 4. [YÜKSEK · Veri bütünlüğü] Oluşturan admin silinince anahtarları da sessizce siliniyor
- **Kanıt:** `schema.prisma:1242` → `createdBy User @relation(..., onDelete: Cascade)`.
- **Sorun:** Bir admin hesabı silinirse (örneğin işten ayrılan çalışan) o kişinin oluşturduğu tüm entegrasyon anahtarları audit kaydı bırakmadan silinir ve canlı entegrasyonlar durur. Anahtarın sahibi bir kişi değil organizasyon olmalı.
- **Öneri:** İlişki `onDelete: SetNull` yapılmalı ve `createdById` opsiyonel olmalı. Silme yerine `revokedAt` ile iptal modeline geçilmeli (Bulgu 6). Listede "oluşturan: (silinmiş kullanıcı)" gösterilmeli.
- **Efor:** S (şema migrasyonu, üretim Neon'una dikkat)

### 5. [ORTA · Hata yönetimi] Sunucu hatası "henüz anahtar yok" olarak görünüyor
- **Kanıt:** `page.tsx:29-31` `r.ok` kontrol etmiyor. 500 yanıtında gövde `{ error: ... }` (`route.ts:29`), `Array.isArray` false dönüyor, `setList([])` çağrılıyor ve `page.tsx:133` "Henüz API anahtarı yok." gösteriyor. `catch` yalnızca ağ hatasında çalışıyor.
- **Sorun:** Operatör anahtarların silindiğini sanıp gereksiz yere yeni anahtar üretebilir. Bu, güvenlik açısından yanıltıcı bir durum. 401 (oturum düşmüş) ve 403 (token replay) yanıtları da aynı şekilde boş liste olarak görünüyor.
- **Öneri:** Ortak bir `adminFetch` yardımcısı (`res.ok` kontrolü + `error` alanını fırlatma) veya SWR kullanılmalı. Ayrı bir `error` state'i ile "Liste yüklenemedi — Tekrar dene" kartı gösterilmeli. 401'de girişe yönlendirilmeli.
- **Efor:** S

### 6. [ORTA · Ürün] İptal, süre sonu, rotasyon ve yeniden adlandırma yok; silme kalıcı
- **Kanıt:** Modelde `revokedAt` ve `expiresAt` yok (`schema.prisma:1232-1246`). Route'ta yalnızca GET/POST/DELETE var, PATCH yok. `route.ts:106` kalıcı `delete` yapıyor.
- **Sorun:** Sızan bir anahtar için tek seçenek iz bırakmadan silmek. Kesintisiz geçiş için rotasyon (yeni anahtar + eskisinin N saat geçerli kalması) mümkün değil. Süresiz anahtarlar zamanla birikip bir saldırı yüzeyi oluşturur.
- **Öneri:** Modele `revokedAt`, `revokedById`, `expiresAt`, `lastUsedIp` alanları eklenmeli. `authenticatePartnerApiKey` iptal edilmiş veya süresi dolmuş anahtarı reddetmeli. UI'da satır menüsü olmalı: Yeniden adlandır · Kapsamı düzenle · Rotasyon (eski anahtar 24 saat geçerli kalır) · İptal et. Oluşturma diyaloğunda süre seçimi sunulmalı (30/90/365 gün/süresiz, süresiz için uyarıyla). İptal edilen anahtarlar "İptal edildi" sekmesinde kalmalı.
- **Efor:** M

### 7. [ORTA · Mimari] İki paralel anahtar sistemi var; Partner anahtarı hiçbir yerde doğrulanmıyor
- **Kanıt:** `app/api/admin/partners/route.ts:61-62,84` `qrk_` anahtarı üretiyor ve bcrypt hash'ini `Partner.apiKeyHash` alanına yazıyor (`schema.prisma:1459`). `apiKeyHash` değeri hiçbir doğrulama yolunda okunmuyor (grep: yalnızca bu route'ta geçiyor). Gerçek doğrulama yalnızca `ApiKey` (`qrx_`) üzerinden yapılıyor.
- **Sorun:** `/admin/partners` sayfasında partnere verilen anahtar hiçbir uçta çalışmıyor (SAHTE). Operatör iki farklı yerde, iki farklı formatta anahtar yönetmek zorunda kalıyor ve hangisinin geçerli olduğu belirsiz.
- **Öneri:** Tek bir anahtar sistemi kalmalı: `ApiKey`'e `partnerId String?` ilişkisi eklenmeli. Partner sayfası anahtar üretirken `/api/admin/api-keys` servis katmanını kullanmalı. `Partner.apiKeyHash` kaldırılmalı veya `qrk_` için geçiş süresiyle birlikte doğrulamaya eklenmeli.
- **Efor:** M

### 8. [ORTA · Mimari] `api_keys` modül anahtarı "critical" olarak listeleniyor ama hiçbir şeyi kapatmıyor
- **Kanıt:** `lib/module-controls.ts:51`. Ne `app/api/admin/api-keys/route.ts` ne de `lib/partner-api-auth.ts` `module-gate` kullanıyor (grep sonucu).
- **Sorun:** Kriz anında "tüm dış API erişimini kapat" anahtarı varmış gibi görünüyor ama işe yaramıyor. Bu yanlış bir güvenlik hissi yaratır.
- **Öneri:** `authenticatePartnerApiKey` başında modül durumu (cache'li `getModuleControls`) kontrol edilmeli. Kapalıysa `503 API erişimi geçici olarak kapalı` dönmeli. Sayfa üstünde "Dış API: Açık/Kapalı" durum şeridi ve bir kill-switch olmalı.
- **Efor:** S

### 9. [ORTA · Performans/Güvenlik] Doğrulama yolunda indeksiz hash araması ve her istekte yazma
- **Kanıt:** `lib/partner-api-auth.ts:23-26` `findFirst({ where: { keyHash } })` yapıyor ama `keyHash` için `@unique` veya `@@index` yok (`schema.prisma:1235,1244-1245`). `:36-39` her başarılı istekte `UPDATE lastUsedAt` çalıştırıyor.
- **Sorun:** Tablo büyüdükçe her partner isteği sıralı tarama yapar. Yüksek frekanslı bir POS entegrasyonu her çağrıda Neon'a yazma yükü bindirir. Hash'in benzersiz olması da garanti altında değil.
- **Öneri:** `keyHash String @unique` ve `findUnique` kullanılmalı. `lastUsedAt` güncellemesi Redis'te kısılmalı (dakikada bir yazma, `SET NX EX 60`) veya `after()` ile istek sonrasına alınmalı. Upstash zaten projede mevcut.
- **Efor:** S

### 10. [ORTA · UX] Tek seferlik anahtar akışı yarım kalmış
- **Kanıt:** `page.tsx:77-82` (kopyalama beklenmiyor, hata yakalanmıyor), `page.tsx:108-117` (kapatma veya "kaydettim" yok), `page.tsx:59` (toast anahtarı göstermiyor ama aynı kartta bekliyor).
- **Sorun:** Clipboard izni yoksa kullanıcı "kopyalandı" mesajını görüp anahtarı kaybedebilir. Panel sayfada açık kaldığı için ekran paylaşımı sırasında anahtar sızabilir.
- **Öneri:** Stripe/GitHub kalıbı uygulanmalı: oluşturma bir Dialog içinde yapılmalı, başarıdan sonra diyalog "Anahtarınız" adımına geçmeli. Bu adımda maskeli alan + göster/gizle, `await navigator.clipboard.writeText` için try/catch (başarısızsa metni seçili hale getirme), `curl` örneği ve "Anahtarı güvenli bir yere kaydettim" onay kutusu bulunmalı. Diyalog kapanınca ham anahtar state'ten silinmeli.
- **Efor:** S

### 11. [DÜŞÜK · Veri bütünlüğü] Audit log ve mutasyon aynı transaction'da değil
- **Kanıt:** `route.ts:63-83` (create, ardından audit), `route.ts:106-117` (delete, ardından audit). Ayrıca `:102-106` önce kontrol edip sonra siliyor (TOCTOU). Eşzamanlı silmede P2025 hatası 500 olarak dönüyor.
- **Sorun:** Audit yazılamazsa anahtar oluşmuş olur ama kullanıcıya 500 döner ve ham anahtar hiç gösterilmez. Kimsenin bilmediği ama geçerli bir anahtar kalır. Silmede ise anahtar silinmiş olur ama "silinemedi" mesajı görünür.
- **Öneri:** `prisma.$transaction([...])` kullanılmalı. Silmede `deleteMany` + `count` ile idempotent bir sonuç döndürülmeli.
- **Efor:** S

### 12. [DÜŞÜK · Görünürlük] Çekilen veri gösterilmiyor; önek zayıf
- **Kanıt:** `createdBy` ve `createdAt` alanları `route.ts:24` ile çekiliyor ve `page.tsx:17-18` tipinde tanımlı ama render edilmiyor. Önek `rawKey.slice(0, 8)` (`route.ts:61`), yani yalnızca 4 ayırt edici karakter.
- **Öneri:** Önek `qrx_` + 8 karakter olmalı ve son 4 karakter de ayrıca saklanıp `qrx_ab12cd34…wxyz` biçiminde gösterilmeli. Satırda oluşturan, oluşturma tarihi ve göreli son kullanım ("3 gün önce", 90 günü aşmışsa "atıl" rozeti) gösterilmeli.
- **Efor:** S

### 13. [DÜŞÜK · Erişilebilirlik] Klavye ve ekran okuyucu eksikleri
- **Kanıt:** `page.tsx:147` ikon butonun `aria-label`'ı yok. `page.tsx:101-102` Label `htmlFor` yok, Input `id` yok. Form öğesi olmadığı için Enter çalışmıyor. Yeni anahtar paneli `role="status"`/`aria-live` değil. Silme `confirm()` ile yapılıyor (`page.tsx:66`); admin'de 9 dosya aynı kalıbı kullanıyor, yalnızca 1 dosya `AlertDialog` kullanıyor.
- **Öneri:** `aria-label={\`${k.name} anahtarını iptal et\`}`, `<form onSubmit>`, `Label htmlFor` eklenmeli. shadcn `AlertDialog` ile anahtar adını yazarak onaylama (tehlikeli işlem kalıbı) kullanılmalı.
- **Efor:** S

### 14. [DÜŞÜK · Dil] Toast önekleri Türkçe karaktersiz; sayfa i18n dışında
- **Kanıt:** `lib/admin-toast.ts` (`'Basarili: '`, `'Dikkat: '`). `page.tsx` içindeki tüm metinler sabit Türkçe. Sidebar ise `messages/tr.json:2525` / `en.json:2525` üzerinden çevriliyor.
- **Öneri:** Önekler "Başarılı"/"Dikkat" olarak düzeltilmeli, ya da sonner zaten ikonla durum gösterdiği için önek tamamen kaldırılmalı (sistem geneli tek dosya). Sayfa metinleri `useAppT` anahtarlarına taşınmalı (`app/admin/partners/page.tsx` bu kalıbı zaten kullanıyor).
- **Efor:** S

### 15. [DÜŞÜK · Mobil] Çift yatay padding
- **Kanıt:** `page.tsx:85` `p-6`, layout ise zaten `pl/pr-[max(0.75rem,…)]` uyguluyor (`app/admin/layout.tsx:33`).
- **Öneri:** Sayfa kabı `gap-6` ile sınırlanmalı, padding'i layout'a bırakılmalı. `/admin/webhooks` ve `/admin/tech/add` aynı kalıbı tekrarlıyor, ortak bir `AdminPage` kabıyla toplu çözülebilir.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard API keys, Linear API, PostHog project keys, Retool)

1. **Kapsamlı / kısıtlı anahtarlar.** Stripe "restricted key" gibi kaynak × izin matrisi (okuma/yazma/yok) ve ön ayarlar.
2. **İptal, süre sonu, rotasyon.** Stripe'taki "Roll key" (eskisi X saat geçerli kalır), GitHub PAT gibi süre sonu ve süresi yaklaşınca e-posta/push uyarısı.
3. **Kullanım günlüğü.** Anahtar başına son 30 günün istek sayısı, 4xx/5xx oranı, son IP/User-Agent, uç bazında dağılım (PostHog/Stripe "Logs" sekmesi). Sparkline içeren anahtar detay çekmecesi.
4. **IP izin listesi ve anahtar başına rate limit.** Kurumsal POS entegrasyonları için standart.
5. **Ortam ayrımı (test/canlı).** `qrx_test_` / `qrx_live_` önekleri, test anahtarının sahte veri döndürmesi.
6. **Gömülü geliştirici dokümantasyonu.** Uç listesi, kapsam başına örnek `curl`, webhook imza doğrulama snippet'i. Şu an bu bilgi `/admin/innovation` içine gömülü.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Geliştirici Erişimi" sayfası. Operatör tek bakışta kaç anahtarın aktif olduğunu, hangilerinin atıl veya süresi yaklaşmış olduğunu ve hangi bayi/partner adına çalıştığını görür. Yeni anahtarı 30 saniyede doğru kapsamla üretip güvenle teslim eder ve sızıntı şüphesinde tek tıkla iptal/rotasyon yapar.

**Yerleşim:**
- **Üst şerit (hero yerine kompakt başlık):** Dış API durumu (modül kill-switch, Bulgu 8), "Yeni anahtar" birincil butonu. Hero'nun breathe animasyonu bu operasyonel sayfada gereksiz. Kompakt `PageHeader` daha uygun.
- **KPI satırı (4 küçük stat):** Aktif · Son 7 günde kullanılan · 90+ gün atıl · 30 gün içinde süresi dolacak.
- **Tablo (masaüstü) / kart listesi (mobil):** Ad + önek…sonek · Erişim alanı (Platform / bayi rozeti / partner) · Kapsam rozetleri · Son kullanım (göreli + tooltip) · Oluşturan · Süre sonu · satır menüsü. Üstte arama, durum sekmeleri (Aktif / İptal edildi / Süresi doldu) ve sıralama olmalı. Kayıt sayısı 500'ü aşarsa cursor sayfalama.
- **Oluşturma diyaloğu (3 adım):** 1) Ad + erişim alanı (bayi/partner combobox) 2) Kapsam matrisi + süre + opsiyonel IP listesi 3) Tek seferlik anahtar ekranı (maskeli, kopyala, curl örneği, "kaydettim" onayı).
- **Detay çekmecesi (Sheet):** Kullanım grafiği (30 gün, istek ve hata), son 20 istek, anahtara ait audit zaman çizelgesi, Rotasyon/İptal aksiyonları.

**Motion/3D:** 3D bu sayfaya uygun değil. Ölçülü motion yeterli: diyalog adımları arasında 150-200 ms yatay kayma (`m as Motion`, LazyMotion zaten global), anahtar ekranında tek seferlik hafif bir "vurgu" parlaması, iptal edilen satırda opaklık ve üstü çizili geçiş. Hepsi `useReducedMotion` ile kapatılabilir olmalı. Sürekli dönen veya nefes alan efekt kullanılmamalı.

**Veri/API değişiklikleri:**
- `ApiKey`: `keyHash @unique`, `keySuffix`, `dealerId?`, `partnerId?`, `expiresAt?`, `revokedAt?`, `revokedById?`, `lastUsedIp?`, `environment` (`test|live`), `createdBy onDelete: SetNull`.
- Yeni `ApiKeyUsageDaily` (anahtar × gün × uç × durum sayaçları). İstek başına satır yazmak yerine Redis `INCR` ile toplanıp cron ile günlük olarak boşaltılmalı (mevcut cron altyapısı).
- Uçlar: `PATCH /api/admin/api-keys/[id]` (ad/kapsam/süre), `POST /[id]/revoke`, `POST /[id]/roll`, `GET /[id]/usage`. Kaynak tabanlı rota yapısına geçilmeli (`?id=` sorgu parametresi yerine).
- `authenticatePartnerApiKey`: modül kontrolü, revoke/expire kontrolü, `dealerId` zorlaması, kısılmış `lastUsedAt`, kullanım sayacı.
- `requireAdmin()`: rol + gate çerezi (Bulgu 3). Anahtar üretiminde step-up doğrulama.
- Kapsam kataloğu tek kaynaktan (`lib/partner-scopes.ts`) hem zod'u hem UI'ı hem de `/api/partner/v1/catalog` çıktısını beslemeli.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/partners`:** Kendi `qrk_` + bcrypt anahtar sistemini üretiyor ama bu anahtar hiçbir yerde doğrulanmıyor (`app/api/admin/partners/route.ts:61-62`). **Birleştir:** Partner kaydı bir `ApiKey`'e (`partnerId`) bağlanmalı. Anahtar yönetimi tek yerde (bu sayfa) yapılmalı, partner sayfası yalnızca "bu partnerin anahtarları" görünümünü göstermeli.
- **`/admin/tech/add` → "API anahtarı" sekmesi:** Bu sayfanın oluşturma formunun neredeyse birebir kopyası (`app/admin/tech/add/page.tsx:117-148`), aynı scope eksikliği de var. **Kaldır:** Sekme `/admin/api-keys?new=1` adresine yönlendirmeli veya ortak `CreateApiKeyDialog` bileşenini kullanmalı.
- **`/admin/innovation` → "Partner entegrasyon paketi" kartı:** Uç dokümantasyonu burada kalmış (`app/admin/innovation/page.tsx:515-531`). **Taşı:** Bu sayfanın "Geliştirici dokümantasyonu" paneline alınmalı.
- **`/admin/webhooks`:** Aynı "entegrasyon" alanına ait ve aynı kalıpla yazılmış (`app/admin/webhooks/page.tsx:3-11`). Uzun vadede `/admin/integrations` altında **Anahtarlar · Webhook'lar · Partnerler · Dokümantasyon** sekmeleriyle tek bir "Entegrasyonlar" merkezi kurulmalı. `/admin/api-catalog` (iç admin API listesi) ise ayrı kalmalı; o, dış entegrasyonla ilgili değil.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme. Kod değiştirilmedi, veritabanına erişilmedi, hiçbir komut çalıştırılmadı. Okunan dosyalar: `app/admin/api-keys/page.tsx`, `app/api/admin/api-keys/route.ts`, `lib/partner-api-auth.ts`, `lib/partner-digest-core.ts`, `app/api/partner/v1/{digest,catalog}/route.ts`, `app/api/internal/inngest/partner-digest-webhook/route.ts`, `lib/validations-admin.ts`, `proxy.ts`, `lib/api-auth.ts`, `app/api/admin/users/route.ts`, `app/api/admin/users/bulk/route.ts`, `app/api/user/delete-account/route.ts`, `app/admin/tech/add/page.tsx`, `prisma/schema.prisma` (ApiKey, AuditLog ve User'a giden tüm ilişkiler).

### 1. UI'dan üretilen anahtar digest ucunda çalışmıyor: **DOĞRULANDI**

- `page.tsx:51` gövdeye yalnızca `{ name }` koyuyor. Aynı kopya form `app/admin/tech/add/page.tsx:129` de öyle.
- `route.ts:62` → `scope` dizi değilse `null`; `route.ts:68` `scope: undefined` yazıyor, yani DB'de `NULL`.
- `lib/partner-api-auth.ts:30-34`: `requiredScope` verildiğinde `scopes = []` ve `'*'` da yok, bu yüzden **403 "Gerekli yetki: read:partner_digest"** dönüyor.
- `digest/route.ts:19-22` kapsamı zorunlu tutuyor. Kapsamsız geçen tek uç `catalog/route.ts:10`, o da yalnızca statik `PARTNER_EVENTS`/`WEBHOOK_HEADERS` döndürüyor.
- Kodda `apiKey.update` yalnızca `lastUsedAt` yazıyor (`partner-api-auth.ts:36`). Kapsamı sonradan düzenleyen bir uç ya da UI yok.
- **Yeniden üretim:** /admin/api-keys'te "POS" adlı anahtar oluşturulur. `curl -H "Authorization: Bearer qrx_..." /api/partner/v1/digest` çağrısı 403 döner, `/api/partner/v1/catalog` ise 200 döner ama içerik sabittir. Kapsam yalnızca UI dışından, doğrudan POST gövdesine `scope` koyarak verilebiliyor.

### 2. Anahtarlar kiracıya bağlı değil (IDOR): **ÇÜRÜTÜLDÜ** (kritik/yüksek güvenlik açığı olarak). Tasarım eksikliği olarak not edildi.

- Gözlem doğru: `schema.prisma:1232-1246` içinde `dealerId` yok, `digest/route.ts:28-29` filtreyi çağırana bırakıyor ve `partner-digest-core.ts:24-29` parametre yoksa tüm bayileri döndürüyor.
- Ancak bu bir yetki aşımı değil, **belgelenmiş platform düzeyi davranış**. `catalog/route.ts:20` ucu açıkça `?dealerId=<optional>` olarak tanımlıyor. Platformun kendi webhook işi de aynı tüm-bayi özetini `buildPartnerDigestPayload(null)` ile dışarı gönderiyor (`app/api/internal/inngest/partner-digest-webhook/route.ts:20`). Anahtarı yalnızca ADMIN üretebiliyor ve modelde "bayiye ait anahtar" diye bir kavram yok. Dolayısıyla bir bayinin başka bir bayinin verisine eriştiği bir sınır ihlali kurulamıyor.
- Yetkisiz bir aktör için somut bir yol yok. Bulgu 1 nedeniyle UI'dan üretilen hiçbir anahtar digest'e erişemiyor. Erişim, bir adminin UI dışından `scope` gönderip anahtarı bilerek tek bir bayinin entegratörüne vermesini gerektiriyor; bu da bir yönetişim kararı.
- `'*'` kabulü (`validations-admin.ts:32`, `partner-api-auth.ts:32`) yalnızca ADMIN'in ayarlayabildiği, kasıtlı bir joker. Tek başına açık sayılmaz. Bulgu 3 ile birleştiğinde etkisi büyüyor (aşağıda).
- **Not:** Bayi veya POS entegratörlerine anahtar dağıtılması planlanıyorsa, bu dağıtımdan **önce** `ApiKey.dealerId?` alanı eklenmeli ve `authenticatePartnerApiKey` bunu sorgu parametresinin üstüne zorla yazmalı. Ayrıca kapsam, kapalı bir enum'dan (`z.enum([...])`) doğrulanmalı. Bugünkü durumda bu bir ürün gereksinimi, aktif bir sızıntı değil.

### 3. Admin gizli kapısı /api/admin/* katmanında uygulanmıyor: **DOĞRULANDI**

- `proxy.ts:104-118`: `/api/` ile başlayan her istek yalnızca güvenlik ve CORS başlıklarıyla `NextResponse.next()`'e gidiyor, `authMiddleware`'e hiç girmiyor.
- Gate çerezi kontrolü yalnızca sayfa yolunda yapılıyor (`proxy.ts:79-88`, `pathname.startsWith('/admin')`).
- `lib/api-auth.ts:52-80` `requireAuth` yalnızca oturum, rol ve token-replay kontrolü yapıyor. `app/` ve `lib/` altında `admin_gate`/`gateCookieBelongsTo` kullanan başka bir API kontrolü yok (grep: yalnızca `lib/admin-gate.ts` sabitleri ve `lib/admin-gate-edge.ts`).
- **Yeniden üretim:** Rolü ADMIN yapılmış (ör. `users/bulk` `update_role` ile, `app/api/admin/users/bulk/route.ts:52-55`) ama gate rakamını bilmeyen hesap giriş yapar. `/admin/api-keys` sayfası onu `/admin-gate`'e yönlendirir, ancak aynı oturum çereziyle `POST /api/admin/api-keys` ve `{"name":"x","scope":["*"]}` gövdesi 200 döndürür ve yanıtta `rawKey` yer alır. Zod herhangi bir diziyi kabul ettiği için (`validations-admin.ts:32`) bu anahtar digest'e de erişir. Süresi, iptal tarihi ve IP kısıtı olmadığından (`schema.prisma:1232-1246`) anahtar, hesabın rolü geri alınsa bile çalışmaya devam eder: anahtar kullanıcıya değil hash'e bağlı ve `authenticatePartnerApiKey` oluşturanın rolüne bakmıyor.
- Etki sistem genelinde. Gate, bütün `/api/admin/*` uçları için yalnızca bir arayüz perdesi. Önerilen düzeltme: gate çerezini de doğrulayan ortak bir `requireAdmin()` yardımcısı (Node runtime'da `lib/admin-gate.ts` HMAC doğrulaması). Hassas uçlarda (anahtar üretimi, rol değişimi) step-up doğrulama da eklenmeli.

### 4. `ApiKey.createdBy onDelete: Cascade`: **DOĞRULANDI** (ciddiyet: orta; kritik değil ama somut)

- `schema.prisma:1242` `onDelete: Cascade`. User'a giden 111 ilişkinin hepsinde `onDelete` tanımlı ve hiçbiri `Restrict`/`NoAction` değil. Yani kullanıcı silme işlemini engelleyen bir FK yok, silme gerçekten zincirleniyor.
- Silme yolları: `app/api/admin/users/route.ts:676` (yalnızca kendini silmeyi engelliyor, başka bir ADMIN'i silebiliyor), `app/api/admin/users/bulk/route.ts:79` ve `app/api/user/delete-account/route.ts:39` (ADMIN kendi hesabını silebiliyor).
- Durumu ağırlaştıran nokta: `AuditLog.user` da `onDelete: Cascade` (`schema.prisma:1118`). Silinen adminin yazdığı `CREATE_API_KEY` audit satırları da yok oluyor. Kullanıcı silme audit'i (`users/route.ts:681-692`) yalnızca ad, e-posta ve rol tutuyor, zincirleme silinen anahtarları listelemiyor. Sonuçta anahtarın hem kendisi hem de oluşturulma izi kayboluyor.
- **Yeniden üretim:** Admin B, "POS" anahtarını oluşturur. Admin A, ayrılan B'nin hesabını `/admin/users` üzerinden siler. "POS" satırı ve B'nin `CREATE_API_KEY` audit kaydı silinir, entegrasyon bir sonraki istekte 401 "Geçersiz API anahtarı" alır (`partner-api-auth.ts:27-29`). Admin panelinde neden durduğuna dair hiçbir iz kalmaz.
- Öneri: `createdById String?` + `onDelete: SetNull`. Anahtarın yaşam döngüsü `revokedAt`/`revokedById` alanlarıyla ve fiziksel silme yerine iptal modeliyle yönetilmeli. Kullanıcı silme akışı, silinecek kullanıcının aktif anahtarlarını önceden listeleyip onay istemeli. AuditLog'un da kullanıcıyla birlikte silinmemesi gerekiyor (`userId String?` + `SetNull`); bu ayrı ve sistem genelinde bir bulgu olarak ele alınmalı.

## Uygulama (Dalga 2)

**Yeni yer:** `/admin/integrations` (Entegrasyon Merkezi) — sekmeler: API anahtarları · Webhook'lar · Partnerler · API kataloğu · Dokümantasyon. Eski rota `permanentRedirect` ile ilgili sekmeye yönlenir (sorgu parametreleri korunur).

**Mimari:** BFF `/api/admin/integrations/*` (hepsi `defineRoute`: ADMIN + zod + Redis'li rate limit + idempotency; `requireAuth` artık admin gizli kapısını da API'de doğruluyor). Servis `lib/integrations/server.ts`; sözleşme `lib/integrations/contract.ts` (kapsam + olay kataloğu tek kaynak); meta zarfı `lib/integrations/meta.ts`; SSRF `lib/integrations/url-safety.ts`; sır kasası `lib/integrations/secret-box.ts`; UI `components/admin/a-entegrasyonlar/**` (QDL v2 PanelPage/SectionTabs/DataTable/DetailSheet/QueryState, ops kaydı, azaltılmış hareket). Sunucu bileşeni KPI + aktif sekmenin ilk verisini ön yükler; katalog ve dokümantasyon sekmeleri lazy. Testler: `__tests__/lib/integrations.test.ts` (23 test).

**Şema kısıtı:** Şema dalgası kapalı olduğu için yaşam döngüsü alanları mevcut Json kolonlarında sürümlü zarfla tutuluyor (`ApiKey.scope` → `{v:2, scopes, dealerId, partnerId, expiresAt, revokedAt, suffix, ipAllowlist…}`, `Webhook.events` → `{v:2, events, description, partnerId, archivedAt, disabledReason, secretHint}`, `Partner.metadata` → irtibat/bayiler/arşiv). Okuyucular eski dizi biçimini de anlar.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Başlık + açıklama | ÇALIŞIYOR — kompakt PageHeader; hangi uçların çağrılacağı Dokümantasyon sekmesinde |
| 2 | Sayfa erişimi | ÇALIŞIYOR |
| 3 | API yetkisi | ÇALIŞIYOR — `defineRoute` → `requireAuth` (gizli kapı API'de de doğrulanıyor) |
| 4 | İsim alanı | ÇALIŞIYOR — `maxLength`, Label/`htmlFor`, alan altı hata |
| 5 | Boş isim kontrolü | ÇALIŞIYOR — istemci + sunucu (min 2) |
| 6 | Sunucu doğrulaması | ÇALIŞIYOR — `z.enum(API_SCOPE_KEYS)` + `'*'` yalnız `confirmFullAccess` ile |
| 7 | Oluştur + spinner | ÇALIŞIYOR |
| 8 | Enter ile gönderme | ÇALIŞIYOR — `<form onSubmit>` |
| 9 | Rate limit | ÇALIŞIYOR — Redis öncelikli `checkRateLimitDb` (oluşturma/döndürme: sensitive) |
| 10 | Anahtar üretimi | ÇALIŞIYOR — `qrx_` + 32 bayt, SHA-256 |
| 11 | Tek seferlik panel | ÇALIŞIYOR — diyalog içinde, kapanınca state'ten silinir |
| 12 | Kopyala | ÇALIŞIYOR — `await` + başarısızsa metin seçilir ve söylenir |
| 13 | "Kaydettim" onayı | ÇALIŞIYOR — onaysız kapanmaz (dış tıklama/Esc kilitli) |
| 14 | Kapsam seçimi | ÇALIŞIYOR |
| 15 | Anahtarın digest'te çalışması | ÇALIŞIYOR — varsayılan kapsam `read:partner_digest` |
| 16 | Liste yükleme | ÇALIŞIYOR — zarf v2, `res.ok` |
| 17 | Yükleniyor | ÇALIŞIYOR — iskelet + arka plan göstergesi |
| 18 | Hata durumu | ÇALIŞIYOR — QueryState hata + Tekrar dene (boş liste gibi görünmez) |
| 19 | Boş durum | ÇALIŞIYOR — CTA'lı |
| 20 | Satırda isim | ÇALIŞIYOR |
| 21 | Önek gösterimi | ÇALIŞIYOR — `qrx_`+8 karakter önek + son 4 karakter (yeni anahtarlar) |
| 22 | Son kullanım | ÇALIŞIYOR — göreli + "hiç kullanılmadı" + 90 gün "atıl" |
| 23 | Oluşturan | ÇALIŞIYOR (silinmişse "Silinmiş kullanıcı") |
| 24 | Oluşturma tarihi | ÇALIŞIYOR |
| 25 | Kapsam rozetleri | ÇALIŞIYOR — kapsamsız eski anahtar için uyarı rozeti |
| 26 | Silme | KALDIRILDI — fiziksel silme yerine gerekçeli **iptal** (iz kalır) |
| 27 | Silme onayı | ÇALIŞIYOR — iptal için gerekçeli diyalog |
| 28 | Audit log | ÇALIŞIYOR — mutasyonla aynı transaction |
| 29 | Anahtar bazlı audit geçmişi | ÇALIŞIYOR — detay çekmecesi "Etkinlik" |
| 30 | Arama / filtre | ÇALIŞIYOR — ad/önek araması + durum (etkin/süresi dolan/iptal/tümü); sıralama oluşturma tarihine göre sabit |
| 31 | Sayfalama | ÇALIŞIYOR — URL'li sayfalama + toplam |
| 32 | İptal, süre sonu, rotasyon, yeniden adlandırma | ÇALIŞIYOR — PATCH, revoke, roll (0/1/24/72 sa ek süre) |
| 33 | Kullanım analitiği | ÇALIŞIYOR — anahtar başına 14 günlük başarılı/reddedilen sayaç (Redis; yoksa dürüst not). Uç bazında dağılım/IP günlüğü yok |
| 34 | Entegrasyon dokümantasyonu | ÇALIŞIYOR — Dokümantasyon sekmesi + oluşturmada cURL örneği |
| 35 | Toast dili | ÇALIŞIYOR (bu yüzey) — sonner doğrudan Türkçe mesajla; `lib/admin-toast` önekleri sistem geneli, sahiplik dışı |
| 36 | i18n | KALAN — tüm metin tam Türkçe; EN çevirisi bu dalgada kapsam dışı (diğer Dalga 2 ops yüzeyleriyle aynı) |
| 37 | Modül kontrolü `api_keys` | ÇALIŞIYOR — `authenticatePartnerApiKey` kapalıysa 503; sayfa üstünde durum şeridi |
| 38 | Dashboard sayaç kartı | KALAN (sahiplik dışı) — tech-summary toplamı iptal edilenleri de sayar |
| 39 | Mobil yerleşim | ÇALIŞIYOR — çift padding yok, mobilde kart listesi, ≥44px hedefler |
| 40 | Klavye / ekran okuyucu | ÇALIŞIYOR — etiketli alanlar, aria-live, AlertDialog/Dialog odak tuzağı |
| 41 | Azaltılmış hareket | ÇALIŞIYOR — `useReducedMotionPref` |
| 42 | Anahtarı bayiye bağlama | ÇALIŞIYOR — `dealerId`; digest anahtarın bayisine zorlanır, başka bayi istenirse 403 |

### Kapanan bulgular (15/15)
1 digest 403 (kapsam UI) · 2 kiracı bağlama (`dealerId` + partner bayileri) · 3 gizli kapı API'de (`requireAuth` checkAdminElevation; defineRoute) · 4 Cascade etkisi: fiziksel silme kaldırıldı, iptal modeli (FK şeması değişmedi — aşağıda şema isteği) · 5 hata=boş liste · 6 iptal/süre/rotasyon/yeniden adlandırma · 7 iki anahtar sistemi: partner artık `ApiKey` + `partnerId` kullanıyor, `qrk_` üretimi kaldırıldı, eski özet "temizle" aksiyonu · 8 modül kill-switch · 9 her istekte yazma: `lastUsedAt` Redis ile dakikada bir (indeks şema isteği) · 10 tek seferlik akış · 11 transaction · 12 görünürlük/önek · 13 erişilebilirlik · 14 dil (bu yüzey) · 15 çift padding.

### Kalanlar
- i18n (EN) — kapsam dışı.
- **ŞEMA İSTEĞİ:** `ApiKey.keyHash @unique` (+ `findUnique`), `createdById` opsiyonel + `onDelete: SetNull`; yaşam döngüsü alanlarının (revokedAt/expiresAt/dealerId/partnerId) Json zarfından kolonlara taşınması.

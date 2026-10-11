# /admin/audit

**Amaç:** Platformdaki yönetimsel ve hassas değişikliklerin (ayar güncellemesi, kullanıcı silme, rol değiştirme, kupon/fiyat/rozet/ödül CRUD, geri alma vb.) kim tarafından, ne zaman, hangi kayıt üzerinde yapıldığını listeleyen denetim günlüğü (`AuditLog` tablosu) gezgini.

**Genel puan:** 3.5/10 · **Karar:** **yeniden tasarla** (sayfa platformun "kanonik denetim gezgini" olarak kalmalı; ancak filtre modeli, detay/diff görünümü, veri hijyeni ve şema bütünlüğü baştan ele alınmalı; `/admin/compliance` içindeki birleşik log gezgini ile ayar/SEO sayfalarındaki gömülü geçmiş panelleri buraya bağlanmalı)

> Özet hüküm: Sayfa yükleniyor, yetki kontrolü doğru ve sayfalı liste çalışıyor. Ama bir denetim günlüğünün asıl işi olan **"ne değişti?"** sorusuna cevap vermiyor: `oldData`/`newData` sunucudan çekilip tarayıcıya gönderiliyor ama hiç gösterilmiyor. Filtre seçenekleri koddaki gerçek değerlerin küçük bir kısmını kapsıyor ve büyük/küçük harf uyuşmazlığı yüzünden "user" / "settings" filtreleri kayıtların önemli kısmını kaçırıyor. Bitiş tarihi filtresi seçilen günü dışlıyor. Daha önemlisi sistem düzeyinde iki bütünlük sorunu var: kullanıcı silinince o kullanıcının **tüm denetim izi cascade ile siliniyor**, ve ayar kayıtlarında **OpenAI API anahtarı dahil tüm ayar değerleri düz metin olarak** denetim kaydına yazılıp bu sayfanın API'si üzerinden ham IP/UA ile birlikte istemciye dönüyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Liste + sayfalama çalışıyor; ama filtrelerin çoğu gerçek veriyle eşleşmiyor, bitiş tarihi bozuk, detay/diff yok, hata durumu "kayıt yok" gibi görünüyor. |
| UX | 3/10 | Ham kodlar (`BULK_DELETE_USERS`, `update_sidebar_nav_order`) yorumsuz listeleniyor; bir kaydın ne anlama geldiğini veya neyi değiştirdiğini anlamak imkânsız; filtre durumu URL'de yok, paylaşılamıyor. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` ile tutarlı; tablo shadcn `Table` yerine çıplak `<table>`, rozet/ikon/renk kodlaması yok, boş durum düz metin. |
| Mimari | 3/10 | Tam `'use client'` + elle `fetch`; sunucuda tip/whitelist doğrulaması yok; şema `onDelete: Cascade` ile denetim izini kırılgan yapıyor; entity/action taksonomisi 29 entity + 86 action değeriyle tutarsız (aynı varlık için `settings`/`Settings`, `user`/`User`). |
| Performans | 5/10 | İndeksler var (`createdAt`, `entity`, `action`); fakat her istekte ağır JSON (`batch_update` tüm ayar haritasını taşıyor) gösterilmediği hâlde gönderiliyor, offset sayfalama + her sayfada `count(*)`, saklama politikası yok. |
| Erişilebilirlik + mobil | 4/10 | Tablo yatay kayıyor ve yükleme durumu `role="status"` ile duyuruluyor; ama `Label`'lar kontrollere bağlı değil, tablo başlıklarında `scope` yok, mobilde layout + `p-6` çift dolgu, dar ekranda kart görünümü yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişimi: ADMIN rolü + gizli kapı (gate cookie) | ÇALIŞIYOR | `proxy.ts:51`, `proxy.ts:79-87` | Sayfa yolu için doğru. |
| 2 | API yetkisi `GET /api/admin/audit` | KISMİ | `app/api/admin/audit/route.ts:12-13`, `proxy.ts:105-118` | `requireAuth(['ADMIN'])` + token-replay var; ancak gizli kapı `/api/*` yollarını kapsamıyor — gate cevabını bilmeyen ADMIN rolü API'yi doğrudan çağırabilir (sistem geneli, bkz. Bulgu 7). |
| 3 | Yükleniyor iskeleti (`loading.tsx`) | KISMİ | `app/admin/audit/loading.tsx:3-15` | Çalışıyor ama iskelet "arama kutusu + buton + tek blok" çiziyor; sayfa "filtre kartı + tablo" yerleşiminde — yüklemeden sonra düzen sıçrıyor. |
| 4 | Hero başlık / açıklama / ikon | ÇALIŞIYOR | `app/admin/audit/page.tsx:69-73` | Açıklama "kullanıcı" filtresini ima ediyor; kullanıcı filtresi arayüzde yok. `actions`/`chips` prop'ları (`components/admin/admin-premium-hero.tsx:150-160`) kullanılmamış (dışa aktarma, canlı sayaç için ideal yer). |
| 5 | Entity filtresi (Select) | BOZUK | `page.tsx:85-95`; yazıcılar: `app/api/admin/settings/admin-gate/route.ts:54` (`'Settings'`), `app/api/user/profile/route.ts:83` (`'User'`), `app/api/admin/users/route.ts` (`'user'`) | Yalnızca 3 seçenek (`settings`, `user`, `PhysicalCard`); kodda en az 29 farklı entity değeri yazılıyor. Eşleşme büyük/küçük harfe duyarlı tam eşitlik (`route.ts:25`) — "user" seçilince `User` ile yazılan profil, şifre, toplu silme, GDPR anonimleştirme kayıtları gelmiyor; "settings" seçilince admin-gate, puan matrisi, lig kuralları, karakter eşikleri (`Settings`) gelmiyor. |
| 6 | Action filtresi (Select) | BOZUK | `page.tsx:99-110`; `route.ts:26` | Yalnızca `create/update/delete/rollback`; kodda 86'dan fazla farklı action değeri var (`CREATE_COUPON`, `BULK_DELETE_USERS`, `UPDATE_POINTS_MATRIX`, `add_points` …). "delete" seçmek `DELETE_FEATURE`, `BULK_DELETE_USERS`, `DELETE_API_KEY` gibi kritik silmeleri göstermiyor. |
| 7 | Başlangıç tarihi | KISMİ | `page.tsx:112-115`, `route.ts:30` | `new Date('YYYY-MM-DD')` UTC gece yarısı olarak yorumlanıyor; Türkiye saatiyle seçilen günün 00:00–03:00 arası kaçıyor. |
| 8 | Bitiş tarihi | BOZUK | `page.tsx:116-119`, `route.ts:31` | `lte: new Date('YYYY-MM-DD')` = o günün 00:00 UTC'si; seçilen gün neredeyse tamamen dışlanıyor. Başlangıç = bitiş seçilirse sonuç **her zaman boş**. `from > to` doğrulaması yok. |
| 9 | "Uygula" butonu | KISMİ | `page.tsx:121`, `page.tsx:63-65` | Sayfa 1'deyken çalışıyor. Sayfa >1 iken `setPage(1)` + `fetchLogs()` iki istek atıyor: biri eski sayfa numarasıyla (closure), biri efektle sayfa 1. Hangisi son dönerse tablo onu gösterir; "Sayfa 1 / N" yazarken 3. sayfanın verisi ya da "Kayıt bulunamadı" görülebilir. |
| 10 | Filtreleri sıfırla | EKSİK | — | Tek tek "Tümü"ye çekip tarihleri elle silmek gerekiyor. |
| 11 | Aktör (kullanıcı) filtresi | EKSİK | API destekliyor: `route.ts:18`, `route.ts:27` | Arayüzde alan yok. "Bu admin son 7 günde ne yaptı?" sorusu cevaplanamıyor. |
| 12 | Serbest metin / Entity ID arama | EKSİK | — | Belirli bir kullanıcının, kuponun, kartın geçmişini bulmak için yol yok. |
| 13 | Kayıt sayısı başlığı "Kayıtlar (N)" | ÇALIŞIYOR | `page.tsx:129` | Sayı biçimlendirilmemiş (`toLocaleString` yok). |
| 14 | Yükleniyor durumu (inline) | ÇALIŞIYOR | `page.tsx:133-134`, `components/ui/inline-loading-status.tsx:27-33` | `role="status"` + i18n etiketi. |
| 15 | Boş durum | KISMİ | `page.tsx:135-136` | Düz metin; aktif filtreleri ve "filtreleri temizle" eylemini göstermiyor; hata durumuyla aynı mesaj. |
| 16 | Hata durumu | BOZUK | `page.tsx:52-59` | `r.ok` kontrol edilmiyor, `.catch(() => {})` hatayı yutuyor. 401/403/500 yanıtında `entries` gelmediği için "Kayıt bulunamadı." görünüyor — yönetici "hiç değişiklik yok" sanıyor. Token-replay 403'ü de sessizce boş liste olur. |
| 17 | Tarih sütunu | ÇALIŞIYOR | `page.tsx:153-155` | `toLocaleString('tr-TR')` sabit; göreli zaman, saat dilimi ipucu, ISO tooltip yok. |
| 18 | Kullanıcı (aktör) sütunu | KISMİ | `page.tsx:156-158` | Yalnızca e-posta; API `role` döndürüyor (`route.ts:41`) ama gösterilmiyor — admin işlemi ile müşteri işlemi (`CHANGE_PASSWORD`, `CLAIM_REWARD`) ayırt edilemiyor. Kullanıcı sayfasına bağlantı yok. |
| 19 | Action sütunu | KISMİ | `page.tsx:159` | Ham kod; insan-okur etiket, renk/önem kodlaması (silme = kırmızı vb.) yok. |
| 20 | Entity sütunu | KISMİ | `page.tsx:160` | Ham kod; hedef kayda (kupon, kart, kullanıcı) bağlantı yok. |
| 21 | Entity ID sütunu | KISMİ | `page.tsx:161` | `truncate max-w-[120px]` — `title` yok, kopyala butonu yok; tam ID görülemiyor. Bazı yazıcılar buraya ID yerine metin koyuyor (`"5 kullanıcı"`: `app/api/admin/users/bulk/route.ts:83`). |
| 22 | Kayıt detayı / önce-sonra diff (`oldData`/`newData`) | EKSİK | Tip tanımlı: `page.tsx:25-26`; API gönderiyor: `route.ts:35-43` | Denetim günlüğünün çekirdek değeri. Veri her istekte geliyor ama hiç render edilmiyor. |
| 23 | IP / User-Agent gösterimi | EKSİK | Şema: `prisma/schema.prisma:1114-1115`; API `include` ile tüm skalerleri ham döndürüyor (`route.ts:40-42`) | Arayüzde yok, ama ağ yanıtında **maskelenmemiş** IP var (compliance ucu maskeliyor: `app/api/admin/compliance/logs/route.ts:5`). |
| 24 | Önceki / Sonraki sayfalama | KISMİ | `page.tsx:167-181`, `page.tsx:43-61` | Çalışıyor; ama `AbortController` yok (hızlı tıklamada sıra dışı yanıt), ve **uygulanmamış** filtre değişikliklerini de sessizce uyguluyor (`fetchLogs` o anki state'i okuyor). |
| 25 | "Sayfa X / Y" göstergesi | ÇALIŞIYOR | `page.tsx:169-171` | — |
| 26 | Sayfa boyutu seçimi | EKSİK | `page.tsx:51` sabit `20` | API 50'ye kadar destekliyor (`route.ts:22`). |
| 27 | Sıralama | EKSİK | `route.ts:37` sabit `createdAt desc` | — |
| 28 | URL'de filtre durumu / derin bağlantı | EKSİK | `page.tsx:33-41` yalnızca `useState` | `trust-timeline` (`app/api/admin/trust-timeline/route.ts:163,187`), `platform-pulse`, `trust-command`, dashboard hep çıplak `/admin/audit`'e bağlanıyor; ilgili olaya filtreli giriş yapılamıyor. |
| 29 | CSV / JSON dışa aktarma | EKSİK | — | Denetim/uyum için temel beklenti. |
| 30 | Geri alma (rollback) eylemi | EKSİK | Filtrede `rollback` seçeneği var: `page.tsx:108`; uç mevcut: `app/api/admin/settings/rollback/route.ts`; kullanılan yer: `app/admin/settings/settings-client.tsx:786-794`, `app/admin/seo/page.tsx:144-149` | `lib/module-controls.ts:67` modülü "denetim kayıtları ve geri alma" diye tanımlıyor; bu sayfada geri alma yok. |
| 31 | Yenile / canlı akış | EKSİK | — | Yeni kayıt geldiğinde görmek için sayfayı yeniden yüklemek gerekiyor. |
| 32 | i18n | KISMİ | `page.tsx:134` tek `t()` çağrısı; diğer tüm metinler sabit Türkçe/İngilizce karışık (`Entity`, `Action`, `Entity ID`, `Filtreler`, `Uygula`) | EN yerelinde sayfa Türkçe kalıyor; TR yerelinde başlıklar yarı İngilizce. |
| 33 | Mobil yerleşim | KISMİ | `page.tsx:68` `p-6`; layout dolgusu `app/admin/layout.tsx:33`, `:38`; tablo `page.tsx:139` | Tablo yatay kayıyor (kullanılabilir); ama layout dolgusunun üstüne `p-6` eklenince dar ekranda içerik daralıyor; dar ekran için kart/satır görünümü yok. |
| 34 | Modül kontrolünde `audit_logs` anahtarı | SAHTE | `lib/module-controls.ts:67`; `assertModuleEnabled('audit_logs'` kod tabanında hiç çağrılmıyor (grep) | `/admin/modules`'te "kritik" bir anahtar olarak görünüyor; kapatmak hiçbir şeyi değiştirmiyor. (Denetimin kapatılabilir olması zaten istenmez — anahtar kaldırılmalı.) |
| 35 | Silinen kullanıcıların denetim izinin korunması | BOZUK | `prisma/schema.prisma:1118` `onDelete: Cascade`; `app/api/admin/users/route.ts:676`, `app/api/admin/users/bulk/route.ts:79` | Kullanıcı silinince yaptığı tüm işlemlerin denetim kaydı da siliniyor (bkz. Bulgu 1). |
| 36 | Saklama (retention) politikası | EKSİK | Cron'da `auditLog` temizliği yok (`app/api/cron` altında grep sonuçsuz) | Tablo, müşteri olaylarıyla (`COMPLETED_ACHIEVEMENT`, `CLAIM_QUEST_REWARD`, `CLAIM_REWARD`) sınırsız büyüyor. |
| 37 | API girdi doğrulaması | KISMİ | `route.ts:21-22`, `route.ts:30-31` | `page=abc` → `NaN` → Prisma hatası → 500; `pageSize=0` → `take: 0`, `totalPages: Infinity` (JSON'da `null`); geçersiz tarih → `Invalid Date` → 500. Arayüz bu değerleri üretmiyor ama ucun kendisi sağlam değil (compliance ucundaki `toDate` yardımcısı doğru örnek: `compliance/logs/route.ts:26-30`). |

**Durum sayımı:** ÇALIŞIYOR 6 · KISMİ 13 · BOZUK 5 · SAHTE 1 · EKSİK 12 (toplam 37)

---

## Bulgular

### 1. Kullanıcı silinince denetim izi de siliniyor (cascade)
- **Önem:** kritik · **Kategori:** veri bütünlüğü / güvenlik
- **Kanıt:** `prisma/schema.prisma:1118` → `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`; silme yolları `app/api/admin/users/route.ts:676` (`prisma.user.delete`) ve `app/api/admin/users/bulk/route.ts:79` (`deleteMany`).
- **Sorun:** `AuditLog.userId` aktörü tutuyor ve ilişki cascade. Bir kullanıcı (admin dahil) silindiğinde onun yaptığı bütün işlemlerin denetim kaydı kalıcı olarak yok oluyor. Somut senaryo: kötü niyetli bir admin ikinci bir ADMIN hesabı oluşturur, o hesapla puan dağıtır / rol değiştirir / API anahtarı oluşturur, sonra hesabı siler → geride yalnızca tek bir "delete user" kaydı kalır, yapılan işlemlerin izi silinmiştir. Ayrıca silinen müşterinin `CHANGE_PASSWORD`, `UPDATE_PROFILE`, `data_subject_request` (KVKK/GDPR kanıt zinciri; `lib/gdpr-core.ts:13`) kayıtları da gidiyor. Denetim günlüğünün "değiştirilemez kanıt" vaadi şema seviyesinde kırık.
- **Profesyonel öneri:** (a) İlişkiyi `onDelete: SetNull` yap, `userId`'yi `String?` yap ve kayıt anında **aktör anlık görüntüsü** sakla: `actorEmail`, `actorName`, `actorRole` sütunları (silinse de okunabilir kalır). (b) Kullanıcı silmeyi tercihen hard-delete yerine mevcut `anonymizeUser` (`lib/gdpr-core.ts:116`) akışına yönlendir. (c) Uzun vadede `AuditLog`'a yalnız-ekleme (append-only) garantisi: uygulama rolünün `UPDATE/DELETE` yetkisini kaldıran bir Postgres rolü veya tetikleyici; isteğe bağlı olarak her kayda önceki kaydın hash'ini zincirleyen `prevHash` alanı (kurcalama tespiti). Migration canlı Neon'a dokunacağı için ayrı, gözden geçirilmiş bir şema değişikliği olarak planlanmalı.
- **Efor:** M

### 2. Gizli değerler (OpenAI API anahtarı dahil) denetim kaydına düz metin yazılıyor ve bu sayfanın API'si ham olarak dışarı veriyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri hijyeni
- **Kanıt:** Ayar formu tüm alanları tek seferde gönderiyor, `openaiApiKey` dahil: `app/admin/settings/settings-client.tsx:555-559`, `:1738-1739`. Sunucu tüm eski/yeni haritayı audit'e yazıyor: `app/api/admin/settings/route.ts:270-276` (`batch_update`, `oldData: oldMap`, `newData: newMap`) ve tekil yol `:170-180`. Maskeleme yok (`route.ts` içinde `mask/redact` grep sonuçsuz). `/api/admin/audit` `include` kullandığı için `oldData`, `newData`, ham `ipAddress`, `userAgent` dahil tüm skalerleri döndürüyor: `app/api/admin/audit/route.ts:35-43`. Ana dashboard bu ucu her açılışta çağırıyor: `app/admin/admin-dashboard-client.tsx:85`.
- **Sorun:** Anahtar döndürüldüğünde (rotation) eski anahtarlar audit tablosunda süresiz kalıyor; her `batch_update` kaydı anahtarın hem eski hem yeni hâlini taşıyor. Bu sayfa veriyi göstermese de ağ yanıtına koyuyor; DB yedekleri (`d05d08f` R2 yedek betikleri) de bu sırları içeriyor. Aynı kalıp profil güncellemesinde adres/telefon/konum (`app/api/user/profile/route.ts:85`) gibi kişisel verileri de saklıyor. Admin gizli kapı kodu bu riski bilerek önlemiş (`app/api/admin/settings/admin-gate/route.ts:56` "Cevabı audit'e ham yazma"), ama genel ayar yolu önlememiş.
- **Profesyonel öneri:** Merkezi bir `writeAudit()` yardımcısı (`lib/audit.ts`) oluştur: tüm `prisma.auditLog.create` çağrıları (88 satır, 58 dosya) bundan geçsin. Yardımcı, anahtar adı kalıbına göre (`/key|secret|token|password|smtp/i`) değerleri `"•••• (son 4: abcd)"` biçiminde redakte etsin ve `batch_update`'te yalnızca **değişen** anahtarları yazsın (diff, tüm harita değil). Okuma tarafında liste ucu `select` ile yalnız özet alanları döndürsün; `oldData/newData` ayrı bir `GET /api/admin/audit/[id]` detay ucundan, IP'ler `maskIpAddress` ile maskeli gelsin (ham IP için compliance'taki `includeSensitive` gibi açık bir yetki/eylem). Mevcut kayıtlar için tek seferlik redaksiyon betiği (canlı DB → ayrı onaylı iş). Ayrıca `openaiApiKey` ayarlar tablosunda değil ortam değişkeni/şifreli sır deposunda tutulmalı.
- **Efor:** L

### 3. Filtre seçenekleri gerçek veriyle uyuşmuyor; "user" ve "settings" filtreleri kayıtların bir kısmını sessizce kaçırıyor
- **Önem:** yüksek · **Kategori:** işlevsellik / veri doğruluğu
- **Kanıt:** Arayüz sabit 3 entity + 4 action sunuyor: `app/admin/audit/page.tsx:90-93`, `:104-108`. Sunucu tam eşitlikle filtreliyor: `app/api/admin/audit/route.ts:25-26`. Kod tabanında yazılan değerler (grep): en az 29 entity ve 86 action; aynı kavram için farklı yazımlar: `settings` (`app/api/admin/settings/route.ts:174`) vs `Settings` (`app/api/admin/settings/admin-gate/route.ts:54`, `points-matrix`, `leagues`, `character-thresholds`, `discovery`, `intern-emails`); `user` (`app/api/admin/users/route.ts`) vs `User` (`app/api/user/profile/route.ts:83`, `app/api/admin/users/bulk/route.ts:83`, `lib/gdpr-core.ts:165`, `lib/billing-core.ts`).
- **Sorun:** Yönetici "user" seçtiğinde toplu kullanıcı silme, rol değişikliği, GDPR anonimleştirme, plan atama kayıtlarını **görmüyor** ve listede olmadıkları için "olmadı" sonucuna varıyor. Bu, yanlış negatif üreten bir denetim aracıdır — hiç filtre olmamasından daha tehlikeli. Action filtresi pratikte yalnızca ayar/SEO yolunun küçük harfli kayıtlarını yakalıyor.
- **Profesyonel öneri:** (a) Kısa vadede seçenekleri dinamik yap: yeni `GET /api/admin/audit/facets` ucu `groupBy(['entity'])` ve `groupBy(['action'])` ile gerçek değerleri sayılarıyla döndürsün (Redis'te 5 dk önbellek); arayüzde aranabilir çoklu seçim (combobox) kullan. Filtreyi `mode: 'insensitive'` ile `in` listesine çevir. (b) Kalıcı çözüm: tek bir taksonomi — `lib/audit-catalog.ts` içinde `AUDIT_ACTIONS` sözlüğü (`{ key: 'user.delete', entity: 'User', label: 'Kullanıcı silindi', severity: 'critical', category: 'users' }`); `writeAudit()` yalnız bu anahtarları kabul etsin (TypeScript literal union ile derleme zamanında). Eski değerleri katalog anahtarlarına eşleyen bir normalizasyon tablosu ile geçmiş kayıtlar da doğru gruplansın. Bu katalog aynı zamanda insan-okur etiketleri ve önem rengini sağlar (Bulgu 6).
- **Efor:** M (dinamik facet) + L (taksonomi)

### 4. Bitiş tarihi filtresi seçilen günü dışlıyor; aynı gün aralığı her zaman boş
- **Önem:** yüksek · **Kategori:** hata
- **Kanıt:** `app/admin/audit/page.tsx:118` (`<Input type="date">` → `"2026-10-08"`), `app/api/admin/audit/route.ts:30-31` (`gte: new Date(from)`, `lte: new Date(to)`).
- **Sorun:** `new Date('2026-10-08')` UTC 00:00 = TR 03:00. `lte` bu ana kadar alıyor; yani "bitiş: 8 Ekim" seçmek 8 Ekim'in 03:00 sonrasını dışlıyor. Başlangıç ve bitiş aynı gün seçilince `gte X AND lte X` → tek bir an → boş liste. "Dün ne oldu?" sorusunun en doğal kullanımı bozuk. Başlangıç tarafında da TR 00:00–03:00 arası kaçıyor.
- **Profesyonel öneri:** İstemci tarih aralığını kullanıcının saat dilimiyle **açık uçlu** ISO anlara çevirip göndersin: `from = startOfDay(local).toISOString()`, `to = startOfDay(local + 1 gün).toISOString()` ve sunucu `lt` kullansın. Sunucu `toDate` benzeri doğrulayıcı ile geçersiz değeri 400'e çevirsin, `from > to` ise 400 dönsün. Arayüzde tek bir tarih aralığı seçici + hazır aralıklar ("Son 1 saat", "Bugün", "Son 7 gün", "Son 30 gün") — Stripe/PostHog standardı.
- **Efor:** S

### 5. Hata durumu "kayıt yok" olarak görünüyor; yarış koşulu yanlış sayfayı gösterebiliyor
- **Önem:** orta · **Kategori:** hata / UX
- **Kanıt:** `app/admin/audit/page.tsx:52-60` (`r.ok` kontrolü yok, `.catch(() => {})`), `:121` (`setPage(1); fetchLogs();`), `:63-65` (efekt yalnızca `page`'e bağlı), `:173-176` (sayfalama tıklaması `fetchLogs`'u o anki — uygulanmamış — filtre state'i ile tetikliyor).
- **Sorun:** (a) 403 (token-replay), 401 (oturum düştü) veya 500 yanıtında tablo "Kayıt bulunamadı." diyor; denetim aracında bu, "hiçbir şey olmadı" yanlış güvencesi demek. (b) Sayfa 3'teyken filtre değiştirip "Uygula" deyince iki istek yarışıyor; son dönen kazanır. (c) Filtre kutusunu değiştirip "Uygula" demeden "Sonraki"ye basınca filtre örtük olarak uygulanıyor — taslak ve uygulanmış filtre ayrımı yok.
- **Profesyonel öneri:** Veri çekmeyi tek bir anahtar üzerinden yöneten bir hook'a taşı (projede SWR/React Query yoksa `useEffect` + `AbortController` + istek kimliği). Durum kaynağı URL olsun (`useSearchParams` + `router.replace`): `?entity=…&action=…&from=…&to=…&actor=…&page=…`; filtre değişince sayfa otomatik 1'e insin, her URL değişikliğinde tek istek atılsın, öncekiler iptal edilsin. Hata için `Alert` + "Tekrar dene" + HTTP durumuna göre mesaj (401 → yeniden giriş, 403 → güvenlik ihlali açıklaması). Boş durumda aktif filtre rozetleri ve "Filtreleri temizle".
- **Efor:** S

### 6. Kayıt detayı ve önce/sonra farkı yok — sayfa denetim sorusuna cevap vermiyor
- **Önem:** yüksek · **Kategori:** ürün / UX
- **Kanıt:** Tip `oldData`/`newData` taşıyor (`page.tsx:25-26`), API gönderiyor (`route.ts:35-43`), tablo yalnız 5 sütun render ediyor (`page.tsx:143-147`, `:153-161`). Ham kodlar yorumsuz: `page.tsx:159-160`.
- **Sorun:** "Puan matrisinde kim neyi değiştirdi?", "Bu kupon ne zaman pasifleştirildi, önceki değer neydi?" soruları bu sayfada cevaplanamıyor; kullanıcının ayrı ayrı `/admin/settings` ve `/admin/seo` içindeki gömülü geçmiş panellerine gitmesi gerekiyor. `BULK_DELETE_USERS` gibi geri dönüşsüz bir kayıt ile `update_sidebar_nav_order` görsel olarak aynı ağırlıkta.
- **Profesyonel öneri:** Satıra tıklayınca sağdan açılan bir **detay paneli** (`Sheet`): üstte insan-okur özet cümlesi ("Furkan, 8 Eki 14:32'de **Puan Matrisi**ni güncelledi"), aktör kartı (ad, rol rozeti, kullanıcı sayfasına link), hedef varlık bağlantısı (entity → admin rota eşlemesi katalogda), IP (maskeli) + cihaz özeti (UA ayrıştırılmış), ve **alan bazlı diff** görünümü: değişen anahtarlar kırmızı/yeşil, değişmeyenler katlanmış; büyük JSON için "ham JSON" sekmesi + kopyala. Ayar/SEO kayıtlarında mevcut rollback uçlarını (`app/api/admin/settings/rollback/route.ts`, `app/api/admin/seo/rollback`) çağıran "Bu değişikliği geri al" eylemi, onay diyaloğu ile. Tabloda action sütunu katalogdan etiket + önem rengi (kritik/yüksek/normal) + ikon gösterir. Detay verisi ayrı `GET /api/admin/audit/[id]` ucundan tembel yüklenir (liste hafifler).
- **Efor:** L

### 7. Gizli kapı API katmanını kapsamıyor
- **Önem:** orta · **Kategori:** güvenlik (sistem geneli)
- **Kanıt:** `proxy.ts:79-87` gate kontrolü yalnız sayfa yollarında; `proxy.ts:105-118` `/api/*` için yalnız güvenlik başlıkları ekleyip `NextResponse.next()` dönüyor. `app/api/admin/audit/route.ts:12` yalnız rol kontrolü yapıyor; `lib/api-auth.ts:52-80` gate cookie'ye bakmıyor.
- **Sorun:** Proje hafızasındaki ilke "rol yetmez, gizli cevap da gerekir". Rolü ADMIN yapılmış ama gate cevabını bilmeyen biri `/admin/audit` sayfasını açamaz; fakat `fetch('/api/admin/audit?pageSize=50')` ile tüm denetim verisini (Bulgu 2'deki sırlar ve ham IP'ler dahil) çekebilir. Bu sayfaya özgü değil, ama denetim verisi en hassas veri kümelerinden biri.
- **Profesyonel öneri:** `requireAuth` içine `ADMIN` rolü istendiğinde gate cookie doğrulamasını (`gateCookieBelongsTo`, `lib/admin-gate-edge.ts`) ekle ya da proxy'de `/api/admin/*` için aynı kontrolü uygula (gate ekranının kendi API'si muaf). Tek noktada yapılırsa tüm admin uçları kapanır.
- **Efor:** S

### 8. Taksonomi dağınıklığı ve sayfa dışı denetim yazımları atomik değil
- **Önem:** orta · **Kategori:** mimari
- **Kanıt:** 58 dosyada 88 doğrudan `auditLog.create` satırı (grep). Biçimler karışık: `UPPER_SNAKE` (`CREATE_COUPON`), `snake_lower` (`update_cosmetic_item`), dinamik (`bulk_${action.op}`: `app/api/admin/team/tasks/bulk/route.ts`). `entityId` alanına metin yazılıyor (`"${ids.length} kullanıcı"`: `app/api/admin/users/bulk/route.ts:83`). Silme önce, audit sonra ve ayrı (`app/api/admin/users/route.ts:676-691`); toplu yolda audit hatası yutuluyor (`bulk/route.ts:84` `.catch(console.error)`).
- **Sorun:** Mutasyon başarılı olup audit yazımı başarısız olursa iz kalmıyor; filtreleme ve raporlama güvenilmez. Sayfa ne kadar iyi tasarlanırsa tasarlansın veri bu kadar tutarsızken anlamlı gruplama yapılamaz.
- **Profesyonel öneri:** Bulgu 2 ve 3'teki `writeAudit(tx, { action: AuditActionKey, entity, entityId, before, after, req })` yardımcısı: transaction istemcisini alır (mutasyonla aynı `$transaction` içinde yazılır), katalog anahtarını zorunlu kılar, toplu işlemlerde `entityId` yerine `targetIds: string[]` (yeni `Json` alanı veya ayrı `AuditLogTarget` tablosu) kullanır. ESLint kuralı (`no-restricted-syntax`) ile doğrudan `prisma.auditLog.create` yasaklanır.
- **Efor:** L

### 9. Liste ucu ağır ve sınırsız büyüyen tabloda offset sayfalama kullanıyor
- **Önem:** orta · **Kategori:** performans
- **Kanıt:** `app/api/admin/audit/route.ts:35-44` (`include` → tüm JSON sütunları; `skip/take`; her istekte `count`). `batch_update` kaydı tüm ayar haritasını iki kez taşıyor (`app/api/admin/settings/route.ts:270-276`). Müşteri eylemleri de aynı tabloya yazılıyor (`lib/achievements.ts:160`, `app/api/gamification/quests/[id]/claim/route.ts:133`, `app/api/gamification/rewards/route.ts:331`). Cron'da saklama/temizlik yok.
- **Sorun:** Görünmeyen veriler için onlarca KB'lık yanıtlar; tablo müşteri olaylarıyla büyüdükçe derin sayfalarda `OFFSET` ve her seferinde `count(*)` pahalılaşır. Ayrıca admin denetim sinyali, müşteri gamification gürültüsüyle boğuluyor.
- **Profesyonel öneri:** Liste ucunda `select` ile yalnız özet alanlar; imleç (keyset) sayfalama (`createdAt,id < cursor`), toplamı yalnız ilk sayfada veya yaklaşık (`pg_class.reltuples` / önbellekli sayaç) göster. Bileşik indeksler `(entity, createdAt DESC)`, `(userId, createdAt DESC)`. Kategori ayrımı: kayda `actorType` (`admin | system | end_user`) yaz, sayfa varsayılan olarak `admin + system` göstersin. Saklama: `end_user` kayıtları 180 gün, admin kayıtları ≥ 2 yıl (KVKK/uyum gereksinimine göre); temizlik mevcut günlük cron'a (`app/api/cron/daily/route.ts`) eklenebilir — **ama** quest ödül dedupe'u audit'e dayandığı için (`prisma/schema.prisma:1124-1125` yorumu) önce o bağımlılık ayrı bir tabloya taşınmalı.
- **Efor:** M

### 10. Erişilebilirlik ve i18n eksikleri
- **Önem:** düşük · **Kategori:** erişilebilirlik / i18n
- **Kanıt:** `Label`'lar `htmlFor` olmadan, kontrollerde `id` yok: `page.tsx:84-85`, `:98-99`, `:113-114`, `:117-118`. Tablo `<th>`'lerde `scope` ve `<caption>` yok: `page.tsx:140-148`. Yalnız bir metin i18n'li (`page.tsx:134`), gerisi sabit (`page.tsx:70-71`, `:78-80`, `:84`, `:98`, `:129`, `:136`, `:143-147`, `:170-177`). Sayfa layout dolgusuna ek `p-6` veriyor (`page.tsx:68`, `app/admin/layout.tsx:33`).
- **Sorun:** Ekran okuyucu "Entity" seçicisini ve tarih alanlarını adsız okuyor; EN yerel kullanıcısı karışık dilli ekran görüyor; mobilde içerik gereksiz daralıyor.
- **Profesyonel öneri:** shadcn `Table` bileşenine geç (`components/ui/table.tsx` mevcut), başlıklara `scope="col"`, görsel olarak gizli `caption`. Her `Label` ↔ kontrol eşleşmesi (`htmlFor`/`id`, Select için `aria-labelledby`). Tüm metinleri `messages/tr.json` / `en.json` altında `adminAudit.*` anahtarlarına taşı; action etiketleri katalogdan yerelleştirilsin. `p-6`'yı kaldırıp diğer yeni sayfalardaki dikey `gap` düzenine uy; < 640px'te tablo yerine kart listesi (zaman, aktör, insan-okur özet, önem rozeti).
- **Efor:** S

### 11. `audit_logs` modül anahtarı işlevsiz (sahte kontrol)
- **Önem:** düşük · **Kategori:** ürün tutarlılığı
- **Kanıt:** `lib/module-controls.ts:67`; `assertModuleEnabled('audit_logs'` kod tabanında yok (grep: kullanılan anahtarlar `campaigns`, `rewards`, `squads` … listesinde değil).
- **Sorun:** `/admin/modules` ekranında "kritik" etiketli bir anahtar kapatılabiliyor gibi görünüyor ama hiçbir etkisi yok; ayrıca açıklaması ("ve geri alma") var olmayan bir özelliği vaat ediyor.
- **Profesyonel öneri:** Denetim kaydı kapatılabilir bir modül olmamalı; anahtarı katalogdan çıkar veya `locked: true` (değiştirilemez, bilgi amaçlı) olarak işaretle.
- **Efor:** S

### 12. Yükleme iskeleti gerçek yerleşimle uyuşmuyor
- **Önem:** düşük · **Kategori:** görsel
- **Kanıt:** `app/admin/audit/loading.tsx:5-12` (arama kutusu + buton + 400px blok) vs `page.tsx:69-185` (hero + filtre kartı + tablo kartı).
- **Sorun:** Rota geçişinde düzen sıçraması (CLS) ve "arama kutusu" vaadi.
- **Profesyonel öneri:** İskeleti hero + 4 filtre alanı + 8 satırlık tablo iskeleti olarak yeniden çiz; tablo içi yükleniyor durumunda da spinner yerine satır iskeleti (önceki veriyi soluk tutarak — "stale-while-revalidate" hissi).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

Kıyas: Stripe Dashboard "Events/Logs", Linear "Audit log", Retool "Audit logs", PostHog "Activity log", GitHub org audit log.

1. **Olay detayı + alan bazlı diff + "geri al"** — Stripe her olayda istek/yanıt gövdesi, PostHog Activity log'da "değiştirdi: X → Y" cümlesi gösterir. Burada veri var ama görünmüyor.
2. **Gerçek veriden beslenen, aranabilir facet filtreleri** — aktör, aktör rolü/türü (admin/sistem/son kullanıcı), varlık türü, eylem kategorisi, önem, IP; çoklu seçim + serbest metin (`entityId`, e-posta).
3. **Hazır zaman aralıkları ve saat dilimi doğru tarih aralığı** — "Son 1 saat / 24 saat / 7 gün / 30 gün / özel".
4. **Paylaşılabilir URL durumu ve kaydedilmiş görünümler** — "Kritik silmeler", "Ekonomi değişiklikleri", "Gizli kapı/güvenlik" gibi hazır sorgular; trust-timeline ve dashboard'dan filtreli derin bağlantı.
5. **Dışa aktarma (CSV/JSON) + harici akış** — uyum için tarih aralıklı dışa aktarma; isteğe bağlı mevcut webhook altyapısına (`/admin/webhooks`) `audit.created` olayı ya da SIEM'e akış.
6. **Değiştirilemezlik ve saklama göstergeleri** — append-only garanti, saklama süresi ve (varsa) hash zinciri doğrulama rozeti; GitHub/Linear kurumsal planlarının temel vaadi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Yönetici "Ne oldu, kim yaptı, neyi değiştirdi, geri alabilir miyim?" sorularına 10 saniyede cevap bulur. Sayfa platformun **tek kanonik denetim gezgini** olur; diğer ekranlar (dashboard, trust-command, platform-pulse, ayar/SEO geçmiş panelleri) buraya filtreli derin bağlantı verir.

**Yerleşim (masaüstü):**
- **Üst şerit:** `AdminPremiumHero` sade sürümü; `chips` alanında "Son 24 saatte N değişiklik · M kritik", `actions` alanında "Dışa aktar" ve "Kaydedilmiş görünümler" menüsü.
- **Filtre çubuğu (yapışkan):** Zaman aralığı seçici (hazır aralıklar), aktör combobox (avatar + rol), varlık türü / eylem kategorisi çoklu seçim (facet sayılarıyla), önem segment kontrolü (Tümü / Kritik / Yüksek), serbest arama. Aktif filtreler rozet olarak altta, tek tıkla kaldırılabilir. Tüm durum URL'de.
- **Sol: zaman çizelgesi listesi** — gün başlıklarıyla gruplanmış satırlar: göreli zaman (tooltip'te tam ISO + TR saati), aktör avatarı + rol rozeti, insan-okur özet cümlesi ("**Puan Matrisi** güncellendi — 3 alan değişti"), önem noktası (kritik = kırmızı). Klavye ile `j/k` gezinme, `Enter` detay.
- **Sağ: detay paneli (`Sheet`)** — özet, aktör ve hedef kartları (linkli), maskeli IP + ayrıştırılmış cihaz, alan bazlı diff, ham JSON sekmesi, uygunsa "Geri al" (onay diyaloğu, geri alma da yeni bir audit kaydı üretir ve bağlantılı gösterilir: "Bu kayıt X'i geri aldı").
- **Mobil:** filtreler alttan açılan `Sheet`'te; liste kart görünümü; detay tam ekran.

**Motion / 3D:** 3D kesinlikle yersiz — bu bir adli inceleme aracı. Motion ölçülü ve işlevsel olmalı: detay panelinin sağdan kayarak açılması (global LazyMotion, `m as Motion`, ~180 ms), yeni kayıt geldiğinde listenin başına tek satırlık yumuşak ekleme ve kısa vurgu (canlı mod açıkken), diff satırlarında anlık renk geçişi. `useReducedMotion` ile tümü anlık geçişe düşmeli. Hero'daki nefes/ping animasyonu bu sayfada gereksiz dikkat çekiyor; `AdminPremiumHero`'nun animasyonsuz tonu tercih edilebilir.

**Veri / API değişiklikleri:**
1. Şema: `AuditLog.userId` → nullable + `onDelete: SetNull`; `actorEmail`, `actorName`, `actorRole`, `actorType`, `severity`, `targetIds Json?`; bileşik indeksler `(entity, createdAt)`, `(userId, createdAt)`. (Canlı Neon — ayrı onaylı migration.)
2. `lib/audit-catalog.ts` (eylem kataloğu: anahtar, etiket TR/EN, kategori, önem, varlık→admin rota eşlemesi, geri alınabilirlik) + `lib/audit.ts` `writeAudit(tx, …)` (redaksiyon, yalnız-diff, transaction içi). 58 dosyanın kademeli taşınması; ESLint ile doğrudan yazım yasağı.
3. Uçlar: `GET /api/admin/audit` (özet alanlar, imleç sayfalama, çoklu filtre, `insensitive` eşleşme, zod doğrulama); `GET /api/admin/audit/facets` (Redis 5 dk önbellek); `GET /api/admin/audit/[id]` (detay, maskeli IP); `GET /api/admin/audit/export` (CSV akışı, tarih aralığı zorunlu, kendisi de audit'e yazılır); `POST /api/admin/audit/[id]/revert` (katalogda geri alınabilir işaretli eylemler için mevcut settings/SEO rollback mantığına yönlendirir).
4. Güvenlik: gate cookie kontrolünün `/api/admin/*`'a genişletilmesi; mevcut kayıtlardaki sırların tek seferlik redaksiyonu.
5. Saklama: `actorType` bazlı saklama politikası günlük cron'a; quest dedupe bağımlılığı önce ayrı tabloya taşınır.

---

## Çakışmalar / birleştirme önerisi

| Sayfa / bileşen | Çakışma | Öneri |
|---|---|---|
| `/admin/compliance` (`app/admin/compliance/page.tsx:74-99`, `app/api/admin/compliance/logs/route.ts`) | AuditLog + CardAuditLog + SuspiciousActivity + runtime guard olaylarını birleşik, IP maskeli, `contains` aramalı listeleyen **ikinci bir log gezgini**; birçok açıdan bu sayfadan daha olgun (maskeleme, tarih doğrulama, kaynak filtresi). | Tek "Denetim ve Güvenlik Olayları" gezgini: `/admin/audit` kanonik olur, `source` facet'i (Yönetim / Kart / Şüpheli / Modül engeli) eklenir; compliance sayfası özet/kapsama metriklerine odaklanır ve gezgin için buraya derin bağlantı verir. |
| `/admin/settings` geçmiş paneli (`app/admin/settings/settings-client.tsx:663`, `:786-794`) ve `/admin/seo` geçmiş paneli (`app/admin/seo/page.tsx:120`, `:144-149`) | Kendi küçük audit listeleri + rollback; ana denetim sayfasında olmayan geri alma burada. | Gömülü paneller kalabilir (bağlamsal fayda) ama aynı detay/diff bileşenini kullansın ve "Tüm geçmiş →" ile `/admin/audit?entity=settings` derin bağlantısı versin; geri alma mantığı ortak `revert` ucunda birleşsin. |
| `/admin/trust-command` "Son denetim olayları (24s)" (`app/admin/trust-command/page.tsx:279-298`), `/admin/platform-pulse` audit akışı (`app/api/admin/platform-pulse/route.ts:58-77`), ana dashboard "Son denetim kayıtları" (`app/admin/admin-dashboard-client.tsx:85`, `:621-644`), `/admin/badges` algoritma geçmişi (`app/api/admin/badges/algorithm/history/route.ts:13`) | Aynı veriyi farklı biçimlerde gösteren 4 mini widget; hepsi ham kod gösteriyor, hiçbiri filtreli bağlantı vermiyor. Dashboard tam `/api/admin/audit` ucunu çağırıp ağır `oldData/newData`'yı gereksiz çekiyor. | Ortak `<AuditFeedCompact>` bileşeni (katalog etiketleri + önem rengi) + hafif özet uç; her widget ilgili filtreyle `/admin/audit`'e bağlansın. |
| `lib/module-controls.ts:67` `audit_logs` | İşlevsiz anahtar. | Katalogdan çıkar veya kilitli/bilgi amaçlı yap. |

**Sonuç:** Sayfa kaldırılmamalı; aksine platformun tek denetim gezgini olarak güçlendirilmeli ve compliance'taki birleşik log gezginiyle birleştirilmelidir. Öncelik sırası: (1) cascade ve sır redaksiyonu (veri bütünlüğü/güvenlik), (2) tarih ve filtre hataları + hata durumu (S efor, hızlı kazanım), (3) detay/diff paneli ve taksonomi, (4) birleştirme ve gelişmiş özellikler.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kod baştan okundu (salt okunur; DB, build, test çalıştırılmadı).

### 1. Kullanıcı silme denetim kayıtlarını cascade ile siliyor — **DOĞRULANDI (Kritik kalır)**
- `prisma/schema.prisma:1108` `userId String` (zorunlu) + `:1118` `onDelete: Cascade`. `AuditLog.userId` her yazıcıda **aktörü** tutuyor (ör. `app/api/admin/users/route.ts:683`, `app/api/admin/users/bulk/route.ts:85`).
- Silme yolları: `app/api/admin/users/route.ts:676` (yalnız kendini silme engelli, `:662`), `app/api/admin/users/bulk/route.ts:79` (yalnız kendini filtreler, `:76`) ve iddiada **olmayan** üçüncü yol `app/api/user/delete-account/route.ts:17,39` — `requireAuth(['CUSTOMER','DEALER','ADMIN'])` ile bir ADMIN **kendi hesabını** silebiliyor ve bu yol hiç audit kaydı yazmıyor.
- Yeniden üretim: ADMIN-A, ADMIN-B hesabıyla ayar/rol/puan değişiklikleri yapar → ADMIN-A `DELETE /api/admin/users?id=B` çağırır → B'nin tüm `AuditLog` satırları cascade ile gider; geriye yalnız A adına "delete user B" kaydı kalır (değişikliklerin içeriği kaybolur). Daha kötüsü: B kendi oturumunda `/api/user/delete-account` çağırırsa **hiç iz kalmaz**.
- KVKK notu: `data_subject_request` kaydı (`app/api/customer/privacy-request/route.ts:65-72`) talep eden müşteriyi aktör olarak yazar; müşteri silinince bu kanıt da gider. (`DataSubjectRequest` tablosunun kendisi `onDelete: SetNull` ile korunuyor, `prisma/schema.prisma:2816`; kaybolan yalnız audit izi.) `gdpr_anonymize` kullanıcıyı silmediği için etkilenmez (`lib/gdpr-core.ts:162`).
- Öneri raporda yazıldığı gibi geçerli: `userId` nullable + `onDelete: SetNull` + aktör anlık görüntüsü (`actorEmail/actorRole`); ek olarak `delete-account` ADMIN için kapatılmalı veya audit yazmalı.

### 2. Gizli değerler audit oldData/newData'ya düz metin yazılıyor — **DOĞRULANDI (şiddet Yüksek → Orta'ya düşürülmeli)**
- Mekanizma gerçek: `settings-client.tsx:555-559` tüm ayar nesnesini (`openaiApiKey` dahil, `:93`, `:1738`) `POST /api/admin/settings`'e gönderiyor; `route.ts:236` `oldMap`, `:263` `newMap` maskesiz `auditLog.create` (`:270-279`). Her "Kaydet"te anahtar hem eski hem yeni değer olarak yeni bir satıra kopyalanır; anahtar değiştirilse bile eskisi audit'te süresiz kalır. `GET /api/admin/audit` `include` ile tüm skalerleri döndürüyor (`route.ts:35-43`); dashboard `pageSize=8` ile çağırıyor (`admin-dashboard-client.tsx:85`).
- Şiddeti düşüren bulgular: (a) `openaiApiKey` sunucuda **hiçbir yerde okunmuyor** — AI motoru `process.env.OPENAI_API_KEY` kullanıyor (`lib/ai-engine.ts:75`); alan ölü bir ayar, gerçek anahtar ancak admin oraya yapıştırırsa (placeholder `sk-...` bunu davet ediyor) sızar. (b) Aynı düz metin zaten `GET /api/admin/settings` (`route.ts:61-66`, maskesiz `value`) ile aynı kitleye (ADMIN rolü) dönüyor; yani "gate'i bilmeyen ADMIN erişir" iddiası audit'e özgü değil — gate cevabının kendisi bile `GET /api/admin/settings/admin-gate` (`admin-gate/route.ts:20,26`) ile her ADMIN'e dönüyor. Audit'e özgü ek risk: rotasyon sonrası kalıcılık + yedeklere çoğalma.
- Öneri: ölü `openaiApiKey` alanını UI'dan kaldırmak (veya sunucu tarafında şifreli saklayıp yalnız "ayarlı/ayarsız" döndürmek), `SECRET_SETTING_KEYS` listesiyle settings GET/PUT/POST ve audit yazımında redaksiyon, mevcut audit satırlarında tek seferlik temizlik.

### 3. Bitiş tarihi filtresi seçilen günü dışlıyor — **DOĞRULANDI (Yüksek)**
- `page.tsx:118` `<input type="date">` → `"YYYY-MM-DD"`; `app/api/admin/audit/route.ts:30-31` `new Date("2026-10-08")` = `2026-10-08T00:00:00Z` (= TR 03:00). `lte` bu ana kadar sınırlar.
- Yeniden üretim: Başlangıç=Bitiş=bugün seç → sorgu `createdAt >= 00:00Z AND createdAt <= 00:00Z` → yalnız tam UTC gece yarısındaki kayıt eşleşir, pratikte "Kayıt bulunamadı." Bitiş=dün seçildiğinde dünün TR 03:00 sonrası tüm kayıtları görünmez. Başlangıç tarafı da TR 00:00-03:00 arasını kaçırır (simetrik saat dilimi kayması).
- Ek küçük hata: "Uygula" (`page.tsx:121`) `setPage(1)` ardından aynı closure'da `fetchLogs()` çağırıyor; sayfa ≠ 1 iken ilk istek eski sayfa numarasıyla gider, ardından `useEffect` ikinci istek atar (yarış; son yanıt kazanır).
- Öneri: istemci TR gün sınırlarını ISO'ya çevirip `to` için `lt (bitiş günü + 1)` göndermeli; sunucu zod ile tarih doğrulamalı.

### 4. Entity/Action filtreleri kayıtların önemli kısmını kaçırıyor — **DOĞRULANDI (Yüksek)**
- `page.tsx:91-93` sabit `settings/user/PhysicalCard`, `:105-108` sabit `create/update/delete/rollback`; sunucu tam eşitlik (`route.ts:25-26`, `mode: 'insensitive'` yok).
- Kodda 31 farklı sabit `entity` değeri sayıldı (grep `entity: '...'`): `'User'` 8 yazıcı vs `'user'` 4; `'Settings'` 6 vs `'settings'` 17. Eylemlerde `BULK_DELETE_USERS`, `DELETE_API_KEY`, `DELETE_FEATURE`, `DELETE_BADGE`, `DELETE_QUEST`, `DELETE_REWARD`, `DELETE_WEBHOOK`, `DELETE_PAGE`, `DELETE_PRICING_PLAN` — hiçbiri "delete" filtresiyle gelmez. Ayarların toplu kaydı `batch_update` (`settings/route.ts:273`) olduğundan "update" filtresi en sık ayar değişikliğini bile kaçırır.
- Yeniden üretim: Entity=`user` seç → `app/api/admin/users/bulk/route.ts:60,85`, `lib/gdpr-core.ts:165`, `app/api/user/profile/route.ts:83` kayıtları listede yok; yönetici "toplu silme olmamış" sonucuna varır (yanlış negatif).
- Öneri: facet ucu (`groupBy entity/action` + sayılar, Redis önbellekli) ile seçenekleri veriden üretmek; kısa vadede `mode: 'insensitive'` ve eylem kataloğu ile kategori bazlı (`delete` → `DELETE_*`, `BULK_DELETE_*`, `delete`) eşleme.

| # | İddia | Karar |
|---|---|---|
| 1 | Cascade ile audit kaybı | Doğrulandı (+ ADMIN öz-silme yolu, iz bırakmaz) |
| 2 | Sırlar audit'te düz metin | Doğrulandı, şiddet Orta (alan ölü; aynı veri settings GET ile zaten açık) |
| 3 | Bitiş tarihi günü dışlıyor | Doğrulandı |
| 4 | Filtreler kayıtları kaçırıyor | Doğrulandı |

---

## Uygulama (Dalga 2)

**Yeni yapı:** sunucu bileşeni `app/admin/audit/page.tsx` (özet + URL'deki süzgeçle ilk sayfa sunucuda) → istemci adası `components/admin/a-denetim/audit-center.tsx` (QDL v2 `PanelPage`/`PageHeader`/`MetricTile`/`DataTable`/`DetailSheet`, ops kaydı, 3B yok, hareket yalnız ds panel geçişleri + azaltılmış hareket). Çekirdek `lib/admin-audit/{catalog,contract,server}.ts`; BFF uçları `defineRoute` ile (ADMIN + yönetici kapısı `requireAuth` içinde, zod, rate limit): `GET /api/admin/audit` (liste), `/api/admin/audit/[id]` (detay), `/facets`, `/summary`, `/export`. Testler: `__tests__/lib/admin-audit.test.ts` (21 test).

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa erişimi | ÇALIŞIYOR | Sayfa ve tüm uçlar `requireAuth(['ADMIN'])` (yönetici kapısı artık `requireAuth` içinde). |
| 2 | API yetkisi | ÇALIŞIYOR | `defineRoute` (rol + zod + `read` rate limit); kapı kontrolü API katmanında da var (B7 sistem genelinde kapanmış). |
| 3 | Yükleniyor iskeleti | ÇALIŞIYOR | Başlık + 4 gösterge + görünüm çipleri + süzgeç kartı + tablo iskeleti. |
| 4 | Başlık | ÇALIŞIYOR | `PageHeader` + eylemler (Canlı izle, Yenile, CSV indir). |
| 5 | Varlık filtresi | ÇALIŞIYOR | Seçenekler son 90 günün gerçek değerlerinden (sayılarıyla, `settings`/`Settings` birleşik); eşleşme büyük/küçük harfe duyarsız; URL'de çoklu değer desteklenir. |
| 6 | Eylem filtresi | ÇALIŞIYOR | Gerçek eylem kodları (facet) + katalog tabanlı Kategori (Silme ve arşiv, Güvenlik, Ekonomi…) ve Önem süzgeci; SQL koşulu sınıflandırmayla birebir (testli). |
| 7 | Başlangıç tarihi | ÇALIŞIYOR | İstanbul günü başlangıcı. |
| 8 | Bitiş tarihi | ÇALIŞIYOR | `lt (bitiş + 1 gün)` İstanbul; aynı gün tüm günü kapsar; ters aralık istemcide uyarı, sunucuda 400. Hazır dönemler: 1 saat / 24 saat / 7 gün / 30 gün. |
| 9 | "Uygula" | KALDIRILDI | Süzgeç değişince URL güncellenir, tek istek atılır (TanStack Query anahtarı + AbortSignal); taslak/uygulanmış ayrımı ve yarış yok. |
| 10 | Filtreleri sıfırla | ÇALIŞIYOR | Etkin süzgeç çipleri (tek tek kaldırılabilir) + "Süzgeçleri temizle". |
| 11 | Aktör filtresi | ÇALIŞIYOR | Gerçek en aktif 30 aktör (facet) + `?aktor=<id>` derin bağlantı; ayrıca Aktör rolü ve Aktör türü (kullanıcı/sistem/zamanlanmış/silinmiş). |
| 12 | Serbest metin arama | ÇALIŞIYOR | Kayıt kimliği, eylem, varlık, aktör e-posta/ad ve anlık görüntü e-postası. |
| 13 | Kayıt sayısı | ÇALIŞIYOR | `tr-TR` biçimli; imleçli sayfalamada ilk sayfada hesaplanır. |
| 14 | Yükleniyor (satır içi) | ÇALIŞIYOR | `DataTable` + `QueryState`. |
| 15 | Boş durum | ÇALIŞIYOR | Süzgeçli/süzgeçsiz ayrı metin + "Süzgeçleri temizle". |
| 16 | Hata durumu | ÇALIŞIYOR | Zarf hatası fırlatılır; 401/403/500/ağ ayrı hata durumu + "Tekrar dene"; "kayıt yok" yanılgısı yok. |
| 17 | Tarih sütunu | ÇALIŞIYOR | Göreli zaman + İstanbul tarihi; `title`'da tam tarih. |
| 18 | Aktör sütunu | ÇALIŞIYOR | Ad/e-posta + rol; silinmiş aktör anlık görüntüden "(silinmiş)"; detayda kullanıcı sayfası bağlantısı. |
| 19 | Eylem sütunu | ÇALIŞIYOR | İnsan-okur etiket + kategori ikonu + ham kod; ayrı Önem rozeti (kritik dolgu). |
| 20 | Varlık sütunu | ÇALIŞIYOR | Türkçe varlık adı; detayda hedef bağlantısı (kullanıcı, ayarlar). |
| 21 | Varlık kimliği | ÇALIŞIYOR | Tam değer `title` + detayda kopyala. |
| 22 | Detay / önce-sonra farkı | ÇALIŞIYOR | Sağdan açılan panel (`?kayit=` derin bağlantı, önceki/sonraki gezinme): özet cümle, alan bazlı fark (değişen önce, aynılar katlı), ham JSON + kopyala, ilgili kayıtlar, "bu aktörün/kaydın geçmişi" kısayolları. |
| 23 | IP / User-Agent | ÇALIŞIYOR | Yalnız detayda; IP her zaman maskeli, cihaz özeti (tarayıcı · işletim sistemi). Liste ucu IP/UA/JSON döndürmez. |
| 24 | Sayfalama | ÇALIŞIYOR | İmleçli (keyset) "Daha fazla göster"; ofset ve uygulanmamış süzgeç sızıntısı yok. |
| 25 | "Sayfa X / Y" | KALDIRILDI | İmleçli sayfalamada anlamsız; yerine toplam sayı + "Tüm kayıtlar gösteriliyor (N)". |
| 26 | Sayfa boyutu | ÇALIŞIYOR | 25 / 50 / 100. |
| 27 | Sıralama | ÇALIŞIYOR | En yeni / en eski önce. |
| 28 | URL'de durum | ÇALIŞIYOR | Tüm süzgeçler, sıralama, sayfa boyutu ve açık kayıt URL'de; hazır görünümler (Kritik 24 saat, Silme ve arşiv, Güvenlik, Ekonomi, Ayarlar, Yönetici işlemleri, Silinmiş aktörler). |
| 29 | CSV dışa aktarma | ÇALIŞIYOR | Süzgece uyan tüm kayıtlar (en çok 20.000), UTF-8 BOM, `;`, formül kaçışı, maskeli IP, veri gövdesi YOK; dışa aktarma `AUDIT_EXPORT` olarak denetime yazılır. JSON dışa aktarma bilinçli olarak yok (gövde sızdırmamak için). |
| 30 | Geri alma | ÇALIŞIYOR | Mevcut uçların kabul ettiği kayıtlarda (ayar toplu kaydı / geri alma satırı → `/api/admin/settings/rollback`; SEO ayar kaydı → `/api/admin/seo/rollback`) onaylı "Geri al"; diğer kayıtlarda gösterilmez (tekil ayar kaydını ayar uç yanlış yorumladığı için kapsam dışı tutuldu). |
| 31 | Yenile / canlı | ÇALIŞIYOR | "Yenile" + "Canlı izle" (30 sn), yeni kayıtlar vurgulanır ve ekran okuyucuya duyurulur. |
| 32 | i18n | ÇALIŞIYOR (TR) | Tüm metin tam Türkçe; karışık İngilizce başlıklar kaldırıldı. Bu yüzeyde EN anahtar seti yok (diğer Dalga 2 admin yüzeyleriyle aynı düzen). |
| 33 | Mobil | ÇALIŞIYOR | Ek `p-6` yok; dar ekranda `DataTable` kart görünümü, süzgeçler katlanır ("Süzgeçler (n)"), ≥44px dokunma hedefleri, detay alttan tam genişlik. |
| 34 | `audit_logs` modül anahtarı | AÇIK (sahiplik dışı) | `lib/module-controls.ts` modül yüzeyinin; anahtarı kaldırmak/kilitlemek geriye uyumlu-eklemeli bir değişiklik değil. |
| 35 | Silinen kullanıcının izi | ÇALIŞIYOR | Şema dalgası: `userId` nullable + `SetNull` + `actorSnapshot`. Sayfa silinmiş aktörü anlık görüntüden gösterir; anlık görüntü yazılmamış eski satırlarda dürüst "kimlik bilinmiyor" notu; "Silinmiş aktörlü kayıt" göstergesi + süzgeci. |
| 36 | Saklama politikası | AÇIK | Temizlik cron'u ortak dosya ve görev ödülü tekrar koruması denetime dayanıyor; sayfada en eski kayıt tarihi gösterilir. |
| 37 | API girdi doğrulaması | ÇALIŞIYOR | zod: `limit` 10–100, geçersiz tarih/enum/kimlik 400, ters aralık 400, bozuk imleç ilk sayfaya düşer. |

### Kapanan bulgular

- **B1 (cascade):** şema dalgasında kapandı; sayfa anlık görüntüyü okur ve silinmiş aktörü işaretler.
- **B2 (gizli değerler):** okuma tarafı kapandı. Liste ucu gövde döndürmez; detayda gizli anahtarlar (şifre, secret, API anahtarı, token, yönetici kapısı cevabı vb.) ve gizli tekil ayarın tamamı maskelenir (değişip değişmediği yine görünür); IP maskeli; CSV gövdesiz. Yazma tarafı redaksiyonu ve eski satır temizliği kalan iş.
- **B3 (filtre/gerçek veri):** kapandı (facet + duyarsız eşleşme + kategori/önem).
- **B4 (bitiş tarihi):** kapandı.
- **B5 (hata/yarış):** kapandı.
- **B6 (detay/diff):** kapandı.
- **B7 (kapı API'de yok):** sistem genelinde `requireAuth` ile kapanmış; yeni uçlar bunu kullanır.
- **B9 (performans):** liste ucu yalnız özet alanlar, imleçli, toplam yalnız ilk sayfada, facet'ler 5 dk önbellekli. Bileşik indeks / saklama kalan iş.
- **B10 (a11y/i18n):** kapandı (etiket↔kontrol, `caption`/`scope`, canlı bölge, Türkçe metin).
- **B12 (iskelet):** kapandı.

### Kalanlar

- **B8 (taksonomi/atomiklik):** 58 dosyadaki doğrudan `auditLog.create` çağrılarının ortak yazıcıya taşınması başka yüzeylerin dosyalarında. Okuma tarafındaki katalog farklı yazımları birleştirdiği için gezgin buna bağlı değil.
- **B11:** `audit_logs` modül anahtarı (`lib/module-controls.ts`, modül yüzeyi).
- Saklama politikası + bileşik indeksler `(entity, createdAt)`, `(userId, createdAt)`: ŞEMA İSTEĞİ / cron sahibi.
- Ayar yazma uçlarında gizli değer redaksiyonu ve mevcut satırların tek seferlik temizliği (ayarlar yüzeyi + onaylı DB işi).
- `/admin/compliance` gezgini ile birleştirme ve diğer widget'ların filtreli derin bağlantı vermesi. Bağlantı biçimi hazır: `/admin/audit?aktor=<id>`, `?varlik=<entity>&q=<id>`, `?onem=critical&donem=24s`, `?kayit=<id>`.

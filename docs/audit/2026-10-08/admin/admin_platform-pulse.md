# /admin/platform-pulse

**Amaç:** Platform operatörüne son 24 saat ve son 7 günün hacimlerini (denetim kaydı, geri bildirim, tüketim, yeni kullanıcı), 7 günlük UTC günlük trend grafiğini, son 24 saatin denetim varlık (entity) dağılımını ve son 18 denetim kaydını tek ekranda gösteren "operasyon nabzı" panosu; CSV dışa aktarımı ve ilgili sayfalara hızlı bağlantılar içerir.

**Genel puan:** 5.5 / 10 · **Karar:** **koru-iyileştir** (sayfa gerçek veriyle çalışıyor ve sahte içerik yok; ancak "canlı" iddiasını karşılamıyor, metrikler bağlamsız ham sayılar, veri tutarsızlıkları var. `/admin/ecosystem` bu sayfaya katılmalı ve sayfa admin tarafının kanonik "operasyon özeti" olmalı)

Dosyalar:
- `app/admin/platform-pulse/page.tsx` (318 satır, `'use client'`)
- `app/admin/platform-pulse/layout.tsx` (yalnız metadata)
- `app/api/admin/platform-pulse/route.ts` (131 satır, tek GET)
- `components/admin/platform-pulse-daily-trends-chart.tsx` (recharts, `dynamic(..., { ssr:false })`)
- `components/admin/admin-premium-hero.tsx`, `lib/utc-calendar-day-buckets.ts`, `lib/redis.ts`, `lib/api-auth.ts`, `proxy.ts`
- `messages/{tr,en}.json → adminPlatformPulse`, `layoutMetadata.adminPlatformPulse*`
- Prisma modelleri: `AuditLog`, `Feedback`, `Consumption`, `User`

> Özet hüküm: Teknik olarak sağlam, küçük ve dürüst bir sayfa: tüm rakamlar gerçekten veritabanından geliyor, yetki kontrolü var, recharts ayrı chunk'a bölünmüş, Redis'le 60 sn önbelleklenmiş. Ama bir "nabız" panosundan beklenen üç şeyi vermiyor: **(1) değişim** (önceki döneme göre artış/azalış yok, yalnızca mutlak sayı), **(2) canlılık** (başlık "Canlı operasyon / Canlı denetim akışı" diyor ama yenileme butonu, polling veya akış yok; veri 60 sn önbellekten de gelebiliyor), **(3) eyleme dönüş** (hiçbir sayı, çubuk ya da denetim satırı tıklanıp ilgili filtreli listeye gitmiyor). Ayrıca entity dağılımı büyük/küçük harf tutarsızlığı yüzünden aynı varlığı iki ayrı çubuk olarak gösteriyor ve "Son 7 gün" kartları ile "Son 7 gün" grafiği farklı zaman pencerelerini sayıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Tüm metrikler gerçek ve doğru sorgulanıyor; ancak entity bölünmesi, pencere tutarsızlığı, karışık "denetim" tanımı ve yenileme/drill-down eksikliği değeri düşürüyor. |
| UX | 5/10 | Ham sayılar bağlamsız (delta, hedef, eşik yok), hata ile boş durum ayırt edilmiyor, "canlı" vaadi karşılanmıyor, hiçbir öğe eyleme götürmüyor. |
| Görsel | 6/10 | Ortak `AdminPremiumHero` ve shadcn kartlarla tutarlı ve temiz; fakat 7 eşit ağırlıklı StatCard görsel hiyerarşi kurmuyor, 7 günlük bölümde 3 kart / 24 saatte 4 kart asimetrisi var. |
| Mimari | 5/10 | Tek uç + Redis iyi; ama 30 ayrı Prisma sorgusu (yorum "12" diyor), istemci tipi API yanıtıyla senkron değil (`window7dSince` tipte yok, `window24hSince` hiç kullanılmıyor), admin gate API katmanında uygulanmıyor. |
| Performans | 6/10 | recharts lazy, payload küçük, 60 sn cache; cache-miss'te 30 sorgu `connection_limit=5` havuzunda ~6 dalga halinde koşuyor ve `User.createdAt` indeksi yok. |
| Erişilebilirlik + Mobil | 6/10 | `h1`/`h2` hiyerarşisi, `aria-hidden` ikonlar, `<time dateTime>` doğru; mobilde grid düzgün daralıyor. Grafik için metin alternatifi yok, yükleniyor durumu `aria-live` değil, iç içe kaydırma alanı mobilde zayıf. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa rotası rol + gizli kapı koruması | ÇALIŞIYOR | `proxy.ts:59-88` | `/admin` öneki ADMIN rolü + `admin_gate` HMAC cookie ister. |
| 2 | API yetki kontrolü | KISMİ | `app/api/admin/platform-pulse/route.ts:15-16`, `proxy.ts:105-117` | `requireAuth(['ADMIN'])` rolü doğruluyor; ancak `/api/*` yolları gate cookie kontrolünden geçmiyor (bkz. Bulgu 1). |
| 3 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `app/admin/platform-pulse/layout.tsx:4-6` | `layoutMetadata.adminPlatformPulse` anahtarları TR/EN mevcut. |
| 4 | Hero (eyebrow, başlık, açıklama, ikon) | KISMİ | `page.tsx:139-152`, `messages/tr.json → adminPlatformPulse.description` | Metin "Tüm rakamlar veritabanından canlı okunur" diyor; API 60 sn Redis önbelleğinden dönebiliyor (`route.ts:19-22,120`). |
| 5 | "Anlık görüntü" zaman damgası çipi | ÇALIŞIYOR | `page.tsx:145-151` | Önbellekten dönse bile `generatedAt` orijinal üretim anı → dürüst. Göreli zaman ("42 sn önce") yok. |
| 6 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:154-158` | Tam sayfa spinner; iskelet (skeleton) yok, yüklenince büyük layout kayması oluyor; `aria-live`/`role="status"` yok. |
| 7 | Hata durumu | KISMİ | `page.tsx:85-96` | Yalnızca toast + boş durum metni; "Tekrar dene" yok; 401/403/503 ayrımı yok. |
| 8 | Boş durum | KISMİ | `page.tsx:159-160` | Hata ile "veri yok" aynı metni gösteriyor (`adminPlatformPulse.empty`). |
| 9 | CSV indir | ÇALIŞIYOR | `page.tsx:107-137`, `page.tsx:163-168` | BOM + locale'e göre ayraç doğru. `revokeObjectURL` tıklamadan hemen sonra (yarış riski, düşük); formül enjeksiyonu kaçışı yok (düşük risk, değerler uygulama tanımlı). Biçim "anahtar;değer" uzun liste — tablo değil. |
| 10 | 24 sa: Denetim kaydı kartı | ÇALIŞIYOR | `page.tsx:177`, `route.ts:51` | Sayı doğru ama "denetim" hem admin hem müşteri eylemlerini (profil, şifre, görev claim) içeriyor (Bulgu 5). |
| 11 | 24 sa: Geri bildirim kartı | ÇALIŞIYOR | `page.tsx:178`, `route.ts:28-31,52` | `deletedAt: null` filtresi doğru. |
| 12 | 24 sa: Tüketim kartı | ÇALIŞIYOR | `page.tsx:179`, `route.ts:54` | |
| 13 | 24 sa: Yeni kullanıcı kartı | KISMİ | `page.tsx:180`, `route.ts:56` | Tüm rolleri (ADMIN/DEALER/STAFF/CUSTOMER) tek sayıda topluyor; rol kırılımı yok. `User.createdAt` indeksi yok (`prisma/schema.prisma` User `@@index` listesi). |
| 14 | 7 gün: Geri bildirim kartı | ÇALIŞIYOR | `page.tsx:187`, `route.ts:53` | Kayan 7×24 sa penceresi. |
| 15 | 7 gün: Tüketim kartı | ÇALIŞIYOR | `page.tsx:188`, `route.ts:55` | |
| 16 | 7 gün: Yeni kullanıcı kartı | KISMİ | `page.tsx:189`, `route.ts:57` | #13 ile aynı not. |
| 17 | 7 gün: Denetim kaydı kartı | EKSİK | `page.tsx:185-190` vs `176-181`; `route.ts:111-115` | 24 sa'te 4 kart, 7 günde 3 kart — API `audit7d` hesaplamıyor; görsel asimetri. |
| 18 | 7 günlük UTC trend grafiği | KISMİ | `page.tsx:193-210`, `components/admin/platform-pulse-daily-trends-chart.tsx:45-99`, `route.ts:37,78-90` | Gerçek günlük sayımlar; ancak üç seri tek Y ekseninde (ölçek farkı küçük seriyi düzleştirir), pencere 7 kartıyla uyumsuz (Bulgu 3), bugün kısmi gün olarak işaretlenmiyor. |
| 19 | Grafiğin lazy yüklenmesi | ÇALIŞIYOR | `page.tsx:15-19` | recharts ayrı chunk, iskelet placeholder. |
| 20 | Grafik tooltip + legend | ÇALIŞIYOR | `platform-pulse-daily-trends-chart.tsx:63-72` | Tooltip başlığı ham ISO tarih (`YYYY-MM-DD`). |
| 21 | Grafik X ekseni etiketleri | KISMİ | `platform-pulse-daily-trends-chart.tsx:34` | `date.slice(5)` → "10-08"; locale'e göre biçimlenmiyor (TR'de "8 Eki" beklenir). |
| 22 | Denetim entity dağılımı (yatay çubuklar) | KISMİ | `page.tsx:213-243`, `route.ts:71-77` | Ham `entity` ile `groupBy` → `settings`/`Settings`, `User`/`user` ayrı çubuk (Bulgu 2). Ham İngilizce model adları yerelleştirilmiyor. Tıklanamıyor. |
| 23 | Entity dağılımı boş durumu | ÇALIŞIYOR | `page.tsx:219-220` | |
| 24 | "Canlı denetim akışı" listesi (son 18) | KISMİ | `page.tsx:246-292`, `route.ts:58-70` | Canlı değil (tek seferlik fetch); `action`, `entity`, `role` ham enum/string olarak gösteriliyor (ör. `UPDATE_SETTINGS · ADMIN`); `oldData/newData` çekilmiyor (iyi — gizlilik). |
| 25 | Denetim akışı boş durumu | EKSİK | `page.tsx:266` | `recentAudits` boşsa kart gövdesi tamamen boş kalıyor; entity kartındaki gibi bir mesaj yok. |
| 26 | Denetim satırı detay / drill-down | EKSİK | `page.tsx:267-290` | Satır `div`, tıklanamaz; aktör, entityId veya kayıt detayına bağlantı yok. |
| 27 | "Tüm denetim günlüğü" bağlantısı | ÇALIŞIYOR | `page.tsx:255-261` | Filtre taşımıyor; `/admin/audit` zaten URL parametresi okumuyor (`app/admin/audit/page.tsx` içinde `useSearchParams` yok). |
| 28 | Hızlı bağlantı: Ekosistem özeti | ÇALIŞIYOR | `page.tsx:296-301` | Döngüsel: ekosistem sayfası da buraya bağlanıyor (`app/admin/ecosystem/page.tsx:15`), içerik büyük ölçüde aynı. |
| 29 | Hızlı bağlantı: Geri bildirimler | ÇALIŞIYOR | `page.tsx:302-307` | Sidebar ile yinelenen gezinme. |
| 30 | Hızlı bağlantı: Kullanıcılar | ÇALIŞIYOR | `page.tsx:308-313` | Sidebar ile yinelenen gezinme. |
| 31 | Yenile butonu / otomatik yenileme | EKSİK | `page.tsx:79-104` (yalnız mount'ta fetch) | "Canlı" sayfada manuel yenileme bile yok; sayfayı yeniden yüklemek gerekiyor. |
| 32 | Zaman aralığı seçici (24 sa / 7 g / 30 g / özel) | EKSİK | `route.ts:10-11` sabit | Pencereler sunucuda sabit kodlu. |
| 33 | Önceki döneme göre karşılaştırma (delta %) / sparkline | EKSİK | `page.tsx:39-57` (StatCard yalnız `label/value/sub`, `sub` hiç kullanılmıyor) | Nabız panosunun temel öğesi yok. |
| 34 | TR/EN i18n | ÇALIŞIYOR | `messages/tr.json`, `messages/en.json → adminPlatformPulse` | Tüm anahtarlar iki dilde mevcut; veri değerleri (action/entity/role) çevrilmiyor. |
| 35 | Locale'e duyarlı sayı/tarih biçimi | ÇALIŞIYOR | `page.tsx:64-76` | `Intl.NumberFormat` / `Intl.DateTimeFormat`. |
| 36 | Redis önbellek (60 sn) | ÇALIŞIYOR | `route.ts:19-22,120`, `lib/redis.ts:55-74` | Redis yoksa sessizce geçiyor. Önbelleği atlama (`?fresh=1`) seçeneği yok. |
| 37 | DB erişilemezken anlamlı yanıt | ÇALIŞIYOR | `route.ts:122-129` | `responseIfDatabaseUnavailable`; istemci yine de genel hata gösteriyor. |
| 38 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:176,186,212` | `sm:grid-cols-2 xl:grid-cols-4`; denetim listesinde `max-h-[28rem] overflow-y-auto` iç kaydırma mobilde sayfa kaydırmasıyla çakışıyor. |
| 39 | Azaltılmış hareket desteği | ÇALIŞIYOR | `components/admin/admin-premium-hero.tsx:35,73` | Hero `useReducedMotion` ile nefes animasyonunu kapatıyor; sayfada başka animasyon yok (spinner hariç). |
| 40 | Grafik için metin alternatifi / veri tablosu | EKSİK | `platform-pulse-daily-trends-chart.tsx:46-99` | Ekran okuyucu için `aria-label`, `<table>` veya özet yok. |
| 41 | API yanıt sözleşmesi (tip) | KISMİ | `page.tsx:21-37` vs `route.ts:100-119` | `window7dSince` tipte yok, `window24hSince` tipte var ama kullanılmıyor; ortak tip dosyası yok (`EcosystemSummaryPayload` gibi bir `lib/` tipi yok). |

---

## Bulgular

### 1. [YÜKSEK · Güvenlik · sistem geneli] Admin gizli kapısı API katmanında uygulanmıyor
- **Kanıt:** `proxy.ts:105-117` — `/api/*` yolları `authMiddleware`'a hiç girmeden `NextResponse.next()` ile geçiyor; gate kontrolü yalnızca `proxy.ts:79-88`'de sayfa yolları için var. `admin_gate` yalnızca `lib/admin-gate.ts`, `lib/admin-gate-edge.ts`, `proxy.ts`'te geçiyor; `lib/api-auth.ts:52-80` (`requireAuth`) yalnızca rol + token-replay kontrol ediyor.
- **Sorun:** Gizli kapının tasarım amacı ("rolü kazara/kötü niyetle ADMIN yapılan stajyer bile gizli rakamı bilmeden panele giremez", `proxy.ts:76-78`) API seviyesinde geçersiz. Gate'i geçmemiş bir ADMIN oturumu `GET /api/admin/platform-pulse` ile denetim akışındaki kullanıcı e-postalarını, rollerini ve entity ID'lerini doğrudan alabiliyor; aynı durum tüm `/api/admin/*` uçları için geçerli (yazma uçları dahil).
- **Öneri:** Gate doğrulamasını `requireAuth` içine "ADMIN rolü istendiğinde gate cookie'sini de doğrula" kuralı olarak ekleyin (Node runtime'da `lib/admin-gate.ts` ile HMAC doğrulaması), ya da `proxy.ts`'te `/api/admin/` öneki için gate kontrolünü edge'de yapıp 403 JSON dönün. İkincisi tek noktadan kapsar; birincisi derinlemesine savunma sağlar — ikisi birlikte önerilir. Gate'ten muaf olması gereken uçlar (gate'in kendi doğrulama ucu) açık bir allowlist ile tutulmalı.
- **Efor:** M

### 2. [ORTA · Veri doğruluğu] Entity dağılımı büyük/küçük harf farkı yüzünden aynı varlığı bölüyor
- **Kanıt:** `route.ts:71-77` ham `entity` ile `groupBy`; kod tabanında audit yazımları karışık: `entity: 'settings'` (17 yer) ve `entity: 'Settings'` (6 yer), `entity: 'User'` (8) ve `entity: 'user'` (4); ayrıca `company_task`, `admin_team_member` gibi snake_case değerler PascalCase olanlarla karışık.
- **Sorun:** "En çok dokunulan varlıklar" sıralaması yanlış: "Ayarlar" iki ayrı çubuğa bölündüğü için gerçekte en çok değişen alan ilk sırada görünmeyebilir; `take: 10` sınırı bölünmüş satırlar yüzünden gerçek ilk 10'u dışarıda bırakabilir.
- **Öneri:** Kısa vadede API'de `entity`'yi normalize ederek (ör. `lower()` + snake/Pascal eşleme tablosu) `$queryRaw` ile gruplayın. Doğru çözüm: `lib/audit.ts` benzeri tek bir `AuditEntity` sabit sözlüğü (TS `as const` + Zod) tanımlayıp tüm `auditLog.create` çağrılarını buna bağlamak; mevcut satırları tek seferlik bir veri migrasyonuyla normalize etmek (canlı Neon'da, yedek alındıktan sonra). Aynı sözlük UI'da yerelleştirilmiş etiket ("Ayarlar", "Kullanıcı") ve ikon sağlar. Bu düzeltme `/admin/audit` filtre sorunlarını da çözer.
- **Efor:** M

### 3. [ORTA · Veri tutarlılığı] "Son 7 gün" kartları ile "Son 7 gün" grafiği farklı pencereleri sayıyor
- **Kanıt:** Kartlar kayan pencere: `route.ts:26` `since7d = now - 7×24h`. Grafik UTC takvim günleri: `route.ts:37` + `lib/utc-calendar-day-buckets.ts:7-22` → bugünün kısmi günü + önceki 6 tam gün.
- **Sorun:** Grafikteki 7 noktanın toplamı 7 günlük karttaki sayıyla eşleşmiyor (grafik ~6.x gün, kart tam 7 gün kapsıyor; ayrıca TR saatiyle gün sınırı 03:00). Ayrıca bugünün noktası kısmi gün olduğu için grafiğin son noktası her zaman "düşüş" gibi görünür — operatör için yanıltıcı bir sinyal.
- **Öneri:** Tek bir zaman modeli seçin: ya kartlar da "son 7 takvim günü" olur ve tooltip/başlıkta açıkça yazılır, ya da grafik 24 saatlik kayan dilimlerle çizilir. Bugünün noktası kesikli çizgi / farklı nokta stiliyle "kısmi gün" olarak işaretlenmeli. Gün sınırı için yönetici saat dilimi (`Europe/Istanbul`) seçeneği sunulmalı; API `tz` parametresi alıp `date_trunc('day', created_at AT TIME ZONE $tz)` ile gruplamalı.
- **Efor:** S

### 4. [ORTA · UX / Ürün] "Canlı" vaadi karşılanmıyor: yenileme, polling veya akış yok
- **Kanıt:** Fetch yalnızca mount'ta: `page.tsx:79-104`. Başlıklar: `adminPlatformPulse.eyebrow = "Canlı operasyon"`, `recentAudit = "Canlı denetim akışı"`, açıklama "canlı okunur". API 60 sn önbellek: `route.ts:120`.
- **Sorun:** Operatör sayfayı açık bıraktığında veri donuyor; "canlı" etiketi güveni zedeliyor. Yenilemek için tarayıcıyı yenilemek gerekiyor; hata sonrası "tekrar dene" de yok.
- **Öneri:** Veri katmanını SWR/React Query benzeri bir `useAdminPulse()` hook'una taşıyın: `refreshInterval: 60_000` (sekme görünür değilken duraklatılır — `document.visibilityState`), başlıkta "Güncellendi: 42 sn önce · ⟳ Yenile" kontrolü, `?fresh=1` ile Redis'i atlayan manuel yenileme (admin başına rate-limit). Denetim akışı için gerçek canlılık isteniyorsa `GET /api/admin/audit/stream?after=<cursor>` ile artımlı (yalnızca yeni kayıtları getiren) polling yeterli; SSE gereksiz karmaşa. Yeni gelen satırlar üstte kısa bir vurgu (framer-motion `layout` + 600 ms arka plan fade, `prefers-reduced-motion`'da kapalı) ile girmeli.
- **Efor:** M

### 5. [ORTA · Ürün / Bilgi mimarisi] "Denetim kaydı" metriği admin ve son-kullanıcı eylemlerini karıştırıyor
- **Kanıt:** AuditLog yazan yerler arasında `app/api/user/profile`, `app/api/user/password`, `app/api/gamification/quests/[id]/claim`, `app/api/customer/privacy-request`, `app/api/dealer/staff/[id]` var; `route.ts:51,58-77` aktör rolüne göre ayırmıyor (yalnız `user.role` görüntüleniyor, `page.tsx:287-289`).
- **Sorun:** "24 saatte 340 denetim kaydı" sayısı, admin'in yaptığı riskli değişiklikler mi yoksa müşterilerin görev claim'leri mi olduğunu söylemiyor. Bir güvenlik/operasyon panosunda en değerli sinyal (yönetimsel değişiklik hacmi) gürültüde kayboluyor.
- **Öneri:** API'de `auditLog.groupBy({ by: ['entity'] })` yanına aktör rolüne göre kırılım ekleyin (`user: { role }` üzerinden join gerektirdiği için `$queryRaw` ile tek sorgu). UI'da "Yönetimsel değişiklik (ADMIN)" ve "Kullanıcı eylemi" ayrı metrikler olsun; denetim akışına rol filtresi çipleri (Tümü / Admin / Bayi / Müşteri) eklensin. Uzun vadede `AuditLog`'a `actorRole` ve `severity` (info/warn/critical) kolonları eklenip yazım anında doldurulmalı; "kritik" eylemler (rol değişikliği, toplu kullanıcı işlemi, ayar geri alma) pano üstünde ayrı vurgulanmalı.
- **Efor:** M

### 6. [ORTA · UX] Metrikler bağlamsız: delta, karşılaştırma, eşik yok
- **Kanıt:** `StatCard` yalnızca `label/value/sub` alıyor ve `sub` hiçbir çağrıda verilmiyor (`page.tsx:39-57,176-190`). API önceki dönemi hesaplamıyor (`route.ts:39-91`).
- **Sorun:** "Geri bildirim: 42" iyi mi kötü mü? Stripe/PostHog panolarının temel değeri "önceki döneme göre +18%" ve mini sparkline'dır; burada operatör kafasında hesaplamak zorunda. 24 sa ve 7 gün bölümleri aynı metrikleri iki kez tekrar ediyor (7 kartın 6'sı aynı 3 metriğin iki penceresi).
- **Öneri:** Kartları "metrik başına bir kart" modeline indirin: büyük değer (seçili pencere), altta `▲ %18 önceki 24 sa'e göre` (yeşil/kırmızı, ama renk tek kanal olmasın — ok ikonu + metin), sağda 7 noktalı sparkline (günlük seri zaten var; ek SVG, recharts gerekmez). API'ye `prev24h`/`prev7d` sayımları eklenir (aynı sorgularla `gte: since48h, lt: since24h`). Pencere seçimi üstte bir segment kontrolle (24 sa / 7 g / 30 g) yapılır; böylece iki ayrı bölüm tek bölüme iner.
- **Efor:** M

### 7. [ORTA · Performans / Mimari] Cache-miss'te 30 ayrı sorgu; yorum "12" diyor
- **Kanıt:** `route.ts:39-91` — 9 toplu sorgu + `seriesDays.map(...)` içinde gün başına 3 `count` × 7 gün = 21 sorgu → toplam 30. Yorum: `route.ts:18` "12 prisma cagrisi". `User.createdAt` için indeks yok (`prisma/schema.prisma` User modeli yalnız `email`, `role`, `role+points` indeksleri).
- **Sorun:** Bilinen havuz ayarıyla (`connection_limit=5`, Neon pooler) 30 sorgu ~6 dalga halinde sıralanıyor; her dalga Neon fra1 RTT'si kadar ekliyor. Ölçeklendikçe `User` sayımları sıralı tarama yapacak. Yanlış yorum gelecekteki bakımcıyı yanıltıyor.
- **Öneri:** Günlük seriyi tablo başına tek sorguya indirin: `SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') d, count(*) FROM "Feedback" WHERE "deletedAt" IS NULL AND "createdAt" >= $1 GROUP BY 1` (Feedback/Consumption/AuditLog için 3 sorgu; ya da `UNION ALL` ile tek). 24 sa/7 g/önceki dönem sayımları `count(*) FILTER (WHERE ...)` ile aynı sorguya katlanabilir → toplam 4-5 sorgu. `User`'a `@@index([createdAt])` ekleyin (canlı Neon'da migration dikkatle). İleride hacim büyürse günlük ön-agregasyon tablosu (`DailyPlatformStat`, cron ile doldurulan) en temiz yol; mevcut cron altyapısı buna uygun.
- **Efor:** S

### 8. [DÜŞÜK · UX] Hata ve boş durum ayırt edilmiyor; denetim akışının boş durumu yok
- **Kanıt:** Hata yolunda `setData(null)` → `page.tsx:159-160` "Özet için veri bulunamadı." metni. `recentAudits` boşsa `page.tsx:266` hiçbir şey render etmiyor.
- **Sorun:** DB kesintisinde (503) operatör "veri yok" sanıyor; bu bir izleme panosu için yanlış sinyal. Sessiz bir günde denetim kartı boş bir kutu olarak kalıyor.
- **Öneri:** Üç ayrı durum bileşeni: `ErrorState` (neden + "Tekrar dene" butonu + durum kodu, `/admin/observability` bağlantısı), `EmptyState` (pencerede kayıt yok) ve kısmi veri. Denetim akışına "Son 24 saatte denetim kaydı yok" mesajı ekleyin. Yükleniyor durumunu gerçek yerleşimi taklit eden iskeletlerle değiştirin (CLS önler) ve `role="status" aria-live="polite"` verin.
- **Efor:** S

### 9. [DÜŞÜK · UX / i18n] Denetim akışında ham enum ve model adları
- **Kanıt:** `page.tsx:276` `row.action`, `page.tsx:282` `row.entity`, `page.tsx:288` `row.user?.role`; entity çubuklarında `page.tsx:235` `row.entity`.
- **Sorun:** TR arayüzde "UPDATE_SETTINGS · ADMIN", "PhysicalCard", "user_automation_rule" gibi geliştirici dilinde değerler görünüyor — dil karışıklığı ve okunabilirlik kaybı.
- **Öneri:** Bulgu 2'deki entity sözlüğüne ek olarak `AuditAction` sözlüğü ve rol etiketleri (`messages/*.json → auditLabels`) tanımlayın; satır "Furkan **ayarları güncelledi** · Ayarlar · 3 dk önce" gibi insan diliyle bir cümle olarak render edilsin (Linear aktivite akışı modeli). Ham değer tooltip'te ya da detay çekmecesinde kalsın.
- **Efor:** S

### 10. [DÜŞÜK · UX] Hiçbir öğe drill-down yapmıyor
- **Kanıt:** Entity çubukları `div` (`page.tsx:224-238`), denetim satırları `div` (`page.tsx:267-290`), StatCard'lar bağlantısız; "Tüm denetim günlüğü" filtre taşımıyor (`page.tsx:255`) ve `/admin/audit` URL parametrelerini okumuyor.
- **Sorun:** Pano bir sinyal gösterdiğinde operatörün bir sonraki adımı (ilgili kaydı bulmak) manuel filtrelemeye kalıyor.
- **Öneri:** `/admin/audit`'i `useSearchParams` ile `?entity=&action=&from=&actor=` okuyacak hale getirin; entity çubuğu → `/admin/audit?entity=Settings&from=<since24h>`, denetim satırı → sağdan açılan detay çekmecesi (oldData/newData diff, bkz. `admin_audit.md` raporu), "Yeni kullanıcı" kartı → `/admin/users?createdFrom=...`, "Geri bildirim" kartı → `/admin/feedbacks?from=...`.
- **Efor:** M

### 11. [DÜŞÜK · Görsel / Veri görselleştirme] Grafik tek eksende farklı ölçekleri karıştırıyor
- **Kanıt:** `platform-pulse-daily-trends-chart.tsx:56-97` tek `YAxis`; renkler sabit `hsl(199 89% 48%)`, `hsl(280 55% 55%)`; X ekseni `date.slice(5)` (`:34`).
- **Sorun:** Denetim sayısı yüksekse geri bildirim çizgisi tabana yapışır; asıl iş metriği (geri bildirim/tüketim) okunmaz. Ekran okuyucu için alternatif yok. Tarih etiketi yerelleştirilmemiş.
- **Öneri:** Metrik başına küçük çoklu grafik (small multiples, her biri kendi ölçeğinde) ya da iş metrikleri (geri bildirim, tüketim) ile operasyonel metrik (denetim) ayrı panellerde. Etiketler `Intl.DateTimeFormat(locale, { day:'numeric', month:'short' })` ile; bugün kısmi gün olarak işaretli; grafiğin altına görsel olarak gizli (`sr-only`) bir `<table>` ya da "Veri tablosunu göster" geçişi eklenmeli. Seri renkleri tema token'larından (`--chart-1..3`) gelmeli.
- **Efor:** S

### 12. [DÜŞÜK · Mimari] İstemci tipi API ile senkron değil; ölü alanlar
- **Kanıt:** `page.tsx:21-37` `PulsePayload` elle yazılmış; `window24hSince` tipte var ama hiç kullanılmıyor, `window7dSince` (`route.ts:104`) tipte yok. `route.ts:93-98` dailyChunks için `as` cast.
- **Sorun:** Sözleşme sapması sessiz hatalara yol açar (ör. alan adı değişirse sayfa "boş" gösterir, derleme uyarmaz).
- **Öneri:** `lib/admin-platform-pulse-types.ts` içinde ortak tip (veya Zod şeması) tanımlayıp hem route hem sayfa kullansın (ekosistem sayfası `lib/admin-ecosystem-types.ts` ile bunu zaten yapıyor). Pencere sınırlarını UI'da "Pencere: 7 Eki 14:02 → 8 Eki 14:02" olarak gösterin ya da alanları kaldırın.
- **Efor:** S

### 13. [DÜŞÜK · Bilgi mimarisi] Alt hızlı bağlantılar sidebar'ı yineliyor, ekosistem ile döngü
- **Kanıt:** `page.tsx:294-314`; sidebar `components/dashboard/sidebar.tsx:159-165` aynı hedefleri içeriyor; `app/admin/ecosystem/page.tsx:15` buraya geri bağlanıyor.
- **Sorun:** Bilgi değeri sıfır, görsel gürültü; iki sayfa birbirine "daha fazlası orada" diyerek kullanıcıyı döngüye sokuyor.
- **Öneri:** Bağlantıları kaldırıp her metriği kendi drill-down'una bağlayın (Bulgu 10). Ekosistem içeriğini bu sayfaya taşıyın (bkz. Çakışmalar).
- **Efor:** S

### 14. [DÜŞÜK · Erişilebilirlik / Mobil] İç kaydırma alanı ve spinner
- **Kanıt:** `page.tsx:266` `max-h-[28rem] overflow-y-auto`; `page.tsx:155-157` `Loader2 animate-spin` (`motion-reduce:animate-none` yok); kaydırma alanında `tabIndex`/`aria-label` yok.
- **Sorun:** Mobilde sayfa içinde ikinci bir kaydırma bölgesi parmakla kaydırmayı "yakalar"; klavye kullanıcısı kaydırılabilir bölgeye odaklanamaz (Chrome otomatik odaklasa da tutarsız).
- **Öneri:** Mobilde (`< md`) akışı ilk 6 kayıtla sınırlayıp "Daha fazla göster" butonu kullanın, masaüstünde kaydırma alanına `tabIndex={0} role="region" aria-label`. Spinner'a `motion-reduce:animate-none`.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, PostHog, Retool)

1. **Dönem karşılaştırması ve sparkline** — Stripe'ın "vs previous period" deltası; her metrik için yön ve büyüklük. (Bulgu 6)
2. **Zaman aralığı ve saat dilimi seçimi** — 24 sa / 7 g / 30 g / özel; `Europe/Istanbul` gün sınırı. PostHog'da varsayılan.
3. **Otomatik yenileme + "son güncelleme" göstergesi + manuel yenile** — gerçek "canlı" his. (Bulgu 4)
4. **Anomali / eşik uyarıları** — ör. "Geri bildirim 24 saatte 7 günlük ortalamanın %60 altında", "Son 1 saatte 12 rol değişikliği". Basit z-skoru ya da hareketli ortalama sapması API'de hesaplanabilir; Retool/Datadog panolarının temel değeri.
5. **Aktör/rol filtreli, insan dilinde, tıklanabilir aktivite akışı** — Linear'ın aktivite akışı; detay çekmecesi ve diff. (Bulgu 5, 9, 10)
6. **Platformun gerçek iş nabzı metrikleri** — bugün sayılmayanlar: aktif kullanıcı (DAU/WAU), aktif bayi sayısı, puan basımı/harcaması (ekonomi net akışı), AI işleme kuyruğu/başarısızlık, mail gönderim/bounce, cron sağlığı. Bunların çoğu sistemde başka sayfalarda zaten hesaplanıyor (observability, ekonomi, AI dashboard) ve pano bunların özetini göstermeli.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sabah sayfayı açtığında 5 saniyede şu üç soruya cevap alır: *"Platform sağlıklı mı?", "Neler değişti (iyi/kötü)?", "Benim müdahale etmem gereken bir şey var mı?"* Sayfa bir rapor değil, bir **kokpit**: her sayı bağlamlı, her sinyal tıklanabilir, veri kendiliğinden tazelenir.

**Yerleşim (masaüstü, yukarıdan aşağı):**
1. **Kompakt başlık şeridi** (hero yerine; büyük dekoratif hero bu yoğunlukta bir panoda dikey alanı israf ediyor): başlık · pencere segment kontrolü (24 sa / 7 g / 30 g) · saat dilimi · "Güncellendi 32 sn önce" · ⟳ · CSV/JSON dışa aktar menüsü.
2. **Sağlık bandı** (tek satır, 3-5 durum çipi): DB/Redis/AI kuyruğu/cron/mail — `/api/admin/health` ve `/api/admin/system-status` uçlarından özet; kırmızı/sarı çip doğrudan `/admin/observability`'ye götürür.
3. **KPI şeridi** (5-6 kart, metrik başına bir kart): Yeni kullanıcı (rol kırılımı tooltip'te), Aktif kullanıcı, Geri bildirim, Tüketim, Puan net akışı, Yönetimsel değişiklik. Her kartta değer + delta + 7/30 noktalı sparkline; tıklayınca ilgili filtreli liste.
4. **Dikkat gerektirenler** paneli (yalnız sinyal varsa görünür): anomali kuralları ve kritik denetim olayları (rol değişikliği, toplu silme, ayar geri alma).
5. **İki sütun:** sol — small-multiples trend grafikleri (her metrik kendi ölçeğinde, bugün kesikli); sağ — insan dilinde aktivite akışı (rol filtresi çipleri, yeni kayıtlar üstten süzülerek girer, satır → detay çekmecesi).
6. **Ekosistem bölümü** (mevcut `/admin/ecosystem`'dan taşınan): toplam kullanıcı ve rol dağılımı, tek yatay yığılmış çubuk.

**Mobil:** KPI şeridi yatay kaydırılabilir "snap" kartlar; grafikler tek sütun, varsayılan kapalı akordeon; aktivite akışı ilk 6 kayıt + "Daha fazla".

**Motion / 3D (ölçülü):** 3D kesinlikle gereksiz — bu bir yoğun bilgi panosu. Motion yalnızca bilgi taşıdığı yerde: (a) değer değiştiğinde sayının kısa (300 ms) tween'i ve kartın kenarında 1 sn'lik nötr vurgu — "bu az önce değişti" sinyali; (b) aktivite akışına yeni satırın `layout` animasyonuyla girişi; (c) "Canlı" göstergesinde küçük nabız noktası (CSS, 2 sn). Hepsi global `LazyMotion` (`m as Motion`) ile, `useReducedMotion` true iken tamamen kapalı. Hero'daki nefes animasyonu kompakt başlıkla birlikte kalkar.

**Veri / API değişiklikleri:**
- `GET /api/admin/platform-pulse?window=24h|7d|30d&tz=Europe/Istanbul` — tek uç, sorgular `date_trunc` + `count(*) FILTER` ile 4-6 sorguya iner; yanıtta `current`, `previous`, `series`, `anomalies`, `auditByActorRole`, `usersByRole`. Önbellek anahtarı pencere+tz içerir; `?fresh=1` admin başına rate-limit'li bypass.
- `GET /api/admin/audit/stream?after=<createdAt,id>` — artımlı akış (polling 15-30 sn, sekme gizliyken durur).
- Ortak tip/Zod şeması `lib/admin-platform-pulse-types.ts`.
- `AuditEntity` / `AuditAction` sabit sözlüğü + mevcut kayıtların normalizasyonu; ileride `AuditLog.actorRole` ve `severity` kolonları.
- `User @@index([createdAt])`.
- Hacim büyüdüğünde `DailyPlatformStat` ön-agregasyon tablosu (mevcut harici cron altyapısıyla günlük doldurulur; bugün canlı hesaplanır).
- İstemci: `useAdminPulse(window)` hook'u (refreshInterval + visibility pause + hata/yeniden deneme), `KpiCard`, `HealthStrip`, `ActivityFeed`, `TrendSmallMultiples` bileşenleri `components/admin/pulse/` altında.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ecosystem` → bu sayfaya birleştirilmeli.** Ekosistem sayfasının 3 metriğinden 2'si (`feedbacksLast7Days`, `consumptionsLast7Days`, `app/api/admin/ecosystem-summary/route.ts:17-28`) burada zaten var (`route.ts:53,55`); tek özgün içerik rol dağılımı. İki sayfa birbirine bağlanarak döngü oluşturuyor (`page.tsx:296-301` ↔ `app/admin/ecosystem/page.tsx:15`) ve sidebar'da art arda iki ayrı öğe olarak duruyor (`components/dashboard/sidebar.tsx:160-161`). Öneri: rol dağılımını "Ekosistem" bölümü olarak buraya taşıyın, `/admin/ecosystem`'ı `redirect('/admin/platform-pulse#ekosistem')` yapın, sidebar ve `HIZLI_ERISIM` (`app/admin/admin-utils.ts:92-93`) girdilerini tekleştirin. (`admin_ecosystem.md` raporu da aynı sonuca varıyor.)
- **`/admin` (ana pano) ile kısmi çakışma:** ana pano `api/admin/audit?pageSize=8` ile son denetim kayıtlarını ve `analytics?period=30d` ile benzer hacimleri zaten çekiyor (`app/admin/admin-dashboard-client.tsx` fetch listesi). Rol ayrımı netleştirilmeli: `/admin` = kişisel başlangıç ekranı (yapılacaklar, kısayollar, kısa özet), `/admin/platform-pulse` = kanonik operasyonel metrik + aktivite kokpiti. Ana panodaki denetim kartı buraya "tümünü gör" ile bağlanmalı, ikinci bir akış olmamalı.
- **`/admin/observability`:** teknik sağlık (Vercel, web vitals, health) orada kalmalı; bu sayfa yalnızca özet "sağlık bandı" göstermeli ve oraya derinleşmeli — kopyalamamalı.
- **`/admin/audit`:** denetim kayıtlarının kanonik gezgini olarak kalır; bu sayfadaki akış onun "son N + canlı" görünümüdür. Entity/Action sözlüğü iki sayfa arasında paylaşılmalı.
- **`/admin/experience-pulse`:** adı benzer ama tamamen farklı amaçlı (vitrin metni editörü); isim karışıklığı sidebar'da operatörü yanıltabilir — o sayfanın raporu zaten kaldırma öneriyor.

---

## Doğrulama (şüpheci inceleme)

### İddia: "Admin gizli kapısı /api/admin/* uçlarında uygulanmıyor (sistem geneli)" — **DOĞRULANDI**

Çürütme denemesi: proxy'nin `/api` dalında başka bir kontrol var mı, `requireAuth` dolaylı yoldan cookie'ye bakıyor mu, `middleware.ts` ayrı bir katman ekliyor mu, ilgili uç kendi gate kontrolünü yapıyor mu — dördü de kontrol edildi, hiçbiri gate'i uygulamıyor.

- `proxy.ts:105-119`: `pathname.startsWith('/api/')` olduğunda yalnız güvenlik/CORS başlıkları eklenip `NextResponse.next()` dönülüyor; `authMiddleware` (ve içindeki gate kontrolü, `proxy.ts:79-88`) hiç çağrılmıyor. Matcher (`proxy.ts:124`) `/api/:path*`'ı kapsıyor, yani proxy çalışıyor ama bilerek geçiriyor.
- Depoda `middleware.ts` yok; tek ara katman `proxy.ts`.
- `lib/api-auth.ts:52-80` `requireAuth`: oturum + rol + token-replay; `cookies()`/`admin_gate` okuması yok.
- `app/api/admin/platform-pulse/route.ts:15-16` yalnız `requireAuth(['ADMIN'])`; `:58-70` son 18 denetim kaydını `user.email`, `user.name`, `user.role`, `entityId` ile döndürüyor.
- Gate cookie'sini okuyan tek üretim kodu `proxy.ts:81`; yazan tek kod `app/api/admin/gate/route.ts:68`. `lib/admin-gate.ts` içindeki HMAC doğrulayıcısı hiçbir API yolunda çağrılmıyor.

**Yeniden üretim:** Rolü ADMIN yapılmış ama gizli cevabı bilmeyen bir hesapla giriş yapılır. `/admin`'e gidince `/admin-gate`'e yönlendirilir (sayfa koruması çalışıyor). Aynı sekmede konsola `await (await fetch('/api/admin/platform-pulse')).json()` yazılır: 200 döner, denetim akışındaki e-posta/rol/entityId bilgileri gelir. Daha kötüsü, `fetch('/api/admin/settings/admin-gate')` aynı oturumla **gate cevabının kendisini** düz metin döndürür (`app/api/admin/settings/admin-gate/route.ts:19-26`, `answer: gate.answer`). Bu yüzden kapı API üzerinden yalnızca atlanmakla kalmıyor, sayfa tarafında da tek istekle açılabiliyor.

**Önem notu:** Saldırgan zaten ADMIN rolünde bir oturuma sahip olmalı; bu bir rol yükseltme açığı değil, ikinci bir faktörün etkisiz kalması. Gate'in kendi tehdit modeli (`proxy.ts:76-78`) bu senaryoyu hedeflediği için "YÜKSEK" seviyesi yerinde. Bulgu bu sayfaya özgü değil, sistem geneli; tek noktadan düzeltilmeli. Ek gözlem (bu iddianın kapsamı dışında, ayrı raporlarda da geçiyor): `lib/admin-gate-edge.ts:14-21` proxy'de HMAC'i doğrulamıyor, yalnız `<userId>.<64 hex>` biçimine bakıyor. Bu yüzden API'ye gate eklerken edge'deki biçim kontrolü yeterli değil; doğrulama Node tarafında `lib/admin-gate.ts` HMAC'iyle (`requireAuth` içinde, cevap kısa TTL ile Redis'te önbelleklenerek) yapılmalı. `/api/admin/gate` GET/POST açık bir muafiyet listesinde tutulmalı.

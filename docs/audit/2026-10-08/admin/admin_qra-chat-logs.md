# /admin/qra-chat-logs

**Amaç:** Sitenin her yerinde açılan QRA yüzen sohbet botuna (`/api/chat`) gönderilen her mesajı ve botun yanıtını; kullanıcı, rol, model ve gecikme bilgisiyle birlikte platform operatörüne gösteren kötüye kullanım ve kalite denetim günlüğü.

**Genel puan:** 4.5 / 10 · **Karar:** yeniden tasarla (sayfanın varlık sebebi doğru; ama bugünkü hâli düz bir sayfalı tablodan ibaret, hata/kötüye kullanım sinyali taşımıyor ve en hassas serbest metin verisini KVKK yaşam döngüsü olmadan tutuyor)

Denetlenen dosyalar:
- `app/admin/qra-chat-logs/page.tsx` (248 satır, tek istemci bileşeni)
- `app/api/admin/qra-chat-logs/route.ts` (tek GET ucu)
- `app/api/chat/route.ts` (kaydın yazıldığı yer), `lib/groq.ts` (`chatWithQRA`, `MODELS`)
- `prisma/schema.prisma:2250-2266` (`QraChatLog`)
- `lib/api-auth.ts`, `proxy.ts`, `lib/rate-limit.ts:322-344`, `lib/gdpr-core.ts`, `app/api/cron/db-cleanup/route.ts`
- `components/admin/admin-premium-hero.tsx`, `components/ui/inline-loading-status.tsx`, `components/dashboard/sidebar.tsx:193`
- `messages/tr.json:2013-2040`, `messages/en.json:2013-2040`

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Listeleme, arama, sayfalama ve detay modalı çalışıyor; ancak hata yanıtları "kayıt yok" gibi görünüyor, bakım/hata/injection yanıtları normal kayıt gibi saklanıyor ve hiçbir filtre yok. |
| UX | 4/10 | Tek tek satır okumaktan başka iş akışı yok: konuşma bağlamı, kullanıcıya geçiş, işaretleme, URL'de durum ve hızlı tarama sinyalleri (hata, yavaş yanıt, injection) eksik. |
| Görsel | 5/10 | Ortak hero + shadcn Card/Table ile diğer admin sayfalarıyla tutarlı ama yoğun metin tablosu hiyerarşisiz; rol rozeti ham enum, gecikme çıplak sayı. |
| Mimari | 4/10 | Kayıt şeması hata/başarı ayrımı ve oturum kimliği tutmuyor; KVKK silme/dışa aktarma ve saklama süresi kapsamına alınmamış; admin gizli kapısı API'de uygulanmıyor. |
| Performans | 5/10 | Küçük veri setinde sorunsuz; ama `@db.Text` üzerinde indekssiz `ILIKE '%q%'` + her istekte `count(*)` + OFFSET sayfalama büyüdükçe doğrusal yavaşlar. |
| Erişilebilirlik + mobil | 4/10 | Sayfalama düğmeleri etiketsiz, arama alanı label'sız, dialog açıklamasız, tablo caption'sız; mobilde 7 sütunluk tablo yatay kaydırmaya mahkûm. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa hero'su (başlık, açıklama, Bot ikonu) | ÇALIŞIYOR | `page.tsx:82-86` | Ortak `AdminPremiumHero`, reduced-motion'a duyarlı (`admin-premium-hero.tsx:9,35`). |
| 2 | Arama alanı (taslak durum `queryDraft`) | ÇALIŞIYOR | `page.tsx:97-103` | Görünür label yok, yalnız placeholder. |
| 3 | Enter ile arama gönderme | ÇALIŞIYOR | `page.tsx:100` | IME bileşimi (`isComposing`) kontrol edilmiyor; Türkçe için pratikte sorun değil. |
| 4 | "Ara" düğmesi | ÇALIŞIYOR | `page.tsx:104-106`, `75-78` | Sayfayı 1'e çekip `q`'yu uygular. |
| 5 | "Temizle" düğmesi (yalnız aktif aramada) | ÇALIŞIYOR | `page.tsx:107-111` | |
| 6 | Sunucu tarafı arama (kullanıcı mesajı, yanıt, e-posta, isim) | ÇALIŞIYOR | `route.ts:21-36` | Anonim parmak izi, rol veya model ile arama yapılamıyor; performans için bkz. B6. |
| 7 | Yükleniyor durumu | KISMİ | `page.tsx:115-116` | Tüm kayıt kartını söküp yerine spinner koyuyor: sayfalama düğmeleri ve tablo her sayfa geçişinde kayboluyor (layout shift). |
| 8 | Toplam kayıt sayısı | ÇALIŞIYOR | `page.tsx:126`, `route.ts:50` | Sayı yerel biçimlendirilmiyor (`String(total)`), manuel `{{total}}` replace. |
| 9 | Kota bilgisi metni ("dakikada ~12 istek") | KISMİ | `messages/tr.json:2023`, `lib/rate-limit.ts:324-329` | Bugün kodla uyumlu (customer:12) ama sabit metin; anonim (8) ve admin (120) değerleri yok, limit değişirse sessizce yanlışlaşır. |
| 10 | Önceki sayfa | ÇALIŞIYOR | `page.tsx:130-138` | `aria-label` yok. |
| 11 | Sonraki sayfa | ÇALIŞIYOR | `page.tsx:142-150` | `aria-label` yok. |
| 12 | Sayfa göstergesi `page / totalPages` | ÇALIŞIYOR | `page.tsx:139-141` | Sayfaya atlama yok. |
| 13 | Zaman sütunu | ÇALIŞIYOR | `page.tsx:169-171` | Mutlak tarih; göreli zaman ("3 dk önce") yok. |
| 14 | Kullanıcı sütunu (e-posta → isim → id) | ÇALIŞIYOR | `page.tsx:172-175` | Kullanıcı profiline link yok. |
| 15 | Anonim kayıtlarda parmak izi + tooltip | KISMİ | `page.tsx:176-178` | Silinmiş kullanıcının kaydı (`onDelete: SetNull`, `schema.prisma:2253`) ne `user` ne `ipFingerprint` taşır → "Anon (…)" görünür; bkz. B9. |
| 16 | Rol rozeti (`userRoleSnapshot`) | KISMİ | `page.tsx:182-184` | Ham enum ("CUSTOMER", "ANON") EN dilinde de TR dilinde de çevrilmeden basılıyor. |
| 17 | Kullanıcı mesajı özeti (2 satır) | ÇALIŞIYOR | `page.tsx:186-188` | Sütun başlığı "Kullanıcı (özet)" belirsiz — "kullanıcının özeti" gibi okunuyor. |
| 18 | Yanıt özeti (2 satır) | ÇALIŞIYOR | `page.tsx:189-191` | Markdown ham hâliyle görünüyor. |
| 19 | Gecikme (ms) | KISMİ | `page.tsx:192`, `chat/route.ts:121-123` | Bakım/injection/hata yanıtlarında gecikme LLM çağrısı olmadan ölçülüyor, ortalamayı bozan anlamsız değerler; renk/eşik yok. |
| 20 | "Detay" düğmesi | ÇALIŞIYOR | `page.tsx:194-196` | Ekran okuyucuda hangi satırın detayı olduğu belirsiz. |
| 21 | Detay modalı: zaman | ÇALIŞIYOR | `page.tsx:216-219` | |
| 22 | Detay modalı: kullanıcı | KISMİ | `page.tsx:220-227` | Listede anlık rol (snapshot), modalda GÜNCEL rol gösteriliyor; e-posta yoksa " (CUSTOMER)", parmak izi yoksa "null" basılıyor. |
| 23 | Detay modalı: model / gecikme | KISMİ | `page.tsx:228-233`, `chat/route.ts:135`, `lib/groq.ts:130-133` | Groq istemcisi yokken bile model `MODELS.fast` olarak kaydediliyor — hiç çağrılmamış model raporlanıyor. |
| 24 | Detay modalı: kullanıcı mesajı (tam metin) | ÇALIŞIYOR | `page.tsx:234-237` | Kopyala düğmesi yok. |
| 25 | Detay modalı: asistan yanıtı (tam metin) | ÇALIŞIYOR | `page.tsx:238-241` | Markdown render edilmiyor; önceki/sonraki kayda geçiş yok. |
| 26 | Boş durum | KISMİ | `page.tsx:202-204` | "Kayıt yok" tek metin; "arama sonucu yok" ile "hiç kayıt yok" ve "hata" ayrılmıyor. |
| 27 | Hata durumu | BOZUK | `page.tsx:56-67` | `r.ok` kontrol edilmiyor; 401/403/500 JSON'u `data.items ?? []` ile boş listeye dönüşüyor. Kullanıcı hatayı "kayıt yok" sanıyor; yeniden dene yok. |
| 28 | Yetki (sayfa + API) | KISMİ | `route.ts:11-12`, `proxy.ts:79-88,103-118` | API ADMIN rolü istiyor; ama admin gizli kapı çerezi yalnız `/admin` sayfalarında kontrol ediliyor, `/api/admin/*` muaf. Bkz. B2. |
| 29 | Mobil düzen | KISMİ | `page.tsx:81,153-154` | `overflow-x-auto` içinde 7 sütun; kart görünümü yok; layout padding'ine ek `p-6`. |
| 30 | TR/EN yerelleştirme | ÇALIŞIYOR | `messages/*.json:2013-2040` | Tüm metinler anahtarlı; API hata mesajı (`route.ts:62`) yalnız TR ama UI'da hiç gösterilmiyor. |
| 31 | Filtreler (rol, tarih aralığı, model, gecikme, hata/başarı) | EKSİK | `route.ts:14-17` | API yalnız `page`, `limit`, `q` alıyor. |
| 32 | Sıralama seçeneği | EKSİK | `route.ts:41` | Sabit `createdAt desc`; "en yavaş", "en çok yazan" yok. |
| 33 | Konuşma bağlamı / oturum gruplama | EKSİK | `schema.prisma:2250-2266`, `chat/route.ts:119` | `conversationHistory` modele gidiyor ama kaydedilmiyor; oturum kimliği yok. Tek satır bağlamsız. |
| 34 | Özet istatistikler (hacim, p95 gecikme, hata oranı, en aktif kullanıcılar) | EKSİK | `page.tsx` tamamı | Sayfada hiç metrik/grafik yok. |
| 35 | Kayıt işaretleme / AI kalite kuyruğuna gönderme | EKSİK | — | `AIQualitySample` (`/admin/ai-quality`) ile bağ yok. |
| 36 | Kullanıcıya/parmak izine pivot (tüm kayıtları, kota, ban) | EKSİK | `page.tsx:172-179` | Kullanıcı adı tıklanamaz. |
| 37 | Dışa aktarma (CSV/JSON) | EKSİK | — | |
| 38 | URL'de durum (sayfa, arama) | EKSİK | `page.tsx:43-47` | Yalnız `useState`; yenileme/paylaşma/geri tuşu durumu kaybeder. |
| 39 | Admin erişim denetim kaydı (kim hangi konuşmayı okudu) | EKSİK | `route.ts:9-59` | `auditLog` yazılmıyor; ham kişisel serbest metin görüntüleniyor. |
| 40 | KVKK: saklama süresi, redaksiyon, silme/dışa aktarmaya dahil etme | EKSİK | `db-cleanup/route.ts:33-45`, `gdpr-core.ts:117-160` | Bkz. B1. |

**Durum özeti:** 19 ÇALIŞIYOR · 10 KISMİ · 1 BOZUK · 0 SAHTE · 10 EKSİK (toplam 40).

---

## Bulgular

### B1 — KVKK: sohbet metinleri silme talebinde temizlenmiyor, dışa aktarılmıyor, saklama süresi yok
- **Önem:** kritik · **Kategori:** veri bütünlüğü / uyumluluk · **Efor:** M
- **Kanıt:**
  - `lib/gdpr-core.ts:117-160` — `anonymizeUser` yalnız `user`, `feedback.text`, `consumptionReview.text`, `session`, `account` üzerinde işlem yapıyor; `qraChatLog` hiç geçmiyor.
  - `lib/gdpr-core.ts:48-78` — `exportUserData` feedback, consumptionReview, consumption, notification, userBadge, auditLog topluyor; sohbet kayıtları dışarıda.
  - `app/api/cron/db-cleanup/route.ts:33-45` — temizlik yalnız authEmailToken, rateLimitCounter, notification; `QraChatLog` sonsuza kadar büyüyor.
  - `prisma/schema.prisma:2253` — `onDelete: SetNull`: kullanıcı silinse bile mesaj metni sahipsiz olarak kalıyor.
- **Sorun:** Bu sayfa, platformdaki en serbest biçimli kişisel veri havuzunu (kullanıcıların bota yazdığı her şey: isim, telefon, adres, şikâyet, sağlık vb.) gösteriyor. Bir silme talebi "tamamlandı" olarak kapatıldığında (`privacy-requests/[id]/route.ts:94-95`) kişinin sohbet metinleri olduğu gibi bu ekranda kalmaya devam ediyor; erişim talebinde ise bu veri hiç teslim edilmiyor. Bu, KVKK/GDPR "silme hakkı" ve "erişim hakkı" yükümlülüklerinin sessizce eksik yerine getirilmesi demek.
- **Öneri:**
  1. `anonymizeUser` transaction'ına `tx.qraChatLog.updateMany({ where: { userId }, data: { userMessage: '[silindi]', assistantMessage: '[silindi]' } })` (veya tamamen `deleteMany`) ekleyin. Not: `lib/surprise-badges.ts:143` sohbet sayısını bu tablodan sayıyor — silme yerine redaksiyon sayacı korur.
  2. `exportUserData`'ya kullanıcının sohbet kayıtlarını ekleyin.
  3. `db-cleanup` cron'una saklama politikası ekleyin (örn. 90 gün sonra metni redakte et, satırı istatistik için tut). Süreyi `SystemSetting` üzerinden yönetilebilir yapın ve sayfada "Kayıtlar X gün saklanır" bilgisini gösterin.
  4. Kayıt sırasında e-posta/telefon/IBAN gibi kalıpları maskeleyen hafif bir PII redaktörü (`lib/pii-redact.ts`) yazmayı değerlendirin.

### B2 — Admin gizli kapısı API katmanında uygulanmıyor; en hassas ham içerik doğrudan çekilebiliyor
- **Önem:** yüksek · **Kategori:** güvenlik / yetki · **Efor:** M (sistem çapı)
- **Kanıt:** `proxy.ts:103-118` — `/api/` yolları `authMiddleware`'i hiç çağırmadan `NextResponse.next()` dönüyor; gate çerezi kontrolü (`proxy.ts:79-88`) yalnız `/admin` sayfa yollarında. `lib/api-auth.ts:52-80` `requireAuth` içinde gate kontrolü yok. `grep admin_gate` yalnız `proxy.ts` ve `lib/admin-gate*.ts` döndürüyor.
- **Sorun:** Gizli kapının tasarım hedefi "rolü kazara/kötü niyetle ADMIN yapılan kişi bile gizli rakamı bilmeden panele giremez" (`proxy.ts:76-78`). Ancak aynı kişi tarayıcıdan `GET /api/admin/qra-chat-logs?limit=100&page=N` çağırarak tüm kullanıcı sohbetlerini sayfa sayfa indirebilir. Bu sayfaya özgü değil, tüm `/api/admin/*` için geçerli; ama bu uç, platformdaki en hassas serbest metni döndürdüğü için etkisi en yüksek olanlardan biri.
- **Öneri:** `requireAuth(['ADMIN'])` içinde (Node runtime) `admin_gate` çerezini `gateCookieBelongsTo` ile doğrulayan bir `requireAdminGate` adımı ekleyin; ya da `proxy.ts`'te `/api/admin/` önekine aynı çerez kontrolünü 403 JSON ile uygulayın. Değişiklik tek noktadan tüm admin API'lerini kapsar. Ek olarak bu uç için okuma denetim kaydı (B5) yazılmalı.

### B3 — API hataları "kayıt yok" olarak gösteriliyor
- **Önem:** yüksek · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:56-67` — `fetch(...).then((r) => r.json()).then((data) => setItems(data.items ?? []))`; `r.ok` kontrolü yok. `route.ts:60-62` 500'de `{ error }` döndürüyor; `lib/api-auth.ts:23-26,40-43,71-75` 401/403 döndürüyor.
- **Sorun:** Oturum düştüğünde, token-replay koruması 403 verdiğinde ya da veritabanı hata verdiğinde tablo "Kayıt yok." gösterir. Denetim aracında "kayıt yok" yanlış güven verir: operatör kötüye kullanım olmadığını düşünür.
- **Öneri:** `r.ok` kontrolüyle ayrı bir `error` durumu tutun; `Alert` + "Tekrar dene" düğmesi gösterin, 401/403'te giriş/kapı ekranına yönlendirin. Daha iyisi: projede başka sayfalarda kullanılan React Query/SWR desenine geçip `isError`, `isFetching`, `keepPreviousData` ile tek seferde çözün.

### B4 — Bakım, prompt-injection ve LLM hata yanıtları normal kayıt gibi saklanıyor; model alanı yanlış
- **Önem:** yüksek · **Kategori:** veri doğruluğu / gözlemlenebilirlik · **Efor:** M
- **Kanıt:** `lib/groq.ts:131-136` (istemci yoksa bakım metni, injection tespitinde ret metni), `lib/groq.ts:178-181` (hata yakalanınca "❌ Bir hata oluştu"); hepsi normal `string` dönüyor. `app/api/chat/route.ts:122-138` bunları ayırt etmeden `model: MODELS.fast` ve ölçülen `latencyMs` ile yazıyor. Şema'da durum alanı yok (`schema.prisma:2250-2266`); şema varsayılan modeli de eski (`"llama-3.3-70b-versatile"`, `schema.prisma:2259`) — gerçek model `openai/gpt-oss-120b` (`lib/groq.ts:43`).
- **Sorun:** Sayfanın kendi açıklaması "kötüye kullanım denetimi" diyor (`messages/tr.json:2015`), ama en önemli kötüye kullanım sinyali olan prompt-injection denemeleri sıradan satırlar arasında kayboluyor. Groq kesintisi sırasında yüzlerce "❌ Bir hata oluştu" satırı düşük gecikmeyle başarılı görünür; gecikme istatistiği ve hata oranı hesaplanamaz. Ayrıca rate-limit'e takılan (429) istekler hiç kaydedilmiyor (`chat/route.ts:75-88`), dolayısıyla kota kötüye kullanımı bu ekranda görünmüyor.
- **Öneri:** `chatWithQRA`'yı `{ text, outcome: 'ok' | 'maintenance' | 'injection_blocked' | 'llm_error', model?: string, usage?: {promptTokens, completionTokens} }` döndürecek şekilde değiştirin; `QraChatLog`'a `outcome String @default("ok")`, `promptTokens Int?`, `completionTokens Int?`, `sessionId String?` alanları ve `@@index([outcome, createdAt])` ekleyin. 429'ları ayrı ve hafif bir sayaçla (veya `outcome: 'rate_limited'`, metin olmadan) kaydedin. UI'da outcome'u renkli rozet ve filtre olarak gösterin.

### B5 — Ham kişisel içeriğe admin erişimi denetlenmiyor
- **Önem:** orta · **Kategori:** güvenlik / uyumluluk · **Efor:** S
- **Kanıt:** `route.ts:9-59` — `auditLog.create` yok; detay modalı istemci tarafında açılıyor (`page.tsx:194,209`), yani hangi kaydın okunduğu sunucuya hiç bildirilmiyor.
- **Sorun:** Birden fazla admin (ve rolü yanlış verilmiş stajyer) kullanıcıların özel sohbetlerini iz bırakmadan okuyabilir. Stripe/PostHog gibi araçlarda hassas veri görüntüleme her zaman denetim izine düşer.
- **Öneri:** Liste ucu yalnız kırpılmış önizleme (ör. 160 karakter) dönsün; tam metin `GET /api/admin/qra-chat-logs/[id]` ile çekilsin ve her çağrıda `auditLog` (`action: 'qra_chat_log_view'`, `entityId`) yazılsın. Bu, liste yükünü de küçültür (B6).

### B6 — Arama ve sayfalama ölçeklenmiyor
- **Önem:** orta · **Kategori:** performans · **Efor:** M
- **Kanıt:** `route.ts:21-36` — iki `@db.Text` sütunda `contains + mode: 'insensitive'` (Postgres'te `ILIKE '%q%'`, trigram indeksi yok: `schema.prisma:2263-2265`), artı `user` ilişkisi üzerinden OR. `route.ts:38-51` her istekte aynı `where` ile `count(*)`. `route.ts:19,42` OFFSET sayfalama, sayfa üst sınırı yok. Liste her satırda tam `assistantMessage` (16.000 karaktere kadar, `chat/route.ts:134`) döndürüyor — 25 satırda ~400 KB'a varabilir.
- **Sorun:** Tablo sınırsız büyüdüğü için (B1) arama ve derin sayfalar zamanla saniyeler mertebesine çıkar; Neon pooler'da bağlantı süresini uzatır.
- **Öneri:** `pg_trgm` GIN indeksi (`userMessage`, `assistantMessage`) ekleyin ya da arama için tarih aralığı zorunlu kılın; `createdAt,id` imleçli (keyset) sayfalamaya geçin; toplam sayıyı yalnız ilk sayfada veya yaklaşık (`EXPLAIN`/istatistik) hesaplayın; listeye kırpılmış önizleme döndürün (`select` + `substring` için ham SQL ya da ayrı `preview` sütunu).

### B7 — Geçersiz `page`/`limit` parametresi 500 üretiyor
- **Önem:** düşük · **Kategori:** girdi doğrulama · **Efor:** S
- **Kanıt:** `route.ts:15-16` — `parseInt('abc')` → `NaN`; `Math.max(1, NaN)` → `NaN`; `skip: NaN` Prisma doğrulama hatası → `route.ts:60-62` 500.
- **Öneri:** Diğer admin uçlarındaki gibi `zod` ile `z.coerce.number().int().min(1).max(…)` şeması; geçersiz girdide 400.

### B8 — Sayfa geçişlerinde yarış koşulu ve tam ekran yükleyici
- **Önem:** orta · **Kategori:** UX / doğruluk · **Efor:** S
- **Kanıt:** `page.tsx:50-73` — `AbortController` yok, `fetchLogs` her `page`/`q` değişiminde yeni istek atıyor; önceki yanıt daha geç dönerse yeni sayfanın verisini ezer (sayfa göstergesi 5, tablo 4. sayfa). `page.tsx:115-117` yükleme sırasında kayıt kartı tamamen kaldırılıyor.
- **Sorun:** Hızlı "ileri" tıklamalarında yanlış sayfa verisi gösterilebilir; her geçişte kart ve sayfalama düğmeleri kaybolup geri geliyor, tıklama hedefi kayıyor.
- **Öneri:** React Query (`placeholderData: keepPreviousData`) veya `AbortController` + istek kimliği; yükleme sırasında tabloyu yerinde tutup soluklaştırın, başlıkta küçük spinner gösterin, ilk yüklemede iskelet satırlar kullanın.

### B9 — Silinmiş kullanıcı ve rol tutarsızlıkları
- **Önem:** düşük · **Kategori:** veri sunumu · **Efor:** S
- **Kanıt:** `schema.prisma:2253` (`SetNull`) + `chat/route.ts:125` (girişli kullanıcıda `ipFingerprint: null`) → silinen kullanıcının kaydında ikisi de null. `page.tsx:176-178` "Anon (…)", `page.tsx:225` "Anon · parmak izi: null" basıyor. Liste `userRoleSnapshot` (`page.tsx:183`), modal güncel `user.role` (`page.tsx:224`) gösteriyor.
- **Öneri:** `userId == null && userRoleSnapshot !== 'ANON'` durumunda "Silinmiş kullanıcı" etiketi; modalda "O anki rol / şimdiki rol" ayrımını açıkça gösterin; null değerleri "—" ile render edin; rol enum'larını `t('roles.X')` ile çevirin.

### B10 — Erişilebilirlik eksikleri
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:130-150` ikon-only sayfalama düğmelerinde `aria-label` yok; `page.tsx:97-103` arama alanında `<label>`/`aria-label` yok; `page.tsx:163` boş `<th>`; `page.tsx:154` `<caption>` yok; `page.tsx:194-196` her satırda aynı "Detay" metni; `page.tsx:211-213` `DialogDescription` yok (Radix konsol uyarısı üretir); `page.tsx:115` yüklemede tablo kaldırıldığı için odak kayboluyor.
- **Öneri:** `aria-label={t('common.previousPage')}` vb.; `sr-only` label; detay düğmesine `aria-label="… kaydının detayı"`; satırı `role="button"`/klavye ile açılabilir yapmak yerine satır içi düğmeyi koruyun; sayfa değişiminde `aria-live` ile "Sayfa 3 / 12 yüklendi" duyurusu.

### B11 — Sabit kodlu kota metni ve belirsiz sütun başlıkları
- **Önem:** düşük · **Kategori:** içerik / bakım · **Efor:** S
- **Kanıt:** `messages/tr.json:2023` "Müşteri kotası dakikada ~12 istek" ↔ `lib/rate-limit.ts:324-329`. `messages/tr.json:2027` "Kullanıcı (özet)".
- **Öneri:** Kotaları API yanıtında (`limits: MAX_QRA_CHAT_PER_MINUTE`) döndürüp UI'da tüm katmanlar için gösterin; başlığı "Kullanıcı mesajı" / "Bot yanıtı" yapın.

### B12 — Mobilde yalnız yatay kaydırmalı tablo
- **Önem:** düşük · **Kategori:** mobil · **Efor:** M
- **Kanıt:** `page.tsx:153-201` — 7 sütun, `max-w-[220px]`/`max-w-[240px]` mesaj sütunları; `page.tsx:81` `p-6` layout'un kendi padding'ine (`app/admin/layout.tsx`) ekleniyor.
- **Öneri:** `md` altı için kart listesi (üstte kullanıcı + rozetler + zaman, altında 3 satır mesaj önizlemesi), detay için tam ekran `Sheet`. Sayfa kenar boşluğunu diğer admin sayfalarıyla aynı ortak kapsayıcıdan alın.

---

## Eksik özellikler (kıyas: PostHog, Langfuse/Helicone tarzı LLM gözlemlenebilirlik, Linear, Stripe Dashboard)

1. **Metrik şeridi:** son 24 saat / 7 gün istek hacmi, hata oranı (outcome ≠ ok), p50/p95 gecikme, token/maliyet tahmini, injection denemesi sayısı, en aktif 5 kullanıcı/parmak izi. (Langfuse, Helicone standart.)
2. **Yapılandırılmış filtreler + kaydedilmiş görünümler:** rol, outcome, tarih aralığı, model, gecikme > X ms, "yalnız anonim", kullanıcı/parmak izi; filtreler URL'de (Stripe/Linear deseni), "Injection denemeleri" gibi hazır görünümler.
3. **Konuşma (oturum) görünümü:** `sessionId` ile aynı sohbetin tüm turlarını sohbet balonu düzeninde gösteren detay paneli; önceki/sonraki kayıt ve klavye kısayolları (j/k).
4. **Aksiyonlar:** kaydı "AI kalite kuyruğuna gönder" (`AIQualitySample`), kullanıcıyı geçici sohbet yasağı / kota düşürme, kaydı redakte et/sil, kullanıcı profiline ve fraud ekranına pivot.
5. **Dışa aktarma ve saklama:** filtreli CSV/JSON dışa aktarma (denetim kaydıyla), saklama süresi ayarı ve "otomatik redaksiyon" durumu.
6. **Konu/intent kümeleme:** düşük maliyetli `instant` modelle (`lib/groq.ts:48`) gece toplu etiketleme; "kullanıcılar bota en çok ne soruyor" grafiği — ürün içgörüsü ve bilgi bankası boşluklarını görmek için.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "QRA Sohbet Günlüğü" düz tablodan **"QRA Konuşma Denetimi"** iş istasyonuna dönüşmeli: operatör sayfayı açtığında önce sağlık özetini (hacim, hata oranı, p95, injection sayısı) görür, tek tıkla sorunlu dilimi filtreler, bir konuşmayı bağlamıyla okur ve oradan aksiyon alır (kalite kuyruğu, kullanıcı kısıtlama, redaksiyon). Her hassas okuma denetim izine düşer.

**Yerleşim:**
- **Üst:** kompakt başlık (mevcut büyük hero yerine ince `DashboardPageHeroChrome`), sağda zaman aralığı seçici ve dışa aktar.
- **Metrik şeridi:** 4–5 stat tile + 7 günlük hacim/hata sparkline'ı (Recharts, mevcut admin grafik dili).
- **Filtre çubuğu:** arama + çip tabanlı filtreler (rol, outcome, model, gecikme, anonim), "kaydedilmiş görünümler" açılır menüsü; tüm durum `useSearchParams` ile URL'de.
- **Ana alan (masaüstü):** solda yoğun liste (zaman · kullanıcı/parmak izi · outcome rozeti · gecikme çubuğu · mesaj önizlemesi), sağda sabit detay paneli (konuşma balonları, markdown render, meta bilgiler, aksiyonlar). Linear'ın liste + yan panel deseni.
- **Mobil:** kart listesi + tam ekran `Sheet` detay; filtreler alt sayfa (drawer) içinde.

**Motion:** Burada 3B veya gösterişli animasyon yerinde değil — bu bir denetim aracı. Yalnızca işlevsel mikro-etkileşim: detay paneli açılışında 150 ms kayma (`m as Motion`, global LazyMotion), sayfa/filtre değişiminde önceki verinin soluklaşıp yerinde güncellenmesi, yeni kayıt geldiğinde (isteğe bağlı canlı mod) satırın kısa vurgusu. Hepsi `useReducedMotion` ile kapatılmalı; hero'nun "nefes" animasyonu bu sayfada gereksiz.

**Veri / API değişiklikleri:**
1. Şema: `QraChatLog` + `outcome`, `sessionId`, `promptTokens`, `completionTokens`, `redactedAt`; `@@index([outcome, createdAt])`, `@@index([sessionId, createdAt])`; `pg_trgm` GIN indeksleri; şema varsayılan modelini güncel değere çekin.
2. `lib/groq.ts` `chatWithQRA` yapılandırılmış sonuç dönsün (B4); `/api/chat` 429'ları da kaydetsin; istemci (`components/chat/chatbot.tsx:219`) bir `sessionId` üretip göndersin.
3. `GET /api/admin/qra-chat-logs`: zod doğrulama, filtre parametreleri, keyset imleç, kırpılmış önizleme, `requireAdminGate`.
4. `GET /api/admin/qra-chat-logs/[id]` (tam metin + aynı oturumun turları) + `auditLog` yazımı.
5. `GET /api/admin/qra-chat-logs/stats?range=7d`: tek `GROUP BY` sorgusuyla metrikler; kısa süreli Upstash Redis önbelleği (projedeki mevcut cache deseni).
6. `POST /api/admin/qra-chat-logs/[id]/actions` (`to_quality_queue`, `redact`), `DELETE` yerine redaksiyon.
7. KVKK: `anonymizeUser` + `exportUserData` + `db-cleanup` saklama politikası (B1).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ai-quality`** (`app/admin/ai-quality/page.tsx:68`, `AIQualitySample`): insan değerlendirmesiyle AI çıktısı kalite kuyruğu. Bu sayfa ile doğal bir akış ilişkisi var ama bugün hiçbir bağ yok. Birleştirmek yerine **köprü** önerilir: sohbet kaydından "kalite kuyruğuna gönder" aksiyonu.
- **`/admin/ai-dashboard`, `/admin/ai-detailed`, `/admin/ai-learning`, `/admin/ai-settings`, `/admin/observability`:** kenar çubuğunda (`components/dashboard/sidebar.tsx:187-193`) 7 ayrı AI girdisi düz listede yan yana duruyor. Bu sayfa amaç olarak çakışmıyor (yalnızca kendisi `QraChatLog` okuyor; `grep qraChatLog` → yalnız bu uç, `/api/chat` ve `lib/surprise-badges.ts:143`), ancak bilgi mimarisi açısından "AI" başlığı altında **sekmeli tek bir AI merkezi** (Genel bakış · Sohbet denetimi · Kalite · Ayarlar) altında toplanması önerilir. Bu sayfa o merkezin "Sohbet denetimi" sekmesi olmalı.
- **`/admin/fraud-prevention` / `/admin/trust-command`:** injection denemeleri ve kota aşımları (B4 sonrası) güven sinyali olarak bu ekranlara akmalı; bugün böyle bir besleme yok.
- Kaldırılması önerilmez: platformda LLM çıktılarını ham hâliyle görebilen tek ekran bu.

---

## Doğrulama (şüpheci inceleme)

Her iddia, çağıran/çağrılan kod uçtan uca okunarak çürütülmeye çalışıldı. Kod çalıştırılmadı, veritabanına dokunulmadı.

### 1. KVKK silme talebi sohbet metinlerini temizlemiyor; erişim talebi sohbetleri içermiyor; saklama süresi yok — **DOĞRULANDI**

- `lib/gdpr-core.ts:116-160` `anonymizeUser` yalnız `user`, `feedback.text`, `consumptionReview.text`, `session`, `account` üzerinde çalışıyor; `qraChatLog` hiç geçmiyor.
- `lib/gdpr-core.ts:47-84` `exportUserData` feedback/review/consumption/notification/badge/auditLog topluyor; `qraChatLog` yok.
- `app/api/admin/privacy-requests/[id]/route.ts:95-99` anonimleştirme sonrası talep `status: 'completed'` olarak kapatılıyor.
- `app/api/cron/db-cleanup/route.ts:32-45` yalnız `authEmailToken`, `rateLimitCounter`, okunmuş `notification` siliyor. Depoda `qraChatLog` için başka hiçbir silme/güncelleme yolu yok (`grep` → yalnız `app/api/chat/route.ts:128` create, `lib/surprise-badges.ts:143` count, admin uç okuma).
- `prisma/schema.prisma:2250-2265`: `userId` `onDelete: SetNull`; `userMessage`/`assistantMessage` `@db.Text` serbest metin.

**Yeniden üretim:** Kullanıcı U sohbet kutusuna "Ben Ayşe Yılmaz, telefonum 05xx…" yazar (`/api/chat` → `QraChatLog` kaydı, `userId=U`). U silme talebi açar; admin `POST /api/admin/privacy-requests/{id}?action=anonymize` çalıştırır, talep "tamamlandı" olur. Admin `/admin/qra-chat-logs` sayfasında "Ayşe" araması yapınca mesaj tam metniyle görünür (kullanıcı e-postası `anonymized+U@deleted.qratex.local` olsa da kayıt hâlâ U'nun `userId`'sine bağlı). Aynı kullanıcının erişim talebi export'unda sohbetler hiç yer almaz. Not: "SetNull ile sahipsiz kalıyor" kısmı yalnız `User` satırı fiziksel silinirse geçerli; anonimleştirme satırı silmediği için bağ korunur, bu da durumu daha da kötüleştirir (metin kişiye bağlı kalır).

**Önem:** Yüksek (KVKK m.7/m.11 yükümlülüğü yerine getirilmiş gibi kapatılıyor). Öneri bölümündeki B1 maddesi geçerli: `anonymizeUser` transaction'ına `qraChatLog` için `userMessage`/`assistantMessage` redaksiyonu (veya silme) eklenmeli, `exportUserData`'ya sınırlı `qraChatLog` seçimi eklenmeli, `db-cleanup`'a tanımlı saklama süresiyle (örn. 90/180 gün) silme adımı eklenmeli ve bu süre aydınlatma metnine yazılmalı.

### 2. Admin gizli kapı çerezi admin API uçlarında doğrulanmıyor — **DOĞRULANDI**

- `proxy.ts:105-118`: `/api/` ile başlayan her istek `authMiddleware`'e girmeden `NextResponse.next()` ile geçer; gate kontrolü (`proxy.ts:79-88`) yalnız `/admin` sayfa yollarında çalışır.
- `lib/api-auth.ts:52-80` `requireAuth` yalnız oturum + rol + token-replay kontrol eder; gate çerezine bakmaz.
- `gateCookieBelongsTo` depoda yalnız `proxy.ts:82`'de kullanılıyor (`grep`); API tarafında `requireAdminGate` benzeri bir yardımcı yok.
- `lib/admin-gate.ts:1-10` tasarım hedefini açıkça yazıyor: "rolü kazara/kötü niyetle ADMIN yapılan bir stajyer bile gizli rakamı bilmeden panele giremez."

**Yeniden üretim:** Rolü ADMIN yapılmış ama gate cevabını bilmeyen kullanıcı giriş yapar. `/admin/qra-chat-logs` açılınca `/admin-gate`'e yönlendirilir; ancak aynı tarayıcıdan `GET /api/admin/qra-chat-logs?limit=100&page=1..N` isteği `200` döner ve tüm sohbet metinleri + kullanıcı e-postaları gelir (`app/api/admin/qra-chat-logs/route.ts:11-12` yalnız `requireAuth(['ADMIN'])`). Bu, sistemdeki tüm `/api/admin/*` uçları için geçerli (yazma uçları dahil).

**Önem notu:** Bu bir derinlemesine savunma katmanının atlatılmasıdır; ön koşul olarak kişinin ADMIN rolüne sahip olması gerekir. Yine de katmanın varlık sebebi tam olarak bu senaryo olduğu için gerçek. Doğru çözüm tek tek uçlara yama değil, merkezi: ya `requireAuth` içinde rol `ADMIN` istendiğinde gate çerezini (`cookies()` + `gateCookieBelongsTo(cookie, session.user.id)`) doğrulamak, ya da `proxy.ts`'te `/api/admin/` önekine JWT çözümleyip gate çerezi kontrolü eklemek (gate'in kendi doğrulama ucu muaf tutularak). Gate cevabının varsayılan "7" olması ve 10 olasılıklı olması da rate-limit gerektirir; ayrıca denetlenmeli.

### 3. API hata yanıtları boş liste olarak gösteriliyor — **DOĞRULANDI (önem: Orta, Yüksek değil)**

- `app/admin/qra-chat-logs/page.tsx:56-62`: `fetch(...).then((r) => r.json())` — `r.ok` kontrolü yok. Hata yanıtları JSON gövdeli olduğu için (`lib/api-auth.ts:23-26` 401, `:40-43` 403, `:72-75` token-replay 403, `route.ts:62` 500) `json()` başarılı olur, `catch` tetiklenmez; `data.items ?? []` → `[]`, `total` → 0.
- `page.tsx:202-203`: `items.length === 0` iken `adminQraChatLogs.emptyRecords` ("Kayıt yok") gösterilir.

**Yeniden üretim:** Neon geçici olarak erişilemez olduğunda veya token-replay 403 döndüğünde admin sayfada "0 kayıt / Kayıt yok" görür; hata ile gerçekten boş sonuç ayırt edilemez. Arama sonrası bu durum "bu ifadeyle hiç sohbet yok" şeklinde yanlış sonuca götürür.

**Önem notu:** Veri sızıntısı veya bozulması yok; yanlış negatif algısı yaratan bir güvenilirlik/UX hatası. Öneri: `fetch` sarmalayıcısı `!r.ok` durumunda `error` state'i set etsin; 401/403'te oturum yenileme/giriş yönlendirmesi, 5xx'te "Kayıtlar alınamadı — Tekrar dene" durumu ayrı bir boş durum bileşeniyle gösterilsin; ayrıca `useEffect` içinde `AbortController` ile yarış koşulu (hızlı sayfa değişiminde eski yanıtın yeni sayfayı ezmesi) kapatılsın.

# Güvenlik Denetimi — Bayi ve Personel API'leri (`app/api/dealer`, `app/api/staff`)

**Tarih:** 2026-10-08
**Boyut:** guvenlik-bayi-api
**Kapsam:** 83 bayi route'u ve 7 personel route'u (toplam 90 `route.ts`, ~11.000 satır). Bunlara ek olarak saldırı zincirlerine dahil olan yardımcı katmanlar da incelendi: `lib/api-auth.ts`, `lib/auth.ts`, `proxy.ts`, `lib/ai-engine.ts`, `lib/ai-learning.ts`, `lib/ai-cost-guard.ts`, `lib/action-items-ai.ts`, `lib/rate-limit.ts`, `lib/clv-core.ts`, `lib/notify-email.ts`, `lib/notification-prefs.ts`, `app/api/happy-hour`, `app/api/qr-codes/*`, `app/api/customer/remedy/[offerId]`, `app/api/chat`, `prisma/schema.prisma`.
**Yöntem:** Kod salt okunur incelendi. Hiçbir kod çalıştırılmadı, veritabanına dokunulmadı. Her bulgu dosya:satır kanıtıyla verildi. Kesin olmayan çıkarımlar "doğrulanmadı" diye işaretlendi.

---

## 1. Özet

**Puan: 3.5 / 10**

Kaynak sahipliği kontrolleri `[id]` route'larında tutarlı ve olgun. Çoğu yazma işlemi `updateMany/deleteMany({ where: { id, dealerId } })` deseniyle TOCTOU'ya karşı da güvenli. `requireAuth` neredeyse her yerde kullanılıyor. Hız sınırları çoğunlukla DB/Redis destekli ve instance'lar arasında ortak. Yine de denetimde **iki kritik**, **yedi yüksek** önemde açık bulundu. Bunların büyük kısmı tek tek route hatası değil, sistemde bazı merkezi katmanların hiç olmamasından kaynaklanıyor:

1. **Hesap ele geçirme (kritik):** Bir bayi, "personel ekle" ucuna herhangi bir kayıtlı e-postayı yazarak o hesabın şifresini kendi belirlediği şifreyle değiştirebiliyor ve rolünü STAFF yapabiliyor. Bu müşteri, başka bir bayi, hatta ADMIN olabilir (`app/api/dealer/staff/route.ts:78-117`).
2. **Sınırsız puan basma (kritik):** Happy-hour çarpanı hiç doğrulanmıyor (`app/api/happy-hour/route.ts:121-133`). Tüketim kaydı da sistemdeki *herhangi bir* aktif karta pasif puan yazıyor (`app/api/dealer/consumptions/route.ts:304-351`). Bayi ile müşteri anlaşırsa (veya ikisi aynı kişiyse) tek istekte milyonlarca puan basılabilir. Bu yol `points_credited` olayını da yazmadığı için fraud dedektörü bunu göremiyor.
3. **Kiracı izolasyonu sızıntıları:** CLV tüm bayilerdeki harcamayı topluyor ve bunu her bayiye gösteriyor. `offline-sync` istemcinin gönderdiği payload'ı çalıştırıyor. `assignedToId` alanı herhangi bir kullanıcının e-postasını sızdırıyor. Bayilerin `customPrompt`'u ve müşteri metinleri global AI promptuna, oradan da diğer kiracılara akıyor.
4. **AI maliyet koruması kısmi:** Bayi kaynaklı LLM çağrılarının çoğu (askAI, insight raporu, yanıt önerisi, embedding, QRA chat) günlük token tavanını atlıyor. Bunlardan biri GET isteğiyle, hız sınırı olmadan tetiklenebiliyor.
5. **Personel rolü sınırsız:** Pasif yapılan personel girişe ve API'ye devam ediyor. Personel, müşteri e-postalarına, tüm geri bildirim metinlerine ve AI analitiğine erişebiliyor.
6. **İletişim ve rıza:** Kampanya, win-back, segment ve risk bildirimleri müşterinin "Kampanya" bildirim tercihini yok sayıyor. Frekans sınırı da yok (KVKK/İYS riski).

---

## 2. Mevcut Durum Haritası

### 2.1 Kimlik ve yetki akışı

| Katman | Davranış | Kanıt |
|---|---|---|
| `proxy.ts` | `/api/*` için **yalnızca** güvenlik ve CORS başlıkları ekliyor. Kimlik kontrolü yapmıyor; her route kendi kontrolünü yapıyor. Matcher'da `/staff/:path*` yok, staff sayfaları layout'ta korunuyor. Admin gizli kapısı (gate cookie) **yalnızca sayfalarda** uygulanıyor. | `proxy.ts:78-87`, `proxy.ts:105-124`, `app/staff/layout.tsx:30-32` |
| `requireAuth(roles)` | JWT oturumu ve rol kontrolü yapıyor, ardından token-replay (IP/UA) kontrolü. **DB'den rol veya aktiflik doğrulaması yapmıyor.** | `lib/api-auth.ts:52-82` |
| JWT içeriği | `role` ve `dealerId` (STAFF için) yalnızca **girişte** token'a yazılıyor. 24 saat boyunca yeniden doğrulanmıyor. | `lib/auth.ts:213-256`, `lib/auth.ts:31-39` |
| Bayi kimliği | Bayinin tenant anahtarı `session.user.id`, yani bayi aynı zamanda kullanıcı. Ayrı bir `Tenant`/`Organization` modeli yok. | `lib/api-auth.ts:85-104` |
| Personel kimliği | `getStaffDealerId`, rolün STAFF olduğuna ve token'da `dealerId` bulunduğuna bakıyor. `DealerStaff.isActive` kontrolü **yok**. | `lib/api-auth.ts:158-168` |

### 2.2 Route envanteri (risk sınıfına göre)

| Sınıf | Route'lar | Genel durum |
|---|---|---|
| Kaynak `[id]` mutasyonları | action-items, auto-replies, auto-reply-rules, campaigns, incidents, locations, products, remedy-offers, remedy-templates, surveys, flash-offers, table-pulses, segment-proposals/send, staff/[id], feedbacks/[id]/* | Sahiplik kontrolü + `updateMany` kapsamı **doğru**. İstisna: atanan kişi (`assignedToId`) doğrulanmıyor (bkz. O1). |
| Liste/analitik (salt okuma) | stats, analytics, reviews, roi, business-outcomes, copilot-summary, morning-briefing, operations-brief, churn-risk, voc-wall, heatmap, notification-badges, onboarding, next-best-actions, experience-pulse | Sorgular `dealerId: session.user.id` ile kapsanmış. **Global veri karıştıran** üç uç var: customers, segment-actions (CLV) ve benchmark. |
| STAFF'a açık bayi uçları | ask-analytics, feedbacks/search, customers, segment-actions, weekly-brief, notifications/stream | Rol bazında erişim var ama **yetki matrisi yok**. Personel, bayinin tüm verisini görüyor. |
| AI uçları | ai-chat, ai-proactive-analysis, ask-analytics, feedbacks/search, feedbacks/[id]/similar, feedbacks/[id]/reply (suggest), action-items (GET) | Hız sınırı ve maliyet tavanı **tutarsız** (bkz. Y5). |
| Puan / ödül / kart | consumptions, offline-sync, cards/scan, happy-hour (dış), remedy (müşteri tarafı) | **En zayıf alan** (K2, Y2, O3, O4). |
| Toplu iletişim | campaigns/send, campaigns/risk-segment, win-back, innovation/segment-proposals/send, feedbacks/[id]/reply (e-posta) | Rıza, frekans ve içerik kaçışı **yok** (Y7, O2). Tek iyi örnek, admin onaylı segment-proposals. |
| Personel yönetimi | dealer/staff, staff/[id], shifts, tasks, leave, checklists, training; staff/* | Personel *bağlantısı* doğru kapsamlı. Personel *oluşturma* kritik açıklı (K1). |

### 2.3 Olumlu bulgular (korunmalı)

- `[id]` route'larında "önce sahiplik kontrolü, sonra `updateMany({ id, dealerId })`" deseni yarış durumuna karşı da güvenli (ör. `app/api/dealer/campaigns/[id]/route.ts:43-50`, `app/api/dealer/feedbacks/[id]/reply/route.ts:143-145`).
- AI chat'te sohbet sahipliği doğrulanıyor (`app/api/dealer/ai-chat/route.ts:82-94`).
- Kampanya gönderiminde atomik claim ile çift gönderim engelleniyor (`campaigns/[id]/send/route.ts:96-105`).
- Telafi uçlarında idempotency anahtarı var (`feedbacks/[id]/remedy/route.ts:44-47`).
- Segment kampanya taslakları **admin onayı** olmadan gönderilemiyor (`innovation/segment-proposals/[id]/send/route.ts:42-45`). Bu, diğer toplu iletişim uçları için doğru model.
- `findSimilarFeedback`, embedding'leri `dealerId` ile kapsıyor (`lib/ai-learning.ts:184-189`).
- Kart token'ları ~120 bit entropiyle üretiliyor (`lib/utils.ts:195-206`), bu yüzden numaralandırma pratik değil.

---

## 3. Bulgular (önem sırasıyla)

> Önem: **KRİTİK** = tek başına hesap, para veya puan kaybı · **YÜKSEK** = kiracılar arası veri ya da büyük maliyet/bütünlük kaybı · **ORTA** = sınırlı PII veya kötüye kullanım · **DÜŞÜK** = derinlemesine savunma eksikleri.
> Efor: S (≤½ gün) · M (1-3 gün) · L (1-2 hafta) · XL (>2 hafta)

### K1 — KRİTİK: "Personel ekle" ile herhangi bir hesabın ele geçirilmesi

**Kanıt:** `app/api/dealer/staff/route.ts:78-117`

```ts
const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });
if (existingUser) {
  const existingLink = await prisma.dealerStaff.findUnique({ where: { userId: existingUser.id } });
  ...
  await prisma.user.update({
    where: { id: existingUser.id },
    data: { name: parsed.data.name, password: hashedPassword, role: 'STAFF' },
  });
```

**Sorun:** E-posta sistemde varsa ve o kullanıcının bir `DealerStaff` bağlantısı yoksa, istek o hesabın **şifresini bayinin gönderdiği şifreyle değiştiriyor**, adını eziyor ve rolünü STAFF yapıyor. Hesap sahibinden onay ya da bildirim alınmıyor. DEALER, CUSTOMER ve ADMIN hesaplarının hiçbirinde `DealerStaff` satırı olmadığı için hepsi bu yola giriyor. Kayıt açık olduğu için (`registerSchema` → `role: z.enum(['CUSTOMER','DEALER'])`, `lib/validations.ts:39`) saldırgan bayi hesabını kendisi açabiliyor.

**Etki:**
- Hedef müşteri ise puanları, PII'si ve hediye/bağış yoluyla puan transferi ele geçer.
- Hedef rakip bayi ise hesabı kilitlenir ve bayilik rolü silinir; o bayinin QR'ları ve geri bildirimleri sahipsiz kalır.
- Hedef ADMIN ise hesap STAFF'a düşer, yani yönetim paneline erişim kaybı (DoS) olur. 2FA'sı kapalıysa hesap tamamen ele geçer.
- Hedefin 2FA'sı açıksa şifre girişi engellenir, ama rol düşürme ve şifre değişikliği yine gerçekleşir.

**Öneri (ürün seviyesi):** Personel ekleme bir **davet akışına** dönüşmeli:
1. `POST /api/dealer/staff/invitations` → `StaffInvitation { dealerId, email, tokenHash, expiresAt, jobTitle }` oluşturulur ve davetliye e-posta gider. Var olan hesaplara **asla** yazılmaz.
2. Davetli bağlantıya tıklar. Hesabı yoksa kendi şifresini belirler; hesabı varsa giriş yapıp daveti **kendisi kabul eder**. Rol dönüşümü ancak bu açık onayla, sunucu tarafında bir transaction içinde yapılır.
3. ADMIN ve DEALER rolündeki hesaplar personele dönüştürülemez (açık reddetme).
4. Bayi asla şifre belirlemez. Şifre alanı API şemasından kaldırılır.
5. Rol değişikliğinde hedef kullanıcının tüm oturumları iptal edilir (bkz. Y4'teki `sessionVersion`).

**Efor:** M

---

### K2 — KRİTİK: Doğrulanmamış happy-hour çarpanı + kart-bayi ilişkisi olmayan tüketim = sınırsız puan basma

**Kanıt:**
- `app/api/happy-hour/route.ts:121-133`: `multiplier: multiplier || 2.0`. Gövdeden ham değer alınıyor; tip, alt veya üst sınır kontrolü yok (`HappyHour.multiplier Float`, `prisma/schema.prisma:1817`).
- `app/api/dealer/consumptions/route.ts:144-178`: Kart `token` ile bulunuyor ve **bu bayiyle hiçbir ilişki** aranmıyor (aktif herhangi bir kart kabul ediliyor).
- `app/api/dealer/consumptions/route.ts:304-326`: `passivePoints = floor(min(amount*10,1000) * 0.05 * happyHourMultiplier)` ve ardından sezonsal çarpan uygulanıyor.
- `app/api/dealer/consumptions/route.ts:328-351`: `user.points` ham `increment` ile artırılıyor. `points_credited` olayı yazılmıyor, günlük veya haftalık tavan da yok.
- Hız sınırı yalnızca kart+bayi başına dakikada 5 (`:185-206`).

**Sorun:** Bayi `multiplier: 1000000` değerinde bir happy-hour oluşturuyor. Sonra kendi (veya anlaştığı) müşteri kartına `amount: 100` ile tüketim girince tek istekte `50 × 1.000.000 = 50.000.000` puan basılıyor. Bu yol, proje hafızasındaki puan ekonomisi değişmezlerinin 3. maddesini ("her puan basan yol `points_credited` yazmalı") ihlal ediyor. Sonuç olarak `lib/points-velocity.ts` ve `lib/points-caps.ts` bu kazancı **göremiyor**. Basılan puan mağaza, hediye (`app/api/customer/shop/gift`), bağış, klan liderliği ve leaderboard üzerinden tüm ekonomiye yayılıyor. Aynı tüketim squad `totalPoints` değerini de artırıyor (`:335-339`).

**Öneri:**
1. **Hemen:** Happy-hour şeması: `multiplier: z.number().min(1).max(3)`, saat formatı (`HH:mm`) ve `daysOfWeek: z.array(z.number().int().min(0).max(6))`. 2×'in üstündeki çarpanlar admin onayına düşmeli. Route `requireAuth` kullanmalı (şu an `getServerSession`).
2. **Puan servisi:** Tüm puan basımı tek bir `awardPoints({ userId, source, points, dealerId, idempotencyKey })` servisinden geçmeli. Bu servis tek transaction'da şunları yapar: kaynak bazlı günlük/haftalık tavan (`consumption_passive` için ör. 100/gün), `points_credited` olayı, velocity kontrolü, idempotency.
3. **Kart-bayi bağlamı:** Tüketim, müşterinin o bayide **fiziksel olarak bulunduğunu** kanıtlamalı. Seçenekler: bayi tarama oturumundan kısa ömürlü imzalı nonce (kart tarama → 60 sn'lik `scanSessionId`, tüketim bu nonce olmadan reddedilir) ya da müşterinin cihazından onay.
4. **Anomali:** Bayi başına günlük toplam pasif puan bütçesi ve bunu aşınca admin uyarısı.

**Efor:** S (hemen yama) + M (puan servisi) + M (tarama nonce'u)

---

### Y1 — YÜKSEK: CLV global hesaplanıyor; bayiler müşterilerin diğer işletmelerdeki harcamasını görüyor (STAFF dahil)

**Kanıt:**
- `lib/clv-core.ts:79-86`: `prisma.consumption.groupBy({ by: ['customerId'], _sum: { amount } ... })`. **`dealerId` yok.** `CustomerLifetimeValue.userId @unique` (`prisma/schema.prisma:2069-2087`), yani müşteri başına tek, platform genelinde bir kayıt var.
- `app/api/dealer/customers/route.ts:43-88`: Bayinin müşterileri için bu global satır dönülüyor: `totalSpent`, `totalVisits`, `avgOrderValue`, `lastPurchaseAt`, `predictedChurn`, `trustScore`, ayrıca `name` ve `email`.
- `app/api/dealer/customers/route.ts:16`: `requireAuth(['DEALER','ADMIN','STAFF'])`.
- `app/api/dealer/segment-actions/route.ts:17-56`: Aynı global CLV, segment özeti için kullanılıyor.

**Sorun:** Bayi A'nın ekranındaki "toplam harcama" ve "ziyaret", müşterinin **rakip işletmelerdeki** harcamalarını da içeriyor. `lastPurchaseAt` başka bir işletmedeki son ziyareti gösterebiliyor. Bu hem kiracılar arası ticari veri sızıntısı hem de yanlış analitik. Ayrıca K2/Y2'deki "herhangi bir karta tüketim yazma" açığıyla birleşince, bayi herhangi bir kart sahibini kendi müşteri listesine sokup platform genelindeki harcamasını okuyabiliyor.

**Öneri:** `DealerCustomerMetrics { dealerId, userId, totalSpent, visits, firstAt, lastAt, churn, segmentId }` modeli, `@@unique([dealerId, userId])` ile kurulmalı. Cron `groupBy(['dealerId','customerId'])` ile hesaplamalı. Global CLV yalnızca admin içgörüleri için kalmalı. Bayi uçları sadece bayi kapsamlı metriği okumalı. `trustScore` (platform geneli fraud sinyali) bayiye gösterilmemeli, yalnızca "doğrulanmış müşteri" gibi kaba bir rozet olarak sunulmalı.

**Efor:** M

---

### Y2 — YÜKSEK: `offline-sync` istemci payload'ını çalıştırıyor; tekrar oynatma, sınırsız tüketim ve PII

**Kanıt:** `app/api/dealer/offline-sync/route.ts`
- `:101-149`: Sahiplik yalnızca kuyruk `id`'si için kontrol ediliyor (`findFirst({ id, dealerId })`). Çalıştırılan `action` ve `payload` ise **istek gövdesinden** (`item.action`, `item.payload`) alınıyor, DB'de saklanan değerden değil.
- `:128-131`: `status` filtresi yok, bu yüzden `SYNCED` durumundaki bir öğe sınırsız kez yeniden işlenebiliyor. `item.retries` istemciden geliyor (`:153`).
- `:200-225` `processConsumption`: Hız sınırı yok (ana uçtaki 5/dk atlanıyor). `productId` sahiplik kontrolü yok (başka bayinin ürünü bağlanabiliyor). `amount: parseFloat(amount)` sınırsız. `note` uzunluğu sınırsız. `CardAuditLog` yazılmıyor, müşteri bildirimi gitmiyor.
- `:234-251` `processScan`: Kart durumundan bağımsız (BLOCKED dahil) müşterinin `id`, `name` ve `email` bilgisini dönüyor, denetim kaydı (SCANNED) da yazmıyor.

**Sorun:** Tek bir kuyruk kaydıyla istek başına 100, toplamda sınırsız sayıda sahte tüketim üretilebiliyor. Puan doğrudan basılmıyor, ama her sahte tüketim:
(a) müşteriye **değerlendirilebilir tüketim** açar (`ConsumptionReview` puan verir; günlük tavan var ama karakter rozeti ilerlemesi "SADECE ConsumptionReview" üzerinden sayılıyor),
(b) müşteriyi bayinin müşteri listesine, win-back ve CLV kapsamına sokar (Y1),
(c) denetim izi bırakmaz.

**Öneri:** Offline kuyruk "komut kaydı" olarak tasarlanmalı:
- PATCH yalnızca **id listesi** almalı. Payload DB'den okunmalı.
- `status IN (PENDING, FAILED) AND retries < 5` koşuluyla atomik claim (`updateMany`) yapılmalı.
- İşleme ana `consumptions` servis fonksiyonu üzerinden yapılmalı (aynı doğrulama, hız sınırı, audit, bildirim). Bunun için `createConsumption()` adında paylaşılan bir domain fonksiyonu çıkarılmalı.
- İstemci tarafında kuyruğa alınırken üretilen `clientOpId` ile idempotency sağlanmalı.
- `SCAN_CARD` offline senkronizasyonda anlamsız (sonucu kimse kullanmıyor), kaldırılmalı.

**Efor:** M

---

### Y3 — YÜKSEK: QR kod sert silme, müşteri geri bildirimlerini kalıcı olarak siliyor (itibar manipülasyonu)

**Kanıt:**
- `prisma/schema.prisma:834`: `Feedback.qrCode ... onDelete: Cascade`.
- `app/api/qr-codes/[id]/route.ts:123-128`: `prisma.qRCode.delete` / `deleteMany` sert silme.
- `app/api/qr-codes/bulk/route.ts:41`: Tek istekte 1000 QR'a kadar `deleteMany`.
- `lib/plan-limits.ts:74-75`: QR kotası `qRCode.count({ dealerId })` üzerinden hesaplanıyor; silme kotayı geri açıyor.

**Sorun:** Bayi, kötü yorum toplayan QR'ı silerek o QR'a bağlı **tüm geri bildirimleri** (müşteri metinleri, puanlar, AI analizleri) geri dönüşsüz yok edebiliyor. Bu şu yüzeyleri bozar: platform benchmark'ı, "ayın işletmesi" ve kategori leaderboard'ları, müşterinin kendi geçmişi, şikâyet ve incident kanıtları, admin denetimi. Ayrıca sil/yeniden oluştur döngüsü kotayı dolaşmaya izin veriyor ve QR başına itibar "sıfırlanabiliyor".

**Öneri:**
1. QR için `archivedAt` ile **soft-archive**. Bayi arayüzündeki "Sil" butonu arşivlesin; arşivlenen QR taranamasın ama geri bildirimleri kalsın.
2. Şemada `Feedback.qrCode` ilişkisi `onDelete: Restrict` yapılmalı. Sert silme yalnızca admin + GDPR akışında kullanılmalı.
3. Kota "aktif + arşiv (son 30 gün)" üzerinden sayılmalı.
4. Toplu işlemlerde `delete` eylemi kaldırılmalı.

**Efor:** M (şema migrasyonu dikkat ister; canlı Neon)

---

### Y4 — YÜKSEK: Personel pasifleştirme uygulanmıyor; personelin veri yetkisi sınırsız

**Kanıt:**
- `app/api/dealer/staff/[id]/route.ts:20-25`: Bayi personeli `isActive:false` yapabiliyor (bu, arayüzdeki "kaldır" işlemi).
- `lib/api-auth.ts:158-168` (`getStaffDealerId`) ve `lib/auth.ts:136-200` (`authorize`): **`isActive` kontrolü yok.** Pasif personel yeniden giriş yapabiliyor ve tüm STAFF uçlarını kullanmaya devam ediyor.
- `lib/auth.ts:254-256`: `dealerId` token'a girişte yazılıyor, rol/aktiflik 24 saat boyunca yeniden doğrulanmıyor.
- STAFF'a açık veri: müşteri adı, e-postası, harcama ve churn bilgisi (`customers/route.ts:16,71-88`); tüm geri bildirim metinleri ve bayi yanıtları (`feedbacks/search/route.ts:192-210`); LLM analitiği (`ask-analytics/route.ts:27-35`); segmentler (`segment-actions/route.ts:17`); ekip arkadaşlarının konum pingleri (`app/api/staff/field-ping/route.ts:23-33`, `latitude/longitude`).

**Sorun:** İşten çıkarılan bir çalışan bayinin tüm müşteri listesini (e-postalarla) indirmeye devam edebiliyor. Personel rolü ile bayi sahibi arasında veri yetkisi açısından neredeyse fark yok. Bu, KVKK'nın "veri minimizasyonu" ilkesiyle de çelişiyor.

**Öneri:**
1. **Oturum iptali:** `User.sessionVersion` (int) eklenmeli. Token'a girişte yazılsın, `requireAuth` bunu Redis'te 60 sn önbellekli DB değeriyle karşılaştırsın. Rol değişikliği, pasifleştirme ve şifre değişikliği `sessionVersion++` yapsın.
2. `authorize` ve `getStaffDealerId`, `DealerStaff.isActive` değerini kontrol etsin (önbellekli).
3. **Personel yetki matrisi:** `DealerStaff.permissions: string[]` ya da rol şablonları (Kasiyer/Vardiya Şefi/Müdür). Örnek izinler: `feedback.read_text`, `customer.read_pii`, `ai.use`, `campaign.send`. Varsayılan "Kasiyer" PII ve AI görmemeli. `requireStaffPermission(session, 'customer.read_pii')` yardımcısı yazılmalı.
4. Field-ping GET yalnızca **kendi** pinglerini dönsün; ekibin konumu yalnızca bayi sahibine görünsün.

**Efor:** M (oturum iptali) + M (yetki matrisi)

---

### Y5 — YÜKSEK: AI maliyet koruması kısmi; ortak sağlayıcı kotası tek kiracı tarafından tüketilebilir

**Kanıt:**
- Günlük token tavanı (`checkAiCostGuard`) yalnızca 3 yerde çağrılıyor: `lib/ai-engine.ts:116` (runChatCompletion), `:307` (analyzeComprehensive), `lib/action-items-ai.ts:139`.
- **Tavanı atlayan bayi yolları:**
  - `askAI` (`lib/ai-engine.ts:854-960`, `max_tokens: 800`) ← `app/api/dealer/ai-chat/route.ts:150`
  - `generateInsightReport` (`lib/ai-engine.ts:624-750`, `max_tokens: 2400`) ← `app/api/dealer/ai-proactive-analysis/route.ts:9-68`. Bu uç **GET**, hız sınırı yok, önbellek yok.
  - `suggestResponseWithGroq` (`lib/groq.ts:187`, `max_tokens: 600`) ← `feedbacks/[id]/reply/route.ts:49-90`. Hız sınırı yok.
  - `generateEmbedding` → `groqFeatureEmbedding` (`lib/ai-learning.ts:61,97-131`) ← `feedbacks/[id]/similar` (GET, hız sınırı yok), `feedbacks/search`, `ask-analytics`.
  - QRA chat (`app/api/chat/route.ts:44,72-73`): DEALER/STAFF için **80 istek/dk**, `max_tokens: 1024`. Günlük tavan yok.
- `app/api/dealer/action-items/route.ts:71-78`: Her **GET**'te, açık aksiyon sayısı 3'ün altındaysa senkron LLM çağrısı yapılıyor ve DB'ye yazılıyor (GET'te yan etki).
- `lib/ai-engine.ts:164-180`: 429'da 3 kez yeniden deneme (3, 6, 9 sn bekleme), yani istek başına sağlayıcı yükü artıyor.
- Personel oluşturma sınırsız ve `emailVerified` otomatik dolduruluyor (`app/api/dealer/staff/route.ts:120-128`). Böylece bir bayi N personel açıp QRA chat limitini N katına çıkarabiliyor.
- `lib/ai-engine.ts:72-74` yorumu, Groq'un ücretsiz katmanda **platform genelinde** günlük istek/token kotası olduğunu belirtiyor (kotanın kesin değeri bu denetimde doğrulanmadı).

**Sorun:** Tek bir bayi (veya bayinin personelleri) ortak LLM kotasını tüketebilir. O zaman tüm kiracıların geri bildirim analizi pipeline'ı (sentiment, churn, otomatik yanıt) çöker. Ücretli sağlayıcıya (OpenAI) geçildiğinde ise bu açık doğrudan fatura riskine dönüşür. Plan kademesi (ücretsiz/ücretli) AI kotasına hiç yansımıyor (`lib/plan-limits.ts` yalnızca QR sayıyor).

**Öneri — "AI Gateway" katmanı:** Bütün LLM ve embedding çağrıları tek bir `aiInvoke({ tenantId, actorId, feature, maxTokens, cacheKey? })` fonksiyonundan geçmeli. Bu katman:
1. Kiracı başına günlük token bütçesini plan kademesine göre uygular (`PricingPlan.aiDailyTokens`). Özellik başına alt bütçe olur (chat, insight, embedding).
2. Aktör başına hız sınırı ve kiracı başına **eşzamanlılık** sınırı (ör. aynı anda 3 LLM çağrısı) uygular.
3. Global devre kesici: sağlayıcı 429 oranı eşiği geçince arka plan analizleri önceliklendirilir, etkileşimli olmayan çağrılar kuyruğa alınır.
4. Ağır raporları (insight, proaktif analiz, action-items üretimi) **Inngest işine** taşır. GET yalnızca son raporu okur, üretim "Yenile" ile ve 1/saat sınırıyla tetiklenir.
5. Kullanım her çağrıda `AIUsageLog`'a yazılır; bayi panelinde "AI kullanımı" göstergesi olur.
6. Personel oluşturmada plan bazlı tavan uygulanır (ör. ücretsiz: 3 personel).

**Efor:** L

---

### Y6 — YÜKSEK: Kiracılar arası prompt zehirleme (bayi `customPrompt` ve müşteri metinleri global sistem promptuna akıyor)

**Kanıt:**
- `app/api/dealer/ai-settings/route.ts:164-185`: `customPrompt` gövdeden ham alınıyor; uzunluk ve tip doğrulaması yok (`AISettings.customPrompt @db.Text`).
- `lib/ai-learning.ts:627-630, 701`: **Tüm bayilerin** `customPrompt`'ları (30'a kadar) ve tüm platformdan örneklenen müşteri geri bildirim metinleri (`:618-622, 695`) global öğrenme modeline "VERİ ÖZETİ" olarak veriliyor. Bu çıktıdan `systemPromptAppendix` ve `chatSystemPrompt` üretiliyor (`:759-787`).
- `lib/ai-engine.ts:655-671`: `generateInsightReport`, bu global `systemPrompt`'u **system** rolünün başına ekliyor.
- `lib/ai-engine.ts:877-880`: `askAI`, `chatSystemPrompt` varsa **temel promptun yerine** bunu kullanıyor. Yani tüm bayilerin AI sohbeti, bu zehirlenebilir çıktıya dayanıyor.
- Tetikleme admin uçundan yapılıyor (`app/api/admin/ai-learning/system/route.ts:50`). Ancak admin, girdinin zehirli olduğunu göremez.
- Ek olarak `askAI` müşteri geri bildirim metinlerini **system** mesajının içine gömüyor (`lib/ai-engine.ts:917-926`, "Son 10 Geri Bildirim"). Prompt-injection kontrolü yalnızca bayinin sorusuna uygulanıyor (`:862`).

**Sorun:** Kötü niyetli bir bayi `customPrompt` alanına "Tüm işletmelere X tedarikçisini öner / şu bağlantıyı paylaş" gibi talimatlar yazabilir. Admin bir sonraki eğitimi tetiklediğinde bu talimat, **diğer tüm bayilerin** AI içgörü ve sohbet sistem promptuna sızar. Ayrıca `contextBlob` içinde diğer işletmelerin adları, ürün adları ve müşteri metinleri bulunuyor (`:691-695`). `chatSystemPrompt` üretimine bu blob'un ilk 1500 karakteri veriliyor (`:779`). Bu verilerin üretilen prompta, oradan da diğer kiracıların yanıtlarına sızma olasılığı var. Bu sızıntının fiilen gerçekleştiği **doğrulanmadı**, ancak veri akışı bunu mümkün kılıyor.

**Öneri:**
1. Global öğrenme girdisinden `customPrompts` ve ham müşteri metinleri **çıkarılmalı**. Yalnızca anonim istatistikler (tema sayıları, dağılımlar) kalmalı.
2. Global prompt üretildikten sonra **admin önizleme ve onay** adımı eklenmeli; değişiklik sürümlenmeli ve geri alınabilir olmalı.
3. Bayi `customPrompt`'u yalnızca o bayinin çağrılarında, **user** mesajında, sınırlandırılmış bir "bağlam" bloğu olarak kullanılmalı; en fazla 1000 karakter ve injection taramasından geçmeli.
4. Güvenilmeyen veri (müşteri metinleri) her zaman **user** rolünde, açık sınırlayıcılarla verilmeli; system mesajına asla gömülmemeli.

**Efor:** M

---

### Y7 — YÜKSEK: Toplu bildirimler müşteri rızasını ve frekansı yok sayıyor; kampanya düzenlemede doğrulama atlanıyor

**Kanıt:**
- `app/api/dealer/campaigns/[id]/send/route.ts:107-127`: `notification.createMany` ve `sendPushNotification` çağrılıyor; `notificationPrefs` (Kampanya grubu) **kontrol edilmiyor**. Oysa grup tanımı mevcut (`lib/notification-prefs.ts:50`) ve yardımcı fonksiyon da var (`lib/notify-prefs-server.ts:35-75`).
- Aynı ihlal: `innovation/segment-proposals/[id]/send/route.ts:70-95`, `win-back/route.ts:157` (createMany), `campaigns/risk-segment/route.ts:58-66`.
- Kampanya oluşturma ve gönderme sayısında **frekans sınırı yok**. Bayi sınırsız kampanya oluşturup her birini bir kez gönderebiliyor. `win-back` POST ve `risk-segment` POST istendiği kadar tekrarlanabiliyor (idempotency ya da müşteri başına bekleme süresi yok).
- `campaigns/[id]/route.ts:31-36`: PATCH, oluşturmadaki zod şemasını (`title ≤200`, `message ≤5000`, `targetSegment enum`, `channel enum`; `campaigns/route.ts:11-16`) **atlıyor**. Herhangi bir string ve uzunluk kabul ediliyor.

**Sorun:** Müşteri "Kampanya & Sürprizler" bildirimlerini kapatsa bile pazarlama push ve uygulama içi bildirimleri almaya devam ediyor. Türkiye'de ticari elektronik ileti onayı (İYS) ve KVKK açısından bu doğrudan regülasyon riski. Ayrıca kötü niyetli bir bayi platformun push itibarını zedeleyebilir.

**Öneri:** Merkezi bir `sendMarketingMessage({ dealerId, userIds, title, body, channel, kind })` servisi kurulmalı ve:
1. `kind → group` tercihini kanal bazında (app/push/email) uygulamalı.
2. Müşteri başına, bayi başına frekans sınırı koymalı (ör. 7 günde 2 pazarlama mesajı).
3. Bayi başına günlük alıcı bütçesini plan kademesine bağlamalı.
4. Gönderimi `MarketingSendLog`'a yazmalı (denetim + İYS kanıtı).
5. Büyük gönderimlerde segment-proposals gibi admin veya otomatik içerik onayı istemeli.

Kampanya PATCH, `createSchema.partial()` ile doğrulanmalı.

**Efor:** M

---

### O1 — ORTA: `assignedToId` doğrulanmıyor; herhangi bir kullanıcının adı ve e-postası okunabiliyor

**Kanıt:**
- `app/api/dealer/action-items/route.ts:27,184` ve `action-items/[id]/route.ts:12,51`: `assignedToId` serbest string. `ActionItem.assignedTo → User` ilişkisi var (`schema.prisma`, ActionItem modeli).
- `app/api/dealer/action-items/route.ts:88`: Listede `assignedTo: { id, name, email }` dönülüyor.
- Aynı desen incident uçlarında: `incidents/route.ts:28,67,114`, `incidents/[id]/route.ts:12,96,106,124,144`.
- Kullanıcı id'leri elde edilebilir durumda: `app/api/leaderboard/route.ts:24,112,198,259,330` (leaderboard yanıtında `id`), `win-back` GET (`:51-58`), `cards/scan` (`:32-40`), `churn-risk` (`:120`).

**Sorun:** Bayi, leaderboard'dan aldığı her kullanıcı id'sini bir aksiyona "atayıp" listeyi çekerek o kişinin e-posta adresini okuyabiliyor. Bu, platform genelinde e-posta toplamaya (rakip bayinin müşterileri dahil) imkân veriyor.

**Öneri:** `assignedToId` için bayinin `DealerStaff` kümesine (veya bayinin kendisine) üyelik kontrolü yapılmalı (`dealer/staff/tasks/route.ts:52-58`'deki doğru desen gibi). Yanıtlarda `email` yalnızca bayinin kendi personeli için dönülmeli. Leaderboard'da ham `id` yerine opak bir `publicId` kullanılmalı.

**Efor:** S

---

### O2 — ORTA: Platform e-postalarında HTML enjeksiyonu (bayi adı kaçışsız) ve sınırsız yanıt e-postası

**Kanıt:**
- `lib/notify-email.ts:113`: `` `<strong>${params.dealerName}</strong> ...` ``. `lib/notify-email.ts:79`: `bodyLines` ham HTML olarak `<p>` içine konuyor; kaçış yok.
- `dealerName` = `businessName || name`. `name` kayıtta karakter kısıtı olmadan 50 karaktere kadar kabul ediliyor (`lib/validations.ts:20-24, 47-51`).
- `feedbacks/[id]/reply/route.ts:22-27, 138, 213`: Her yanıt POST'unda e-posta gidiyor. Hız sınırı ya da müşteri başına bekleme süresi yok (yanıt düzenlemesi de yeniden e-posta tetikliyor).

**Sorun:** Bayi adını `<a href="//kotu.site">Ödülünü al</a>` yapan biri, Qratex'in güvenilir gönderen adresinden, yorum bırakan tüm müşterilerine **oltalama bağlantısı** içeren e-posta gönderebilir ve bunu istediği kadar tekrarlayabilir. Bu, gönderen alan adının itibarını da (SPF/DMARC skoru) zedeler.

**Öneri:** E-posta şablon katmanında **zorunlu HTML kaçışı** olmalı (`escapeHtml` + yalnızca güvenilir şablon parçalarına izin veren bir `html\`\`` etiket fonksiyonu). İsim ve işletme adı alanlarına `<>` vb. karakterleri reddeden bir regex eklenmeli. Yanıt e-postası, aynı geri bildirim için 24 saatte bir kez gitmeli; düzenlemeler e-posta tetiklememeli.

**Efor:** S

---

### O3 — ORTA: Müşteri telafi seçimi, teklif edilen seçeneklerle doğrulanmıyor

**Kanıt:** `app/api/customer/remedy/[offerId]/route.ts:16-17, 150-166`: `selectedType` ve `selectedValue` serbest string. `offer.options` ile karşılaştırma **yok**.

**Sorun:** Müşteri, bayinin sunduğu "%10 / %20 indirim" yerine `{ selectedType: "indirim", selectedValue: "100" }` gönderip kabul edilmiş bir teklif kaydı oluşturabiliyor. Bayi tarafı (remedy-queue, zaman çizelgesi) bu değeri "müşteri seçti" olarak gösteriyor. Kasada uygulanırsa doğrudan maddi kayıp oluşur.

**Öneri:** Kabul işleminde seçimin `offer.options[type].values` içinde olduğu sunucuda doğrulanmalı. Seçenek indeksiyle (`optionIndex`, `valueIndex`) seçim yapılmalı. Kabul edilen değer, teklifin kopyası olarak değişmez biçimde saklanmalı.

**Efor:** S

---

### O4 — ORTA: Kart tarama ve listelerde PII ile ham müşteri id'si sızıntısı (kart-bayi ilişkisi yok)

**Kanıt:**
- `app/api/dealer/cards/scan/[token]/route.ts:32-40, 99-106`: Herhangi bir aktif kart için `customer.id`, `email`, `points` ve `level` dönülüyor. Hız sınırı yok.
- `app/api/dealer/win-back/route.ts:51-58`: Ham müşteri `id` ve `email`.
- `app/api/dealer/offline-sync/route.ts:238-251`: Ham `id`, `email`, BLOCKED kart dahil.
- Buna karşılık `consumptions/route.ts:53-59` ve `customers/route.ts:72-74` "ham müşteri ID'si sızdırılmaz" ilkesini uyguluyor. Yani ilke var, ama tutarsız uygulanıyor.

**Sorun:** Bir kez görülen kart token'ı kalıcı bir kimlik anahtarı gibi davranıyor; bayi istediği zaman müşterinin e-postasını ve puanını okuyabiliyor. Ham id'ler O1'deki zincirin girdisi.

**Öneri:** Bayi yüzeyleri için tek bir `toDealerCustomerDTO()` fonksiyonu yazılmalı: opak `ref`, ad, maskeli e-posta (`f***@g***.com`), PII yalnızca müşterinin bu bayiyle ilişkisi varsa ve rıza verdiyse. Tarama sonucunda `points` gösterilmemeli. Tarama, kart+bayi başına hız sınırına alınmalı.

**Efor:** S-M

---

### O5 — ORTA: SSE bildirim akışında eşzamanlı bağlantı sınırı yok

**Kanıt:** `app/api/dealer/notifications/stream/route.ts:28` (DEALER/ADMIN/STAFF). Bağlantı başına `maxDuration=60`; yoklama aralığı 1,2-5 sn (`:20-23, 39-...`). Kullanıcı başına bağlantı sayacı yok.

**Sorun:** Tek bir hesap yüzlerce paralel EventSource açarak fonksiyon süresi faturasını büyütebilir ve Prisma bağlantı havuzunu tüketebilir (Neon pooler, `connection_limit`).

**Öneri:** Redis'te kullanıcı başına aktif akış sayacı tutulmalı (`INCR`/`DECR` + TTL), sınır 3 olmalı. Uzun vadede yoklama yerine Upstash Redis pub/sub veya sağlayıcı push kullanılabilir.

**Efor:** S

---

### O6 — ORTA: Admin gizli kapısı API katmanında yok

**Kanıt:** `proxy.ts:78-87` gate cookie'yi yalnızca `/admin` sayfalarında kontrol ediyor. `/api/dealer/*` uçları `ADMIN` rolüyle `?dealerId=` alarak herhangi bir kiracının verisini dönüyor: `customers/route.ts:25-33`, `ask-analytics/route.ts:36-41`, `feedbacks/search/route.ts:202-207`, `benchmark/route.ts:21`, `churn-risk/route.ts:18`, `voc-wall/route.ts:18`, `segment-actions`, `weekly-brief`, `innovation/*`.

**Sorun:** Gizli kapının amacı "rol yetmez" ilkesi. Ancak rolü (kazara veya kötü niyetle) ADMIN yapılmış bir hesap, API üzerinden gate'e takılmadan tüm kiracıların verisini okuyabiliyor.

**Öneri:** `requireAuth` içinde rol ADMIN olduğunda gate cookie doğrulanmalı (`gateCookieBelongsTo`). Kiracılar arası admin okumaları `AuditLog`'a yazılmalı ("admin X, bayi Y'nin müşteri listesini görüntüledi").

**Efor:** S

---

### O7 — ORTA: Plan kotaları uygulanmıyor ya da dolanılabiliyor

**Kanıt:** `maxBranches` tanımlı (`lib/plan-limits.ts:15,26`) ama `app/api/dealer/locations/route.ts:54` sınırsız mekân oluşturuyor. QR kotası silmeyle geri açılıyor (Y3). Personel, AI ve kampanya için plan kotası yok.

**Öneri:** `assertPlanQuota(dealerId, 'branches' | 'staff' | 'aiTokens' | 'campaignsPerMonth')` adında merkezi bir fonksiyon ve bayi panelinde kota göstergesi eklenmeli.

**Efor:** S-M

---

### D1 — DÜŞÜK: Token-replay korumasını atlayan oturum okumaları

**Kanıt:** `getServerSession` doğrudan kullanılıyor: `app/api/dealer/win-back/route.ts:19, 96`, `app/api/dealer/heatmap/route.ts` (GET başı), `app/api/happy-hour/route.ts:111`, `app/api/qr-codes/bulk/route.ts` (POST başı).
**Öneri:** Hepsi `requireAuth`'a taşınmalı. `app/api/**` altında `getServerSession` kullanımını yasaklayan bir ESLint kuralı (`no-restricted-imports`) eklenmeli. **Efor:** S

### D2 — DÜŞÜK: Benchmark "komşu segment" k-anonimliği zayıf

**Kanıt:** `app/api/dealer/benchmark/route.ts:215-246`. Eşik yalnızca kategorideki bayi sayısına bakıyor (`peerIds.length >= 3`, `:231`), **verisi olan** bayi sayısına bakmıyor. Kategoride verisi olan tek bir rakip varsa, "akran ortalaması" o rakibin birebir puanı ve geri bildirim sayısı oluyor.
**Öneri:** Eşik, geri bildirimi olan en az 5 bayi olmalı; sayı aralıklara yuvarlanmalı. **Efor:** S

### D3 — DÜŞÜK: Kategori listesinde global ürün sayısı

**Kanıt:** `app/api/dealer/categories/route.ts:31` `_count.products`. Global kategorilerde tüm bayilerin ürünlerini sayıyor.
**Öneri:** `_count`, `where: { dealerId }` ile filtrelenmeli. **Efor:** S

### D4 — DÜŞÜK: Personel puantajı ve PIN güvenliği

**Kanıt:**
- `app/api/staff/shifts/route.ts:62-71`: `clock_in` ve `clock_out` tekrar tekrar yazılabiliyor; vardiya tarihi penceresi ve sıra (in < out) kontrolü yok, bu da puantaj manipülasyonuna açık.
- `app/api/dealer/staff/[id]/route.ts:20-25, 59`: `pinCode` düz metin saklanıyor ve **audit log'a da düz metin** yazılıyor. Tip doğrulaması yok.
- `app/api/dealer/staff/route.ts:16`: PIN yalnızca 4-6 karakter, rakam zorunluluğu yok.

**Öneri:** Clock-in yalnızca bir kez ve vardiya günü ±2 saat içinde yapılabilmeli; düzeltmeler bayi onaylı bir "düzeltme talebi" ile yapılmalı. PIN bcrypt ile hashlenmeli ve log'a maskeli yazılmalı. **Efor:** S

### D5 — DÜŞÜK: Sınırsız alanlar ve tipsiz PATCH'ler (depolama ve maliyet amplifikasyonu)

**Kanıt:** `staff/training/route.ts:13` (`content: z.string()`), `staff/checklists/route.ts:13` (sınırsız `items`), `innovation/segment-proposals/route.ts:14` (`message` üst sınırsız), `incidents/route.ts:23-26`, `staff/shifts/route.ts:84-89`, `offline-sync/route.ts:66-77` (payload boyutu), `auto-replies/route.ts:20` (`template` sınırsız), `ai-settings/route.ts:178-185` (tipsiz; yanlış tip 500 döndürüyor), `staff/[id]/route.ts:20-25`.
**Öneri:** Tüm gövdeler `.strict()` zod şemalarıyla ve `INPUT_LIMITS` sabitleriyle doğrulanmalı. **Efor:** S

### D6 — DÜŞÜK: Personel oluşturmada doğrulanmış e-posta işgali

**Kanıt:** `app/api/dealer/staff/route.ts:120-128`, `emailVerified: new Date()`.
**Sorun:** Bayi, sahibi olmadığı e-postalarla "doğrulanmış" hesaplar açabiliyor. Gerçek sahip kayıt olamıyor ("zaten kayıtlı" hatası).
**Öneri:** K1'deki davet akışıyla birlikte çözülür. **Efor:** (K1'e dahil)

---

## 4. Hedef Mimari

### 4.1 Kiracı bağlamı (Tenant Context) katmanı

Bugün her route, `session.user.id` değerini doğrudan `dealerId` olarak kullanıyor ve kapsamı kendisi kuruyor. Hedef:

```
requireTenant(request, { roles, permission? })
  → { actor: { id, role, sessionVersion }, tenant: { dealerId, plan }, staff?: { permissions[] } }
```

- **Doğrulama:** JWT → Redis (60 sn) → DB: `sessionVersion`, `DealerStaff.isActive`, rol. Admin için gate cookie kontrolü de burada yapılır.
- **Veri erişimi:** Prisma Client Extension (`prisma.$extends({ query: { $allModels: { ... } } })`) ile `forTenant(dealerId)` istemcisi. Kiracı modellerinde (`Campaign`, `ActionItem`, `Incident`, `Consumption`, `QRCode`...) `where.dealerId` alanını **zorunlu** kılar, olmayan sorguda hata fırlatır. Daha güçlü bir alternatif olarak Postgres RLS kullanılabilir (Neon destekliyor): `SET LOCAL app.dealer_id`. Mevcut 90 route için kademeli geçiş en güvenli yol.
- **DTO katmanı:** `toDealerCustomerDTO`, `toStaffDTO`. Ham id/e-posta sızdırmayan, tek tip yanıtlar.

### 4.2 Yetki modeli

| Aktör | Kapsam | Örnek izinler |
|---|---|---|
| DEALER (sahip) | Tüm kiracı | hepsi |
| STAFF: Müdür | Kiracı | feedback.read_text, customer.read_pii, ai.use, remedy.publish |
| STAFF: Vardiya şefi | Kiracı (sınırlı) | feedback.read_text, incident.manage |
| STAFF: Kasiyer | Kendi işi | consumption.create (tarama nonce'u ile), kendi vardiya/görevleri |
| ADMIN | Kiracılar arası | gate cookie + audit zorunlu |

### 4.3 Domain servisleri (route'lar ince kalır)

- **PointsLedger.award()**: kaynak bazlı tavan, `points_credited`, velocity, idempotency, transaction. Happy-hour ve sezon çarpanları burada sınırlanır (ör. toplam çarpan ≤ 4).
- **ConsumptionService.create()**: tarama nonce'u, kart-bayi bağlamı, hız sınırı, audit, bildirim. Hem online uç hem offline kuyruk bunu çağırır.
- **AiGateway.invoke()**: plan bazlı bütçe, eşzamanlılık, devre kesici, kullanım kaydı, güvenilmeyen veriyi user rolünde sınırlandırma, ağır işleri Inngest'e taşıma.
- **MarketingMessenger.send()**: rıza (grup×kanal), frekans tavanı, alıcı bütçesi, denetim kaydı, onay eşiği, HTML kaçışı.
- **StaffInvitationService**: davet, kabul ve oturum iptali.

### 4.4 Veri bütünlüğü

- QR: soft-archive. `Feedback → QRCode` ilişkisi `onDelete: Restrict`.
- `DealerCustomerMetrics` (bayi×müşteri). Global CLV yalnızca admin için.
- Global AI öğrenmesi yalnızca anonim istatistiklerle beslenir, admin onaylı ve sürümlü.

---

## 5. Adım Adım Geçiş Planı

> Not: `DATABASE_URL` canlı Neon'u gösteriyor. Şema değişiklikleri (Y3, Y1, Y4) önce Neon branch üzerinde denenmeli; `prisma migrate deploy` ile ve yedek alındıktan sonra uygulanmalı (bkz. `feat(yedek)` betikleri).

### Faz 0 — Acil yamalar (1-2 gün, şema değişikliği yok)
1. **K1:** `dealer/staff` POST'ta var olan kullanıcıya yazma **kaldırılsın**. E-posta kayıtlıysa 409 "Bu kişiyi davet akışıyla ekleyin" dönülsün. `emailVerified` otomatik doldurulmasın. (S)
2. **K2:** Happy-hour zod şeması (`multiplier 1-3`); `consumptions` pasif puanına mutlak tavan (ör. ≤25) ve `points_credited` olayı (kategori `consumption_passive`) eklensin. `capFeedbackPoints` benzeri bir kaynak tavanı uygulansın. Mevcut çarpanı >3 olan happy-hour kayıtları **okuma amaçlı** bir sorguyla tespit edilip raporlansın. Düzeltme kararı ürün sahibine ait. (S)
3. **Y2:** `offline-sync` PATCH: payload DB'den okunsun, status ile claim yapılsın, ürün sahipliği kontrol edilsin, `SCAN_CARD` kaldırılsın. (S-M)
4. **Y3 (geçici):** QR silme ve toplu silme uçları "arşivle" davranışına (`isActive=false` + `revokedAt`) yönlendirilsin. Sert silme admin'e kısıtlansın. (S)
5. **O1, O2, O3:** `assignedToId` üyelik kontrolü, e-posta HTML kaçışı, telafi seçimi doğrulaması. (S)
6. **Y5 (hızlı):** `ai-proactive-analysis` ve `feedbacks/[id]/similar` uçlarına `checkRateLimitDb` eklensin. `askAI`, `generateInsightReport` ve `suggestResponseWithGroq` içinde `checkAiCostGuard` ve `recordAiCostUsage` çağrılsın. `action-items` GET'teki otomatik LLM tetiklemesi kaldırılsın. (S)

### Faz 1 — Kimlik ve izolasyon (1 hafta)
7. **Y4:** `User.sessionVersion` migrasyonu, `requireAuth` içinde Redis önbellekli kontrol, `isActive` zorunluluğu, oturum iptali. (M)
8. **K1 (tam):** `StaffInvitation` modeli ve akışı; bayi panelinde davet arayüzü. (M)
9. **Y1:** `DealerCustomerMetrics` modeli ve cron güncellemesi; `customers` ve `segment-actions` uçlarının bu modele taşınması. (M)
10. **Y7:** `MarketingMessenger` servisi; kampanya, win-back, risk-segment ve segment-proposals bu servise bağlanır; kampanya PATCH şeması. (M)
11. **O6, D1:** Gate cookie'nin `requireAuth`'a eklenmesi, admin kiracılar arası okuma auditi, `getServerSession` yasak kuralı. (S)

### Faz 2 — Mimari sağlamlaştırma (2-3 hafta)
12. **Y5 (tam):** `AiGateway` + plan bazlı AI bütçesi + Inngest'e taşınan rapor üretimi + panelde kullanım göstergesi. (L)
13. **Y6:** Global öğrenmenin anonim veriye indirilmesi, admin onaylı sürümlü prompt, bayi `customPrompt` izolasyonu. (M)
14. **Y4 (yetki):** Personel izin matrisi ve `requireStaffPermission`; panelde rol şablonları. (M)
15. **Kiracı bağlamı:** `requireTenant` ve Prisma `forTenant` uzantısı; önce yazma uçları, sonra okuma uçları taşınır. (L)
16. **Y3 (kalıcı):** `archivedAt` ve `onDelete: Restrict` migrasyonu. (M)
17. **O7:** `assertPlanQuota` (mekân, personel, AI, kampanya). (S-M)

### Faz 3 — Kalıcı güvence (sürekli)
18. **Kiracı izolasyonu test paketi:** Her bayi route'u için "Bayi A'nın oturumuyla Bayi B kaynağına eriş → 403/404" sözleşme testleri (Jest + test DB'si; canlı DB'ye **asla** bağlanmamalı).
19. **Puan ekonomisi testleri:** Her puan basan yol için "`points_credited` yazıldı mı + tavan uygulandı mı" testi.
20. **Statik denetim:** API route'larında `prisma.<tenantModel>.find*/update*/delete*` çağrısının `forTenant` dışında kullanımını yakalayan ESLint kuralı veya CI grep kontrolü.
21. **İzleme:** Bayi başına günlük puan basımı, LLM token kullanımı ve bildirim gönderimi için PostHog/Sentry alarmları.

---

## 6. Bulgu Özeti Tablosu

| # | Önem | Başlık | Ana kanıt | Efor |
|---|---|---|---|---|
| K1 | Kritik | Personel ekleme ile hesap ele geçirme | `app/api/dealer/staff/route.ts:78-117` | M |
| K2 | Kritik | Sınırsız happy-hour çarpanı + tüketim puan basma | `app/api/happy-hour/route.ts:121-133`, `consumptions/route.ts:304-351` | S+M |
| Y1 | Yüksek | Global CLV ile kiracılar arası harcama sızıntısı | `lib/clv-core.ts:79-86`, `customers/route.ts:43-88` | M |
| Y2 | Yüksek | offline-sync payload/replay | `offline-sync/route.ts:101-149, 200-251` | M |
| Y3 | Yüksek | QR sert silme → geri bildirim cascade | `schema.prisma:834`, `qr-codes/[id]/route.ts:123-128` | M |
| Y4 | Yüksek | Pasif personel erişimi + sınırsız personel yetkisi | `lib/api-auth.ts:158-168`, `lib/auth.ts:254-256` | M |
| Y5 | Yüksek | AI maliyet koruması kısmi | `lib/ai-engine.ts:116,307` (yalnızca), `ai-proactive-analysis/route.ts` | L |
| Y6 | Yüksek | Kiracılar arası prompt zehirleme | `lib/ai-learning.ts:627-701,779`, `lib/ai-engine.ts:655-671,877-880` | M |
| Y7 | Yüksek | Toplu bildirimde rıza/frekans yok | `campaigns/[id]/send/route.ts:107-127` | M |
| O1 | Orta | assignedToId ile e-posta sızıntısı | `action-items/route.ts:27,88,184` | S |
| O2 | Orta | E-posta HTML enjeksiyonu | `lib/notify-email.ts:79,113` | S |
| O3 | Orta | Telafi seçimi doğrulanmıyor | `customer/remedy/[offerId]/route.ts:150-166` | S |
| O4 | Orta | Kart tarama ile PII ve ham id | `cards/scan/[token]/route.ts:32-40` | S-M |
| O5 | Orta | SSE bağlantı sınırı yok | `notifications/stream/route.ts:28` | S |
| O6 | Orta | Admin gate API'de yok | `proxy.ts:78-87` | S |
| O7 | Orta | Plan kotaları uygulanmıyor | `locations/route.ts:54`, `lib/plan-limits.ts:74` | S-M |
| D1-D6 | Düşük | Token-replay atlama, k-anonimlik, sayım sızıntısı, puantaj/PIN, sınırsız alanlar, e-posta işgali | bkz. bölüm 3 | S |

---

## Uygulama sonrası durum

**Tarih:** 2026-10-11 · **Dal:** `feat/platform-overhaul` · **Kod commit'i:** `4ff4bf4 fix(guvenlik-bayi-api): dalga 3 kalite turu`

Her bulgu güncel koda karşı yeniden kontrol edildi. Kapsam bu sürede 90 uçtan **185 uca** (bayi 175 + personel 10) çıktı. Uçların büyük kısmı `defineRoute`'a taşındı. Bu fabrika rol listesini zorunlu tutuyor, kiracıyı `resolveDealerScope` ile çözüyor (varsayılan reddet), zod uyguluyor ve 415/413 sınırlarını koyuyor.

### Bulgu bulgu

| # | Durum | Kanıt (güncel kod) |
|---|---|---|
| K1 | **KAPANDI** | `POST /api/dealer/staff` artık bir **davet** oluşturuyor. Şemada `password` yok ve var olan hiçbir kullanıcıya yazılmıyor (`app/api/dealer/staff/route.ts`, `lib/staff-invitations.ts`). Davetli daveti kendisi kabul ediyor. ADMIN/DEALER hesapları personele dönüştürülemiyor (`ROLES_NEVER_CONVERTED`, kontrol tx içinde yeniden yapılıyor). Rol değişince `sessionVersion++` yapılıyor. Saatte 20 davet sınırı var, denetim kaydı yazılıyor. |
| K2 | **KAPANDI** (kalan risk düşük) | Mutlu saat zod şeması çarpanı [1,3] aralığında tutuyor; okuma tarafında da kırpılıyor (`lib/points-multipliers.ts`). Çarpan şelalesi en fazla 4×. Tüketim tek servisten geçiyor (`lib/consumption/service.ts`): `mintPoints(source:'dealer_passive')` aynı tx'te `points_credited` yazıyor ve tavanları uyguluyor (tüketim başına 300, müşteri×bayi×gün 300, müşteri×gün 600). Kendine puan basma (kendi kartı, personelin kartı) reddediliyor. Kart durumu ve ürün sahipliği doğrulanıyor, kart+bayi başına dakikada 5 sınırı var. *Kalan:* müşterinin fiziksel olarak orada olduğunu kanıtlayan tarama nonce'u (ürün kararı). Tavanlar etkiyi sınırlıyor. |
| Y1 | **KAPANDI** | Müşteri listesi ve segmentler yalnızca bu işletmenin verisinden hesaplanıyor (`DealerCustomerStats`, `lib/dealer-customers/server.ts`). Bayi uçlarında global `customerLifetimeValue` okuması yok. `trustScore: null` dönüyor, e-posta maskeli, ham id yerine şifreli `ref` kullanılıyor. |
| Y2 | **KAPANDI** | `offline-sync` PATCH yalnızca kimlik listesi alıyor ve içeriği DB'den okuyor. CAS ile sahipleniyor (`status ∈ {PENDING,FAILED}` + `retries`). İşleme ortak `createConsumption` ve `clientOpId=offline:<id>` ile yapılıyor; böylece `@@unique` aynı öğeden ikinci tüketimi engelliyor. `SCAN_CARD` kaldırıldı, uç yalnızca DEALER'a açık. Bu turda GET ve PATCH'e oran sınırı da eklendi. |
| Y3 | **KAPANDI** | `Feedback.qrCode onDelete: Restrict`. QR "silme" artık arşivleme (`archivedAt`/`revokedAt`); toplu `delete` 410 dönüyor. Kota canlı QR'ları sayıyor ve arşivden geri alma da kotadan geçiyor (`lib/plan-limits.ts`, `lib/qr-quota.ts`). |
| Y4 | **KISMEN** | *Kapanan:* `requireAuth` her istekte DB'deki rolü, `sessionVersion`'ı ve personel bağını doğruluyor (Redis 60 sn). Pasif personel STAFF uçlarında 403 `STAFF_INACTIVE` alıyor. Kiracı STAFF için DB'deki **aktif** `DealerStaff`'tan geliyor (`lib/auth/scope.ts`). PIN bcrypt ile saklanıyor, `field-ping` emekliye ayrıldı (410). Toplu CSV dışa aktarımları (müşteri, işlem, katalog, **gelen kutusu — bu tur**) personele kapalı. E-postalar her yerde maskeli. *Kalan:* personel izin matrisi (Kasiyer/Şef/Müdür). Bunun için şema gerekiyor; istek `SCHEMA-REQUESTS.md`'de (`DealerStaff.permissions`). |
| Y5 | **KAPANDI** (plan kademesi hariç) | Bütün LLM ve embedding yolları `guardAiCall` → çağrı → `recordAiCostUsage` sırasıyla ilerliyor (`lib/ai-engine.ts`, `lib/groq.ts`, `lib/ai-learning.ts`, `lib/action-items-ai.ts`). Bayi başına günlük token bütçesi, görev başına global bütçe (QRA, sistem öğrenmesi), kapsamsız bütçe ve görev başına dakikalık sınır var. Uçlarda `rateLimit: 'ai'` uygulanıyor. `action-items` GET'te LLM yan etkisi yok. Ekip tavanı 50. *Kalan:* plan bazlı AI bütçesi (`PricingPlan.aiDailyTokens`, şema isteği) ve kiracı başına eşzamanlılık sınırı. |
| Y6 | **KAPANDI** | Sistem öğrenmesi anonim toplulaştırmayla çalışıyor. Önerisi `pendingProposal` olarak **admin onayı** bekliyor, sürüm iyimser kilitle korunuyor (`lib/ai-learning.ts`). Bayi `customPrompt`'u zod ile sınırlı, injection taramasından geçiyor ve yalnızca o bayinin çağrısında kullanılıyor. Müşteri metinleri `wrapUntrusted` sınırlayıcısı ile `<veri>` bloğunda veriliyor. |
| Y7 | **KAPANDI** | Kampanya, win-back, kişisel teklif ve segment önerisi gönderimleri `lib/marketing-delivery.ts` kapısından geçiyor: kanal bazlı "Kampanya" tercihi (tercih okunamazsa gönderim yapılmıyor) ve `data.kind`. Frekans tavanı 7 günde 2 ileti. Bayi başına günlük 10 gönderim. Kampanya PATCH şemalı. |
| O1 | **KAPANDI** | `validateAssignee` yalnızca bayiyi ve onun **aktif** personelini kabul ediyor (aksiyon, olay, kuyruk uçları). Atanan kişinin e-postası maskeli (`assigneeDto`). Liderlik tablosu opak `lb_` kimliği kullanıyor. |
| O2 | **KAPANDI** | E-posta şablonu satırları `escapeEmailText` ile kaçışlanıyor (`lib/notify-email.ts`). Yanıt e-postası yalnızca **ilk** yanıtta gidiyor, düzenleme e-posta tetiklemiyor (`lib/dealer-inbox/server.ts`). Yanıt ucunda `rateLimit: 'mutation'` var. |
| O3 | **KAPANDI** | Müşterinin telafi seçimi teklifteki seçeneklerle sunucuda doğrulanıyor (`describeRemedyOffer`), seçilen değer sunucunun döndürdüğü değer. |
| O4 | **KAPANDI** | Kasa kart sorgusu (`dealer.kasa.lookup`) maskeli dönüyor: ad "Ayşe K.", e-posta/telefon ve ham id yok, puan yok. Aktör başına dakikada 60 sorgu, `SCANNED` denetimi var, kendi kartı reddediliyor. |
| O5 | **KAPANDI** (bu tur) | SSE için kullanıcı başına dakikada 6 açılış (paylaşılan sayaç). Akış ömrü 55 sn, `bye` olayıyla imleçli yeniden bağlanıyor. `since` 24 saate kırpılıyor. İstemci 3 sn'den 60 sn'ye üstel geri çekilme yapıyor (`lib/notification-stream-policy.ts`, `lib/use-notification-stream.ts`). |
| O6 | **KAPANDI** (bu tur tamamlandı) | Gizli kapı `requireAuth` içinde API'de zorunlu. Kiracılar arası yönetici erişimi `ADMIN_TENANT_ACCESS` denetim kaydına yazılıyor (`lib/auth/admin-tenant-audit.ts`): `resolveDealerScope` ve `defineRoute` bunu uç adıyla yapıyor; tüm işletmeleri kapsayan eski listeler (aksiyon, olay, QR, mutlu saat) ve `[id]` okuma/yazmaları da kayıtlı. Yönetici artık kendi kimliğini bayi sayamıyor (inovasyon uçları). |
| O7 | **KISMEN** | Şube kotası `maxBranches` kilit altında uygulanıyor (`/api/dealer/qr-codes/locations`). QR kotası canlı kodları sayıyor. Ekip tavanı 50, kampanya günlük 10. *Kalan:* plan bazlı personel/AI kotası. Şema isteği: `PricingPlan.maxStaff`, `aiDailyTokens`. |
| D1 | **KAPANDI** | `app/api/**` altında `getServerSession` içe aktarılmıyor. Bunu `__tests__/security/dealer-staff-api-guard.test.ts` uygulama genelinde zorluyor. Rol listesiz `requireAuth()` derlenmiyor. |
| D2 | **KAPANDI** | Eski benchmark emekliye ayrıldı. Yeni uçta k-anonimlik `K_ANON_MIN` katkıcı (veri sahibi) bayi sayısına göre uygulanıyor, tümleyen kontrolü de var (`lib/dealer-benchmark/core.ts`). |
| D3 | **KAPANDI** | Kategori `_count` yalnızca bu bayinin ve sistemin aktif ürünlerini sayıyor (`app/api/dealer/categories/route.ts`). |
| D4 | **KAPANDI** | Puantaj sunucuda durum makinesi, zaman penceresi ve koşullu yazımla yönetiliyor, denetim kaydı tutuluyor (`app/api/staff/shifts/route.ts`). PIN bcrypt ile saklanıyor, yanıtta `****`, denetimde yalnızca `pinChanged` görünüyor. |
| D5 | **KAPANDI** | Gövdeler zod ile doğrulanıyor (`defineRoute` 1 MB/415). Eski uçlarda şema ve `.max` var. Bu turda `planId` sınırı eklendi. |
| D6 | **KAPANDI** | Davet akışı (K1): bayi hesap açamıyor ve `emailVerified` dolduramıyor. |

### Bu turda yapılanlar

- Önceki oturumun yarım kalan işleri doğrulandı, tip denetiminden ve jest'ten geçirildi: O5 SSE politikası ve istemci geri çekilmesi, O6 yönetici erişim denetimi, gelen kutusu CSV'sinin personele kapatılması, mutlu saat ve QR yazma oran sınırları.
- **Okuma dahil** handler başına oran sınırı eklendi. Kapsanan uçlar: aksiyon, olay (liste ve `[id]`), AI ayarları, inovasyon (prefs, segment önerileri, masa performansı, masa nabzı), personel/davet/vardiya/görev listeleri, offline-sync, QR liste ve `[id]`, mutlu saat (herkese açık okumada IP başına) ve mutlu saat denetimi. Yapı testi artık okuma uçlarını da kapsıyor.
- Yöneticinin aksiyon ve olay `[id]` okuma/yazmaları, QR listesi ve mutlu saat listesi denetime yazılıyor.
- Olay uçlarındaki karışık TR/EN hata metinleri ("Incident bulunamadı") Türkçeleştirildi.
- Doğrulama: `tsc` 0 hata. `dealer-staff-api-guard`, `dealer-api-stream-admin-audit`, `dealer-consumption-gates`, `qr-*-quota`, `table-signal-route`, `marketing-pref-gate`, `settings-load-error-overwrite`, `staff-ops/*` ve `tenant/*` testleri geçti. `data-safety-archive` içindeki tek kırık test ("arşivlenmiş ödül alınamaz") gamification ödül ucuna ait; bu boyutun dosyası değil.

### Kalan maddeler

1. **Y4 personel izin matrisi:** şema gerekiyor (`DealerStaff.permissions`). Bugün aktif personel müşteri listesini (maskeli), gelen kutusunu ve AI önerisini okuyabiliyor, ama toplu dışa aktarım yapamıyor.
2. **O7/Y5 plan bazlı kota:** şema gerekiyor (`PricingPlan.maxStaff`, `aiDailyTokens`). Bugün sabit tavanlar (ekip 50, ortam değişkeniyle AI bütçesi) uygulanıyor.
3. **K2 fiziksel varlık kanıtı (tarama nonce'u):** ürün kararı. Puan tavanları ve `points_credited` görünürlüğü etkiyi sınırlıyor.
4. **Kiracı katmanı (Faz 2/15):** Prisma `forTenant` uzantısı veya Postgres RLS uygulanmadı. Kapsam bugün `resolveDealerScope` ve `defineRoute({ tenant })` ile sağlanıyor, `__tests__/tenant/*` sözleşme testleri var.
5. **Tüketicisi olmayan eski uçlar:** `/api/dealer/ai-settings` (yerine `settings/ai`), `/api/dealer/action-items`, `/api/dealer/incidents` (yerine `queues/*`), `/api/dealer/offline-sync` (kasa artık yerel kuyrukla canlı uca yazıyor) ve `/api/dealer/innovation/*` GET'leri. Bunlar sertleştirildi (rol, kapsam, oran sınırı, denetim), ama 410 ile emekliye ayırmak saldırı yüzeyini küçültür.

### Yeni puan: **9 / 10**

**Gerekçe:** İki kritik (K1, K2) ve yedi yüksek bulgunun altısı tamamen kapandı. Y4 yalnızca izin matrisi kısmında açık. Bütün orta ve düşük bulgular kapandı. Kalıcı güvence testleri var: `getServerSession` yasağı, zorunlu rol listesi, okuma dahil her uçta oran sınırı, CSV için personel kapısı, kiracı izolasyon matrisi. Tam puana kalan fark iki şema bağımlı yetkilendirme/kota maddesi (Y4 matrisi, plan bazlı kota) ile kiracı katmanının ORM/RLS düzeyinde zorunlu olmaması.

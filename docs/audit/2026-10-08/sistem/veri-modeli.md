# Veri Modeli Denetimi — `prisma/schema.prisma` (Sistem Geneli)

> Denetim tarihi: 2026-10-08 · Dal: `feat/moment-engine` · Kapsam: 140 model, 2 enum, 3064 satırlık şema + şemayı kullanan tüm `app/`, `lib/`, `components/`, `scripts/` kodu.
> Yöntem: salt okuma. Veritabanına, prisma komutlarına, build/test'e dokunulmadı. Model kullanım envanteri `rg` ile çok satırlı Prisma çağrıları (`.model.findMany(` … `.groupBy(`) sayılarak çıkarıldı, şüpheli her sonuç elle doğrulandı.

---

## 1. Özet

**Puan: 5 / 10**

Qratex'in veri modeli, **tek tek sıcak yollarda olgun** (atomik "tek-kez claim" tabloları, yorumlu composite index'ler, klan savaşı escrow alanları, outbox/DLQ alanları, KVKK kuyruğu), ama **sistem bütünlüğünde kırılgan**. En büyük riskler dört başlıkta toplanıyor:

1. **Yıkıcı cascade zinciri.** Bayinin tek bir QR kodunu (veya toplu 1000 kodu) silmesi; o QR'a gelmiş tüm müşteri yorumlarını, AI analizlerini, telafi tekliflerini ve aksiyon öğelerini **kalıcı olarak** siliyor. Bir kullanıcının silinmesi ise o kullanıcının **denetim izini (AuditLog)** de götürüyor. Bu hem veri kaybı hem de "kötü yorumu QR silerek yok etme" şeklinde bir güven/manipülasyon açığı.
2. **Puan ekonomisinin defteri yok.** `User.points` değiştirilebilir bir bakiye; tek "defter" `AnalyticsEvent(points_credited)` ve bu tablo 90 günlük temizliğe tabi. Bazı kredi yolları (bayi tüketim pasif puanı, admin manuel puan) event bile yazmıyor; admin negatif puanla bakiyeyi eksiye düşürebiliyor.
3. **Çoklu kiracı (multi-tenant) sınırının veri modelinde olmaması.** `CustomerLifetimeValue` müşteri başına **platform geneli** hesaplanıyor ve bayiye olduğu gibi gösteriliyor: bayi, müşterinin **rakip işletmelerdeki** toplam harcamasını/ziyaretini görüyor.
4. **Şema yönetimi tekrar üretilebilir değil.** `prisma/migrations` altında yalnızca 4 göç var (ilk 2026-05-12), temel tablolar ve son aylarda eklenen alanlar `db push` ile doğrudan canlı Neon'a uygulanmış. Temiz bir veritabanı göçlerden kurulamaz; staging/preview DB yok.

Bunların yanında: 8 model hiç kullanılmıyor veya sadece yazılıp hiç okunmuyor, ~51 gereksiz index yazma maliyeti yaratıyor, 25 FK sütununda index yok, para alanları `Float`, 86 `Json` alanının merkezi tip güvencesi yok, `Settings` tablosu tipsiz bir anahtar-değer çöplüğüne dönüşmüş, büyüyen tabloların çoğunda saklama politikası yok.

**İyi olanlar (korunmalı):** `GameStreakClaim`/`CouponRedemption`/`TournamentRewardClaim`/`SeasonalChallengeClaim`/`DailySpin` ile DB seviyesinde tek-kez garanti; `SquadBattle.rewardFunded/rewardRefunded` escrow; `debitPoints` içinde `updateMany({points:{gte}})` ile atomik borç; sıcak sorgular için gerekçesi yazılmış composite index'ler (`Feedback[qrCodeId,deletedAt,createdAt]`, `User[role,points]` vb.); `OutboxEvent` DLQ alanları; günlük tek cron orkestratörü (`app/api/cron/daily/route.ts`).

---

## 2. Mevcut Durum Haritası

### 2.1 Sayısal görünüm

| Ölçü | Değer |
|---|---|
| Model / enum | 140 / 2 (`Role`, `CardStatus`) |
| `Json` alan | 86 |
| `@@index` / `@@unique` | 332 / 31 |
| `onDelete: Cascade` / `SetNull` | 130 / 30 |
| `Float` alan (para dahil) | 48 |
| `User` modeli | 216 satır, ~140 ilişki alanı (müşteri + bayi + admin + personel + faturalama + 2FA + güven + seri hepsi tek tabloda) |
| Göç (migration) sayısı | 4 (tam şemanın küçük bir bölümü) |

### 2.2 Alanlara göre model kümeleri

| Küme | Ana modeller | Not |
|---|---|---|
| Kimlik/oturum | User, Account, Session, VerificationToken, AuthEmailToken, TwoFactorRecoveryCode, SessionTokenUsage | NextAuth `strategy: 'jwt'` (`lib/auth.ts:61`) → `Session` fiilen boş |
| Geri bildirim çekirdeği | QRCode, Feedback, DealerLocation, ConsumptionReview, RemedyOffer, RemedyTemplate, ActionItem | Feedback'te `dealerId` yok; bayi filtresi her yerde `qrCode: { dealerId }` join'i (80 kullanım) |
| Fiziksel kart/tüketim | PhysicalCard, CardBatch, Consumption, Product, ProductCategory, CardAuditLog | `PhysicalCard.batchId` ↔ `CardBatch` arasında FK yok |
| Oyunlaştırma/ekonomi | User.points/xp/level, Badge/UserBadge, Quest/UserQuest, Reward/UserReward, Cosmetic, Squad*, MiniGame*, DailySpin, *Claim, Donation*, Referral*, UserStreak, VIP*, HappyHour, SeasonalCampaign | Bakiye var, defter yok |
| AI | AIEmbedding, AIThemeCluster, AIInsightReport, AIConversation, AISettings, AIUsageLog, QraChatLog, Agent* , AIFeedbackCorrection, AI*LearningProfile | Vektörler `Json`, KNN uygulama belleğinde |
| İç ekip | Department, UserDepartment, CompanyTask, Task*, Team* | `department` slug'ı string, FK yalnız `UserDepartment`'ta |
| Sistem/altyapı | Settings, FeatureFlag, AuditLog, AnalyticsEvent, Notification, OutboxEvent, IdempotencyKey, RateLimitCounter, InboxMessage, InternEmailSend | `Settings` 28+ farklı anahtar, kullanıcı/bayi başına satırlar dahil |

### 2.3 Kullanım envanteri (doğrulanmış)

| Durum | Modeller | Kanıt |
|---|---|---|
| **Hiç kullanılmıyor** | `DealerFavoriteProduct` (2032), `DealerOnboardingEvent` (863), `FileUpload` (1011), `MenuItem` (1399), `Theme` (1417) | Repo genelinde delegate/tablo adı araması 0 sonuç (yalnız `prisma/seed.ts:482`'de `menuItems` adlı ilgisiz bir dizi) |
| **Fiilen boş** | `Session` (307) | JWT stratejisi; yalnız `lib/gdpr-core.ts:155` `deleteMany` çağırıyor |
| **Yazılıyor, hiç okunmuyor** | `DailyDealerStats` (877) | Tek erişim `app/api/admin/preagg/route.ts:137` upsert; okuyan yok |
| | `PushNotificationLog` (1986) | Tek erişim `lib/push.ts:98` create; okuyan yok, temizlik yok |
| **Üreticisi yok** | `OutboxEvent` (344) | `createOutboxEvent` (`lib/outbox.ts:14`) hiçbir yerden çağrılmıyor; tablo yalnız `admin/health` sayımı ve `processOutbox` tarafından okunuyor |
| **Ölü alanlar** | `Squad.weeklyGoalResetAt` (409), `CompanyTask.coverIcon` (2894), `DealerFlashOffer.redemptionCount/maxRedemptions` (2703-2704: hiçbir yerde artırılmıyor, yalnız okunuyor) | `rg` 0 yazma |

---

## 3. Bulgular (önem sırasıyla)

### B1 — KRİTİK · QR/kullanıcı/katalog silme işlemleri müşteri içeriğini ve denetim izini cascade ile yok ediyor

**Kanıt**
- `prisma/schema.prisma:834` — `Feedback.qrCode … onDelete: Cascade`; `:733` `QRCode.dealer … onDelete: Cascade`.
- `app/api/qr-codes/[id]/route.ts:123-125` — bayi kendi QR'ını **hard delete** ediyor; `app/api/qr-codes/bulk/route.ts:41` — tek istekte 1000'e kadar QR `deleteMany`.
- Feedback'ten zincir: `AIEmbedding` (2365), `AIFeedbackCorrection` (2384), `ActionItem` (1317), `RemedyOffer` (1342), `AIQualitySample` (2222) hepsi Cascade.
- `prisma/schema.prisma:1586-1587` — `Consumption.customer` ve `Consumption.dealer` Cascade → bayi silinince tüm müşteri tüketimleri/yorumları, müşteri silinince bayinin ciro geçmişi gider.
- `prisma/schema.prisma:1118` — `AuditLog.user … onDelete: Cascade`. `app/api/admin/users/route.ts:676` ve `app/api/admin/users/bulk/route.ts:79` kullanıcıyı hard delete ediyor → kişinin kendi denetim izi de silinir. `lib/gdpr-core.ts:162-169` KVKK anonimleştirme kanıtını da aynı `userId` ile yazıyor; sonradan silinirse KVKK kanıtı kaybolur.
- `app/api/admin/cards/[id]/route.ts:192-213` — kart silme `cardAuditLog.deleteMany` ile denetim kaydını **bilerek** siliyor.
- `app/api/user/delete-account/route.ts:32-39` — DEALER ve ADMIN rolleri de kendi hesabını silebiliyor; feedback anonimleştirme ile `user.delete` aynı transaction'da değil. ADMIN silinirse `CompanyTask.createdBy` (2900), `CardBatch.createdBy` (1667), `Webhook`/`ApiKey.createdBy` (1225/1242) cascade ile ekip görevleri ve entegrasyonlar da gider.
- Katalog: `UserReward.reward` (708), `UserBadge.badge` (638), `UserQuest.quest` (673), `Donation.project` (1711) Cascade; silme uçları `app/api/gamification/rewards/[id]/route.ts:118`, `badges/[id]/route.ts:127`, `quests/[id]/route.ts:111`. Admin bir ödülü silince müşterilerin puanla aldığı ödüller ve kupon kodları kaybolur (puan iadesi yok).

**Sorun.** Kullanıcı tarafından üretilmiş içerik ve finansal/denetim kayıtları, "sahip" varlığın yaşam döngüsüne bağlanmış. Ürün düzeyinde sonuç: (a) bayi kötü yorumları QR silerek kalıcı olarak yok edebilir (platformun güven vaadine aykırı), (b) müşteri rozet/karakter sayaçları ve geçmişi habersizce küçülür, (c) denetim/KVKK kanıt zinciri kopar.

**Öneri (hedef davranış).**
1. **Kayıt-sistemi tablolarında cascade'i kaldır.** `Feedback`, `ConsumptionReview`, `Consumption`, `RemedyOffer`, `UserReward`, `UserBadge`, `Donation`, `AuditLog`, `CardAuditLog` için `onDelete: Restrict` (veya `SetNull` + snapshot alanları). Silme yerine yaşam döngüsü: `QRCode` zaten `isActive/revokedAt/expiresAt` taşıyor → QR "silme" UI'da **arşivle/iptal et** olmalı; hard delete yalnızca hiç feedback almamış QR'da.
2. **Kullanıcı silme = anonimleştirme.** `delete-account` ve admin silme uçları `lib/gdpr-core.ts#anonymizeUser` akışına yönlendirilmeli; hard delete yalnızca sıfır ilişkili (ör. doğrulanmamış, hiç işlem yapmamış) hesaplar için. Rol bazlı kural: DEALER/ADMIN self-delete kapalı, destek talebiyle yürütülür.
3. **AuditLog'u kullanıcıdan bağımsızlaştır.** `userId String?` + `onDelete: SetNull` + `actorEmailSnapshot`/`actorRoleSnapshot`; sistem aksiyonları için `actorType` (`user|system|cron`). Kart denetim kayıtları silinmez, kart `BLOCKED/ARCHIVED` olur.
4. **Katalog için soft-archive.** `Reward/Badge/Quest/DonationProject` silme → `isActive=false` + `archivedAt`; kullanıcı sahiplikleri korunur.

**Efor:** L (şema + ~10 silme ucu + UI metinleri + göç).

---

### B2 — KRİTİK · `CustomerLifetimeValue` platform geneli; bayiye rakip işletme verisi sızıyor

**Kanıt**
- `prisma/schema.prisma:2069-2087` — `CustomerLifetimeValue.userId @unique` (bayi boyutu yok).
- `lib/clv-core.ts:79-86` — `consumption.groupBy({ by: ['customerId'] })` **dealer filtresi olmadan** tüm platform toplamı; `:131-161` segment ataması da bu toplamdan.
- `app/api/dealer/customers/route.ts:53-87` — bayi, kendi müşterilerinin CLV satırını (`totalSpent`, `totalVisits`, `avgOrderValue`, `lastPurchaseAt`, `segment`) olduğu gibi alıyor; `app/api/dealer/segment-actions/route.ts:49-56` segment aksiyonlarını da buna göre kuruyor.

**Sorun.** Bir müşteri A kafesinde 4.900 TL, B kafesinde 200 TL harcadıysa B bayisi bu müşteriyi "VIP" ve 5.100 TL harcamış olarak görür. Bu hem **kiracılar arası ticari veri sızıntısı** (rakibin ciro sinyali) hem de yanlış iş kararı (segment kampanyaları yanlış kitleye gider).

**Öneri.** CLV'yi `(dealerId, customerId)` düzeyine taşı: `DealerCustomerStats { dealerId, customerId, totalSpent, visits, avgOrderValue, firstAt, lastAt, predictedChurn, segmentKey, calculatedAt; @@unique([dealerId, customerId]); @@index([dealerId, segmentKey]); @@index([dealerId, predictedChurn]) }`. Hesaplama `groupBy(['dealerId','customerId'])` ile; churn sinyali de bayi kapsamlı (`Feedback`/`ConsumptionReview` → dealer join). Platform geneli CLV yalnız admin analitiğinde kalsın. Bayiye müşteri e-postası gösterimi de ayrıca KVKK açısından gözden geçirilmeli (`dealer/customers/route.ts:73-75`).

**Efor:** M.

---

### B3 — YÜKSEK · Puan ekonomisinin değişmez bir defteri (ledger) yok; bazı yollar görünmez, bakiye eksiye düşebilir

**Kanıt**
- `prisma/schema.prisma:47` — `User.points Int @default(0)`; DB seviyesinde `>= 0` kısıtı yok, puan hareket tablosu yok.
- Tek "defter" `AnalyticsEvent` (`:1028-1045`) içindeki `event='points_credited'` satırları; fraud dedektörleri (`lib/points-caps.ts`, `lib/points-velocity.ts`) yalnız buna bakıyor.
- Bu tablo silinebiliyor: `lib/analytics-event-retention.ts:18-26` (90 gün, **tüm event'ler**), `app/api/internal/inngest/analytics-event-cleanup/route.ts:16` + `app/api/admin/analytics/cleanup-events/route.ts`. Oysa `app/api/cron/db-cleanup/route.ts:10-11` "Ekonomi/fraud verisi (points_credited, AnalyticsEvent) SİLİNMEZ" diyor — iki kod yolu birbiriyle çelişiyor. (Inngest zamanlayıcısının canlıda çalışıp çalışmadığı **doğrulanmadı**; çalışıyorsa ekonomi izi 90 günde silinir, çalışmıyorsa AnalyticsEvent sınırsız büyür.)
- `points_credited` yazmayan kredi yolları: `app/api/dealer/consumptions/route.ts:334-350` (tüketim pasif puanı, `$transaction` içinde ham `increment`), `app/api/admin/users/route.ts:400-404` (admin `add_points`).
- `app/api/admin/users/route.ts:43-48` — `amount: z.number()` sınırsız ve negatif olabilir; `:403` `increment: data.amount` → bakiye eksiye düşer; puan güncellemesi, bildirim ve audit ayrı ayrı (transaction dışı) yazılıyor.
- Aynı denormalizasyon diğer sayaçlarda: `Squad.totalPoints/treasuryPoints` (404, 410), `DonationProject.current` (1684), `ReferralCode.usageCount` (1746), `Coupon.usedCount` (1477) — hepsi `increment` ile tutuluyor, kaynak satırlarla mutabakatı yapan bir iş yok (ör. kullanıcı silinince `Donation` cascade olur ama `current` düşmez).

**Sorun.** Bir kullanıcının "bu 1.240 puan nereden geldi?" sorusu 90 gün sonra cevaplanamaz; müşteri desteği, fraud incelemesi ve muhasebe mutabakatı mümkün değil. Görünmez kredi yolları, fraud eşiklerini aşan davranışı gizler.

**Öneri (hedef mimari).**
- `PointsLedger { id, userId, delta Int, balanceAfter Int, reason (enum: feedback, consumption, spin, quest, badge, referral, donation, purchase, admin_adjust, battle_escrow, battle_payout, refund …), refType, refId, actorId?, idempotencyKey @unique, createdAt; @@index([userId, createdAt]); @@index([reason, createdAt]) }` — yalnız eklenir, asla silinmez/güncellenmez.
- `lib/points-wallet.ts` tek giriş noktası olur: `creditPoints/debitPoints` aynı transaction'da hem `User.points` günceller hem ledger satırı yazar; `points_credited` event'i ve fraud dedektörleri ledger'dan okur. Ham `points: { increment }` kullanımı lint kuralıyla yasaklanır (`app/api/dealer/consumptions`, `admin/users`, `users-automation/engine.ts:64` dahil).
- Postgres `CHECK (points >= 0)` (ham SQL göçü) + admin düzeltmesi için `debitPoints` (yetersizse 409) ve zorunlu `reason`.
- Gece mutabakat işi: `SUM(ledger.delta) = User.points`, `SUM(Donation.points) = DonationProject.current` vb.; sapma `SecurityAlert` üretir.
- AnalyticsEvent saklama politikası ekonomiden ayrılır (ledger kalıcı, analitik 90 gün).

**Efor:** L.

---

### B4 — YÜKSEK · Şema göçlerle değil `db push` ile yönetiliyor; tekrar üretilebilir veritabanı yok

**Kanıt**
- `prisma/migrations/` — yalnız `20260512140000_add_auth_email_token`, `20260621000000_security_economy_atomic_guards`, `20260621010000_minigame_admin_config`, `20260621020000_perf_indexes`. İlk göç bile `REFERENCES "User"` içeriyor ama `User` tablosunu oluşturan göç yok.
- `package.json:18` `"db:push": "prisma db push"`; `docs/RUNBOOK.md:10` "Gerekirse `prisma db push`"; şemanın 61 commit'lik geçmişinde (ör. `2b5bed7` "canlı şema onaylandı") `InboxMessage.isBounce/threadRoot`, `ConsumptionReview.churnRisk`, ekip modülü tabloları gibi eklemelerin hiçbiri göç olarak yok.
- Bellek notu: lokal `DATABASE_URL` canlı Neon'u gösteriyor → `db push` doğrudan üretime uygulanıyor.

**Sorun.** Yeni bir ortam (staging, PR preview, yerel geliştirme, felaket kurtarma) göçlerden kurulamaz; şema değişikliği gözden geçirilebilir bir SQL olarak kalmıyor; `db push` veri kaybı uyarısıyla tek komutta canlı tabloyu düşürebilir; ham SQL gerektiren kısıtlar (CHECK, kısmi index, pgvector) sürdürülemez.

**Öneri.**
1. Canlı şemadan **baseline** üret: `prisma migrate diff --from-empty --to-schema-datamodel` ile `0000_baseline/migration.sql`, canlıda `prisma migrate resolve --applied 0000_baseline` (yalnız kayıt; veri değişmez). Mevcut 4 göç baseline'a katlanır.
2. Bundan sonra yalnız `migrate dev` (yerel/dal DB) + `migrate deploy` (CI/Vercel build öncesi ayrı adım). Neon **branch** özelliğiyle her PR için geçici DB.
3. Lokal `.env` canlı yerine Neon dev branch'ine bakar; canlı `DATABASE_URL` yalnız Vercel'de.
4. Göç PR şablonu: geri alma notu + veri dönüşümü + kilit süresi tahmini.

**Efor:** M (bir kerelik baseline + süreç).

---

### B5 — YÜKSEK · Soft-delete sorgu bazında "hatırlanmaya" bırakılmış; istatistikler silinmiş yorumları sayabiliyor

**Kanıt**
- `prisma/schema.prisma:830` `Feedback.deletedAt`; tek soft-delete yazımı `app/api/admin/feedbacks/route.ts:368`.
- Filtresiz örnekler: `app/api/dealer/ai-chat/route.ts:104-108` (`feedback.aggregate({ where: { qrCode: { dealerId } } })` — AI sohbet bağlamındaki ortalama ve adet), `app/api/dealer/onboarding/route.ts:36`. Diğer uçlar (`copilot-summary:43`, `ask-analytics:63`) filtreyi doğru koyuyor — yani davranış uca göre değişiyor.
- 226 `feedback.find*/count/aggregate/groupBy` çağrısı var; filtre her birinde elle yazılmak zorunda.

**Sorun.** Admin'in moderasyonla kaldırdığı (ör. toksik/sahte) yorum, bazı panellerde ortalamaya ve AI bağlamına girmeye devam eder; aynı bayi için iki ekranda farklı ortalama görülür.

**Öneri.** Prisma Client extension (`$extends({ query: { feedback: { findMany, count, aggregate, groupBy, findFirst } } })`) ile varsayılan `deletedAt: null` enjeksiyonu + açıkça `withDeleted()` kaçış yolu; ya da Postgres view (`ActiveFeedback`). Aynı politikayı B1'deki arşivlenen varlıklar (QR, ödül, rozet) için de tek yerden uygula. Bir test: "silinmiş feedback hiçbir dealer ucunun toplamına girmez".

**Efor:** M.

---

### B6 — YÜKSEK · Para alanları `Float`; para birimi ve kuruş hassasiyeti modellenmemiş

**Kanıt** — `Product.price` (1555), `Consumption.amount` (1580), `PricingPlan.price/pricePerBranch` (1434/1440), `Coupon.value/minPurchase` (1474-1475), `UserVIPStatus.totalSpent` (1797), `CustomerLifetimeValue.totalSpent/avgOrderValue` (2072/2074), `HeatmapData.revenue` (2108), `DealerFlashOffer.value` (2699). `currency` yalnız `PricingPlan`'da (1435). `RemedyOffer.selectedValue` (1338) sayısal değeri `String` olarak tutuyor.

**Sorun.** Ciro toplamları (`consumption.groupBy _sum.amount`, `lib/clv-core.ts:79`) ikili kayan nokta hatası biriktirir; Stripe tamsayı minor-unit ile çalışır; çok şubeli/çok ülkeli büyümede para birimi belirsiz.

**Öneri.** Tüm para alanlarını `Int` kuruş (`amountMinor`) veya `Decimal @db.Decimal(12,2)` yap; satır bazında `currency String @default("TRY")`. Göç: yeni sütun ekle → `ROUND(amount*100)` ile doldur → kodu yeni alana çevir → eskisini kaldır. `RemedyOffer` için `selectedValue Int` + `selectedUnit`. Telafi seçenekleri (`options Json`, `RemedyTemplate.values Json`) için Zod şeması.

**Efor:** M.

---

### B7 — YÜKSEK · Büyüyen tablolarda saklama/temizlik politikası eksik ve tutarsız

**Kanıt (mevcut temizlik)** — `app/api/cron/db-cleanup/route.ts:31-46` (AuthEmailToken, RateLimitCounter, okunmuş Notification >30g), `app/api/cron/cleanup-counters/route.ts:31-50` (RateLimitCounter, SessionTokenUsage >30g, IdempotencyKey, test InternEmailSend >90g).

**Temizliği olmayan, satır üreten tablolar:**

| Tablo | Büyüme kaynağı | Kanıt |
|---|---|---|
| `AnalyticsEvent` | 54 `create` noktası | saklama Inngest'e bağlı (B3) |
| `AuditLog` | 88 yazma | politika yok |
| `Notification` (okunmamış) | kampanya fan-out `createMany` (`dealer/campaigns/[id]/send:107`, `win-back:157`, `segment-proposals/[id]/send:70`) | okunmamışlar sonsuza kadar |
| `PushNotificationLog` | `lib/push.ts:98` | okunmuyor bile (B9) |
| `UserSurpriseBox` | günlük giriş kutusu (`dayKey`, 274) — aktif kullanıcı × gün | politika yok |
| `MiniGameSession`, `DailySpin`, `GameStreakClaim` | günlük | politika yok |
| `OutboxEvent` | işlenmiş satırlar silinmiyor (`lib/outbox.ts:49-52`) | — |
| `AIUsageLog`, `QraChatLog`, `CardAuditLog`, `SuspiciousActivity`, `SecurityAlert`, `TaskActivity`, `InboxMessage` (`bodyHtml @db.Text`) | olay başına | politika yok |
| `VerificationToken` | kayıt başına | süresi geçenler hiç silinmiyor |
| `Settings` `user_settings_<id>` satırları | kullanıcı başına | kullanıcı silinince yetim kalır (FK yok) |

**Tutarsızlıklar:** `cleanup-counters` kilitli lockout kovalarını korurken (`lockedUntil: null` şartı, `:33-35`), hemen ardından çalışan `db-cleanup` aynı tabloyu bu şart olmadan siliyor (`:37-39`) — iki iş aynı orkestratörde (`cron/daily/route.ts:56-57`). `lib/token-replay.ts:13` "cleanup cron'u 30 günden eski kayıtları siliyor" diyor; bu `cleanup-counters`'ta doğru, ama yorumlar iki dosyaya dağılmış.

**Öneri.** Tek bir `lib/retention-policy.ts` tablosu: `{ model, field, keepDays, where?, archive? }`; `cron/daily` bunu batch'li (`take`/döngü, 50k satır sınırı) uygular ve sonucu `AuditLog`'a özet yazar. Önerilen başlangıç: AnalyticsEvent 180g (ekonomi hariç → ledger), okunmamış Notification 180g, PushNotificationLog 30g, OutboxEvent işlenmiş 7g, AIUsageLog 365g (fatura analizi için aylık özet tablosuna roll-up), QraChatLog 90g, MiniGameSession/DailySpin/UserSurpriseBox 180g (turnuva/claim tabloları kalıcı), VerificationToken süresi geçen. AuditLog/CardAuditLog: silme yok, 12 ay sonra R2'ye aylık JSONL arşiv (mevcut `scripts/db-backup-json.mjs` desenine benzer). Lockout koruma şartı tek yerde.

**Efor:** M.

---

### B8 — ORTA · Index sağlığı: ~51 gereksiz index, 25 index'siz FK, eksik sıralama sütunları

**Gereksiz (unique ile aynı ya da composite'in öneki):** örnekler — `User @@index([email])` (239, `email @unique`), `QRCode @@index([code])` (738), `PhysicalCard @@index([token])` (1526), `Coupon @@index([code])` (1483), `ReferralCode @@index([code])` (1753), `Page @@index([slug])` (1395), `FeatureFlag @@index([key])` (985), `TeamTag @@index([slug])` (3032), `ExperienceShareToken @@index([token])` (2783), `ConsumptionReview @@index([consumptionId])` (1626), `Squad @@index([ownerId])` (421), `DealerStaff @@index([userId])` (2448); önek tekrarları — `Feedback [qrCodeId]` & `[userId]` (841-842), `Notification [userId]` (1003), `Consumption [customerId]/[dealerId]` (1592-1593), `ConsumptionReview [customerId]` (1627), `MiniGameSession [userId]`, `User [role]` (240), tüm `@@unique([userId, X])` modellerindeki `@@index([userId])`. Ayrıca düşük seçicilikli tek-sütun boolean index'ler (`isActive`, `isRead`, `isPublic` vb.). En sıcak yazma tablosu `Feedback` 12 index taşıyor, `AuditLog` 6, `AnalyticsEvent` 5.

**Index'siz FK (Postgres FK'yi otomatik indexlemez; kullanıcı silmede her biri tablo taraması):** `CompanyTask.createdById/approvedById`, `TaskComment.authorId`, `TaskActivity.actorId`, `TaskAttachment.uploadedById`, `TaskCommentReaction.userId`, `TaskChecklistItem.assignedToId`, `TeamAutomation.createdById`, `SquadBattleParticipant.squadId/userId`, `UserCosmetic.cosmeticId`, `ActionItem/Incident/CSMTask.assignedToId`, `TablePulse.customerId`, `ExperienceShareToken.creatorId`, `User.pricingPlanId`, `UserAutomationRule.updatedById/approvedById`, `UserAutomationRun.triggeredById`, `UserSurpriseBox.sentByUserId`, `DataSubjectRequest.userId`, `QuickScanPreset.productId`, `DealerFavoriteProduct.productId`, `CustomerLifetimeValue.segmentId`.

**Sorguya uymayan index:** `ApiKey` doğrulaması `keyHash` ile yapılıyor (`lib/partner-api-auth.ts:23-26`) ama index `keyPrefix`'te (1244), `keyHash` unique bile değil. `AIEmbedding` KNN sorgusu `orderBy createdAt desc` (`lib/ai-learning.ts:184-189`) fakat index `[dealerId, model, dimension]` (2371) — `createdAt` eklenmeli.

**Öneri.** Tek seferlik "index diyeti" göçü: gereksizleri düşür, FK index'lerini ekle, `ApiKey.keyHash @unique`. Karar canlı `pg_stat_user_indexes.idx_scan` ile doğrulanmalı (bu denetimde DB'ye dokunulmadı → **sayılar şemadan çıkarıldı, kullanım istatistiği doğrulanmadı**). Büyük tablolarda `CREATE INDEX CONCURRENTLY` ham SQL göçüyle.

**Efor:** S-M.

---

### B9 — ORTA · Ölü/yarım modeller şemayı ve zihinsel yükü şişiriyor

**Kanıt** — Bölüm 2.3 tablosu. Ek olarak:
- `OutboxEvent`: DLQ alanları yeni eklenmiş (349-351) ama üretici yok; feedback analizi artık `after()` ile yapılıyor (bellek notu 2026-08-13). `app/api/admin/health/route.ts:40-41` hep 0 bekleyen gösterir → yanlış güven.
- `DailyDealerStats`: pre-aggregation hesaplanıp kimse okumuyor; dashboard'lar hâlâ canlı `groupBy` yapıyor.
- `DealerOnboardingEvent`: "install-to-value" metriği tasarlanmış ama hiç yazılmıyor.
- `FileUpload`: R2'ye yüklenen dosyaların (avatar, feedback medya, inbox ekleri) kaydı yok → yetim nesne tespiti imkânsız; `deleteFromR2` yalnız görev eki tekil silmede çağrılıyor (`app/api/admin/team/tasks/[id]/attachments/route.ts:209`).
- `Theme` ve `MenuItem`: tema ve menü `Settings` anahtarlarına taşınmış (`lib/theme-settings-keys.ts:24`, `lib/visibility-controls.ts:38-40`), modeller kalmış.
- `DealerFlashOffer.redemptionCount/maxRedemptions`: kullanım akışı yok ama `nearby` listesi (`app/api/customer/innovation/nearby/route.ts:73`) ve süre-dolum işi (`dealer-flash-offer-expiry/route.ts:30`) bu alanlara güveniyor.

**Öneri.** Her biri için karar: **(a) bağla** — `DailyDealerStats`'ı bayi dashboard'unun kaynağı yap (canlı groupBy yerine, bugün için canlı + geçmiş için tablo); `FileUpload`'ı tüm R2 yüklemelerinin tek kaydı yap (`ownerType/ownerId`, `deletedAt`, haftalık yetim temizliği); flash teklif için `FlashOfferRedemption {offerId, userId, @@unique}` + atomik `redemptionCount` artışı. **(b) kaldır** — `Theme`, `MenuItem`, `DealerFavoriteProduct`, `Session` (JWT kalıcıysa), `OutboxEvent` (ya da gerçekten feedback create transaction'ına bağla). Kaldırma, B4'teki baseline sonrası düzgün bir göçle.

**Efor:** M.

---

### B10 — ORTA · `Settings` tablosu tipsiz anahtar-değer deposu; kiracı/kullanıcı verisi tek JSON'da

**Kanıt**
- 28+ farklı anahtar (`SEO_SETTINGS_KEY`, `moduleControls`, `featureVisibility`, `points_matrix`, `league_rules`, `admin_gate`, `intern_task_emails`, `activeSeasonalConcept` …), 107 erişim.
- `lib/innovation-dealer-prefs.ts:24-55` — **tüm bayilerin** tercihleri tek satırda `{ [dealerId]: prefs }`; read-modify-write → iki bayi aynı anda kaydederse biri diğerinin değişikliğini ezer; satır sınırsız büyür, bayi silinince temizlenmez.
- `app/api/customer/settings/route.ts:98-104` ve `lib/notify-email.ts:32-38` — kullanıcı başına `user_settings_<userId>` satırı; aynı anda `User.notificationPrefs` (46) da e-posta kanal tercihi tutuyor. İki kaynak: kullanıcı bir yerden e-postayı kapatsa da diğer yolu kullanan bildirim gönderilebilir (İYS/KVKK izin riski).
- `normalize*` yardımcıları (`lib/admin-gate.ts:29`, `lib/points-rules.ts:150` vb.) iyi bir başlangıç ama anahtar → şema eşlemesi merkezi değil.

**Öneri.** (1) Platform yapılandırması `Settings`'te kalsın ama `lib/settings-registry.ts`: `{ key, zodSchema, defaults, category, cacheTag }` — tüm okuma/yazma bu kayıttan, Zod doğrulamasıyla. (2) Kiracı/kullanıcı verisini çıkar: `DealerPreference { dealerId @unique, … }` ve `UserPreference { userId @unique, notifications Json(Zod), locale, … }` FK + cascade ile. (3) Bildirim tercihini **tek kaynak** yap (`UserPreference.notificationChannels`), `notify-email.ts` ve `notification-prefs.ts` aynı fonksiyondan okusun; göçte iki kaynağın "en kısıtlayıcısı" alınsın.

**Efor:** M.

---

### B11 — ORTA · 86 `Json` alanının tip güvencesi yok; AI çıktıları ve iş kuralları ham JSON

**Kanıt** — `Feedback` tek başına 10 Json alan taşıyor (`media, emotions, topics, aiAnalysis, entities, themes, statementSentiments, actionSuggestions`; 773-794), `aiAnalysis` "legacy compat" olarak diğerlerini tekrar ediyor (781). İş kuralı taşıyan Json'lar: `Badge.requirement` (611), `Quest.requirement/reward` (651-652), `UserAutomationRule.condition/actions` (1134-1135), `AutoReplyRule.condition` (2584), `RemedyOffer.options` (1336), `HappyHour.daysOfWeek` (1820), `User.dealerRemedyAutomation/dealerChurnIntervention` (94-96). Kodda Json alanlarına 53 doğrudan `as Tip` dönüşümü ve en az 10 dosyada ad-hoc `Array.isArray(f.topics)` savunması var (`app/api/admin/analytics/route.ts`, `app/api/dealer/analytics/route.ts`, `lib/weekly-digest-core.ts` …). Bellek notundaki "JSON-forEach 500" hatası bu desenin sonucu.
- `AIConversation.messages` (2176) tüm sohbeti tek JSON dizisinde tutuyor; her mesajda tüm dizi okunup yeniden yazılıyor (`app/api/customer/ai-chat/route.ts:158-168`) → eşzamanlı isteklerde mesaj kaybı, sınırsız satır boyutu. Aynı dosya `:173` "AIConversation dealerId alanı userId olarak kullanılır" — müşteri sohbetleri `dealerId` sütununa müşteri id'siyle yazılıyor (anlamsal karışıklık; admin "bayi sohbet" metrikleri müşteri sohbetlerini de sayar).
- `AIEmbedding.vector Json` (2360) → KNN, en yeni 1000 vektörü belleğe çekip JS'te kosinüs hesaplıyor (`lib/ai-learning.ts:184-189`); eski benzer yorumlar görünmez, maliyet O(N).

**Öneri.**
- `lib/db-json/` altında her Json alan için Zod şeması + `readJson(model.field, value)` decoder (geçersizse varsayılan + Sentry uyarısı); yazma tarafında da aynı şema. Prisma tiplerini `prisma-json-types-generator` ile şemaya bağla.
- Sorgulanan AI çıktıları normalize edilsin: `FeedbackTopic { feedbackId, topic, sentiment, score; @@index([topic]) }`, `FeedbackTheme`; `aiAnalysis` legacy alanı göçle kaldırılsın.
- `AIConversation` → `AIConversation { ownerType: CUSTOMER|DEALER, ownerId }` + `AIMessage { conversationId, role, content, createdAt }` satır bazlı.
- Embedding'ler için Neon'un desteklediği `pgvector`: `vector vector(768)` (`Unsupported("vector")` + ham SQL göç), HNSW index, `ORDER BY embedding <=> $1 LIMIT k`.

**Efor:** L (kademeli).

---

### B12 — ORTA · Normalizasyon: aynı kavramın birden çok modeli, FK'siz "yumuşak" referanslar

**Paralel kavramlar**
- **Seri (streak):** `User.loginStreak*` (58-62), `UserStreak` (1760), mini-oyun serisi (`GameStreakClaim` 1066 + `MiniGameSession`). Üç ayrı "seri" tanımı, kullanıcıya üç farklı sayı.
- **Görev/aksiyon:** `Incident`, `CSMTask`, `ActionItem`, `StaffTask`, `CompanyTask` — beş görev tablosu, beş farklı `status` sözlüğü.
- **Kampanya/promosyon:** `Campaign`, `SegmentCampaignProposal`, `SeasonalCampaign`, `HappyHour`, `DealerFlashOffer`, `Coupon`.
- **Güvenlik olayı:** `SuspiciousActivity` vs `SecurityAlert`; **API erişimi:** `ApiKey` vs `Partner.apiKeyHash` (1459).
- **Gün temsili:** `DailySpin.day @db.Date` (1052), `MiniGameSession.dayKey String` (497), `UserSurpriseBox.dayKey String` (274), `loginStreakLastDay DateTime` (60) — hepsi UTC; Türkiye'de "gün" 03:00'te dönüyor.
- **Etiketler:** `CompanyTask.tags` CSV string (2868) iken merkezi `TeamTag` (3025) tablosu var; ilişki tablosu yok.
- **Departman:** `User.adminDepartment` (39), `CompanyTask.department` (2866), `TaskTemplate.department`, `TeamAutomation.department` string slug; FK yalnız `UserDepartment.departmentSlug` (2853).

**FK'siz referanslar (yetim kalabilir, join edilemez):** `CouponRedemption.userId/couponId` (1490-1498 — ilişki tanımı yok), `GameStreakClaim.userId`, `TournamentRewardClaim.userId`, `SeasonalChallengeClaim.userId/campaignId`, `PhysicalCard.batchId` (1513 ↔ `CardBatch`), `SquadBattle.winnerId/challengedById` (449, 458), `SeasonalCampaign.challengeRewardBadgeId` (1848), `User.featuredCharacterBadgeId` (42), `AIThemeCluster/AIInsightReport/AIUsageLog.dealerId`, `AgentRun.createdById`, `SegmentCampaignProposal.decidedById`, `SurveyResponse.userId`, `StaffChecklistCompletion.shiftId`, `CompanyTask.recurrenceParentId`, `InternEmailSend.sentByUserId`.

**Durum sözlükleri:** yalnız 2 enum var; `status/type/severity` alanları serbest string ve büyük-küçük harf karışık (`Referral.status 'PENDING'` 1727 vs `RemedyOffer.status 'pending'` 1335; `SuspiciousActivity.severity 'LOW'` vs `Incident.severity 'low'`).

**Öneri.** (1) Claim tablolarına ve ID taşıyan alanlara gerçek `@relation` ekle (claim'lerde `onDelete: Restrict` — ekonomi kanıtı). (2) Durum alanlarını Prisma enum'larına çevir (önce en kritik: RemedyOffer, Referral, SquadBattle, CompanyTask, Incident). (3) Gün anahtarı için tek yardımcı `dayKeyTR(date)` (`Europe/Istanbul`) ve tek tip (`@db.Date`); geçiş kararı ürün kararıdır ("günlük hak gece 00:00 TR'de yenilenir"). (4) `TaskTag` ilişki tablosu; `department` için `Department.slug` FK. (5) Görev ailesi için uzun vadede ortak `WorkItem` çekirdeği (sahip, durum, atanan, vade, kaynak) + tür-özel uzantılar — yalnız ürün yol haritası bunu gerektirirse.

**Efor:** L (kademeli).

---

### B13 — ORTA · Isı haritası saatleri UTC saklanıyor ve UTC gösteriliyor (TR'de 3 saat kayık)

**Kanıt** — `lib/heatmap-track.ts:24-26` `getUTCHours()/getUTCDay()`; okuma `app/api/dealer/heatmap/route.ts:31-41` dönüşümsüz; `app/dealer/heatmap/page.tsx:326` "Zirve: {hour}:00" olarak gösteriyor. `HeatmapData.dayOfWeek` (2106) `date`'ten türetilebilir (denormalize) ve UTC gününe göre; TR'de 00:00-03:00 arası olaylar önceki güne yazılıyor.

**Sorun.** Bayi "en yoğun saat 09:00" görür, gerçek 12:00'dir; personel planlaması yanlış veriyle yapılır.

**Öneri.** Kovalama `Europe/Istanbul` (veya `User.timezone`) ile; `HeatmapData`'ya `tz String` ya da yerel saat semantiği; mevcut satırlar için tek seferlik +3 saat kaydırma göçü (DST'siz TR için güvenli). `dayOfWeek`'i kaldırıp sorguda türetmek veya yerel günden yazmak.

**Efor:** S.

---

### B14 — DÜŞÜK · Hassas alanlar ve küçük bütünlük boşlukları

- `VerificationToken.token` ham saklanıyor (`app/api/auth/register/route.ts:75-82`), oysa `AuthEmailToken` hash saklıyor (371) — tutarsız desen.
- `User.twoFactorSecret` (233) ve `DealerStaff.pinCode` (2437) düz metin; PIN bayi UI'ına geri dönüyor (`app/dealer/team/page.tsx:243`). Uygulama katmanı şifrelemesi (AES-GCM, `ENCRYPTION_KEY`) veya PIN için hash önerilir.
- `RemedyOffer.feedbackId` / `consumptionReviewId` (1329-1330) "biri dolu olmalı" kuralı DB'de yok → ham SQL `CHECK (num_nonnulls(...) = 1)`.
- `Feedback.rating` (771), `npsScore` (774), `ConsumptionReview.rating` (1606) için aralık kısıtı yok (Zod var; DB `CHECK` savunma derinliği sağlar).
- `InboxMessage @@unique([mailbox, uid])` (966) — IMAP `UIDVALIDITY` saklanmıyor; sunucu UID'leri sıfırlarsa yeni mailler "zaten var" sayılıp atlanır. `uidValidity Int` alanı + unique'e dahil etme.
- `UserAutomationRun.idempotencyKey` / `AutomationJob.idempotencyKey` (1166, 1195) unique değil; `lib/users-automation/queue.ts:11-22` bul-sonra-oluştur yarışına açık → kısmi unique index.
- `AIThemeCluster.subTheme` nullable ama unique'te (2138); kod `''` kullanarak NULL-distinct tuzağından kaçıyor (`app/api/ai/analyze/route.ts:341`) — alan `String @default("")` yapılmalı.
- Tekil (singleton) tablolar (`GamificationSettings` 544, `AISystemLearningProfile` 2412) için tek satır garantisi yok (`id` sabit `"singleton"` deseni).
- `datasource` yorumu `connection_limit=1` diyor (11) — bellek notuna göre doğrusu 5; yanıltıcı yorum.

**Efor:** S.

---

## 4. Hedef Mimari / Tasarım Önerisi

```
┌─────────────────────── KAYIT SİSTEMİ (asla cascade silinmez) ───────────────────────┐
│ Feedback · ConsumptionReview · Consumption · RemedyOffer · PointsLedger · AuditLog │
│ CardAuditLog · *Claim tabloları · UserReward/UserBadge · Donation                   │
│   → onDelete: Restrict / SetNull + snapshot; yaşam döngüsü = archivedAt/deletedAt   │
└────────────────────────────────────────────────────────────────────────────────────┘
┌─────────────── KİRACI KAPSAMLI TÜRETİLMİŞ VERİ (yeniden hesaplanabilir) ──────────┐
│ DealerCustomerStats(dealerId,customerId) · DailyDealerStats · HeatmapData(TR saati)│
│ AIThemeCluster · AIInsightReport  → gece işleri + mutabakat kontrolü               │
└────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────── YAPILANDIRMA (tipli, kayıtlı) ─────────────────────────────┐
│ Settings (yalnız platform) + settings-registry(Zod) · DealerPreference · UserPref. │
└────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────── OLAY / TELEMETRİ (saklama politikalı) ─────────────────────┐
│ AnalyticsEvent · Notification · PushNotificationLog · AIUsageLog · QraChatLog …    │
│   → lib/retention-policy.ts + cron/daily batch temizlik + aylık R2 arşivi          │
└────────────────────────────────────────────────────────────────────────────────────┘
```

İlkeler:
1. **Para ve puan yalnız defterden geçer** (`PointsLedger`, tamsayı minor-unit para, `CHECK >= 0`).
2. **Her bayi verisi `dealerId` taşır** (Feedback'e denormalize `dealerId` + `[dealerId, deletedAt, createdAt]` index → 80 join kalkar; çapraz kiracı türetilmiş veri yasak).
3. **Silme bir ürün kararıdır**: kullanıcı içeriği arşivlenir, kişi anonimleştirilir, denetim izi kalır.
4. **Json yalnız gerçekten şemasız veri için**; sorgulanan/iş kuralı taşıyan alanlar ya kolon/ilişki ya Zod-doğrulamalı.
5. **Şema değişikliği = göç dosyası**; canlıya yalnız `migrate deploy`.

---

## 5. Adım Adım Geçiş Planı

| Faz | İçerik | Bağımlılık | Efor | Risk azaltma |
|---|---|---|---|---|
| **0 — Güvenlik ağı** (hemen) | Baseline göçü + `migrate resolve` (B4); lokal `.env`'i Neon dev branch'e çevir; tam yedek (`scripts/db-backup-json.mjs` / pg_dump) | — | M | Veri değişmez, yalnız göç kaydı |
| **1 — Veri kaybını durdur** | QR/ödül/rozet/görev silme uçlarını arşivlemeye çevir; `delete-account` ve admin silmeyi `anonymizeUser`'a yönlendir; kart silmede audit silmeyi kaldır; `AuditLog.userId` nullable + SetNull (B1) | Faz 0 | M | Önce kod (davranış), sonra şema cascade değişikliği |
| **2 — Kiracı sızıntısını kapat** | `DealerCustomerStats` + CLV hesaplamasını bayi kapsamına al; bayi uçlarını yeni tabloya çevir (B2) | Faz 0 | M | Eski tablo admin analitiğinde kalır |
| **3 — Ekonomi defteri** | `PointsLedger` + wallet tek giriş; ham increment'leri kaldır (consumptions, admin add_points, automation); `CHECK points>=0`; mutabakat işi; AnalyticsEvent saklamasını ekonomiden ayır (B3) | Faz 0 | L | Önce "çift yazım" (ledger + eski event) 2 hafta, mutabakat temiz çıkınca dedektörleri ledger'a geçir |
| **4 — Sorgu tutarlılığı** | Soft-delete Prisma extension (B5); Feedback'e `dealerId` denormalize + backfill + index; ısı haritası TR saati (B13) | Faz 1 | M | Backfill batch'li, `CONCURRENTLY` index |
| **5 — Para tipleri** | Float → Int kuruş/Decimal + currency (B6) | Faz 0 | M | Yeni sütun + çift okuma + kaldırma |
| **6 — Saklama politikası** | `lib/retention-policy.ts`, cron/daily entegrasyonu, R2 arşivi, lockout tutarsızlığı (B7) | Faz 3 (ekonomi izi ledger'a taşındıktan sonra) | M | Önce "dry-run sayım" modu |
| **7 — Şema temizliği** | Ölü modelleri kaldır/bağla (B9), index diyeti (B8, `pg_stat_user_indexes` ile doğrula), FK'siz referanslara ilişki (B12) | Faz 0 | M | Her kaldırma ayrı göç |
| **8 — Tip güvencesi ve normalizasyon** | Settings registry + Dealer/UserPreference + tek bildirim tercihi kaynağı (B10); Json decoder katmanı, `AIMessage`, pgvector (B11); enum'lar, gün anahtarı, TaskTag (B12); küçük bütünlük maddeleri (B14) | Faz 0 | L | Model model, kademeli |

Önerilen sıralama gerekçesi: Faz 0-2 **geri döndürülemez veri kaybını ve kiracı sızıntısını** durdurur (en yüksek iş riski); Faz 3 ekonominin denetlenebilirliğini kurar ve Faz 6'nın güvenle yapılabilmesinin ön koşuludur; kalan fazlar performans ve bakım kolaylığı içindir.

---

### Doğrulanmayan noktalar (açık not)
- Inngest zamanlanmış işlerinin (`analytics-event-cleanup`, `outbox-process`, `calculate-clv` vb.) canlıda gerçekten çalışıp çalışmadığı.
- Index'lerin gerçek kullanım istatistikleri ve tablo boyutları (DB'ye bağlanılmadı).
- `db push` ile canlıda oluşmuş şemanın `schema.prisma` ile birebir aynı olduğu (drift kontrolü `prisma migrate diff --from-url` ile Faz 0'da yapılmalı).

---

## Uygulama sonrası durum

> Yeniden denetim: 2026-10-11 · Dal: `feat/platform-overhaul` · Bu turun commit'leri: `a331f86d` (soft-delete bekçisi, ekonomi mutabakatı, ölü yazımlar, tercih/sohbet/otomasyon yarışları, şema bekçisi), `eecd43a4` (2FA sırrı mühürleme). Önceki dalgalarda kapanan maddeler şimdiki koda karşı yeniden doğrulandı (salt okuma `rg` + kaynak tarayıcılar; DB'ye bağlanılmadı). Şema değişikliği gerektiren kalıntılar `docs/audit/2026-10-08/SCHEMA-REQUESTS.md` → "veri-modeli (Dalga 3)" bölümünde.

### Bulgu bulgu

| # | Durum | Kanıt (şimdiki kod) |
|---|---|---|
| **B1** cascade ile içerik/denetim kaybı | **KAPANDI** (kod) · DB kısıtı şema isteğinde | Uygulama kodunda `user`/`qRCode`/`reward`/`badge`/`quest`/`donationProject`/`physicalCard`/`cardAuditLog`/`feedback`/`auditLog` için hiç `delete`/`deleteMany` yok (yalnız test laboratuvarı ve kasa geri alma). QR silme = arşiv (`app/api/qr-codes/[id]/route.ts`, `?confirm=archive` + etki önizlemesi); kullanıcı silme = `anonymizeUser` (`app/api/admin/users/route.ts`, `bulk`, `app/api/user/delete-account/route.ts`; ADMIN kendini silemez, yeniden doğrulama, KVKK kanıtı aynı tx'te); kart/ödül/rozet/görev/bağış = `archivedAt` (`lib/data-safety/archive.ts`). Göçler: `Feedback.qrCode → RESTRICT`, `AuditLog.userId SET NULL` + `actorSnapshot`. Kasa geri alma yalnız değerlendirmesiz tüketimi siler (`lib/dealer/kasa/server.ts`, denetim satırı + defterli iade). Kalan: `Consumption/UserReward/UserBadge/Donation/RemedyOffer/ConsumptionReview` FK'leri şemada hâlâ `Cascade` — tetikleyen silme yolu yok (uykuda); DB garantisi için `Restrict` şema isteği. |
| **B2** CLV kiracılar arası sızıntı | **KAPANDI** | Bayi tarafı yalnız `DealerCustomerStats(dealerId, customerId)` okur (`lib/dealer-customer-stats.ts`, `lib/dealer-customers/server.ts`); `customerLifetimeValue` yalnız admin segmentlerinde (`components/admin/a-segmentler/server/segments.ts`). |
| **B3** puan defteri yok | **KAPANDI** (CHECK şema isteğinde) | `PointsLedger` (kalıcı, `idempotencyKey @unique`, `balanceAfter`); tek giriş `lib/economy/mint.ts#mintPoints` + `lib/points-wallet.ts#debitPoints` — `User.points`'i değiştiren başka yol yok (çok satırlı tarama yalnız cüzdanı bulur; `creditPointsAndXp`'nin tek çağıranı `mint.ts`). Admin düzeltmesi `lib/economy/admin-adjust.ts` (gerekçe, tavan, 4 göz, eksi bakiye imkânsız). Ekonomi olayları saklama temizliğinden muaf (`lib/analytics-event-retention.ts`). **Bu tur:** gece mutabakatı `lib/economy/reconcile.ts` + `app/api/cron/economy-reconcile` (günlük orkestratör, öncelik 0): defter↔bakiye (10 dk sessiz pencere + ±60 sn küme), `DonationProject.current`↔`SUM(Donation.points)`, `Coupon.usedCount`↔`CouponRedemption`; sapma → `SecurityAlert` (`ECONOMY_*_DRIFT`), hiçbir şeyi değiştirmez (`__tests__/lib/economy-reconcile.test.ts`). Kalan: `CHECK (points >= 0)`. |
| **B4** db push ile şema yönetimi | **KISMEN** | Dalga 1'den beri değişiklikler idempotent göç dosyası (`prisma/migrations/20261008000000…0200`, `DEPLOY-RUNBOOK.md`). **Bu tur:** `npm run db:push` kapalı, `db:migrate` yalnız `QRATEX_DB_TARGET=dev` beyanıyla (`scripts/db-schema-guard.mjs`; lokal `.env` canlı Neon'u gösterdiği için `migrate dev`'in "sıfırla" önerisi felaket olurdu); README ve `docs/RUNBOOK.md`'den `db push` talimatı kaldırıldı. Kalan (operasyonel): baseline göçü + `migrate resolve --applied`, Neon dev branch'i. |
| **B5** soft-delete elle hatırlanıyor | **KAPANDI** | Bu tur ~45 filtresiz okuma düzeltildi (müşteri istatistik/eğilim, liderlik + ham SQL puan tahmini, rozet/görev/aktivite/karakter sayaçları, personel performansı, keşif sıralaması, partner özeti, AI öğrenme/sohbet/stüdyo, segment/haftalık özet, kanıt/vaka bağlama) + ilişki sayımları `feedbacks: { where: { deletedAt: null } }` (admin listeleri, liderlik, profil, rozet ilerlemesi, QR listesi). Bilinçli istisnalar gerekçe yorumu taşır (`/* soft-delete: … */`: KVKK dışa aktarım, kötüye kullanım bekleme süresi, silme önizlemesi, 409 güncel yanıtı). **Bekçi:** `__tests__/lib/soft-delete-guard.test.ts` — nesne `where`'li filtresiz okuma, `_count feedbacks: true` ve `deletedAt`'siz ham SQL CI'da düşer. Prisma `$extends` bilinçli seçilmedi (istemci tipini yüzlerce dosyada değiştirir). Bilinen ödün: liderlikte `orderBy feedbacks._count` süzülemez (Prisma sınırı; gösterilen sayı süzülü). |
| **B6** para `Float` | **KALDI** (şema) | Yeni tablolar `Decimal(14,2)` (`DealerCustomerStats`); eski para alanları `Float`. Göç planı şema isteğinde. |
| **B7** saklama politikası | **KAPANDI** (bilinçli kalıcı listesiyle) | Tek orkestratör `cron/daily`; `db-cleanup` (token, kilit korumalı RL kovası — iki iş artık aynı kural, okunmuş bildirim 30 g, An Motoru, KVKK saklama motoru: QRA sohbeti/push kaydı 180 g, bildirim 365 g), `cleanup-counters`, `analytics-event-cleanup` (ekonomi olayları hariç). **Bu tur:** süresi geçmiş eski `VerificationToken` silinir; anonimleştirmede kişiye bağlı `Settings` satırları (`user_settings_<id>`, `innovation_dealer_prefs_<id>`) silinir (yetim kalıyordu); `OutboxEvent`/`HeatmapData` yazımı kesildi. Bilinçli kalıcı: `AuditLog`, `CardAuditLog`, `PointsLedger`, claim tabloları, `MiniGameSession`/`DailySpin`/`UserSurpriseBox` (ömür boyu sayaç kaynağı). |
| **B8** index sağlığı | **KALDI** (şema) | Diyet listesi + `pg_stat_user_indexes` doğrulama şartı şema isteğinde; `ApiKey.keyHash @unique` mimari-api bölümünde. |
| **B9** ölü/yarım modeller | **KAPANDI** (kod) · tablo düşürme şema isteğinde | **Bu tur:** `lib/outbox.ts` + `outbox-process` ucu silindi, Komuta sağlık panelindeki kalıcı yeşil "Olay kuyruğu: Kuyruk boş" (sahte güvence) kaldırıldı (`lib/admin-command/*`); `HeatmapData` yazımı kesildi (`lib/heatmap-track.ts` silindi). `DailyDealerStats` yazan `/api/admin/preagg` emekli (410, mimari-api). `DealerFavoriteProduct`/`DealerOnboardingEvent`/`FileUpload`/`MenuItem`/`Theme`/`Session` referans taraması 0. |
| **B10** Settings tipsiz/kiracı verisi | **KAPANDI** | Platform ayar kayıt defteri `lib/platform-settings/registry.ts` (zod + parse + okuyucu testi; korunan anahtarlar). Bildirim tercihinde her tür×kanal hücresinin tek deposu var (`lib/customer-settings/notification-catalog.ts`). **Bu tur:** bayi inovasyon tercihi tek JSON haritası (oku-değiştir-yaz yarışı, sınırsız satır) yerine bayi başına satır (`lib/innovation-dealer-prefs.ts`, eski harita okuma yedeği). |
| **B11** Json tip güvencesi | **KISMEN** | Modül bazlı normalize ediciler (`lib/dealer-inbox/core.ts`, `lib/dealer-insights/core.ts` …), bayi asistanı sohbetinde iyimser kilit. **Bu tur:** müşteri AI sohbeti `updatedAt` iyimser kilit + bir yeniden deneme + 200 mesaj tavanı + `context.owner='customer'` (`app/api/customer/ai-chat/route.ts`). Kalan: merkezi decoder katmanı, `FeedbackTopic` normalizasyonu, `AIMessage` satır modeli, pgvector. |
| **B12** normalizasyon | **KISMEN** | Gün anahtarları TR saatinde (`Europe/Istanbul`/`istanbulDay`, günlük çark `dayKeyToDbDate`). Kalan: FK'siz referanslara `@relation`, durum enum'ları, `TaskTag`, `department` FK (şema isteği). |
| **B13** ısı haritası UTC | **KAPANDI** | Yoğunluk ekranı olay tablolarından `AT TIME ZONE 'Europe/Istanbul'` ile (`lib/dealer-analytics/load.ts`); UTC kova artık ne okunuyor ne yazılıyor. |
| **B14** hassas alanlar / küçük bütünlük | **KAPANDI** (kod) · CHECK/unique şema isteğinde | `VerificationToken` üretilmiyor (hash'li `AuthEmailToken`), eskiler bu tur süre dolunca silinir; `DealerStaff.pinCode` hash'li, API `****`. **Bu tur:** `User.twoFactorSecret` AES-256-GCM ile mühürlü (`lib/totp.ts` `sealTotpSecret/openTotpSecret`, tek çözme noktası `verifyTOTPStep`, eski düz kayıt uyumlu, çözülemeyen kayıt fail-closed; `__tests__/lib/totp-secret-seal.test.ts`); otomasyon işi kuyruğa alma anahtar başına `pg_advisory_xact_lock` (aynı anahtarla iki iş = çift puan yarışı, `lib/users-automation/queue.ts`). Kalan: `RemedyOffer`/rating `CHECK`, kısmi unique, `InboxMessage.uidValidity`, `datasource` yorumu. |

### Bu turda bulunan yeni sorunlar (dalga regresyonları)

- **Okuyucusuz `HeatmapData` yazımı:** yoğunluk ekranı olay tablolarına geçince UTC kova yazımı ölü kaldı; her olayda boşa upsert. Kesildi.
- **Komuta sağlık panelinde sahte yeşil:** gözlemlenebilirlik sayfası `outbox`'ı gizliyordu ama Komuta hâlâ "Kuyruk boş" gösteriyordu. Kaldırıldı.
- **Rozet ilerlemesi ve liderlikte silinmiş yorum:** `_count feedbacks: true` moderasyonla silinen spam'i sayıyordu (eşik/sıra şişmesi). Süzüldü.

### Doğrulama

- Tip denetimi (`tsc-check.mjs`) → 0 hata.
- jest: `soft-delete-guard`, `economy-reconcile`, `totp-secret-seal`, `cron-db-cleanup`, `admin-command`, `consumption-service`, `feedback-funnel`, `users-automation`, `user-erasure`, `privacy-requests-dsr`, `pii-registry`, `cron-daily`, `inngest-no-cron`, gözlemlenebilirlik → yeşil. Tam koşudaki diğer kırmızılar bu boyutun değil (önceden kırık `auth.test`/`menu-visibility-catalog` ve paralel güvenlik ajanlarının süren oran sınırı/CSRF işleri).

### Yeni puan: **8.5 / 10** (önce 5)

Gerekçe: Kritik/yüksek dört risk (yıkıcı cascade, kiracı sızıntısı, defter yokluğu, soft-delete tutarsızlığı) kök nedeninden kapandı ve geri gelmesi testle engellendi; ekonomi mutabakatla gözleniyor, ölü tablolara yazım bitti, gizli değerler mühürlü. 10/10'u engelleyen kalanlar yalnız şema/göç ile kapanabilir (bu turda ajanlara yasak): DB seviyesinde `Restrict`/`CHECK`/kısmi unique, `Float` para alanları, index diyeti, ölü tabloların düşürülmesi, enum/FK normalizasyonu, baseline göçü. Hepsi gerekçe ve göç planıyla `SCHEMA-REQUESTS.md`'de.

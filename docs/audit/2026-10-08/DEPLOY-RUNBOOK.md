# Şema Penceresi #1 — Canlıya Uygulama Runbook'u

Tarih: 2026-10-08 · Dal: `feat/platform-overhaul` · Sahip onayı: **ZORUNLU** (yol haritası §8.1)

Bu belge iki göçün canlı Neon'a nasıl uygulanacağını, kodun hangi sırayla deploy edileceğini
ve bir şey ters giderse nasıl geri dönüleceğini anlatır.

| Göç | Tür | Sürüm (yol haritası §8.3) |
|---|---|---|
| `prisma/migrations/20261008000000_platform_overhaul_expand` | Yalnız ekleme (expand) | **R3** |
| `prisma/migrations/20261008000100_platform_overhaul_feedback_restrict` | FK daraltma (Cascade → Restrict) | **R6** |

---

## 1. Ne değişiyor

### 1.1 Yeni kolonlar (hepsi nullable ya da sabit varsayılanlı; mevcut satırlar değişmez)

| Tablo | Kolon | Neden |
|---|---|---|
| `User` | `sessionVersion INT DEFAULT 0`, `suspendedAt`, `suspendedReason`, `anonymizedAt`, `isDemo BOOL DEFAULT false` | P0-07 oturum iptali, P0-25 askıya alma ve anonimleştirme, P0-27 demo izolasyonu |
| `UserQuest` | `rewardedAt` | P0-15 tek-sefer görev ödülü |
| `AuditLog` | `userId` **NOT NULL kaldırıldı**, FK `CASCADE → SET NULL`, `actorType TEXT DEFAULT 'user'`, `actorSnapshot JSONB` | P0-25 denetim izi kullanıcı silinince yok olmasın |
| `QRCode` | `archivedAt` (+ index `dealerId, archivedAt`) | P0-24 QR "silme" = arşiv |
| `Badge`, `Quest`, `Reward`, `CosmeticItem`, `DonationProject`, `PricingPlan`, `PhysicalCard` | `archivedAt` | P0-26 hard delete yerine arşiv |
| `Feedback` | `aiAttempts INT DEFAULT 0`, `aiLastAttemptAt` | P0-32 AI yeniden deneme sınırı |
| `Consumption` | `clientOpId` (+ unique `dealerId, clientOpId`) | P0-18 offline-sync idempotency |
| `ConsumptionReview` | `deletedAt` (+ index) | P0-23 yorum soft delete |
| `MiniGameSession` | `serverStartedAt`, `seed`, `nonce`, `expiresAt`, `clientScore` (+ index `status, expiresAt`) | P0-17 sunucu otoritesi |
| `SquadBattle` | `paidOutAt`, `cancelledAt`, `cancelReason` | P0-20 escrow idempotency ve soft-cancel |
| `DataSubjectRequest` | `dueAt` (+ index `status, dueAt`) | P0-34 KVKK yasal süre |

### 1.2 Yeni tablolar

| Tablo | Neden |
|---|---|
| `CustomerMoment` | An Motoru (spec `2026-10-08-moment-engine-design.md`) |
| `PointsLedger` | F1.3 kalıcı puan defteri (`idempotencyKey` unique) |
| `StripeEvent` | P0-29 webhook idempotency ve sıra koruması |
| `StaffInvitation` | P0-04 personel daveti (hesap ele geçirme yerine) |
| `DealerCustomerStats` | P0-12 kiracı kapsamlı müşteri istatistiği |
| `ConsentRecord` | P0-31 KVKK çerez ve izleme rızası kaydı |
| `DsrEvent` | P0-34 KVKK talep yürütme kanıtı |

### 1.3 Daraltma (ayrı göç, R6)

`Feedback.qrCodeId` FK'si `ON DELETE CASCADE` → `ON DELETE RESTRICT`. Yorumu olan QR artık
hard delete edilemez; veritabanı `23503` (Prisma `P2003`) döner. Yan etki: yorum almış QR'ı olan
bir bayi hesabı da hard delete edilemez (bilinçli; bayi silme = anonimleştirme ya da askıya alma).

---

## 2. Değişmez kurallar (atlamayın)

1. **Tablo önce, kod sonra.** `schema.prisma` bu dalda değişti. Vercel build `prisma generate`
   çalıştırır ve üretilen istemci `User`, `Feedback`, `QRCode` gibi modellerin **bütün** skaler
   kolonlarını `SELECT` eder. Bu commit'i içeren herhangi bir deploy, expand göçü canlıda
   uygulanmadan yayına çıkarsa **neredeyse her istek** `P2022: column does not exist` ile çöker
   (giriş dahil). Expand göçü, bu şemayı içeren ilk deploy'dan **önce** uygulanmalı.
2. **DDL yalnız `DIRECT_URL` ile.** `DATABASE_URL` pooler'dır (PgBouncer transaction modu) ve DDL
   için uygun değildir. Aşağıdaki komutlar `DIRECT_URL`'i kullanır.
3. **Önce yedek, sonra göç.** Yedek uygulama kovasına (`R2_BUCKET`, public sunulabiliyor) **konmaz**
   (P0-30). Bkz. §3 Adım 0.
4. **Önce Neon dev branch'te prova.** Canlıya gitmeden aynı adımlar canlıdan dallanmış bir Neon
   branch'inde koşturulur.
5. `db push` kullanılmaz.

---

## 3. Adımlar

### Adım 0 — Yedek (onaylı)

1. **Neon branch anlık görüntüsü (en hızlı geri dönüş):** Neon konsolu → Branches → canlı
   branch'ten `pre-overhaul-2026-10-08` adında yeni branch oluşturun. Anında oluşur, ücretsiz
   katmanda da çalışır ve kopyalama yapmaz. Bu branch silinmeden önce en az 14 gün tutulur.
2. **Bağımsız döküm:** `pg_dump` olan bir makinede:
   ```bash
   node scripts/db-backup.mjs --local-only
   ```
   Çıkan `.sql.gz` dosyasını şifreleyin (ör. `age -r <alıcı-anahtar>`), yalnız özel bir konumda
   (ayrı, private, Object Lock'lu yedek kovası ya da çevrim dışı disk) saklayın. P0-30 kapanana
   kadar betiğin R2 yükleme modunu **kullanmayın**.

### Adım 1 — Salt okunur ön kontroller

`psql "$DIRECT_URL"` ile (yalnız `SELECT`):

```sql
-- 1) Göç geçmişi tablosu var mı? (db push ile kurulmuş şemada genelde YOKTUR)
SELECT to_regclass('public."_prisma_migrations"') AS migrations_table;
-- Varsa:
SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at;

-- 2) Göçü kilitleyebilecek uzun işlemler
SELECT pid, state, now() - xact_start AS age, left(query, 80)
FROM pg_stat_activity WHERE xact_start IS NOT NULL ORDER BY age DESC LIMIT 10;

-- 3) Bu pencerenin nesneleri zaten var mı? (drift; göç idempotent ama bilmek iyi)
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN
 ('CustomerMoment','PointsLedger','StripeEvent','StaffInvitation','DealerCustomerStats','ConsentRecord','DsrEvent');

-- 4) Drift raporu (yerelde, DB'ye yalnız okuma): şema ile canlı arasındaki fark
--    npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--    Beklenen: yalnız bu iki göçün içeriği. Fazlası varsa (ör. eski db push kalıntısı) DURUN,
--    F0.1 baseline raporuyla karşılaştırın.
```

### Adım 2 — Neon dev branch'te prova

1. Canlıdan `overhaul-rehearsal` branch'i açın; onun `DIRECT_URL`'ini alın.
2. Adım 3'teki uygulama komutunu bu URL ile çalıştırın.
3. Adım 4 doğrulama sorgularını çalıştırın.
4. Bu dalın kodunu (Vercel preview ya da yerel `next dev`) prova branch'ine bağlayıp giriş,
   müşteri paneli, bayi geri bildirim listesi, QR listesi, admin kullanıcı listesi ve admin
   denetim kaydı sayfalarını açın. `P2022` görülmemeli.
5. Göçü **ikinci kez** çalıştırın: hata vermemeli (idempotentlik kanıtı).

### Adım 3 — Expand göçünü canlıya uygulama (R3)

Adım 1'deki sonuca göre **tek** yol seçin.

**Yol A — `_prisma_migrations` var ve F0.1 baseline'ı işaretlenmiş** (eski 4 göç `applied`):

```bash
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
```

> R6'yı ayrı tutmak istiyorsanız (önerilen), bu komutu çalıştırmadan önce
> `20261008000100_platform_overhaul_feedback_restrict` klasörünün henüz deploy edilen ağaçta
> **bulunmadığından** emin olun ya da Yol B'yi kullanın; `migrate deploy` bekleyen tüm göçleri uygular.
> İkisini birlikte uygulamak da güvenlidir (bkz. §3 Adım 6 gerekçesi), yalnız F0.6 kodu henüz
> yayında değilse eski "QR sil" uçları veri silmek yerine hata döndürür.

**Yol B — göç geçmişi yok (şema `db push` ile kurulmuş) ya da yalnız bu göçü uygulamak istiyorsunuz:**

```bash
# 1) SQL'i doğrudan uygula (idempotent)
npx prisma db execute --url "$DIRECT_URL" \
  --file prisma/migrations/20261008000000_platform_overhaul_expand/migration.sql

# 2) Göç geçmişine "uygulandı" olarak işle (tablo yoksa Prisma oluşturur)
DATABASE_URL="$DIRECT_URL" npx prisma migrate resolve --applied 20261008000000_platform_overhaul_expand
```

> Yol B'de eski 4 göç (`20260512…`, `20260621…` ×3) geçmişe işlenmemişse, F0.1 baseline'ı
> tamamlanana kadar `migrate deploy` **çalıştırılmaz**; aksi halde Prisma o göçleri yeniden
> uygulamaya çalışır ve "already exists" hatasıyla durur.

**Kilit zaman aşımı:** Göç `lock_timeout = 5s` ile başlar. `canceling statement due to lock timeout`
görürseniz uzun işlemin bitmesini bekleyip aynı komutu tekrar çalıştırın (idempotent). Yol A'da
Prisma göçü `failed` işaretler: `npx prisma migrate resolve --rolled-back 20261008000000_platform_overhaul_expand`
ardından `migrate deploy` tekrar.

### Adım 4 — Doğrulama (salt okunur)

```sql
-- Yeni tablolar (7 satır beklenir)
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN
 ('CustomerMoment','PointsLedger','StripeEvent','StaffInvitation','DealerCustomerStats','ConsentRecord','DsrEvent');

-- Kritik kolonlar
SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns
WHERE table_schema='public' AND (table_name, column_name) IN
 (('User','sessionVersion'),('UserQuest','rewardedAt'),('AuditLog','userId'),('AuditLog','actorSnapshot'),
  ('QRCode','archivedAt'),('Consumption','clientOpId'),('MiniGameSession','expiresAt'));
-- AuditLog.userId → is_nullable = YES; User.sessionVersion → default 0

-- FK silme davranışları: a=no action, r=restrict, c=cascade, n=set null
SELECT conname, confdeltype, convalidated FROM pg_constraint
WHERE conname IN ('AuditLog_userId_fkey','Feedback_qrCodeId_fkey','DsrEvent_requestId_fkey','PointsLedger_userId_fkey');
-- R3 sonrası: AuditLog_userId_fkey = n, Feedback_qrCodeId_fkey = c (R6'da r olacak), convalidated = t

-- Veri değişmedi mi? (Adım 1'de alınan sayılarla karşılaştırın)
SELECT (SELECT count(*) FROM "User") u, (SELECT count(*) FROM "Feedback") f, (SELECT count(*) FROM "AuditLog") a;
```

Ardından yerelde drift kontrolü: `npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script`
çıktısı yalnız R6'nın FK değişikliğini (henüz uygulanmadıysa) göstermeli.

### Adım 5 — Kod deploy'u (R4, R5)

Sıra **zorunludur**:

1. **R4 — şemaya bağlı kod:** `schema.prisma` değişikliğini içeren commit ve bu alanları kullanan kod
   (rewardedAt guard'ı, `sessionVersion` okuma **zorlamasız**: JWT'de `sv` yoksa 0 kabul edilir,
   audit snapshot, Stripe tekilliği, arşiv uçları). Adım 3–4 tamamlanmadan merge/deploy edilmez.
2. **R5 — An Motoru:** `recordMoments` transaction içinde `CustomerMoment`'a yazar; tablo R3'te
   oluştuğu için artık güvenli.
3. **`sessionVersion` zorlaması** (eski JWT'leri reddetmek) R6 ile birlikte ayrı deploy'da açılır;
   kullanıcılara "güvenlik güncellemesi nedeniyle yeniden giriş" bildirimi yapılır.
4. `PointsLedger` çift yazımı (F1.3) ayrı sürümde: önce açılış bakiyesi kayıtları
   (`source='opening_balance'`, `idempotencyKey='opening:<userId>:POINTS'`), sonra 2 hafta çift yazım
   ve gece mutabakatı.

Deploy sonrası duman testi: giriş (müşteri, bayi, admin), QR ile geri bildirim, bayi tüketim kaydı,
mini oyun başlat/bitir, admin denetim kaydı, `/api/health`.

### Adım 6 — Restrict göçü (R6, onaylı)

**Ön koşul:** F0.6 kodu yayında olmalı: QR "sil" uçları arşivliyor (`archivedAt`/`revokedAt`),
toplu QR silme kaldırılmış, kullanıcı/bayi silme anonimleştirmeye yönlendirilmiş.

> Ön koşul sağlanmadan uygulanırsa veri **kaybolmaz**; yalnız eski silme uçları yorumlu QR'larda
> hata döndürür. Yani bu göç hiçbir zaman veri kaybına yol açmaz; yalnız kullanıcıya görünen bir
> hata üretebilir. Bu yüzden R3 ile birlikte uygulamak da kabul edilebilir bir seçenektir.

```bash
# Yol A
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
# Yol B
npx prisma db execute --url "$DIRECT_URL" \
  --file prisma/migrations/20261008000100_platform_overhaul_feedback_restrict/migration.sql
DATABASE_URL="$DIRECT_URL" npx prisma migrate resolve --applied 20261008000100_platform_overhaul_feedback_restrict
```

Doğrulama: `SELECT confdeltype FROM pg_constraint WHERE conname='Feedback_qrCodeId_fkey';` → `r`.

---

## 4. Geri dönüş planı

Geri dönüşler en hafiften en ağıra sıralıdır. **Her zaman önce kodu geri alın, sonra şemayı.**

### 4.1 Yalnız kod geri dönüşü (ilk tercih)

Vercel → Deployments → önceki sürüm → "Instant Rollback". Eski kod yeni şemayla **uyumludur**:
eski Prisma istemcisi yeni kolonları seçmez, yeni tabloları bilmez; `AuditLog`'a hep `userId`
yazar. Şema yerinde kalabilir. Çoğu sorun burada biter.

### 4.2 R6'yı geri alma (Restrict → Cascade)

Yalnız gerçekten gerekiyorsa (Cascade veri kaybı davranışını geri getirir):

```sql
SET lock_timeout = '5s';
ALTER TABLE "Feedback" DROP CONSTRAINT IF EXISTS "Feedback_qrCodeId_fkey";
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_qrCodeId_fkey"
  FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Feedback" VALIDATE CONSTRAINT "Feedback_qrCodeId_fkey";
```
Ardından `DELETE FROM "_prisma_migrations" WHERE migration_name='20261008000100_platform_overhaul_feedback_restrict';`
(`migrate resolve --rolled-back` yalnız **başarısız** göçler için çalışır) ve `schema.prisma`'da
`onDelete: Restrict` → `Cascade` geri çevrilir.

### 4.3 Expand'i geri alma (yalnız aynı pencerede, yeni kod veri yazmadan önce)

Yeni tablolar canlı veri (rıza kayıtları, DSR kanıtı, puan defteri) almaya başladıktan sonra
**düşürülmez**; o noktadan sonra yalnız ileri düzeltme yapılır. Pencere içinde, kod 4.1 ile
**şema-öncesi commit'e** döndürüldükten sonra:

```sql
SET lock_timeout = '5s';
BEGIN;
DROP TABLE IF EXISTS "ConsentRecord", "DealerCustomerStats", "StaffInvitation",
                     "StripeEvent", "PointsLedger", "CustomerMoment", "DsrEvent";

-- AuditLog: önce NULL userId kalmadığını doğrulayın; varsa bu adımı ATLAYIN (kolon nullable kalır,
-- eski kod için zararsızdır).
-- SELECT count(*) FROM "AuditLog" WHERE "userId" IS NULL;   -- 0 olmalı
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "AuditLog" DROP COLUMN IF EXISTS "actorType", DROP COLUMN IF EXISTS "actorSnapshot";

ALTER TABLE "User" DROP COLUMN IF EXISTS "sessionVersion", DROP COLUMN IF EXISTS "suspendedAt",
  DROP COLUMN IF EXISTS "suspendedReason", DROP COLUMN IF EXISTS "anonymizedAt", DROP COLUMN IF EXISTS "isDemo";
ALTER TABLE "MiniGameSession" DROP COLUMN IF EXISTS "serverStartedAt", DROP COLUMN IF EXISTS "seed",
  DROP COLUMN IF EXISTS "nonce", DROP COLUMN IF EXISTS "expiresAt", DROP COLUMN IF EXISTS "clientScore";
ALTER TABLE "SquadBattle" DROP COLUMN IF EXISTS "paidOutAt", DROP COLUMN IF EXISTS "cancelledAt",
  DROP COLUMN IF EXISTS "cancelReason";
ALTER TABLE "CosmeticItem"    DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "Badge"           DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "Quest"           DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "Reward"          DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "PricingPlan"     DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "PhysicalCard"    DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "DonationProject" DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "QRCode"          DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "UserQuest"       DROP COLUMN IF EXISTS "rewardedAt";
ALTER TABLE "Feedback"        DROP COLUMN IF EXISTS "aiAttempts", DROP COLUMN IF EXISTS "aiLastAttemptAt";
ALTER TABLE "Consumption"     DROP COLUMN IF EXISTS "clientOpId";
ALTER TABLE "ConsumptionReview" DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "DataSubjectRequest" DROP COLUMN IF EXISTS "dueAt";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261008000000_platform_overhaul_expand';
COMMIT;
```
(Kolonla birlikte üzerindeki index'ler de düşer.)

> Dikkat: `ConsumptionReview.deletedAt` ya da `QRCode.archivedAt` dolmuşsa (soft-delete/arşiv
> kullanılmaya başlandıysa) bu kolonları düşürmek arşivlenmiş kayıtları **yeniden görünür** yapar.
> Böyle bir durumda 4.3 yerine 4.1 + ileri düzeltme seçilir.

### 4.4 Felaket senaryosu

Adım 0'daki `pre-overhaul-2026-10-08` Neon branch'i: Neon konsolunda "Restore" ya da uygulamanın
`DATABASE_URL`/`DIRECT_URL`'ini geçici olarak o branch'e çevirme. Branch anı ile geri dönüş anı
arasında canlıya yazılan veri kaybolur; bu yüzden yalnız veri bozulmasında kullanılır. Son çare:
şifreli `pg_dump` dökümünden yeni bir Neon projesine geri yükleme.

---

## 5. Pencereden sonra yapılacaklar ([VERİ], onaylı ve salt okunur)

- P0-15: `CLAIM_QUEST_REWARD` audit'i ile `UserQuest.completedAt` karşılaştırılarak geçmiş çift
  ödemelerin ölçülmesi. `rewardedAt` geriye doldurması yalnız ürün sahibinin kararıyla
  (öneri: ödenmiş olduğu kanıtlanan satırlara `rewardedAt = completedAt`).
- P0-24/26: arşiv uçları devreye girdikten sonra `archivedAt` dolu kayıtların listelerde
  gizlendiğinin, kotaların arşivi de saydığının doğrulanması.
- P0-34: açık DSR'ler için `dueAt = createdAt + 30 gün` doldurması (onaylı tek seferlik güncelleme).
- `User.points < 0` olan hesapların raporu; `CHECK (points >= 0)` kısıtı bu temizlenmeden
  eklenmez (mevcut negatif satırlarda her UPDATE başarısız olurdu).

## 6. Kontrol listesi

- [ ] Sahip onayı alındı (tarih, saat).
- [ ] Neon branch anlık görüntüsü `pre-overhaul-2026-10-08` oluştu.
- [ ] Şifreli `pg_dump` özel konumda.
- [ ] Ön kontroller: göç geçmişi durumu biliniyor, uzun işlem yok, drift beklenen kadar.
- [ ] Prova branch'inde iki kez uygulandı, uygulama prova branch'inde `P2022`'siz açıldı.
- [ ] R3 canlıda; Adım 4 doğrulamaları temiz; satır sayıları değişmedi.
- [ ] R4 kodu deploy edildi; duman testi temiz.
- [ ] R5 (An Motoru) deploy edildi.
- [ ] F0.6 kodu yayında → R6 uygulandı; `confdeltype = r`.
- [ ] `sessionVersion` zorlaması ayrı deploy'da açıldı, kullanıcı bildirimi yapıldı.

---

## 7. Ek: takip expand göçü (R7, 2026-10-12)

Göç: `prisma/migrations/20261012000000_followup_expand/migration.sql` — yalnız ekleme, idempotent,
`lock_timeout = 5s`. İçerik: `RemedyOffer.expiresAt` (+ `[status, expiresAt]` index),
`UserSurpriseBox.withdrawnAt/withdrawnById/withdrawReason` (+ FK SetNull), `InboxMessage.authVerified/authReason`,
yeni `TeamInvitation` tablosu (tokenHash unique, FK invitedById Cascade / acceptedUserId SetNull).

Sıra: R3 sonrası herhangi bir anda; eski kodla uyumlu (yeni sütunlar NULL, yeni tablo okunmuyor).
1. Prova branch'inde iki kez uygula (`psql -f`), ikinci çalıştırma hatasız olmalı.
2. Canlıda aynı dosyayı uygula; ardından `prisma migrate resolve --applied 20261012000000_followup_expand`
   (göç geçmişi kullanılıyorsa).
3. Doğrulama: `SELECT conname FROM pg_constraint WHERE conname LIKE 'TeamInvitation_%' OR conname = 'UserSurpriseBox_withdrawnById_fkey';` → 4 satır (pkey dahil).
4. Ancak bundan sonra bu alanları kullanan kod deploy edilir (`prisma generate` + kod: telafi süresi/expire işi,
   sürpriz kutu geri çekmede silme yerine `withdrawnAt`, gelen kutusu doğrulama rozeti, ekip davet akışı).

Geri dönüş: kod geri alınır; sütunlar/tablo zararsız kalabilir. Gerekirse
`DROP TABLE IF EXISTS "TeamInvitation"; ALTER TABLE ... DROP COLUMN IF EXISTS ...` (veri kaybı yalnız yeni alanlarda).

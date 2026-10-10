-- ═════════════════════════════════════════════════════════════════════════════
-- P0-22 · Telafi bütünlüğü — kaynak başına TEK açık teklif (kısmi unique index) · 2026-10-08
--
-- Kural: bir QR geri bildirimi (feedbackId), bir tüketim yorumu (consumptionReviewId) ya da
-- kaynaksız kişisel teklif (dealerId + userId; churn müdahalesi) için aynı anda en fazla bir
-- AÇIK teklif (`pending` | `awaiting_dealer_approval`) olabilir.
--
-- Uygulama katmanı aynı kuralı advisory kilit + kontrol ile zaten uygular
-- (`lib/remedy-offer-service.ts` → 409); bu index yarış durumları ve servisi atlayan
-- yazımlar için son savunma hattıdır (Prisma P2002 → 409). Kod bu göç olmadan da doğru
-- çalışır; göç ile birlikte veya sonra uygulanabilir (sıra bağımlılığı yok).
--
-- VERİ ETKİSİ (bilinçli, dar): index oluşturulmadan önce aynı kaynağa ait YİNELENEN açık
-- teklifler tekilleştirilir. Her grupta müşterinin zaten gördüğü (`pending`) ve en yeni teklif
-- kalır; diğerleri `expired` yapılır ve zaman çizelgesine "Yinelenen açık teklif kapatıldı"
-- olayı yazılır. Yinelenen yoksa hiçbir satır değişmez. Ön ölçüm (salt okunur):
--   SELECT "feedbackId", COUNT(*) FROM "RemedyOffer"
--   WHERE "feedbackId" IS NOT NULL AND status IN ('pending','awaiting_dealer_approval')
--   GROUP BY 1 HAVING COUNT(*) > 1;
--   (aynısı "consumptionReviewId" için)
--
-- PRISMA NOTU: Prisma 5 kısmi index'i schema.prisma'da ifade edemez. Bu yüzden
-- `prisma migrate diff --to-schema-datamodel` / `migrate dev` bu üç index için DROP INDEX
-- önerir — o satırlar yeni göçlerden ELLE silinmelidir (index kasıtlıdır).
--
-- İdempotent: IF NOT EXISTS; tekilleştirme ikinci çalıştırmada etkisizdir.
-- ═════════════════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

-- ─── 1) Yinelenen açık teklifleri tekilleştir ─────────────────────────────────
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "feedbackId"
           ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, "createdAt" DESC, id DESC
         ) AS rn
  FROM "RemedyOffer"
  WHERE "feedbackId" IS NOT NULL
    AND status IN ('pending', 'awaiting_dealer_approval')
),
closed AS (
  UPDATE "RemedyOffer" r
  SET status = 'expired'
  FROM ranked
  WHERE r.id = ranked.id AND ranked.rn > 1
  RETURNING r.id
)
INSERT INTO "RemedyTimelineEvent" ("id", "remedyOfferId", "kind", "label", "createdAt")
SELECT gen_random_uuid()::text, id, 'expired', 'Yinelenen açık teklif kapatıldı', NOW()
FROM closed;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "consumptionReviewId"
           ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, "createdAt" DESC, id DESC
         ) AS rn
  FROM "RemedyOffer"
  WHERE "consumptionReviewId" IS NOT NULL
    AND status IN ('pending', 'awaiting_dealer_approval')
),
closed AS (
  UPDATE "RemedyOffer" r
  SET status = 'expired'
  FROM ranked
  WHERE r.id = ranked.id AND ranked.rn > 1
  RETURNING r.id
)
INSERT INTO "RemedyTimelineEvent" ("id", "remedyOfferId", "kind", "label", "createdAt")
SELECT gen_random_uuid()::text, id, 'expired', 'Yinelenen açık teklif kapatıldı', NOW()
FROM closed;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "dealerId", "userId"
           ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, "createdAt" DESC, id DESC
         ) AS rn
  FROM "RemedyOffer"
  WHERE "feedbackId" IS NULL
    AND "consumptionReviewId" IS NULL
    AND status IN ('pending', 'awaiting_dealer_approval')
),
closed AS (
  UPDATE "RemedyOffer" r
  SET status = 'expired'
  FROM ranked
  WHERE r.id = ranked.id AND ranked.rn > 1
  RETURNING r.id
)
INSERT INTO "RemedyTimelineEvent" ("id", "remedyOfferId", "kind", "label", "createdAt")
SELECT gen_random_uuid()::text, id, 'expired', 'Yinelenen açık teklif kapatıldı', NOW()
FROM closed;

-- ─── 2) Kısmi unique index'ler ────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "RemedyOffer_open_feedbackId_key"
  ON "RemedyOffer" ("feedbackId")
  WHERE "feedbackId" IS NOT NULL
    AND status IN ('pending', 'awaiting_dealer_approval');

CREATE UNIQUE INDEX IF NOT EXISTS "RemedyOffer_open_consumptionReviewId_key"
  ON "RemedyOffer" ("consumptionReviewId")
  WHERE "consumptionReviewId" IS NOT NULL
    AND status IN ('pending', 'awaiting_dealer_approval');

CREATE UNIQUE INDEX IF NOT EXISTS "RemedyOffer_open_personal_key"
  ON "RemedyOffer" ("dealerId", "userId")
  WHERE "feedbackId" IS NULL
    AND "consumptionReviewId" IS NULL
    AND status IN ('pending', 'awaiting_dealer_approval');

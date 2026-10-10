-- ═════════════════════════════════════════════════════════════════════════════
-- Platform overhaul — ŞEMA PENCERESİ #1 (EXPAND / yalnız ekleme) · 2026-10-08
--
-- Kapsam: P0-04, P0-07, P0-12, P0-15, P0-17, P0-18, P0-20, P0-23, P0-24 (archivedAt),
--         P0-25, P0-26, P0-27, P0-29, P0-31, P0-32, P0-34 + An Motoru (CustomerMoment)
--         + F1.3 PointsLedger.
--
-- Güvenlik özellikleri:
--   * Mevcut veriyi DEĞİŞTİRMEZ: yalnız nullable / sabit varsayılanlı kolon (PG11+ metadata-only),
--     yeni tablo, yeni index ve bir NOT NULL gevşetmesi (AuditLog.userId).
--   * İDEMPOTENT: canlı şema `db push` ile oluştuğu için drift olabilir. Her ifade
--     IF NOT EXISTS / pg_constraint kontrolü ile yazıldı; kısmen uygulanmış bir şemada
--     ikinci kez çalıştırmak güvenlidir.
--   * Tek daraltıcı FK değişikliği (Feedback.qrCode → RESTRICT) BU DOSYADA DEĞİL:
--     20261008000100_platform_overhaul_feedback_restrict (runbook §4).
--
-- Uygulama ve geri dönüş: docs/audit/2026-10-08/DEPLOY-RUNBOOK.md
-- ═════════════════════════════════════════════════════════════════════════════

-- Uzun süren bir işlemin arkasında kuyruğa girip bütün trafiği kilitlemek yerine hızlı
-- başarısız ol (yeniden denenebilir; göç idempotent).
SET lock_timeout = '5s';

-- ─── User: oturum sürümü, askıya alma, anonimleştirme, demo bayrağı ──────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- ─── MiniGameSession: sunucu otoritesi ───────────────────────────────────────
ALTER TABLE "MiniGameSession" ADD COLUMN IF NOT EXISTS "serverStartedAt" TIMESTAMP(3);
ALTER TABLE "MiniGameSession" ADD COLUMN IF NOT EXISTS "seed" TEXT;
ALTER TABLE "MiniGameSession" ADD COLUMN IF NOT EXISTS "nonce" TEXT;
ALTER TABLE "MiniGameSession" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "MiniGameSession" ADD COLUMN IF NOT EXISTS "clientScore" INTEGER;
CREATE INDEX IF NOT EXISTS "MiniGameSession_status_expiresAt_idx" ON "MiniGameSession"("status", "expiresAt");

-- ─── SquadBattle: idempotent ödeme + soft-cancel ─────────────────────────────
ALTER TABLE "SquadBattle" ADD COLUMN IF NOT EXISTS "paidOutAt" TIMESTAMP(3);
ALTER TABLE "SquadBattle" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "SquadBattle" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

-- ─── Katalog arşivi (hard delete yerine) ─────────────────────────────────────
ALTER TABLE "CosmeticItem"    ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Badge"           ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Quest"           ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Reward"          ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "PricingPlan"     ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "PhysicalCard"    ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "DonationProject" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- ─── UserQuest: tek-sefer ödeme bayrağı ──────────────────────────────────────
ALTER TABLE "UserQuest" ADD COLUMN IF NOT EXISTS "rewardedAt" TIMESTAMP(3);

-- ─── QRCode: arşiv ───────────────────────────────────────────────────────────
ALTER TABLE "QRCode" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "QRCode_dealerId_archivedAt_idx" ON "QRCode"("dealerId", "archivedAt");

-- ─── Feedback: AI deneme sayacı ──────────────────────────────────────────────
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "aiAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "aiLastAttemptAt" TIMESTAMP(3);

-- ─── Consumption: istemci işlem kimliği (idempotency) ────────────────────────
-- Kolon yeni ve tamamen NULL → unique index çakışma üretemez (PG'de NULL'lar eşit sayılmaz).
ALTER TABLE "Consumption" ADD COLUMN IF NOT EXISTS "clientOpId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Consumption_dealerId_clientOpId_key" ON "Consumption"("dealerId", "clientOpId");

-- ─── ConsumptionReview: soft delete ──────────────────────────────────────────
ALTER TABLE "ConsumptionReview" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ConsumptionReview_deletedAt_idx" ON "ConsumptionReview"("deletedAt");

-- ─── DataSubjectRequest: yasal süre ──────────────────────────────────────────
ALTER TABLE "DataSubjectRequest" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "DataSubjectRequest_status_dueAt_idx" ON "DataSubjectRequest"("status", "dueAt");

-- ─── AuditLog: kullanıcıdan bağımsız denetim izi (Cascade → SetNull) ─────────
-- DROP NOT NULL ve FK değişimi gevşetmedir: hiçbir mevcut yazma/silme yolunu kırmaz;
-- kullanıcı silinince denetim satırları artık SİLİNMEZ, userId NULL olur.
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "actorType" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "actorSnapshot" JSONB;
ALTER TABLE "AuditLog" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
-- Mevcut satırlar zaten eski FK ile geçerli; VALIDATE yalnız SHARE UPDATE EXCLUSIVE kilit alır
-- (yazmalar sürer).
ALTER TABLE "AuditLog" VALIDATE CONSTRAINT "AuditLog_userId_fkey";

-- ═════════════════════════════════════════════════════════════════════════════
-- YENİ TABLOLAR
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── DsrEvent: KVKK talep yürütme kanıtı ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DsrEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DsrEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DsrEvent_requestId_createdAt_idx" ON "DsrEvent"("requestId", "createdAt");
CREATE INDEX IF NOT EXISTS "DsrEvent_type_createdAt_idx" ON "DsrEvent"("type", "createdAt");

-- ─── CustomerMoment: An Motoru ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CustomerMoment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "CustomerMoment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerMoment_userId_dedupeKey_key" ON "CustomerMoment"("userId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "CustomerMoment_userId_seenAt_idx" ON "CustomerMoment"("userId", "seenAt");
CREATE INDEX IF NOT EXISTS "CustomerMoment_createdAt_idx" ON "CustomerMoment"("createdAt");

-- ─── PointsLedger: kalıcı puan defteri ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PointsLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'POINTS',
    "delta" INTEGER NOT NULL,
    "xpDelta" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "reversesId" TEXT,
    "actorId" TEXT,
    "reason" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PointsLedger_idempotencyKey_key" ON "PointsLedger"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "PointsLedger_userId_createdAt_idx" ON "PointsLedger"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PointsLedger_source_createdAt_idx" ON "PointsLedger"("source", "createdAt");
CREATE INDEX IF NOT EXISTS "PointsLedger_status_createdAt_idx" ON "PointsLedger"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PointsLedger_actorId_createdAt_idx" ON "PointsLedger"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "PointsLedger_sourceId_idx" ON "PointsLedger"("sourceId");

-- ─── StripeEvent: webhook idempotency + sıra ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "objectId" TEXT,
    "stripeCreatedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StripeEvent_objectId_stripeCreatedAt_idx" ON "StripeEvent"("objectId", "stripeCreatedAt");
CREATE INDEX IF NOT EXISTS "StripeEvent_type_createdAt_idx" ON "StripeEvent"("type", "createdAt");

-- ─── StaffInvitation: personel daveti ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "StaffInvitation" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "jobTitle" TEXT,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "StaffInvitation_dealerId_email_idx" ON "StaffInvitation"("dealerId", "email");
CREATE INDEX IF NOT EXISTS "StaffInvitation_email_idx" ON "StaffInvitation"("email");
CREATE INDEX IF NOT EXISTS "StaffInvitation_expiresAt_idx" ON "StaffInvitation"("expiresAt");

-- ─── DealerCustomerStats: kiracı kapsamlı müşteri istatistiği ────────────────
CREATE TABLE IF NOT EXISTS "DealerCustomerStats" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "totalSpend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "avgOrderValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION,
    "firstVisitAt" TIMESTAMP(3),
    "lastVisitAt" TIMESTAMP(3),
    "churnRisk" DOUBLE PRECISION,
    "segmentKey" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerCustomerStats_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DealerCustomerStats_dealerId_customerId_key" ON "DealerCustomerStats"("dealerId", "customerId");
CREATE INDEX IF NOT EXISTS "DealerCustomerStats_customerId_idx" ON "DealerCustomerStats"("customerId");
CREATE INDEX IF NOT EXISTS "DealerCustomerStats_dealerId_segmentKey_idx" ON "DealerCustomerStats"("dealerId", "segmentKey");
CREATE INDEX IF NOT EXISTS "DealerCustomerStats_dealerId_churnRisk_idx" ON "DealerCustomerStats"("dealerId", "churnRisk");
CREATE INDEX IF NOT EXISTS "DealerCustomerStats_dealerId_lastVisitAt_idx" ON "DealerCustomerStats"("dealerId", "lastVisitAt");

-- ─── ConsentRecord: KVKK rıza kaydı ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonId" TEXT,
    "version" TEXT NOT NULL,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "replay" BOOLEAN NOT NULL DEFAULT false,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConsentRecord_userId_createdAt_idx" ON "ConsentRecord"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConsentRecord_anonId_createdAt_idx" ON "ConsentRecord"("anonId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConsentRecord_createdAt_idx" ON "ConsentRecord"("createdAt");

-- ═════════════════════════════════════════════════════════════════════════════
-- YENİ TABLOLARIN FK'leri (idempotent: yalnız yoksa ekle)
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DsrEvent_requestId_fkey') THEN
    ALTER TABLE "DsrEvent" ADD CONSTRAINT "DsrEvent_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "DataSubjectRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerMoment_userId_fkey') THEN
    ALTER TABLE "CustomerMoment" ADD CONSTRAINT "CustomerMoment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PointsLedger_userId_fkey') THEN
    ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffInvitation_dealerId_fkey') THEN
    ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_dealerId_fkey"
      FOREIGN KEY ("dealerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffInvitation_invitedById_fkey') THEN
    ALTER TABLE "StaffInvitation" ADD CONSTRAINT "StaffInvitation_invitedById_fkey"
      FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerCustomerStats_dealerId_fkey') THEN
    ALTER TABLE "DealerCustomerStats" ADD CONSTRAINT "DealerCustomerStats_dealerId_fkey"
      FOREIGN KEY ("dealerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealerCustomerStats_customerId_fkey') THEN
    ALTER TABLE "DealerCustomerStats" ADD CONSTRAINT "DealerCustomerStats_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsentRecord_userId_fkey') THEN
    ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

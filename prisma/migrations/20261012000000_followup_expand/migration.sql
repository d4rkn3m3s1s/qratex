-- ═════════════════════════════════════════════════════════════════════════════
-- Takip expand göçü · 2026-10-12 · YALNIZ EKLEME (nullable sütun, yeni tablo, index, FK)
--
--  1) RemedyOffer.expiresAt (+ index [status, expiresAt])   — bekleyen teklif süresi
--  2) UserSurpriseBox.withdrawnAt / withdrawnById / withdrawReason (+ FK SetNull)
--                                                           — geri çekme silme yerine işaret
--  3) InboxMessage.authVerified / authReason                — gönderen doğrulama sonucu
--  4) TeamInvitation tablosu                                — iç ekip davet akışı
--
-- Mevcut satırlar değişmez (tüm yeni sütunlar NULL). Eski kod bu göçten sonra da çalışır.
-- İdempotent: IF NOT EXISTS; FK'ler pg_constraint kontrolüyle.
-- ═════════════════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

-- 1) RemedyOffer
ALTER TABLE "RemedyOffer" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "RemedyOffer_status_expiresAt_idx" ON "RemedyOffer"("status", "expiresAt");

-- 2) UserSurpriseBox
ALTER TABLE "UserSurpriseBox" ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "UserSurpriseBox" ADD COLUMN IF NOT EXISTS "withdrawnById" TEXT;
ALTER TABLE "UserSurpriseBox" ADD COLUMN IF NOT EXISTS "withdrawReason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserSurpriseBox_withdrawnById_fkey') THEN
    ALTER TABLE "UserSurpriseBox"
      ADD CONSTRAINT "UserSurpriseBox_withdrawnById_fkey"
      FOREIGN KEY ("withdrawnById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3) InboxMessage
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "authVerified" BOOLEAN;
ALTER TABLE "InboxMessage" ADD COLUMN IF NOT EXISTS "authReason" TEXT;

-- 4) TeamInvitation
CREATE TABLE IF NOT EXISTS "TeamInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "invitedById" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamInvitation_tokenHash_key" ON "TeamInvitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "TeamInvitation_email_idx" ON "TeamInvitation"("email");
CREATE INDEX IF NOT EXISTS "TeamInvitation_invitedById_createdAt_idx" ON "TeamInvitation"("invitedById", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamInvitation_invitedById_fkey') THEN
    ALTER TABLE "TeamInvitation"
      ADD CONSTRAINT "TeamInvitation_invitedById_fkey"
      FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeamInvitation_acceptedUserId_fkey') THEN
    ALTER TABLE "TeamInvitation"
      ADD CONSTRAINT "TeamInvitation_acceptedUserId_fkey"
      FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

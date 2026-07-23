-- AlterTable
ALTER TABLE "SquadBattle" ADD COLUMN     "rewardFunded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rewardRefunded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GameStreakClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameStreakClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameStreakClaim_userId_idx" ON "GameStreakClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameStreakClaim_userId_dayKey_key" ON "GameStreakClaim"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_userId_couponId_key" ON "CouponRedemption"("userId", "couponId");


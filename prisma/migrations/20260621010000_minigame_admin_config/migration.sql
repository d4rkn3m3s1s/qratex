-- CreateTable
CREATE TABLE "MiniGameConfig" (
    "id" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rewardPoints" INTEGER,
    "rewardXp" INTEGER,
    "rewardThreshold" INTEGER,
    "minDurationSec" INTEGER,
    "maxScore" INTEGER,
    "title" TEXT,
    "description" TEXT,
    "emoji" TEXT,
    "accent" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiniGameConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MiniGameConfig_gameType_key" ON "MiniGameConfig"("gameType");

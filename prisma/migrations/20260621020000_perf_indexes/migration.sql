-- MiniGameSession: leaderboard groupBy (gameType+status) ve streak/achievement
-- (userId+status) sorguları için index'ler (tek-sütun userId index'i yetmiyordu).
CREATE INDEX "MiniGameSession_gameType_status_idx" ON "MiniGameSession"("gameType", "status");
CREATE INDEX "MiniGameSession_userId_status_idx" ON "MiniGameSession"("userId", "status");

-- SquadBattle: cron süresi-dolan taraması (status+endTime) ve challenge açık-savaş
-- kontrolü (squad1Id/squad2Id + status). Eski tek-sütun status index'i composite
-- ile değiştirilir (status prefix'i yine kapsanır).
DROP INDEX IF EXISTS "SquadBattle_status_idx";
CREATE INDEX "SquadBattle_status_endTime_idx" ON "SquadBattle"("status", "endTime");
CREATE INDEX "SquadBattle_squad1Id_status_idx" ON "SquadBattle"("squad1Id", "status");
CREATE INDEX "SquadBattle_squad2Id_status_idx" ON "SquadBattle"("squad2Id", "status");

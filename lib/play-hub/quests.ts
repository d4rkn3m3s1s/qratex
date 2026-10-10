/**
 * Günlük OYUN görevleri (yol haritası §7.3 meta katmanı: "oyunlar arası günlük görevler").
 *
 * SAF modül: ilerleme yalnız bugünkü sıralı deneme satırlarından (MiniGameSession) türetilir;
 * ayrı tablo yok. Ödül yalnız XP'dir (oyunlar XP motorudur, ana puan kaynağı değildir — §7.2/3)
 * ve `mintPoints` ile tek-kez basılır: `game_quest:<userId>:<dayKey>:<questId>` defter
 * anahtarı (PointsLedger.idempotencyKey @unique) aynı görevin aynı gün ikinci kez ödenmesini
 * DB düzeyinde engeller. Talep sunucuda ilerlemeyi YENİDEN hesaplar (istemciye güvenmez).
 *
 * Gün = deneme günü (`lib/game-session.gameDayKey`) — denemelerle aynı sınırda sıfırlanır.
 */

export type GameQuestMetric = 'attempts' | 'wins' | 'distinct';

export interface GameQuestDef {
  id: GameQuestId;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  metric: GameQuestMetric;
  target: number;
  /** Tamamlanınca verilen XP (puan değil). */
  xp: number;
  icon: 'play' | 'trophy' | 'shuffle';
}

export const GAME_QUEST_IDS = ['play-1', 'win-1', 'variety-3'] as const;
export type GameQuestId = (typeof GAME_QUEST_IDS)[number];

export const GAME_QUESTS: readonly GameQuestDef[] = [
  {
    id: 'play-1',
    title: 'Isınma turu',
    titleEn: 'Warm-up',
    description: 'Bugün herhangi bir oyunda sıralı denemeni kullan.',
    descriptionEn: 'Use a ranked attempt in any game today.',
    metric: 'attempts',
    target: 1,
    xp: 20,
    icon: 'play',
  },
  {
    id: 'win-1',
    title: 'Günün zaferi',
    titleEn: 'Win of the day',
    description: 'Bugün bir oyunda ödül eşiğini geç.',
    descriptionEn: 'Beat the reward threshold in a game today.',
    metric: 'wins',
    target: 1,
    xp: 30,
    icon: 'trophy',
  },
  {
    id: 'variety-3',
    title: 'Çeşitlilik',
    titleEn: 'Variety',
    description: 'Bugün 3 farklı oyunda deneme yap.',
    descriptionEn: 'Try 3 different games today.',
    metric: 'distinct',
    target: 3,
    xp: 40,
    icon: 'shuffle',
  },
] as const;

export function getGameQuest(id: string): GameQuestDef | undefined {
  return GAME_QUESTS.find((q) => q.id === id);
}

/** Bugünkü deneme satırı (yalnız gereken alanlar). */
export interface QuestRow {
  gameType: string;
  status: string;
}

export interface QuestCounts {
  attempts: number;
  wins: number;
  distinct: number;
}

/**
 * Bugünün sayaçları. Başlatılmış her deneme (aktif dahil) "kullanıldı" sayılır — deneme
 * başlangıçta harcanır (lib/game-session). Kazanç = `completed`.
 */
export function questCounts(rows: readonly QuestRow[]): QuestCounts {
  const used = rows.filter((r) => ['active', 'completed', 'failed', 'abandoned'].includes(r.status));
  return {
    attempts: used.length,
    wins: used.filter((r) => r.status === 'completed').length,
    distinct: new Set(used.map((r) => r.gameType)).size,
  };
}

export interface QuestProgress {
  quest: GameQuestDef;
  progress: number;
  done: boolean;
  claimed: boolean;
}

export function questProgress(counts: QuestCounts, claimedIds: ReadonlySet<string>): QuestProgress[] {
  return GAME_QUESTS.map((quest) => {
    const raw = counts[quest.metric];
    const progress = Math.min(raw, quest.target);
    return { quest, progress, done: raw >= quest.target, claimed: claimedIds.has(quest.id) };
  });
}

/** Defter tek-kez anahtarı (PointsLedger.idempotencyKey). */
export function questIdempotencyKey(userId: string, dayKey: string, questId: string): string {
  return `game_quest:${userId}:${dayKey}:${questId}`;
}

/** Anahtardan görev kimliğini çıkarır (bugünün talep edilenlerini okumak için). */
export function questIdFromKey(key: string): string | null {
  const parts = key.split(':');
  return parts.length === 4 && parts[0] === 'game_quest' ? parts[3] : null;
}

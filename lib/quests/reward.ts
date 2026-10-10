/**
 * Görev ödülü — TEK SEFERLİK ödeme servisi (P0-15).
 *
 * Kök neden: üç ödeme yolu vardı (manuel claim, başarım ilerlemesi, ziyaret görevi) ve her biri
 * "ödendi mi" sorusunu farklı bir yerden okuyordu. Otomatik ödeyen iki yol `CLAIM_QUEST_REWARD`
 * audit'ini yazmadığından claim ucu aynı görevi ikinci kez ödüyordu; başarım yolunda
 * `completedAt: null` guard'ı olmadığından eşzamanlı iki çağrı çift kredi basıyordu.
 *
 * Çözüm: tek kaynak `UserQuest.rewardedAt`. Ödeme yalnız
 * `updateMany({ where: { id, rewardedAt: null, … }, data: { rewardedAt: now } })` satırı İLK
 * çeviren çağrıda yapılır (count===0 → ödeme yok); kredi `mintPoints` ile aynı tx'te
 * (`idempotencyKey: quest:<userQuestId>` ikinci savunma hattı, defter + points_credited orada).
 *
 * Otomatik ödenen görevler (ziyaret ve başarım) claim ucundan ÖDENMEZ; liste API'si onları
 * tamamlandığında "alındı" gösterir (claim düğmesi görünmez).
 */
import { mintPoints, type EconomyTx } from '@/lib/economy';

/** lib/achievements.ts'in ilerlettiği özel başarım görevleri: tamamlanınca OTOMATİK ödenir. */
export const ACHIEVEMENT_QUEST_IDS = [
  'quest-color-wizard',
  'quest-gift-master',
  'quest-cosmetic-collector',
  'quest-showcase-master',
] as const;

const ACHIEVEMENT_QUEST_ID_SET: ReadonlySet<string> = new Set(ACHIEVEMENT_QUEST_IDS);

/** Ödülü tamamlanınca sunucu tarafından otomatik verilen görev mi? (claim edilemez) */
export function isAutoRewardQuest(quest: { id: string; requirement?: unknown }): boolean {
  if (ACHIEVEMENT_QUEST_ID_SET.has(quest.id)) return true;
  const req = quest.requirement;
  if (req && typeof req === 'object' && !Array.isArray(req)) {
    const type = (req as { type?: unknown }).type;
    if (type === 'visit_category') return true;
  }
  return false;
}

export type QuestRewardSource = 'quest' | 'achievement' | 'visit_mission';

export interface RewardQuestOnceInput {
  userQuestId: string;
  userId: string;
  questId: string;
  points: number;
  xp: number;
  /** Defter kaynağı (points_credited kategorisi). */
  source: QuestRewardSource;
  /**
   * true → satır yalnız henüz TAMAMLANMAMIŞSA ödenir (otomatik yollar). Eski (rewardedAt
   * alanı yokken) tamamlanıp ödenmiş satırlar `rewardedAt=null` taşır; bu guard onları tekrar
   * ödemekten korur.
   */
  requireIncomplete?: boolean;
  /** Yazılacak `completedAt` (varsayılan now; claim'de mevcut tamamlanma zamanı korunur). */
  completedAt?: Date | null;
  /** Aynı güncellemede yazılacak ilerleme. */
  progress?: number;
  now?: Date;
}

export type RewardQuestOnceResult =
  | { rewarded: false }
  | {
      rewarded: true;
      credited: number;
      xpCredited: number;
      /** Güncel bakiye. */
      balance: number;
      xp: number;
      level: number;
      isLevelUp: boolean;
    };

/**
 * Görev ödülünü TEK SEFER öder. Çağıranın transaction'ı içinde çalışmalıdır (ödeme bayrağı ve
 * kredi birlikte commit/rollback olur).
 */
export async function rewardQuestOnce(tx: EconomyTx, input: RewardQuestOnceInput): Promise<RewardQuestOnceResult> {
  const now = input.now ?? new Date();
  const claim = await tx.userQuest.updateMany({
    where: {
      id: input.userQuestId,
      userId: input.userId,
      rewardedAt: null,
      ...(input.requireIncomplete ? { completedAt: null } : {}),
    },
    data: {
      rewardedAt: now,
      completedAt: input.completedAt ?? now,
      ...(typeof input.progress === 'number' ? { progress: input.progress } : {}),
    },
  });
  if (claim.count === 0) return { rewarded: false };

  const points = Math.max(0, Math.floor(Number(input.points) || 0));
  const xp = Math.max(0, Math.floor(Number(input.xp) || 0));

  const minted = await mintPoints(tx, {
    userId: input.userId,
    points,
    xp,
    source: input.source,
    sourceId: input.userQuestId,
    idempotencyKey: `quest:${input.userQuestId}`,
    meta: { questId: input.questId },
    now,
  });

  return {
    rewarded: true,
    credited: minted.duplicate ? 0 : minted.credited,
    xpCredited: minted.duplicate ? 0 : minted.xpCredited,
    balance: minted.points,
    xp: minted.xp,
    level: minted.level,
    isLevelUp: minted.isLevelUp,
  };
}

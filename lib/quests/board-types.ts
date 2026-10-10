/**
 * Görev panosu DTO'ları — sunucu (lib/quests/board.ts) ile istemci (components/customer/m-gorevler)
 * arasındaki sözleşme. Saf tipler; Prisma/Node bağımlılığı YOK (istemci içe aktarabilir).
 *
 * Bulgu 4: yanıt açık bir DTO'dur — ham `users`, `_count`, `userQuestId` iç alanları dönmez.
 */
import type { QuestCta, QuestMechanic, QuestTracking } from './mechanics';
import type { ActivityStreak } from './activity-streak';
import type { QuestPeriodKind } from './period';

export type { QuestCta, QuestMechanic, QuestTracking, ActivityStreak, QuestPeriodKind };

/** Ekrandaki gruplar: Bugün · Bu hafta · Bu ay · Sezon (tek seferlik/özel/otomatik). */
export type QuestGroup = 'daily' | 'weekly' | 'monthly' | 'season';

export type QuestState =
  /** Hedefe ulaşılmadı. */
  | 'in_progress'
  /** Hedefe ulaşıldı, ödül alınmayı bekliyor. */
  | 'claimable'
  /** Bu dönemin ödülü alındı. */
  | 'claimed'
  /** Ödül tamamlanınca sunucu tarafından otomatik verildi (claim YOK — B2). */
  | 'auto_rewarded';

export type QuestIcon = { kind: 'emoji'; value: string } | { kind: 'image'; src: string } | { kind: 'none' };

export interface QuestDTO {
  id: string;
  name: string;
  description: string;
  icon: QuestIcon;
  group: QuestGroup;
  period: QuestPeriodKind;
  mechanic: QuestMechanic;
  tracking: QuestTracking;
  /** `claim` → kullanıcı "Al" der; `auto` → tamamlanınca kendiliğinden ödenir. */
  rewardMode: 'claim' | 'auto';
  progress: number;
  target: number;
  reward: { points: number; xp: number };
  state: QuestState;
  /** Dönem ya da görev bitişi (ISO). Hangisi önce gelirse. Yoksa null. */
  endsAt: string | null;
  /** Tamamlanmış ama alınmamış tek seferlik görevde ödülün son alınma anı (ISO). */
  claimDeadline: string | null;
  /** Ödülün alındığı/verildiği an (ISO). */
  rewardedAt: string | null;
  cta: QuestCta | null;
}

export interface SeasonChallengeDTO {
  campaignId: string;
  name: string;
  description: string | null;
  type: 'games_played' | 'reviews_written';
  current: number;
  goal: number;
  rewardPoints: number;
  hasBadge: boolean;
  claimed: boolean;
  endsAt: string;
}

export interface QuestBoardSummary {
  /** Alınmayı bekleyen ödüller. */
  pending: { count: number; points: number; xp: number };
  /** Gruba göre tamamlanan/toplam (yalnız o grupta görev varsa). */
  groups: Record<QuestGroup, { done: number; total: number }>;
}

export interface QuestBoard {
  generatedAt: string;
  quests: QuestDTO[];
  season: SeasonChallengeDTO | null;
  summary: QuestBoardSummary;
  streak: ActivityStreak;
  /** Güncel puan bakiyesi (puan kapsülünün uçtuğu çip). */
  balance: number;
  /** Dönem sonları (ISO, İstanbul): geri sayım sunucu anına bağlıdır. */
  periodEnds: { daily: string; weekly: string; monthly: string };
}

export type QuestClaimErrorCode =
  | 'QUEST_NOT_FOUND'
  | 'QUEST_EXPIRED'
  | 'QUEST_AUTO_REWARDED'
  | 'QUEST_NOT_TRACKED'
  | 'QUEST_NOT_COMPLETED'
  | 'QUEST_ALREADY_CLAIMED'
  /** Toplu alımda beklenmeyen hata (yalnız `skipped` içinde görünür). */
  | 'QUEST_CLAIM_FAILED';

export interface QuestClaimItem {
  questId: string;
  name: string;
  points: number;
  xp: number;
}

export interface QuestClaimResult {
  claimed: QuestClaimItem[];
  /** Toplu alımda alınamayanlar (kod ile). */
  skipped: { questId: string; code: QuestClaimErrorCode }[];
  totals: { points: number; xp: number };
  balance: number | null;
  xp: number | null;
  level: number | null;
  levelUp: boolean;
}

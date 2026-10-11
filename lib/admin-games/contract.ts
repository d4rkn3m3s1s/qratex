/**
 * /admin/games — Oyun Kontrol Odası sözleşmesi (istemci + sunucu güvenli; DB yok).
 *
 * Kaynaklar: lib/minigame-config.ts (sunucu kuralları), lib/minigame-config-effective.ts
 * (admin override + ekonomi sınırları), lib/games/registry (portföy), lib/game-session.ts
 * (deneme yaşam döngüsü), lib/game-tournament.ts (haftalık turnuva).
 * Denetim raporu: docs/audit/2026-10-08/admin/admin_games.md.
 */
import { z } from 'zod';

export const OVERRIDE_FIELDS = [
  'title',
  'description',
  'emoji',
  'accent',
  'maxScore',
  'rewardThreshold',
  'rewardPoints',
  'rewardXp',
  'minDurationSec',
] as const;
export type OverrideField = (typeof OVERRIDE_FIELDS)[number];
export type NumField = 'maxScore' | 'rewardThreshold' | 'rewardPoints' | 'rewardXp' | 'minDurationSec';
export type StrField = 'title' | 'description' | 'emoji' | 'accent';
export const NUM_FIELDS: readonly NumField[] = ['rewardPoints', 'rewardXp', 'maxScore', 'rewardThreshold', 'minDurationSec'];
export const STR_FIELDS: readonly StrField[] = ['title', 'description', 'emoji', 'accent'];

export const FIELD_LABELS: Record<OverrideField | 'enabled', string> = {
  enabled: 'Aktiflik',
  title: 'Başlık',
  description: 'Açıklama',
  emoji: 'Emoji',
  accent: 'Renk',
  maxScore: 'Maks. skor',
  rewardThreshold: 'Ödül eşiği',
  rewardPoints: 'Ödül puanı',
  rewardXp: 'Ödül XP',
  minDurationSec: 'Min. süre (sn)',
};

/** Alan nereye yansır (admin B1 "yansıma haritası"). */
export const FIELD_REACH: Record<OverrideField, string> = {
  title: 'Hub kartı, oyun ekranı, bildirim',
  description: 'Hub kartı, oyun ekranı',
  emoji: 'Hub kartı, oyun ekranı',
  accent: 'Hub kartı, oyun kabuğu',
  maxScore: 'Sunucu kırpması, oyun bitişi',
  rewardThreshold: 'Sunucu ödül kararı, oyun ekranı',
  rewardPoints: 'Sunucu ödülü (lib/economy)',
  rewardXp: 'Sunucu ödülü',
  minDurationSec: 'Sunucu bot süresi koruması',
};

export interface Limits {
  rewardPoints: { min: number; max: number };
  rewardXp: { min: number; max: number };
  rewardThreshold: { min: number; max: number };
  maxScore: { min: number; max: number };
  minDurationSec: { min: number; max: number };
  titleMax: number;
  descriptionMax: number;
}

export interface GameValues {
  title: string;
  description: string;
  emoji: string;
  accent: string;
  maxScore: number;
  rewardThreshold: number;
  rewardPoints: number;
  rewardXp: number;
  minDurationSec: number;
}

export type GameOverride = { enabled: boolean } & {
  [K in OverrideField]: K extends NumField ? number | null : string | null;
};

export type Funnel = { started: number; won: number; lost: number; active: number };

/**
 * Portföy durumu (yol haritası §7.3):
 *  live     → kayıt defterinde canlı
 *  building → kayıt defterinde, yapım aşamasında (hub'da yok, ödüllü deneme kapalı)
 *  merged   → eski kimlik, yeni bir oyuna birleşti
 *  retired  → portföyden çıktı
 *  legacy   → kayıt defterinde karşılığı yok (eski sürüm)
 */
export type PortfolioStatus = 'live' | 'building' | 'merged' | 'retired' | 'legacy';

export interface GamePortfolio {
  status: PortfolioStatus;
  registryId: string | null;
  role: string | null;
  verification: string | null;
  practice: boolean;
  mergedInto: string | null;
  note: string | null;
}

export interface GameRow {
  gameType: string;
  hidden: boolean;
  hiddenReason: string | null;
  featured: boolean;
  updatedAt: string | null;
  customizedFields: OverrideField[];
  portfolio: GamePortfolio;
  defaults: GameValues;
  override: GameOverride | null;
  effective: GameValues & { enabled: boolean; maxScorePerSec: number | null; maxDurationSec: number };
  stats: {
    today: Funnel;
    last30d: Funnel;
    rewarded30d: number;
    pointsAwarded30d: number;
    flagged30d: number;
    winRate30d: number | null;
    rewardRate30d: number | null;
  };
}

export interface GamesOverview {
  games: GameRow[];
  limits: Limits;
  caps: { daily: number; weekly: number; attemptsPerDay: number };
  tournament: { featuredGameType: string | null; minParticipants: number };
  kpi: {
    playable: number;
    total: number;
    startedToday: number;
    points30d: number;
    pointsPrev30d: number;
    winRate30d: number | null;
    flagged30d: number;
    finished30d: number;
  };
  generatedAt: string;
}

export interface HistoryEntry {
  id: string;
  at: string;
  action: string;
  actor: string | null;
  reason: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
}

export interface GameDetail {
  gameType: string;
  /** Son 14 İstanbul günü (eski → yeni). */
  trend: Array<{ day: string; started: number; won: number; points: number }>;
  /** Son 30 gün biten denemelerin skor dağılımı. */
  histogram: { buckets: Array<{ from: number; to: number; count: number }>; threshold: number; maxScore: number; total: number };
  integrity: {
    total: number;
    byFlag: Array<{ flag: string; count: number }>;
    recent: Array<{ at: string; flags: string[]; clientScore: number | null; verifiedScore: number | null; user: string }>;
    /** İstemci skoru sunucu skorundan büyük olan biten denemeler (30g). */
    clientAboveServer30d: number;
  };
  verifier: { family: string | null; wired: boolean };
  history: HistoryEntry[];
}

export interface TournamentEntry {
  rank: number;
  name: string;
  best: number;
  prize: number;
}

export interface TournamentOverview {
  weekKey: string;
  endsAt: string;
  featuredGameType: string | null;
  featuredTitle: string | null;
  featuredEnabled: boolean;
  participants: number;
  minParticipants: number;
  prizes: Record<1 | 2 | 3, number>;
  top: TournamentEntry[];
  rotation: Array<{ weekKey: string; gameType: string | null; title: string | null }>;
  lastWeek: {
    weekKey: string;
    gameType: string | null;
    title: string | null;
    participants: number;
    claims: Array<{ rank: number; name: string; points: number; at: string }>;
    unclaimed: number;
  };
}

// ─────────────────────────── Doğrulama (PATCH / bulk) ───────────────────────────

export const INTEGRITY_FLAG_LABELS: Record<string, string> = {
  proof_missing: 'Kanıt yok',
  proof_invalid: 'Geçersiz kanıt',
  implausible: 'İnsanüstü hız',
  score_mismatch: 'Skor uyuşmazlığı',
  score_clamped: 'Skor tavana kırpıldı',
  client_clock_mismatch: 'Saat uyuşmazlığı',
};

export const PORTFOLIO_LABELS: Record<PortfolioStatus, string> = {
  live: 'Canlı',
  building: 'Yapımda',
  merged: 'Birleşti',
  retired: 'Emekli',
  legacy: 'Eski sürüm',
};

export const HISTORY_ACTION_LABELS: Record<string, string> = {
  minigame_config_update: 'Ayar değişti',
  minigame_config_reset: 'Varsayılana sıfırlandı',
  minigame_config_bulk: 'Toplu durum değişikliği',
};

export const bulkSchema = z.object({
  action: z.enum(['disable', 'enable']),
  gameTypes: z.array(z.string().min(1).max(64)).min(1, 'En az bir oyun seçin.').max(50),
  reason: z
    .string()
    .trim()
    .min(3, 'Gerekçe en az 3 karakter olmalı.')
    .max(200, 'Gerekçe en fazla 200 karakter olabilir.'),
});
export type BulkInput = z.infer<typeof bulkSchema>;

export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

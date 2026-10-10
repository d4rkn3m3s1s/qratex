/**
 * An Motoru (Moment Engine) — ortak tipler. Sunucu ve istemci ikisi de bu dosyayı
 * içe aktarabilir (Prisma/Node bağımlılığı YOK).
 *
 * Spec: docs/superpowers/specs/2026-10-08-moment-engine-design.md §1 "Payload biçimleri".
 */

export const MOMENT_KINDS = ['level_up', 'league_up', 'badge'] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

export interface LevelUpPayload {
  from: number;
  to: number;
  xp: number;
}

export interface LeagueUpPayload {
  fromKey: string;
  fromName: string;
  toKey: string;
  toName: string;
  points: number;
}

export interface BadgeMomentPayload {
  badgeId: string;
  name: string;
  icon: string;
  rarity: string;
  /** Admin'in rozete verdiği vurgu rengi (hex). null → nadirlik rengi. */
  color: string | null;
  /** Kazanılana kadar gizli (sürpriz) rozet mi. */
  hidden: boolean;
}

export interface MomentPayloadByKind {
  level_up: LevelUpPayload;
  league_up: LeagueUpPayload;
  badge: BadgeMomentPayload;
}

/** Sunucuya yazılacak tek bir an (dedupeKey dahil). */
export type MomentInput = {
  [K in MomentKind]: { kind: K; payload: MomentPayloadByKind[K]; dedupeKey: string };
}[MomentKind];

/** `GET /api/customer/moments` ile istemciye dönen sunucu kaydı. */
export type Moment = {
  [K in MomentKind]: {
    id: string;
    kind: K;
    payload: MomentPayloadByKind[K];
    /** ISO 8601. */
    createdAt: string;
  };
}[MomentKind];

/** Küçük, kaydedilmeyen puan anı (istemci içi; `moments.points()`). */
export interface PointsMoment {
  points: number;
  xp?: number;
}

/** `GET /api/customer/moments` en fazla bu kadar görülmemiş an döndürür. */
export const MOMENTS_FETCH_LIMIT = 10;
/** `POST /api/customer/moments/seen` tek istekte en fazla bu kadar id kabul eder. */
export const MOMENTS_SEEN_MAX_IDS = 20;

export function isMomentKind(value: unknown): value is MomentKind {
  return typeof value === 'string' && (MOMENT_KINDS as readonly string[]).includes(value);
}

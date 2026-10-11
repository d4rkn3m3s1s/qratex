/**
 * Kademeli açılış (rollout) — saf değerlendirme. `FeatureFlag` satırı bir katalog modülünün
 * açılış kuralıdır:
 *   key = modül anahtarı · isEnabled = kural etkin · expiresAt = kural bitişi (sonra modül herkese açık)
 *   metadata = { kind: 'module_rollout', percent, allowUserIds, note, archivedAt? }
 *
 * Değerlendirme (yalnız modül genel olarak AÇIKKEN ve `feature_flags` anahtarı açıkken çağrılır):
 *   kural yok / etkin değil / süresi dolmuş / %100 → geçer
 *   kullanıcı allowlist'te → geçer
 *   oturumsuz istek → kapsam dışı (kademeli açılışta yalnız tanınan kullanıcılar)
 *   sha256("<key>:<userId>") % 100 < percent → geçer (deterministik, yapışkan)
 */
import { createHash } from 'crypto';

export type RolloutRule = {
  key: string;
  active: boolean;
  percent: number;
  allowUserIds: string[];
  expiresAt: Date | null;
};

export type RolloutMeta = {
  kind: 'module_rollout' | null;
  percent: number;
  allowUserIds: string[];
  note: string | null;
  archivedAt: string | null;
};

export function parseRolloutMeta(raw: unknown): RolloutMeta {
  const m = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pct = typeof m.percent === 'number' && Number.isFinite(m.percent) ? Math.round(m.percent) : 100;
  return {
    kind: m.kind === 'module_rollout' ? 'module_rollout' : null,
    percent: Math.min(100, Math.max(0, pct)),
    allowUserIds: Array.isArray(m.allowUserIds) ? m.allowUserIds.filter((x): x is string => typeof x === 'string').slice(0, 200) : [],
    note: typeof m.note === 'string' ? m.note : null,
    archivedAt: typeof m.archivedAt === 'string' ? m.archivedAt : null,
  };
}

/** 0–99 arası yapışkan kova. */
export function rolloutBucket(key: string, userId: string): number {
  return createHash('sha256').update(`${key}:${userId}`, 'utf8').digest().readUInt32BE(0) % 100;
}

export function isRuleLive(rule: Pick<RolloutRule, 'active' | 'expiresAt'>, now: Date = new Date()): boolean {
  if (!rule.active) return false;
  return !(rule.expiresAt && rule.expiresAt.getTime() <= now.getTime());
}

export type RolloutDecision = 'pass' | 'excluded';

export function evaluateRollout(rule: RolloutRule | null | undefined, userId: string | null | undefined, now: Date = new Date()): RolloutDecision {
  if (!rule || !isRuleLive(rule, now) || rule.percent >= 100) return 'pass';
  if (userId && rule.allowUserIds.includes(userId)) return 'pass';
  if (!userId) return 'excluded';
  return rolloutBucket(rule.key, userId) < rule.percent ? 'pass' : 'excluded';
}

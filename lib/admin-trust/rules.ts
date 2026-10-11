/**
 * Güven Merkezi tespit kuralları — saf mantık (Jest ile test edilir).
 * Sunucu ham toplamları okur; vaka adayına çevirme, tekilleştirme ve ayar normalizasyonu burada.
 */
import { DEFAULT_TRUST_RULES, RULE_TYPE, TrustRulesSchema, type CaseSeverity, type RuleKey, type TrustRules } from './contract';

/** Ayardan okunan değeri doğrular; bozuk/eksik alan varsayılana düşer (sunucu otoriter varsayılan). */
export function normalizeRules(raw: unknown): { rules: TrustRules; isDefault: boolean } {
  if (!raw || typeof raw !== 'object') return { rules: DEFAULT_TRUST_RULES, isDefault: true };
  const src = raw as Record<string, unknown>;
  const merged = {
    velocity: { ...DEFAULT_TRUST_RULES.velocity, ...(src.velocity as object | undefined) },
    rapidConsumption: { ...DEFAULT_TRUST_RULES.rapidConsumption, ...(src.rapidConsumption as object | undefined) },
    sharedIp: { ...DEFAULT_TRUST_RULES.sharedIp, ...(src.sharedIp as object | undefined) },
  };
  const parsed = TrustRulesSchema.safeParse(merged);
  return parsed.success ? { rules: parsed.data, isDefault: false } : { rules: DEFAULT_TRUST_RULES, isDefault: true };
}

export type CaseCandidate = {
  rule: RuleKey;
  type: string;
  severity: CaseSeverity;
  userId: string | null;
  ipAddress: string | null;
  description: string;
  metadata: Record<string, unknown>;
  /** Tekilleştirme anahtarı: aynı anahtarlı açık vaka varsa yeni vaka açılmaz. */
  dedupeKey: string;
};

export const dedupeKeyFor = (type: string, userId: string | null, ip: string | null) =>
  `${type.toUpperCase()}|${userId ?? ''}|${userId ? '' : ip ?? ''}`;

const fmt = (n: number) => new Intl.NumberFormat('tr-TR').format(Math.round(n));

export function velocityCandidates(rows: { userId: string; total: number }[], rule: TrustRules['velocity']): CaseCandidate[] {
  if (!rule.enabled) return [];
  return rows
    .filter((r) => r.userId && Number.isFinite(r.total) && r.total >= rule.points)
    .map((r) => ({
      rule: 'velocity' as const,
      type: RULE_TYPE.velocity,
      severity: r.total >= rule.points * 3 ? 'CRITICAL' : rule.severity,
      userId: r.userId,
      ipAddress: null,
      description: `Son ${rule.windowHours} saatte ${fmt(r.total)} puan kazanıldı (eşik ${fmt(rule.points)}).`,
      metadata: { source: 'trust-scan', rule: 'velocity', value: Math.round(r.total), threshold: rule.points, windowHours: rule.windowHours },
      dedupeKey: dedupeKeyFor(RULE_TYPE.velocity, r.userId, null),
    }));
}

export function rapidConsumptionCandidates(
  rows: { userId: string; count: number; dealers: number }[],
  rule: TrustRules['rapidConsumption'],
): CaseCandidate[] {
  if (!rule.enabled) return [];
  return rows
    .filter((r) => r.userId && r.count >= rule.count)
    .map((r) => ({
      rule: 'rapidConsumption' as const,
      type: RULE_TYPE.rapidConsumption,
      severity: rule.severity,
      userId: r.userId,
      ipAddress: null,
      description: `Son ${rule.windowMinutes} dakikada ${fmt(r.count)} tüketim (${fmt(r.dealers)} işletme; eşik ${fmt(rule.count)}).`,
      metadata: { source: 'trust-scan', rule: 'rapidConsumption', value: r.count, dealers: r.dealers, threshold: rule.count, windowMinutes: rule.windowMinutes },
      dedupeKey: dedupeKeyFor(RULE_TYPE.rapidConsumption, r.userId, null),
    }));
}

/** Özel/yerel ağ adresleri ortak IP sinyali üretmez (ofis NAT'ı, geliştirme). */
export function isRoutableIp(ip: string | null | undefined): boolean {
  const v = String(ip ?? '').trim().toLowerCase();
  if (!v || v === 'unknown') return false;
  if (v === '::1' || v.startsWith('127.') || v.startsWith('10.') || v.startsWith('192.168.')) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return false;
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return false;
  return true;
}

export function sharedIpCandidates(rows: { ip: string; userIds: string[] }[], rule: TrustRules['sharedIp']): CaseCandidate[] {
  if (!rule.enabled) return [];
  return rows
    .filter((r) => isRoutableIp(r.ip))
    .map((r) => ({ ip: r.ip, userIds: Array.from(new Set(r.userIds.filter(Boolean))).sort() }))
    .filter((r) => r.userIds.length >= rule.accounts)
    .map((r) => ({
      rule: 'sharedIp' as const,
      type: RULE_TYPE.sharedIp,
      severity: rule.severity,
      userId: null,
      ipAddress: r.ip,
      description: `Aynı IP adresinden son ${rule.windowDays} günde ${r.userIds.length} farklı müşteri hesabı işlem yaptı (eşik ${rule.accounts}).`,
      metadata: { source: 'trust-scan', rule: 'sharedIp', value: r.userIds.length, threshold: rule.accounts, windowDays: rule.windowDays, userIds: r.userIds.slice(0, 50) },
      dedupeKey: dedupeKeyFor(RULE_TYPE.sharedIp, null, r.ip),
    }));
}

/** Açık vakası olan (ya da pencere içinde çözülmüş) adayları eler; aynı tarama içi tekrarları da. */
export function dedupeCandidates(candidates: CaseCandidate[], existingKeys: Set<string>): CaseCandidate[] {
  const seen = new Set(existingKeys);
  const out: CaseCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.dedupeKey)) continue;
    seen.add(c.dedupeKey);
    out.push(c);
  }
  return out;
}

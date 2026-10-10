/**
 * Kriz radarı kuralları — saf sözleşme + değerlendirme.
 *
 * Eşiklerin düzenleme yüzeyi Otomasyon → Uyarılar'dır (`/dealer/automation/alerts`); bu modül
 * yalnız okur. Ayar yoksa (ya da bozuksa) sunucu varsayılanı kullanılır ("ayar varsayılanı
 * sunucudan"). Kayıt: `Settings[key = dealer_alert_rules:<dealerId>]`, `category = dealer_alerts`;
 * değer `RadarRules` biçimindedir ve `parseRadarRules` ile güvenli okunur.
 *
 * Denetim bulgu 3: tespit eskiden GET isteğinin yan etkisiydi. Artık değerlendirme saf
 * (`evaluateRadar`) ve vaka üretimi yalnız arka plan işinde / açık POST'ta yapılır.
 */

export type RadarRuleKey = 'rating_drop' | 'complaint_spike' | 'urgent_toxic' | 'unanswered_negative';
export type RadarLevel = 'normal' | 'watch' | 'alert';

export interface RadarRules {
  ratingDrop: { enabled: boolean; minDrop: number; minSample: number };
  complaintSpike: { enabled: boolean; count: number; windowHours: number };
  urgentToxic: { enabled: boolean; minUrgency: number };
  unansweredNegative: { enabled: boolean; slaHours: number; count: number };
}

export const DEFAULT_RADAR_RULES: RadarRules = {
  ratingDrop: { enabled: true, minDrop: 0.5, minSample: 2 },
  complaintSpike: { enabled: true, count: 3, windowHours: 24 },
  urgentToxic: { enabled: true, minUrgency: 0.8 },
  unansweredNegative: { enabled: true, slaHours: 24, count: 1 },
};

export const RADAR_RULES_CATEGORY = 'dealer_alerts';

export function radarRulesSettingsKey(dealerId: string): string {
  return `dealer_alert_rules:${dealerId}`;
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Ayar kaydını güvenli kurallara indirger (eksik/bozuk alan → varsayılan; aralık dışı → kırpılır). */
export function parseRadarRules(raw: unknown): RadarRules {
  const d = DEFAULT_RADAR_RULES;
  const r = rec(raw) ?? {};
  const rd = rec(r.ratingDrop) ?? {};
  const cs = rec(r.complaintSpike) ?? {};
  const ut = rec(r.urgentToxic) ?? {};
  const un = rec(r.unansweredNegative) ?? {};
  return {
    ratingDrop: {
      enabled: bool(rd.enabled, d.ratingDrop.enabled),
      minDrop: num(rd.minDrop, d.ratingDrop.minDrop, 0.1, 4),
      minSample: Math.round(num(rd.minSample, d.ratingDrop.minSample, 1, 500)),
    },
    complaintSpike: {
      enabled: bool(cs.enabled, d.complaintSpike.enabled),
      count: Math.round(num(cs.count, d.complaintSpike.count, 1, 500)),
      windowHours: Math.round(num(cs.windowHours, d.complaintSpike.windowHours, 1, 168)),
    },
    urgentToxic: {
      enabled: bool(ut.enabled, d.urgentToxic.enabled),
      minUrgency: num(ut.minUrgency, d.urgentToxic.minUrgency, 0.1, 1),
    },
    unansweredNegative: {
      enabled: bool(un.enabled, d.unansweredNegative.enabled),
      slaHours: Math.round(num(un.slaHours, d.unansweredNegative.slaHours, 1, 336)),
      count: Math.round(num(un.count, d.unansweredNegative.count, 1, 500)),
    },
  };
}

/** Radar için ölçülen ham değerler (sunucu SQL toplamlarıyla hesaplar). */
export interface RadarStats {
  avgLast7: number | null;
  countLast7: number;
  avgPrev7: number | null;
  countPrev7: number;
  /** Kural penceresindeki olumsuz yorum (puan ≤ 2 ya da olumsuz duygu). */
  negativesInWindow: number;
  /** Son 24 saatte acil (urgency ≥ eşik) ya da uygunsuz yorum. */
  urgentOrToxic24h: number;
  toxic24h: number;
  /** SLA süresini aşmış, yanıtsız olumsuz yorum. */
  unansweredNegative: number;
}

export interface RadarRuleEval {
  key: RadarRuleKey;
  enabled: boolean;
  value: number | null;
  threshold: number;
  ratio: number;
  level: RadarLevel;
  sample: number;
  detail: Record<string, number | null>;
}

const WATCH_RATIO = 0.6;

function levelOf(ratio: number, enabled: boolean): RadarLevel {
  if (!enabled) return 'normal';
  if (ratio >= 1) return 'alert';
  if (ratio >= WATCH_RATIO) return 'watch';
  return 'normal';
}

function ratioOf(value: number | null, threshold: number): number {
  if (value == null || threshold <= 0) return 0;
  return Math.max(0, Math.min(1, value / threshold));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Ölçümleri kurallara karşı değerlendirir (saf). */
export function evaluateRadar(stats: RadarStats, rules: RadarRules): { level: RadarLevel; rules: RadarRuleEval[] } {
  const out: RadarRuleEval[] = [];

  // 1) Puan düşüşü: önceki 7 gün ortalaması − son 7 gün ortalaması.
  const enoughSample =
    stats.countLast7 >= rules.ratingDrop.minSample &&
    stats.countPrev7 >= rules.ratingDrop.minSample &&
    stats.avgLast7 != null &&
    stats.avgPrev7 != null;
  const drop = enoughSample ? round1((stats.avgPrev7 as number) - (stats.avgLast7 as number)) : null;
  const dropValue = drop == null ? null : Math.max(0, drop);
  const dropRatio = ratioOf(dropValue, rules.ratingDrop.minDrop);
  out.push({
    key: 'rating_drop',
    enabled: rules.ratingDrop.enabled,
    value: dropValue,
    threshold: rules.ratingDrop.minDrop,
    ratio: dropRatio,
    level: levelOf(dropRatio, rules.ratingDrop.enabled && enoughSample),
    sample: stats.countLast7,
    detail: {
      avgLast7: stats.avgLast7 == null ? null : round1(stats.avgLast7),
      avgPrev7: stats.avgPrev7 == null ? null : round1(stats.avgPrev7),
      countPrev7: stats.countPrev7,
      minSample: rules.ratingDrop.minSample,
    },
  });

  // 2) Şikâyet artışı.
  const spikeRatio = ratioOf(stats.negativesInWindow, rules.complaintSpike.count);
  out.push({
    key: 'complaint_spike',
    enabled: rules.complaintSpike.enabled,
    value: stats.negativesInWindow,
    threshold: rules.complaintSpike.count,
    ratio: spikeRatio,
    level: levelOf(spikeRatio, rules.complaintSpike.enabled),
    sample: stats.negativesInWindow,
    detail: { windowHours: rules.complaintSpike.windowHours },
  });

  // 3) Acil / uygunsuz: tek yorum bile yeterli (eşik 1).
  const urgentRatio = ratioOf(stats.urgentOrToxic24h, 1);
  out.push({
    key: 'urgent_toxic',
    enabled: rules.urgentToxic.enabled,
    value: stats.urgentOrToxic24h,
    threshold: 1,
    ratio: urgentRatio,
    level: levelOf(urgentRatio, rules.urgentToxic.enabled),
    sample: stats.urgentOrToxic24h,
    detail: { toxic: stats.toxic24h, minUrgency: rules.urgentToxic.minUrgency },
  });

  // 4) SLA'yı aşan yanıtsız olumsuz yorum.
  const unRatio = ratioOf(stats.unansweredNegative, rules.unansweredNegative.count);
  out.push({
    key: 'unanswered_negative',
    enabled: rules.unansweredNegative.enabled,
    value: stats.unansweredNegative,
    threshold: rules.unansweredNegative.count,
    ratio: unRatio,
    level: levelOf(unRatio, rules.unansweredNegative.enabled),
    sample: stats.unansweredNegative,
    detail: { slaHours: rules.unansweredNegative.slaHours },
  });

  const level: RadarLevel = out.some((r) => r.level === 'alert')
    ? 'alert'
    : out.some((r) => r.level === 'watch')
      ? 'watch'
      : 'normal';
  return { level, rules: out };
}

export type RadarSeverity = 'low' | 'medium' | 'high';

/** Kural aşımında açılacak vakanın önemi (saf). */
export function radarIncidentSeverity(key: Exclude<RadarRuleKey, 'unanswered_negative'>, e: RadarRuleEval, toxic: number): RadarSeverity {
  if (key === 'rating_drop') {
    const v = e.value ?? 0;
    return v >= 1.5 ? 'high' : v >= 1 ? 'medium' : 'low';
  }
  if (key === 'complaint_spike') {
    const v = e.value ?? 0;
    return v >= e.threshold * 2 ? 'high' : v > e.threshold ? 'medium' : 'low';
  }
  return toxic > 0 ? 'high' : 'medium';
}

/** Radar kuralı → vaka türü kodu (katalog). */
export const RADAR_INCIDENT_TYPE: Readonly<Record<Exclude<RadarRuleKey, 'unanswered_negative'>, string>> = {
  rating_drop: 'rating_drop',
  complaint_spike: 'complaint_spike',
  urgent_toxic: 'negative_spike',
};

/** Çözülen radar vakası aynı koşul sürse bile bu süre boyunca yeniden açılmaz. */
export const RADAR_REOPEN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

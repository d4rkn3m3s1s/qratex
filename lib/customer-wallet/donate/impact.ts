/**
 * Bağış etkisi ve proje durumu — SAF modül (sunucu + istemci).
 *
 * Denetim (customer_donations.md): B12 (`goal = 0` → %NaN, tanımsız kategori), #40
 * (`Math.floor` ile "0 fidan"), #26 (bitiş tarihi uygulanmıyordu).
 */

export type ImpactRule = { unit: string; perPoint: number; label: string };

/** `DonationProject.impact` JSON'unu güvenle okur; bozuksa null (etki gösterilmez, uydurulmaz). */
export function parseImpact(raw: unknown): ImpactRule | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const perPoint = typeof r.perPoint === 'number' ? r.perPoint : Number(r.perPoint);
  const unit = typeof r.unit === 'string' ? r.unit.trim() : '';
  const label = typeof r.label === 'string' ? r.label.trim() : '';
  if (!Number.isFinite(perPoint) || perPoint <= 0 || !unit) return null;
  return { unit: unit.slice(0, 40), perPoint, label: label.slice(0, 80) };
}

/** Puan → etki miktarı (yuvarlama YOK; gösterimde 0–2 ondalık). */
export function impactValue(points: number, rule: ImpactRule | null): number | null {
  if (!rule || !Number.isFinite(points) || points <= 0) return null;
  return Math.round(points * rule.perPoint * 100) / 100;
}

export function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim().slice(0, 40))
    .slice(0, 8);
}

export type ProjectProgress = {
  /** 0–100 (hedef yoksa null). */
  percent: number | null;
  /** Hedefe kalan puan (hedef yoksa null). */
  remaining: number | null;
  completed: boolean;
};

export function projectProgress(current: number, goal: number): ProjectProgress {
  const cur = Math.max(0, Number.isFinite(current) ? current : 0);
  if (!Number.isFinite(goal) || goal <= 0) return { percent: null, remaining: null, completed: false };
  const percent = Math.min(100, Math.round((cur / goal) * 1000) / 10);
  const remaining = Math.max(0, goal - cur);
  return { percent, remaining, completed: remaining === 0 };
}

export const KNOWN_CATEGORIES = ['water', 'education', 'environment', 'animals', 'health'] as const;
export type KnownCategory = (typeof KNOWN_CATEGORIES)[number];

export function normalizeCategory(raw: unknown): KnownCategory | 'other' {
  return typeof raw === 'string' && (KNOWN_CATEGORIES as readonly string[]).includes(raw) ? (raw as KnownCategory) : 'other';
}

/** Bir bağışın en fazla tutarı: bakiye ve (hedef varsa) kalan ile sınırlı. */
export function maxDonation(balance: number, progress: ProjectProgress, hardMax = 100_000): number {
  const caps = [Math.max(0, Math.floor(balance)), hardMax];
  if (progress.remaining != null) caps.push(progress.remaining);
  return Math.max(0, Math.min(...caps));
}

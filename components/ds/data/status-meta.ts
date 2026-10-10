/**
 * Durum / önem sözlükleri — saf. Sayfalar renk değil ANLAM seçer.
 */
import type { Tone } from '@/components/states';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_TONE: Record<Severity, Tone> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
  info: 'info',
};

/** Önem sırası (sıralama için; küçük = daha ciddi). */
export function severityRank(s: Severity): number {
  const i = SEVERITY_ORDER.indexOf(s);
  return i === -1 ? SEVERITY_ORDER.length : i;
}

/** Sunucudan gelen serbest dizgiyi (`CRITICAL`, `warn`, `P1` …) önem düzeyine çevirir. */
export function toSeverity(raw: string | null | undefined): Severity {
  const v = (raw ?? '').trim().toLowerCase();
  if (['critical', 'crit', 'p0', 'fatal', 'blocker'].includes(v)) return 'critical';
  if (['high', 'p1', 'error', 'major', 'urgent'].includes(v)) return 'high';
  if (['medium', 'med', 'p2', 'warn', 'warning', 'moderate'].includes(v)) return 'medium';
  if (['low', 'p3', 'minor', 'trivial'].includes(v)) return 'low';
  return 'info';
}

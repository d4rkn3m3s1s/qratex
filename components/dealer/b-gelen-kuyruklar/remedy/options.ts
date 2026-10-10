import type { RemedyOption } from '@/lib/remedy-options';
import type { QueueLocale } from '../shared/format';

function num(v: number, l: QueueLocale): string {
  return Number.isInteger(v) ? String(v) : v.toLocaleString(l === 'en' ? 'en-GB' : 'tr-TR');
}

/** "%10 / %15 / %20 İndirim", "50 / 100 puan", "1 adet Ücretsiz ürün/içecek". */
export function formatOption(o: RemedyOption, l: QueueLocale): string {
  const values = [...o.values].sort((a, b) => a - b);
  if (o.type === 'discount' && o.unit === '%') return `${values.map((v) => `%${num(v, l)}`).join(' / ')} ${o.label}`;
  if (o.type === 'points') return `${values.map((v) => num(v, l)).join(' / ')} ${o.unit || (l === 'en' ? 'points' : 'puan')}`;
  return `${values.map((v) => num(v, l)).join(' / ')} ${o.unit} ${o.label}`.trim();
}

/** Tek değerin görünümü (seçim çipi). */
export function formatOptionValue(o: Pick<RemedyOption, 'type' | 'unit'>, v: number, l: QueueLocale): string {
  if (o.type === 'discount' && o.unit === '%') return `%${num(v, l)}`;
  return `${num(v, l)} ${o.unit}`.trim();
}

/** Düzenleyici durumu: tür → seçili değerler. */
export type OptionSelection = Record<string, number[]>;

export function selectionFromOptions(options: RemedyOption[]): OptionSelection {
  const out: OptionSelection = {};
  for (const o of options) out[o.type] = [...o.values].sort((a, b) => a - b);
  return out;
}

/** Seçimi izin listesi sırasıyla seçenek dizisine çevirir (boş türler atılır). */
export function optionsFromSelection(sel: OptionSelection, allowed: RemedyOption[]): RemedyOption[] {
  const out: RemedyOption[] = [];
  for (const a of allowed) {
    const vals = (sel[a.type] ?? []).filter((v) => a.values.includes(v)).sort((x, y) => x - y);
    if (vals.length) out.push({ type: a.type, label: a.label, unit: a.unit, values: vals });
  }
  return out;
}

export function sameSelection(a: OptionSelection, b: OptionSelection): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = [...(a[k] ?? [])].sort((p, q) => p - q).join(',');
    const y = [...(b[k] ?? [])].sort((p, q) => p - q).join(',');
    if (x !== y) return false;
  }
  return true;
}

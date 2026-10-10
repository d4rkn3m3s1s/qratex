/**
 * Geri kazanım haritası geometrisi — SAF (Jest ile test edilir).
 *
 * Eski radar konumları müşteri kimliğinin alfabetik sırasından türüyor, "YÖN/MENZİL" sahte
 * hassasiyet gösteriyordu. Burada her kodlama GERÇEK bir veriyi taşır:
 *  - Halka (merkezden uzaklık): geri kazanım bandı; halka içindeki konum gecikmenin büyüklüğü.
 *  - Çeyrek (açı): bu işletmedeki ziyaret sayısı (1 · 2–4 · 5–9 · 10+).
 *  - Nokta boyu: ortalama sepet (karekök ölçek).
 * En fazla 24 nokta; geri kalanı listede.
 */
import type { WinBackBand } from '@/lib/dealer-customers/types';

export const RADAR_MAX_POINTS = 24;
export const RADAR_SIZE = 320;
const C = RADAR_SIZE / 2;

/** Halka sınırları (yarıçap, viewBox biriminde). */
export const RING: Readonly<Record<WinBackBand, readonly [number, number]>> = {
  waking: [44, 84],
  sleeping: [84, 118],
  lost: [118, 148],
};

export type RadarInput = {
  ref: string;
  band: WinBackBand;
  daysSinceLast: number;
  rhythmDays: number | null;
  visits: number;
  avgOrderValue: number;
};

export type RadarPoint = { ref: string; x: number; y: number; r: number; quadrant: 0 | 1 | 2 | 3; band: WinBackBand };

export function quadrantOf(visits: number): 0 | 1 | 2 | 3 {
  if (visits >= 10) return 3;
  if (visits >= 5) return 2;
  if (visits >= 2) return 1;
  return 0;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Bant içindeki göreli gecikme (0 = bandın başı, 1 = sonu). */
export function bandProgress(p: Pick<RadarInput, 'band' | 'daysSinceLast' | 'rhythmDays'>): number {
  if (p.rhythmDays && p.rhythmDays > 0) {
    const ratio = p.daysSinceLast / p.rhythmDays;
    if (p.band === 'waking') return clamp01((ratio - 1.5) / 1.5);
    if (p.band === 'sleeping') return clamp01((ratio - 3) / 3);
    return clamp01((ratio - 6) / 6);
  }
  const d = p.daysSinceLast;
  if (p.band === 'waking') return clamp01((d - 30) / 30);
  if (p.band === 'sleeping') return clamp01((d - 60) / 60);
  return clamp01((d - 120) / 180);
}

export function layoutRadar(input: ReadonlyArray<RadarInput>): RadarPoint[] {
  const items = input.slice(0, RADAR_MAX_POINTS);
  const maxAvg = Math.max(1, ...items.map((i) => i.avgOrderValue));
  const byQuadrant: RadarInput[][] = [[], [], [], []];
  for (const it of items) byQuadrant[quadrantOf(it.visits)]!.push(it);

  const out: RadarPoint[] = [];
  byQuadrant.forEach((members, q) => {
    const n = members.length;
    members.forEach((m, i) => {
      // Çeyrek içinde eşit aralık, kenarlardan 12° pay (etiketler ve sınır çizgisi için).
      const start = (q * 90 + 12) * (Math.PI / 180);
      const span = 66 * (Math.PI / 180);
      const angle = start + (n === 1 ? span / 2 : (span * i) / (n - 1)) - Math.PI / 2;
      const [inner, outer] = RING[m.band];
      const radius = inner + (outer - inner) * (0.15 + 0.7 * bandProgress(m));
      const r = 4 + 6 * Math.sqrt(Math.max(0, m.avgOrderValue) / maxAvg);
      out.push({
        ref: m.ref,
        x: Math.round((C + radius * Math.cos(angle)) * 10) / 10,
        y: Math.round((C + radius * Math.sin(angle)) * 10) / 10,
        r: Math.round(r * 10) / 10,
        quadrant: q as 0 | 1 | 2 | 3,
        band: m.band,
      });
    });
  });
  return out;
}

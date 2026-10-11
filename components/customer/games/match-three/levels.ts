/**
 * Eşleştir-3 — seviye haritası (30 seviye, hedefli) ve rozet tanımları.
 *
 * Saf veri: istemci (harita, öğretici) ve sunucu (replay) aynı dosyayı kullanır. Seviyeler gizli
 * değildir; skoru etkileyen rastgelelik yalnız tohumdan (`sim.ts`).
 *
 * Zorluk eğrisi: 1–6 tanıtım (5 renk, bol hamle), 7–12 cam katmanı ve toplama, 13+ 6 renk,
 * 19+ geniş cam desenleri, 25–30 dar hamle bütçesi. Hedef tipleri dönüşümlü: puan / topla / cam.
 * Hedef sayıları açgözlü test botuyla kalibre edildi (`__tests__/lib/match-three.test.ts`).
 */

export const COLS = 8;
export const ROWS = 8;
export const CELLS = COLS * ROWS;

/**
 * Qratex rozet taşları. Renk tek ayırt edici değil: her rozetin kendine ait şekli/ikonu var
 * (bileşen `lucide` ikonu çizer). Palet Okabe–Ito tabanlı (renk körü güvenli).
 */
export const BADGES = [
  { key: 'star', name: 'Yıldız', color: '#E69F00' },
  { key: 'heart', name: 'Kalp', color: '#D55E00' },
  { key: 'shield', name: 'Kalkan', color: '#0072B2' },
  { key: 'comment', name: 'Yorum', color: '#009E73' },
  { key: 'qr', name: 'QR', color: '#CC79A7' },
  { key: 'trophy', name: 'Kupa', color: '#56B4E9' },
] as const;

export type GlassPattern = 'none' | 'center' | 'corners' | 'rows' | 'ring' | 'checker' | 'cross' | 'diamond' | 'full';

export type LevelGoal =
  | { type: 'score'; target: number }
  | { type: 'collect'; kind: number; count: number }
  | { type: 'glass' };

export interface LevelDef {
  /** 1 tabanlı seviye numarası. */
  n: number;
  moves: number;
  colors: 5 | 6;
  goal: LevelGoal;
  glass: GlassPattern;
}

type Row = [moves: number, colors: 5 | 6, goal: LevelGoal, glass?: GlassPattern];

const S = (target: number): LevelGoal => ({ type: 'score', target });
const C = (kind: number, count: number): LevelGoal => ({ type: 'collect', kind, count });
const G: LevelGoal = { type: 'glass' };

const TABLE: Row[] = [
  // 1–6: tanıtım
  [20, 5, S(1000)],
  [20, 5, C(0, 18)],
  [20, 5, S(1500)],
  [24, 5, G, 'center'],
  [20, 5, C(2, 24)],
  [18, 5, S(1800)],
  // 7–12: cam ve toplama
  [30, 5, G, 'corners'],
  [18, 5, C(3, 26)],
  [18, 5, S(2200)],
  [26, 5, G, 'rows'],
  [18, 5, C(1, 30)],
  [26, 5, G, 'cross'],
  // 13–18: 6 renk
  [22, 6, S(1800)],
  [22, 6, C(4, 22)],
  [26, 6, G, 'center'],
  [22, 6, S(2000)],
  [22, 6, C(5, 24)],
  [30, 6, G, 'diamond'],
  // 19–24: geniş cam
  [32, 6, G, 'ring'],
  [22, 6, S(2500)],
  [22, 6, C(0, 24)],
  [32, 6, G, 'checker'],
  [22, 6, C(2, 26)],
  [24, 6, S(2600)],
  // 25–30: dar bütçe
  [28, 6, G, 'rows'],
  [22, 6, C(3, 24)],
  [22, 6, S(2400)],
  [36, 6, G, 'full'],
  [22, 6, C(1, 26)],
  [24, 6, S(2800)],
];

export const LEVELS: readonly LevelDef[] = TABLE.map(([moves, colors, goal, glass], i) => ({
  n: i + 1,
  moves,
  colors,
  goal,
  glass: glass ?? 'none',
}));

export const LEVEL_COUNT = LEVELS.length;

export function getLevel(n: number): LevelDef | undefined {
  return Number.isInteger(n) && n >= 1 && n <= LEVEL_COUNT ? LEVELS[n - 1] : undefined;
}

/** Desen → cam hücreleri (0/1, satır-öncelikli). Saf ve deterministik. */
export function glassCells(p: GlassPattern): Uint8Array {
  const g = new Uint8Array(CELLS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const cr = Math.min(r, ROWS - 1 - r);
      const cc = Math.min(c, COLS - 1 - c);
      let on = false;
      switch (p) {
        case 'center':
          on = r >= 2 && r <= 5 && c >= 2 && c <= 5;
          break;
        case 'corners':
          on = cr <= 1 && cc <= 1;
          break;
        case 'rows':
          on = r === 2 || r === 5;
          break;
        case 'ring':
          on = cr === 1 || (cc === 1 && cr >= 1);
          break;
        case 'checker':
          on = (r + c) % 2 === 0 && cr >= 1 && cc >= 1;
          break;
        case 'cross':
          on = r === 3 || r === 4 || c === 3 || c === 4;
          break;
        case 'diamond':
          on = Math.abs(r - 3.5) + Math.abs(c - 3.5) <= 3;
          break;
        case 'full':
          on = true;
          break;
        default:
          on = false;
      }
      if (on) g[i] = 1;
    }
  }
  return g;
}

/** Sıralı günlük rota: her banttan bir seviye (tohumdan seçilir, `sim.ts` → `rankedLevels`). */
export const RANKED_BANDS: readonly (readonly [number, number])[] = [
  [1, 6],
  [7, 12],
  [13, 18],
  [19, 24],
  [25, 30],
];

/** Seviye puanı: yıldız × 10 + artan hamle (en çok 9). Sıralı skor = tamamlanan seviyelerin toplamı. */
export const LEVEL_SCORE_PER_STAR = 10;
export const LEVEL_SCORE_MOVE_CAP = 9;
export const MAX_RUN_SCORE = RANKED_BANDS.length * (3 * LEVEL_SCORE_PER_STAR + LEVEL_SCORE_MOVE_CAP);

/** Yıldız: hedef tamam = 1; artan hamle ≥ %20 = 2; ≥ %40 = 3. */
export function starsForLevel(movesLeft: number, moves: number): 1 | 2 | 3 {
  const f = movesLeft / Math.max(1, moves);
  return f >= 0.4 ? 3 : f >= 0.2 ? 2 : 1;
}

export function goalText(l: LevelDef): string {
  const g = l.goal;
  if (g.type === 'score') return `${g.target.toLocaleString('tr-TR')} puana ulaş`;
  if (g.type === 'collect') return `${g.count} ${BADGES[g.kind].name} rozeti topla`;
  return 'Tüm camları kır';
}

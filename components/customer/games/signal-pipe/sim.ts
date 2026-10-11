/**
 * Sinyal Bağla — SAF simülasyon (React'sız, tohumlu, tamsayı). İstemci oynatır, sunucu aynı tohum +
 * girdi kaydıyla yeniden oynatır (`lib/games/validators/signal-pipe.ts`). Skoru etkileyen her
 * rastgelelik `createRng(seed).fork('level-N')`'den; `Math.random` YOK.
 *
 * Kurallar (§7.3 #15 — seviyeli + süreli, garanti ödül yok):
 *  - 10 seviye; ızgara 5×5 (1–3) → 6×6 (4–7) → 7×7 (8–10). Kaynak SOL kenardan beslenir, sunucu
 *    SAĞ kenardadır. Seviye üretimi: kendini kesmeyen rastgele yol (hedefe eğilimli) + yan dallar
 *    + (ilerledikçe) tuzak borular + kilitli (döndürülemez) hücreler; sonra karıştırma. Başlangıçta
 *    çözülmüş seviye YOK (üretici garanti eder), boş hücre döndürülemez.
 *  - Ortak süre: 75 sn ile başlar, her çözülen seviye +15 sn (tavan 120 sn). Seviye geçişinde
 *    (0,7 sn) süre durur. Süre biterse oyun biter → kaybetme durumu gerçek.
 *  - "Par" = yol hücrelerini saat yönünde doğru yöne getirmek için gereken en az dokunuş
 *    (üst sınır; dallar kısayol açarsa daha azıyla da çözülebilir). Yıldız: hamle ≤ par → 3,
 *    ≤ ⌈1,5×par⌉ → 2, aksi 1. Seviye puanı = yıldız × kademe tabanı (100 / 120 / 150).
 *  - 10 seviyenin hepsi biterse kalan her tam saniye +2 puan.
 *  - Dokunuşlar arası en az `MIN_MOVE_GAP_TICKS` mantık adımı (60 Hz) — insan üstü hız replay'de
 *    reddedilir.
 *
 * Girdi kodları: 16 = saat yönü (a = hücre), 17 = saat yönü tersi (a = hücre), 18 = bitir.
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';
import { CUSTOM_CODE_BASE, type InputLog } from '@/lib/games/engine/record';

export const HZ = 60;
export const LEVELS = 10;
export const MIN_MOVE_GAP_TICKS = 4;
export const START_TICKS = 75 * HZ;
export const SOLVE_BONUS_TICKS = 15 * HZ;
export const TIME_CAP_TICKS = 120 * HZ;
export const TRANSITION_TICKS = 42;
export const CLEAR_BONUS_PER_SEC = 2;

export const CODE_CW = CUSTOM_CODE_BASE;
export const CODE_CCW = CUSTOM_CODE_BASE + 1;
export const CODE_BANK = CUSTOM_CODE_BASE + 2;

/** Yön bitleri: 1 = üst, 2 = sağ, 4 = alt, 8 = sol. */
export const UP = 1;
export const RIGHT = 2;
export const DOWN = 4;
export const LEFT = 8;
export const DIRS = [UP, RIGHT, DOWN, LEFT] as const;
const OPP: Record<number, number> = { [UP]: DOWN, [RIGHT]: LEFT, [DOWN]: UP, [LEFT]: RIGHT };
const DXY: Record<number, [number, number]> = { [UP]: [0, -1], [RIGHT]: [1, 0], [DOWN]: [0, 1], [LEFT]: [-1, 0] };

export function rotateCW(mask: number): number {
  return ((mask << 1) | (mask >> 3)) & 15;
}
export function rotateCCW(mask: number): number {
  return ((mask >> 1) | (mask << 3)) & 15;
}
/** `from`'u `to`'ya getiren en az saat yönü çevirme (0–3); ulaşılamazsa -1. */
export function cwTurns(from: number, to: number): number {
  let m = from;
  for (let r = 0; r < 4; r++) {
    if (m === to) return r;
    m = rotateCW(m);
  }
  return -1;
}

export function sizeFor(level: number): number {
  return level <= 3 ? 5 : level <= 7 ? 6 : 7;
}
export function tierBase(level: number): number {
  return level <= 3 ? 100 : level <= 7 ? 120 : 150;
}
/** Kuramsal tavan (testle hizalı; `lib/minigame-config.ts` maxScore ≥ bu). */
export const MAX_LEVEL_POINTS = (() => {
  let s = 0;
  for (let l = 1; l <= LEVELS; l++) s += 3 * tierBase(l);
  return s;
})();
export const MAX_TOTAL_SCORE = MAX_LEVEL_POINTS + Math.floor(TIME_CAP_TICKS / HZ) * CLEAR_BONUS_PER_SEC;

export interface Level {
  index: number; // 1..10
  n: number;
  srcRow: number;
  dstRow: number;
  /** Güncel maskeler (n×n, satır öncelikli). */
  mask: number[];
  /** Döndürülemez (doğru yönde sabit) hücreler. */
  locked: boolean[];
  /** Üretim yolu hücreleri — yalnız par/test; arayüzde ipucu olarak GÖSTERİLMEZ. */
  path: boolean[];
  /** Üretimdeki çözülmüş maskeler — yalnız par/test; arayüzde GÖSTERİLMEZ. */
  solution: number[];
  par: number;
}

export function starsForMoves(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  if (moves <= Math.ceil(par * 1.5)) return 2;
  return 1;
}

/** Kaynaktan akan hücreler (BFS sırası + derinlik). Kaynak hücre sol ağzı yoksa akış yok. */
export function computeFlow(lv: Pick<Level, 'n' | 'srcRow' | 'mask'>): { depth: Int16Array; order: number[] } {
  const { n, mask } = lv;
  const depth = new Int16Array(n * n).fill(-1);
  const order: number[] = [];
  const src = lv.srcRow * n;
  if (!(mask[src] & LEFT)) return { depth, order };
  depth[src] = 0;
  order.push(src);
  for (let qi = 0; qi < order.length; qi++) {
    const c = order[qi];
    const x = c % n;
    const y = (c - x) / n;
    for (const d of DIRS) {
      if (!(mask[c] & d)) continue;
      const nx = x + DXY[d][0];
      const ny = y + DXY[d][1];
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const nc = ny * n + nx;
      if (depth[nc] >= 0 || !(mask[nc] & OPP[d])) continue;
      depth[nc] = depth[c] + 1;
      order.push(nc);
    }
  }
  return { depth, order };
}

export function isSolved(lv: Pick<Level, 'n' | 'srcRow' | 'dstRow' | 'mask'>): boolean {
  const dst = lv.dstRow * lv.n + lv.n - 1;
  if (!(lv.mask[dst] & RIGHT)) return false;
  return computeFlow(lv).depth[dst] >= 0;
}

const DECOYS = [UP, UP | DOWN, UP | RIGHT, UP | RIGHT | DOWN];

/** Tohumdan deterministik seviye. Aynı (seed, level) → aynı seviye. */
export function buildLevel(seed: string, index: number): Level {
  const rng: Rng = createRng(seed).fork(`level-${index}`);
  const n = sizeFor(index);
  const N = n * n;
  const srcRow = rng.int(0, n - 1);
  const dstRow = rng.int(0, n - 1);
  const solved = new Array<number>(N).fill(0);
  const path = new Array<boolean>(N).fill(false);
  const src = srcRow * n;
  const dst = dstRow * n + n - 1;

  // Kendini kesmeyen DFS yol (ziyaret kalıcı → O(N), her zaman bulur), hedefe eğilimli.
  const visited = new Array<boolean>(N).fill(false);
  const stack: number[] = [src];
  visited[src] = true;
  const bias = index <= 3 ? 0.65 : index <= 7 ? 0.5 : 0.4;
  while (stack.length && stack[stack.length - 1] !== dst) {
    const c = stack[stack.length - 1];
    const x = c % n;
    const y = (c - x) / n;
    let cand = rng.shuffle(DIRS).filter((d) => {
      const nx = x + DXY[d][0];
      const ny = y + DXY[d][1];
      return nx >= 0 && ny >= 0 && nx < n && ny < n && !visited[ny * n + nx];
    });
    if (cand.length === 0) {
      stack.pop();
      continue;
    }
    if (rng.chance(bias)) {
      const dist = (d: number) => Math.abs(x + DXY[d][0] - (n - 1)) + Math.abs(y + DXY[d][1] - dstRow);
      cand = cand.slice().sort((a, b) => dist(a) - dist(b));
    }
    const d = cand[0];
    const nc = (y + DXY[d][1]) * n + x + DXY[d][0];
    visited[nc] = true;
    stack.push(nc);
  }
  for (let i = 0; i < stack.length; i++) {
    const c = stack[i];
    path[c] = true;
    if (i + 1 < stack.length) {
      const nx = stack[i + 1];
      const d = nx === c + 1 ? RIGHT : nx === c - 1 ? LEFT : nx === c + n ? DOWN : UP;
      solved[c] |= d;
      solved[nx] |= OPP[d];
    }
  }
  solved[src] |= LEFT;
  solved[dst] |= RIGHT;

  // Yan dallar (yoldan çıkan çıkmazlar) — görsel zenginlik + yanıltma.
  const pathCells = stack.slice();
  const branches = n - 2 + Math.floor(index / 3);
  for (let i = 0; i < branches; i++) {
    const c = rng.pick(pathCells);
    const d = rng.pick(DIRS);
    const x = c % n;
    const y = (c - x) / n;
    const nx = x + DXY[d][0];
    const ny = y + DXY[d][1];
    if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
    const nc = ny * n + nx;
    if (path[nc]) continue; // yolu kısa devre etmesin (par anlamlı kalsın)
    solved[c] |= d;
    solved[nc] |= OPP[d];
  }
  // Tuzak borular: boş hücreleri ilerledikçe doldur.
  const fill = index <= 3 ? 0.3 : index <= 7 ? 0.6 : 0.85;
  for (let c = 0; c < N; c++) {
    if (solved[c] === 0 && rng.chance(fill)) {
      let m = rng.pick(DECOYS);
      const r = rng.int(0, 3);
      for (let k = 0; k < r; k++) m = rotateCW(m);
      solved[c] = m;
    }
  }
  // Kilitli hücreler (5. seviyeden itibaren): doğru yönde sabit — çapa görevi görür.
  const locked = new Array<boolean>(N).fill(false);
  if (index >= 5) {
    const pool: number[] = [];
    for (let c = 0; c < N; c++) if (solved[c] && c !== src && c !== dst) pool.push(c);
    const picks = rng.shuffle(pool).slice(0, Math.min(pool.length, index - 3));
    for (const c of picks) locked[c] = true;
  }

  // Karıştır; çözülmüş olmasın ve par alt sınırını sağlasın.
  const minPar = Math.min(3 + index, pathCells.length);
  let mask = solved.slice();
  let par = 0;
  for (let attempt = 0; attempt < 40; attempt++) {
    mask = solved.map((m, c) => {
      if (!m || locked[c]) return m;
      let out = m;
      const r = rng.int(0, 3);
      for (let k = 0; k < r; k++) out = rotateCW(out);
      return out;
    });
    par = 0;
    for (const c of pathCells) par += cwTurns(mask[c], solved[c]);
    if (par >= minPar && !isSolved({ n, srcRow, dstRow, mask })) break;
  }
  if (isSolved({ n, srcRow, dstRow, mask })) {
    // Garanti: döndürmeyle değişen kilitsiz bir yol hücresini bir kez çevir.
    const c = pathCells.find((p) => !locked[p] && rotateCW(mask[p]) !== mask[p]) ?? pathCells[0];
    mask[c] = rotateCCW(mask[c]);
    par = 0;
    for (const p of pathCells) par += cwTurns(mask[p], solved[p]);
  }
  return { index, n, srcRow, dstRow, mask, locked, path, solution: solved, par: Math.max(1, par) };
}

export type EndReason = 'clear' | 'time' | 'bank';

export interface LevelResult {
  level: number;
  moves: number;
  par: number;
  stars: 1 | 2 | 3;
  points: number;
}

export interface RotateResult {
  ok: boolean;
  /** Bu dokunuş seviyeyi çözdü. */
  solved?: LevelResult;
  /** Bu dokunuş son seviyeyi çözdü (oyun bitti). */
  cleared?: boolean;
}

export interface PipeSim {
  readonly level: Level;
  readonly levelNo: number;
  readonly tick: number;
  readonly timeLeft: number;
  readonly moves: number;
  readonly totalMoves: number;
  readonly score: number;
  readonly results: readonly LevelResult[];
  readonly over: boolean;
  readonly endReason: EndReason | null;
  readonly clearBonus: number;
  /** Seviye geçişinde (girdi kabul edilmez, süre durur). */
  readonly inTransition: boolean;
  step(): void;
  ready(): boolean;
  /** Bu hücre şu an döndürülebilir mi (kural dışı dokunuş kayda girmemeli). */
  canRotate(cell: number): boolean;
  rotate(cell: number, dir: 1 | -1): RotateResult;
  bank(): boolean;
}

export function createPipeSim(seed: string): PipeSim {
  let levelNo = 1;
  let level = buildLevel(seed, 1);
  let tick = 0;
  let timeLeft = START_TICKS;
  let moves = 0;
  let totalMoves = 0;
  let score = 0;
  let lastMoveTick = -MIN_MOVE_GAP_TICKS;
  let transitionUntil = -1;
  let over = false;
  let endReason: EndReason | null = null;
  let clearBonus = 0;
  const results: LevelResult[] = [];

  const end = (r: EndReason) => {
    over = true;
    endReason = r;
  };

  const sim: PipeSim = {
    get level() {
      return level;
    },
    get levelNo() {
      return levelNo;
    },
    get tick() {
      return tick;
    },
    get timeLeft() {
      return timeLeft;
    },
    get moves() {
      return moves;
    },
    get totalMoves() {
      return totalMoves;
    },
    get score() {
      return score;
    },
    get results() {
      return results;
    },
    get over() {
      return over;
    },
    get endReason() {
      return endReason;
    },
    get clearBonus() {
      return clearBonus;
    },
    get inTransition() {
      return transitionUntil >= 0;
    },
    step() {
      if (over) return;
      tick++;
      if (transitionUntil >= 0) {
        if (tick >= transitionUntil) {
          transitionUntil = -1;
          levelNo++;
          level = buildLevel(seed, levelNo);
          moves = 0;
        }
        return;
      }
      timeLeft--;
      if (timeLeft <= 0) {
        timeLeft = 0;
        end('time');
      }
    },
    ready() {
      return !over && transitionUntil < 0 && tick - lastMoveTick >= MIN_MOVE_GAP_TICKS;
    },
    canRotate(cell) {
      return (
        sim.ready() &&
        Number.isInteger(cell) &&
        cell >= 0 &&
        cell < level.mask.length &&
        level.mask[cell] !== 0 &&
        !level.locked[cell]
      );
    },
    rotate(cell, dir) {
      if (!sim.canRotate(cell)) return { ok: false };
      level.mask[cell] = dir === 1 ? rotateCW(level.mask[cell]) : rotateCCW(level.mask[cell]);
      moves++;
      totalMoves++;
      lastMoveTick = tick;
      if (!isSolved(level)) return { ok: true };
      const stars = starsForMoves(moves, level.par);
      const res: LevelResult = { level: levelNo, moves, par: level.par, stars, points: stars * tierBase(levelNo) };
      results.push(res);
      score += res.points;
      if (levelNo >= LEVELS) {
        clearBonus = Math.floor(timeLeft / HZ) * CLEAR_BONUS_PER_SEC;
        score += clearBonus;
        end('clear');
        return { ok: true, solved: res, cleared: true };
      }
      timeLeft = Math.min(TIME_CAP_TICKS, timeLeft + SOLVE_BONUS_TICKS);
      transitionUntil = tick + TRANSITION_TICKS;
      return { ok: true, solved: res };
    },
    bank() {
      if (over || totalMoves === 0) return false;
      end('bank');
      return true;
    },
  };
  return sim;
}

export interface ReplayResult {
  score: number;
  levelsSolved: number;
  totalMoves: number;
  endReason: EndReason | null;
  illegal: boolean;
  detail?: string;
}

/**
 * Sunucu replay'i: zaman adım adım ilerletilir (süre/geçiş mantığı adımda), her girdi
 * kaydedildiği adımda uygulanır. Kural dışı: bilinmeyen kod, geçersiz hücre (boş/kilitli/aralık
 * dışı), geçişte ya da hız sınırı altında dokunuş, bitmiş oyuna girdi, beyan edilen adımda
 * bitmemiş oyun.
 */
export function replaySignalPipe(seed: string, log: InputLog, steps: number): ReplayResult {
  const sim = createPipeSim(seed);
  const out = (illegal: boolean, detail?: string): ReplayResult => ({
    score: illegal ? 0 : sim.score,
    levelsSolved: sim.results.length,
    totalMoves: sim.totalMoves,
    endReason: sim.endReason,
    illegal,
    detail,
  });
  let prevAt = -1;
  for (const entry of log) {
    const [at, code, a] = entry;
    if (at < prevAt) return out(true, 'kayıt sırası bozuk');
    if (at > steps) return out(true, 'kayıt oyun sonundan sonra');
    prevAt = at;
    while (sim.tick < at && !sim.over) sim.step();
    if (sim.over) return out(true, `oyun bittikten sonra girdi (adım ${at})`);
    if (code === CODE_BANK) {
      if (!sim.bank()) return out(true, 'geçersiz bitirme');
      continue;
    }
    if (code !== CODE_CW && code !== CODE_CCW) return out(true, `bilinmeyen kod ${code}`);
    if (typeof a !== 'number' || !sim.canRotate(a)) return out(true, `geçersiz dokunuş (adım ${at}, hücre ${a})`);
    sim.rotate(a, code === CODE_CW ? 1 : -1);
  }
  while (sim.tick < steps && !sim.over) sim.step();
  if (!sim.over) return out(true, 'beyan edilen adımda oyun bitmemiş');
  if (sim.tick !== steps) return out(true, 'adım sayısı uyuşmuyor');
  return out(false);
}

/** 0–3 yıldız (oyun geneli): eşik = 1, 2× eşik = 2, 3× eşik = 3. */
export function overallStars(score: number, threshold: number): 0 | 1 | 2 | 3 {
  if (threshold <= 0) return 0;
  if (score >= threshold * 3) return 3;
  if (score >= threshold * 2) return 2;
  if (score >= threshold) return 1;
  return 0;
}

export const END_TEXT: Record<EndReason, string> = {
  clear: 'tüm hatlar bağlandı',
  time: 'süre doldu',
  bank: 'oyuncu bitirdi',
};

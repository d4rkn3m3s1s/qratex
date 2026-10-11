/**
 * Eşleştir-3 — saf, tohumlu simülasyon (React'sız). İstemci ve sunucu (replay) BİREBİR aynı kodu
 * çalıştırır; skoru etkileyen her rastgelelik `createRng(seed)` alt akışlarından gelir.
 *
 * Kurallar:
 *  - 8×8 tahta, 5–6 rozet türü. Komşu iki rozeti yer değiştir; 3+ eşleşme yoksa hamle geçersiz
 *    (sayılmaz, kaydedilmez).
 *  - 4'lü → Hat taşı (yatay eşleşme satırı, dikey sütunu temizler), L/T → Bomba (3×3),
 *    5'li → Prizma (yer değiştirdiği rengin tamamını temizler). Özel + özel takası birleşik etki.
 *  - Kademeli düşüşte (kombo) her derin aşama taş başına puanı artırır (10 × derinlik, en çok ×5).
 *  - Cam: üstündeki taş temizlenince kırılır. Hamle kalmazsa tahta tohumla karıştırılır.
 *  - Seviye hedefi tamamlanınca seviye biter (yıldız artan hamleden); hamle biterse koşu biter.
 *
 * Sıralı koşu: tohumdan seçilen 5 seviye (her zorluk bandından bir). Skor = geçilen seviyelerin
 * `yıldız × 10 + min(artan hamle, 9)` toplamı (0..195). Pratik: haritadan seçilen tek seviye.
 *
 * Girdi kaydı: `[adım, CODE_SWAP, a, b]` (hücre indeksleri) ve `[adım, CODE_END]` (bitir).
 * İki takas arasında en az `MIN_SWAP_GAP_TICKS` mantık adımı (60 Hz) olmalı — insan üstü hız
 * replay'de kural dışı sayılır.
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';
import { CUSTOM_CODE_BASE, type InputLog } from '@/lib/games/engine/record';
import {
  CELLS,
  COLS,
  LEVELS,
  LEVEL_SCORE_MOVE_CAP,
  LEVEL_SCORE_PER_STAR,
  RANKED_BANDS,
  ROWS,
  getLevel,
  glassCells,
  starsForLevel,
  type LevelDef,
} from './levels';

export const CODE_SWAP = CUSTOM_CODE_BASE;
export const CODE_END = CUSTOM_CODE_BASE + 1;
/** 150 ms — animasyonsuz (azaltılmış hareket) oynayışta bile insan için rahat; botu yavaşlatır. */
export const MIN_SWAP_GAP_TICKS = 9;

/** 0 yok · 1 yatay hat · 2 dikey hat · 3 bomba · 4 prizma */
export type Special = 0 | 1 | 2 | 3 | 4;
export const SP_NONE = 0;
export const SP_LINE_H = 1;
export const SP_LINE_V = 2;
export const SP_BOMB = 3;
export const SP_PRISM = 4;
/** Prizmanın rengi yok. */
export const PRISM_KIND = -1;

export interface Tile {
  id: number;
  kind: number;
  sp: Special;
}

export interface TileView {
  id: number;
  kind: number;
  sp: Special;
  cell: number;
  /** Yeni doğan taş tahtanın kaç satır üstünden düşer (0 = doğmadı). */
  drop: number;
}

export interface Phase {
  depth: number;
  cleared: { id: number; cell: number; kind: number; sp: Special }[];
  /** Tetiklenen özel taşlar (ışın/patlama efekti için). */
  fired: { cell: number; sp: Special }[];
  /** Bu aşamada oluşan özel taşlar. */
  created: TileView[];
  glassBroken: number[];
  gained: number;
  /** Yerçekimi + doldurma sonrası tahta. */
  after: TileView[];
}

export interface LevelOutcome {
  index: number;
  n: number;
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  movesLeft: number;
  points: number;
  levelScore: number;
}

export type SwapFail = 'busy' | 'over' | 'range' | 'adjacent' | 'nomatch';

export interface SwapResult {
  ok: boolean;
  reason?: SwapFail;
  phases: Phase[];
  /** Hamle kalmadığı için karıştırıldıysa yeni tahta. */
  shuffled: TileView[] | null;
  gained: number;
  /** Bu hamleyle seviye bittiyse sonucu. */
  level?: LevelOutcome;
}

export type EndReason = 'complete' | 'failed' | 'quit';

export interface MatchSim {
  readonly tick: number;
  readonly levels: readonly LevelDef[];
  readonly levelIndex: number;
  readonly level: LevelDef;
  readonly board: readonly (Tile | null)[];
  readonly glass: Uint8Array;
  readonly movesLeft: number;
  readonly points: number;
  readonly collected: number;
  readonly glassLeft: number;
  readonly score: number;
  readonly results: readonly LevelOutcome[];
  readonly over: boolean;
  readonly endReason: EndReason | null;
  readonly swaps: number;
  readonly lastSwapTick: number;
  step(): void;
  setTick(t: number): void;
  ready(): boolean;
  swap(a: number, b: number): SwapResult;
  end(): boolean;
  view(): TileView[];
  goalProgress(): { done: number; total: number };
  findMove(): [number, number] | null;
}

// ───────────────────────────── Yardımcılar ─────────────────────────────

export const rowOf = (c: number) => Math.floor(c / COLS);
export const colOf = (c: number) => c % COLS;
export const adjacent = (a: number, b: number) =>
  (rowOf(a) === rowOf(b) && Math.abs(a - b) === 1) || (colOf(a) === colOf(b) && Math.abs(a - b) === COLS);

const kindAt = (b: readonly (Tile | null)[], i: number) => {
  const t = b[i];
  return t && t.sp !== SP_PRISM ? t.kind : -2;
};

interface Run {
  cells: number[];
  kind: number;
  dir: 'h' | 'v';
}

function findRuns(b: readonly (Tile | null)[]): Run[] {
  const runs: Run[] = [];
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const k = kindAt(b, r * COLS + c);
      let e = c + 1;
      if (k >= 0) while (e < COLS && kindAt(b, r * COLS + e) === k) e++;
      if (k >= 0 && e - c >= 3) {
        const cells: number[] = [];
        for (let x = c; x < e; x++) cells.push(r * COLS + x);
        runs.push({ cells, kind: k, dir: 'h' });
      }
      c = e;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      const k = kindAt(b, r * COLS + c);
      let e = r + 1;
      if (k >= 0) while (e < ROWS && kindAt(b, e * COLS + c) === k) e++;
      if (k >= 0 && e - r >= 3) {
        const cells: number[] = [];
        for (let y = r; y < e; y++) cells.push(y * COLS + c);
        runs.push({ cells, kind: k, dir: 'v' });
      }
      r = e;
    }
  }
  return runs;
}

/** Hücreden geçen yatay ve dikey aynı-tür uzunlukları. */
function lineLens(b: readonly (Tile | null)[], cell: number): [number, number] {
  const k = kindAt(b, cell);
  if (k < 0) return [0, 0];
  const r = rowOf(cell);
  const c = colOf(cell);
  let h = 1;
  for (let x = c - 1; x >= 0 && kindAt(b, r * COLS + x) === k; x--) h++;
  for (let x = c + 1; x < COLS && kindAt(b, r * COLS + x) === k; x++) h++;
  let v = 1;
  for (let y = r - 1; y >= 0 && kindAt(b, y * COLS + c) === k; y--) v++;
  for (let y = r + 1; y < ROWS && kindAt(b, y * COLS + c) === k; y++) v++;
  return [h, v];
}

/**
 * Takasın anlık değeri (0 = geçersiz). İpucu ve test botu kullanır; durumu değiştirmez.
 * Özel takaslar (prizma, özel + özel) her zaman geçerlidir.
 */
export function moveValue(b: (Tile | null)[], a: number, c: number): number {
  const ta = b[a];
  const tc = b[c];
  if (!ta || !tc) return 0;
  if (ta.sp === SP_PRISM || tc.sp === SP_PRISM) return 100;
  if (ta.sp !== SP_NONE && tc.sp !== SP_NONE) return 80;
  b[a] = tc;
  b[c] = ta;
  let v = 0;
  for (const cell of [a, c]) {
    const [h, w] = lineLens(b, cell);
    if (h >= 3) v += h;
    if (w >= 3) v += w;
    if (h >= 3 && w >= 3) v += 3;
  }
  b[a] = ta;
  b[c] = tc;
  if (v > 0 && (ta.sp !== SP_NONE || tc.sp !== SP_NONE)) v += 4;
  return v;
}

export function bestMove(b: (Tile | null)[]): [number, number] | null {
  let best: [number, number] | null = null;
  let bestV = 0;
  for (let i = 0; i < CELLS; i++) {
    const nbrs = [colOf(i) < COLS - 1 ? i + 1 : -1, rowOf(i) < ROWS - 1 ? i + COLS : -1];
    for (const j of nbrs) {
      if (j < 0) continue;
      const v = moveValue(b, i, j);
      if (v > bestV) {
        bestV = v;
        best = [i, j];
      }
    }
  }
  return best;
}

/** Sıralı günlük rota: her banttan bir seviye. */
export function rankedLevels(seed: string): number[] {
  const rng = createRng(seed).fork('route');
  return RANKED_BANDS.map(([lo, hi]) => rng.int(lo, hi));
}

export function levelScoreOf(stars: number, movesLeft: number): number {
  return stars * LEVEL_SCORE_PER_STAR + Math.min(LEVEL_SCORE_MOVE_CAP, movesLeft);
}

// ───────────────────────────── Simülasyon ─────────────────────────────

export function createMatchSim(seed: string, levelNs: readonly number[]): MatchSim {
  const levels = levelNs.map((n) => getLevel(n) ?? LEVELS[0]);
  if (levels.length === 0) levels.push(LEVELS[0]);
  const root = createRng(seed);

  let tick = 0;
  let lastSwapTick = -MIN_SWAP_GAP_TICKS;
  let nextId = 1;
  let levelIndex = 0;
  let rng: Rng = root.fork('lv0');
  let board: (Tile | null)[] = new Array(CELLS).fill(null);
  let glass: Uint8Array = new Uint8Array(CELLS);
  let movesLeft = 0;
  let points = 0;
  let collected = 0;
  let glassLeft = 0;
  let score = 0;
  let swaps = 0;
  let over = false;
  let endReason: EndReason | null = null;
  const results: LevelOutcome[] = [];

  const level = () => levels[levelIndex];
  const newTile = (kind: number, sp: Special = SP_NONE): Tile => ({ id: nextId++, kind, sp });
  const randKind = () => rng.int(0, level().colors - 1);

  const view = (): TileView[] => {
    const out: TileView[] = [];
    board.forEach((t, cell) => {
      if (t) out.push({ id: t.id, kind: t.kind, sp: t.sp, cell, drop: 0 });
    });
    return out;
  };

  function hasMove(): boolean {
    return bestMove(board) !== null;
  }

  function fillFresh() {
    const colors = level().colors;
    for (let attempt = 0; attempt < 100; attempt++) {
      for (let i = 0; i < CELLS; i++) {
        const r = rowOf(i);
        const c = colOf(i);
        const banned = new Set<number>();
        if (c >= 2 && board[i - 1]!.kind === board[i - 2]!.kind) banned.add(board[i - 1]!.kind);
        if (r >= 2 && board[i - COLS]!.kind === board[i - 2 * COLS]!.kind) banned.add(board[i - COLS]!.kind);
        const allowed: number[] = [];
        for (let k = 0; k < colors; k++) if (!banned.has(k)) allowed.push(k);
        board[i] = newTile(rng.pick(allowed));
      }
      if (hasMove()) return;
    }
  }

  function loadLevel(i: number) {
    levelIndex = i;
    const l = level();
    rng = root.fork(`lv${i}-${l.n}`);
    board = new Array(CELLS).fill(null);
    glass = glassCells(l.glass);
    glassLeft = glass.reduce((s, v) => s + v, 0);
    movesLeft = l.moves;
    points = 0;
    collected = 0;
    fillFresh();
  }

  function goalMet(): boolean {
    const g = level().goal;
    if (g.type === 'score') return points >= g.target;
    if (g.type === 'collect') return collected >= g.count;
    return glassLeft === 0;
  }

  function mostCommonKind(): number {
    const counts = new Array(6).fill(0);
    for (const t of board) if (t && t.sp !== SP_PRISM && t.kind >= 0) counts[t.kind]++;
    let best = 0;
    for (let k = 1; k < counts.length; k++) if (counts[k] > counts[best]) best = k;
    return best;
  }

  function areaCells(cell: number, radius: number): number[] {
    const out: number[] = [];
    const r0 = rowOf(cell);
    const c0 = colOf(cell);
    for (let r = r0 - radius; r <= r0 + radius; r++)
      for (let c = c0 - radius; c <= c0 + radius; c++) if (r >= 0 && r < ROWS && c >= 0 && c < COLS) out.push(r * COLS + c);
    return out;
  }
  const rowCells = (r: number) => Array.from({ length: COLS }, (_, c) => r * COLS + c);
  const colCells = (c: number) => Array.from({ length: ROWS }, (_, r) => r * COLS + c);

  /** Bir aşamayı uygular: `seedClear` hücreleri + zincirleme özel tetiklemeler, oluşan özeller, yerçekimi. */
  function resolvePhase(
    depth: number,
    seedClear: Iterable<number>,
    createdSpecs: { cell: number; kind: number; sp: Special }[],
    preFired: Set<number>
  ): Phase {
    const clear = new Set<number>();
    const fired: { cell: number; sp: Special }[] = [];
    const firedSet = new Set<number>(preFired);
    const queue: number[] = [];
    const add = (c: number) => {
      if (clear.has(c) || !board[c]) return;
      clear.add(c);
      const t = board[c]!;
      if (t.sp !== SP_NONE && !firedSet.has(c)) queue.push(c);
    };
    for (const c of seedClear) add(c);
    while (queue.length) {
      const c = queue.shift()!;
      if (firedSet.has(c)) continue;
      firedSet.add(c);
      const t = board[c]!;
      fired.push({ cell: c, sp: t.sp });
      let hit: number[] = [];
      if (t.sp === SP_LINE_H) hit = rowCells(rowOf(c));
      else if (t.sp === SP_LINE_V) hit = colCells(colOf(c));
      else if (t.sp === SP_BOMB) hit = areaCells(c, 1);
      else if (t.sp === SP_PRISM) {
        const k = mostCommonKind();
        hit = [];
        board.forEach((x, i) => {
          if (x && x.sp !== SP_PRISM && x.kind === k) hit.push(i);
        });
      }
      for (const h of hit) add(h);
    }

    const g = level().goal;
    const mult = Math.min(depth, 5);
    const cleared: Phase['cleared'] = [];
    const glassBroken: number[] = [];
    let gained = 0;
    for (const c of [...clear].sort((x, y) => x - y)) {
      const t = board[c]!;
      cleared.push({ id: t.id, cell: c, kind: t.kind, sp: t.sp });
      gained += 10 * mult;
      if (g.type === 'collect' && t.sp !== SP_PRISM && t.kind === g.kind) collected++;
      if (glass[c]) {
        glass[c] = 0;
        glassLeft--;
        glassBroken.push(c);
      }
      board[c] = null;
    }
    const created: TileView[] = [];
    for (const s of createdSpecs) {
      const t = newTile(s.kind, s.sp);
      board[s.cell] = t;
      gained += s.sp === SP_PRISM ? 50 : s.sp === SP_BOMB ? 30 : 20;
      created.push({ id: t.id, kind: t.kind, sp: t.sp, cell: s.cell, drop: 0 });
    }
    points += gained;

    // Yerçekimi + doldurma.
    const drops = new Map<number, number>();
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const i = r * COLS + c;
        const t = board[i];
        if (!t) continue;
        if (r !== write) {
          board[write * COLS + c] = t;
          board[i] = null;
        }
        write--;
      }
      const empties = write + 1;
      for (let r = write; r >= 0; r--) {
        const t = newTile(randKind());
        board[r * COLS + c] = t;
        drops.set(t.id, empties);
      }
    }
    const after = view().map((v) => ({ ...v, drop: drops.get(v.id) ?? 0 }));
    return { depth, cleared, fired, created, glassBroken, gained, after };
  }

  /** Eşleşme gruplarından temizlenecek hücreler + oluşacak özel taşlar. */
  function groupsToClear(runs: Run[], moved: number[]): { cells: number[]; created: { cell: number; kind: number; sp: Special }[] } {
    // Hücre paylaşan koşuları birleştir (union-find).
    const parent = runs.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const owner = new Map<number, number>();
    runs.forEach((run, i) => {
      for (const c of run.cells) {
        const o = owner.get(c);
        if (o === undefined) owner.set(c, i);
        else parent[find(i)] = find(o);
      }
    });
    const groups = new Map<number, number[]>();
    runs.forEach((_, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(i);
    });
    const cells = new Set<number>();
    const created: { cell: number; kind: number; sp: Special }[] = [];
    const usedCells = new Set<number>();
    for (const idxs of groups.values()) {
      const gr = idxs.map((i) => runs[i]);
      const gcells = new Set<number>();
      for (const r of gr) for (const c of r.cells) gcells.add(c);
      for (const c of gcells) cells.add(c);
      const maxLen = Math.max(...gr.map((r) => r.cells.length));
      const hasH = gr.some((r) => r.dir === 'h');
      const hasV = gr.some((r) => r.dir === 'v');
      let sp: Special = SP_NONE;
      if (maxLen >= 5) sp = SP_PRISM;
      else if (hasH && hasV) sp = SP_BOMB;
      else if (maxLen === 4) sp = gr[0].dir === 'h' ? SP_LINE_H : SP_LINE_V;
      if (sp === SP_NONE) continue;
      let at = moved.find((c) => gcells.has(c) && !usedCells.has(c));
      if (at === undefined && sp === SP_BOMB) {
        const h = new Set(gr.filter((r) => r.dir === 'h').flatMap((r) => r.cells));
        at = gr.filter((r) => r.dir === 'v').flatMap((r) => r.cells).find((c) => h.has(c) && !usedCells.has(c));
      }
      if (at === undefined) {
        const longest = gr.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
        at = longest.cells[Math.floor(longest.cells.length / 2)];
      }
      usedCells.add(at);
      created.push({ cell: at, kind: sp === SP_PRISM ? PRISM_KIND : gr[0].kind, sp });
    }
    return { cells: [...cells], created };
  }

  function cascade(phases: Phase[], startDepth: number) {
    for (let depth = startDepth; depth < 60; depth++) {
      const runs = findRuns(board);
      if (runs.length === 0) return;
      const g = groupsToClear(runs, []);
      phases.push(resolvePhase(depth, g.cells, g.created, new Set()));
    }
  }

  function shuffleIfStuck(): TileView[] | null {
    if (hasMove()) return null;
    const tiles = board.filter((t): t is Tile => !!t);
    for (let attempt = 0; attempt < 60; attempt++) {
      const order = rng.shuffle(tiles);
      board = order.slice();
      if (findRuns(board).length === 0 && hasMove()) return view();
    }
    // Son çare: tohumla yeni tahta (özel taşlar korunmaz; çok nadir).
    board = new Array(CELLS).fill(null);
    fillFresh();
    return view();
  }

  function finishLevel(passed: boolean): LevelOutcome {
    const l = level();
    const stars = passed ? starsForLevel(movesLeft, l.moves) : 0;
    const levelScore = passed ? levelScoreOf(stars, movesLeft) : 0;
    const out: LevelOutcome = { index: levelIndex, n: l.n, passed, stars, movesLeft, points, levelScore };
    results.push(out);
    score += levelScore;
    if (!passed) {
      over = true;
      endReason = 'failed';
    } else if (levelIndex + 1 < levels.length) {
      loadLevel(levelIndex + 1);
    } else {
      over = true;
      endReason = 'complete';
    }
    return out;
  }

  loadLevel(0);

  const sim: MatchSim = {
    get tick() {
      return tick;
    },
    levels,
    get levelIndex() {
      return levelIndex;
    },
    get level() {
      return level();
    },
    get board() {
      return board;
    },
    get glass() {
      return glass;
    },
    get movesLeft() {
      return movesLeft;
    },
    get points() {
      return points;
    },
    get collected() {
      return collected;
    },
    get glassLeft() {
      return glassLeft;
    },
    get score() {
      return score;
    },
    results,
    get over() {
      return over;
    },
    get endReason() {
      return endReason;
    },
    get swaps() {
      return swaps;
    },
    get lastSwapTick() {
      return lastSwapTick;
    },
    step() {
      tick++;
    },
    setTick(t) {
      if (Number.isFinite(t) && t > tick) tick = Math.floor(t);
    },
    ready() {
      return !over && tick - lastSwapTick >= MIN_SWAP_GAP_TICKS;
    },
    swap(a, b) {
      const fail = (reason: SwapFail): SwapResult => ({ ok: false, reason, phases: [], shuffled: null, gained: 0 });
      if (over) return fail('over');
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= CELLS || b >= CELLS) return fail('range');
      if (!adjacent(a, b)) return fail('adjacent');
      if (tick - lastSwapTick < MIN_SWAP_GAP_TICKS) return fail('busy');
      const ta = board[a]!;
      const tb = board[b]!;
      const phases: Phase[] = [];
      const before = points;

      const isCombo = ta.sp === SP_PRISM || tb.sp === SP_PRISM || (ta.sp !== SP_NONE && tb.sp !== SP_NONE);
      // Takası uygula (her durumda; eşleşme yoksa geri alınır).
      board[a] = tb;
      board[b] = ta;

      if (isCombo) {
        const seed = new Set<number>([a, b]);
        const preFired = new Set<number>([a, b]);
        const fired: { cell: number; sp: Special }[] = [];
        if (ta.sp === SP_PRISM && tb.sp === SP_PRISM) {
          for (let i = 0; i < CELLS; i++) seed.add(i);
        } else if (ta.sp === SP_PRISM || tb.sp === SP_PRISM) {
          const other = ta.sp === SP_PRISM ? tb : ta;
          const k = other.kind;
          board.forEach((t, i) => {
            if (!t || t.sp === SP_PRISM || t.kind !== k) return;
            // Prizma + özel: o rengin tüm taşları aynı özelliğe dönüşüp patlar.
            if (other.sp !== SP_NONE && t !== other) {
              t.sp = other.sp === SP_BOMB ? SP_BOMB : i % 2 === 0 ? SP_LINE_H : SP_LINE_V;
            }
            seed.add(i);
          });
          // Yalnız prizmanın kendisi "tetiklenmiş" sayılır; diğer taş (özelse) kendi etkisini de yapar.
          const prismCell = ta.sp === SP_PRISM ? b : a;
          preFired.clear();
          preFired.add(prismCell);
          fired.push({ cell: prismCell, sp: SP_PRISM });
        } else {
          // Özel + özel: hedef hücre `b` merkezli birleşik etki.
          const sps = [ta.sp, tb.sp];
          const lines = sps.filter((s) => s === SP_LINE_H || s === SP_LINE_V).length;
          const bombs = sps.filter((s) => s === SP_BOMB).length;
          const r = rowOf(b);
          const c = colOf(b);
          const addRow = (rr: number) => {
            if (rr >= 0 && rr < ROWS) for (const x of rowCells(rr)) seed.add(x);
          };
          const addCol = (cc: number) => {
            if (cc >= 0 && cc < COLS) for (const x of colCells(cc)) seed.add(x);
          };
          if (lines === 2) {
            addRow(r);
            addCol(c);
          } else if (lines === 1 && bombs === 1) {
            for (let d = -1; d <= 1; d++) {
              addRow(r + d);
              addCol(c + d);
            }
          } else {
            for (const x of areaCells(b, 2)) seed.add(x);
          }
          fired.push({ cell: b, sp: tb.sp }, { cell: a, sp: ta.sp });
        }
        const p = resolvePhase(1, seed, [], preFired);
        p.fired.unshift(...fired);
        phases.push(p);
        cascade(phases, 2);
      } else {
        const runs = findRuns(board);
        if (runs.length === 0) {
          board[a] = ta;
          board[b] = tb;
          return fail('nomatch');
        }
        const g = groupsToClear(runs, [b, a]);
        phases.push(resolvePhase(1, g.cells, g.created, new Set()));
        cascade(phases, 2);
      }

      lastSwapTick = tick;
      swaps++;
      movesLeft--;
      const gained = points - before;
      let lv: LevelOutcome | undefined;
      let shuffled: TileView[] | null = null;
      if (goalMet()) lv = finishLevel(true);
      else if (movesLeft <= 0) lv = finishLevel(false);
      else shuffled = shuffleIfStuck();
      return { ok: true, phases, shuffled, gained, level: lv };
    },
    end() {
      if (over) return false;
      over = true;
      endReason = 'quit';
      return true;
    },
    view,
    goalProgress() {
      const g = level().goal;
      if (g.type === 'score') return { done: Math.min(points, g.target), total: g.target };
      if (g.type === 'collect') return { done: Math.min(collected, g.count), total: g.count };
      const total = glassCells(level().glass).reduce((s, v) => s + v, 0);
      return { done: total - glassLeft, total };
    },
    findMove() {
      return over ? null : bestMove(board);
    },
  };
  return sim;
}

// ───────────────────────────── Replay (sunucu) ─────────────────────────────

export interface ReplayResult {
  score: number;
  illegal: boolean;
  detail?: string;
  levelsPassed: number;
  swaps: number;
  endReason: EndReason | null;
}

/** Sıralı koşuyu tohum + girdi kaydından yeniden oynatır. Saf ve senkron. */
export function replayMatchThree(seed: string, log: InputLog, steps: number): ReplayResult {
  const sim = createMatchSim(seed, rankedLevels(seed));
  const bad = (detail: string): ReplayResult => ({
    score: 0,
    illegal: true,
    detail,
    levelsPassed: 0,
    swaps: sim.swaps,
    endReason: sim.endReason,
  });
  for (const entry of log) {
    const [at, code, a, b] = entry;
    if (at > steps) return bad('kayıt oyun sonundan sonra');
    if (sim.over) return bad('bitmiş oyuna girdi');
    sim.setTick(at);
    if (code === CODE_SWAP) {
      if (a === undefined || b === undefined) return bad('eksik takas');
      const r = sim.swap(a, b);
      if (!r.ok) return bad(`geçersiz takas (${r.reason})`);
    } else if (code === CODE_END) {
      if (!sim.end()) return bad('geçersiz bitir');
    } else {
      return bad('bilinmeyen girdi kodu');
    }
  }
  if (!sim.over) return bad('oyun bitmemiş');
  const passed = sim.results.filter((r) => r.passed).length;
  return {
    score: sim.score,
    illegal: false,
    levelsPassed: passed,
    swaps: sim.swaps,
    endReason: sim.endReason,
    detail: `${passed}/${sim.levels.length} seviye, ${sim.swaps} hamle, ${sim.endReason}`,
  };
}

/** Koşu yıldızı (sonuç ekranı): eşik ve tavana göre. */
export function runStars(score: number, threshold: number, max: number): 0 | 1 | 2 | 3 {
  if (score < threshold) return 0;
  if (score >= threshold + (max - threshold) * 0.6) return 3;
  if (score >= threshold + (max - threshold) * 0.25) return 2;
  return 1;
}

/**
 * Yorum İstifi — saf, tohumlu, sabit adımlı simülasyon (React'sız).
 *
 * İstemci (60 Hz döngü) ve sunucu (deterministik replay doğrulayıcısı) BİREBİR bu modülü çalıştırır.
 * Skoru etkileyen her karar tohumdan (`createRng(seed).fork('bag')` → 7'li torba); `Math.random` yok.
 *
 * Kurallar (rapor bulguları #8/#14/#19/#25/#53'ü kapatır):
 *  - 10×18 tahta, 7'li torba (aynı parça uzun süre gelmeme / art arda yığılma yok).
 *  - SRS döndürme: parça başına 4 durum tablosu, O döndürmede kaymaz, I ve JLSTZ için standart kick tabloları;
 *    saat yönü + ters yön.
 *  - Yerçekimi seviyeye göre hızlanır (10 seviye; her 5 satırda bir), kilit gecikmesi 30 adım (en çok 15 sıfırlama).
 *  - Lock-out: kilitlenen hücrelerden biri tahtanın üstündeyse oyun biter; block-out: doğan parça çakışırsa biter.
 *  - Puan: temizlenen satır sayısının karesi (1/4/9/16). Tavan (`maxScore`) sunucunun etkin kuralından gelir;
 *    ulaşılınca oyun "tam istif" ile biter.
 *  - Sakla (hold): parça başına bir kez.
 *
 * Girdi kodları (`engine/record` ACTION_CODE + özel): 1 döndür (saat), 2 yumuşak düşür, 3 sol, 4 sağ,
 * 5 sert düşür, 6 sakla, 16 döndür (ters). Girdi kabul edildiyse (`input()` true) `tick` ile kaydedilir.
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';
import { ACTION_CODE, CUSTOM_CODE_BASE, type InputLog } from '@/lib/games/engine/record';

export const COLS = 10;
export const ROWS = 18;
export const HZ = 60;
export const COUNTDOWN_TICKS = 3 * HZ;
export const LOCK_DELAY = 30;
export const MAX_LOCK_RESETS = 15;
export const LINES_PER_LEVEL = 5;
export const MAX_LEVEL = 10;
/** Seviye → satır başına adım (60 Hz). */
export const GRAVITY: readonly number[] = [50, 42, 35, 29, 24, 20, 16, 13, 10, 8];

export const CODE = {
  ROTATE_CW: ACTION_CODE.up,
  SOFT: ACTION_CODE.down,
  LEFT: ACTION_CODE.left,
  RIGHT: ACTION_CODE.right,
  HARD: ACTION_CODE.primary,
  HOLD: ACTION_CODE.secondary,
  ROTATE_CCW: CUSTOM_CODE_BASE,
} as const;
const VALID_CODES = new Set<number>(Object.values(CODE));

export type PieceKind = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export const KINDS: readonly PieceKind[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
/** Hücre değeri: 0 boş, 1..7 = KINDS[i-1]. */
export const KIND_INDEX: Record<PieceKind, number> = { I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 };

type Cell = readonly [x: number, y: number];

const SPAWN_SHAPES: Record<PieceKind, { n: number; cells: Cell[] }> = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
};

/** Ekran koordinatında (y aşağı) saat yönünde döndürme: (x, y) → (n−1−y, x). */
function rotateCells(cells: readonly Cell[], n: number): Cell[] {
  return cells.map(([x, y]) => [n - 1 - y, x] as const);
}

/** Parça → 4 rotasyon durumu (0, R, 2, L). */
export const SHAPES: Record<PieceKind, Cell[][]> = (() => {
  const out = {} as Record<PieceKind, Cell[][]>;
  for (const k of KINDS) {
    const { n, cells } = SPAWN_SHAPES[k];
    const states: Cell[][] = [cells.map((c) => [c[0], c[1]] as const)];
    for (let i = 1; i < 4; i++) states.push(k === 'O' ? states[0] : rotateCells(states[i - 1], n));
    out[k] = states;
  }
  return out;
})();

// SRS kick tabloları (y YUKARI pozitif yazılır; uygularken y negatiflenir).
type Kick = readonly [number, number];
const JLSTZ_KICKS: Record<string, Kick[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS: Record<string, Kick[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export interface Piece {
  kind: PieceKind;
  rot: number;
  x: number;
  y: number;
}

export type EndCause = 'topout' | 'max';

export type SimEvent =
  | { t: 'count'; n: number }
  | { t: 'go' }
  | { t: 'move' }
  | { t: 'rotate' }
  | { t: 'hold' }
  | { t: 'lock'; hard: boolean }
  | { t: 'clear'; n: number; rows: number[]; gained: number; score: number }
  | { t: 'level'; level: number }
  | { t: 'threshold' }
  | { t: 'over'; cause: EndCause };

export interface StackSimOptions {
  /** Tavan skor (sunucu etkin kuralı) — ulaşılınca oyun biter. */
  maxScore?: number;
  /** Ödül eşiği (yalnız `threshold` olayı için; kozmetik). */
  threshold?: number;
  /** Efekt olaylarını biriktir (istemci). Sunucu replay'inde kapalı. */
  events?: boolean;
}

export interface StackSim {
  readonly board: Uint8Array;
  readonly piece: Piece | null;
  readonly hold: PieceKind | null;
  readonly canHold: boolean;
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly tick: number;
  readonly over: boolean;
  readonly cause: EndCause | null;
  readonly countdown: number;
  readonly pieces: number;
  readonly tetrises: number;
  /** Sıradaki parçalar (önizleme). */
  queue(n: number): PieceKind[];
  /** Hayalet parçanın y'si. */
  ghostY(): number;
  cellsOf(p: Piece): Cell[];
  /** Girdi uygula; kabul edildiyse true (kaydedilmeli). */
  input(code: number): boolean;
  step(): void;
  drainEvents(): SimEvent[];
}

export function createStackSim(seed: string, opts: StackSimOptions = {}): StackSim {
  const maxScore = Math.max(1, Math.floor(opts.maxScore ?? 40));
  const threshold = opts.threshold ?? Number.POSITIVE_INFINITY;
  const wantEvents = opts.events === true;
  const bagRng: Rng = createRng(seed).fork('bag');
  const board = new Uint8Array(COLS * ROWS);
  const bag: PieceKind[] = [];
  let piece: Piece | null = null;
  let hold: PieceKind | null = null;
  let canHold = true;
  let score = 0;
  let lines = 0;
  let level = 1;
  let tick = 0;
  let over = false;
  let cause: EndCause | null = null;
  let countdown = COUNTDOWN_TICKS;
  let gravityAcc = 0;
  let lockTimer = 0;
  let lockResets = 0;
  let pieces = 0;
  let tetrises = 0;
  let thresholdHit = false;
  let events: SimEvent[] = [];

  const emit = (e: SimEvent) => {
    if (wantEvents) events.push(e);
  };

  const refill = () => {
    while (bag.length < 7) bag.push(...bagRng.shuffle(KINDS));
  };
  refill();

  const cellsOf = (p: Piece): Cell[] => SHAPES[p.kind][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy] as const);

  const fits = (p: Piece): boolean => {
    for (const [x, y] of cellsOf(p)) {
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      if (y >= 0 && board[y * COLS + x] !== 0) return false;
    }
    return true;
  };

  const end = (c: EndCause) => {
    over = true;
    cause = c;
    piece = null;
    emit({ t: 'over', cause: c });
  };

  const spawn = (kind: PieceKind): boolean => {
    const n = SPAWN_SHAPES[kind].n;
    const p: Piece = { kind, rot: 0, x: Math.floor((COLS - n) / 2), y: kind === 'I' ? -1 : 0 };
    gravityAcc = 0;
    lockTimer = 0;
    lockResets = 0;
    if (!fits(p)) {
      piece = null;
      end('topout');
      return false;
    }
    piece = p;
    return true;
  };

  const nextFromBag = (): PieceKind => {
    const k = bag.shift()!;
    refill();
    return k;
  };

  const grounded = (): boolean => !!piece && !fits({ ...piece, y: piece.y + 1 });

  const onMoved = () => {
    if (grounded() && lockResets < MAX_LOCK_RESETS) {
      lockTimer = 0;
      lockResets++;
    }
  };

  const lock = (hard: boolean) => {
    if (!piece) return;
    const cells = cellsOf(piece);
    const v = KIND_INDEX[piece.kind];
    let above = false;
    for (const [x, y] of cells) {
      if (y < 0) above = true;
      else board[y * COLS + x] = v;
    }
    pieces++;
    piece = null;
    emit({ t: 'lock', hard });
    if (above) {
      end('topout');
      return;
    }
    // Satır temizleme.
    const full: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      let ok = true;
      for (let x = 0; x < COLS; x++) if (board[y * COLS + x] === 0) { ok = false; break; }
      if (ok) full.push(y);
    }
    if (full.length > 0) {
      for (const row of full) {
        board.copyWithin(COLS, 0, row * COLS);
        board.fill(0, 0, COLS);
      }
      const n = full.length;
      const gained = n * n;
      score = Math.min(maxScore, score + gained);
      lines += n;
      if (n === 4) tetrises++;
      emit({ t: 'clear', n, rows: full, gained, score });
      const newLevel = Math.min(MAX_LEVEL, 1 + Math.floor(lines / LINES_PER_LEVEL));
      if (newLevel !== level) {
        level = newLevel;
        emit({ t: 'level', level });
      }
      if (!thresholdHit && score >= threshold) {
        thresholdHit = true;
        emit({ t: 'threshold' });
      }
      if (score >= maxScore) {
        end('max');
        return;
      }
    }
    canHold = true;
    spawn(nextFromBag());
  };

  const tryMove = (dx: number, dy: number): boolean => {
    if (!piece) return false;
    const p = { ...piece, x: piece.x + dx, y: piece.y + dy };
    if (!fits(p)) return false;
    piece = p;
    return true;
  };

  const tryRotate = (dir: 1 | -1): boolean => {
    if (!piece) return false;
    if (piece.kind === 'O') return true; // O döndürmede kaymaz (no-op).
    const from = piece.rot;
    const to = (from + dir + 4) % 4;
    const table = piece.kind === 'I' ? I_KICKS : JLSTZ_KICKS;
    for (const [kx, ky] of table[`${from}>${to}`]) {
      const p = { ...piece, rot: to, x: piece.x + kx, y: piece.y - ky };
      if (fits(p)) {
        piece = p;
        return true;
      }
    }
    return false;
  };

  const ghostY = (): number => {
    if (!piece) return 0;
    let y = piece.y;
    while (fits({ ...piece, y: y + 1 })) y++;
    return y;
  };

  spawn(nextFromBag());

  const sim: StackSim = {
    board,
    get piece() {
      return piece;
    },
    get hold() {
      return hold;
    },
    get canHold() {
      return canHold;
    },
    get score() {
      return score;
    },
    get lines() {
      return lines;
    },
    get level() {
      return level;
    },
    get tick() {
      return tick;
    },
    get over() {
      return over;
    },
    get cause() {
      return cause;
    },
    get countdown() {
      return countdown;
    },
    get pieces() {
      return pieces;
    },
    get tetrises() {
      return tetrises;
    },
    queue(n) {
      return bag.slice(0, n);
    },
    ghostY,
    cellsOf,
    input(code) {
      if (over || countdown > 0 || !piece || !VALID_CODES.has(code)) return false;
      switch (code) {
        case CODE.LEFT:
          if (tryMove(-1, 0)) { onMoved(); emit({ t: 'move' }); }
          return true;
        case CODE.RIGHT:
          if (tryMove(1, 0)) { onMoved(); emit({ t: 'move' }); }
          return true;
        case CODE.SOFT:
          if (tryMove(0, 1)) gravityAcc = 0;
          return true;
        case CODE.ROTATE_CW:
        case CODE.ROTATE_CCW:
          if (tryRotate(code === CODE.ROTATE_CW ? 1 : -1)) { onMoved(); emit({ t: 'rotate' }); }
          return true;
        case CODE.HARD: {
          piece = { ...piece, y: ghostY() };
          lock(true);
          return true;
        }
        case CODE.HOLD: {
          if (!canHold) return true;
          const cur = piece.kind;
          canHold = false;
          emit({ t: 'hold' });
          if (hold === null) {
            hold = cur;
            spawn(nextFromBag());
          } else {
            const k = hold;
            hold = cur;
            spawn(k);
          }
          return true;
        }
        default:
          return false;
      }
    },
    step() {
      if (over) return;
      tick++;
      if (countdown > 0) {
        if (countdown % HZ === 0) emit({ t: 'count', n: countdown / HZ });
        countdown--;
        if (countdown === 0) emit({ t: 'go' });
        return;
      }
      if (!piece) return;
      if (grounded()) {
        lockTimer++;
        if (lockTimer >= LOCK_DELAY) lock(false);
        return;
      }
      lockTimer = 0;
      gravityAcc++;
      if (gravityAcc >= GRAVITY[level - 1]) {
        gravityAcc = 0;
        tryMove(0, 1);
      }
    },
    drainEvents() {
      const e = events;
      events = [];
      return e;
    },
  };
  return sim;
}

export interface ReplayResult {
  score: number;
  lines: number;
  level: number;
  cause: EndCause | null;
  illegal: boolean;
  detail?: string;
}

/** Sunucu replay'i: aynı tohum + kayıt → aynı skor. Kural dışı kayıt `illegal`. */
export function replayReviewStack(seed: string, log: InputLog, steps: number, maxScore: number): ReplayResult {
  const sim = createStackSim(seed, { maxScore });
  let i = 0;
  const fail = (detail: string): ReplayResult => ({
    score: 0,
    lines: sim.lines,
    level: sim.level,
    cause: sim.cause,
    illegal: true,
    detail,
  });
  for (;;) {
    // Önce bu adımdaki girdiler (istemci girdiyi adımlar ARASINDA uygular), sonra adım.
    while (!sim.over && i < log.length && log[i][0] <= sim.tick) {
      const [at, code] = log[i];
      if (at < sim.tick) return fail('kayıt sırası bozuk');
      if (!sim.input(code)) return fail(`kural dışı girdi (adım ${at}, kod ${code})`);
      i++;
    }
    if (sim.over || sim.tick >= steps) break;
    sim.step();
  }
  if (i < log.length) return fail('oyun bittikten sonra girdi');
  if (!sim.over) return fail('beyan edilen adımda oyun bitmemiş');
  if (sim.tick !== steps) return fail('adım sayısı tutmuyor');
  return { score: sim.score, lines: sim.lines, level: sim.level, cause: sim.cause, illegal: false };
}

/** 0–3 yıldız: eşik = 1, eşik ile tavan arası yarı = 2, tavan = 3. */
export function starsFor(score: number, threshold: number, maxScore: number): 0 | 1 | 2 | 3 {
  if (score >= maxScore) return 3;
  if (score >= Math.ceil((threshold + maxScore) / 2)) return 2;
  if (score >= threshold) return 1;
  return 0;
}

export const END_TEXT: Record<EndCause, string> = {
  topout: 'İstif tavana ulaştı',
  max: 'Tam istif! Tavan skora ulaştın',
};

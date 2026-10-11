/**
 * Veri Yılanı — SAF simülasyon (React'sız, tohumlu). İstemci oynatır, sunucu aynı tohum +
 * girdi kaydıyla yeniden oynatır (`lib/games/validators/data-snake.ts`). Skoru etkileyen her
 * rastgelelik `createRng(seed).fork(...)`'tan; `Math.random` YOK.
 *
 * Kurallar:
 *  - 18×18 ızgara, 60 Hz mantık; yılan seviyeye göre her `moveTicks` adımda bir hücre ilerler.
 *  - 5 seviye × 6 veri paketi = 30 (tam tur). Skor = yenen paket.
 *  - Seviye 2'den itibaren "bot duvarları" (sabit engeller), 4'ten itibaren devriye gezen botlar.
 *    Engeller yılanın önüne/yakınına konmaz ve ızgarayı asla bölmez (bağlantılılık denetimi).
 *  - Kenara, duvara, bota ya da kendi gövdene çarpmak oyunu bitirir; ödül kararı sunucuda
 *    (skor ≥ eşik) — ölmek ödülü silmez.
 *  - Başta 3 sn geri sayım, seviye geçişinde kısa nefes, ölümde donmuş kare (ölüm anı görünür).
 *
 * Girdi: kod 1..4 (yukarı/aşağı/sol/sağ = ACTION_CODE). En çok 2 dönüş tamponlanır; aynı yön
 * ve 180° dönüş REDDEDİLİR (istemci yalnız kabul edileni kaydeder → replay'de reddedilen girdi
 * kural dışıdır).
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';
import type { InputLog } from '@/lib/games/engine/record';

export const HZ = 60;
export const GRID = 18;
export const CELL = 20;
export const DS_W = GRID * CELL;
export const DS_H = GRID * CELL;
export const PACKETS_PER_LEVEL = 6;
export const LEVELS = 5;
export const TOTAL_PACKETS = PACKETS_PER_LEVEL * LEVELS;
export const COUNTDOWN_TICKS = 3 * HZ;
export const LEVELUP_TICKS = Math.round(1.2 * HZ);
export const DYING_TICKS = Math.round(0.75 * HZ);
const MAX_QUEUE = 2;

export interface LevelSpec {
  /** Bir hücre ilerlemek için gereken mantık adımı (küçük = hızlı). */
  moveTicks: number;
  /** Sabit duvar parçası sayısı (her biri 2–4 hücre). */
  walls: number;
  /** Devriye botu sayısı. */
  bots: number;
}

export const LEVEL_SPECS: readonly LevelSpec[] = [
  { moveTicks: 9, walls: 0, bots: 0 },
  { moveTicks: 8, walls: 3, bots: 0 },
  { moveTicks: 7, walls: 5, bots: 0 },
  { moveTicks: 7, walls: 5, bots: 1 },
  { moveTicks: 6, walls: 6, bots: 2 },
];

export type Dir = 1 | 2 | 3 | 4; // ACTION_CODE: up, down, left, right
export const DIR = { UP: 1, DOWN: 2, LEFT: 3, RIGHT: 4 } as const;
const DX: Record<Dir, number> = { 1: 0, 2: 0, 3: -1, 4: 1 };
const DY: Record<Dir, number> = { 1: -1, 2: 1, 3: 0, 4: 0 };
const OPPOSITE: Record<Dir, Dir> = { 1: 2, 2: 1, 3: 4, 4: 3 };

export type Phase = 'countdown' | 'play' | 'levelup' | 'dying' | 'over';
export type DeathCause = 'edge' | 'wall' | 'bot' | 'self';

export interface Bot {
  path: number[];
  idx: number;
  step: 1 | -1;
}

export type SimEvent =
  | { t: 'count'; n: number }
  | { t: 'go' }
  | { t: 'eat'; cell: number; score: number }
  | { t: 'threshold' }
  | { t: 'level'; level: number }
  | { t: 'die'; cause: DeathCause; cell: number }
  | { t: 'clear' };

export const cellX = (c: number) => c % GRID;
export const cellY = (c: number) => Math.floor(c / GRID);
const cellOf = (x: number, y: number) => y * GRID + x;

export interface SnakeSim {
  readonly tick: number;
  readonly phase: Phase;
  readonly phaseTicks: number;
  readonly over: boolean;
  readonly won: boolean;
  readonly score: number;
  /** 1-tabanlı seviye. */
  readonly level: number;
  readonly eatenInLevel: number;
  /** Baş önde, hücre indeksleri. */
  readonly snake: readonly number[];
  /** Son hareketten önceki gövde (çizimde ara değerleme için). */
  readonly prevSnake: readonly number[];
  readonly dir: Dir;
  readonly food: number;
  readonly walls: ReadonlySet<number>;
  readonly bots: readonly Bot[];
  readonly prevBots: readonly number[];
  readonly moveTicks: number;
  /** Sonraki harekete kalan adım (çizim ara değerlemesi). */
  readonly moveTimer: number;
  readonly cause: DeathCause | null;
  readonly deathCell: number;
  /** Girdi uygula. Kabul edilirse true (yalnız o zaman kaydedilmeli). */
  input(code: number): boolean;
  step(): void;
  drainEvents(): SimEvent[];
}

export interface SnakeSimOptions {
  /** Olayları biriktir (istemci efektleri). Sunucu replay'inde kapalı. */
  events?: boolean;
  /** Eşik olayı için (yalnız kozmetik). */
  threshold?: number;
}

export function createSnakeSim(seed: string, opts: SnakeSimOptions = {}): SnakeSim {
  const root: Rng = createRng(`data-snake:${seed}`);
  const foodRng = root.fork('food');
  const withEvents = opts.events === true;
  const threshold = opts.threshold ?? Infinity;
  const events: SimEvent[] = [];
  const emit = (e: SimEvent) => {
    if (withEvents) events.push(e);
  };

  const mid = Math.floor(GRID / 2);
  let snake: number[] = [cellOf(5, mid), cellOf(4, mid), cellOf(3, mid)];
  let prevSnake = snake.slice();
  let dir: Dir = DIR.RIGHT;
  const queue: Dir[] = [];
  let walls = new Set<number>();
  let bots: Bot[] = [];
  let prevBots: number[] = [];
  let botCells = new Set<number>();
  let botPathCells = new Set<number>();
  let food = -1;
  let tick = 0;
  let phase: Phase = 'countdown';
  let phaseTicks = COUNTDOWN_TICKS;
  let score = 0;
  let level = 1;
  let eatenInLevel = 0;
  let moveTimer = LEVEL_SPECS[0].moveTicks;
  let botTimer = 0;
  let won = false;
  let cause: DeathCause | null = null;
  let deathCell = -1;

  const spec = () => LEVEL_SPECS[level - 1];

  const refreshBotCells = () => {
    botCells = new Set(bots.map((b) => b.path[b.idx]));
  };

  /** Engeller dışındaki tüm hücreler tek parça mı (yılan gövdesi geçilebilir sayılır). */
  const connected = (blocked: Set<number>): boolean => {
    const total = GRID * GRID - blocked.size;
    const start = snake[0];
    if (blocked.has(start)) return false;
    const seen = new Uint8Array(GRID * GRID);
    const stack = [start];
    seen[start] = 1;
    let n = 0;
    while (stack.length) {
      const c = stack.pop()!;
      n++;
      const x = cellX(c);
      const y = cellY(c);
      const nb = [x > 0 ? c - 1 : -1, x < GRID - 1 ? c + 1 : -1, y > 0 ? c - GRID : -1, y < GRID - 1 ? c + GRID : -1];
      for (const m of nb) {
        if (m < 0 || seen[m] || blocked.has(m)) continue;
        seen[m] = 1;
        stack.push(m);
      }
    }
    return n === total;
  };

  /** Yılanın başına yakın ve önündeki hücreler (engel konmaz). */
  const safeZone = (): Set<number> => {
    const z = new Set<number>(snake);
    const hx = cellX(snake[0]);
    const hy = cellY(snake[0]);
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = hx + dx;
        const y = hy + dy;
        if (x >= 0 && y >= 0 && x < GRID && y < GRID) z.add(cellOf(x, y));
      }
    const d = queue.length ? queue[queue.length - 1] : dir;
    for (let k = 1; k <= 7; k++) {
      const x = hx + DX[d] * k;
      const y = hy + DY[d] * k;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) break;
      z.add(cellOf(x, y));
    }
    return z;
  };

  const buildObstacles = () => {
    const r = root.fork(`level-${level}`);
    const s = spec();
    const zone = safeZone();
    const nextWalls = new Set<number>();
    const nextBots: Bot[] = [];
    const pathCells = new Set<number>();
    const blockedAll = () => new Set<number>([...nextWalls, ...pathCells]);

    for (let i = 0; i < s.walls; i++) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const len = r.int(2, 4);
        const horiz = r.chance(0.5);
        const x0 = r.int(0, horiz ? GRID - len : GRID - 1);
        const y0 = r.int(0, horiz ? GRID - 1 : GRID - len);
        const cells: number[] = [];
        for (let k = 0; k < len; k++) cells.push(horiz ? cellOf(x0 + k, y0) : cellOf(x0, y0 + k));
        if (cells.some((c) => zone.has(c) || nextWalls.has(c))) continue;
        const trial = blockedAll();
        cells.forEach((c) => trial.add(c));
        if (!connected(trial)) continue;
        cells.forEach((c) => nextWalls.add(c));
        break;
      }
    }
    for (let i = 0; i < s.bots; i++) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const len = r.int(4, 6);
        const horiz = r.chance(0.5);
        const x0 = r.int(0, horiz ? GRID - len : GRID - 1);
        const y0 = r.int(0, horiz ? GRID - 1 : GRID - len);
        const cells: number[] = [];
        for (let k = 0; k < len; k++) cells.push(horiz ? cellOf(x0 + k, y0) : cellOf(x0, y0 + k));
        if (cells.some((c) => zone.has(c) || nextWalls.has(c) || pathCells.has(c))) continue;
        // Bot yolu en kötü durumda tamamen dolu sayılır → ızgara yine bölünmemeli.
        const trial = blockedAll();
        cells.forEach((c) => trial.add(c));
        if (!connected(trial)) continue;
        cells.forEach((c) => pathCells.add(c));
        nextBots.push({ path: cells, idx: r.int(0, len - 1), step: r.chance(0.5) ? 1 : -1 });
        break;
      }
    }
    walls = nextWalls;
    bots = nextBots;
    botPathCells = pathCells;
    refreshBotCells();
    prevBots = bots.map((b) => b.path[b.idx]);
  };

  const placeFood = () => {
    const occupied = new Set<number>([...snake, ...walls, ...botPathCells]);
    const free: number[] = [];
    for (let c = 0; c < GRID * GRID; c++) if (!occupied.has(c)) free.push(c);
    food = free.length ? free[foodRng.int(0, free.length - 1)] : -1;
  };

  placeFood();

  const die = (c: DeathCause, cell: number) => {
    cause = c;
    deathCell = cell;
    phase = 'dying';
    phaseTicks = DYING_TICKS;
    emit({ t: 'die', cause: c, cell });
  };

  const moveBots = () => {
    prevBots = bots.map((b) => b.path[b.idx]);
    const body = new Set(snake);
    for (const b of bots) {
      let ni = b.idx + b.step;
      if (ni < 0 || ni >= b.path.length) {
        b.step = (b.step === 1 ? -1 : 1) as 1 | -1;
        ni = b.idx + b.step;
      }
      // Yılan gövdesine girmez: yön değiştirip bekler (bot saldırmaz, engeldir).
      if (body.has(b.path[ni])) {
        b.step = (b.step === 1 ? -1 : 1) as 1 | -1;
        continue;
      }
      b.idx = ni;
    }
    refreshBotCells();
  };

  const moveSnake = () => {
    if (queue.length) dir = queue.shift()!;
    const head = snake[0];
    const nx = cellX(head) + DX[dir];
    const ny = cellY(head) + DY[dir];
    prevSnake = snake.slice();
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return die('edge', head);
    const next = cellOf(nx, ny);
    if (walls.has(next)) return die('wall', next);
    if (botCells.has(next)) return die('bot', next);
    const eating = next === food;
    const bodyLen = eating ? snake.length : snake.length - 1;
    for (let i = 0; i < bodyLen; i++) if (snake[i] === next) return die('self', next);
    snake.unshift(next);
    if (!eating) {
      snake.pop();
      return;
    }
    score++;
    eatenInLevel++;
    emit({ t: 'eat', cell: next, score });
    if (score === threshold) emit({ t: 'threshold' });
    if (eatenInLevel >= PACKETS_PER_LEVEL) {
      if (level >= LEVELS) {
        won = true;
        food = -1;
        phase = 'over';
        emit({ t: 'clear' });
        return;
      }
      level++;
      eatenInLevel = 0;
      buildObstacles();
      placeFood();
      phase = 'levelup';
      phaseTicks = LEVELUP_TICKS;
      emit({ t: 'level', level });
      return;
    }
    placeFood();
  };

  const sim: SnakeSim = {
    get tick() {
      return tick;
    },
    get phase() {
      return phase;
    },
    get phaseTicks() {
      return phaseTicks;
    },
    get over() {
      return phase === 'over';
    },
    get won() {
      return won;
    },
    get score() {
      return score;
    },
    get level() {
      return level;
    },
    get eatenInLevel() {
      return eatenInLevel;
    },
    get snake() {
      return snake;
    },
    get prevSnake() {
      return prevSnake;
    },
    get dir() {
      return dir;
    },
    get food() {
      return food;
    },
    get walls() {
      return walls;
    },
    get bots() {
      return bots;
    },
    get prevBots() {
      return prevBots;
    },
    get moveTicks() {
      return spec().moveTicks;
    },
    get moveTimer() {
      return moveTimer;
    },
    get cause() {
      return cause;
    },
    get deathCell() {
      return deathCell;
    },
    input(code) {
      if (phase === 'dying' || phase === 'over') return false;
      if (code !== 1 && code !== 2 && code !== 3 && code !== 4) return false;
      const d = code as Dir;
      const last = queue.length ? queue[queue.length - 1] : dir;
      if (d === last || d === OPPOSITE[last]) return false;
      if (queue.length >= MAX_QUEUE) return false;
      queue.push(d);
      return true;
    },
    step() {
      if (phase === 'over') return;
      tick++;
      if (phase === 'countdown') {
        phaseTicks--;
        if (phaseTicks > 0 && phaseTicks % HZ === 0) emit({ t: 'count', n: phaseTicks / HZ });
        if (phaseTicks <= 0) {
          phase = 'play';
          moveTimer = spec().moveTicks;
          emit({ t: 'go' });
        }
        return;
      }
      if (phase === 'levelup') {
        phaseTicks--;
        if (phaseTicks <= 0) {
          phase = 'play';
          moveTimer = spec().moveTicks;
          botTimer = 0;
        }
        return;
      }
      if (phase === 'dying') {
        phaseTicks--;
        if (phaseTicks <= 0) phase = 'over';
        return;
      }
      // play
      moveTimer--;
      if (moveTimer <= 0) {
        moveTimer = spec().moveTicks;
        moveSnake();
        if (phase !== 'play') return;
        if (bots.length) {
          botTimer++;
          if (botTimer >= 2) {
            botTimer = 0;
            moveBots();
          }
        }
      }
    },
    drainEvents() {
      if (!events.length) return events.slice(0, 0);
      return events.splice(0, events.length);
    },
  };
  return sim;
}

export interface ReplayResult {
  score: number;
  won: boolean;
  level: number;
  cause: DeathCause | null;
  illegal: boolean;
  detail?: string;
}

/** Sunucu replay'i: girdileri kaydedildikleri `tick`'te, adımdan ÖNCE uygular (istemciyle aynı). */
export function replayDataSnake(seed: string, log: InputLog, steps: number): ReplayResult {
  const sim = createSnakeSim(seed);
  let i = 0;
  const fail = (detail: string): ReplayResult => ({
    score: 0,
    won: false,
    level: sim.level,
    cause: sim.cause,
    illegal: true,
    detail,
  });
  while (!sim.over && sim.tick < steps) {
    while (i < log.length && log[i][0] <= sim.tick) {
      const [at, code] = log[i];
      if (at < sim.tick) return fail('kayıt sırası bozuk');
      if (!sim.input(code)) return fail(`kural dışı girdi (adım ${at}, kod ${code})`);
      i++;
    }
    sim.step();
  }
  if (i < log.length) return fail('oyun bittikten sonra girdi');
  if (!sim.over) return fail('beyan edilen adımda oyun bitmemiş');
  if (sim.tick !== steps) return fail('adım sayısı tutmuyor');
  return { score: sim.score, won: sim.won, level: sim.level, cause: sim.cause, illegal: false };
}

/** 0–3 yıldız: eşik = 1, eşik ile tam tur arası yarı = 2, tam tur (30) = 3. */
export function starsFor(score: number, threshold: number, total = TOTAL_PACKETS): 0 | 1 | 2 | 3 {
  if (score >= total) return 3;
  if (score >= Math.ceil((threshold + total) / 2)) return 2;
  if (score >= threshold) return 1;
  return 0;
}

export const DEATH_TEXT: Record<DeathCause, string> = {
  edge: 'Kenara çarptın',
  wall: 'Bot duvarına çarptın',
  bot: 'Devriye botuna çarptın',
  self: 'Kendi kuyruğuna çarptın',
};

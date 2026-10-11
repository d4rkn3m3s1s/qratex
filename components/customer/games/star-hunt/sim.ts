/**
 * Yıldız Avı — saf, tohumlu, sabit adımlı simülasyon (React'sız; istemci + sunucu replay).
 *
 * Kurallar:
 *  - 5 seviye; her seviyede labirentte 5 yıldız + 2 güç kapsülü. 5 yıldız → seviye temiz.
 *  - Skor = toplanan yıldız (0..25). Ödül eşiği sunucuda (`PACMAN_GAME.rewardThreshold` = 5).
 *  - 3 can. Hayalete yakalanınca can gider, konumlar sıfırlanır (toplanan yıldızlar kalır).
 *  - Güç kapsülü: hayaletler kısa süre korkar ve yenebilir (eve döner, bir süre bekler).
 *  - Zorluk eğrisi: seviye arttıkça hayalet sayısı/hızı/kararlılığı artar, güç süresi kısalır.
 *
 * Determinizm: bütün konumlar TAMSAYI alt birim (`CELL_U`), skoru etkileyen tek rastgelelik
 * `createRng(seed).fork('ghosts')`. Girdi (`input`) yalnız iki adım arasında uygulanır ve istemci
 * onu `sim.tick` ile kaydeder; sunucu `replayStarHunt` ile birebir yeniden oynatır.
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';

export const HZ = 60;
/** Bir hücrenin alt birim sayısı (tamsayı hareket). */
export const CELL_U = 120;
/** Mantıksal çizim hücresi (px). */
export const CELL_PX = 28;
export const COLS = 13;
export const ROWS = 15;
export const SH_W = COLS * CELL_PX;
export const SH_H = ROWS * CELL_PX;

export const TOTAL_LEVELS = 5;
export const STARS_PER_LEVEL = 5;
export const MAX_SCORE = TOTAL_LEVELS * STARS_PER_LEVEL;
export const START_LIVES = 3;
/** Oyunun mutlak süre tavanı (sunucu deneme penceresinin içinde kalsın): 6 dk. */
export const MAX_SIM_TICKS = 6 * 60 * HZ;

export const READY_TICKS = 90;
export const RESPAWN_READY_TICKS = 60;
export const CAUGHT_TICKS = 75;
export const CLEAR_TICKS = 100;
export const GHOST_HOME_TICKS = 150;
export const PLAYER_SPEED = 9;
export const SCARED_SPEED = 4;
/** Çarpışma: Manhattan uzaklığı (alt birim) bundan küçükse temas. */
export const HIT_DIST = 72;

/** Girdi kodları = motorun ACTION_CODE yön kodları (up 1, down 2, left 3, right 4). */
export const SH_CODE = { UP: 1, DOWN: 2, LEFT: 3, RIGHT: 4 } as const;
export type Dir = 0 | 1 | 2 | 3 | 4;
const DX = [0, 0, 0, -1, 1] as const;
const DY = [0, -1, 1, 0, 0] as const;
const OPP: readonly Dir[] = [0, 2, 1, 4, 3];
/** Sabit sıra (eşitlikte belirleyici): yukarı, sol, aşağı, sağ. */
const DIR_ORDER: readonly Dir[] = [1, 3, 2, 4];

export interface LevelSpec {
  maze: number;
  ghosts: number;
  ghostSpeed: number;
  /** Hedefe yönelme olasılığı (geri kalanı rastgele kavşak seçimi). */
  greedy: number;
  powerTicks: number;
}

/** Zorluk eğrisi (seviye 1..5). */
export const LEVELS: readonly LevelSpec[] = [
  { maze: 0, ghosts: 2, ghostSpeed: 6, greedy: 0.6, powerTicks: 360 },
  { maze: 1, ghosts: 3, ghostSpeed: 7, greedy: 0.68, powerTicks: 330 },
  { maze: 2, ghosts: 3, ghostSpeed: 7, greedy: 0.75, powerTicks: 300 },
  { maze: 0, ghosts: 4, ghostSpeed: 8, greedy: 0.8, powerTicks: 270 },
  { maze: 1, ghosts: 4, ghostSpeed: 8, greedy: 0.86, powerTicks: 240 },
];

/**
 * Labirentler (13 × 15). `#` duvar, `.` yol, `S` yıldız, `o` güç kapsülü, `P` oyuncu, `G` hayalet evi.
 * Bağlantılılık ve yıldız sayısı testte denetlenir.
 */
export const MAZES: readonly { name: string; rows: readonly string[] }[] = [
  {
    name: 'Avlu',
    rows: [
      '#############',
      '#S....#....S#',
      '#.###.#.###.#',
      '#o.........o#',
      '#.##.###.##.#',
      '#....#G#....#',
      '####.#.#.####',
      '#.....S.....#',
      '#.##.###.##.#',
      '#...#...#...#',
      '###.#.#.#.###',
      '#.....P.....#',
      '#.###.#.###.#',
      '#S....#....S#',
      '#############',
    ],
  },
  {
    name: 'Çarşı',
    rows: [
      '#############',
      '#S...#.#...S#',
      '#.#.##.##.#.#',
      '#.#.......#.#',
      '#o..#.#.#..o#',
      '###.#.G.#.###',
      '#...#####...#',
      '#.#...S...#.#',
      '#.#.##.##.#.#',
      '#.....#.....#',
      '#.###.#.###.#',
      '#S..#.P.#..S#',
      '##.##...##.##',
      '#...........#',
      '#############',
    ],
  },
  {
    name: 'Kule',
    rows: [
      '#############',
      '#.....S.....#',
      '#.##.###.##.#',
      '#S#.......#S#',
      '#.#.##G##.#.#',
      '#...#...#...#',
      '##.##.#.##.##',
      '#o....#....o#',
      '#.###.#.###.#',
      '#...........#',
      '#.#.###.###.#',
      '#.#...P...#.#',
      '#.###.#.###.#',
      '#S....#....S#',
      '#############',
    ],
  },
];

export interface Cell {
  x: number;
  y: number;
}

export interface ParsedMaze {
  name: string;
  walls: Uint8Array; // ROWS*COLS, 1 = duvar
  stars: Cell[];
  pellets: Cell[];
  player: Cell;
  home: Cell;
}

export function parseMaze(index: number): ParsedMaze {
  const m = MAZES[index];
  const walls = new Uint8Array(ROWS * COLS);
  const stars: Cell[] = [];
  const pellets: Cell[] = [];
  let player: Cell = { x: 1, y: 1 };
  let home: Cell = { x: 1, y: 1 };
  for (let y = 0; y < ROWS; y++) {
    const row = m.rows[y] ?? '';
    for (let x = 0; x < COLS; x++) {
      const ch = row[x] ?? '#';
      if (ch === '#') walls[y * COLS + x] = 1;
      else if (ch === 'S') stars.push({ x, y });
      else if (ch === 'o') pellets.push({ x, y });
      else if (ch === 'P') player = { x, y };
      else if (ch === 'G') home = { x, y };
    }
  }
  return { name: m.name, walls, stars, pellets, player, home };
}

const PARSED: readonly ParsedMaze[] = MAZES.map((_, i) => parseMaze(i));
export function getMaze(index: number): ParsedMaze {
  return PARSED[index];
}

function isWall(mz: ParsedMaze, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
  return mz.walls[y * COLS + x] === 1;
}

export interface Mover {
  /** Kalkış hücresi. */
  cx: number;
  cy: number;
  dir: Dir;
  /** Kalkış hücresinden `dir` yönünde ilerleme (0..CELL_U-1). */
  p: number;
}

export type GhostState = 'home' | 'active';
export interface Ghost extends Mover {
  id: number;
  state: GhostState;
  /** Evde bekleme sayacı (adım). */
  wait: number;
  scared: boolean;
}

export type Phase = 'ready' | 'play' | 'caught' | 'clear' | 'over';

export type SimEvent =
  | { t: 'star'; x: number; y: number; levelStars: number; total: number }
  | { t: 'pellet'; x: number; y: number }
  | { t: 'eat'; x: number; y: number; chain: number }
  | { t: 'caught'; x: number; y: number; lives: number }
  | { t: 'power-warn' }
  | { t: 'clear'; level: number }
  | { t: 'level'; level: number }
  | { t: 'threshold' }
  | { t: 'over'; won: boolean };

export interface StarHuntSim {
  readonly seed: string;
  tick: number;
  phase: Phase;
  phaseTicks: number;
  level: number; // 1..TOTAL_LEVELS
  spec: LevelSpec;
  maze: ParsedMaze;
  player: Mover;
  queued: Dir;
  ghosts: Ghost[];
  starsTaken: boolean[];
  pelletsTaken: boolean[];
  levelStars: number;
  score: number;
  lives: number;
  powerTicks: number;
  ghostsEaten: number;
  eatChain: number;
  bestChain: number;
  livesLost: number;
  over: boolean;
  won: boolean;
  /** Bir adım/girdi uygular; kabul edilirse true. */
  input(code: number): boolean;
  step(): void;
  drainEvents(): SimEvent[];
}

function newMover(c: Cell): Mover {
  return { cx: c.x, cy: c.y, dir: 0, p: 0 };
}

/** Hareketlinin alt birim konumu (hücre merkezi değil, kalkış köşesi tabanlı). */
export function moverPos(m: Mover): { x: number; y: number } {
  return { x: m.cx * CELL_U + DX[m.dir] * m.p, y: m.cy * CELL_U + DY[m.dir] * m.p };
}

/** En yakın hücre. */
export function moverCell(m: Mover): Cell {
  if (m.dir !== 0 && m.p * 2 >= CELL_U) return { x: m.cx + DX[m.dir], y: m.cy + DY[m.dir] };
  return { x: m.cx, y: m.cy };
}

export function createStarHuntSim(seed: string, opts: { events?: boolean; threshold?: number } = {}): StarHuntSim {
  const rng: Rng = createRng(seed).fork('ghosts');
  const wantEvents = opts.events === true;
  const threshold = opts.threshold ?? STARS_PER_LEVEL;
  let events: SimEvent[] = [];
  let warned = false;
  const emit = (e: SimEvent) => {
    if (wantEvents) events.push(e);
  };

  const sim: StarHuntSim = {
    seed,
    tick: 0,
    phase: 'ready',
    phaseTicks: READY_TICKS,
    level: 1,
    spec: LEVELS[0],
    maze: getMaze(LEVELS[0].maze),
    player: newMover(getMaze(LEVELS[0].maze).player),
    queued: 0,
    ghosts: [],
    starsTaken: [],
    pelletsTaken: [],
    levelStars: 0,
    score: 0,
    lives: START_LIVES,
    powerTicks: 0,
    ghostsEaten: 0,
    eatChain: 0,
    bestChain: 0,
    livesLost: 0,
    over: false,
    won: false,
    input(code) {
      if (sim.over) return false;
      if (!Number.isInteger(code) || code < 1 || code > 4) return false;
      if (sim.phase !== 'ready' && sim.phase !== 'play') return false;
      sim.queued = code as Dir;
      return true;
    },
    step() {
      if (sim.over) return;
      sim.tick += 1;
      switch (sim.phase) {
        case 'ready':
          sim.phaseTicks -= 1;
          if (sim.phaseTicks <= 0) sim.phase = 'play';
          break;
        case 'caught':
          sim.phaseTicks -= 1;
          if (sim.phaseTicks <= 0) {
            if (sim.lives <= 0) end(false);
            else {
              resetActors();
              sim.phase = 'ready';
              sim.phaseTicks = RESPAWN_READY_TICKS;
            }
          }
          break;
        case 'clear':
          sim.phaseTicks -= 1;
          if (sim.phaseTicks <= 0) {
            if (sim.level >= TOTAL_LEVELS) end(true);
            else startLevel(sim.level + 1);
          }
          break;
        case 'play':
          playTick();
          break;
        default:
          break;
      }
      if (!sim.over && sim.tick >= MAX_SIM_TICKS) end(false);
    },
    drainEvents() {
      const out = events;
      events = [];
      return out;
    },
  };

  function end(won: boolean) {
    sim.over = true;
    sim.won = won;
    sim.phase = 'over';
    emit({ t: 'over', won });
  }

  function resetActors() {
    sim.player = newMover(sim.maze.player);
    sim.queued = 0;
    sim.powerTicks = 0;
    sim.eatChain = 0;
    warned = false;
    sim.ghosts = [];
    for (let i = 0; i < sim.spec.ghosts; i++) {
      sim.ghosts.push({ ...newMover(sim.maze.home), id: i, state: 'home', wait: 30 + i * 90, scared: false });
    }
  }

  function startLevel(level: number) {
    sim.level = level;
    sim.spec = LEVELS[level - 1];
    sim.maze = getMaze(sim.spec.maze);
    sim.starsTaken = sim.maze.stars.map(() => false);
    sim.pelletsTaken = sim.maze.pellets.map(() => false);
    sim.levelStars = 0;
    resetActors();
    sim.phase = 'ready';
    sim.phaseTicks = READY_TICKS;
    emit({ t: 'level', level });
  }

  const open = (x: number, y: number) => !isWall(sim.maze, x, y);

  /** Hücre merkezinde oyuncunun yönü: kuyruk açıksa ona dön, değilse devam et ya da dur. */
  function playerChoose(m: Mover): Dir {
    const q = sim.queued;
    if (q !== 0 && open(m.cx + DX[q], m.cy + DY[q])) return q;
    if (m.dir !== 0 && open(m.cx + DX[m.dir], m.cy + DY[m.dir])) return m.dir;
    return 0;
  }

  function targetFor(g: Ghost): Cell {
    const pc = moverCell(sim.player);
    switch (g.id % 4) {
      case 0:
        return pc;
      case 1: {
        const d = sim.player.dir;
        return { x: Math.max(0, Math.min(COLS - 1, pc.x + DX[d] * 3)), y: Math.max(0, Math.min(ROWS - 1, pc.y + DY[d] * 3)) };
      }
      case 2: {
        const corners: Cell[] = [
          { x: 1, y: 1 },
          { x: COLS - 2, y: 1 },
          { x: COLS - 2, y: ROWS - 2 },
          { x: 1, y: ROWS - 2 },
        ];
        // 7 sn'de bir köşe değiştirir; oyuncuya 4 hücreden yakınsa kovalar.
        const gc = moverCell(g);
        if (Math.abs(gc.x - pc.x) + Math.abs(gc.y - pc.y) <= 4) return pc;
        return corners[Math.floor(sim.tick / 420) % 4];
      }
      default: {
        const gc = moverCell(g);
        return Math.abs(gc.x - pc.x) + Math.abs(gc.y - pc.y) > 6 ? pc : { x: 1, y: ROWS - 2 };
      }
    }
  }

  function ghostChoose(g: Ghost): Dir {
    let opts = DIR_ORDER.filter((d) => open(g.cx + DX[d], g.cy + DY[d]));
    if (opts.length === 0) return 0;
    if (opts.length > 1 && g.dir !== 0) {
      const noBack = opts.filter((d) => d !== OPP[g.dir]);
      if (noBack.length > 0) opts = noBack;
    }
    if (opts.length === 1) return opts[0];
    const pc = moverCell(sim.player);
    if (g.scared) {
      if (rng.chance(0.5)) return opts[rng.int(0, opts.length - 1)];
      let best = opts[0];
      let bd = -1;
      for (const d of opts) {
        const dd = (g.cx + DX[d] - pc.x) ** 2 + (g.cy + DY[d] - pc.y) ** 2;
        if (dd > bd) {
          bd = dd;
          best = d;
        }
      }
      return best;
    }
    if (!rng.chance(sim.spec.greedy)) return opts[rng.int(0, opts.length - 1)];
    const t = targetFor(g);
    let best = opts[0];
    let bd = Infinity;
    for (const d of opts) {
      const dd = (g.cx + DX[d] - t.x) ** 2 + (g.cy + DY[d] - t.y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  }

  /** Ortak hareket: merkezde seç, ilerle, varışta yeniden seç (artan ilerleme taşınır). */
  function advance(m: Mover, speed: number, choose: () => Dir) {
    if (m.p === 0) {
      m.dir = choose();
      if (m.dir === 0) return;
    }
    m.p += speed;
    while (m.p >= CELL_U) {
      m.cx += DX[m.dir];
      m.cy += DY[m.dir];
      m.p -= CELL_U;
      const nd = choose();
      if (nd === 0) {
        m.p = 0;
        m.dir = 0;
        return;
      }
      m.dir = nd;
    }
  }

  function reverse(m: Mover) {
    if (m.dir === 0) return;
    if (m.p > 0) {
      m.cx += DX[m.dir];
      m.cy += DY[m.dir];
      m.p = CELL_U - m.p;
    }
    m.dir = OPP[m.dir];
  }

  function playTick() {
    // Güç süresi.
    if (sim.powerTicks > 0) {
      sim.powerTicks -= 1;
      if (sim.powerTicks === 96 && !warned) {
        warned = true;
        emit({ t: 'power-warn' });
      }
      if (sim.powerTicks === 0) {
        for (const g of sim.ghosts) g.scared = false;
        sim.eatChain = 0;
      }
    }

    // Oyuncu: hücre ortasında tam geri dönüş serbest.
    const pl = sim.player;
    if (sim.queued !== 0 && pl.dir !== 0 && sim.queued === OPP[pl.dir]) reverse(pl);
    advance(pl, PLAYER_SPEED, () => playerChoose(pl));

    // Toplama.
    const c = moverCell(pl);
    sim.maze.stars.forEach((s, i) => {
      if (!sim.starsTaken[i] && s.x === c.x && s.y === c.y) {
        sim.starsTaken[i] = true;
        sim.levelStars += 1;
        sim.score += 1;
        emit({ t: 'star', x: s.x, y: s.y, levelStars: sim.levelStars, total: sim.score });
        if (sim.score === threshold) emit({ t: 'threshold' });
      }
    });
    sim.maze.pellets.forEach((p, i) => {
      if (!sim.pelletsTaken[i] && p.x === c.x && p.y === c.y) {
        sim.pelletsTaken[i] = true;
        sim.powerTicks = sim.spec.powerTicks;
        warned = false;
        sim.eatChain = 0;
        for (const g of sim.ghosts) {
          if (g.state !== 'active') continue;
          g.scared = true;
          reverse(g);
        }
        emit({ t: 'pellet', x: p.x, y: p.y });
      }
    });
    if (sim.levelStars >= STARS_PER_LEVEL) {
      sim.phase = 'clear';
      sim.phaseTicks = CLEAR_TICKS;
      sim.powerTicks = 0;
      emit({ t: 'clear', level: sim.level });
      return;
    }

    // Hayaletler.
    for (const g of sim.ghosts) {
      if (g.state === 'home') {
        g.wait -= 1;
        if (g.wait <= 0) {
          g.state = 'active';
          g.scared = false;
        }
        continue;
      }
      advance(g, g.scared ? SCARED_SPEED : sim.spec.ghostSpeed, () => ghostChoose(g));
    }

    // Çarpışma.
    const pp = moverPos(pl);
    for (const g of sim.ghosts) {
      if (g.state !== 'active') continue;
      const gp = moverPos(g);
      if (Math.abs(gp.x - pp.x) + Math.abs(gp.y - pp.y) >= HIT_DIST) continue;
      if (g.scared) {
        sim.ghostsEaten += 1;
        sim.eatChain += 1;
        if (sim.eatChain > sim.bestChain) sim.bestChain = sim.eatChain;
        emit({ t: 'eat', x: gp.x / CELL_U, y: gp.y / CELL_U, chain: sim.eatChain });
        const h = sim.maze.home;
        g.cx = h.x;
        g.cy = h.y;
        g.p = 0;
        g.dir = 0;
        g.state = 'home';
        g.wait = GHOST_HOME_TICKS;
        g.scared = false;
        continue;
      }
      sim.lives -= 1;
      sim.livesLost += 1;
      sim.phase = 'caught';
      sim.phaseTicks = CAUGHT_TICKS;
      emit({ t: 'caught', x: pp.x / CELL_U, y: pp.y / CELL_U, lives: sim.lives });
      return;
    }
  }

  // Seviye 1 kurulumu.
  sim.starsTaken = sim.maze.stars.map(() => false);
  sim.pelletsTaken = sim.maze.pellets.map(() => false);
  resetActors();
  return sim;
}

/** Sonuç kupası (1–3): eşik · 15 yıldız · tüm seviyeler. 0 = eşik altı. */
export function trophiesFor(score: number, won: boolean, threshold: number): 0 | 1 | 2 | 3 {
  if (won && score >= MAX_SCORE) return 3;
  if (score >= Math.max(threshold, 15)) return 2;
  if (score >= threshold) return 1;
  return 0;
}

export interface ReplayResult {
  score: number;
  illegal?: boolean;
  won?: boolean;
  level?: number;
  detail?: string;
}

/**
 * Sunucu replay'i: tohum + girdi kaydı → skor. Kayıt `[adım, kod]`; adım = girdinin uygulandığı
 * andaki `sim.tick`. Kural dışı/bilinmeyen girdi, bozuk sıra, oyun bittikten sonraki girdi ya da
 * beyan edilen adımda bitmemiş oyun → `illegal`.
 */
export function replayStarHunt(seed: string, log: readonly (readonly (number | undefined)[])[], steps: number): ReplayResult {
  if (!Number.isInteger(steps) || steps < 1 || steps > MAX_SIM_TICKS) {
    return { score: 0, illegal: true, detail: 'adım sayısı geçersiz' };
  }
  const sim = createStarHuntSim(seed);
  let i = 0;
  while (sim.tick < steps) {
    while (i < log.length && (log[i][0] ?? -1) === sim.tick) {
      const code = log[i][1] ?? -1;
      if (code < SH_CODE.UP || code > SH_CODE.RIGHT) return { score: 0, illegal: true, detail: `bilinmeyen girdi ${code}` };
      if (!sim.input(code)) return { score: 0, illegal: true, detail: `kural dışı girdi @${sim.tick}` };
      i += 1;
    }
    if (i < log.length && (log[i][0] ?? -1) < sim.tick) return { score: 0, illegal: true, detail: 'kayıt sırası bozuk' };
    sim.step();
    if (sim.over) break;
  }
  if (i < log.length) return { score: 0, illegal: true, detail: 'kayıt oyun sonundan sonra' };
  if (!sim.over || sim.tick !== steps) return { score: 0, illegal: true, detail: 'oyun beyan edilen adımda bitmedi' };
  return { score: sim.score, won: sim.won, level: sim.level };
}

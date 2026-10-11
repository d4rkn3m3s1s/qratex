/**
 * Spam Kırıcı — SAF simülasyon (React'sız, tohumlu, TAMSAYI fizik). İstemci oynatır, sunucu aynı
 * tohum + girdi kaydıyla yeniden oynatır (`lib/games/validators/spam-breaker.ts`).
 *
 * Neden tamsayı: tarayıcı (JSC/SpiderMonkey) ile sunucu (V8) arasında `Math.sin/cos` son basamakta
 * farklılaşabilir → replay sapar. Konumlar 1/256 px (FP) biriminde, açılar sabit tamsayı tablosundan.
 * Sabit adım (60 Hz) + adım başına 4 alt-adım: hız ekranın tazeleme hızından BAĞIMSIZDIR (eski
 * sürümde 120/144 Hz ekranda oyun 2–2,4× hızlıydı). Skoru etkileyen her rastgelelik tohumdan.
 *
 * Kurallar:
 *  - 5 seviye; her seviye bir tuğla deseni (tohumla iki varyanttan biri) + seviyeyle artan top hızı.
 *  - Skor = isabet (her tuğla vuruşu 1). Spam tuğlası 1, bot tuğlası 2 isabet ister.
 *  - Bazı tuğlalar (tohumla seçilir) kırılınca kapsül düşürür: GENİŞ kalkan (10 sn) ya da +1 CAN.
 *  - 3 can; top alttan kaçarsa can gider, top kalkana döner. Ödül kararı sunucuda (skor ≥ eşik) —
 *    topu kaçırmak eşiği geçmiş skoru silmez.
 *  - Servis: top kalkanda bekler, oyuncu fırlatır; 3 sn içinde fırlatmazsa kendiliğinden fırlar.
 *  - Toplam süre tavanı 7 dk (sonsuz döngü / kayıt taşması yok).
 *
 * Girdi kodları (kayıt `[adım, kod, a?]`):
 *  - 5 (primary): fırlat — yalnız servis evresinde geçerli.
 *  - 16 HEDEF, a = 0..W tamsayı: kalkan bu x'e doğru (en çok PTR_SPEED px/adım) gider.
 *  - 17 YÖN, a ∈ {-1, 0, 1}: klavye/sanal düğme basılı yönü (hedefi iptal eder).
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';
import type { InputLog } from '@/lib/games/engine/record';

export const HZ = 60;
export const SB_W = 360;
export const SB_H = 480;
export const FP = 256;
export const SUBSTEPS = 4;
export const COLS = 8;
export const BRICK_GAP = 3;
export const BRICK_LEFT = 8;
export const BRICK_W = (SB_W - BRICK_LEFT * 2 - BRICK_GAP * (COLS - 1)) / COLS; // 40.375 → çizimde
export const BRICK_H = 16;
export const BRICK_TOP = 72;
export const PADDLE_Y = SB_H - 44; // kalkanın üst kenarı
export const PADDLE_H = 12;
export const PADDLE_W = 72;
export const PADDLE_W_WIDE = 108;
export const BALL_R = 6;
export const KEY_SPEED = 6; // px/adım (klavye/sanal düğme)
export const PTR_SPEED = 12; // px/adım (işaretçi hedefi takibi)
export const CAPSULE_SPEED = 2; // px/adım
export const CAPSULE_W = 26;
export const CAPSULE_H = 12;
export const WIDE_TICKS = 10 * HZ;
export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const SERVE_AUTO_TICKS = 3 * HZ;
export const LEVELUP_TICKS = Math.round(1.5 * HZ);
export const LOSE_TICKS = Math.round(0.8 * HZ);
export const MAX_TICKS = 7 * 60 * HZ;
export const LEVELS = 5;

export const CODE_LAUNCH = 5;
export const CODE_TARGET = 16;
export const CODE_HOLD = 17;

/** Dikeyden sapma tablosu (12°, 24°, 36°, 48°, 60°) — sin/cos × 1000, tamsayı. */
const DIRS: readonly (readonly [number, number])[] = [
  [208, 978],
  [407, 914],
  [588, 809],
  [743, 669],
  [866, 500],
];

/** Seviye başına alt-adım hızı (FP / alt-adım). 4 alt-adım × 60 Hz. */
const LEVEL_SPEED_PX = [5.5, 6.0, 6.5, 7.0, 7.5];
const speedFp = (level: number) => Math.round(((LEVEL_SPEED_PX[level - 1] ?? 7.5) * FP) / SUBSTEPS);

/**
 * Desenler: '.' boş, '1' spam (1 isabet), '2' bot tuğlası (2 isabet). Her seviyede iki varyant;
 * tohum hangisinin oynanacağını seçer. Satır uzunluğu = COLS.
 */
export const LEVEL_PATTERNS: readonly (readonly (readonly string[])[])[] = [
  [
    ['11111111', '11111111', '11111111', '11111111'],
    ['.111111.', '11111111', '11111111', '.111111.', '..1111..'],
  ],
  [
    ['22222222', '11111111', '11111111', '11111111'],
    ['2.2.2.2.', '.2.2.2.2', '11111111', '11111111', '11111111'],
  ],
  [
    ['22.22.22', '22.22.22', '11111111', '11111111', '1.1111.1'],
    ['12222221', '11111111', '1.1..1.1', '11111111', '11111111'],
  ],
  [
    ['22222222', '21111112', '21.11.12', '21111112', '22222222'],
    ['.222222.', '22111122', '21111112', '22111122', '.222222.'],
  ],
  [
    ['22222222', '22222222', '11111111', '22.22.22', '11111111', '11111111'],
    ['2.2.2.2.', '22222222', '12121212', '22222222', '11111111', '1.1..1.1'],
  ],
];

/** Desenin isabet toplamı. */
export function patternHits(rows: readonly string[]): number {
  let n = 0;
  for (const r of rows) for (const ch of r) n += ch === '2' ? 2 : ch === '1' ? 1 : 0;
  return n;
}

/** Tohumdan bağımsız EN YÜKSEK toplam (sunucu `maxScore` için): her seviyede büyük varyant. */
export const MAX_TOTAL_HITS = LEVEL_PATTERNS.reduce(
  (sum, variants) => sum + Math.max(...variants.map((v) => patternHits(v))),
  0
);

export type BrickKind = 1 | 2;
export type CapsuleKind = 'wide' | 'life';

export interface Brick {
  id: number;
  col: number;
  row: number;
  /** Mantıksal piksel (çizim + çarpışma). */
  x: number;
  y: number;
  w: number;
  h: number;
  kind: BrickKind;
  hp: number;
  capsule: CapsuleKind | null;
}

export interface Capsule {
  id: number;
  kind: CapsuleKind;
  x: number; // merkez px
  y: number; // üst px
}

export type Phase = 'serve' | 'play' | 'lost' | 'levelup' | 'over';
export type EndCause = 'clear' | 'lives' | 'time';

export type SimEvent =
  | { t: 'launch' }
  | { t: 'hit'; x: number; y: number; kind: BrickKind; destroyed: boolean; score: number }
  | { t: 'paddle'; x: number }
  | { t: 'wall' }
  | { t: 'capsule'; kind: CapsuleKind; x: number; y: number }
  | { t: 'catch'; kind: CapsuleKind }
  | { t: 'lose'; lives: number }
  | { t: 'threshold' }
  | { t: 'level'; level: number }
  | { t: 'over'; cause: EndCause };

export interface BreakerSim {
  readonly tick: number;
  readonly phase: Phase;
  readonly phaseTicks: number;
  readonly over: boolean;
  readonly won: boolean;
  readonly cause: EndCause | null;
  readonly score: number;
  readonly level: number;
  readonly lives: number;
  readonly bricks: readonly Brick[];
  readonly bricksLeft: number;
  readonly levelHits: number;
  readonly capsules: readonly Capsule[];
  /** Kalkan merkezi (px). */
  readonly paddleX: number;
  readonly paddleW: number;
  readonly wideTicks: number;
  /** Top merkezi (px, kesirli — çizim). */
  readonly ballX: number;
  readonly ballY: number;
  readonly prevBallX: number;
  readonly prevBallY: number;
  /** Seviye içi kesintisiz isabet serisi (kalkana dönünce sıfırlanır). */
  readonly streak: number;
  input(code: number, a?: number): boolean;
  step(): void;
  drainEvents(): SimEvent[];
}

export interface BreakerSimOptions {
  events?: boolean;
  /** Eşik olayı için (yalnız kozmetik). */
  threshold?: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function buildLevel(level: number, rng: Rng, nextId: () => number): Brick[] {
  const variants = LEVEL_PATTERNS[level - 1];
  const rows = variants[rng.int(0, variants.length - 1)];
  const out: Brick[] = [];
  rows.forEach((line, row) => {
    for (let col = 0; col < COLS; col++) {
      const ch = line[col];
      if (ch !== '1' && ch !== '2') continue;
      const kind: BrickKind = ch === '2' ? 2 : 1;
      out.push({
        id: nextId(),
        col,
        row,
        x: BRICK_LEFT + col * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + row * (BRICK_H + BRICK_GAP),
        w: BRICK_W,
        h: BRICK_H,
        kind,
        hp: kind,
        capsule: null,
      });
    }
  });
  // Kapsül taşıyıcıları: seviye başına 2 (biri geniş kalkan, seviye ≥ 2'de biri can).
  const pool = out.map((_, i) => i);
  const picks: number[] = [];
  for (let k = 0; k < 2 && pool.length; k++) {
    const j = rng.int(0, pool.length - 1);
    picks.push(pool[j]);
    pool.splice(j, 1);
  }
  if (picks[0] !== undefined) out[picks[0]].capsule = 'wide';
  if (picks[1] !== undefined) out[picks[1]].capsule = level >= 2 ? 'life' : 'wide';
  return out;
}

export function createBreakerSim(seed: string, opts: BreakerSimOptions = {}): BreakerSim {
  const root = createRng(`spam-breaker:${seed}`);
  const layoutRng = root.fork('layout');
  const serveRng = root.fork('serve');
  const withEvents = opts.events === true;
  const threshold = opts.threshold ?? Infinity;
  const events: SimEvent[] = [];
  const emit = (e: SimEvent) => {
    if (withEvents) events.push(e);
  };
  let idSeq = 0;
  const nextId = () => ++idSeq;

  let tick = 0;
  let phase: Phase = 'serve';
  let phaseTicks = SERVE_AUTO_TICKS;
  let over = false;
  let won = false;
  let cause: EndCause | null = null;
  let score = 0;
  let level = 1;
  let lives = START_LIVES;
  let bricks = buildLevel(1, layoutRng, nextId);
  let levelHits = 0;
  let capsules: Capsule[] = [];
  let paddleX = SB_W / 2;
  let wideTicks = 0;
  let target: number | null = null;
  let hold = 0;
  let streak = 0;
  /** Tuğlaya değmeden art arda kalkan vuruşu — döngü kırıcı (son tuğlada sonsuz salınım olmasın). */
  let dryBounces = 0;
  let thresholdHit = false;
  // Top (FP)
  let bx = paddleX * FP;
  let by = (PADDLE_Y - BALL_R - 1) * FP;
  let vx = 0;
  let vy = 0;
  let pbx = bx;
  let pby = by;

  const paddleW = () => (wideTicks > 0 ? PADDLE_W_WIDE : PADDLE_W);
  const restBall = () => {
    bx = paddleX * FP;
    by = (PADDLE_Y - BALL_R - 1) * FP;
    vx = 0;
    vy = 0;
    pbx = bx;
    pby = by;
  };

  const setDir = (idx: number, sx: number, sy: number) => {
    const sp = speedFp(level);
    const [ux, uy] = DIRS[clamp(idx, 0, DIRS.length - 1)];
    vx = sx * Math.trunc((ux * sp) / 1000);
    vy = sy * Math.trunc((uy * sp) / 1000);
    if (vy === 0) vy = sy; // asla tam yatay değil
  };

  /** Kalan tuğlalardan (en alttakiler önce) duvara çarpmadan doğrudan ulaşılabilen ilkine açı. */
  const aimAtBrick = (x: number, y: number): [number, 1 | -1] | null => {
    let best: [number, 1 | -1] | null = null;
    let bestScore = Infinity;
    const r = BALL_R * FP;
    for (const b of bricks) {
      const ty = (b.y + b.h) * FP + r;
      const dy = y - ty;
      if (dy <= 0) continue;
      const cx = Math.round((b.x + b.w / 2) * FP);
      for (let i = 0; i < DIRS.length; i++) {
        const [ux, uy] = DIRS[i];
        for (const sgn of [-1, 1] as const) {
          const hx = x + sgn * Math.trunc((ux * dy) / uy);
          if (hx < r || hx > SB_W * FP - r) continue;
          const miss = Math.abs(hx - cx);
          if (miss > Math.round((b.w / 2) * FP)) continue;
          // Önce en alttaki (en yakın) tuğla, sonra en isabetli açı.
          const sc = dy * 4 + miss;
          if (sc < bestScore) {
            bestScore = sc;
            best = [i, sgn];
          }
        }
      }
    }
    return best;
  };

  const launch = () => {
    // Tohumlu servis açısı: 12° ya da 24°, sağ/sol.
    const idx = serveRng.int(0, 1);
    const sx = serveRng.int(0, 1) === 0 ? -1 : 1;
    setDir(idx, sx, -1);
    phase = 'play';
    phaseTicks = 0;
    streak = 0;
    dryBounces = 0;
    emit({ t: 'launch' });
  };

  const end = (c: EndCause) => {
    over = true;
    phase = 'over';
    cause = c;
    won = c === 'clear';
    emit({ t: 'over', cause: c });
  };

  const addScore = () => {
    score++;
    levelHits++;
    if (!thresholdHit && score >= threshold) {
      thresholdHit = true;
      emit({ t: 'threshold' });
    }
  };

  const movePaddle = () => {
    const half = paddleW() / 2;
    if (hold !== 0) paddleX += hold * KEY_SPEED;
    else if (target !== null) {
      const d = target - paddleX;
      paddleX += d > PTR_SPEED ? PTR_SPEED : d < -PTR_SPEED ? -PTR_SPEED : d;
    }
    paddleX = clamp(paddleX, half, SB_W - half);
  };

  const ballSub = () => {
    pbx = bx;
    pby = by;
    bx += vx;
    by += vy;
    const r = BALL_R * FP;
    // Duvarlar
    if (bx - r < 0) {
      bx = r;
      vx = Math.abs(vx);
      emit({ t: 'wall' });
    } else if (bx + r > SB_W * FP) {
      bx = SB_W * FP - r;
      vx = -Math.abs(vx);
      emit({ t: 'wall' });
    }
    if (by - r < 0) {
      by = r;
      vy = Math.abs(vy);
      emit({ t: 'wall' });
    }
    // Tuğlalar (alt-adım başına en çok bir)
    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      const x0 = Math.round(b.x * FP) - r;
      const x1 = Math.round((b.x + b.w) * FP) + r;
      const y0 = b.y * FP - r;
      const y1 = (b.y + b.h) * FP + r;
      if (bx <= x0 || bx >= x1 || by <= y0 || by >= y1) continue;
      const wasInX = pbx > x0 && pbx < x1;
      const wasInY = pby > y0 && pby < y1;
      if (wasInX && !wasInY) vy = -vy;
      else if (wasInY && !wasInX) vx = -vx;
      else {
        vx = -vx;
        vy = -vy;
      }
      bx = pbx;
      by = pby;
      b.hp--;
      streak++;
      dryBounces = 0;
      addScore();
      const destroyed = b.hp <= 0;
      emit({ t: 'hit', x: b.x + b.w / 2, y: b.y + b.h / 2, kind: b.kind, destroyed, score });
      if (destroyed) {
        bricks.splice(i, 1);
        if (b.capsule) {
          capsules.push({ id: nextId(), kind: b.capsule, x: b.x + b.w / 2, y: b.y });
          emit({ t: 'capsule', kind: b.capsule, x: b.x + b.w / 2, y: b.y });
        }
      }
      break;
    }
    // Kalkan
    if (vy > 0) {
      const half = paddleW() / 2;
      const top = PADDLE_Y * FP;
      if (by + r >= top && pby + r <= top + PADDLE_H * FP / 2) {
        const off = bx - paddleX * FP;
        const reach = (half + BALL_R) * FP;
        if (off > -reach && off < reach) {
          by = top - r;
          // Vuruş noktasına göre açı: merkez dik(e yakın), kenar yatık.
          let idx = Math.min(DIRS.length - 1, Math.floor((Math.abs(off) * DIRS.length) / reach));
          let sx = off > 0 ? 1 : off < 0 ? -1 : vx >= 0 ? 1 : -1;
          dryBounces++;
          if (dryBounces >= 2) {
            // Yardımlı sekme: art arda boşa giden vuruşta top kalan bir tuğlaya yönelir (uzun kuyruk yok).
            const aim = aimAtBrick(bx, by);
            if (aim) {
              idx = aim[0];
              sx = aim[1];
            } else {
              // Doğrudan yol yok: açıyı ve yönü döndür (salınım kırılır, duvardan sekerek ulaşır).
              idx = dryBounces % DIRS.length;
              sx = dryBounces % 2 === 0 ? 1 : -1;
            }
          }
          setDir(idx, sx, -1);
          streak = 0;
          emit({ t: 'paddle', x: bx / FP });
        }
      }
    }
  };

  const stepPlay = () => {
    for (let s = 0; s < SUBSTEPS && phase === 'play'; s++) {
      ballSub();
      if (bricks.length === 0) {
        if (level >= LEVELS) {
          end('clear');
          return;
        }
        phase = 'levelup';
        phaseTicks = LEVELUP_TICKS;
        capsules = [];
        emit({ t: 'level', level: level + 1 });
        return;
      }
      if (by - BALL_R * FP > SB_H * FP) {
        lives--;
        streak = 0;
        emit({ t: 'lose', lives });
        if (lives <= 0) {
          end('lives');
          return;
        }
        phase = 'lost';
        phaseTicks = LOSE_TICKS;
        return;
      }
    }
  };

  const stepCapsules = () => {
    if (!capsules.length) return;
    const half = paddleW() / 2;
    const next: Capsule[] = [];
    for (const c of capsules) {
      c.y += CAPSULE_SPEED;
      const caught =
        c.y + CAPSULE_H >= PADDLE_Y &&
        c.y <= PADDLE_Y + PADDLE_H &&
        c.x + CAPSULE_W / 2 > paddleX - half &&
        c.x - CAPSULE_W / 2 < paddleX + half;
      if (caught) {
        if (c.kind === 'wide') wideTicks = WIDE_TICKS;
        else lives = Math.min(MAX_LIVES, lives + 1);
        emit({ t: 'catch', kind: c.kind });
        continue;
      }
      if (c.y < SB_H) next.push(c);
    }
    capsules = next;
  };

  const sim: BreakerSim = {
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
      return over;
    },
    get won() {
      return won;
    },
    get cause() {
      return cause;
    },
    get score() {
      return score;
    },
    get level() {
      return level;
    },
    get lives() {
      return lives;
    },
    get bricks() {
      return bricks;
    },
    get bricksLeft() {
      return bricks.length;
    },
    get levelHits() {
      return levelHits;
    },
    get capsules() {
      return capsules;
    },
    get paddleX() {
      return paddleX;
    },
    get paddleW() {
      return paddleW();
    },
    get wideTicks() {
      return wideTicks;
    },
    get ballX() {
      return bx / FP;
    },
    get ballY() {
      return by / FP;
    },
    get prevBallX() {
      return pbx / FP;
    },
    get prevBallY() {
      return pby / FP;
    },
    get streak() {
      return streak;
    },
    input(code, a) {
      if (over) return false;
      if (code === CODE_LAUNCH) {
        if (phase !== 'serve') return false;
        launch();
        return true;
      }
      if (code === CODE_TARGET) {
        if (a === undefined || !Number.isInteger(a) || a < 0 || a > SB_W) return false;
        target = a;
        hold = 0;
        return true;
      }
      if (code === CODE_HOLD) {
        if (a !== -1 && a !== 0 && a !== 1) return false;
        hold = a;
        if (a !== 0) target = null;
        return true;
      }
      return false;
    },
    step() {
      if (over) return;
      tick++;
      if (tick >= MAX_TICKS) {
        end('time');
        return;
      }
      if (wideTicks > 0) wideTicks--;
      if (phase === 'levelup') {
        if (--phaseTicks <= 0) {
          level++;
          levelHits = 0;
          bricks = buildLevel(level, layoutRng, nextId);
          wideTicks = 0;
          phase = 'serve';
          phaseTicks = SERVE_AUTO_TICKS;
          restBall();
        }
        movePaddle();
        if (phase === 'serve') restBall();
        return;
      }
      if (phase === 'lost') {
        movePaddle();
        stepCapsules();
        if (--phaseTicks <= 0) {
          phase = 'serve';
          phaseTicks = SERVE_AUTO_TICKS;
          restBall();
        }
        return;
      }
      movePaddle();
      stepCapsules();
      if (phase === 'serve') {
        restBall();
        if (--phaseTicks <= 0) launch();
        return;
      }
      stepPlay();
    },
    drainEvents() {
      if (!events.length) return [];
      return events.splice(0, events.length);
    },
  };
  return sim;
}

export interface ReplayResult {
  score: number;
  won: boolean;
  level: number;
  cause: EndCause | null;
  illegal: boolean;
  detail?: string;
}

/** Sunucu replay'i: kayıt sırası/kural/adım sayısı birebir tutmalı. */
export function replaySpamBreaker(seed: string, log: InputLog, steps: number): ReplayResult {
  const sim = createBreakerSim(seed);
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
      const [at, code, a] = log[i];
      if (at < sim.tick) return fail('kayıt sırası bozuk');
      if (!sim.input(code, a)) return fail(`kural dışı girdi (adım ${at}, kod ${code})`);
      i++;
    }
    sim.step();
  }
  if (i < log.length) return fail('oyun bittikten sonra girdi');
  if (!sim.over) return fail('beyan edilen adımda oyun bitmemiş');
  if (sim.tick !== steps) return fail('adım sayısı tutmuyor');
  return { score: sim.score, won: sim.won, level: sim.level, cause: sim.cause, illegal: false };
}

/** 0–3 yıldız: eşik = 1, eşik ile tavan arası yarı = 2, tüm seviyeler temiz = 3. */
export function starsFor(score: number, threshold: number, cleared: boolean, total = MAX_TOTAL_HITS): 0 | 1 | 2 | 3 {
  if (cleared) return 3;
  if (score >= Math.ceil((threshold + total) / 2)) return 2;
  if (score >= threshold) return 1;
  return 0;
}

export const END_TEXT: Record<EndCause, string> = {
  clear: 'Tüm seviyeler temizlendi',
  lives: 'Canların bitti',
  time: 'Süre doldu',
};

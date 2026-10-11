/**
 * Kar Tanesi Yakala — SAF simülasyon (React'sız). İstemci oynanışı ve sunucu doğrulayıcısı
 * (`lib/games/validators/frost-catcher.ts`) BİREBİR aynı kodu çalıştırır: skoru etkileyen her
 * rastgelelik `createRng(seed)`'den, zaman birimi 60 Hz mantık adımıdır (duvar saati yok).
 *
 * Kurallar (Güven Muhafızı'nın iyi/kötü ayrımı modifikatör olarak birleşti, §7.3 #8–#9):
 *  - 45 sn (2700 adım), 3 seviye (her 15 sn): doğuş sıklaşır, düşüş hızlanır, kara buz oranı artar.
 *  - Kar tanesi yakala → +1 (10+ komboda +1, 20+ komboda +2 bonus). Kaçarsa kombo sıfırlanır.
 *  - Altın kristal (nadir, hızlı) → +3 (+ kombo bonusu).
 *  - Kara buz (bozuk yorum) yakalanırsa → −1 can, kombo sıfır. Kalkan açıksa kalkan kırılır, can gitmez.
 *  - Kalkan (Güven Kalkanı) yakala → bir sonraki kara buzu emer (en fazla 1 yük).
 *  - Çarpışma HER mantık adımında hesaplanır (eski Güven Muhafızı'nda yalnız işaretçi olayında
 *    hesaplanıyordu; sabit duran kalkan hiçbir şeyi engellemiyordu).
 *  - Eldiven hızı sınırlı (`GLOVE_SPEED`): ışınlanma yok, replay'de de aynı sınır.
 *  - Bitiş: süre, can 0 ya da `maxScore` (etkin yapılandırmadan; admin override'ı dahil).
 *
 * Girdi kaydı: `[adım, TARGET_CODE, x]` (işaretçi hedefi, tamsayı 0..ARENA_W) ya da
 * `[adım, DIR_CODE, -1|0|1]` (klavye yönü). Kayıt `adım` değerinde, o adımın `tick()`'inden ÖNCE
 * uygulanır (istemcide girdi iki mantık adımı arasında gelir; kayıt adımı = `sim.ticks`).
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';
import { CUSTOM_CODE_BASE, type InputLog } from '@/lib/games/engine/record';

export const HZ = 60;
export const ROUND_STEPS = 45 * HZ;
export const PHASE_STEPS = 15 * HZ;
export const MAX_LIVES = 3;
export const TARGET_CODE = CUSTOM_CODE_BASE; // 16
export const DIR_CODE = CUSTOM_CODE_BASE + 1; // 17
/** Bir saniyelik pencerede en fazla girdi olayı (işaretçi hareketi 60 Hz'e kadar örneklenir). */
export const MAX_INPUTS_PER_SEC = 75;

export const ARENA_W = 360;
export const ARENA_H = 480;
export const GLOVE_W = 76;
export const GLOVE_H = 22;
export const GLOVE_Y = ARENA_H - 40;
/** Eldiven hızı (mantıksal px / sn). */
export const GLOVE_SPEED = 560;
export const ITEM_R = 13;

export type ItemKind = 'flake' | 'gold' | 'shard' | 'shield';

export interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  /** Düşüş hızı (px / adım). */
  vy: number;
  /** Yatay salınım genliği (yalnız çizim değil, çarpışma da bunu kullanır). */
  sway: number;
  phaseOff: number;
  bornStep: number;
}

export type SimEvent =
  | { type: 'catch'; item: Item; gain: number; combo: number; milestone: boolean }
  | { type: 'shard'; item: Item; lives: number; blocked: boolean }
  | { type: 'shield'; item: Item }
  | { type: 'miss'; item: Item; comboLost: number }
  | { type: 'phase'; phase: number }
  | { type: 'end'; reason: 'time' | 'lives' | 'max' };

export interface SimOptions {
  maxScore: number;
}

export interface FrostSim {
  readonly ticks: number;
  readonly score: number;
  readonly lives: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly caught: number;
  readonly phase: number;
  readonly shield: boolean;
  readonly over: boolean;
  readonly endReason: 'time' | 'lives' | 'max' | null;
  readonly gloveX: number;
  readonly items: readonly Item[];
  /** İşaretçi hedefi (istemci 0..ARENA_W tamsayı gönderir). */
  setTarget(x: number): { illegal: boolean; reason?: string };
  /** Klavye yönü. */
  setDir(d: number): { illegal: boolean; reason?: string };
  tick(): SimEvent[];
}

interface PhaseParams {
  spawnEvery: number;
  vyMin: number;
  vyMax: number;
  shardP: number;
  goldP: number;
  shieldP: number;
}

export const PHASES: readonly PhaseParams[] = [
  { spawnEvery: 34, vyMin: 2.0, vyMax: 2.8, shardP: 0.16, goldP: 0.06, shieldP: 0.03 },
  { spawnEvery: 26, vyMin: 2.6, vyMax: 3.6, shardP: 0.24, goldP: 0.07, shieldP: 0.04 },
  { spawnEvery: 20, vyMin: 3.2, vyMax: 4.4, shardP: 0.3, goldP: 0.08, shieldP: 0.04 },
];

export function comboBonus(combo: number): number {
  if (combo >= 20) return 2;
  if (combo >= 10) return 1;
  return 0;
}

/** Eşyanın `t` adımındaki yatay konumu (salınım). */
function itemX(it: Item, t: number): number {
  return it.x + Math.sin((t - it.bornStep) / 30 + it.phaseOff) * it.sway;
}
export function itemDrawX(it: Item, t: number): number {
  return itemX(it, t);
}

export function createSim(seed: string, opts: SimOptions): FrostSim {
  const spawnRng: Rng = createRng(seed).fork('spawn');
  const maxScore = Math.max(1, Math.floor(opts.maxScore));
  let ticks = 0;
  let score = 0;
  let lives = MAX_LIVES;
  let combo = 0;
  let bestCombo = 0;
  let caught = 0;
  let phase = 0;
  let shield = false;
  let over = false;
  let endReason: FrostSim['endReason'] = null;
  let gloveX = ARENA_W / 2;
  let target: number | null = null;
  let dir = 0;
  let nextId = 1;
  let nextSpawn = 30;
  const items: Item[] = [];
  const half = GLOVE_W / 2;

  const end = (reason: 'time' | 'lives' | 'max', events: SimEvent[]) => {
    if (over) return;
    over = true;
    endReason = reason;
    events.push({ type: 'end', reason });
  };

  const spawn = () => {
    const p = PHASES[phase];
    const r = spawnRng.next();
    let kind: ItemKind = 'flake';
    if (r < p.shardP) kind = 'shard';
    else if (r < p.shardP + p.goldP) kind = 'gold';
    else if (r < p.shardP + p.goldP + p.shieldP && !shield) kind = 'shield';
    const sway = kind === 'gold' ? spawnRng.range(18, 34) : spawnRng.range(0, 16);
    const margin = ITEM_R + sway + 4;
    const x = spawnRng.range(margin, ARENA_W - margin);
    let vy = spawnRng.range(p.vyMin, p.vyMax);
    if (kind === 'gold') vy *= 1.25;
    items.push({ id: nextId++, kind, x, y: -ITEM_R, vy, sway, phaseOff: spawnRng.range(0, Math.PI * 2), bornStep: ticks });
    const jitter = spawnRng.int(-4, 4);
    nextSpawn = ticks + Math.max(10, p.spawnEvery + jitter);
  };

  const sim: FrostSim = {
    get ticks() { return ticks; },
    get score() { return score; },
    get lives() { return lives; },
    get combo() { return combo; },
    get bestCombo() { return bestCombo; },
    get caught() { return caught; },
    get phase() { return phase; },
    get shield() { return shield; },
    get over() { return over; },
    get endReason() { return endReason; },
    get gloveX() { return gloveX; },
    get items() { return items; },
    setTarget(x) {
      if (over) return { illegal: true, reason: 'oyun sonrası girdi' };
      if (!Number.isInteger(x) || x < 0 || x > ARENA_W) return { illegal: true, reason: 'geçersiz hedef' };
      target = x;
      dir = 0;
      return { illegal: false };
    },
    setDir(d) {
      if (over) return { illegal: true, reason: 'oyun sonrası girdi' };
      if (d !== -1 && d !== 0 && d !== 1) return { illegal: true, reason: 'geçersiz yön' };
      dir = d;
      target = null;
      return { illegal: false };
    },
    tick() {
      const events: SimEvent[] = [];
      if (over) return events;
      ticks += 1;

      const np = Math.min(PHASES.length - 1, Math.floor(ticks / PHASE_STEPS));
      if (np !== phase) {
        phase = np;
        events.push({ type: 'phase', phase });
      }

      // Eldiven hareketi (hız sınırlı).
      const maxMove = GLOVE_SPEED / HZ;
      if (dir !== 0) gloveX += dir * maxMove;
      else if (target !== null) {
        const d = target - gloveX;
        gloveX += Math.abs(d) <= maxMove ? d : Math.sign(d) * maxMove;
      }
      gloveX = Math.min(ARENA_W - half, Math.max(half, gloveX));

      if (ticks >= nextSpawn) spawn();

      // Düşüş + çarpışma (her adım).
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const prevY = it.y;
        it.y += it.vy;
        const x = itemX(it, ticks);
        const top = GLOVE_Y - GLOVE_H / 2;
        // Eldivenin üst kenarını bu adımda geçti mi (tünelleme yok).
        const crossed = prevY + ITEM_R < top + 2 && it.y + ITEM_R >= top;
        const inside = it.y + ITEM_R >= top && it.y - ITEM_R <= GLOVE_Y + GLOVE_H / 2;
        if ((crossed || inside) && Math.abs(x - gloveX) <= half + ITEM_R * 0.6) {
          items.splice(i, 1);
          if (it.kind === 'shard') {
            combo = 0;
            if (shield) {
              shield = false;
              events.push({ type: 'shard', item: it, lives, blocked: true });
            } else {
              lives -= 1;
              events.push({ type: 'shard', item: it, lives, blocked: false });
              if (lives <= 0) {
                end('lives', events);
                return events;
              }
            }
          } else if (it.kind === 'shield') {
            shield = true;
            events.push({ type: 'shield', item: it });
          } else {
            combo += 1;
            caught += 1;
            if (combo > bestCombo) bestCombo = combo;
            const gain = (it.kind === 'gold' ? 3 : 1) + comboBonus(combo);
            score = Math.min(maxScore, score + gain);
            events.push({ type: 'catch', item: it, gain, combo, milestone: combo === 10 || combo === 20 || (combo > 20 && combo % 10 === 0) });
            if (score >= maxScore) {
              end('max', events);
              return events;
            }
          }
          continue;
        }
        if (it.y - ITEM_R > ARENA_H) {
          items.splice(i, 1);
          if (it.kind === 'flake' || it.kind === 'gold') {
            const lost = combo;
            combo = 0;
            events.push({ type: 'miss', item: it, comboLost: lost });
          }
        }
      }

      if (ticks >= ROUND_STEPS) end('time', events);
      return events;
    },
  };
  return sim;
}

export interface ReplayResult {
  score: number;
  illegal?: boolean;
  detail?: string;
}

/** Sunucu replay'i: aynı tohum + kayıt → aynı skor. Kural dışı kayıt → illegal. */
export function replayFrost(seed: string, log: InputLog, steps: number, maxScore: number): ReplayResult {
  if (!Number.isInteger(steps) || steps < 1 || steps > ROUND_STEPS) {
    return { score: 0, illegal: true, detail: 'adım sayısı aralık dışı' };
  }
  const sim = createSim(seed, { maxScore });
  let li = 0;
  // Girdi hızı penceresi (betik/sel koruması).
  const recent: number[] = [];
  for (let s = 0; s <= steps; s++) {
    while (li < log.length && log[li][0] === s) {
      const [, code, a] = log[li];
      li += 1;
      recent.push(s);
      while (recent.length && recent[0] <= s - HZ) recent.shift();
      if (recent.length > MAX_INPUTS_PER_SEC) return { score: 0, illegal: true, detail: 'insanüstü girdi hızı' };
      if (typeof a !== 'number') return { score: 0, illegal: true, detail: 'eksik girdi değeri' };
      let r: { illegal: boolean; reason?: string };
      if (code === TARGET_CODE) r = sim.setTarget(a);
      else if (code === DIR_CODE) r = sim.setDir(a);
      else return { score: 0, illegal: true, detail: 'bilinmeyen girdi' };
      if (r.illegal) return { score: 0, illegal: true, detail: r.reason };
    }
    if (s === steps || sim.over) break;
    sim.tick();
  }
  if (li < log.length) return { score: 0, illegal: true, detail: 'oyun sonrası girdi' };
  if (sim.ticks !== steps) return { score: 0, illegal: true, detail: 'adım sayısı uyuşmuyor' };
  if (!sim.over) return { score: 0, illegal: true, detail: 'oyun bitmeden kanıt' };
  return { score: sim.score };
}

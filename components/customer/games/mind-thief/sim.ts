/**
 * Zihin Hırsızı — SAF simülasyon (React'sız). İstemci oynanışı ve sunucu doğrulayıcısı
 * (`lib/games/registry/mind-thief.server.ts`) BİREBİR aynı kodu çalıştırır: skoru etkileyen her
 * rastgelelik `createRng(seed)`'den, zaman birimi 60 Hz mantık adımıdır (duvar saati yok).
 *
 * Kurallar:
 *  - 45 sn (2700 adım). 3 seviye (her 15 sn): doğuş sıklaşır, yorum ömrü kısalır, bozuk oranı artar.
 *  - Patron her 12 sn'de 4 sn ÖFKE'ye girer: daha hızlı ve daha çok bozuk yorum.
 *  - Bozuk yoruma dokun → +1 (her 5 komboda +1 bonus; Çift Puan'da ×2).
 *  - Gerçek yoruma dokun → −1 can, kombo sıfır. Bozuk yorum süresi dolarsa → −1 can.
 *  - Güç: Dondur (3,5 sn yaşlanma durur, doğuş yavaşlar), Çift Puan (6 sn), Can (+1 can, +1 skor).
 *  - Bitiş: süre, can 0 ya da `maxScore` (etkin yapılandırmadan; admin override'ı dahil).
 *
 * Girdi kaydı: `[adım, HIT_CODE, varlıkId]`. Kayıt `adım` değerinde, o adımın `tick()`'inden ÖNCE
 * uygulanır (istemcide dokunuş iki mantık adımı arasında gelir; `loop.step` = tamamlanan adım).
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';
import { CUSTOM_CODE_BASE, type InputLog } from '@/lib/games/engine/record';

export const HZ = 60;
export const ROUND_STEPS = 45 * HZ;
export const PHASE_STEPS = 15 * HZ;
export const RAGE_EVERY_STEPS = 12 * HZ;
export const RAGE_STEPS = 4 * HZ;
export const MAX_LIVES = 3;
export const MAX_ALIVE = 7;
export const FREEZE_STEPS = Math.round(3.5 * HZ);
export const DOUBLE_STEPS = 6 * HZ;
/** İnsan tepki tabanı: doğuştan bu kadar adım geçmeden dokunuş kabul edilmez (≈ 117 ms). */
export const MIN_REACT_STEPS = 7;
/** 1 sn'lik pencerede en fazla dokunuş (insan sınırı ≈ 12–14/sn). */
export const MAX_HITS_PER_SEC = 14;
export const HIT_CODE = CUSTOM_CODE_BASE; // 16

/** Mantıksal arena (canvas `toLogical` ile aynı). */
export const ARENA_W = 360;
export const ARENA_H = 480;
export const CARD_W = 150;
export const CARD_H = 50;
/** Kartların doğabileceği alan (üstte HUD, altta ipucu payı). */
const SPAWN_TOP = 20;
const SPAWN_BOTTOM = ARENA_H - 20;

export type EntityKind = 'corrupted' | 'genuine' | 'freeze' | 'double' | 'heart';
export const POWER_KINDS: readonly EntityKind[] = ['freeze', 'double', 'heart'];

export const CORRUPTED_TEXT_COUNT = 12;
export const GENUINE_TEXT_COUNT = 12;

export interface Entity {
  id: number;
  kind: EntityKind;
  /** Metin dizini (yalnız bozuk/gerçek; güçte 0). */
  text: number;
  /** Kart merkezi (mantıksal). */
  x: number;
  y: number;
  bornStep: number;
  /** Kalan ömür (adım). Dondurmada azalmaz. */
  ttl: number;
  ttlMax: number;
}

export type SimEvent =
  | { type: 'spawn'; entity: Entity }
  | { type: 'hit'; entity: Entity; gain: number; combo: number; comboBonus: boolean }
  | { type: 'wrong'; entity: Entity; lives: number }
  | { type: 'leak'; entity: Entity; lives: number }
  | { type: 'power'; entity: Entity }
  | { type: 'rage'; on: boolean }
  | { type: 'phase'; phase: number }
  | { type: 'end'; reason: 'time' | 'lives' | 'max' };

export interface SimOptions {
  /** Etkin `maxScore` (sunucuda `rules.maxScore`, istemcide `config.maxScore`). */
  maxScore: number;
}

export interface MindThiefSim {
  readonly ticks: number;
  readonly score: number;
  readonly lives: number;
  readonly combo: number;
  readonly phase: number;
  readonly rage: boolean;
  readonly over: boolean;
  readonly endReason: 'time' | 'lives' | 'max' | null;
  readonly frozenLeft: number;
  readonly doubleLeft: number;
  readonly entities: readonly Entity[];
  /** Bir mantık adımı ilerletir; olayları döndürür. */
  tick(): SimEvent[];
  /**
   * Varlığa dokunuş. Geçersizse (`illegal` true) hiçbir şey değişmez — istemci bu durumda kayıt
   * YAZMAZ; sunucuda kayıtta bulunması kanıtı bozar.
   */
  hit(id: number): { events: SimEvent[]; illegal: boolean; reason?: string };
  /** Mantıksal noktadaki en üstteki (en yeni) varlık. */
  pick(x: number, y: number): Entity | null;
}

function phaseOf(step: number): number {
  return Math.min(2, Math.floor(step / PHASE_STEPS));
}

function rageAt(step: number): boolean {
  if (step < RAGE_EVERY_STEPS) return false;
  return step % RAGE_EVERY_STEPS < RAGE_STEPS;
}

const SPAWN_INTERVAL = [58, 44, 34] as const;
const TTL_BASE = [200, 172, 146] as const;
const CORRUPT_CHANCE = [0.5, 0.56, 0.62] as const;

export function createSim(seed: string, opts: SimOptions): MindThiefSim {
  const maxScore = Math.max(1, Math.floor(opts.maxScore));
  const spawnRng: Rng = createRng(seed).fork('spawn');
  const posRng: Rng = createRng(seed).fork('pos');

  let ticks = 0;
  let score = 0;
  let lives = MAX_LIVES;
  let combo = 0;
  let nextId = 1;
  let nextSpawnAt = 24; // ilk kart ~0,4 sn sonra
  let frozenUntil = 0;
  let doubleUntil = 0;
  let over = false;
  let endReason: MindThiefSim['endReason'] = null;
  let entities: Entity[] = [];
  let lastPhase = 0;
  let lastRage = false;
  const hitSteps: number[] = [];

  const end = (reason: 'time' | 'lives' | 'max', out: SimEvent[]) => {
    if (over) return;
    over = true;
    endReason = reason;
    entities = [];
    out.push({ type: 'end', reason });
  };

  const overlaps = (x: number, y: number) =>
    entities.some((e) => Math.abs(e.x - x) < CARD_W * 0.9 && Math.abs(e.y - y) < CARD_H * 1.1);

  const spawn = (out: SimEvent[]) => {
    const phase = phaseOf(ticks);
    const rage = rageAt(ticks);
    // Sabit sayıda çekiliş → bir dalın fazladan çekilişi diğerlerini kaydırmaz.
    const rKind = spawnRng.next();
    const rPower = spawnRng.next();
    const rCorrupt = spawnRng.next();
    const rText = spawnRng.next();
    let kind: EntityKind;
    if (rKind < 0.065) {
      kind = POWER_KINDS[Math.floor(rPower * POWER_KINDS.length)];
    } else {
      kind = rCorrupt < (rage ? 0.75 : CORRUPT_CHANCE[phase]) ? 'corrupted' : 'genuine';
    }
    const text =
      kind === 'corrupted'
        ? Math.floor(rText * CORRUPTED_TEXT_COUNT)
        : kind === 'genuine'
          ? Math.floor(rText * GENUINE_TEXT_COUNT)
          : 0;
    const halfW = CARD_W / 2 + 6;
    const halfH = CARD_H / 2 + 4;
    let x = 0;
    let y = 0;
    let placed = false;
    for (let i = 0; i < 6; i++) {
      const cx = posRng.range(halfW, ARENA_W - halfW);
      const cy = posRng.range(SPAWN_TOP + halfH, SPAWN_BOTTOM - halfH);
      if (!placed && !overlaps(cx, cy)) {
        x = cx;
        y = cy;
        placed = true;
      }
      if (i === 5 && !placed) {
        x = cx;
        y = cy;
      }
    }
    const ttl = TTL_BASE[phase] - (rage ? 30 : 0) + (kind === 'genuine' ? 20 : 0);
    const entity: Entity = { id: nextId++, kind, text, x, y, bornStep: ticks, ttl, ttlMax: ttl };
    entities.push(entity);
    out.push({ type: 'spawn', entity });
  };

  const sim: MindThiefSim = {
    get ticks() {
      return ticks;
    },
    get score() {
      return score;
    },
    get lives() {
      return lives;
    },
    get combo() {
      return combo;
    },
    get phase() {
      return phaseOf(ticks);
    },
    get rage() {
      return rageAt(ticks);
    },
    get over() {
      return over;
    },
    get endReason() {
      return endReason;
    },
    get frozenLeft() {
      return Math.max(0, frozenUntil - ticks);
    },
    get doubleLeft() {
      return Math.max(0, doubleUntil - ticks);
    },
    get entities() {
      return entities;
    },

    tick() {
      const out: SimEvent[] = [];
      if (over) return out;
      const phase = phaseOf(ticks);
      if (phase !== lastPhase) {
        lastPhase = phase;
        out.push({ type: 'phase', phase });
      }
      const rage = rageAt(ticks);
      if (rage !== lastRage) {
        lastRage = rage;
        out.push({ type: 'rage', on: rage });
      }
      const frozen = ticks < frozenUntil;

      // Yaşlanma + sızıntı.
      if (!frozen) {
        const keep: Entity[] = [];
        for (const e of entities) {
          e.ttl -= 1;
          if (e.ttl > 0) {
            keep.push(e);
            continue;
          }
          if (e.kind === 'corrupted') {
            lives -= 1;
            combo = 0;
            out.push({ type: 'leak', entity: e, lives });
          }
        }
        entities = keep;
        if (lives <= 0) {
          ticks += 1;
          end('lives', out);
          return out;
        }
      }

      // Doğuş.
      if (ticks >= nextSpawnAt) {
        if (entities.length < MAX_ALIVE) spawn(out);
        const base = SPAWN_INTERVAL[phase];
        nextSpawnAt = ticks + (frozen ? 84 : rage ? Math.round(base * 0.6) : base);
      }

      ticks += 1;
      if (ticks >= ROUND_STEPS) end('time', out);
      return out;
    },

    hit(id) {
      const out: SimEvent[] = [];
      if (over) return { events: out, illegal: true, reason: 'oyun bitti' };
      const idx = entities.findIndex((e) => e.id === id);
      if (idx < 0) return { events: out, illegal: true, reason: 'varlık yok' };
      const e = entities[idx];
      if (ticks - e.bornStep < MIN_REACT_STEPS) return { events: out, illegal: true, reason: 'insanüstü tepki' };
      while (hitSteps.length && hitSteps[0] <= ticks - HZ) hitSteps.shift();
      if (hitSteps.length >= MAX_HITS_PER_SEC) return { events: out, illegal: true, reason: 'insanüstü dokunuş hızı' };
      hitSteps.push(ticks);
      entities.splice(idx, 1);

      if (e.kind === 'corrupted') {
        combo += 1;
        const comboBonus = combo % 5 === 0;
        const gain = (1 + (comboBonus ? 1 : 0)) * (ticks < doubleUntil ? 2 : 1);
        score = Math.min(maxScore, score + gain);
        out.push({ type: 'hit', entity: e, gain, combo, comboBonus });
      } else if (e.kind === 'genuine') {
        lives -= 1;
        combo = 0;
        out.push({ type: 'wrong', entity: e, lives });
        if (lives <= 0) end('lives', out);
      } else {
        if (e.kind === 'freeze') frozenUntil = ticks + FREEZE_STEPS;
        else if (e.kind === 'double') doubleUntil = ticks + DOUBLE_STEPS;
        else {
          lives = Math.min(MAX_LIVES, lives + 1);
          score = Math.min(maxScore, score + 1);
        }
        out.push({ type: 'power', entity: e });
      }
      if (!over && score >= maxScore) end('max', out);
      return { events: out, illegal: false };
    },

    pick(x, y) {
      for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        // Dokunma hedefi kartın biraz dışını da kapsar (≥ 44 px mantıksal yükseklik + pay).
        if (Math.abs(x - e.x) <= CARD_W / 2 + 4 && Math.abs(y - e.y) <= CARD_H / 2 + 6) return e;
      }
      return null;
    },
  };
  return sim;
}

export interface ReplayResult {
  score: number;
  illegal?: boolean;
  detail?: string;
}

/** Sunucu replay'i: aynı tohum + kayıt → aynı skor. */
export function replayMindThief(seed: string, log: InputLog, steps: number, maxScore: number): ReplayResult {
  const sim = createSim(seed, { maxScore });
  let li = 0;
  for (let s = 0; s <= steps; s++) {
    while (li < log.length && log[li][0] === s) {
      const [, code, a] = log[li];
      li += 1;
      if (code !== HIT_CODE || typeof a !== 'number' || !Number.isInteger(a)) {
        return { score: 0, illegal: true, detail: 'bilinmeyen girdi' };
      }
      const r = sim.hit(a);
      if (r.illegal) return { score: 0, illegal: true, detail: r.reason };
    }
    if (s === steps || sim.over) break;
    sim.tick();
  }
  if (li < log.length) return { score: 0, illegal: true, detail: 'oyun sonrası girdi' };
  if (sim.ticks !== steps) return { score: 0, illegal: true, detail: 'adım sayısı uyuşmuyor' };
  return { score: sim.score };
}

/**
 * Çekirdek Savunması — SAF simülasyon (React'sız). İstemci oynar, sunucu aynı tohum + girdi
 * kaydıyla yeniden oynatır (`lib/games/registry/core-defense.server.ts`). Skoru etkileyen her
 * rastgelelik `createRng(seed)` alt akışlarından gelir; trigonometri YOK (Math.sin/cos/atan2
 * motorlar arasında son bitte farklı olabilir → replay sapması). Yalnız + − × ÷ ve Math.sqrt
 * (IEEE'de tam yuvarlanır) kullanılır.
 *
 * Zaman: 60 Hz sabit adım (`tick`). Girdi, kaydedildiği tick'te bir sonraki `step()`'ten ÖNCE
 * uygulanır — istemci girdiyi anında uygular ve `sim.tick`'i kaydeder, sunucu aynı sırayla.
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';

export const CD_W = 360;
export const CD_H = 480;
export const CORE_X = 180;
export const CORE_Y = 250;
export const CORE_R = 26;
export const HZ = 60;
export const TOTAL_WAVES = 8;
/** Yükseltme seçimi bu kadar tick sonra ilk seçenekle kendiliğinden yapılır (12 sn). */
export const PICK_TIMEOUT_TICKS = 12 * HZ;
/** Dalga başlığı süresi. */
export const INTRO_TICKS = 90;
/** En uzun oyun (sunucu tavanı): 8 dalga + seçimler için bol pay. */
/** Çekirdeğe hiç değdirmeden temizlenen dalga bonusu. */
export const PERFECT_WAVE_BONUS = 5;
export const MAX_SIM_TICKS = 9 * 60 * HZ;

/** Girdi kodları (`record.ts` CUSTOM_CODE_BASE = 16'dan). */
export const CD_CODE = {
  /** Dokunuş/tıklama: a = x, b = y (mantıksal, tamsayı). */
  TAP: 16,
  /** Klavye: en tehlikeli hedefe ateş. */
  AUTO: 17,
  /** Kalkan darbesi. */
  PULSE: 18,
  /** Yükseltme seçimi: a = 0..2. */
  PICK: 19,
} as const;

export type EnemyKind = 'spam' | 'troll' | 'boss';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  /** Çekirdeğe çarpınca verdiği hasar. */
  dmg: number;
  points: number;
  /** Trol zikzak fazı (üçgen dalga, tick). */
  phase: number;
}

export type UpgradeId = 'damage' | 'rate' | 'repair' | 'charge' | 'radius' | 'chain' | 'slow' | 'armor';

export interface UpgradeDef {
  id: UpgradeId;
  title: string;
  desc: string;
  max: number;
}

export const UPGRADES: Readonly<Record<UpgradeId, UpgradeDef>> = {
  damage: { id: 'damage', title: 'Ağır Mermi', desc: 'Her atış +1 hasar verir.', max: 3 },
  rate: { id: 'rate', title: 'Hızlı Tetik', desc: 'Atışlar arası bekleme kısalır.', max: 3 },
  repair: { id: 'repair', title: 'Onarım', desc: 'Çekirdek 3 can kazanır.', max: 99 },
  charge: { id: 'charge', title: 'Kalkan Bataryası', desc: 'Kalkan darbesi daha hızlı dolar.', max: 2 },
  radius: { id: 'radius', title: 'Geniş Darbe', desc: 'Kalkan darbesinin menzili büyür.', max: 2 },
  chain: { id: 'chain', title: 'Zincir Atış', desc: 'Vuruş yakındaki bir hedefe daha sıçrar.', max: 2 },
  slow: { id: 'slow', title: 'Yavaşlatma Alanı', desc: 'Çekirdeğe yaklaşan düşmanlar yavaşlar.', max: 2 },
  armor: { id: 'armor', title: 'Zırh Katmanı', desc: 'Azami can +3 ve 3 can onarım.', max: 2 },
};

const UPGRADE_ORDER: readonly UpgradeId[] = ['damage', 'rate', 'repair', 'charge', 'radius', 'chain', 'slow', 'armor'];

export type SimPhase = 'intro' | 'wave' | 'pick' | 'over';

/** Juice için olaylar (yalnız istemci tüketir; sunucuda kapalı). */
export type SimEvent =
  | { t: 'shot'; x: number; y: number; tx: number; ty: number }
  | { t: 'hit'; x: number; y: number; kind: EnemyKind }
  | { t: 'kill'; x: number; y: number; kind: EnemyKind; points: number; combo: number }
  | { t: 'chain'; x: number; y: number; tx: number; ty: number }
  | { t: 'miss'; x: number; y: number }
  | { t: 'cooldown' }
  | { t: 'core'; dmg: number }
  | { t: 'pulse'; r: number }
  | { t: 'pulse-empty' }
  | { t: 'wave-start'; wave: number; boss: boolean }
  | { t: 'wave-clear'; wave: number; bonus: number; perfect: boolean }
  | { t: 'upgrade'; id: UpgradeId }
  | { t: 'threshold' }
  | { t: 'over'; won: boolean };

export interface SimOptions {
  /** Olay kuyruğu (istemci juice). Sunucu replay'de kapalı. */
  events?: boolean;
  /** "Ödül kilidi açıldı" olayı için eşik (yalnız kozmetik). */
  threshold?: number;
}

export interface CoreSim {
  readonly tick: number;
  readonly phase: SimPhase;
  readonly wave: number;
  readonly score: number;
  readonly coreHp: number;
  readonly coreMaxHp: number;
  readonly charge: number;
  readonly cooldown: number;
  readonly enemies: readonly Enemy[];
  readonly choices: readonly UpgradeId[];
  readonly levels: Readonly<Record<UpgradeId, number>>;
  readonly phaseTicks: number;
  readonly kills: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly shots: number;
  readonly hits: number;
  readonly won: boolean;
  readonly over: boolean;
  /** Bu tick'te oyun bitti mi (bitiş tick'i). */
  readonly overTick: number | null;
  pulseRadius(): number;
  /** Bir mantık adımı. */
  step(): void;
  /** Girdi uygula; kabul edilmezse false (dürüst istemci yalnız kabul edileni kaydeder). */
  input(code: number, a?: number, b?: number): boolean;
  /** Girdi geçerli mi (yan etkisiz). */
  canInput(code: number, a?: number): boolean;
  drainEvents(): SimEvent[];
}

/** Dalga tanımı (saf; test ve HUD için dışa açık). */
export function waveSpec(wave: number): {
  count: number;
  interval: number;
  trollP: number;
  speedMul: number;
  /** Aynı anda ikinci doğuş olasılığı (geç dalgalar). */
  pairP: number;
  boss: boolean;
} {
  return {
    count: 8 + 4 * wave,
    interval: Math.max(14, 66 - 7 * wave),
    trollP: Math.min(0.55, 0.1 * wave),
    speedMul: 1 + 0.09 * (wave - 1),
    pairP: wave >= 5 ? 0.12 * (wave - 4) : 0,
    boss: wave === 4 || wave === 8,
  };
}

const FIRE_COOLDOWN = [12, 9, 7, 5];
/** İki öldürme arası bu kadar tick'ten kısaysa kombo sürer (1,5 sn). */
export const COMBO_WINDOW = 90;
/** Kombo bonusu: her 5 seride +1, en çok +3. */
export function comboBonus(combo: number): number {
  return Math.min(3, Math.floor(combo / 5));
}
const TOUCH_SLACK = 14;
const CHAIN_RANGE = 90;

export function createCoreSim(seed: string, opts: SimOptions = {}): CoreSim {
  const root = createRng(`core-defense:${seed}`);
  const spawnRng: Rng = root.fork('spawn');
  const upgradeRng: Rng = root.fork('upgrade');
  const wantEvents = opts.events === true;
  const threshold = opts.threshold ?? Infinity;

  let tick = 0;
  let phase: SimPhase = 'intro';
  let phaseTicks = INTRO_TICKS;
  let wave = 1;
  let spawned = 0;
  let spawnTimer = 0;
  let bossSpawned = false;
  let score = 0;
  let thresholdHit = false;
  let coreMaxHp = 10;
  let coreHp = 10;
  let charge = 0.4;
  let cooldown = 0;
  let nextId = 1;
  let enemies: Enemy[] = [];
  let choices: UpgradeId[] = [];
  let kills = 0;
  let combo = 0;
  let bestCombo = 0;
  let lastKillTick = -1000;
  let waveDamaged = false;
  let shots = 0;
  let hits = 0;
  let won = false;
  let overTick: number | null = null;
  const levels: Record<UpgradeId, number> = {
    damage: 0,
    rate: 0,
    repair: 0,
    charge: 0,
    radius: 0,
    chain: 0,
    slow: 0,
    armor: 0,
  };
  let events: SimEvent[] = [];
  const emit = (e: SimEvent) => {
    if (wantEvents) events.push(e);
  };

  const addScore = (n: number) => {
    score += n;
    if (!thresholdHit && score >= threshold) {
      thresholdHit = true;
      emit({ t: 'threshold' });
    }
  };

  const pulseRadius = () => 120 + 35 * levels.radius;

  function spawn(kind: EnemyKind, mul: number) {
    // Kenar seç (0 üst, 1 sağ, 2 alt, 3 sol) ve kenar boyunca konum.
    const edge = spawnRng.int(0, 3);
    const t = spawnRng.next();
    const base =
      kind === 'boss'
        ? { r: 26, hp: 14 + (wave >= 8 ? 8 : 0), speed: 0.3, dmg: 4, points: 12 }
        : kind === 'troll'
          ? { r: 16, hp: 3, speed: 0.45, dmg: 2, points: 3 }
          : { r: 11, hp: 1, speed: 0.78, dmg: 1, points: 1 };
    const m = base.r + 2;
    let x = 0;
    let y = 0;
    if (edge === 0) {
      x = m + t * (CD_W - 2 * m);
      y = -m;
    } else if (edge === 1) {
      x = CD_W + m;
      y = m + t * (CD_H - 2 * m);
    } else if (edge === 2) {
      x = m + t * (CD_W - 2 * m);
      y = CD_H + m;
    } else {
      x = -m;
      y = m + t * (CD_H - 2 * m);
    }
    enemies.push({
      id: nextId++,
      kind,
      x,
      y,
      r: base.r,
      hp: base.hp,
      maxHp: base.hp,
      speed: base.speed * mul,
      dmg: base.dmg,
      points: base.points,
      phase: spawnRng.int(0, 59),
    });
  }

  function kill(e: Enemy) {
    kills += 1;
    combo = tick - lastKillTick <= COMBO_WINDOW ? combo + 1 : 1;
    lastKillTick = tick;
    if (combo > bestCombo) bestCombo = combo;
    const pts = e.points + comboBonus(combo);
    addScore(pts);
    charge = Math.min(1, charge + (e.kind === 'boss' ? 0.5 : 0.07 + 0.035 * levels.charge));
    emit({ t: 'kill', x: e.x, y: e.y, kind: e.kind, points: pts, combo });
  }

  function damage(e: Enemy, dmg: number): boolean {
    e.hp -= dmg;
    if (e.hp <= 0) {
      kill(e);
      return true;
    }
    emit({ t: 'hit', x: e.x, y: e.y, kind: e.kind });
    return false;
  }

  function prune() {
    enemies = enemies.filter((e) => e.hp > 0);
  }

  function distSq(ax: number, ay: number, bx: number, by: number) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function fireAt(target: Enemy) {
    shots += 1;
    hits += 1;
    cooldown = FIRE_COOLDOWN[levels.rate];
    emit({ t: 'shot', x: CORE_X, y: CORE_Y, tx: target.x, ty: target.y });
    const dmg = 1 + levels.damage;
    damage(target, dmg);
    // Zincir: en yakın diğer hedefe (deterministik: mesafe, sonra id).
    let from = target;
    const struck = new Set<number>([target.id]);
    for (let c = 0; c < levels.chain; c++) {
      let best: Enemy | null = null;
      let bestD = CHAIN_RANGE * CHAIN_RANGE;
      for (const e of enemies) {
        if (e.hp <= 0 || struck.has(e.id)) continue;
        const d = distSq(from.x, from.y, e.x, e.y);
        if (d < bestD || (d === bestD && best !== null && e.id < best.id)) {
          best = e;
          bestD = d;
        }
      }
      if (!best) break;
      struck.add(best.id);
      emit({ t: 'chain', x: from.x, y: from.y, tx: best.x, ty: best.y });
      damage(best, Math.max(1, dmg - 1));
      from = best;
    }
    prune();
  }

  /** Dokunuş noktasındaki hedef: isabet yarıçapı içinde kenara en yakın; yoksa null. */
  function targetAt(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of enemies) {
      const d = Math.sqrt(distSq(x, y, e.x, e.y));
      const reach = e.r + TOUCH_SLACK;
      if (d > reach) continue;
      const s = d - e.r;
      if (s < bestScore || (s === bestScore && best !== null && e.id < best.id)) {
        best = e;
        bestScore = s;
      }
    }
    return best;
  }

  /** En tehlikeli hedef: çekirdeğe çarpmaya en az süre kalan (klavye nişanı). */
  function mostThreatening(): Enemy | null {
    let best: Enemy | null = null;
    let bestT = Infinity;
    for (const e of enemies) {
      if (!onScreen(e)) continue;
      const d = Math.sqrt(distSq(e.x, e.y, CORE_X, CORE_Y)) - CORE_R - e.r;
      const t = d / Math.max(0.01, e.speed);
      if (t < bestT || (t === bestT && best !== null && e.id < best.id)) {
        best = e;
        bestT = t;
      }
    }
    return best;
  }

  function onScreen(e: Enemy) {
    return e.x >= -e.r && e.x <= CD_W + e.r && e.y >= -e.r && e.y <= CD_H + e.r;
  }

  function drawChoices() {
    const avail = UPGRADE_ORDER.filter((id) => levels[id] < UPGRADES[id].max);
    const shuffled = upgradeRng.shuffle(avail);
    // Onarım canı tamken anlamsız → sona it.
    shuffled.sort((a, b) => Number(a === 'repair' && coreHp >= coreMaxHp) - Number(b === 'repair' && coreHp >= coreMaxHp));
    choices = shuffled.slice(0, 3);
  }

  function applyUpgrade(id: UpgradeId) {
    levels[id] += 1;
    if (id === 'repair') coreHp = Math.min(coreMaxHp, coreHp + 3);
    if (id === 'armor') {
      coreMaxHp += 3;
      coreHp = Math.min(coreMaxHp, coreHp + 3);
    }
    emit({ t: 'upgrade', id });
  }

  function end(didWin: boolean) {
    phase = 'over';
    won = didWin;
    overTick = tick;
    emit({ t: 'over', won: didWin });
  }

  function startWave() {
    phase = 'wave';
    spawned = 0;
    spawnTimer = 0;
    bossSpawned = false;
    waveDamaged = false;
    emit({ t: 'wave-start', wave, boss: waveSpec(wave).boss });
  }

  const sim: CoreSim = {
    get tick() {
      return tick;
    },
    get phase() {
      return phase;
    },
    get wave() {
      return wave;
    },
    get score() {
      return score;
    },
    get coreHp() {
      return coreHp;
    },
    get coreMaxHp() {
      return coreMaxHp;
    },
    get charge() {
      return charge;
    },
    get cooldown() {
      return cooldown;
    },
    get enemies() {
      return enemies;
    },
    get choices() {
      return choices;
    },
    get levels() {
      return levels;
    },
    get phaseTicks() {
      return phaseTicks;
    },
    get kills() {
      return kills;
    },
    get combo() {
      return combo;
    },
    get bestCombo() {
      return bestCombo;
    },
    get shots() {
      return shots;
    },
    get hits() {
      return hits;
    },
    get won() {
      return won;
    },
    get over() {
      return phase === 'over';
    },
    get overTick() {
      return overTick;
    },
    pulseRadius,

    canInput(code, a) {
      if (phase === 'over') return false;
      if (code === CD_CODE.PICK) {
        return phase === 'pick' && Number.isInteger(a) && (a as number) >= 0 && (a as number) < choices.length;
      }
      if (phase !== 'wave' && phase !== 'intro') return false;
      if (code === CD_CODE.PULSE) return charge >= 1;
      if (code === CD_CODE.TAP || code === CD_CODE.AUTO) return true;
      return false;
    },

    input(code, a, b) {
      if (!sim.canInput(code, a)) {
        if (code === CD_CODE.PULSE && (phase === 'wave' || phase === 'intro')) emit({ t: 'pulse-empty' });
        return false;
      }
      switch (code) {
        case CD_CODE.PICK: {
          applyUpgrade(choices[a as number]);
          choices = [];
          wave += 1;
          phase = 'intro';
          phaseTicks = INTRO_TICKS;
          return true;
        }
        case CD_CODE.PULSE: {
          charge = 0;
          const R = pulseRadius();
          const R2 = (R + 0) * (R + 0);
          emit({ t: 'pulse', r: R });
          for (const e of enemies) {
            const d2 = distSq(e.x, e.y, CORE_X, CORE_Y);
            if (d2 > R2) continue;
            // Tek vuruş (bulgu: kalkan dalgası aynı bota 3-4 kez vuruyordu).
            if (!damage(e, 2)) {
              const d = Math.sqrt(d2) || 1;
              e.x += ((e.x - CORE_X) / d) * 40;
              e.y += ((e.y - CORE_Y) / d) * 40;
            }
          }
          prune();
          return true;
        }
        case CD_CODE.TAP: {
          if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
          if (cooldown > 0) {
            emit({ t: 'cooldown' });
            return true; // kayda girer (aynı sonuç: etkisiz), ritim izi için
          }
          const t = targetAt(a as number, b as number);
          if (!t) {
            shots += 1;
            combo = 0;
            cooldown = Math.ceil(FIRE_COOLDOWN[levels.rate] / 2);
            emit({ t: 'miss', x: a as number, y: b as number });
            return true;
          }
          fireAt(t);
          return true;
        }
        case CD_CODE.AUTO: {
          if (cooldown > 0) {
            emit({ t: 'cooldown' });
            return true;
          }
          const t = mostThreatening();
          if (!t) return true;
          fireAt(t);
          return true;
        }
        default:
          return false;
      }
    },

    step() {
      if (phase === 'over') return;
      tick += 1;
      if (cooldown > 0) cooldown -= 1;

      if (phase === 'intro') {
        phaseTicks -= 1;
        if (phaseTicks <= 0) startWave();
      } else if (phase === 'pick') {
        phaseTicks -= 1;
        if (phaseTicks <= 0 && choices.length > 0) sim.input(CD_CODE.PICK, 0);
        return;
      }

      // Doğuş.
      if (phase === 'wave') {
        const spec = waveSpec(wave);
        if (spawned < spec.count) {
          spawnTimer -= 1;
          if (spawnTimer <= 0) {
            spawn(spawnRng.chance(spec.trollP) ? 'troll' : 'spam', spec.speedMul);
            spawned += 1;
            if (spawned < spec.count && spawnRng.chance(spec.pairP)) {
              spawn('spam', spec.speedMul);
              spawned += 1;
            }
            spawnTimer = spec.interval;
          }
        }
        if (spec.boss && !bossSpawned && spawned >= Math.floor(spec.count / 2)) {
          bossSpawned = true;
          spawn('boss', 1);
        }
      }

      // Hareket.
      const slowR = 110;
      for (const e of enemies) {
        const dx = CORE_X - e.x;
        const dy = CORE_Y - e.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        let sp = e.speed;
        if (levels.slow > 0 && d < slowR + e.r) sp *= 1 - 0.22 * levels.slow;
        const ux = dx / d;
        const uy = dy / d;
        e.x += ux * sp;
        e.y += uy * sp;
        if (e.kind === 'troll') {
          // Zikzak: üçgen dalga (−1..1), dik eksende.
          e.phase = (e.phase + 1) % 60;
          const tri = e.phase < 30 ? e.phase / 15 - 1 : 3 - e.phase / 15;
          e.x += -uy * tri * 0.55;
          e.y += ux * tri * 0.55;
        }
        if (d - e.speed <= CORE_R + e.r) {
          // Çekirdeğe çarptı.
          coreHp = Math.max(0, coreHp - e.dmg);
          e.hp = 0;
          combo = 0;
          waveDamaged = true;
          emit({ t: 'core', dmg: e.dmg });
        }
      }
      prune();

      if (coreHp <= 0) {
        end(false);
        return;
      }

      if (phase === 'wave') {
        const spec = waveSpec(wave);
        if (spawned >= spec.count && (!spec.boss || bossSpawned) && enemies.length === 0) {
          const perfect = !waveDamaged;
          const bonus = 2 * wave + (perfect ? PERFECT_WAVE_BONUS : 0);
          addScore(bonus);
          emit({ t: 'wave-clear', wave, bonus, perfect });
          if (wave >= TOTAL_WAVES) {
            addScore(3 * coreHp);
            end(true);
            return;
          }
          drawChoices();
          phase = 'pick';
          phaseTicks = PICK_TIMEOUT_TICKS;
        }
      }
    },

    drainEvents() {
      const out = events;
      events = [];
      return out;
    },
  };
  return sim;
}

/** Yıldız: 1 = ödül eşiği, 2 = tüm dalgalar, 3 = tüm dalgalar + çekirdek ≥ %50. */
export function starsFor(r: { score: number; won: boolean; coreHp: number; coreMaxHp: number }, threshold: number): 0 | 1 | 2 | 3 {
  if (r.score < threshold && !r.won) return 0;
  if (!r.won) return 1;
  if (r.coreHp * 2 >= r.coreMaxHp) return 3;
  return 2;
}

export interface ReplayResult {
  score: number;
  illegal?: boolean;
  detail?: string;
  won?: boolean;
  wave?: number;
}

/**
 * Sunucu replay'i: kaydı tick sırasıyla uygular, `steps` tick oynatır. Kural dışı girdi
 * (bitmiş oyuna, seçim dışı fazda seçim, dolmamış kalkan) ya da `steps`'te bitmemiş oyun → illegal.
 */
export function replayCoreDefense(
  seed: string,
  log: readonly (readonly (number | undefined)[])[],
  steps: number
): ReplayResult {
  if (!Number.isInteger(steps) || steps < 1 || steps > MAX_SIM_TICKS) {
    return { score: 0, illegal: true, detail: 'adım sayısı geçersiz' };
  }
  const sim = createCoreSim(seed);
  let i = 0;
  while (sim.tick < steps) {
    while (i < log.length && (log[i][0] ?? -1) === sim.tick) {
      const [, rawCode, a, b] = log[i];
      const code = rawCode ?? -1;
      if (code !== CD_CODE.TAP && code !== CD_CODE.AUTO && code !== CD_CODE.PULSE && code !== CD_CODE.PICK) {
        return { score: 0, illegal: true, detail: `bilinmeyen girdi ${code}` };
      }
      if (!sim.input(code, a, b)) return { score: 0, illegal: true, detail: `kural dışı girdi @${sim.tick}` };
      i += 1;
    }
    if (i < log.length && (log[i][0] ?? -1) < sim.tick) return { score: 0, illegal: true, detail: 'kayıt sırası bozuk' };
    sim.step();
    if (sim.over) break;
  }
  // Bitişten sonra kalan girdi ya da beyan edilen adımda bitmemiş oyun.
  if (i < log.length) return { score: 0, illegal: true, detail: 'kayıt oyun sonundan sonra' };
  if (!sim.over || sim.tick !== steps) return { score: 0, illegal: true, detail: 'oyun beyan edilen adımda bitmedi' };
  return { score: sim.score, won: sim.won, wave: sim.wave };
}

/**
 * Güven Birleştir — SAF simülasyon (React'sız, tohumlu). İstemci oynatır, sunucu aynı tohum +
 * girdi kaydıyla yeniden oynatır (`lib/games/validators/trust-merge.ts`). Skoru etkileyen her
 * rastgelelik `createRng(seed).fork('spawn')`'dan; `Math.random` YOK.
 *
 * SKOR NORMALİZASYONU (§7.3 #14): skor artık en yüksek karo DEĞİL, klasik 2048 **birleşim
 * puanı**dır (her birleşmede oluşan karonun değeri eklenir). Böylece:
 *  - liderlik/turnuva 4 kademeye (256/512/1024/2048) çökmez, ince taneli sıralanır;
 *  - başarımlar (`bestScorePct` = skor / tavan) diğer oyunlarla aynı birimde ölçülür; tek bir
 *    64 karosu artık "bedava" rozet açmaz;
 *  - en yüksek karo yalnız anlatı/yıldız/kilometre taşı göstergesidir.
 *
 * Kurallar:
 *  - 4×4 tahta, standart 2048: bir karo tek hamlede bir kez birleşir; hareket etmeyen hamle
 *    yoktur (kayda girmez, replay'de kural dışı).
 *  - Doğuş: rastgele boş hücreye 2 ya da 4. Zorluk eğrisi: en yüksek karo büyüdükçe 4 doğma
 *    olasılığı artar (%10 → %15 → %20).
 *  - Hamleler arasında en az `MIN_MOVE_GAP_TICKS` mantık adımı (60 Hz) — insan üstü hız
 *    replay'de reddedilir. İstemci erken gelen hamleyi tamponlar (yutmaz).
 *  - Oyun, hamle kalmayınca ya da oyuncu "Bitir" deyince (`CODE_BANK`) biter.
 *
 * Girdi kodları: 1..4 (yukarı/aşağı/sol/sağ = ACTION_CODE), 16 = bitir (CUSTOM_CODE_BASE).
 */
import { createRng, type Rng } from '@/lib/games/engine/rng';
import { CUSTOM_CODE_BASE, type InputLog } from '@/lib/games/engine/record';

export const HZ = 60;
export const SIZE = 4;
export const CELLS = SIZE * SIZE;
/** Hamleler arası en kısa aralık (5 adım ≈ 83 ms → saniyede 12 hamle). */
export const MIN_MOVE_GAP_TICKS = 5;
export const CODE_BANK = CUSTOM_CODE_BASE;

export type Dir = 1 | 2 | 3 | 4;
export const DIR = { UP: 1, DOWN: 2, LEFT: 3, RIGHT: 4 } as const;
export const DIR_TEXT: Record<Dir, string> = { 1: 'Yukarı', 2: 'Aşağı', 3: 'Sola', 4: 'Sağa' };

/** Kutlanan karo kilometre taşları. */
export const MILESTONES = [64, 128, 256, 512, 1024, 2048, 4096] as const;

export interface Tile {
  id: number;
  value: number;
}

export interface TileMotion {
  id: number;
  from: number; // hücre indeksi
  to: number;
  /** Bu karo birleşmede yutuldu (hedefe kayıp kaybolur). */
  absorbed?: boolean;
}

export interface MoveResult {
  moved: boolean;
  motions: TileMotion[];
  /** Birleşmeyle oluşan karolar: hedef hücre + yeni değer + yeni karo kimliği. */
  merges: { cell: number; value: number; id: number }[];
  gained: number;
  spawn: { cell: number; value: number; id: number } | null;
  /** Bu hamlede ilk kez ulaşılan kilometre taşı (varsa en büyüğü). */
  milestone: number | null;
}

export type EndReason = 'stuck' | 'bank';

export interface MergeSim {
  readonly board: (Tile | null)[];
  readonly score: number;
  readonly maxTile: number;
  readonly moves: number;
  readonly tick: number;
  readonly lastMoveTick: number;
  readonly over: boolean;
  readonly endReason: EndReason | null;
  /** Bir mantık adımı ilerlet (zaman; hamleler `move` ile). */
  step(): void;
  /** Hamle şu an yapılabilir mi (hız sınırı + oyun sürüyor). */
  ready(): boolean;
  /** Hamleyi uygula. `moved=false` → tahta değişmedi (kayda girmemeli). */
  move(dir: Dir): MoveResult;
  canMove(dir: Dir): boolean;
  anyMove(): boolean;
  bank(): boolean;
  /** Zamanı ileri al (yalnız kayıttan geri yüklemede). */
  setTick(t: number): void;
}

function spawnFourChance(maxTile: number): number {
  if (maxTile >= 512) return 0.2;
  if (maxTile >= 128) return 0.15;
  return 0.1;
}

/** Bir yöndeki satırların hücre indeksleri (hareket yönüne doğru, öndeki hücre ilk). */
function lines(dir: Dir): number[][] {
  const out: number[][] = [];
  for (let k = 0; k < SIZE; k++) {
    const line: number[] = [];
    for (let j = 0; j < SIZE; j++) {
      let r: number;
      let c: number;
      if (dir === 3) {
        r = k;
        c = j;
      } else if (dir === 4) {
        r = k;
        c = SIZE - 1 - j;
      } else if (dir === 1) {
        r = j;
        c = k;
      } else {
        r = SIZE - 1 - j;
        c = k;
      }
      line.push(r * SIZE + c);
    }
    out.push(line);
  }
  return out;
}
const LINES: Record<Dir, number[][]> = { 1: lines(1), 2: lines(2), 3: lines(3), 4: lines(4) };

export function createMergeSim(seed: string): MergeSim {
  const rng: Rng = createRng(seed).fork('spawn');
  const board: (Tile | null)[] = new Array(CELLS).fill(null);
  let nextId = 1;
  let score = 0;
  let maxTile = 0;
  let moves = 0;
  let tick = 0;
  let lastMoveTick = -MIN_MOVE_GAP_TICKS;
  let over = false;
  let endReason: EndReason | null = null;
  let milestoneIdx = 0; // ulaşılan kilometre taşı sayısı

  const spawn = (): MoveResult['spawn'] => {
    const empty: number[] = [];
    for (let i = 0; i < CELLS; i++) if (!board[i]) empty.push(i);
    if (empty.length === 0) return null;
    const cell = empty[rng.int(0, empty.length - 1)];
    const value = rng.chance(spawnFourChance(maxTile)) ? 4 : 2;
    const t = { id: nextId++, value };
    board[cell] = t;
    if (value > maxTile) maxTile = value;
    return { cell, value, id: t.id };
  };

  spawn();
  spawn();

  const canMove = (dir: Dir): boolean => {
    for (const line of LINES[dir]) {
      for (let j = 1; j < SIZE; j++) {
        const cur = board[line[j]];
        if (!cur) continue;
        const prev = board[line[j - 1]];
        if (!prev || prev.value === cur.value) return true;
      }
    }
    return false;
  };
  const anyMove = () => canMove(1) || canMove(2) || canMove(3) || canMove(4);

  const sim: MergeSim = {
    get board() {
      return board;
    },
    get score() {
      return score;
    },
    get maxTile() {
      return maxTile;
    },
    get moves() {
      return moves;
    },
    get tick() {
      return tick;
    },
    get lastMoveTick() {
      return lastMoveTick;
    },
    get over() {
      return over;
    },
    get endReason() {
      return endReason;
    },
    step() {
      if (!over) tick++;
    },
    ready() {
      return !over && tick - lastMoveTick >= MIN_MOVE_GAP_TICKS;
    },
    canMove,
    anyMove,
    move(dir) {
      const res: MoveResult = { moved: false, motions: [], merges: [], gained: 0, spawn: null, milestone: null };
      if (over || !sim.ready()) return res;
      const before = maxTile;
      for (const line of LINES[dir]) {
        const tiles: { t: Tile; from: number }[] = [];
        for (const idx of line) {
          const t = board[idx];
          if (t) tiles.push({ t, from: idx });
        }
        for (const idx of line) board[idx] = null;
        let w = 0;
        for (let i = 0; i < tiles.length; i++) {
          const a = tiles[i];
          const b = tiles[i + 1];
          const to = line[w];
          if (b && b.t.value === a.t.value) {
            const value = a.t.value * 2;
            const merged = { id: nextId++, value };
            board[to] = merged;
            res.motions.push({ id: a.t.id, from: a.from, to, absorbed: true });
            res.motions.push({ id: b.t.id, from: b.from, to, absorbed: true });
            res.merges.push({ cell: to, value, id: merged.id });
            res.gained += value;
            if (value > maxTile) maxTile = value;
            i++;
          } else {
            board[to] = a.t;
            res.motions.push({ id: a.t.id, from: a.from, to });
          }
          w++;
        }
      }
      res.moved = res.motions.some((m) => m.from !== m.to || m.absorbed);
      if (!res.moved) return res;
      score += res.gained;
      moves++;
      lastMoveTick = tick;
      while (milestoneIdx < MILESTONES.length && maxTile >= MILESTONES[milestoneIdx]) {
        if (MILESTONES[milestoneIdx] > before) res.milestone = MILESTONES[milestoneIdx];
        milestoneIdx++;
      }
      res.spawn = spawn();
      if (!anyMove()) {
        over = true;
        endReason = 'stuck';
      }
      return res;
    },
    bank() {
      if (over || moves === 0) return false;
      over = true;
      endReason = 'bank';
      return true;
    },
    setTick(t) {
      if (t > tick) tick = t;
    },
  };
  // Başlangıç kilometre taşları (4 ile başlanırsa bile 64'ün altında; ama tutarlılık için).
  while (milestoneIdx < MILESTONES.length && maxTile >= MILESTONES[milestoneIdx]) milestoneIdx++;
  return sim;
}

export interface ReplayResult {
  score: number;
  maxTile: number;
  moves: number;
  endReason: EndReason | null;
  illegal: boolean;
  detail?: string;
}

/**
 * Sunucu replay'i: kayıttaki her girdi, kaydedildiği mantık adımında uygulanır. Kural dışı:
 * bilinmeyen kod, hız sınırı altı hamle, tahtayı değiştirmeyen hamle, bitmiş oyuna girdi,
 * beyan edilen adımda bitmemiş oyun.
 */
export function replayTrustMerge(seed: string, log: InputLog, steps: number): ReplayResult {
  const sim = createMergeSim(seed);
  const fail = (detail: string): ReplayResult => ({
    score: 0,
    maxTile: sim.maxTile,
    moves: sim.moves,
    endReason: null,
    illegal: true,
    detail,
  });
  let prevAt = -1;
  for (const entry of log) {
    const [at, code] = entry;
    if (at < prevAt) return fail('kayıt sırası bozuk');
    prevAt = at;
    if (at > steps) return fail('kayıt oyun sonundan sonra');
    if (sim.over) return fail('oyun bittikten sonra girdi');
    sim.setTick(at);
    if (code === CODE_BANK) {
      if (!sim.bank()) return fail('geçersiz bitirme');
      continue;
    }
    if (code < 1 || code > 4) return fail(`bilinmeyen kod ${code}`);
    if (!sim.ready()) return fail(`insan üstü hamle hızı (adım ${at})`);
    const r = sim.move(code as Dir);
    if (!r.moved) return fail(`etkisiz hamle (adım ${at}, kod ${code})`);
  }
  if (!sim.over) return fail('beyan edilen adımda oyun bitmemiş');
  return { score: sim.score, maxTile: sim.maxTile, moves: sim.moves, endReason: sim.endReason, illegal: false };
}

/** 0–3 yıldız: eşik = 1, eşiğin 2,5 katı = 2 (~512 karo), 6 katı = 3 (~1024 karo). */
export function starsFor(score: number, threshold: number): 0 | 1 | 2 | 3 {
  if (threshold <= 0) return 0;
  if (score >= threshold * 6) return 3;
  if (score >= Math.ceil(threshold * 2.5)) return 2;
  if (score >= threshold) return 1;
  return 0;
}

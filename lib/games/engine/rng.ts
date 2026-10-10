/**
 * Tohumlu (seed) sözde rastgele sayı üreteci — istemci ve sunucuda BİREBİR aynı dizi.
 *
 * Neden: deterministik oyunlarda sunucu, `start`'ta verdiği tohum + istemcinin girdi
 * kaydıyla oyunu yeniden oynatır (replay) ve skoru kendisi hesaplar. Bunun ön koşulu,
 * oyun mantığının `Math.random` yerine bu üreteci kullanmasıdır. Kozmetik efektler
 * (parçacık saçılımı vb.) `Math.random` kullanabilir; skoru etkileyen HER karar buradan.
 *
 * Algoritma: dize tohum → cyrb53 karması (32 bit) → mulberry32. `Math.imul` ve 32 bit
 * tamsayı aritmetiği her JS motorunda aynı sonucu verir.
 */

/** Dize ya da sayıyı 32 bitlik işaretsiz tohuma çevirir (cyrb53'ün alt yarısı). */
export function hashSeed(input: string | number): number {
  const str = typeof input === 'number' ? `n:${input}` : input;
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export interface Rng {
  /** Üretecin kurulduğu tohum (kayıt/hata ayıklama için). */
  readonly seed: string;
  /** [0, 1) aralığında sayı. */
  next(): number;
  /** [min, max] aralığında tamsayı (iki uç dahil). */
  int(min: number, max: number): number;
  /** [min, max) aralığında ondalık sayı. */
  range(min: number, max: number): number;
  /** `p` olasılıkla true. */
  chance(p: number): boolean;
  /** Diziden bir öğe (boş dizide hata). */
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates ile karıştırılmış YENİ dizi (girdi değişmez). */
  shuffle<T>(items: readonly T[]): T[];
  /** Ağırlıklı seçim: ağırlıklar ≥ 0, toplam > 0. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /**
   * Bağımsız alt akış: aynı tohum + etiket her zaman aynı alt diziyi verir. Ör. içerik
   * seçimi `fork('content')`, düşman doğuşu `fork('spawn')` — bir akışa çağrı eklemek
   * diğerini kaydırmaz (replay kırılganlığını azaltır).
   */
  fork(label: string): Rng;
  /** İç durum (test/serileştirme). */
  state(): number;
}

function mulberry32(seed: number): { next: () => number; state: () => number } {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => s,
  };
}

/** Tohumlu üretici kurar. Aynı tohum → aynı dizi (Node, tarayıcı, test). */
export function createRng(seed: string | number): Rng {
  const seedStr = typeof seed === 'number' ? String(seed) : seed;
  const gen = mulberry32(hashSeed(seed));
  const next = gen.next;

  const rng: Rng = {
    seed: seedStr,
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    range(min, max) {
      return min + next() * (max - min);
    },
    chance(p) {
      return next() < p;
    },
    pick(items) {
      if (items.length === 0) throw new Error('rng.pick: boş dizi');
      return items[Math.floor(next() * items.length)];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    weighted(items, weight) {
      if (items.length === 0) throw new Error('rng.weighted: boş dizi');
      let total = 0;
      for (const it of items) total += Math.max(0, weight(it));
      if (total <= 0) throw new Error('rng.weighted: ağırlık toplamı 0');
      let r = next() * total;
      for (const it of items) {
        r -= Math.max(0, weight(it));
        if (r < 0) return it;
      }
      return items[items.length - 1];
    },
    fork(label) {
      return createRng(`${seedStr}/${label}`);
    },
    state() {
      return gen.state();
    },
  };
  return rng;
}

/** Tarayıcıda/sunucuda kriptografik rastgele 128 bit hex tohum (yalnız PRATİK modu için). */
export function randomSeed(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

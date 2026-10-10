/**
 * İçerik havuzu yardımcıları (sınıflandırma ailesi: Sahte Avcısı, Günün Kelimesi, Bilgi
 * Yarışması). Etiketli içerik dosyaları (`lib/games/content/<oyun>.ts`) YALNIZ sunucu
 * modüllerinden (`lib/games/registry/<oyun>.server.ts`) içe aktarılır; istemci paketine
 * giren bir dosya içerik dosyasını import ETMEZ (registry testi bunu denetler).
 *
 * Havuz ikiye bölünür (öğe kimliğinin karmasına göre, deterministik):
 *   ranked   → sıralı tur; etiketler istemciye hiç gitmez.
 *   practice → pratik tur; etiketli gider (oyuncu anında geri bildirim alır).
 * Böylece sınırsız pratikle sıralı havuzun etiketleri kazınamaz.
 *
 * Tur içindeki öğe kimlikleri OPAKTIR (`q0`, `q1`…): havuz kimliği istemciye sızmaz, aynı
 * metin farklı turlarda farklı kimlikle gelir (kimlik→etiket ezberi işe yaramaz).
 */
import { createRng, hashSeed } from '@/lib/games/engine/rng';
import type { ClassificationRound, PublicContentItem } from '@/lib/games/verify/types';

export interface ContentItem<L extends string = string, P extends Record<string, unknown> = Record<string, unknown>> {
  /** Havuz içinde kalıcı kimlik (istemciye gitmez). */
  id: string;
  /** Doğru etiket (ör. 'real' | 'fake', ya da doğru şık kimliği). */
  label: L;
  /** 1 kolay … 3 zor. */
  difficulty?: 1 | 2 | 3;
  /** İstemcinin göreceği alanlar (metin, şıklar…). Etiket burada OLMAMALI. */
  payload: P;
}

/** Havuzun pratik payı (varsayılan %25). */
export const DEFAULT_PRACTICE_SHARE = 0.25;

export function isPracticeItem(id: string, share = DEFAULT_PRACTICE_SHARE): boolean {
  return hashSeed(`pool:${id}`) % 1000 < Math.round(share * 1000);
}

export function splitPools<T extends ContentItem>(
  bank: readonly T[],
  share = DEFAULT_PRACTICE_SHARE
): { ranked: T[]; practice: T[] } {
  const ranked: T[] = [];
  const practice: T[] = [];
  for (const item of bank) (isPracticeItem(item.id, share) ? practice : ranked).push(item);
  return { ranked, practice };
}

export interface DrawOptions<T extends ContentItem> {
  /** Tur başına öğe sayısı (havuz küçükse havuz kadar). */
  count: number;
  /** Alt akış etiketi (varsayılan 'content'). */
  stream?: string;
  /** Öğe filtresi (ör. zorluk ya da mod). */
  filter?: (item: T) => boolean;
  /** Etiket dengesi: her etiketten en az bu kadar (havuz izin verdikçe). */
  minPerLabel?: number;
}

/**
 * Tohumdan deterministik tur kurar. `start` ve `complete` aynı tohumla ÇAĞRILDIĞINDA aynı
 * turu verir — etiketleri saklamak için Redis/DB gerekmez.
 */
export function drawRound<T extends ContentItem>(pool: readonly T[], seed: string, opts: DrawOptions<T>): ClassificationRound {
  const rng = createRng(seed).fork(opts.stream ?? 'content');
  const candidates = (opts.filter ? pool.filter(opts.filter) : pool.slice()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shuffled = rng.shuffle(candidates);
  const count = Math.max(0, Math.min(opts.count, shuffled.length));

  let chosen: T[] = shuffled.slice(0, count);
  const minPer = opts.minPerLabel ?? 0;
  if (minPer > 0) {
    const labels = Array.from(new Set(shuffled.map((i) => i.label)));
    const picked: T[] = [];
    const used = new Set<string>();
    for (const l of labels) {
      for (const it of shuffled.filter((i) => i.label === l).slice(0, minPer)) {
        if (picked.length < count) {
          picked.push(it);
          used.add(it.id);
        }
      }
    }
    for (const it of shuffled) {
      if (picked.length >= count) break;
      if (!used.has(it.id)) {
        picked.push(it);
        used.add(it.id);
      }
    }
    chosen = rng.shuffle(picked);
  }

  const items: PublicContentItem[] = [];
  const answerKey: Record<string, string> = {};
  chosen.forEach((it, i) => {
    const qid = `q${i}`;
    items.push({ ...it.payload, id: qid, difficulty: it.difficulty ?? 2 });
    answerKey[qid] = it.label;
  });
  return { items, answerKey };
}

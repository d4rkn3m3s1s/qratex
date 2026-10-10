/**
 * Sıralama çekirdeği (saf). Önbellekteki kullanıcıdan BAĞIMSIZ sıralı liste + izleyiciye özel
 * görünüm burada birleşir; DB ya da React bağımlılığı yoktur (Jest ile doğrudan test edilir).
 *
 * Kurallar:
 *  - Sıra anahtarı: skor ↓, sonra `tb` ↑ (skora daha ÖNCE ulaşan önde: son katkı anı ya da
 *    hesap açılış anı), sonra kullanıcı id'si ↑ (tam kararlı; aynı skor istekten isteğe yer değiştirmez).
 *  - Görünmez olmayı seçenler (gizlilik tercihi) başkalarının listesinde YOKTUR.
 *  - İzleyici kendini HER ZAMAN görür: listede yoksa (gizli mod, inceleme, önbellek sınırı dışında
 *    değilse) kendi skoruyla doğru konuma eklenir. Böylece kendi sırası listeyle aynı metrik,
 *    aynı dönem ve aynı tie-break kuralıyla hesaplanır (B5).
 */

/** [kullanıcı id, skor, tie-break epoch ms] — önbellekte küçük kalsın diye demet. */
export type RankEntry = readonly [uid: string, score: number, tb: number];

export function compareEntries(a: RankEntry, b: RankEntry): number {
  if (b[1] !== a[1]) return b[1] - a[1];
  if (a[2] !== b[2]) return a[2] - b[2];
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
}

export function sortEntries(entries: RankEntry[]): RankEntry[] {
  return [...entries].sort(compareEntries);
}

/** Sıralı listede `entry`'nin ekleneceği ilk konum (alt sınır, ikili arama). */
export function insertionIndex(sorted: readonly RankEntry[], entry: RankEntry): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareEntries(sorted[mid] as RankEntry, entry) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type ViewerList = {
  /** İzleyicinin gördüğü sıralı liste (başkaları görünürse + izleyici). */
  list: RankEntry[];
  /** İzleyicinin listedeki konumu (0 tabanlı); sıralamada değilse -1. */
  viewerIndex: number;
  /** Kaynak liste önbellek sınırında kesildi mi (toplam katılımcı daha fazla olabilir). */
  truncated: boolean;
  /** İzleyicinin skoru var ama kesilen listenin dışında kalıyor (sırası "N+" olarak gösterilir). */
  viewerBeyondCap: boolean;
};

export function buildViewerList(
  ranked: readonly RankEntry[],
  opts: {
    viewerId: string;
    /** İzleyicinin kendi kaydı (listede olsun olmasın). Skor ≤ 0 → sıralamada değil. */
    viewerEntry: RankEntry | null;
    /** Başkalarına görünmeyen kullanıcılar (gizlilik tercihi). */
    hiddenIds: ReadonlySet<string>;
    /** Kaynak listenin üst sınırı (kesilme tespiti). */
    cap: number;
  }
): ViewerList {
  const { viewerId, viewerEntry, hiddenIds, cap } = opts;
  const truncated = ranked.length >= cap;
  const list: RankEntry[] = [];
  for (const e of ranked) {
    if (e[0] === viewerId) continue;
    if (hiddenIds.has(e[0])) continue;
    list.push(e);
  }
  if (!viewerEntry || viewerEntry[1] <= 0) {
    return { list, viewerIndex: -1, truncated, viewerBeyondCap: false };
  }
  const idx = insertionIndex(list, viewerEntry);
  if (truncated && idx >= list.length) {
    // Kesilen listenin sonundan da aşağıda: kesin sıra bilinmiyor (uydurulmaz).
    return { list, viewerIndex: -1, truncated, viewerBeyondCap: true };
  }
  list.splice(idx, 0, viewerEntry);
  return { list, viewerIndex: idx, truncated, viewerBeyondCap: false };
}

/** Bir üstteki oyuncuyu geçmek için gereken fark (eşit skorda tie-break onda → +1). */
export function gapToAbove(list: readonly RankEntry[], index: number): number | null {
  if (index <= 0 || index >= list.length) return null;
  return (list[index - 1] as RankEntry)[1] - (list[index] as RankEntry)[1] + 1;
}

/** İlk `n`'e girmek için gereken fark; zaten içerideyse ya da liste kısaysa null. */
export function gapToTop(list: readonly RankEntry[], index: number, n: number): number | null {
  if (index < n || index >= list.length || list.length < n) return null;
  return (list[n - 1] as RankEntry)[1] - (list[index] as RankEntry)[1] + 1;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** 1 tabanlı sayfa → [başlangıç, bitiş) dilimi; aralık dışı sayfa son sayfaya sıkıştırılır. */
export function pageSlice(total: number, page: number, pageSize: number): { page: number; from: number; to: number } {
  const pages = pageCount(total, pageSize);
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const from = (p - 1) * pageSize;
  return { page: p, from, to: Math.min(total, from + pageSize) };
}

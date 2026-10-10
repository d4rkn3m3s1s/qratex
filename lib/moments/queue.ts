/**
 * An Motoru — istemci an kuyruğu (spec §2 `queue.ts`).
 *
 * Framework'ten bağımsız, `useSyncExternalStore` uyumlu küçük bir store.
 *
 * Kurallar:
 *  - Aynı anda TEK an oynar (`current()`).
 *  - İki şerit vardır:
 *      · `points` — kaydedilmeyen küçük puan kapsülü (`moments.points()`); kullanıcının
 *        az önce yaptığı eylemin karşılığı olduğu için büyük anlardan ÖNCE oynar.
 *        Henüz başlamamış ardışık puan anları tek kapsülde toplanır (spam yok).
 *      · `record` — sunucuda kaydı olan büyük an (`level_up`, `league_up`, `badge`).
 *        Öncelik: league_up > level_up > badge; eşitlikte `createdAt` eski önce.
 *  - Aynı sunucu `id`'si kuyruğun ömrü boyunca iki kez GİREMEZ (oynamış olsa bile) —
 *    "hiçbir an iki kez oynamaz" garantisinin istemci yarısı (diğer yarısı sunucu
 *    `seenAt` bayrağı).
 *
 * Oynatma iki adımlıdır: `start()` en öncelikli bekleyeni etkin yapar (Host bunu
 * yalnız ekranda açık bir dialog yokken çağırır), `next()` etkin anı bitirir.
 * Böylece bekleme sırasında daha öncelikli bir an gelirse o öne geçer.
 */
import type { Moment, MomentKind, PointsMoment } from './types';
import { isMomentKind } from './types';

/** Büyük an önceliği (küçük sayı = önce). */
export const MOMENT_PRIORITY: Record<MomentKind, number> = {
  league_up: 0,
  level_up: 1,
  badge: 2,
};

export type QueueItem =
  | { lane: 'points'; key: string; data: PointsMoment }
  | { lane: 'record'; key: string; data: Moment };

export type QueueSnapshot = {
  /** Şu an oynayan an (yoksa null). */
  active: QueueItem | null;
  /** Bekleyenler, oynama sırasıyla. */
  pending: readonly QueueItem[];
};

export type MomentQueue = {
  /** Sunucu anlarını ekler; eklenen (yeni) an sayısını döndürür. */
  enqueue(moments: readonly unknown[]): number;
  /** Puan kapsülü ekler (başlamamış bir kapsül varsa onunla birleşir). */
  enqueuePoints(points: PointsMoment): boolean;
  /** Etkin an. */
  current(): QueueItem | null;
  /** Sıradaki (henüz başlamamış) en öncelikli an. */
  peek(): QueueItem | null;
  /** Etkin an yoksa en öncelikli bekleyeni etkin yapar ve döndürür. */
  start(): QueueItem | null;
  /** Etkin anı bitirir. `key` verilirse yalnız o an hâlâ etkinse bitirir (geç kalan zamanlayıcıya karşı). */
  next(key?: string): void;
  /** Bu `id` kuyruğa daha önce girdi mi (oynamış/oynuyor/bekliyor)? */
  has(id: string): boolean;
  getSnapshot(): QueueSnapshot;
  subscribe(listener: () => void): () => void;
  /** Her şeyi boşaltır (oturum kapanınca). Görülen id hafızası da sıfırlanır. */
  reset(): void;
};

function toTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

function compareItems(a: QueueItem, b: QueueItem): number {
  // Puan kapsülü her zaman önce (kullanıcının az önceki eyleminin geri bildirimi).
  if (a.lane !== b.lane) return a.lane === 'points' ? -1 : 1;
  if (a.lane === 'points' || b.lane === 'points') return 0; // ekleme sırası korunur (stable sort)
  const pa = MOMENT_PRIORITY[a.data.kind];
  const pb = MOMENT_PRIORITY[b.data.kind];
  if (pa !== pb) return pa - pb;
  const ta = toTime(a.data.createdAt);
  const tb = toTime(b.data.createdAt);
  if (ta !== tb) return ta - tb;
  return a.data.id < b.data.id ? -1 : a.data.id > b.data.id ? 1 : 0;
}

/**
 * Sunucudan gelen ham kaydı doğrular. Bozuk/bilinmeyen kayıt kuyruğa girmez
 * (sahne bileşenleri tip güvenli payload bekler).
 */
export function parseMoment(raw: unknown): Moment | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  if (!isMomentKind(o.kind)) return null;
  if (!o.payload || typeof o.payload !== 'object' || Array.isArray(o.payload)) return null;
  const createdAt =
    typeof o.createdAt === 'string'
      ? o.createdAt
      : o.createdAt instanceof Date
        ? o.createdAt.toISOString()
        : new Date(0).toISOString();
  const p = o.payload as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));
  const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

  switch (o.kind) {
    case 'level_up': {
      const from = num(p.from);
      const to = num(p.to);
      if (!Number.isFinite(to) || to < 1) return null;
      return {
        id: o.id,
        kind: 'level_up',
        createdAt,
        payload: { from: Number.isFinite(from) ? from : to - 1, to, xp: Number.isFinite(num(p.xp)) ? num(p.xp) : 0 },
      };
    }
    case 'league_up': {
      const toKey = str(p.toKey);
      if (!toKey) return null;
      return {
        id: o.id,
        kind: 'league_up',
        createdAt,
        payload: {
          fromKey: str(p.fromKey),
          fromName: str(p.fromName),
          toKey,
          toName: str(p.toName, toKey),
          points: Number.isFinite(num(p.points)) ? num(p.points) : 0,
        },
      };
    }
    case 'badge': {
      const badgeId = str(p.badgeId);
      if (!badgeId) return null;
      return {
        id: o.id,
        kind: 'badge',
        createdAt,
        payload: {
          badgeId,
          name: str(p.name, 'Yeni rozet'),
          icon: str(p.icon, '🏅'),
          rarity: str(p.rarity, 'common'),
          color: typeof p.color === 'string' && p.color.trim() ? p.color : null,
          hidden: p.hidden === true,
        },
      };
    }
    default:
      return null;
  }
}

/** Puan anını doğrular: sonlu, pozitif, makul aralıkta tamsayı. */
export function normalizePoints(input: PointsMoment | null | undefined): PointsMoment | null {
  if (!input) return null;
  const clamp = (v: unknown) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000_000) : 0;
  };
  const points = clamp(input.points);
  const xp = clamp(input.xp);
  if (points === 0 && xp === 0) return null;
  return xp > 0 ? { points, xp } : { points };
}

export function createMomentQueue(): MomentQueue {
  let active: QueueItem | null = null;
  let pending: QueueItem[] = [];
  let known = new Set<string>();
  let pointsSeq = 0;
  let snapshot: QueueSnapshot = { active: null, pending: [] };
  const listeners = new Set<() => void>();

  const emit = () => {
    snapshot = { active, pending: pending.slice() };
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch {
        /* bir dinleyicinin hatası diğerlerini durdurmasın */
      }
    }
  };

  const sortPending = () => {
    // Array.prototype.sort kararlıdır (ES2019+): eşit öğeler ekleme sırasını korur.
    pending.sort(compareItems);
  };

  return {
    enqueue(moments) {
      let added = 0;
      for (const raw of moments) {
        const m = parseMoment(raw);
        if (!m || known.has(m.id)) continue;
        known.add(m.id);
        pending.push({ lane: 'record', key: `record:${m.id}`, data: m });
        added++;
      }
      if (added > 0) {
        sortPending();
        emit();
      }
      return added;
    },

    enqueuePoints(input) {
      const p = normalizePoints(input);
      if (!p) return false;
      const idx = pending.findIndex((i) => i.lane === 'points');
      const waiting = idx >= 0 ? pending[idx] : null;
      if (waiting && waiting.lane === 'points') {
        // Öğe değiştirilmez, yenisiyle değiştirilir (anlık görüntüler değişmez kalır).
        const xp = (waiting.data.xp ?? 0) + (p.xp ?? 0);
        const points = waiting.data.points + p.points;
        pending[idx] = { lane: 'points', key: waiting.key, data: xp > 0 ? { points, xp } : { points } };
      } else {
        pointsSeq += 1;
        pending.push({ lane: 'points', key: `points:${pointsSeq}`, data: p });
        sortPending();
      }
      emit();
      return true;
    },

    current: () => active,
    peek: () => pending[0] ?? null,

    start() {
      if (active || pending.length === 0) return active;
      active = pending.shift() ?? null;
      emit();
      return active;
    },

    next(key) {
      if (!active) return;
      if (key !== undefined && active.key !== key) return;
      active = null;
      emit();
    },

    has: (id) => known.has(id),
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    reset() {
      active = null;
      pending = [];
      known = new Set();
      emit();
    },
  };
}

/** Uygulama genelinde tek kuyruk (Host ve `moments` API'si paylaşır). */
export const momentQueue: MomentQueue = createMomentQueue();

/**
 * An Motoru — istemci kuyruğu (spec §2 `queue.ts`).
 *
 * Yeniden üretilen hata/senaryo sınıfları:
 *  - Öncelik: league_up > level_up > badge; eşitlikte createdAt eski önce (geç gelen lig
 *    yükselişi bekleyen rozetin ÖNÜNE geçer).
 *  - "Hiçbir an iki kez oynamaz": aynı sunucu id'si (oynamış olsa bile; ör. `seen` POST'u
 *    gitmeden yapılan ikinci çekme) kuyruğa yeniden GİREMEZ.
 *  - Tek an oynar; `next(key)` geç kalan bir zamanlayıcının YENİ anı bitirmesine izin vermez.
 *  - Puan kapsülü büyük anlardan önce; başlamamış ardışık kapsüller tek kapsülde toplanır.
 *  - Bozuk/bilinmeyen kayıt kuyruğa girmez; geçersiz puan (0/negatif/NaN) reddedilir.
 */
import { createMomentQueue, normalizePoints, parseMoment, MOMENT_PRIORITY } from '@/lib/moments/queue';

const level = (id: string, createdAt: string, to = 5) => ({
  id,
  kind: 'level_up',
  createdAt,
  payload: { from: to - 1, to, xp: 1000 },
});
const league = (id: string, createdAt: string, toKey = 'KOR') => ({
  id,
  kind: 'league_up',
  createdAt,
  payload: { fromKey: 'BASLANGIC', fromName: 'Başlangıç', toKey, toName: 'Kor', points: 3000 },
});
const badge = (id: string, createdAt: string) => ({
  id,
  kind: 'badge',
  createdAt,
  payload: { badgeId: `b-${id}`, name: 'İlk Yorum', icon: '🏅', rarity: 'rare', color: null, hidden: false },
});

const ids = (q: ReturnType<typeof createMomentQueue>) =>
  q.getSnapshot().pending.map((i) => (i.lane === 'record' ? i.data.id : i.key));

describe('moment kuyruğu — öncelik', () => {
  it('league_up > level_up > badge; eşitlikte createdAt eski önce', () => {
    const q = createMomentQueue();
    q.enqueue([
      badge('b1', '2026-10-01T10:00:00Z'),
      level('l2', '2026-10-01T10:05:00Z'),
      level('l1', '2026-10-01T10:01:00Z'),
      league('g1', '2026-10-01T10:09:00Z'),
      badge('b0', '2026-10-01T09:00:00Z'),
    ]);
    expect(ids(q)).toEqual(['g1', 'l1', 'l2', 'b0', 'b1']);
    expect(MOMENT_PRIORITY.league_up).toBeLessThan(MOMENT_PRIORITY.level_up);
    expect(MOMENT_PRIORITY.level_up).toBeLessThan(MOMENT_PRIORITY.badge);
  });

  it('bekleme sırasında gelen daha öncelikli an öne geçer (start ile etkinleşmeden önce)', () => {
    const q = createMomentQueue();
    q.enqueue([badge('b1', '2026-10-01T10:00:00Z')]);
    expect(q.peek()?.key).toBe('record:b1');
    q.enqueue([league('g1', '2026-10-02T10:00:00Z')]);
    expect(q.peek()?.key).toBe('record:g1');
  });

  it('createdAt eşitse id ile kararlı sıralama; geçersiz tarih en sona', () => {
    const q = createMomentQueue();
    q.enqueue([
      badge('bz', 'bozuk-tarih'),
      badge('bb', '2026-10-01T10:00:00Z'),
      badge('ba', '2026-10-01T10:00:00Z'),
    ]);
    expect(ids(q)).toEqual(['ba', 'bb', 'bz']);
  });
});

describe('moment kuyruğu — tekil id ("tam bir kez")', () => {
  it('aynı id aynı çağrıda ya da sonraki çekmede ikinci kez girmez', () => {
    const q = createMomentQueue();
    expect(q.enqueue([level('l1', '2026-10-01T10:00:00Z'), level('l1', '2026-10-01T10:00:00Z')])).toBe(1);
    expect(q.enqueue([level('l1', '2026-10-01T10:00:00Z')])).toBe(0);
    expect(q.getSnapshot().pending).toHaveLength(1);
  });

  it('oynayıp biten an, seen POST gitmeden yapılan ikinci çekmede TEKRAR oynamaz', () => {
    const q = createMomentQueue();
    q.enqueue([badge('b1', '2026-10-01T10:00:00Z')]);
    const started = q.start();
    expect(started?.key).toBe('record:b1');
    q.next(started!.key);
    expect(q.current()).toBeNull();

    // Sunucu henüz seenAt yazmadı → aynı kayıt yeniden gelir.
    expect(q.enqueue([badge('b1', '2026-10-01T10:00:00Z')])).toBe(0);
    expect(q.start()).toBeNull();
    expect(q.has('b1')).toBe(true);
  });

  it('reset (hesap değişimi) id hafızasını da sıfırlar', () => {
    const q = createMomentQueue();
    q.enqueue([badge('b1', '2026-10-01T10:00:00Z')]);
    q.reset();
    expect(q.has('b1')).toBe(false);
    expect(q.getSnapshot()).toEqual({ active: null, pending: [] });
  });
});

describe('moment kuyruğu — tek an oynar', () => {
  it('etkin an varken start yeni an başlatmaz; next sonrakine geçer', () => {
    const q = createMomentQueue();
    q.enqueue([level('l1', '2026-10-01T10:00:00Z'), badge('b1', '2026-10-01T10:00:00Z')]);
    const first = q.start();
    expect(first?.key).toBe('record:l1');
    expect(q.start()).toBe(first); // ikinci start aynı etkin anı döndürür
    q.next();
    expect(q.start()?.key).toBe('record:b1');
  });

  it("next(key): geç kalan zamanlayıcı yeni etkin anı bitiremez", () => {
    const q = createMomentQueue();
    q.enqueue([level('l1', '2026-10-01T10:00:00Z'), badge('b1', '2026-10-01T10:00:00Z')]);
    const a = q.start()!;
    q.next(a.key);
    const b = q.start()!;
    q.next(a.key); // eski anın emniyet zamanlayıcısı
    expect(q.current()).toBe(b);
  });

  it('abonelere bildirir ve anlık görüntü değişmezdir', () => {
    const q = createMomentQueue();
    const spy = jest.fn();
    const unsub = q.subscribe(spy);
    const before = q.getSnapshot();
    q.enqueue([badge('b1', '2026-10-01T10:00:00Z')]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(before.pending).toHaveLength(0);
    expect(q.getSnapshot()).not.toBe(before);
    // Değişiklik yoksa yeni anlık görüntü üretilmez (useSyncExternalStore sonsuz döngü yapmasın).
    const same = q.getSnapshot();
    q.enqueue([badge('b1', '2026-10-01T10:00:00Z')]);
    expect(q.getSnapshot()).toBe(same);
    unsub();
    q.enqueue([badge('b2', '2026-10-01T10:00:00Z')]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('moment kuyruğu — puan kapsülü', () => {
  it('puan kapsülü büyük anlardan önce oynar', () => {
    const q = createMomentQueue();
    q.enqueue([league('g1', '2026-10-01T10:00:00Z')]);
    q.enqueuePoints({ points: 120, xp: 40 });
    expect(q.start()?.lane).toBe('points');
  });

  it('başlamamış ardışık kapsüller tek kapsülde toplanır; başlamış olan birleşmez', () => {
    const q = createMomentQueue();
    q.enqueuePoints({ points: 50 });
    q.enqueuePoints({ points: 70, xp: 10 });
    const pending = q.getSnapshot().pending;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ lane: 'points', data: { points: 120, xp: 10 } });

    q.start();
    q.enqueuePoints({ points: 5 });
    expect(q.getSnapshot().pending).toHaveLength(1);
    expect(q.getSnapshot().pending[0]).toMatchObject({ data: { points: 5 } });
  });

  it('geçersiz puan reddedilir; yalnız XP kabul edilir', () => {
    const q = createMomentQueue();
    expect(q.enqueuePoints({ points: 0 })).toBe(false);
    expect(q.enqueuePoints({ points: -10, xp: -1 })).toBe(false);
    expect(q.enqueuePoints({ points: Number.NaN })).toBe(false);
    expect(normalizePoints({ points: 0, xp: 25 })).toEqual({ points: 0, xp: 25 });
    expect(normalizePoints({ points: 12.9 })).toEqual({ points: 12 });
    expect(q.getSnapshot().pending).toHaveLength(0);
  });
});

describe('parseMoment — bozuk kayıt kuyruğa girmez', () => {
  it('bilinmeyen tür, id/payload eksikliği ve dizi payload reddedilir', () => {
    expect(parseMoment(null)).toBeNull();
    expect(parseMoment({ id: 'x', kind: 'mystery', payload: {} })).toBeNull();
    expect(parseMoment({ kind: 'badge', payload: { badgeId: 'b' } })).toBeNull();
    expect(parseMoment({ id: 'x', kind: 'badge', payload: [] })).toBeNull();
    expect(parseMoment({ id: 'x', kind: 'badge', payload: {} })).toBeNull(); // badgeId yok
    expect(parseMoment({ id: 'x', kind: 'level_up', payload: { to: 0 } })).toBeNull();
    expect(parseMoment({ id: 'x', kind: 'league_up', payload: {} })).toBeNull(); // toKey yok
  });

  it('eksik alanlar güvenli varsayılanlarla doldurulur', () => {
    const m = parseMoment({ id: 'x', kind: 'badge', createdAt: '2026-10-01T00:00:00Z', payload: { badgeId: 'b1' } });
    expect(m).toEqual({
      id: 'x',
      kind: 'badge',
      createdAt: '2026-10-01T00:00:00Z',
      payload: { badgeId: 'b1', name: 'Yeni rozet', icon: '🏅', rarity: 'common', color: null, hidden: false },
    });
    const l = parseMoment({ id: 'y', kind: 'level_up', createdAt: new Date('2026-10-01T00:00:00Z'), payload: { to: '7' } });
    expect(l).toMatchObject({ createdAt: '2026-10-01T00:00:00.000Z', payload: { from: 6, to: 7, xp: 0 } });
  });
});

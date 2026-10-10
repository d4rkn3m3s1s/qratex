/**
 * P0-39 (müşteri · Kartım): yanıt doğrulama, çevrimdışı anlık görüntü, kart URL'si.
 *
 * Yeniden üretilen hatalar:
 *  - 403/500/bozuk gövde → eski sayfa "Henüz kartın yok" gösteriyordu (hata = boş). Artık
 *    `parseCardsResponse` hata fırlatır; sayfa hata/çevrimdışı durumunu ayrı gösterir.
 *  - Sabit `https://demoqratex.vercel.app` QR kökeni → ortamın kökeni.
 *  - `[KARAKTER-TEST]` sentetik kartları kullanıcıya gösteriliyordu.
 * (Mobil kırpılmanın kök nedeni CSS'tir — `overflow-hidden` yerine `overflow-clip` ve QR'ın kart
 * yüzünden ayrı panele taşınması; görsel doğrulama ayrı yapıldı.)
 */
import {
  CardsContractError,
  SNAPSHOT_MAX_AGE_MS,
  buildCardUrl,
  buildSnapshot,
  maskCardToken,
  parseCardsResponse,
  readSnapshot,
  resolveCardOrigin,
  snapshotKey,
  spokenCardCode,
} from '@/app/customer/my-card/_lib/card-helpers';

const apiCard = {
  id: 'card-1',
  token: 'abcDEF123456xyz98765',
  status: 'ACTIVATED',
  activatedAt: '2026-09-01T10:00:00.000Z',
  batchId: 'b1',
  blockReason: null,
  _count: { consumptions: 7 },
  consumptions: [
    {
      id: 'c1',
      createdAt: '2026-10-07T10:00:00.000Z',
      note: 'bayi iç notu',
      dealer: { id: 'd1', businessName: 'Kahve Evi' },
      product: { id: 'p1', name: 'Latte' },
    },
  ],
};

describe('parseCardsResponse', () => {
  it('gerçek uç yanıtını okur ve yalnız gereken alanları tutar', () => {
    const data = parseCardsResponse({
      success: true,
      cards: [apiCard],
      stats: { totalCards: 1, totalConsumptions: 7, reviewPending: 2 },
    });
    expect(data.cards).toHaveLength(1);
    expect(data.cards[0]).toEqual({
      id: 'card-1',
      token: 'abcDEF123456xyz98765',
      status: 'ACTIVATED',
      activatedAt: '2026-09-01T10:00:00.000Z',
      consumptionsCount: 7,
      consumptions: [
        { id: 'c1', createdAt: '2026-10-07T10:00:00.000Z', dealer: { id: 'd1', businessName: 'Kahve Evi' }, product: { id: 'p1', name: 'Latte' } },
      ],
    });
    expect(data.stats).toEqual({ totalCards: 1, totalConsumptions: 7, reviewPending: 2 });
  });

  it('hata gövdesi BOŞ LİSTE değil hata olarak ele alınır (eski: "Henüz kartın yok")', () => {
    expect(() => parseCardsResponse({ error: 'Yetkisiz erişim' })).toThrow(CardsContractError);
    expect(() => parseCardsResponse({ success: false, error: 'Kartlar getirilemedi' })).toThrow(CardsContractError);
    expect(() => parseCardsResponse(null)).toThrow(CardsContractError);
    expect(() => parseCardsResponse({ success: true, cards: 'x' })).toThrow(CardsContractError);
  });

  it('gerçekten kartı olmayan kullanıcı boş liste alır', () => {
    expect(parseCardsResponse({ success: true, cards: [], stats: { totalConsumptions: 0, reviewPending: 0 } }).cards).toEqual([]);
  });

  it('zarf v2 (data içinde) biçimini de okur', () => {
    expect(parseCardsResponse({ ok: true, success: true, data: { cards: [apiCard], stats: {} } }).cards).toHaveLength(1);
  });

  it('sentetik test kartlarını ve tokensız kayıtları eler', () => {
    const data = parseCardsResponse({
      success: true,
      cards: [apiCard, { ...apiCard, id: 'syn', blockReason: '[KARAKTER-TEST]' }, { ...apiCard, id: 'x', token: '' }],
    });
    expect(data.cards.map((c) => c.id)).toEqual(['card-1']);
    expect(data.stats.totalConsumptions).toBe(7);
  });
});

describe('kart URL ve maskeleme', () => {
  it('yapılandırılmış kökeni, yoksa sayfa kökenini kullanır (sabit demo alan adı yok)', () => {
    expect(resolveCardOrigin('https://qratex.com/', 'http://localhost:3000')).toBe('https://qratex.com');
    expect(resolveCardOrigin(undefined, 'https://preview-123.vercel.app')).toBe('https://preview-123.vercel.app');
    expect(resolveCardOrigin('javascript:alert(1)', 'https://app.qratex.com')).toBe('https://app.qratex.com');
    expect(resolveCardOrigin('', '')).toBe('https://qratex.com');
  });

  it('kart URL kasadaki ayrıştırıcıyla uyumlu (/c/<token>)', () => {
    const url = buildCardUrl('abc_DEF-123', 'https://qratex.com/');
    expect(url).toBe('https://qratex.com/c/abc_DEF-123');
    expect(url.match(/\/c\/([A-Za-z0-9_-]+)/)?.[1]).toBe('abc_DEF-123');
  });

  it('maskeli numara ve söylenebilir kod son 8 karakterden', () => {
    expect(maskCardToken('abcDEF123456xyz98765')).toBe('•••• XYZ9 8765');
    expect(spokenCardCode('abcDEF123456xyz98765')).toBe('XYZ9-8765');
    expect(spokenCardCode('ab12')).toBe('AB12');
  });
});

describe('çevrimdışı anlık görüntü', () => {
  const now = Date.UTC(2026, 9, 8, 12);
  const data = parseCardsResponse({
    success: true,
    cards: [apiCard, { ...apiCard, id: 'blocked', token: 'zzzzzzzzzz', status: 'BLOCKED' }],
    stats: { totalConsumptions: 7, reviewPending: 2 },
  });

  it('yalnız aktif kartları ve QR için gereken alanları saklar', () => {
    const snap = buildSnapshot(data, now);
    expect(snap.data.cards.map((c) => c.id)).toEqual(['card-1']);
    expect(snap.data.cards[0].consumptions).toEqual([]);
    expect(JSON.stringify(snap)).not.toContain('Latte');
  });

  it('geri okunur; bozuk, eski sürüm veya çok eski görüntü reddedilir', () => {
    const raw = JSON.stringify(buildSnapshot(data, now));
    const back = readSnapshot(raw, now + 60_000);
    expect(back?.data.cards[0].token).toBe('abcDEF123456xyz98765');
    expect(back?.data.cards[0].consumptionsCount).toBe(7);
    expect(readSnapshot(raw, now + SNAPSHOT_MAX_AGE_MS + 1)).toBeNull();
    expect(readSnapshot('{bozuk', now)).toBeNull();
    expect(readSnapshot(JSON.stringify({ v: 99, savedAt: now, data: {} }), now)).toBeNull();
    expect(readSnapshot(null, now)).toBeNull();
  });

  it('anahtar kullanıcıya özel', () => {
    expect(snapshotKey('u1')).not.toBe(snapshotKey('u2'));
  });
});

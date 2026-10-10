/**
 * Cüzdan → Kartım saf çekirdeği (my-card + lounge raporları).
 *  - Açık DTO: sentetik `[KARAKTER-TEST]` ve arşivli kartlar düşer; müşteri dondurması ayrışır.
 *  - Statü: lig + sonraki lige kalan puan; VIP yalnız gerçekten atanmış/etkin/süresi dolmamışsa.
 *  - Hata ≠ boş: bozuk/başarısız yanıt hata fırlatır.
 *  - Çevrimdışı anlık görüntü: yalnız aktif kartlar + QR; bayat/bozuk veri okunmaz.
 *  - Kasa yedeği TAM token (kasa `extractCardToken` tam token bekler; "son 8 hane" sahteydi).
 *  - Kabuk sekmeleri kayıttan; Kartım her zaman ilk.
 *  - Kart işlemleri: sahiplik, yönetim bloğu, dondur/çöz/yeni kod geçişleri.
 */
import {
  CUSTOMER_FREEZE_REASON,
  SYNTHETIC_CARD_BLOCK_REASON,
  WalletContractError,
  buildBirthday,
  buildLeagueStatus,
  buildVip,
  mapCards,
  parseWalletCardResponse,
  sumPointsBySource,
  type CardRow,
  type WalletCardPayload,
} from '@/lib/wallet-card/dto';
import {
  SNAPSHOT_MAX_AGE_MS,
  buildCardUrl,
  buildSnapshot,
  groupedCardToken,
  maskCardToken,
  readSnapshot,
  resolveCardOrigin,
} from '@/lib/wallet-card/snapshot';
import { activeWalletTab, resolveWalletTabs } from '@/lib/wallet-card/tabs';
import { decideCardAction } from '@/lib/wallet-card/actions';
import { DEFAULT_LEAGUE_RULES } from '@/lib/league-rules-core';
import type { ShellConfig } from '@/lib/navigation/shell-config';

const row = (over: Partial<CardRow> = {}): CardRow => ({
  id: 'c1',
  token: 'abcDEF123456xyz98765Q',
  status: 'ACTIVATED',
  activatedAt: new Date('2026-09-01T10:00:00Z'),
  blockReason: null,
  archivedAt: null,
  _count: { consumptions: 4 },
  consumptions: [{ createdAt: new Date('2026-10-01T10:00:00Z') }],
  ...over,
});

describe('mapCards', () => {
  it('sentetik ve arşivli kart düşer; aktif önce; son kullanım', () => {
    const cards = mapCards([
      row({ id: 'u', status: 'UNUSED', activatedAt: null }),
      row({ id: 'syn', blockReason: SYNTHETIC_CARD_BLOCK_REASON }),
      row({ id: 'arc', archivedAt: new Date(), status: 'BLOCKED' }),
      row({ id: 'a' }),
    ]);
    expect(cards.map((c) => c.id)).toEqual(['a', 'u']);
    expect(cards[0]).toMatchObject({ consumptionsCount: 4, lastUsedAt: '2026-10-01T10:00:00.000Z', frozenByCustomer: false });
  });

  it('müşteri dondurması ile yönetim bloğu ayrışır', () => {
    const [frozen] = mapCards([row({ status: 'BLOCKED', blockReason: CUSTOMER_FREEZE_REASON })]);
    const [blocked] = mapCards([row({ status: 'BLOCKED', blockReason: 'Çalıntı' })]);
    expect(frozen.frozenByCustomer).toBe(true);
    expect(blocked.frozenByCustomer).toBe(false);
    // İç not (blok gerekçesi) DTO'ya girmez.
    expect(JSON.stringify(blocked)).not.toContain('Çalıntı');
  });
});

describe('buildLeagueStatus', () => {
  it('Başlangıç ligi → Kor ligine kalan puan ve ilerleme', () => {
    const s = buildLeagueStatus(1500, DEFAULT_LEAGUE_RULES);
    expect(s.league.key).toBe('BASLANGIC');
    expect(s.nextLeague?.key).toBe('KOR');
    expect(s.toNextLeague).toBe(1500);
    expect(s.leagueProgress).toBe(50);
  });
  it('son lig → sonraki yok, ilerleme 100', () => {
    const s = buildLeagueStatus(50_000, DEFAULT_LEAGUE_RULES);
    expect(s).toMatchObject({ nextLeague: null, toNextLeague: null, leagueProgress: 100 });
  });
});

describe('buildVip', () => {
  const now = new Date('2026-10-10T00:00:00Z');
  const tier = { name: 'Gold', color: '#f5b301', icon: '👑', multiplier: 1.5, isActive: true };
  it('atanmamış → null (otomatik yükselme vaadi yok)', () => {
    expect(buildVip(null, now)).toBeNull();
  });
  it('pasif katman ya da süresi dolmuş → null', () => {
    expect(buildVip({ tierExpiry: null, tier: { ...tier, isActive: false } }, now)).toBeNull();
    expect(buildVip({ tierExpiry: new Date('2026-01-01T00:00:00Z'), tier }, now)).toBeNull();
  });
  it('etkin → ad, çarpan, geçerli renk', () => {
    expect(buildVip({ tierExpiry: null, tier }, now)).toEqual({ name: 'Gold', color: '#f5b301', icon: '👑', multiplier: 1.5, expiresAt: null });
    expect(buildVip({ tierExpiry: null, tier: { ...tier, color: 'url(javascript:1)' } }, now)?.color).toBeNull();
  });
});

describe('buildBirthday', () => {
  const now = new Date('2026-06-10T08:00:00Z');
  it('kayıt yok → unset', () => {
    expect(buildBirthday(null, 500, now)).toMatchObject({ state: 'unset', claim: 'NOT_SET', bonusAmount: 500 });
  });
  it('bugün ve uygun → today + OK', () => {
    const b = buildBirthday({ birthDate: new Date(Date.UTC(1990, 5, 10)), createdAt: new Date('2025-01-01Z'), lastBonusAt: null }, 500, now);
    expect(b).toMatchObject({ state: 'today', claim: 'OK', month: 6, day: 10, daysUntil: 0 });
  });
});

describe('sumPointsBySource', () => {
  it('tüketim başına toplar, sourceId olmayanı atlar', () => {
    const m = sumPointsBySource([
      { sourceId: 'x', delta: 10 },
      { sourceId: 'x', delta: 5 },
      { sourceId: null, delta: 99 },
    ]);
    expect(m.get('x')).toBe(15);
    expect(m.size).toBe(1);
  });
});

describe('parseWalletCardResponse', () => {
  const payload = { cards: [], status: {}, birthday: {}, pending: { count: 0, items: [] } };
  it('zarf v2 verisini kabul eder', () => {
    expect(parseWalletCardResponse({ success: true, data: payload }).cards).toEqual([]);
  });
  it('başarısız/bozuk gövde → hata (boş durum DEĞİL)', () => {
    expect(() => parseWalletCardResponse({ success: false, error: 'x' })).toThrow(WalletContractError);
    expect(() => parseWalletCardResponse({ success: true, data: { cards: 'x' } })).toThrow(WalletContractError);
    expect(() => parseWalletCardResponse(null)).toThrow(WalletContractError);
  });
});

describe('anlık görüntü', () => {
  const now = 1_800_000_000_000;
  const data = {
    holderName: 'Ayşe',
    cards: mapCards([row(), row({ id: 'b', status: 'BLOCKED', blockReason: CUSTOMER_FREEZE_REASON })]),
  } as Pick<WalletCardPayload, 'cards' | 'holderName'>;

  it('yalnız aktif kart + geçerli QR saklanır; geri okunur', () => {
    const snap = buildSnapshot(data, { [data.cards[0].token]: 'data:image/png;base64,AAA', bogus: 'http://x' }, now)!;
    expect(snap.cards.map((c) => c.id)).toEqual(['c1']);
    expect(Object.keys(snap.qr)).toEqual([data.cards[0].token]);
    const back = readSnapshot(JSON.stringify(snap), now + 1000);
    expect(back?.holderName).toBe('Ayşe');
    expect(back?.qr[data.cards[0].token]).toBe('data:image/png;base64,AAA');
  });

  it('bayat, gelecekten, bozuk ya da aktif kartsız görüntü okunmaz', () => {
    const snap = buildSnapshot(data, {}, now)!;
    expect(readSnapshot(JSON.stringify(snap), now + SNAPSHOT_MAX_AGE_MS + 1)).toBeNull();
    expect(readSnapshot(JSON.stringify({ ...snap, savedAt: now + 3_600_000 }), now)).toBeNull();
    expect(readSnapshot('{bozuk', now)).toBeNull();
    expect(readSnapshot(JSON.stringify({ ...snap, cards: [] }), now)).toBeNull();
    expect(buildSnapshot({ holderName: null, cards: [] }, {}, now)).toBeNull();
  });
});

describe('kart URL ve kod', () => {
  it('köken: yapılandırma → sayfa → varsayılan', () => {
    expect(resolveCardOrigin('https://qratex.com/x', 'http://localhost:3000')).toBe('https://qratex.com');
    expect(resolveCardOrigin(undefined, 'http://localhost:3000')).toBe('http://localhost:3000');
    expect(resolveCardOrigin('javascript:alert(1)', null)).toBe('https://qratex.com');
    expect(buildCardUrl('a b', 'https://x.com/')).toBe('https://x.com/c/a%20b');
  });
  it('maske büyük/küçük harfi korur; kasa yedeği TAM token', () => {
    expect(maskCardToken('abcDEF123456xyz98765Q')).toBe('•••• yz98 765Q');
    expect(groupedCardToken('abcDEF123456xyz98765Q')).toBe('abcD EF12 3456 xyz9 8765 Q');
    expect(groupedCardToken('abcDEF123456xyz98765Q').replace(/ /g, '')).toBe('abcDEF123456xyz98765Q');
  });
});

describe('kabuk sekmeleri', () => {
  type Item = { id: string; href: string; label: { tr: string; en: string }; icon: 'Wallet'; children: Item[] };
  const item = (id: string, href: string, children: Item[] = []): Item => ({
    id,
    href,
    label: { tr: id, en: id },
    icon: 'Wallet',
    children,
  });
  const shell = (children: Item[]): Pick<ShellConfig, 'nodes'> => ({
    nodes: [{ kind: 'item', item: { ...item('customer.wallet', '/customer/wallet'), children } }],
  });

  it('kayıttan gelir; Kartım her zaman ilk; modülü kapalı sekme yok', () => {
    const tabs = resolveWalletTabs(
      shell([item('customer.wallet.rewards', '/customer/wallet/rewards'), item('customer.wallet.card', '/customer/wallet/card')])
    );
    expect(tabs.map((t) => t.href)).toEqual(['/customer/wallet/card', '/customer/wallet/rewards']);
  });
  it('kabuk yoksa yalnız Kartım', () => {
    expect(resolveWalletTabs(null).map((t) => t.href)).toEqual(['/customer/wallet/card']);
  });
  it('etkin sekme: en uzun önek', () => {
    const tabs = resolveWalletTabs(shell([item('customer.wallet.owned', '/customer/wallet/owned')]));
    expect(activeWalletTab(tabs, '/customer/wallet/owned/abc')).toBe('customer.wallet.owned');
    expect(activeWalletTab(tabs, '/customer/wallet/card/')).toBe('customer.wallet.card');
    expect(activeWalletTab(tabs, '/customer')).toBeNull();
  });
});

describe('decideCardAction', () => {
  const now = new Date('2026-10-10T00:00:00Z');
  const mine = { customerId: 'u1', status: 'ACTIVATED', blockReason: null, archivedAt: null };

  it('başkasının kartı ya da yok → 404', () => {
    expect(decideCardAction(null, 'u1', 'freeze', now)).toMatchObject({ ok: false, status: 404 });
    expect(decideCardAction({ ...mine, customerId: 'u2' }, 'u1', 'freeze', now)).toMatchObject({ ok: false, status: 404 });
  });
  it('arşivli → 409; yönetim bloğu müşteri tarafından çözülemez/dondurulamaz/yenilenemez', () => {
    expect(decideCardAction({ ...mine, archivedAt: now }, 'u1', 'rotate', now)).toMatchObject({ ok: false, code: 'CARD_ARCHIVED' });
    for (const a of ['freeze', 'unfreeze', 'rotate'] as const) {
      expect(decideCardAction({ ...mine, status: 'BLOCKED', blockReason: 'Çalıntı' }, 'u1', a, now)).toMatchObject({
        ok: false,
        code: 'CARD_BLOCKED_BY_ADMIN',
      });
    }
  });
  it('dondur → BLOCKED + müşteri gerekçesi; çöz → ACTIVATED', () => {
    expect(decideCardAction(mine, 'u1', 'freeze', now)).toMatchObject({
      ok: true,
      audit: 'BLOCKED',
      data: { status: 'BLOCKED', blockReason: CUSTOMER_FREEZE_REASON, rotate: false },
    });
    const frozen = { ...mine, status: 'BLOCKED', blockReason: CUSTOMER_FREEZE_REASON };
    expect(decideCardAction(frozen, 'u1', 'unfreeze', now)).toMatchObject({ ok: true, audit: 'UNBLOCKED', data: { status: 'ACTIVATED', blockReason: null } });
    expect(decideCardAction(frozen, 'u1', 'freeze', now)).toMatchObject({ ok: false, code: 'ALREADY_FROZEN' });
    expect(decideCardAction(mine, 'u1', 'unfreeze', now)).toMatchObject({ ok: false, code: 'NOT_FROZEN' });
  });
  it('yeni kod: aktif ya da dondurulmuş kartta; sonuç ACTIVATED + rotate', () => {
    expect(decideCardAction(mine, 'u1', 'rotate', now)).toMatchObject({ ok: true, audit: 'TOKEN_ROTATED', data: { status: 'ACTIVATED', rotate: true } });
    expect(
      decideCardAction({ ...mine, status: 'BLOCKED', blockReason: CUSTOMER_FREEZE_REASON }, 'u1', 'rotate', now)
    ).toMatchObject({ ok: true, data: { rotate: true } });
    expect(decideCardAction({ ...mine, status: 'UNUSED' }, 'u1', 'rotate', now)).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
  });
});

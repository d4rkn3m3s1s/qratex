/**
 * P0-35 / bayi F10 + Dalga 2: VoC duvarı (mağaza TV'si).
 * Yeniden üretim: "Ayşe Yılmaz" küfürlü 1★ yorum bırakır; eski sorgu yalnız `isPublic` ile
 * süzdüğü için yorum TV'de TAM ADLA dönüyordu. Dalga 2: bayi moderasyonu (sabitle/gizle),
 * yayın kuralları ve oturumsuz, iptal edilebilir ekran bağlantıları — güvenlik süzgecini
 * hiçbir kural/sabit delmez. Prisma/redis mock'lanır (gerçek DB yok).
 */
const settings = new Map<string, unknown>();
const mockFeedbackFindMany = jest.fn();
const mockFeedbackFindFirst = jest.fn();
const db = {
  feedback: {
    findMany: (...a: unknown[]) => mockFeedbackFindMany(...a),
    findFirst: (...a: unknown[]) => mockFeedbackFindFirst(...a),
    count: jest.fn(async () => 2),
    aggregate: jest.fn(async () => ({ _avg: { rating: 4.26 }, _count: 12 })),
    groupBy: jest.fn(async () => []),
  },
  qRCode: {
    findFirst: jest.fn(async () => ({ id: 'qr-1', code: 'ABC123' })),
    findMany: jest.fn(async () => []),
  },
  user: { findUnique: jest.fn(async () => ({ businessName: 'Kahve Durağı', name: 'Bayi' })) },
  settings: {
    findUnique: jest.fn(async ({ where }: { where: { key: string } }) => (settings.has(where.key) ? { value: settings.get(where.key) } : null)),
    upsert: jest.fn(async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
      settings.set(where.key, settings.has(where.key) ? update.value : create.value);
    }),
    create: jest.fn(async ({ data }: { data: { key: string; value: unknown } }) => {
      settings.set(data.key, data.value);
    }),
    deleteMany: jest.fn(async ({ where }: { where: { key: string } }) => {
      settings.delete(where.key);
      return { count: 1 };
    }),
  },
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));
jest.mock('@/lib/redis', () => ({
  cachedJson: async (_k: string, _t: number, f: () => Promise<unknown>) => f(),
  redisGetJson: async () => null,
  redisSetJson: async () => undefined,
}));
jest.mock('@/lib/dealer/qr-codes/load.server', () => ({ buildQrTargetUrl: (c: string) => `https://qratex.test/feedback/${c}` }));

import {
  WALL_FRAUD_THRESHOLD,
  containsBlockedLanguage,
  maskCustomerName,
  toWallText,
  wallEligibleWhere,
} from '@/app/api/dealer/voc-wall/wall-policy';
import {
  DEFAULT_WALL_RULES,
  MAX_PINNED,
  applyWallStatus,
  parseWallConfig,
  qrMatrixToPath,
  topThemes,
  wallConfigKey,
  wallDisplayKey,
  wallVerdict,
  type VerdictRow,
} from '@/lib/dealer/voc-wall/config';
import {
  WallError,
  createDisplay,
  hashDisplayToken,
  liveWhere,
  loadWallFeed,
  resolveDisplayToken,
  revokeDisplay,
  setWallStatus,
} from '@/lib/dealer/voc-wall/server';

beforeEach(() => {
  jest.clearAllMocks();
  settings.clear();
});

describe('yayın politikası (wall-policy)', () => {
  it('yayın koşulu toksik, güven-işaretli, sahte ve denetlenmemiş yorumları dışlar (fail-closed)', () => {
    const w = wallEligibleWhere('dealer-1');
    expect(w).toMatchObject({ qrCode: { dealerId: 'dealer-1' }, deletedAt: null, isPublic: true, isToxic: false, trustFlagged: false });
    const and = JSON.stringify(w.AND);
    expect(and).toContain(`"lt":${WALL_FRAUD_THRESHOLD}`);
    expect(and).toContain('"aiProcessedAt":{"not":null}');
    expect(and).toContain('"fraudStatus":"clean"');
  });

  it.each([
    ['Ayşe Yılmaz', 'A*** Y.'],
    ['ayşe', 'A***'],
    ['  İsmail  Ömer   Çelik ', 'İ*** Ç.'],
    ['ayse@ornek.com', 'Anonim'],
    ['1234', 'Anonim'],
    [null, 'Anonim'],
    ['', 'Anonim'],
  ])('ad maskeleme: %p → %p', (input, expected) => {
    expect(maskCustomerName(input as string | null)).toBe(expected);
  });

  it('açık küfür yakalanır; masum kelimeler yakalanmaz', () => {
    expect(containsBlockedLanguage('Garson tam bir SALAK')).toBe(true);
    expect(containsBlockedLanguage('siktirin gidin')).toBe(true);
    expect(containsBlockedLanguage('Kahve çok güzeldi, aqua menü de iyi')).toBe(false);
    expect(containsBlockedLanguage(null)).toBe(false);
  });

  it('metindeki e-posta, telefon ve bağlantı gizlenir; uzun metin kısaltılır', () => {
    const t = toWallText('Beni ara 0532 123 45 67 ya da ayse@ornek.com, bkz. www.kotu.example ve kotu.com.tr')!;
    expect(t).not.toMatch(/0532|ayse@|kotu/);
    expect(toWallText('a'.repeat(400))!.length).toBeLessThanOrEqual(301);
    expect(toWallText('   ')).toBeNull();
  });
});

describe('duvar yapılandırması (saf)', () => {
  it('bozuk JSON güvenli varsayılana döner', () => {
    expect(parseWallConfig(null).rules).toEqual(DEFAULT_WALL_RULES);
    const c = parseWallConfig({ rules: { minRating: 99, rotateSeconds: 'x' }, pinned: ['a', 'a', 5], hidden: 'yok' });
    expect(c.rules).toEqual(DEFAULT_WALL_RULES);
    expect(c.pinned).toEqual(['a']);
    expect(c.hidden).toEqual([]);
  });

  it('sabit ve gizli listeleri ayrık kalır; sabit tavanı aşılamaz; sürüm artar', () => {
    const base = parseWallConfig({ pinned: ['x'], hidden: [] });
    const hid = applyWallStatus(base, 'x', 'hidden')!;
    expect(hid.pinned).toEqual([]);
    expect(hid.hidden).toEqual(['x']);
    expect(hid.version).toBe(base.version + 1);
    const full = parseWallConfig({ pinned: Array.from({ length: MAX_PINNED }, (_, i) => `p${i}`) });
    expect(applyWallStatus(full, 'yeni', 'pinned')).toBeNull();
  });

  const row = (o: Partial<VerdictRow> = {}): VerdictRow => ({
    id: 'f1', rating: 5, text: 'Harika', isPublic: true, isToxic: false, trustFlagged: false, fraudScore: 0.1,
    aiProcessedAt: new Date(), aiModelUsed: 'groq', userId: 'u1', authorFraudStatus: 'clean', qrCodeId: 'qr-1', ...o,
  });
  const opts = { fraudThreshold: WALL_FRAUD_THRESHOLD, blockedLanguage: containsBlockedLanguage };

  it('sabitlemek güvenlik süzgecini DELMEZ', () => {
    const cfg = { rules: DEFAULT_WALL_RULES, pinned: ['f1'], hidden: [] };
    expect(wallVerdict(row({ isToxic: true }), cfg, opts)).toEqual({ state: 'blocked', reason: 'toxic', safety: true });
    expect(wallVerdict(row({ aiProcessedAt: null }), cfg, opts)).toMatchObject({ reason: 'pending', safety: true });
    expect(wallVerdict(row({ text: 'garson salak' }), cfg, opts)).toMatchObject({ reason: 'language', safety: true });
    expect(wallVerdict(row({ fraudScore: 0.9 }), cfg, opts)).toMatchObject({ reason: 'fraud' });
    expect(wallVerdict(row({ rating: 1 }), cfg, opts)).toEqual({ state: 'pinned' }); // kural muafiyeti
  });

  it('kurallar: eşik altı ve metinsiz yorum yayın dışı; gizli yorum gizli', () => {
    const cfg = { rules: DEFAULT_WALL_RULES, pinned: [], hidden: [] };
    expect(wallVerdict(row({ rating: 3 }), cfg, opts)).toMatchObject({ reason: 'low_rating', safety: false });
    expect(wallVerdict(row({ text: null }), cfg, opts)).toMatchObject({ reason: 'no_text' });
    expect(wallVerdict(row(), { ...cfg, hidden: ['f1'] }, opts)).toEqual({ state: 'hidden' });
    expect(wallVerdict(row(), cfg, opts)).toEqual({ state: 'live' });
  });

  it('tema sayımı olumlu/olumsuz ayrımlı; QR yolu üretilir', () => {
    const t = topThemes([
      { themes: [{ theme: 'Hizmet', sentiment: 'positive' }, { theme: 'Fiyat', sentiment: 'negative' }], sentiment: 'neutral' },
      { themes: ['hizmet'], sentiment: 'negative' },
    ]);
    expect(t[0]).toEqual({ theme: 'Hizmet', total: 2, positive: 1, negative: 1 });
    expect(qrMatrixToPath([[true, true, false], [false, true, false]])).toBe('M0 0h2v1h-2zM1 1h1v1h-1z');
  });
});

describe('ekran akışı (loadWallFeed)', () => {
  const fb = (id: string, text: string | null, name: string | null, rating = 5) => ({
    id, rating, text, createdAt: new Date('2026-10-10T10:00:00Z'), dealerReply: id === 'f1' ? 'Teşekkürler' : null,
    user: name ? { name, anonymizedAt: null } : null, qrCode: { name: 'Bahçe', location: { name: 'Kadıköy' } },
  });

  it('güvenlik + gizli + kurallar sorguda; ad maskeli; küfür elenir; sabit önde; tam ad sızmaz', async () => {
    mockFeedbackFindMany.mockResolvedValue([
      fb('f1', 'Harika kahve, tel: 0532 123 45 67', 'Ayşe Yılmaz'),
      fb('f2', 'Garson salak', 'Mehmet Kaya'),
      fb('f3', 'İyi', 'Zeynep Ak'),
    ]);
    const cfg = parseWallConfig({ pinned: ['f3'], hidden: ['f9'], version: 4 });
    const feed = await loadWallFeed('dealer-1', cfg, null);

    const where = mockFeedbackFindMany.mock.calls[0][0].where;
    expect(where).toEqual(liveWhere('dealer-1', cfg, null));
    expect(JSON.stringify(where)).toContain(JSON.stringify(wallEligibleWhere('dealer-1')));
    expect(JSON.stringify(where)).toContain('"notIn":["f9"]');

    expect(feed.items.map((i) => i.id)).toEqual(['f3', 'f1']);
    expect(feed.items[1]).toMatchObject({ name: 'A*** Y.', location: 'Kadıköy', replied: true, pinned: false });
    expect(feed.items[1].text).toContain('[telefon gizlendi]');
    expect(JSON.stringify(feed)).not.toMatch(/Ayşe Yılmaz|Mehmet|salak|0532/);
    expect(feed.summary).toEqual({ avgRating30d: 4.3, count30d: 12, count24h: 2 });
    expect(feed.business).toBe('Kahve Durağı');
    expect(feed.feedbackQr?.url).toBe('https://qratex.test/feedback/ABC123');
    expect(feed.feedbackQr?.path.length).toBeGreaterThan(10);
  });

  it('"ad gösterme" kuralında ad hiç gönderilmez', async () => {
    mockFeedbackFindMany.mockResolvedValue([fb('f1', 'Güzel', 'Ayşe Yılmaz')]);
    const cfg = parseWallConfig({ rules: { ...DEFAULT_WALL_RULES, nameDisplay: 'none' } });
    const feed = await loadWallFeed('dealer-1', cfg, null);
    expect(feed.items[0].name).toBeNull();
  });
});

describe('moderasyon ve ekran bağlantıları', () => {
  it('başka bayinin yorumu sabitlenemez (kiracı kapsamı)', async () => {
    mockFeedbackFindFirst.mockResolvedValue(null);
    await expect(setWallStatus('dealer-1', 'yabanci', 'pinned')).rejects.toBeInstanceOf(WallError);
    expect(mockFeedbackFindFirst.mock.calls[0][0].where).toMatchObject({ id: 'yabanci', qrCode: { dealerId: 'dealer-1' } });
    expect(db.settings.upsert).not.toHaveBeenCalled();
  });

  it('gizleme yapılandırmaya yazılır ve sürüm artar', async () => {
    mockFeedbackFindFirst.mockResolvedValue({ id: 'f1' });
    await setWallStatus('dealer-1', 'f1', 'hidden');
    const cfg = parseWallConfig(settings.get(wallConfigKey('dealer-1')));
    expect(cfg.hidden).toEqual(['f1']);
    expect(cfg.version).toBe(1);
  });

  it('bağlantı: ham token saklanmaz; çözülür; iptal sonrası anında geçersiz', async () => {
    const now = new Date('2026-10-11T09:00:00Z');
    const { token, display } = await createDisplay('dealer-1', { label: 'Kasa TV', qrCodeId: null }, now);
    expect(JSON.stringify([...settings.values()])).not.toContain(token);
    expect(settings.has(wallDisplayKey(hashDisplayToken(token)))).toBe(true);

    const ok = await resolveDisplayToken(token, now);
    expect(ok).toMatchObject({ ok: true, dealerId: 'dealer-1' });

    await revokeDisplay('dealer-1', display.id, now);
    expect(await resolveDisplayToken(token, now)).toEqual({ ok: false, reason: 'invalid' });
    expect(await resolveDisplayToken('kisa', now)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('süresi dolan bağlantı reddedilir', async () => {
    const now = new Date('2026-10-11T09:00:00Z');
    const { token } = await createDisplay('dealer-1', { label: 'TV', qrCodeId: null }, now);
    const later = new Date(now.getTime() + 400 * 86_400_000);
    expect(await resolveDisplayToken(token, later)).toEqual({ ok: false, reason: 'expired' });
  });
});

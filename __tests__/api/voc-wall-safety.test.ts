/**
 * P0-35 / bayi F10: VoC duvarı (mağaza TV'si) — YENİDEN ÜRETİM.
 * "Ayşe Yılmaz" küfürlü 1★ yorum bırakır; pipeline `isToxic=true` işaretler ama duvar sorgusu
 * yalnız `isPublic` (her zaman true) ile süzdüğü için yorum TV'de TAM ADLA dönüyordu. Sahte
 * (fraudScore yüksek) ve güven-işaretli yorumlar da yayınlanıyordu; toksiklik analizi asenkron
 * olduğundan henüz denetlenmemiş yorum da `isToxic=false` görünüyordu.
 * Route gerçekten çağrılır; prisma/redis/oturum mock'lanır (gerçek DB yok).
 */
import { NextRequest } from 'next/server';

const DEALER = { user: { id: 'dealer-1', role: 'DEALER' } };
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn(async () => ({ session: DEALER })) }));
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
jest.mock('@/lib/redis', () => ({
  redisGetJson: (...a: unknown[]) => mockRedisGet(...a),
  redisSetJson: (...a: unknown[]) => mockRedisSet(...a),
}));

const mockFindMany = jest.fn();
const mockCount = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    feedback: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      count: (...a: unknown[]) => mockCount(...a),
      aggregate: jest.fn(async () => ({ _avg: { rating: 3.5 }, _count: 4 })),
      groupBy: jest.fn(async () => []),
    },
  },
  isPrismaConnectivityError: () => false,
}));

import {
  WALL_FRAUD_THRESHOLD,
  containsBlockedLanguage,
  maskCustomerName,
  toWallText,
  wallEligibleWhere,
} from '@/app/api/dealer/voc-wall/wall-policy';

beforeEach(() => {
  jest.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
  mockCount.mockResolvedValue(2);
});

describe('yayın politikası (wall-policy)', () => {
  it('yayın koşulu toksik, güven-işaretli, sahte ve denetlenmemiş yorumları dışlar (fail-closed)', () => {
    const w = wallEligibleWhere('dealer-1');
    expect(w).toMatchObject({
      qrCode: { dealerId: 'dealer-1' },
      deletedAt: null,
      isPublic: true,
      isToxic: false,
      trustFlagged: false,
    });
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

  it('açık küfür (çekimli hâller dahil) yakalanır; masum kelimeler yakalanmaz', () => {
    expect(containsBlockedLanguage('Garson tam bir SALAK')).toBe(true);
    expect(containsBlockedLanguage('siktirin gidin')).toBe(true);
    expect(containsBlockedLanguage('Kahve çok güzeldi, aqua menü de iyi')).toBe(false);
    expect(containsBlockedLanguage(null)).toBe(false);
  });

  it('metindeki e-posta, telefon ve bağlantı gizlenir; uzun metin kısaltılır', () => {
    const t = toWallText('Beni ara 0532 123 45 67 ya da ayse@ornek.com, bkz. www.kotu.example ve kotu.com.tr')!;
    expect(t).not.toMatch(/0532|ayse@|kotu/);
    expect(t).toContain('[telefon gizlendi]');
    expect(t).toContain('[e-posta gizlendi]');
    expect(t).toContain('[bağlantı gizlendi]');
    expect(toWallText('a'.repeat(400))!.length).toBeLessThanOrEqual(301);
    expect(toWallText('   ')).toBeNull();
  });
});

describe('GET /api/dealer/voc-wall', () => {
  it('duvar listesi yayın koşuluyla sorgulanır, adlar maskelenir, küfürlü metin elenir', async () => {
    mockFindMany.mockImplementation(async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
      if (!('text' in args.select)) return []; // 7 günlük trend sorgusu
      return [
        {
          id: 'f1', rating: 5, text: 'Harika kahve, tel: 0532 123 45 67', sentiment: 'positive', intent: null,
          topics: [], themes: [], createdAt: new Date(), user: { name: 'Ayşe Yılmaz', anonymizedAt: null }, qrCode: { name: 'Bahçe' },
        },
        {
          id: 'f2', rating: 1, text: 'Garson salak', sentiment: 'negative', intent: null,
          topics: [], themes: [], createdAt: new Date(), user: { name: 'Mehmet Kaya', anonymizedAt: null }, qrCode: { name: 'Salon' },
        },
        {
          id: 'f3', rating: 4, text: null, sentiment: null, intent: null,
          topics: [], themes: [], createdAt: new Date(), user: { name: 'Silinmiş Kişi', anonymizedAt: new Date() }, qrCode: null,
        },
      ];
    });
    const { GET } = await import('@/app/api/dealer/voc-wall/route');
    const res = await GET(new NextRequest('http://localhost/api/dealer/voc-wall'));
    expect(res.status).toBe(200);

    const wallQuery = mockFindMany.mock.calls.find((c) => 'text' in c[0].select)![0];
    expect(wallQuery.where).toEqual(wallEligibleWhere('dealer-1'));

    const { voc } = await res.json();
    const items = voc.recent as Array<{ id: string; userName: string; text: string | null }>;
    expect(items.map((i) => i.id)).toEqual(['f1', 'f3']);
    expect(items[0].userName).toBe('A*** Y.');
    expect(items[0].text).toContain('[telefon gizlendi]');
    expect(items[1].userName).toBe('Anonim');
    expect(JSON.stringify(voc)).not.toMatch(/Ayşe Yılmaz|Mehmet|salak/);
    // Eski (maskesiz) önbellek kayıtları servis edilmesin diye sürümlü anahtar.
    expect(mockRedisGet.mock.calls[0][0]).toMatch(/^voc-wall:v2:/);
  });
});

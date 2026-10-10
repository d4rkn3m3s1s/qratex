/**
 * P0-28 — "Yükleme hatası, ardından Kaydet canlı ayarları eziyor" senaryosunun sunucu tarafı
 * yeniden üretimi. Her ayar ucu için:
 *   - GET okuma hatasını varsayılan/boş veri olarak DÖNDÜRMEZ (500).
 *   - PUT/PATCH `baseVersion`'sız → 428, bayat sürümle → 409; ikisinde de HİÇBİR yazma/audit yok.
 *   - Doğru sürümle yazma + audit aynı transaction içinde yapılır.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
jest.mock('@/lib/rate-limit', () => ({ checkAdminRateLimit: () => ({ ok: true }) }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }));
jest.mock('@/lib/revalidate-public-theme', () => ({ revalidatePublicThemeSettings: jest.fn() }));

type Row = { id: string; key: string; value: unknown; category: string; updatedAt: Date };
const T0 = new Date('2026-10-08T10:00:00.000Z');
const db = {
  settings: new Map<string, Row>(),
  aiSettings: null as null | Record<string, unknown>,
  user: null as null | Record<string, unknown>,
  failReads: false,
};

const mockAuditCreate = jest.fn();
const mockSettingsUpdate = jest.fn();
const mockSettingsCreate = jest.fn();
const mockSettingsUpsert = jest.fn();
const mockAiUpdate = jest.fn();
const mockAiCreate = jest.fn();
const mockUserUpdate = jest.fn();

function settingsDelegate() {
  return {
    findUnique: jest.fn(async ({ where }: { where: { key: string } }) => {
      if (db.failReads) throw new Error('Neon: connection terminated');
      const r = db.settings.get(where.key);
      return r ? { ...r } : null;
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: { where: { key: string } }) => ({ ...db.settings.get(where.key)! })),
    findMany: jest.fn(async ({ where }: { where?: { key?: { in: string[] } } } = {}) => {
      if (db.failReads) throw new Error('Neon: connection terminated');
      const all = Array.from(db.settings.values());
      const keys = where?.key?.in;
      return (keys ? all.filter((r) => keys.includes(r.key)) : all).map((r) => ({ ...r }));
    }),
    update: jest.fn(async (args: { where: { key: string }; data: { value: unknown; updatedAt?: Date; category?: string } }) => {
      mockSettingsUpdate(args);
      const r = db.settings.get(args.where.key)!;
      const next = { ...r, value: args.data.value, updatedAt: args.data.updatedAt ?? new Date(), category: args.data.category ?? r.category };
      db.settings.set(r.key, next);
      return { ...next };
    }),
    create: jest.fn(async (args: { data: { key: string; value: unknown; category: string } }) => {
      mockSettingsCreate(args);
      const r = { id: `id-${args.data.key}`, ...args.data, updatedAt: new Date() };
      db.settings.set(r.key, r);
      return { ...r };
    }),
    upsert: jest.fn(async (args: unknown) => {
      mockSettingsUpsert(args);
      throw new Error('upsert beklenmiyordu');
    }),
  };
}

const prismaMock = {
  $executeRaw: jest.fn().mockResolvedValue(1),
  settings: settingsDelegate(),
  auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
  aISettings: {
    findUnique: jest.fn(async () => (db.aiSettings ? { ...db.aiSettings } : null)),
    update: jest.fn(async (args: { data: Record<string, unknown> }) => {
      mockAiUpdate(args);
      db.aiSettings = { ...db.aiSettings!, ...args.data };
      return { ...db.aiSettings };
    }),
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      mockAiCreate(args);
      db.aiSettings = { ...args.data, updatedAt: new Date() };
      return { ...db.aiSettings };
    }),
  },
  user: {
    findUnique: jest.fn(async () => (db.user ? { ...db.user } : null)),
    update: jest.fn(async (args: { data: Record<string, unknown> }) => {
      mockUserUpdate(args);
      db.user = { ...db.user!, ...args.data };
      return { ...db.user };
    }),
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
};

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
  isPrismaConnectivityError: () => false,
}));

const ADMIN = { session: { user: { id: 'admin-1', role: 'ADMIN', email: 'a@x.com' } } };
const DEALER = { session: { user: { id: 'dealer-1', role: 'DEALER', email: 'd@x.com' } } };

function req(url: string, method: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function expectNoWrites() {
  expect(mockSettingsUpdate).not.toHaveBeenCalled();
  expect(mockSettingsCreate).not.toHaveBeenCalled();
  expect(mockSettingsUpsert).not.toHaveBeenCalled();
  expect(mockAuditCreate).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  db.settings.clear();
  db.aiSettings = null;
  db.user = null;
  db.failReads = false;
  mockRequireAuth.mockResolvedValue(ADMIN);
});

describe('puan matrisi', () => {
  async function routes() {
    return import('@/app/api/admin/settings/points-matrix/route');
  }

  it('GET: DB okunamazsa 500 — varsayılan matris "canlı" gibi DÖNMEZ', async () => {
    db.failReads = true;
    const { GET } = await routes();
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.matrix).toBeUndefined();
  });

  it('GET: canlı matris + sürüm + sunucu varsayılanları', async () => {
    const { getDefaultPointsMatrix } = await import('@/lib/points-rules');
    db.settings.set('points_matrix', { id: 's1', key: 'points_matrix', value: getDefaultPointsMatrix(), category: 'gamification', updatedAt: T0 });
    const { GET } = await routes();
    const body = await (await GET()).json();
    expect(body.version).toBe(T0.toISOString());
    expect(body.defaults).toBeDefined();
    expect(body.isDefault).toBe(false);
  });

  it('PUT: baseVersion yok (yükleme hatası sonrası eski istemci) → 428, yazma yok', async () => {
    const { getDefaultPointsMatrix } = await import('@/lib/points-rules');
    db.settings.set('points_matrix', { id: 's1', key: 'points_matrix', value: { custom: true }, category: 'gamification', updatedAt: T0 });
    const { PUT } = await routes();
    const res = await PUT(req('/api/admin/settings/points-matrix', 'PUT', { matrix: getDefaultPointsMatrix() }));
    expect(res.status).toBe(428);
    expectNoWrites();
    expect(db.settings.get('points_matrix')!.value).toEqual({ custom: true });
  });

  it('PUT: bayat sürüm → 409 + güncel sürüm, yazma yok', async () => {
    const { getDefaultPointsMatrix } = await import('@/lib/points-rules');
    db.settings.set('points_matrix', { id: 's1', key: 'points_matrix', value: { custom: true }, category: 'gamification', updatedAt: T0 });
    const { PUT } = await routes();
    const res = await PUT(
      req('/api/admin/settings/points-matrix', 'PUT', { matrix: getDefaultPointsMatrix(), baseVersion: '2026-10-07T00:00:00.000Z' })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('VERSION_CONFLICT');
    expect(body.currentVersion).toBe(T0.toISOString());
    expectNoWrites();
  });

  it('PUT: doğru sürüm → yazar, audit aynı transaction, yeni sürüm döner', async () => {
    const { getDefaultPointsMatrix } = await import('@/lib/points-rules');
    db.settings.set('points_matrix', { id: 's1', key: 'points_matrix', value: getDefaultPointsMatrix(), category: 'gamification', updatedAt: T0 });
    const { PUT } = await routes();
    const res = await PUT(
      req('/api/admin/settings/points-matrix', 'PUT', { matrix: getDefaultPointsMatrix(), baseVersion: T0.toISOString() })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).not.toBe(T0.toISOString());
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(mockSettingsUpdate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0][0].data.action).toBe('UPDATE_POINTS_MATRIX');
  });
});

describe('lig ayarları', () => {
  it('PUT: eski istemcinin seyrek dizisi ([null, {...}]) → 400, tek elemanlı liste yazılamaz', async () => {
    const { PUT } = await import('@/app/api/admin/settings/leagues/route');
    const res = await PUT(
      req('/api/admin/settings/leagues', 'PUT', { rules: [null, { key: 'KOR', name: 'X', minPoints: 0, maxPoints: 1, gradient: 'g' }], baseVersion: 'none' })
    );
    expect(res.status).toBe(400);
    expectNoWrites();
  });

  it('PUT: boş liste → 400 (varsayılana sessiz sıfırlama yok)', async () => {
    const { PUT } = await import('@/app/api/admin/settings/leagues/route');
    const res = await PUT(req('/api/admin/settings/leagues', 'PUT', { rules: [], baseVersion: 'none' }));
    expect(res.status).toBe(400);
    expectNoWrites();
  });

  it('PUT: tam liste + sürüm → 200', async () => {
    const { DEFAULT_LEAGUE_RULES } = await import('@/lib/league-rules');
    const { PUT } = await import('@/app/api/admin/settings/leagues/route');
    const res = await PUT(req('/api/admin/settings/leagues', 'PUT', { rules: DEFAULT_LEAGUE_RULES, baseVersion: 'none' }));
    expect(res.status).toBe(200);
    expect(mockSettingsCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });
});

describe('keşif ayarları', () => {
  it('GET: DB hatası → 500 (boş config dönmez)', async () => {
    db.failReads = true;
    const { GET } = await import('@/app/api/admin/discovery/route');
    expect((await GET()).status).toBe(500);
  });

  it('PUT: dolu canlı config varken boş taslak "none" sürümüyle → 409', async () => {
    db.settings.set('discovery_config', {
      id: 'd1',
      key: 'discovery_config',
      value: { locations: [{ dealerId: 'x', latitude: 41, longitude: 29, categories: [] }], sponsored: [] },
      category: 'growth',
      updatedAt: T0,
    });
    const { PUT } = await import('@/app/api/admin/discovery/route');
    const res = await PUT(req('/api/admin/discovery', 'PUT', { config: { locations: [], sponsored: [] }, baseVersion: 'none' }));
    expect(res.status).toBe(409);
    expectNoWrites();
  });
});

describe('karakter kategori eşikleri', () => {
  it('runtime okuyucu: tek geçici hata 60 sn CACHE\'LENMEZ; sonraki çağrı DB\'yi yeniden okur', async () => {
    const lib = await import('@/lib/character-thresholds');
    lib.__resetCategoryThresholdsStateForTests();
    const reader = {
      settings: {
        findUnique: jest
          .fn()
          .mockRejectedValueOnce(new Error('timeout'))
          .mockResolvedValueOnce({ value: { gizemli: { threshold: 30 } } }),
      },
    };
    await expect(lib.getCategoryThresholdOverrides(reader as never)).resolves.toEqual({});
    await expect(lib.getCategoryThresholdOverrides(reader as never)).resolves.toEqual({ gizemli: { threshold: 30 } });
    expect(reader.settings.findUnique).toHaveBeenCalledTimes(2);
  });

  it('runtime okuyucu: hata anında SON GEÇERLİ değeri kullanır', async () => {
    const lib = await import('@/lib/character-thresholds');
    lib.__resetCategoryThresholdsStateForTests();
    const reader = {
      settings: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ value: { gizemli: { threshold: 30 } } })
          .mockRejectedValueOnce(new Error('timeout')),
      },
    };
    await lib.getCategoryThresholdOverrides(reader as never);
    lib.clearCategoryThresholdsCache();
    await expect(lib.getCategoryThresholdOverrides(reader as never)).resolves.toEqual({ gizemli: { threshold: 30 } });
  });

  it('admin GET: okuma hatası → 500 ("override yok" sanılmaz)', async () => {
    db.failReads = true;
    const { GET } = await import('@/app/api/admin/settings/character-thresholds/route');
    expect((await GET()).status).toBe(500);
  });

  it('admin PUT: bayat sürüm → 409', async () => {
    db.settings.set('character_category_thresholds', {
      id: 'c1',
      key: 'character_category_thresholds',
      value: { gizemli: { threshold: 30 } },
      category: 'gamification',
      updatedAt: T0,
    });
    const { PUT } = await import('@/app/api/admin/settings/character-thresholds/route');
    const res = await PUT(req('/api/admin/settings/character-thresholds', 'PUT', { overrides: {}, baseVersion: 'none' }));
    expect(res.status).toBe(409);
    expectNoWrites();
  });
});

describe('menü grupları', () => {
  it('PUT: sürümsüz → 428; doğru sürümle kısmi birleştirme GÜNCEL değer üzerinden', async () => {
    db.settings.set('sidebarNavGroups', {
      id: 'g1',
      key: 'sidebarNavGroups',
      value: { dealer: { groupLabels: { business: 'İşletme' } } },
      category: 'admin',
      updatedAt: T0,
    });
    const { PUT } = await import('@/app/api/admin/settings/sidebar-groups/route');
    expect((await PUT(req('/api/admin/settings/sidebar-groups', 'PUT', { admin: { groupLabels: {} } }))).status).toBe(428);
    expectNoWrites();

    const res = await PUT(
      // Grup kimlikleri navigasyon kaydındaki (lib/navigation/registry) gruplar olmalı.
      req('/api/admin/settings/sidebar-groups', 'PUT', { admin: { groupLabels: { ai: { tr: 'YZ', en: 'AI' } } }, baseVersion: T0.toISOString() })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payload).toEqual({ admin: { groupLabels: { ai: { tr: 'YZ', en: 'AI' } } }, dealer: { groupLabels: { business: 'İşletme' } } });
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });
});

describe('sistem ayarları (toplu)', () => {
  it('POST: yalnız değişen anahtar + bayat sürüm → 409, hiçbir anahtar yazılmaz', async () => {
    db.settings.set('enableMagicLink', { id: 'm', key: 'enableMagicLink', value: true, category: 'general', updatedAt: T0 });
    const { POST } = await import('@/app/api/admin/settings/route');
    const res = await POST(
      req('/api/admin/settings', 'POST', {
        settings: [{ key: 'enableMagicLink', value: false, category: 'general' }],
        baseVersions: { enableMagicLink: 'none' },
      })
    );
    expect(res.status).toBe(409);
    expectNoWrites();
  });

  it('GET: her girdi sürüm taşır', async () => {
    db.settings.set('siteName', { id: 's', key: 'siteName', value: 'QRateX', category: 'general', updatedAt: T0 });
    const { GET } = await import('@/app/api/admin/settings/route');
    const body = await (await GET(new NextRequest('http://localhost/api/admin/settings'))).json();
    expect(body.entries[0].version).toBe(T0.toISOString());
  });

  it('POST: sürüm göndermeyen eski istemci (tema/ajan) çalışmaya devam eder', async () => {
    const { POST } = await import('@/app/api/admin/settings/route');
    const res = await POST(req('/api/admin/settings', 'POST', { settings: [{ key: 'agentWeights', value: { a: 1 } }] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versions.agentWeights).toBeDefined();
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });
});

describe('bayi AI ayarları', () => {
  beforeEach(() => mockRequireAuth.mockResolvedValue(DEALER));

  it('PATCH: sürümsüz → 428, özel prompt silinmez', async () => {
    db.aiSettings = { dealerId: 'dealer-1', customPrompt: 'Samimi ol', isEnabled: false, updatedAt: T0 };
    const { PATCH } = await import('@/app/api/dealer/ai-settings/route');
    const res = await PATCH(req('/api/dealer/ai-settings', 'PATCH', { isEnabled: true, customPrompt: null }));
    expect(res.status).toBe(428);
    expect(mockAiUpdate).not.toHaveBeenCalled();
    expect(db.aiSettings!.customPrompt).toBe('Samimi ol');
  });

  it('PATCH: kayıt varken "none" (yükleme hatası varsayılanı) → 409', async () => {
    db.aiSettings = { dealerId: 'dealer-1', customPrompt: 'Samimi ol', isEnabled: false, updatedAt: T0 };
    const { PATCH } = await import('@/app/api/dealer/ai-settings/route');
    const res = await PATCH(req('/api/dealer/ai-settings', 'PATCH', { isEnabled: true, baseVersion: 'none' }));
    expect(res.status).toBe(409);
    expect(mockAiUpdate).not.toHaveBeenCalled();
  });

  it('PATCH: doğru sürüm → yalnız gönderilen alan güncellenir', async () => {
    db.aiSettings = { dealerId: 'dealer-1', customPrompt: 'Samimi ol', isEnabled: false, updatedAt: T0 };
    const { PATCH } = await import('@/app/api/dealer/ai-settings/route');
    const res = await PATCH(req('/api/dealer/ai-settings', 'PATCH', { isEnabled: true, baseVersion: T0.toISOString() }));
    expect(res.status).toBe(200);
    expect(mockAiUpdate.mock.calls[0][0].data).toMatchObject({ isEnabled: true });
    expect(mockAiUpdate.mock.calls[0][0].data.customPrompt).toBeUndefined();
    expect(db.aiSettings!.customPrompt).toBe('Samimi ol');
  });
});

describe('bayi işletme profili', () => {
  const PROFILE = {
    id: 'dealer-1',
    name: 'Bayi',
    email: 'd@x.com',
    image: null,
    phone: '+90 532 000 0000',
    role: 'DEALER',
    businessName: 'Kafe Moda',
    businessDesc: 'Açıklama',
    address: 'Moda',
    latitude: 40.98,
    longitude: 29.03,
    businessHours: null,
    defaultReplyTemplate: null,
    preferredLanguage: 'tr',
    holidayMode: false,
    points: 0,
    level: 1,
    createdAt: T0,
    password: 'hash',
    _count: { feedbacks: 0, badges: 0, quests: 0 },
  };

  beforeEach(() => {
    mockRequireAuth.mockResolvedValue(DEALER);
    db.user = { ...PROFILE };
  });

  it('GET sürüm döndürür; puan değişimi sürümü DEĞİŞTİRMEZ (sahte çakışma yok)', async () => {
    const { GET } = await import('@/app/api/user/profile/route');
    const v1 = (await (await GET(new NextRequest('http://localhost/api/user/profile'))).json()).version;
    db.user = { ...db.user, points: 500 };
    const v2 = (await (await GET(new NextRequest('http://localhost/api/user/profile'))).json()).version;
    expect(v1).toMatch(/^h:/);
    expect(v2).toBe(v1);
  });

  it('PATCH: bayat sürüm → 409, işletme adı/konum null ile ezilmez', async () => {
    const { PATCH } = await import('@/app/api/user/profile/route');
    const res = await PATCH(req('/api/user/profile', 'PATCH', { businessName: null, address: null, baseVersion: 'h:eski' }));
    expect(res.status).toBe(409);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(db.user!.businessName).toBe('Kafe Moda');
  });

  it('PATCH: doğru sürüm → güncellenir ve yeni sürüm döner', async () => {
    const { GET, PATCH } = await import('@/app/api/user/profile/route');
    const v1 = (await (await GET(new NextRequest('http://localhost/api/user/profile'))).json()).version;
    const res = await PATCH(req('/api/user/profile', 'PATCH', { holidayMode: true, baseVersion: v1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).not.toBe(v1);
    expect(mockUserUpdate.mock.calls[0][0].data).toEqual({ holidayMode: true });
  });

  it('PATCH: sürüm göndermeyen eski istemciler (müşteri ayarları, dil seçici) etkilenmez', async () => {
    const { PATCH } = await import('@/app/api/user/profile/route');
    const res = await PATCH(req('/api/user/profile', 'PATCH', { preferredLanguage: 'en' }));
    expect(res.status).toBe(200);
  });
});

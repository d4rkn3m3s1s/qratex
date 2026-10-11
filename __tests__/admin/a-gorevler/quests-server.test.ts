/**
 * Admin → Görev Yönetimi (Dalga 2) sunucu mantığı — prisma mock'lu.
 *  - Sözleşme: dönem/mekanik kuralları, İstanbul duvar saati dönüşümü, durum türetme.
 *  - Oluşturma: küçük harfli dönem + motorlu mekanik yazılır, taslak = duraklatılmış; geçmiş bitiş
 *    ve işletmesiz kategori reddedilir; denetim yazılır.
 *  - Düzenleme: sürüm çakışması 409; katılımlı görevde mekanik kilitli; yalnız gönderilen alanlar.
 *  - Geçişler: koşullu yazım (tekrar duraklatma 409), süresi dolan yayına alınamaz, kopya duraklatılmış.
 *  - Elle tamamlama: yalnız yönetici onaylı görevde; puan BASMAZ (yalnız completedAt), dönemde tekrar 409.
 *  - Başarımlar: yalnız eksikler, duraklatılmış oluşturulur.
 */
jest.mock('@prisma/client', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    join: (v: unknown[]) => v,
    empty: { strings: [''], values: [] },
  },
}));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: jest.fn(async () => ({ quests: false })) }));
const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));

type Row = Record<string, unknown>;
const quests = new Map<string, Row>();
const userQuests: Row[] = [];
const audits: Row[] = [];
const notifications: Row[] = [];
const users: Row[] = [];
let dealerCount = 0;
let seq = 0;

function matchWhere(row: Row, where: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'id' && typeof v === 'object' && v && 'in' in (v as Row)) {
      if (!((v as { in: string[] }).in.includes(row.id as string))) return false;
      continue;
    }
    if (k === 'OR') {
      if (!(v as Row[]).some((w) => matchWhere(row, w))) return false;
      continue;
    }
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as Row;
      if ('not' in o && o.not === null) {
        if (row[k] == null) return false;
        continue;
      }
      if ('gt' in o) {
        if (!(row[k] instanceof Date) || (row[k] as Date).getTime() <= (o.gt as Date).getTime()) return false;
        continue;
      }
      continue;
    }
    if (v instanceof Date) {
      if (!(row[k] instanceof Date) || (row[k] as Date).getTime() !== v.getTime()) return false;
      continue;
    }
    if ((row[k] ?? null) !== v) return false;
  }
  return true;
}

const db = {
  $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(db)),
  $queryRaw: jest.fn(async () => []),
  quest: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (quests.has(where.id) ? { ...quests.get(where.id)! } : null)),
    findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => ({ ...quests.get(where.id)! })),
    findMany: jest.fn(async ({ where }: { where: Row }) => [...quests.values()].filter((q) => matchWhere(q, where)).map((q) => ({ id: q.id }))),
    count: jest.fn(async () => 0),
    create: jest.fn(async ({ data }: { data: Row }) => {
      const now = new Date('2026-10-11T09:00:00.000Z');
      const row = { id: `q${++seq}`, archivedAt: null, expiresAt: null, createdAt: now, updatedAt: now, ...data };
      quests.set(row.id as string, row);
      return { ...row };
    }),
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      for (const d of data) quests.set(d.id as string, { createdAt: new Date(), updatedAt: new Date(), archivedAt: null, expiresAt: null, ...d });
      return { count: data.length };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const q = quests.get(where.id as string);
      if (!q || !matchWhere(q, where)) return { count: 0 };
      Object.assign(q, data, { updatedAt: new Date(new Date(q.updatedAt as Date).getTime() + 1000) });
      return { count: 1 };
    }),
  },
  userQuest: {
    count: jest.fn(async ({ where }: { where: { questId: string } }) => userQuests.filter((u) => u.questId === where.questId).length),
    findUnique: jest.fn(async ({ where }: { where: { userId_questId: { userId: string; questId: string } } }) => {
      const r = userQuests.find((u) => u.userId === where.userId_questId.userId && u.questId === where.userId_questId.questId);
      return r ? { ...r } : null;
    }),
    create: jest.fn(async ({ data }: { data: Row }) => {
      const r = { id: `uq${++seq}`, rewardedAt: null, ...data };
      userQuests.push(r);
      return r;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const r = userQuests.find((u) => u.id === where.id);
      if (!r || (where.completedAt !== undefined && (r.completedAt as Date | null)?.getTime?.() !== (where.completedAt as Date | null)?.getTime?.())) return { count: 0 };
      Object.assign(r, data);
      return { count: 1 };
    }),
    groupBy: jest.fn(async () => []),
  },
  user: {
    count: jest.fn(async () => dealerCount),
    groupBy: jest.fn(async () => []),
    findFirst: jest.fn(async ({ where }: { where: Row }) => {
      const key = (where.email as { equals?: string } | undefined)?.equals ?? where.id;
      return users.find((u) => u.email === key || u.id === key) ?? null;
    }),
  },
  auditLog: { create: jest.fn(async ({ data }: { data: Row }) => audits.push(data)) },
  notification: { create: jest.fn(async ({ data }: { data: Row }) => notifications.push(data)) },
  settings: { findUnique: jest.fn(async () => null) },
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import {
  deriveQuestStatus,
  isoToIstanbulWall,
  istanbulWallToIso,
  normalizeCadence,
  questCreateSchema,
  questListQuerySchema,
} from '@/lib/admin-quests/contract';
import { addMissingAchievements, applyQuestAction, createQuest, getQuestStats, toListItem, updateQuest } from '@/lib/admin-quests/server';
import { getDefaultPointsMatrix } from '@/lib/points-rules';

const actor = { userId: 'admin1', ipAddress: null, userAgent: null };
const NOW = new Date('2026-10-11T09:00:00.000Z');

function seedQuest(over: Row = {}): Row {
  const row: Row = {
    id: `q${++seq}`,
    name: 'Görev',
    description: 'Açıklama metni',
    icon: '🎯',
    type: 'weekly',
    requirement: { type: 'give_feedback', count: 3 },
    reward: { points: 50, xp: 25 },
    isActive: true,
    expiresAt: null,
    archivedAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-05T00:00:00Z'),
    ...over,
  };
  quests.set(row.id as string, row);
  return row;
}

beforeEach(() => {
  quests.clear();
  userQuests.length = 0;
  audits.length = 0;
  notifications.length = 0;
  users.length = 0;
  dealerCount = 0;
  jest.clearAllMocks();
});

describe('sözleşme', () => {
  it('İstanbul duvar saati ↔ ISO', () => {
    expect(istanbulWallToIso('2026-10-10T23:59')).toBe('2026-10-10T20:59:00.000Z');
    expect(isoToIstanbulWall('2026-10-10T20:59:00.000Z')).toBe('2026-10-10T23:59');
    expect(istanbulWallToIso('10.10.2026')).toBeNull();
  });

  it('dönem normalize: eski büyük harf ve bilinmeyen → tek seferlik', () => {
    expect(normalizeCadence('WEEKLY')).toBe('weekly');
    expect(normalizeCadence('SPECIAL')).toBe('special');
    expect(normalizeCadence('mystery')).toBe('special');
  });

  it('durum türetme: arşiv > süresi doldu > duraklatıldı > yayında', () => {
    expect(deriveQuestStatus({ isActive: true, archivedAt: null, expiresAt: null }, NOW)).toBe('active');
    expect(deriveQuestStatus({ isActive: false, archivedAt: null, expiresAt: null }, NOW)).toBe('paused');
    expect(deriveQuestStatus({ isActive: true, archivedAt: null, expiresAt: new Date('2026-10-01') }, NOW)).toBe('expired');
    expect(deriveQuestStatus({ isActive: true, archivedAt: new Date(), expiresAt: null }, NOW)).toBe('archived');
  });

  it('ziyaret görevi yalnız tek seferlik; ödülsüz görev reddedilir', () => {
    const base = { name: 'Kafe', description: 'Üç kafe gez', icon: '☕', mechanic: 'visit_category', target: 3, points: 10, xp: 0, expiresAt: null };
    expect(questCreateSchema.safeParse({ ...base, cadence: 'weekly' }).success).toBe(false);
    expect(questCreateSchema.safeParse({ ...base, cadence: 'special' }).success).toBe(true);
    expect(questCreateSchema.safeParse({ ...base, cadence: 'special', points: 0 }).success).toBe(false);
  });

  it('liste sorgusu bozuk değerleri düzeltir', () => {
    const q = questListQuerySchema.parse({ status: 'bogus', page: '-3', size: '9999', mechanic: 'x' });
    expect(q).toMatchObject({ status: 'active', page: 1, size: 20, mechanic: undefined });
  });
});

describe('createQuest', () => {
  const input = {
    name: 'Haftanın Eleştirmeni',
    description: 'Bu hafta 3 yorum yap',
    icon: '📝',
    cadence: 'weekly' as const,
    mechanic: 'give_feedback' as const,
    target: 3,
    category: null,
    minLength: null,
    points: 60,
    xp: 30,
    expiresAt: null,
    publish: false,
  };

  it('taslak duraklatılmış oluşur, motorlu mekanik ve küçük harfli dönem yazılır, denetlenir', async () => {
    const r = await createQuest(input, actor, NOW);
    expect(r.status).toBe('paused');
    const row = quests.get(r.id)!;
    expect(row).toMatchObject({ type: 'weekly', isActive: false, requirement: { type: 'give_feedback', count: 3 }, reward: { points: 60, xp: 30 } });
    expect(audits[0]).toMatchObject({ action: 'CREATE_QUEST', entity: 'Quest', entityId: r.id });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('geçmiş bitiş reddedilir', async () => {
    await expect(createQuest({ ...input, expiresAt: '2026-10-11T08:00:00.000Z' }, actor, NOW)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('işletmesi olmayan kategori reddedilir', async () => {
    dealerCount = 0;
    await expect(
      createQuest({ ...input, mechanic: 'visit_category', cadence: 'special', category: 'kafee' }, actor, NOW)
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    dealerCount = 4;
    const r = await createQuest({ ...input, mechanic: 'visit_category', cadence: 'special', category: 'cafe', publish: true }, actor, NOW);
    expect(quests.get(r.id)!.requirement).toEqual({ type: 'visit_category', count: 3, category: 'cafe' });
    expect(r.status).toBe('active');
  });
});

describe('updateQuest', () => {
  it('sürüm çakışması 409', async () => {
    const q = seedQuest();
    await expect(updateQuest(q.id as string, { baseUpdatedAt: '2026-10-04T00:00:00.000Z', name: 'Yeni ad' }, actor, NOW)).rejects.toMatchObject({ status: 409 });
  });

  it('katılımlı görevde mekanik değişikliği kilitli; ödül değişikliği serbest ve yalnız gönderilen alan yazılır', async () => {
    const q = seedQuest({ expiresAt: new Date('2026-12-01T00:00:00Z') });
    userQuests.push({ id: 'uqx', questId: q.id, userId: 'u1', progress: 1, completedAt: null, rewardedAt: null });
    await expect(
      updateQuest(q.id as string, { baseUpdatedAt: (q.updatedAt as Date).toISOString(), mechanic: 'referral' }, actor, NOW)
    ).rejects.toMatchObject({ code: 'QUEST_LOCKED', status: 409 });

    await updateQuest(q.id as string, { baseUpdatedAt: (q.updatedAt as Date).toISOString(), points: 80, mechanic: 'give_feedback', cadence: 'weekly' }, actor, NOW);
    const row = quests.get(q.id as string)!;
    expect(row.reward).toEqual({ points: 80, xp: 25 });
    expect(row.expiresAt).toEqual(new Date('2026-12-01T00:00:00Z')); // gönderilmedi → korunur
    expect(row.isActive).toBe(true);
    expect(audits.at(-1)).toMatchObject({ action: 'UPDATE_QUEST' });
  });

  it('başarımda mekanik/hedef değiştirilemez', async () => {
    const q = seedQuest({ id: 'quest-gift-master', type: 'SPECIAL', requirement: { count: 1 } });
    quests.set('quest-gift-master', q);
    await expect(updateQuest('quest-gift-master', { baseUpdatedAt: (q.updatedAt as Date).toISOString(), target: 5 }, actor, NOW)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('applyQuestAction', () => {
  it('duraklat koşullu: ikinci kez 409', async () => {
    const q = seedQuest();
    const r = await applyQuestAction(q.id as string, { action: 'pause' }, actor, NOW);
    expect(r.status).toBe('paused');
    await expect(applyQuestAction(q.id as string, { action: 'pause' }, actor, NOW)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('süresi dolan görev yayına alınamaz', async () => {
    const q = seedQuest({ isActive: false, expiresAt: new Date('2026-10-01T00:00:00Z') });
    await expect(applyQuestAction(q.id as string, { action: 'resume' }, actor, NOW)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('arşiv silmez, gerekçeyi denetler; kopya duraklatılmış oluşur', async () => {
    const q = seedQuest();
    await applyQuestAction(q.id as string, { action: 'archive', reason: 'Dönem bitti' }, actor, NOW);
    expect(quests.get(q.id as string)).toMatchObject({ isActive: false, archivedAt: NOW });
    expect(audits.at(-1)).toMatchObject({ action: 'QUEST_ARCHIVE', newData: expect.objectContaining({ reason: 'Dönem bitti' }) });
    const d = await applyQuestAction(q.id as string, { action: 'duplicate' }, actor, NOW);
    expect(quests.get(d.createdId!)).toMatchObject({ isActive: false, name: 'Görev (kopya)', type: 'weekly' });
  });

  it('elle tamamlama: yalnız yönetici onaylı görev, puan basmaz, dönemde ikinci işaretleme 409', async () => {
    const live = seedQuest();
    users.push({ id: 'c1', email: 'ali@example.com', name: 'Ali', role: 'CUSTOMER' });
    await expect(applyQuestAction(live.id as string, { action: 'manual_complete', user: 'ali@example.com', reason: 'Etkinlik' }, actor, NOW)).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const manual = seedQuest({ type: 'special', requirement: { type: 'custom', count: 1 } });
    await applyQuestAction(manual.id as string, { action: 'manual_complete', user: 'ali@example.com', reason: 'Etkinlik' }, actor, NOW);
    expect(userQuests[0]).toMatchObject({ userId: 'c1', questId: manual.id, progress: 1, completedAt: NOW, rewardedAt: null });
    expect(notifications).toHaveLength(1);
    expect(mockMint).not.toHaveBeenCalled();
    await expect(applyQuestAction(manual.id as string, { action: 'manual_complete', user: 'c1', reason: 'Tekrar' }, actor, NOW)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('elle tamamlama müşteri olmayan hesabı reddeder', async () => {
    const manual = seedQuest({ requirement: { type: 'custom', count: 1 } });
    users.push({ id: 'd1', email: 'bayi@example.com', name: 'Bayi', role: 'DEALER' });
    await expect(applyQuestAction(manual.id as string, { action: 'manual_complete', user: 'bayi@example.com', reason: 'Deneme' }, actor, NOW)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('okuma', () => {
  it('uyarılar: tanınmayan mekanik ve eşleşmeyen kategori', () => {
    const m = getDefaultPointsMatrix();
    const metrics = { participants: 0, completed: 0, rewardedUsers: 0, payouts30d: 0, points30d: 0, xp30d: 0, lastPayoutAt: null };
    const unknown = toListItem(seedQuest({ requirement: { type: 'share_story', count: 1 } }) as never, metrics, new Map(), m, NOW);
    expect(unknown.mechanic).toBe('custom');
    expect(unknown.warnings).toContain('unknown_mechanic');
    const cat = toListItem(seedQuest({ type: 'special', requirement: { type: 'visit_category', count: 2, category: 'kafee' } }) as never, metrics, new Map([['cafe', 3]]), m, NOW);
    expect(cat.warnings).toContain('category_no_match');
    expect(cat.categoryDealers).toBe(0);
  });

  it('KPI: modül kapalı görünür, defter toplamları okunur (hata yutulmaz)', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ payouts: 3, points: 150, xp: 75 }] as never).mockResolvedValueOnce([{ payouts: 9, points: 450, xp: 200 }] as never).mockResolvedValueOnce([] as never);
    const s = await getQuestStats(NOW, db as never);
    expect(s.moduleEnabled).toBe(false);
    expect(s.rewards7d).toEqual({ payouts: 3, points: 150, xp: 75 });
    expect(s.rewards30d.points).toBe(450);
    expect(s.dailyPoints14d).toHaveLength(14);

    db.$queryRaw.mockRejectedValueOnce(new Error('db down'));
    await expect(getQuestStats(NOW, db as never)).rejects.toThrow('db down');
  });

  it('eksik başarımlar yalnız eksik olanlarla, duraklatılmış oluşturulur', async () => {
    seedQuest({ id: 'quest-gift-master' });
    quests.set('quest-gift-master', { ...quests.get([...quests.keys()][0])!, id: 'quest-gift-master' });
    const r = await addMissingAchievements(actor, db as never);
    expect(r.ids).not.toContain('quest-gift-master');
    expect(r.created).toBe(3);
    expect(quests.get('quest-color-wizard')).toMatchObject({ isActive: false, type: 'special' });
  });
});

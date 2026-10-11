/**
 * Admin → Kullanıcılar (Dalga 2) sunucu mantığı — prisma mock'lu.
 *  - Sözleşme: CSV formül enjeksiyonu nötrlenir, sıralama izin listesiyle, düzeltme şeması tavanlı.
 *  - Liste: STAFF filtrelenebilir, varsayılan anonimleri gizler.
 *  - Rol: kendine yok, son yönetici korunur, ADMIN'e yükseltme talep → başka yönetici onayı.
 *  - Askıya alma: yönetici askıya alınamaz, oturumlar düşer.
 *  - Ödül: pasif/stoksuz ödül verilmez, stok koşullu düşer.
 *  - Rozet geri alma: vitrindeki karakter rozeti temizlenir, denetime yazılır.
 */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
const mockInvalidate = jest.fn(async () => undefined);
jest.mock('@/lib/auth/session-state', () => ({ invalidateSessionState: (id: string) => mockInvalidate(id) }));
jest.mock('@/lib/gdpr-core', () => ({ anonymizeUser: jest.fn() }));
jest.mock('@/lib/data-safety/user-erasure', () => ({ previewUserErasure: jest.fn() }));
jest.mock('@/lib/badges/award', () => ({ awardBadgeInTx: jest.fn(), AWARD_BADGE_REJECT_MESSAGES: {} }));
jest.mock('@/lib/economy', () => ({ adjustPointsByAdmin: jest.fn(), isEconomyError: () => false }));
jest.mock('@/lib/request-metadata', () => ({ getAuditRequestMeta: () => ({ ipAddress: null, userAgent: null }), getClientIp: () => null }));

type Row = Record<string, unknown>;
const users = new Map<string, Row>();
const audits: Row[] = [];
const notifications: Row[] = [];
let reward: Row | null = null;
const userBadges = new Map<string, Row>();
const staffUpdates: Row[] = [];

function matchUser(u: Row, where: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'id' && v !== u.id) return false;
    if (k === 'role') {
      if (typeof v === 'object' && v && 'not' in (v as Row)) {
        if (u.role === (v as Row).not) return false;
      } else if (u.role !== v) return false;
    }
    if (k === 'suspendedAt') {
      if (v === null && u.suspendedAt) return false;
      if (typeof v === 'object' && v && 'not' in (v as Row) && !u.suspendedAt) return false;
    }
    if (k === 'anonymizedAt' && v === null && u.anonymizedAt) return false;
    if (k === 'featuredCharacterBadgeId' && u.featuredCharacterBadgeId !== v) return false;
  }
  return true;
}

const tx = {
  user: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const u = users.get(where.id);
      return u ? { ...u } : null;
    }),
    count: jest.fn(async ({ where }: { where: Row }) => [...users.values()].filter((u) => matchUser(u, where)).length),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (const u of users.values()) {
        if (!matchUser(u, where)) continue;
        for (const [k, v] of Object.entries(data)) {
          if (k === 'sessionVersion') u.sessionVersion = Number(u.sessionVersion ?? 0) + 1;
          else u[k] = v;
        }
        count++;
      }
      return { count };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      const u = users.get(where.id)!;
      for (const [k, v] of Object.entries(data)) {
        if (k === 'sessionVersion') u.sessionVersion = Number(u.sessionVersion ?? 0) + 1;
        else u[k] = v;
      }
      return { ...u };
    }),
  },
  auditLog: {
    create: jest.fn(async ({ data }: { data: Row }) => {
      const row = { id: `a${audits.length + 1}`, createdAt: new Date(Date.now() + audits.length), ...data };
      audits.push(row);
      return row;
    }),
    findFirst: jest.fn(async ({ where }: { where: Row }) => {
      const actions = (where.action as Row)?.in as string[] | undefined;
      const list = audits
        .filter((a) => (actions ? actions.includes(String(a.action)) : a.action === where.action) && a.entityId === where.entityId)
        .filter((a) => !(where.createdAt as Row)?.gte || (a.createdAt as Date) >= ((where.createdAt as Row).gte as Date))
        .sort((x, y) => (y.createdAt as Date).getTime() - (x.createdAt as Date).getTime());
      return list[0] ?? null;
    }),
  },
  dealerStaff: { updateMany: jest.fn(async (a: Row) => (staffUpdates.push(a), { count: 1 })) },
  notification: { create: jest.fn(async ({ data }: { data: Row }) => (notifications.push(data), { id: 'n1', createdAt: new Date() })) },
  reward: {
    findUnique: jest.fn(async () => (reward ? { ...reward } : null)),
    updateMany: jest.fn(async () => {
      if (!reward || Number(reward.stock) <= 0) return { count: 0 };
      reward.stock = Number(reward.stock) - 1;
      return { count: 1 };
    }),
  },
  userReward: { create: jest.fn(async () => ({ id: 'ur1' })) },
  userBadge: {
    findUnique: jest.fn(async ({ where }: { where: { userId_badgeId: { userId: string; badgeId: string } } }) =>
      userBadges.get(`${where.userId_badgeId.userId}:${where.userId_badgeId.badgeId}`) ?? null
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      for (const [k, v] of userBadges) if (v.id === where.id) userBadges.delete(k);
      return {};
    }),
  },
};

jest.mock('@/lib/prisma', () => ({
  prisma: { ...tx, $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
  isPrismaConnectivityError: () => false,
}));

import { csvCell, csvLine, parseListSort, listQuerySchema, adjustPointsSchema } from '@/lib/admin-users/contract';
import { buildUserWhere } from '@/lib/admin-users/list.server';
import {
  changeRole,
  checkRoleChange,
  decideElevation,
  grantReward,
  revokeBadge,
  setSuspension,
  type ActionCtx,
} from '@/lib/admin-users/actions.server';

const ctx = (id: string): ActionCtx => ({ actor: { id, email: `${id}@x.com`, role: 'ADMIN', name: id, type: 'user' }, request: null });

function seed() {
  users.clear();
  audits.length = 0;
  notifications.length = 0;
  staffUpdates.length = 0;
  userBadges.clear();
  reward = null;
  mockInvalidate.mockClear();
  const base = { suspendedAt: null, anonymizedAt: null, sessionVersion: 0, name: null };
  users.set('admin1', { ...base, id: 'admin1', role: 'ADMIN', email: 'admin1@x.com' });
  users.set('admin2', { ...base, id: 'admin2', role: 'ADMIN', email: 'admin2@x.com' });
  users.set('c1', { ...base, id: 'c1', role: 'CUSTOMER', email: 'c1@x.com' });
  users.set('s1', { ...base, id: 's1', role: 'STAFF', email: 's1@x.com' });
}

beforeEach(seed);

describe('sözleşme', () => {
  it('CSV formül enjeksiyonu nötrlenir ve tırnaklanır', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+90 555')).toBe("'+90 555");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('Ayşe, Yılmaz')).toBe('"Ayşe, Yılmaz"');
    expect(csvLine([1, null, 'a'])).toBe('1,,a');
  });

  it('sıralama yalnız izin listesinden; bilinmeyen alan varsayılana düşer', () => {
    expect(parseListSort('points.asc')).toEqual({ id: 'points', desc: false });
    expect(parseListSort('password.desc')).toEqual({ id: 'createdAt', desc: true });
  });

  it('liste sorgusu STAFF rolünü kabul eder, geçersiz sayfa boyutunu reddeder', () => {
    expect(listQuerySchema.parse({ role: 'STAFF' }).role).toBe('STAFF');
    expect(listQuerySchema.safeParse({ size: '7' }).success).toBe(false);
    expect(listQuerySchema.parse({}).size).toBe(20);
  });

  it('düzeltme şeması: ondalık, sıfır, 100.000 üstü ve puan düşerken XP reddedilir', () => {
    const base = { reasonCode: 'support', note: 'Destek talebi #12' };
    expect(adjustPointsSchema.safeParse({ ...base, delta: 1.5 }).success).toBe(false);
    expect(adjustPointsSchema.safeParse({ ...base, delta: 0 }).success).toBe(false);
    expect(adjustPointsSchema.safeParse({ ...base, delta: 100_001 }).success).toBe(false);
    expect(adjustPointsSchema.safeParse({ ...base, delta: -10, xp: 5 }).success).toBe(false);
    expect(adjustPointsSchema.safeParse({ ...base, delta: 0, xp: 50 }).success).toBe(true);
    expect(adjustPointsSchema.safeParse({ reasonCode: 'support', note: 'kı', delta: 5 }).success).toBe(false);
  });
});

describe('liste filtresi', () => {
  it('varsayılan anonimleştirilmiş hesapları gizler; STAFF + askıda birleşir', () => {
    expect(buildUserWhere({})).toEqual({ anonymizedAt: null });
    expect(buildUserWhere({ role: 'STAFF', status: 'suspended' })).toEqual({
      AND: [{ role: 'STAFF' }, { anonymizedAt: null, suspendedAt: { not: null } }],
    });
  });

  it('tek harfli arama yok sayılır, iki harfte ad/e-posta/işletme/kimlik aranır', () => {
    expect(buildUserWhere({ q: 'a' })).toEqual({ anonymizedAt: null });
    const w = buildUserWhere({ q: 'ay' }) as { AND: Array<{ OR?: unknown[] }> };
    expect(w.AND[0].OR).toHaveLength(4);
  });
});

describe('rol değişikliği', () => {
  it('kendine rol yok, aynı rol çakışma, son yönetici korunur', () => {
    const t = { id: 'admin1', role: 'ADMIN', anonymizedAt: null };
    expect(() => checkRoleChange({ actorId: 'admin1', target: t, newRole: 'CUSTOMER', activeAdminCount: 2 })).toThrow('Kendi rolünüzü');
    expect(() => checkRoleChange({ actorId: 'admin2', target: { ...t, role: 'CUSTOMER' }, newRole: 'CUSTOMER', activeAdminCount: 2 })).toThrow('zaten');
    expect(() => checkRoleChange({ actorId: 'admin2', target: t, newRole: 'DEALER', activeAdminCount: 1 })).toThrow('son etkin yönetici');
  });

  it('düşürme: oturum sürümü artar, önbellek bayatlar, denetime yazılır', async () => {
    const r = await changeRole(ctx('admin1'), 'c1', { role: 'DEALER', reason: 'Bayi başvurusu onaylandı' });
    expect(r.status).toBe('changed');
    expect(users.get('c1')!.role).toBe('DEALER');
    expect(users.get('c1')!.sessionVersion).toBe(1);
    expect(mockInvalidate).toHaveBeenCalledWith('c1');
    expect(audits.some((a) => a.action === 'USER_ROLE_CHANGE')).toBe(true);
  });

  it('STAFF başka role geçince personel kaydı silinmez, pasifleşir', async () => {
    await changeRole(ctx('admin1'), 's1', { role: 'CUSTOMER', reason: 'İşletmeden ayrıldı' });
    expect(staffUpdates[0]).toMatchObject({ where: { userId: 's1' }, data: { isActive: false } });
  });

  it('ADMIN yükseltmesi: e-posta onayı ister, talep olarak kaydedilir, rol DEĞİŞMEZ', async () => {
    await expect(changeRole(ctx('admin1'), 'c1', { role: 'ADMIN', reason: 'Destek ekibine katıldı' })).rejects.toThrow('e-posta');
    const r = await changeRole(ctx('admin1'), 'c1', { role: 'ADMIN', reason: 'Destek ekibine katıldı', confirmPhrase: 'C1@x.com' });
    expect(r.status).toBe('pending_approval');
    expect(users.get('c1')!.role).toBe('CUSTOMER');
    await expect(changeRole(ctx('admin1'), 'c1', { role: 'ADMIN', reason: 'tekrar talep', confirmPhrase: 'c1@x.com' })).rejects.toThrow('bekleyen');
  });

  it('dört göz: talep eden onaylayamaz; başka yönetici onaylayınca rol ADMIN olur', async () => {
    const r = await changeRole(ctx('admin1'), 'c1', { role: 'ADMIN', reason: 'Destek ekibine katıldı', confirmPhrase: 'c1@x.com' });
    await expect(decideElevation(ctx('admin1'), 'c1', { requestId: r.requestId!, decision: 'approve' })).rejects.toThrow('kendi talebini');
    const ok = await decideElevation(ctx('admin2'), 'c1', { requestId: r.requestId!, decision: 'approve' });
    expect(ok.role).toBe('ADMIN');
    expect(users.get('c1')!.role).toBe('ADMIN');
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['ROLE_ELEVATION_REQUESTED', 'USER_ROLE_CHANGE', 'ROLE_ELEVATION_APPROVED']));
  });
});

describe('askıya alma', () => {
  it('yönetici askıya alınamaz; müşteri askıya alınınca oturumları düşer', async () => {
    await expect(setSuspension(ctx('admin1'), 'admin2', { action: 'suspend', reason: 'test' })).rejects.toThrow('Yönetici');
    await setSuspension(ctx('admin1'), 'c1', { action: 'suspend', reason: 'Sahte yorum şüphesi' });
    expect(users.get('c1')!.suspendedAt).toBeInstanceOf(Date);
    expect(users.get('c1')!.sessionVersion).toBe(1);
    expect(mockInvalidate).toHaveBeenCalledWith('c1');
    await expect(setSuspension(ctx('admin1'), 'c1', { action: 'suspend', reason: 'tekrar' })).rejects.toThrow('zaten askıda');
  });

  it('kendi hesabını askıya alamaz', async () => {
    await expect(setSuspension(ctx('c1'), 'c1', { action: 'suspend', reason: 'kendim' })).rejects.toThrow('Kendi');
  });
});

describe('ödül ve rozet', () => {
  it('pasif ödül verilmez; stok bitince ikinci hediye reddedilir', async () => {
    reward = { id: 'r1', name: 'Kahve', type: 'physical', stock: 1, isActive: false, archivedAt: null };
    await expect(grantReward(ctx('admin1'), 'c1', { rewardId: 'r1' })).rejects.toThrow('etkin değil');
    reward = { id: 'r1', name: 'Kahve', type: 'physical', stock: 1, isActive: true, archivedAt: null };
    await grantReward(ctx('admin1'), 'c1', { rewardId: 'r1' });
    expect(reward.stock).toBe(0);
    await expect(grantReward(ctx('admin1'), 'c1', { rewardId: 'r1' })).rejects.toThrow('tükendi');
    expect(audits.filter((a) => a.action === 'grant_reward')).toHaveLength(1);
    // Kod bildirim gövdesine yazılmaz.
    expect(JSON.stringify(notifications)).not.toMatch(/GIFT-/);
  });

  it('rozet geri alma: vitrindeki karakter rozeti temizlenir ve denetime yazılır', async () => {
    users.get('c1')!.featuredCharacterBadgeId = 'b1';
    userBadges.set('c1:b1', { id: 'ub1', earnedAt: new Date(), badge: { name: 'Gurme' } });
    await revokeBadge(ctx('admin1'), 'c1', { badgeId: 'b1', reason: 'Yanlışlıkla verildi' });
    expect(userBadges.size).toBe(0);
    expect(users.get('c1')!.featuredCharacterBadgeId).toBeNull();
    expect(audits.some((a) => a.action === 'revoke_badge')).toBe(true);
    await expect(revokeBadge(ctx('admin1'), 'c1', { badgeId: 'b1', reason: 'tekrar' })).rejects.toThrow('sahip değil');
  });
});

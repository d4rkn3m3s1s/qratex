/**
 * İç ekip davet akışı (TeamInvitation): token hash, süre, tek kullanım, e-posta eşleşmesi, iptal.
 */
type Inv = {
  id: string;
  email: string;
  role: string;
  department: string | null;
  invitedById: string;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedUserId?: string | null;
  revokedAt: Date | null;
};
type U = { id: string; email: string | null; role: string; adminTeamRole: string | null; adminDepartment?: string | null };
const invites: Inv[] = [];
const audits: Array<Record<string, unknown>> = [];
const users = new Map<string, U>();

function matchOpen(i: Inv, where: Record<string, unknown>): boolean {
  if ('acceptedAt' in where && where.acceptedAt === null && i.acceptedAt) return false;
  if ('revokedAt' in where && where.revokedAt === null && i.revokedAt) return false;
  const exp = where.expiresAt as { gt?: Date } | undefined;
  if (exp?.gt && !(i.expiresAt > exp.gt)) return false;
  return true;
}

const db = {
  $executeRaw: jest.fn(async () => 1),
  $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(db)),
  teamInvitation: {
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      invites.find((i) => i.email === where.email && matchOpen(i, where)) ?? null
    ),
    findUnique: jest.fn(async ({ where }: { where: { id?: string; tokenHash?: string } }) =>
      invites.find((i) => (where.id ? i.id === where.id : i.tokenHash === where.tokenHash)) ?? null
    ),
    create: jest.fn(async ({ data }: { data: Omit<Inv, 'id' | 'acceptedAt' | 'revokedAt'> }) => {
      const row: Inv = { ...data, id: `inv${invites.length + 1}`, acceptedAt: null, revokedAt: null };
      invites.push(row);
      return { ...row, createdAt: new Date() };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Inv> }) => {
      const i = invites.find((x) => x.id === where.id && matchOpen(x, where));
      if (!i) return { count: 0 };
      Object.assign(i, data);
      return { count: 1 };
    }),
  },
  user: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null),
    updateMany: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const u = users.get(where.id);
      if (!u || u.adminTeamRole) return { count: 0 };
      Object.assign(u, data);
      return { count: 1 };
    }),
  },
  department: {
    findFirst: jest.fn(async ({ where }: { where: { slug: string } }) => (where.slug === 'pazarlama' ? { slug: 'pazarlama' } : null)),
  },
  userDepartment: { deleteMany: jest.fn(async () => ({ count: 0 })), create: jest.fn(async () => ({})) },
  auditLog: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => audits.push(data)) },
};

jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

import {
  TEAM_INVITE_TTL_HOURS,
  acceptTeamInvitation,
  createTeamInvitation,
  hashInviteToken,
  revokeTeamInvitation,
} from '@/lib/team/invitations';

const NOW = new Date('2026-10-12T10:00:00Z');
const D = db as never;

beforeEach(() => {
  invites.length = 0;
  audits.length = 0;
  users.clear();
  users.set('u1', { id: 'u1', email: 'Ali@Ornek.com', role: 'CUSTOMER', adminTeamRole: null });
  users.set('u2', { id: 'u2', email: 'baska@ornek.com', role: 'CUSTOMER', adminTeamRole: null });
  users.set('d1', { id: 'd1', email: 'bayi@ornek.com', role: 'DEALER', adminTeamRole: null });
});

async function invite(email = 'ali@ornek.com', role: 'uye' | 'yonetici' = 'uye') {
  return createTeamInvitation({ email, role, department: 'pazarlama', invitedById: 'admin1', now: NOW }, D);
}

describe('TeamInvitation', () => {
  it('oluşturma: DB yalnız sha256 hash tutar, süre 72 sa, denetim yazılır', async () => {
    const { token, invitation } = await invite();
    expect(invites[0].tokenHash).toBe(hashInviteToken(token));
    expect(invites[0].tokenHash).not.toContain(token);
    expect(new Date(invitation.expiresAt).getTime() - NOW.getTime()).toBe(TEAM_INVITE_TTL_HOURS * 3_600_000);
    expect(audits[0]).toMatchObject({ action: 'team_invite_create', entity: 'TeamInvitation' });
  });

  it('aynı e-postaya ikinci açık davet → 409', async () => {
    await invite();
    await expect(invite('ALI@ornek.com')).rejects.toMatchObject({ status: 409 });
  });

  it('kabul: e-posta eşleşir → rol + departman yazılır; ikinci kullanım reddedilir (tek kullanım)', async () => {
    const { token } = await invite();
    const r = await acceptTeamInvitation({ token, userId: 'u1', now: NOW }, D);
    expect(r).toEqual({ teamRole: 'uye', department: 'pazarlama' });
    expect(users.get('u1')).toMatchObject({ adminTeamRole: 'uye', adminDepartment: 'pazarlama' });
    expect(invites[0].acceptedAt).toEqual(NOW);
    users.get('u1')!.adminTeamRole = null; // ekipten çıkarılsa bile token yeniden kullanılamaz
    await expect(acceptTeamInvitation({ token, userId: 'u1', now: NOW }, D)).rejects.toMatchObject({ status: 410 });
    expect(audits.map((a) => a.action)).toContain('team_invite_accept');
  });

  it('başka hesabın oturumu daveti kabul edemez ve davet hakkında ayrıntı almaz', async () => {
    const { token } = await invite();
    const err = await acceptTeamInvitation({ token, userId: 'u2', now: NOW }, D).catch((e) => e);
    expect(err).toMatchObject({ status: 404 });
    expect(String(err.message)).not.toMatch(/ali@|ornek|üye|yönetici/i);
    // Süresi dolmuş/iptal davet de yabancıya geçersiz token ile AYNI yanıtı verir (durum sızmaz).
    const later = new Date(NOW.getTime() + (TEAM_INVITE_TTL_HOURS * 3600 + 1) * 1000);
    const err2 = await acceptTeamInvitation({ token, userId: 'u2', now: later }, D).catch((e) => e);
    const err3 = await acceptTeamInvitation({ token: 'y'.repeat(43), userId: 'u2', now: NOW }, D).catch((e) => e);
    expect([err2.status, err2.message]).toEqual([err3.status, err3.message]);
    expect(invites[0].acceptedAt).toBeNull();
  });

  it('bayi hesabı (e-posta eşleşse bile) kabul edemez', async () => {
    const { token } = await invite('bayi@ornek.com');
    await expect(acceptTeamInvitation({ token, userId: 'd1', now: NOW }, D)).rejects.toMatchObject({ status: 404 });
  });

  it('süresi dolmuş davet → 410', async () => {
    const { token } = await invite();
    const later = new Date(NOW.getTime() + (TEAM_INVITE_TTL_HOURS * 3600 + 1) * 1000);
    await expect(acceptTeamInvitation({ token, userId: 'u1', now: later }, D)).rejects.toMatchObject({ status: 410 });
    expect(users.get('u1')!.adminTeamRole).toBeNull();
  });

  it('iptal edilen davet → 410; geçersiz token → 404', async () => {
    const { token, invitation } = await invite();
    await revokeTeamInvitation({ id: invitation.id, actorId: 'admin1', actorIsAdmin: true, now: NOW }, D);
    await expect(acceptTeamInvitation({ token, userId: 'u1', now: NOW }, D)).rejects.toMatchObject({ status: 410 });
    await expect(acceptTeamInvitation({ token: 'x'.repeat(43), userId: 'u1', now: NOW }, D)).rejects.toMatchObject({ status: 404 });
    expect(audits.map((a) => a.action)).toContain('team_invite_revoke');
  });

  it('yönetici davetini ekip yöneticisi iptal edemez', async () => {
    const { invitation } = await invite('ali@ornek.com', 'yonetici');
    await expect(
      revokeTeamInvitation({ id: invitation.id, actorId: 'm1', actorIsAdmin: false, now: NOW }, D)
    ).rejects.toMatchObject({ status: 403 });
  });
});

/**
 * İç ekip DAVET akışı (TeamInvitation) — doğrudan `adminTeamRole` yazmanın yerini alır.
 *
 * Değişmezler:
 *  - Ham token yalnız mailde; DB'de sha256 (`tokenHash @unique`).
 *  - Süre: `TEAM_INVITE_TTL_HOURS` (72 sa). Süresi geçen/iptal edilen/kullanılan davet kabul edilmez.
 *  - Tek kullanım: kabul koşullu `updateMany` (acceptedAt/revokedAt null + expiresAt > now);
 *    eşzamanlı ikinci kabul 0 satır günceller → reddedilir.
 *  - Kabul eden oturumun e-postası davet e-postasıyla birebir (normalize) aynı olmalı.
 *  - Aynı e-postaya aynı anda en fazla bir açık davet (uygulama katmanında, advisory kilitle).
 *  - Her adım (oluştur/iptal/kabul) denetim kaydına yazılır.
 */
import { createHash, randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { normalizeEmail } from '@/lib/auth/normalize-email';

export const TEAM_INVITE_TTL_HOURS = 72;
export const TEAM_INVITE_ROLES = ['yonetici', 'uye'] as const;
export type TeamInviteRole = (typeof TEAM_INVITE_ROLES)[number];
export const TEAM_ROLE_LABEL: Record<TeamInviteRole, string> = { yonetici: 'ekip yöneticisi', uye: 'ekip üyesi' };

type Db = typeof prisma;
type AuditMeta = { ipAddress?: string | null; userAgent?: string | null };

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token.trim(), 'utf8').digest('hex');
}

export function newInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Açık (kabul edilebilir) davet koşulu. */
export function openInvitationWhere(now: Date): Prisma.TeamInvitationWhereInput {
  return { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } };
}

export type InvitationDTO = {
  id: string;
  email: string;
  role: string;
  department: string | null;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string | null } | null;
};

export async function createTeamInvitation(
  input: {
    email: string;
    role: TeamInviteRole;
    department: string | null;
    invitedById: string;
    now?: Date;
    audit?: AuditMeta;
  },
  db: Db = prisma
): Promise<{ invitation: InvitationDTO; token: string }> {
  const email = normalizeEmail(input.email);
  const now = input.now ?? new Date();
  const token = newInviteToken();
  const expiresAt = new Date(now.getTime() + TEAM_INVITE_TTL_HOURS * 3_600_000);
  const row = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-invite:${email}`}))`;
    const open = await tx.teamInvitation.findFirst({ where: { email, ...openInvitationWhere(now) }, select: { id: true } });
    if (open) throw new ApiError('CONFLICT', 'Bu kişiye gönderilmiş bekleyen bir davet zaten var. Önce iptal edin ya da süresinin dolmasını bekleyin.');
    const created = await tx.teamInvitation.create({
      data: {
        email,
        role: input.role,
        department: input.department,
        invitedById: input.invitedById,
        tokenHash: hashInviteToken(token),
        expiresAt,
      },
      select: { id: true, email: true, role: true, department: true, expiresAt: true, createdAt: true },
    });
    await tx.auditLog.create({
      data: {
        userId: input.invitedById,
        action: 'team_invite_create',
        entity: 'TeamInvitation',
        entityId: created.id,
        newData: { email, role: input.role, department: input.department, expiresAt: expiresAt.toISOString() },
        ipAddress: input.audit?.ipAddress ?? null,
        userAgent: input.audit?.userAgent ?? null,
      },
    });
    return created;
  });
  return {
    token,
    invitation: {
      id: row.id,
      email: row.email,
      role: row.role,
      department: row.department,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      invitedBy: { id: input.invitedById, name: null },
    },
  };
}

export async function listOpenInvitations(now: Date = new Date(), db: Db = prisma): Promise<InvitationDTO[]> {
  const rows = await db.teamInvitation.findMany({
    where: openInvitationWhere(now),
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      email: true,
      role: true,
      department: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    department: r.department,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    invitedBy: r.invitedBy ? { id: r.invitedBy.id, name: r.invitedBy.name } : null,
  }));
}

export async function revokeTeamInvitation(
  input: { id: string; actorId: string; actorIsAdmin: boolean; now?: Date; audit?: AuditMeta },
  db: Db = prisma
): Promise<void> {
  const now = input.now ?? new Date();
  const inv = await db.teamInvitation.findUnique({ where: { id: input.id }, select: { id: true, role: true, invitedById: true } });
  if (!inv) throw new ApiError('NOT_FOUND', 'Davet bulunamadı.');
  // Yönetici davetini yalnız platform yöneticisi iptal eder (ekip yöneticisi yalnız üye daveti verebilir).
  if (inv.role === 'yonetici' && !input.actorIsAdmin) throw new ApiError('FORBIDDEN', 'Yönetici davetini yalnız platform yöneticisi iptal edebilir.');
  await db.$transaction(async (tx) => {
    const n = await tx.teamInvitation.updateMany({
      where: { id: inv.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    if (n.count === 0) throw new ApiError('CONFLICT', 'Davet zaten kullanılmış ya da iptal edilmiş.');
    await tx.auditLog.create({
      data: {
        userId: input.actorId,
        action: 'team_invite_revoke',
        entity: 'TeamInvitation',
        entityId: inv.id,
        ipAddress: input.audit?.ipAddress ?? null,
        userAgent: input.audit?.userAgent ?? null,
      },
    });
  });
}

export type AcceptResult = { teamRole: string; department: string | null };

/**
 * Daveti kabul eder. Hata mesajları kasıtlı olarak ayrıntısız: token'ın geçerliliği dışında
 * (kimin davet edildiği gibi) bilgi sızdırılmaz.
 */
export async function acceptTeamInvitation(
  input: { token: string; userId: string; now?: Date; audit?: AuditMeta },
  db: Db = prisma
): Promise<AcceptResult> {
  const now = input.now ?? new Date();
  const token = (input.token || '').trim();
  if (token.length < 20 || token.length > 200) throw new ApiError('NOT_FOUND', 'Davet bağlantısı geçersiz.');
  const inv = await db.teamInvitation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: { id: true, email: true, role: true, department: true, expiresAt: true, acceptedAt: true, revokedAt: true, invitedById: true },
  });
  if (!inv) throw new ApiError('NOT_FOUND', 'Davet bağlantısı geçersiz.');
  if (inv.acceptedAt) throw new ApiError('CONFLICT', 'Bu davet zaten kullanıldı.');
  if (inv.revokedAt) throw new ApiError('GONE', 'Bu davet iptal edildi.', { status: 410 });
  if (inv.expiresAt.getTime() <= now.getTime()) throw new ApiError('GONE', 'Bu davetin süresi doldu. Yöneticinizden yeni davet isteyin.', { status: 410 });

  const user = await db.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, role: true, adminTeamRole: true } });
  if (!user?.email || normalizeEmail(user.email) !== inv.email) {
    throw new ApiError('FORBIDDEN', 'Bu davet başka bir e-posta adresine gönderildi. Davet edilen hesapla giriş yapın.');
  }
  if (user.role !== 'CUSTOMER' && user.role !== 'ADMIN') {
    throw new ApiError('FORBIDDEN', 'Bayi ve personel hesapları ekip paneline erişemediği için daveti kabul edemez.');
  }
  if (user.adminTeamRole) throw new ApiError('CONFLICT', 'Zaten ekiptesiniz.');

  let department: string | null = null;
  if (inv.department) {
    const d = await db.department.findFirst({ where: { slug: inv.department, isActive: true }, select: { slug: true } });
    department = d?.slug ?? null; // davetten sonra arşivlenen departman sessizce düşer
  }

  await db.$transaction(async (tx) => {
    const n = await tx.teamInvitation.updateMany({
      where: { id: inv.id, ...openInvitationWhere(now) },
      data: { acceptedAt: now, acceptedUserId: user.id },
    });
    if (n.count === 0) throw new ApiError('CONFLICT', 'Bu davet artık geçerli değil.');
    const u = await tx.user.updateMany({
      where: { id: user.id, adminTeamRole: null },
      data: { adminTeamRole: inv.role, adminDepartment: department },
    });
    if (u.count === 0) throw new ApiError('CONFLICT', 'Zaten ekiptesiniz.');
    await tx.userDepartment.deleteMany({ where: { userId: user.id } });
    if (department) await tx.userDepartment.create({ data: { userId: user.id, departmentSlug: department } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'team_invite_accept',
        entity: 'TeamInvitation',
        entityId: inv.id,
        newData: { teamRole: inv.role, department, invitedById: inv.invitedById },
        ipAddress: input.audit?.ipAddress ?? null,
        userAgent: input.audit?.userAgent ?? null,
      },
    });
  });
  return { teamRole: inv.role, department };
}

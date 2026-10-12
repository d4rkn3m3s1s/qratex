import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok, ApiError } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { emailLookupFilter, normalizeEmail } from '@/lib/auth/normalize-email';
import { publicDisplayName } from '@/lib/http/dto';
import { TEAM_ROUTE_ROLES, requireTeamViewer } from '@/lib/team/access';
import { TEAM_INVITE_TTL_HOURS, TEAM_ROLE_LABEL, createTeamInvitation } from '@/lib/team/invitations';
import { sendTeamInvitationEmail } from '@/lib/email';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

export const dynamic = 'force-dynamic';

const MIN_ADMIN_QUERY = 3;
const SEARCH_RATE_MAX = 30; // aktör başına / dakika

/**
 * Ekip üyeliği yalnız CUSTOMER (ekip paneli müşteri panelinde) ve ADMIN hesaplarına verilir.
 * Bayi/personel hesabı eklenirse görev atanabilir ama hiçbir panelden ekip modülüne ulaşamaz
 * (denetim departmanlar Bulgu 6/9: "ölü üye").
 */
const ELIGIBLE_ROLES = ['CUSTOMER', 'ADMIN'] as const;

async function searchRateLimit(actorId: string): Promise<void> {
  const rl = await checkRateLimitDb(`team-member-search:${actorId}`, SEARCH_RATE_MAX, 60_000);
  if (!rl.ok) {
    throw new ApiError('RATE_LIMITED', 'Çok fazla arama yaptınız. Lütfen biraz bekleyin.', {
      retryable: true,
      headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
    });
  }
}

const searchQuery = z.object({ q: z.string().max(200).optional() });

/**
 * GET ?q= — ekibe eklenebilecek aday (ekipte olmayan, CUSTOMER ya da ADMIN).
 *
 * P0-10 sözleşmesi korunur: boş/kısa sorgu → boş liste; ADMIN olmayan ekip yöneticisi YALNIZ tam
 * e-posta ile birebir arar (yanıttaki e-posta kendi yazdığıdır); rol alanı dönmez; aktör başına
 * dakikada 30 arama (ekleme ile aynı kova).
 */
export const GET = defineRoute(
  { name: 'team.members.search', roles: TEAM_ROUTE_ROLES, query: searchQuery },
  async ({ user, query }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const rawQ = (query.q || '').trim().slice(0, 120);
    await searchRateLimit(user.id);

    const exactEmail = normalizeEmail(rawQ);
    const looksLikeEmail = z.string().email().safeParse(exactEmail).success;

    if (!viewer.isAdmin) {
      if (!looksLikeEmail) {
        return ok({ users: [], hint: 'Eklemek istediğiniz kişinin e-posta adresini tam olarak yazın.' }, { legacySpread: true });
      }
      const match = await prisma.user.findFirst({
        where: { email: emailLookupFilter(exactEmail), adminTeamRole: null, role: 'CUSTOMER' },
        select: { id: true, name: true, image: true },
      });
      const users = match ? [{ id: match.id, name: publicDisplayName(match.name, ''), email: exactEmail, image: match.image }] : [];
      return ok({ users }, { legacySpread: true });
    }

    if (rawQ.length < MIN_ADMIN_QUERY) return ok({ users: [] }, { legacySpread: true });
    const users = await prisma.user.findMany({
      where: {
        OR: [{ name: { contains: rawQ, mode: 'insensitive' } }, { email: { contains: rawQ, mode: 'insensitive' } }],
        adminTeamRole: null,
        role: { in: [...ELIGIBLE_ROLES] },
      },
      select: { id: true, name: true, email: true, image: true },
      orderBy: { name: 'asc' },
      take: 10,
    });
    return ok({ users }, { legacySpread: true });
  }
);

/** Slug listesini doğrular (yalnız mevcut + aktif departmanlar; denetim Bulgu 2/3: FK ihlali 500). */
async function validateSlugs(slugs: string[]): Promise<string[]> {
  const unique = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const found = await prisma.department.findMany({ where: { slug: { in: unique }, isActive: true }, select: { slug: true } });
  const ok = new Set(found.map((d) => d.slug));
  const bad = unique.filter((s) => !ok.has(s));
  if (bad.length) throw new ApiError('VALIDATION', `Departman bulunamadı ya da arşivli: ${bad.join(', ')}`);
  return unique;
}

/** Junction + birincil departmanı TEK işlemde eşitler (yarım güncelleme kalmaz). */
async function writeDepartments(tx: Prisma.TransactionClient, userId: string, slugs: string[]): Promise<void> {
  await tx.userDepartment.deleteMany({ where: { userId } });
  if (slugs.length) await tx.userDepartment.createMany({ data: slugs.map((departmentSlug) => ({ userId, departmentSlug })), skipDuplicates: true });
}

const addBody = z
  .object({
    userId: z.string().min(1).max(60).optional(),
    email: z.string().email().max(200).optional(),
    department: z.string().max(60).nullish(),
    departments: z.array(z.string().max(60)).max(20).optional(),
    teamRole: z.enum(['yonetici', 'uye']).default('uye'),
  })
  .refine((b) => !!b.userId || !!b.email, { message: 'Kişi seçin' });

/**
 * POST — mevcut kullanıcıyı ekibe DAVET eder (kimlik ya da e-posta; büyük/küçük harf duyarsız —
 * denetim Bulgu 5/6). Üyelik ancak kişi davet bağlantısını kabul edince oluşur (TeamInvitation).
 * Platform rolü DEĞİŞMEZ. Yönetici rolünü yalnız ADMIN verebilir
 * (yetki zincirinin kendini genişletmesi engellenir).
 */
export const POST = defineRoute(
  { name: 'team.members.add', roles: TEAM_ROUTE_ROLES, schema: addBody },
  async ({ user, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    // "Bu e-posta kayıtlı mı?" yanıtı da bir numaralandırma kanalıdır: aramayla aynı kova.
    await searchRateLimit(user.id);
    if (body.teamRole === 'yonetici' && !viewer.isAdmin) {
      throw new ApiError('FORBIDDEN', 'Yönetici rolünü yalnız platform yöneticisi verebilir.');
    }
    const target = await prisma.user.findFirst({
      where: body.userId ? { id: body.userId } : { email: emailLookupFilter(normalizeEmail(body.email!)) },
      select: { id: true, role: true, adminTeamRole: true, name: true, email: true },
    });
    if (!target) throw new ApiError('NOT_FOUND', 'Bu e-posta ile kayıtlı kullanıcı yok. Önce kullanıcı hesabı oluşturulmalı.');
    if (!(ELIGIBLE_ROLES as readonly string[]).includes(String(target.role))) {
      throw new ApiError('VALIDATION', 'Bayi ve personel hesapları ekip paneline erişemediği için ekibe eklenemez.');
    }
    if (target.adminTeamRole) throw new ApiError('CONFLICT', 'Bu kişi zaten ekipte.');
    const slugs = await validateSlugs(body.departments ?? (body.department ? [body.department] : []));

    if (!target.email) throw new ApiError('VALIDATION', 'Bu hesabın e-posta adresi yok; davet gönderilemez.');

    // Doğrudan rol yazma YOK: davet oluşur, kişi mailindeki tek kullanımlık bağlantıyla kabul
    // eder (oturum e-postası = davet e-postası). Bkz. lib/team/invitations.ts.
    const { invitation, token } = await createTeamInvitation({
      email: target.email,
      role: body.teamRole,
      department: slugs[0] ?? null,
      invitedById: viewer.userId,
      audit: getAuditRequestMeta(request),
    });
    const base = target.role === 'ADMIN' ? '/admin/ekip/davet' : '/customer/ekip-davet';
    const acceptUrl = `${getPublicAppOrigin().replace(/\/$/, '')}${base}?token=${encodeURIComponent(token)}`;
    const inviter = await prisma.user.findUnique({ where: { id: viewer.userId }, select: { name: true } });
    const mail = await sendTeamInvitationEmail(target.email, {
      acceptUrl,
      inviterName: inviter?.name ?? null,
      roleLabel: TEAM_ROLE_LABEL[body.teamRole],
      expiresHours: TEAM_INVITE_TTL_HOURS,
      userName: target.name ?? undefined,
    }).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : 'mail hatası' }));
    return ok(
      { invited: true, invitation: { ...invitation, email: target.email }, mailSent: mail.ok },
      { status: 201, legacySpread: true }
    );
  }
);

const updateBody = z.object({
  id: z.string().min(1).max(60),
  department: z.string().max(60).nullish(),
  /** Tam liste (ilk eleman birincil). */
  departments: z.array(z.string().max(60)).max(20).optional(),
  /** Delta: tek departman ekle / çıkar (yarışsız; denetim Bulgu 12). */
  addDepartment: z.string().max(60).optional(),
  removeDepartment: z.string().max(60).optional(),
  /** Birincil departmanı seç (listenin başına alınır). */
  primaryDepartment: z.string().max(60).optional(),
  teamRole: z.enum(['yonetici', 'uye']).optional(),
});

/**
 * PUT — üyenin departman(lar)ı / ekip rolü. Kurallar (denetim Bulgu 5/8):
 *  - yalnız MEVCUT ekip üyesi güncellenir (ekip dışına rol verilemez → 404);
 *  - ekip rolünü yalnız ADMIN değiştirir; kimse kendi rolünü değiştiremez;
 *  - departman slug'ları doğrulanır, junction + birincil departman + audit tek işlemde.
 */
export const PUT = defineRoute(
  { name: 'team.members.update', roles: TEAM_ROUTE_ROLES, schema: updateBody, rateLimit: 'mutation' },
  async ({ user, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const member = await prisma.user.findFirst({
      where: { id: body.id, adminTeamRole: { not: null } },
      select: { id: true, adminTeamRole: true, adminDepartment: true, teamDepartments: { select: { departmentSlug: true } } },
    });
    if (!member) throw new ApiError('NOT_FOUND', 'Üye bulunamadı.');

    if (body.teamRole !== undefined && body.teamRole !== member.adminTeamRole) {
      if (body.id === viewer.userId) throw new ApiError('FORBIDDEN', 'Kendi ekip rolünü değiştiremezsin.');
      if (!viewer.isAdmin) throw new ApiError('FORBIDDEN', 'Ekip rolünü yalnız platform yöneticisi değiştirebilir.');
    }

    const current = (member.teamDepartments ?? []).map((d) => d.departmentSlug);
    const base = current.length ? current : member.adminDepartment ? [member.adminDepartment] : [];
    let next: string[] | null = null;
    if (body.departments !== undefined) next = body.departments;
    else if (body.department !== undefined) next = body.department ? [body.department] : [];
    else if (body.addDepartment) next = [...base.filter((s) => s !== body.addDepartment), body.addDepartment];
    else if (body.removeDepartment) next = base.filter((s) => s !== body.removeDepartment);
    if (body.primaryDepartment) {
      const list = next ?? base;
      if (!list.includes(body.primaryDepartment)) throw new ApiError('VALIDATION', 'Birincil departman, üyenin departmanlarından biri olmalı.');
      next = [body.primaryDepartment, ...list.filter((s) => s !== body.primaryDepartment)];
    }
    // Ekleme/eşitleme sırasında silinmiş (bayat) slug'lar sessizce düşer; yalnız YENİ eklenen doğrulanır.
    const validNow = next
      ? (await prisma.department.findMany({ where: { slug: { in: next } }, select: { slug: true, isActive: true } }))
      : [];
    if (next && body.addDepartment) await validateSlugs([body.addDepartment]);
    if (next && body.departments) await validateSlugs(body.departments);
    if (next && body.department) await validateSlugs([body.department]);
    const slugs = next ? next.filter((s) => validNow.some((d) => d.slug === s)) : null;

    const updated = await prisma.$transaction(async (tx) => {
      const data: Prisma.UserUpdateInput = {};
      if (body.teamRole !== undefined) data.adminTeamRole = body.teamRole;
      if (slugs) {
        await writeDepartments(tx, body.id, slugs);
        data.adminDepartment = slugs[0] ?? null;
      }
      const u = await tx.user.update({
        where: { id: body.id },
        data,
        select: { id: true, name: true, image: true, adminDepartment: true, adminTeamRole: true },
      });
      await tx.auditLog.create({
        data: {
          userId: viewer.userId,
          action: 'update_team_member',
          entity: 'admin_team_member',
          entityId: body.id,
          oldData: { teamRole: member.adminTeamRole, departments: base } as Prisma.InputJsonValue,
          newData: { teamRole: body.teamRole ?? member.adminTeamRole, departments: slugs ?? base } as Prisma.InputJsonValue,
          ...getAuditRequestMeta(request),
        },
      });
      return u;
    });
    return ok({ member: { ...updated, departmentSlugs: slugs ?? base } }, { legacySpread: true });
  }
);

const deleteQuery = z.object({ id: z.string().min(1).max(191) });

/**
 * DELETE ?id= — kişiyi ekipten çıkarır (görevleri silinmez; atamalar kalır). Kendini çıkaramaz;
 * başka bir YÖNETİCİYİ yalnız ADMIN çıkarabilir.
 */
export const DELETE = defineRoute(
  { name: 'team.members.remove', roles: TEAM_ROUTE_ROLES, query: deleteQuery, rateLimit: 'mutation' },
  async ({ user, query, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const id = query.id;
    if (id === viewer.userId) throw new ApiError('FORBIDDEN', 'Kendini ekipten çıkaramazsın; bir yöneticiden iste.');
    if (!viewer.isAdmin) {
      const isManagerTarget = await prisma.user.findFirst({ where: { id, adminTeamRole: 'yonetici' }, select: { id: true } });
      if (isManagerTarget) throw new ApiError('FORBIDDEN', 'Başka bir ekip yöneticisini yalnız platform yöneticisi çıkarabilir.');
    }
    // Koşullu güncelleme: ekip dışındaki hesaba yazılmaz, arada çıkarılmışsa 404.
    const removed = await prisma.user.updateMany({
      where: { id, adminTeamRole: { not: null } },
      data: { adminDepartment: null, adminTeamRole: null },
    });
    if (removed.count === 0) throw new ApiError('NOT_FOUND', 'Üye bulunamadı.');
    await prisma.userDepartment.deleteMany({ where: { userId: id } });
    await prisma.auditLog.create({
      data: { userId: viewer.userId, action: 'remove_team_member', entity: 'admin_team_member', entityId: id, ...getAuditRequestMeta(request) },
    });
    return ok({ removed: true }, { legacySpread: true });
  }
);

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { sanitizeHexColor } from '@/lib/badge-colors';
import { archiveGateResponse, readArchiveIntent, type DeletionImpact } from '@/lib/data-safety/archive';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';
import { z, ZodError } from 'zod';
import { ApiError } from '@/lib/http/define-route';
import { updateBadge as updateAdminBadge } from '@/lib/admin-badges/server';

// GET /api/gamification/badges/[id] - Get single badge

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Bulgu 3: ham rozet tanımı (gizli/karakter rozetleri dahil) oturumsuz okunuyordu → yalnız ADMIN.
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('gamification.badges.admin-read', auth.session.user.id, 'read');
    if (limited) return limited;
    const { id } = await params;

    const badge = await prisma.badge.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!badge) {
      return NextResponse.json(
        { success: false, error: 'Rozet bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json({ success: true, data: badge }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching badge:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/** Karakter rozetleri (kategori motoru kimliğe bağlı) arşivlenemez / silinemez. */
async function isCharacterBadge(badgeId: string): Promise<boolean> {
  const { CHARACTER_PROFILES } = await import('@/lib/character-badges');
  return CHARACTER_PROFILES.some((c) => c.badgeId === badgeId);
}

const patchEnvelope = z.object({ restore: z.boolean().optional() }).passthrough();

// PATCH /api/gamification/badges/[id] - Update badge
// `{ "restore": true }` → arşivden geri alır (P0-26). Arşivdeki rozet düzenlenemez.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('gamification.badges.update', auth.session.user.id, 'mutation');
    if (limited) return limited;
    const { session } = auth;

    const { id } = await params;
    // Zarf şeması: `restore` bayrağı tipli; düzenleme alanları servis şemasında (updateAdminBadge, zod).
    const parsedBody = patchEnvelope.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION', error: 'Geçersiz istek gövdesi' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const body = parsedBody.data;

    // Get old badge for audit
    const oldBadge = await prisma.badge.findUnique({ where: { id } });
    if (!oldBadge) {
      return NextResponse.json(
        { success: false, error: 'Rozet bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (body.restore === true) {
      if (!oldBadge.archivedAt) {
        return NextResponse.json({ success: false, error: 'Bu rozet arşivde değil' }, { status: 409 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      const restored = await prisma.$transaction(async (tx) => {
        const b = await tx.badge.update({ where: { id }, data: { archivedAt: null, isActive: true } });
        await tx.auditLog.create({
          data: auditEntry(actorFromSession(session), { action: 'RESTORE_BADGE', entity: 'Badge', entityId: id }, request),
        });
        return b;
      });
      return NextResponse.json({ success: true, data: restored }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (oldBadge.archivedAt) {
      return NextResponse.json(
        { success: false, code: 'ARCHIVED', error: 'Arşivlenmiş rozet düzenlenemez. Önce arşivden geri alın.' },
        { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Bulgu 7: doğrulamasız ham yazma (koşul metadata'sını silen, serbest nadirlik) kaldırıldı —
    // admin rozet servisi: zod + koşul birleştirme + aynı tx denetim. Yeni istemci: PATCH /api/admin/badges/[id].
    void auditMeta;
    let badge;
    try {
      badge = await updateAdminBadge(id, body, actorFromSession(session), request);
    } catch (e) {
      if (e instanceof ZodError) {
        return NextResponse.json(
          { success: false, code: 'VALIDATION', error: e.issues[0]?.message ?? 'Geçersiz rozet bilgisi', details: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
          { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      if (e instanceof ApiError) {
        return NextResponse.json({ success: false, code: e.code, error: e.message }, { status: e.status, headers: PRIVATE_NO_STORE_HEADERS });
      }
      throw e;
    }

    return NextResponse.json({ success: true, data: badge }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error updating badge:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Rozet güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * DELETE /api/gamification/badges/[id] — "silme" artık ARŞİVDİR (P0-26).
 *
 * Önceden `badge.delete` → `UserBadge onDelete: Cascade`: kullanıcıların kazandığı (bir
 * kısmı puanla satın aldığı) rozetler tek tıkla yok oluyordu. Şimdi:
 *  - `?dryRun=1` → etki önizlemesi (kazanan sayısı).
 *  - Kazanan varsa ve `?confirm=archive` yoksa → 409 CONFIRM_REQUIRED + impact.
 *  - Karakter rozetleri → 409 ARCHIVE_BLOCKED (karakter motoru kimliğe bağlı).
 *  - Onaylı/etkisiz → `archivedAt` + `isActive=false`; kazanılmış rozetler korunur,
 *    yeni kazanım ve satın alma durur. `PATCH {restore:true}` ile geri alınır.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('gamification.badges.delete', auth.session.user.id, 'mutation');
    if (limited) return limited;
    const { session } = auth;

    const { id } = await params;

    const badge = await prisma.badge.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!badge) {
      return NextResponse.json(
        { success: false, error: 'Rozet bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const earnedBy = badge._count.users;
    const blockers: string[] = [];
    if (await isCharacterBadge(id)) {
      blockers.push('Karakter rozetleri silinemez ya da arşivlenemez; karakter motoru bu kimliğe bağlıdır. Rozeti pasifleştirmek için düzenleyin.');
    }
    const impact: DeletionImpact = {
      entity: 'Badge',
      entityId: id,
      entityLabel: badge.name,
      items: [{ key: 'earnedBy', label: 'Rozeti kazanmış kullanıcı', value: earnedBy, emphasis: earnedBy > 0 }],
      warning: 'Rozet arşivlenir: kazanılmış rozetler kullanıcılarda kalır, yeni kazanım ve puanla açma durur.',
      ...(blockers.length ? { blockers } : {}),
    };

    const early = archiveGateResponse(
      impact,
      readArchiveIntent(request),
      `Bu rozeti ${earnedBy} kullanıcı kazanmış. Arşivlemek yeni kazanımları durdurur, mevcut rozetler korunur. Onaylamak için isteği confirm=archive ile tekrarlayın.`
    );
    if (early) return early;

    if (badge.archivedAt) {
      return NextResponse.json(
        { success: true, archived: true, alreadyArchived: true, message: 'Rozet zaten arşivde' },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.badge.update({ where: { id }, data: { archivedAt: now, isActive: false } });
      await tx.auditLog.create({
        data: auditEntry(
          actorFromSession(session),
          {
            action: 'ARCHIVE_BADGE',
            entity: 'Badge',
            entityId: id,
            oldData: { name: badge.name, isActive: badge.isActive, pointCost: badge.pointCost },
            newData: { archivedAt: now, earnedByPreserved: earnedBy },
          },
          request
        ),
      });
    });

    return NextResponse.json(
      { success: true, archived: true, message: 'Rozet arşivlendi', impact },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error archiving badge:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Rozet arşivlenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

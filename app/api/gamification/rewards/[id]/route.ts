import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { assertModuleEnabled } from '@/lib/module-gate';
import { archiveGateResponse, readArchiveIntent, type DeletionImpact } from '@/lib/data-safety/archive';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';

// GET /api/gamification/rewards/[id]

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await assertModuleEnabled('rewards');
    if (gate) return gate;
    const { id } = await params;

    const reward = await prisma.reward.findUnique({
      where: { id },
    });

    if (!reward) {
      return NextResponse.json(
        { success: false, error: 'Ödül bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json({ success: true, data: reward }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching reward:', error);
    return NextResponse.json(
      { success: false, error: 'Ödül getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// PATCH /api/gamification/rewards/[id]
// `{ "restore": true }` → arşivden geri alır (P0-26). Arşivdeki ödül düzenlenemez.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await assertModuleEnabled('rewards');
    if (gate) return gate;
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Geçersiz istek gövdesi' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const oldReward = await prisma.reward.findUnique({ where: { id } });
    if (!oldReward) {
      return NextResponse.json(
        { success: false, error: 'Ödül bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (body.restore === true) {
      if (!oldReward.archivedAt) {
        return NextResponse.json({ success: false, error: 'Bu ödül arşivde değil' }, { status: 409 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      const restored = await prisma.$transaction(async (tx) => {
        const r = await tx.reward.update({ where: { id }, data: { archivedAt: null, isActive: true } });
        await tx.auditLog.create({
          data: auditEntry(actorFromSession(session), { action: 'RESTORE_REWARD', entity: 'Reward', entityId: id }, request),
        });
        return r;
      });
      return NextResponse.json({ success: true, data: restored }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (oldReward.archivedAt) {
      return NextResponse.json(
        { success: false, code: 'ARCHIVED', error: 'Arşivlenmiş ödül düzenlenemez. Önce arşivden geri alın.' },
        { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const reward = await prisma.reward.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        icon: body.icon,
        type: body.type,
        cost: body.cost,
        stock: body.stock,
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
        isActive: body.isActive ?? true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_REWARD',
        entity: 'Reward',
        entityId: reward.id,
        oldData: oldReward as object,
        newData: reward as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, data: reward }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error updating reward:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Ödül güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * DELETE /api/gamification/rewards/[id] — "silme" artık ARŞİVDİR (P0-26).
 *
 * Önceden `reward.delete` → `UserReward onDelete: Cascade`: müşterinin PUANLA ALDIĞI
 * ödüller ve kullanılmamış kupon kodları tek tıkla yok oluyordu (ödenmiş puan iadesiz).
 * Şimdi kazanım varsa `?confirm=archive` olmadan 409 + etki önizlemesi; onayla arşiv
 * (`archivedAt`, `isActive=false`): alınmış ödüller ve kodlar korunur, yeni alım durur.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await assertModuleEnabled('rewards');
    if (gate) return gate;
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    const reward = await prisma.reward.findUnique({ where: { id } });
    if (!reward) {
      return NextResponse.json(
        { success: false, error: 'Ödül bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const [redeemed, unusedCodes] = await Promise.all([
      prisma.userReward.count({ where: { rewardId: id } }),
      prisma.userReward.count({ where: { rewardId: id, claimedAt: null } }),
    ]);

    const impact: DeletionImpact = {
      entity: 'Reward',
      entityId: id,
      entityLabel: reward.name,
      items: [
        { key: 'redeemed', label: 'Puanla alınmış ödül', value: redeemed, emphasis: redeemed > 0 },
        { key: 'unusedCodes', label: 'Henüz kullanılmamış kupon/ödül', value: unusedCodes, emphasis: unusedCodes > 0 },
      ],
      warning: 'Ödül arşivlenir: müşterilerin aldığı ödüller ve kupon kodları korunur, yeni alım durur.',
    };

    const early = archiveGateResponse(
      impact,
      readArchiveIntent(request),
      `Bu ödül ${redeemed} kez puanla alınmış (${unusedCodes} tanesi henüz kullanılmadı). Arşivlemek yeni alımı durdurur, alınmış ödüller korunur. Onaylamak için isteği confirm=archive ile tekrarlayın.`
    );
    if (early) return early;

    if (reward.archivedAt) {
      return NextResponse.json(
        { success: true, archived: true, alreadyArchived: true, message: 'Ödül zaten arşivde' },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.reward.update({ where: { id }, data: { archivedAt: now, isActive: false } });
      await tx.auditLog.create({
        data: auditEntry(
          actorFromSession(session),
          {
            action: 'ARCHIVE_REWARD',
            entity: 'Reward',
            entityId: id,
            oldData: { name: reward.name, cost: reward.cost, isActive: reward.isActive, stock: reward.stock },
            newData: { archivedAt: now, redeemedPreserved: redeemed, unusedCodesPreserved: unusedCodes },
          },
          request
        ),
      });
    });

    return NextResponse.json(
      { success: true, archived: true, message: 'Ödül arşivlendi', impact },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error archiving reward:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Ödül arşivlenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

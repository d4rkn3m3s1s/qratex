import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { updateCardStatusSchema } from '@/lib/validations';
import { getClientIp } from '@/lib/request-metadata';
import { archiveGateResponse, readArchiveIntent, type DeletionImpact } from '@/lib/data-safety/archive';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';
import { CARD_ARCHIVE_BLOCK_REASON, checkStatusChange, statusChangeData } from '@/lib/cards/lifecycle';


export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/cards/[id]
 * Tek kart detayı
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { id } = await params;

    const card = await prisma.physicalCard.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        consumptions: {
          include: {
            dealer: {
              select: {
                id: true,
                name: true,
                businessName: true,
              },
            },
            product: true,
            review: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Kart bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json({
      success: true,
      card,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching card:', error);
    return NextResponse.json(
      { error: 'Kart bilgisi alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * PATCH /api/admin/cards/[id]
 * Kart durumunu güncelle (blokla / blok kaldır) — durum makinesiyle (lib/cards/lifecycle.ts).
 * Koşullu yazım + denetim izi aynı transaction'da: arada durum değiştiyse 409.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const validatedData = updateCardStatusSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { status, blockReason } = validatedData.data;

    const existingCard = await prisma.physicalCard.findUnique({
      where: { id },
      select: { id: true, status: true, customerId: true, archivedAt: true },
    });

    if (!existingCard) {
      return NextResponse.json(
        { error: 'Kart bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const check = checkStatusChange(existingCard, status);
    if (!check.ok) {
      return NextResponse.json({ error: check.message, code: check.code }, { status: 409 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const card = await prisma.$transaction(async (tx) => {
      const w = await tx.physicalCard.updateMany({
        where: { id, status: existingCard.status, customerId: existingCard.customerId, archivedAt: null },
        data: statusChangeData(existingCard.status, status, blockReason),
      });
      if (w.count === 0) return null;
      await tx.cardAuditLog.create({
        data: {
          cardId: id,
          userId: session.user.id,
          action: status === 'BLOCKED' ? 'BLOCKED' : 'UNBLOCKED',
          metadata: {
            previousStatus: existingCard.status,
            newStatus: status,
            reason: blockReason ?? null,
          },
          ipAddress: getClientIp(request),
          userAgent: request.headers.get('user-agent') || null,
        },
      });
      return tx.physicalCard.findUnique({ where: { id } });
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Kart bu sırada başka bir işlemle değişti. Sayfayı yenileyip tekrar deneyin.', code: 'CONFLICT' },
        { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({
      success: true,
      message: status === 'BLOCKED' ? 'Kart bloklandı' : 'Kart durumu güncellendi',
      card,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error updating card:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Kart güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * DELETE /api/admin/cards/[id] — "silme" artık ARŞİVDİR (P0-26).
 *
 * Önceden kartın tüketimleri, o tüketimlere yazılmış müşteri yorumları ve kartın kendi
 * denetim izi (CardAuditLog) transaction içinde siliniyordu: müşterinin ziyaret geçmişi,
 * rozet ilerlemesi ve bayinin istatistikleri geri dönüşsüz kayboluyordu.
 *
 * Şimdi: kart `archivedAt` + `status=BLOCKED` (yeniden aktive edilemez); tüketimler,
 * yorumlar ve denetim izi KORUNUR. Müşteriye bağlı ya da tüketimi olan kartta
 * `?confirm=archive` olmadan 409 + etki önizlemesi. `?dryRun=1` → yalnız önizleme.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { id } = await params;

    const card = await prisma.physicalCard.findUnique({
      where: { id },
      include: {
        _count: {
          select: { consumptions: true },
        },
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Kart bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const impact: DeletionImpact = {
      entity: 'PhysicalCard',
      entityId: id,
      entityLabel: card.token,
      items: [
        { key: 'linkedCustomer', label: 'Bağlı müşteri (bağ korunur, kart kullanılamaz olur)', value: card.customerId ? 1 : 0, emphasis: !!card.customerId },
        { key: 'consumptions', label: 'Korunacak tüketim kaydı', value: card._count.consumptions },
      ],
      warning: 'Kart arşivlenir ve kalıcı olarak bloklanır; tüketim geçmişi, yorumlar ve kart denetim izi silinmez.',
    };

    const early = archiveGateResponse(
      impact,
      readArchiveIntent(request),
      card.customerId
        ? 'Bu kart bir müşteriye bağlı ve geçmiş tüketimleri var. Arşivlemek kartı kalıcı olarak kullanılamaz yapar; geçmiş korunur. Onaylamak için isteği confirm=archive ile tekrarlayın.'
        : `Bu kartın ${card._count.consumptions} tüketim kaydı var. Arşivlemek kartı kullanılamaz yapar; geçmiş korunur. Onaylamak için isteği confirm=archive ile tekrarlayın.`
    );
    if (early) return early;

    if (card.archivedAt) {
      return NextResponse.json(
        { success: true, archived: true, alreadyArchived: true, message: 'Kart zaten arşivde' },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const now = new Date();
    const archived = await prisma.$transaction(async (tx) => {
      const w = await tx.physicalCard.updateMany({
        where: { id, archivedAt: null },
        data: {
          archivedAt: now,
          status: 'BLOCKED',
          blockedAt: card.blockedAt ?? now,
          blockReason: card.blockReason ?? CARD_ARCHIVE_BLOCK_REASON,
        },
      });
      if (w.count === 0) return false;
      await tx.cardAuditLog.create({
        data: {
          cardId: id,
          userId: session.user.id,
          action: 'ARCHIVED',
          metadata: {
            previousStatus: card.status,
            customerId: card.customerId,
            consumptionCount: card._count.consumptions,
          },
          ipAddress: getClientIp(request),
          userAgent: request.headers.get('user-agent') || null,
        },
      });
      await tx.auditLog.create({
        data: auditEntry(
          actorFromSession(session),
          {
            action: 'CARD_ARCHIVED',
            entity: 'PhysicalCard',
            entityId: id,
            oldData: {
              token: card.token,
              batchId: card.batchId,
              status: card.status,
              customerId: card.customerId,
              consumptionCount: card._count.consumptions,
            },
            newData: { archivedAt: now },
          },
          request
        ),
      });
      return true;
    });

    if (!archived) {
      return NextResponse.json(
        { success: true, archived: true, alreadyArchived: true, message: 'Kart zaten arşivde' },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({
      success: true,
      archived: true,
      message: 'Kart arşivlendi; geçmiş kayıtlar korundu',
      impact,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error archiving card:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Kart arşivlenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

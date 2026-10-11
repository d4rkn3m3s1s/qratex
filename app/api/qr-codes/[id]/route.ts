import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { updateQRCodeSchema } from '@/lib/validations';
import { impactPreviewResponse, readArchiveIntent, type DeletionImpact } from '@/lib/data-safety/archive';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';
import { checkLiveQrQuota, lockDealerQrQuota, QrQuotaExceededError } from '@/lib/qr-quota';


export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const limited = await enforceRouteRateLimit('qr-codes.get', session.user.id, 'read');
    if (limited) return limited;
    const { id } = await params;
    const qr = await prisma.qRCode.findUnique({
      where: { id },
      include: { dealer: { select: { id: true, name: true, businessName: true } } },
    });
    if (!qr) {
      return NextResponse.json({ error: 'QR kod bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (session.user.role !== 'ADMIN' && qr.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu QR kodu görüntüleme yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json(qr, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching QR code:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'QR kod getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * PATCH /api/qr-codes/[id]
 * Alan güncelleme. Arşivlenmiş QR düzenlenemez; `{ "restore": true }` ile geri alınır
 * (arşivle birlikte konan iptal de kaldırılır; arşivden ÖNCE iptal edilmiş QR iptal kalır).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const limited = await enforceRouteRateLimit('qr-codes.update', session.user.id, 'mutation');
    if (limited) return limited;
    const { id } = await params;
    const existing = await prisma.qRCode.findUnique({
      where: { id },
      select: { id: true, dealerId: true, archivedAt: true, revokedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'QR kod bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (session.user.role !== 'ADMIN' && existing.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu QR kodu güncelleme yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const body = await request.json().catch(() => null);
    const ownerWhere = session.user.role === 'ADMIN' ? { id } : { id, dealerId: session.user.id };

    // Arşivden geri alma (P0-24): yalnız açık `restore: true` ile.
    if (body && typeof body === 'object' && (body as Record<string, unknown>).restore === true) {
      if (!existing.archivedAt) {
        return NextResponse.json({ error: 'Bu QR kod arşivde değil' }, { status: 409 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      // Arşivle aynı anda konan iptal (revokedAt === archivedAt) arşivin parçasıdır → kalkar.
      const revokedByArchive =
        existing.revokedAt != null && existing.revokedAt.getTime() === existing.archivedAt.getTime();
      // Kota (F12): geri alınan kod yeniden CANLI olacaksa canlı QR limiti aşılamaz.
      const restoreMakesLive = revokedByArchive || existing.revokedAt == null;
      const restored = await prisma.$transaction(async (tx) => {
        if (restoreMakesLive && session.user.role === 'DEALER') {
          await lockDealerQrQuota(tx, existing.dealerId);
          const verdict = await checkLiveQrQuota(tx, existing.dealerId, 1);
          if (!verdict.allowed) throw new QrQuotaExceededError(verdict);
        }
        const w = await tx.qRCode.updateMany({
          where: { ...ownerWhere, archivedAt: { not: null } },
          data: { archivedAt: null, isActive: true, ...(revokedByArchive ? { revokedAt: null } : {}) },
        });
        if (w.count === 0) return null;
        await tx.auditLog.create({
          data: auditEntry(actorFromSession(session), { action: 'RESTORE_QR_CODE', entity: 'QRCode', entityId: id }, request),
        });
        return tx.qRCode.findUnique({ where: { id } });
      });
      if (!restored) {
        return NextResponse.json({ error: 'QR kod bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      return NextResponse.json(restored, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (existing.archivedAt) {
      return NextResponse.json(
        { error: 'Arşivlenmiş QR kod düzenlenemez. Önce arşivden geri alın.', code: 'ARCHIVED' },
        { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const validated = updateQRCodeSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const data: Prisma.QRCodeUpdateManyMutationInput = {};
    if (validated.data.name !== undefined) data.name = validated.data.name;
    if (validated.data.description !== undefined) data.description = validated.data.description;
    if (validated.data.isActive !== undefined) data.isActive = validated.data.isActive;
    if (validated.data.expiresAt !== undefined) {
      data.expiresAt = validated.data.expiresAt ? new Date(validated.data.expiresAt) : null;
    }
    if (validated.data.revoke !== undefined) {
      data.revokedAt = validated.data.revoke ? new Date() : null;
    }
    if (validated.data.segmentConfig !== undefined) data.segmentConfig = validated.data.segmentConfig === null ? Prisma.JsonNull : (validated.data.segmentConfig as Prisma.InputJsonValue);
    // Koşullu yazım: arada arşivlenmişse (yarış) güncelleme yapılmaz.
    // Kota (F12): `revoke:false` iptal edilmiş kodu yeniden CANLI yapar. Eskiden kontrolsüzdü:
    // rotate (eski iptal, yeni canlı) → eskiyi geri aç → döngü = sınırsız canlı QR. Artık
    // canlı QR limiti bayi kilidi altında, yazımla aynı transaction'da denetlenir.
    const reactivates = validated.data.revoke === false && existing.revokedAt != null && session.user.role === 'DEALER';
    const write = reactivates
      ? await prisma.$transaction(async (tx) => {
          await lockDealerQrQuota(tx, existing.dealerId);
          const verdict = await checkLiveQrQuota(tx, existing.dealerId, 1);
          if (!verdict.allowed) throw new QrQuotaExceededError(verdict);
          return tx.qRCode.updateMany({ where: { ...ownerWhere, archivedAt: null, revokedAt: { not: null } }, data });
        })
      : await prisma.qRCode.updateMany({
          where: { ...ownerWhere, archivedAt: null },
          data,
        });
    if (write.count === 0) {
      return NextResponse.json({ error: 'QR kod bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const updated = await prisma.qRCode.findUnique({ where: { id } });
    return NextResponse.json(updated, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof QrQuotaExceededError) {
      return NextResponse.json(
        {
          error: error.verdict.reason,
          code: 'PLAN_LIMIT_REACHED',
          quota: { used: error.verdict.live, limit: error.verdict.limit, planName: error.verdict.planName },
        },
        { status: 402, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    console.error('Error updating QR code:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'QR kod güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * DELETE /api/qr-codes/[id] — "silme" artık ARŞİVDİR (P0-24).
 *
 * Önceden `qRCode.delete` → `Feedback.qrCode onDelete: Cascade` ile QR'a gelmiş bütün
 * yorumlar, AI analizleri ve telafi teklifleri tek tıkla geri dönüşsüz siliniyordu
 * (bayi kötü yorumları bu yolla temizleyebiliyordu: itibar manipülasyonu).
 *
 * Şimdi: `isActive=false`, `revokedAt` (yoksa), `archivedAt` — yorumlar olduğu gibi kalır,
 * QR yeni tarama kabul etmez ve canlı kotadan düşer; `PATCH {restore:true}` ile geri alınır (geri alma kotadan geçer).
 * `?dryRun=1` → yazmadan etki önizlemesi.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const limited = await enforceRouteRateLimit('qr-codes.archive', session.user.id, 'mutation');
    if (limited) return limited;

    const { id } = await params;
    const existing = await prisma.qRCode.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        dealerId: true,
        isActive: true,
        archivedAt: true,
        revokedAt: true,
        _count: { select: { feedbacks: { where: { deletedAt: null } } } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'QR kod bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const canArchive = session.user.role === 'ADMIN' || existing.dealerId === session.user.id;
    if (!canArchive) {
      return NextResponse.json({ error: 'Bu QR kodu silme yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const impact: DeletionImpact = {
      entity: 'QRCode',
      entityId: id,
      entityLabel: existing.name,
      items: [{ key: 'feedbacks', label: 'Korunacak geri bildirim', value: existing._count.feedbacks }],
      warning: 'QR kod arşivlenir ve yeni tarama kabul etmez. Geri bildirimler silinmez; arşivden geri alınabilir.',
    };

    if (readArchiveIntent(request).dryRun) return impactPreviewResponse(impact);

    if (existing.archivedAt) {
      return NextResponse.json(
        { success: true, archived: true, alreadyArchived: true, qrCode: { id, archivedAt: existing.archivedAt } },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const now = new Date();
    const ownerWhere = session.user.role === 'ADMIN' ? { id } : { id, dealerId: session.user.id };
    const archived = await prisma.$transaction(async (tx) => {
      const w = await tx.qRCode.updateMany({
        where: { ...ownerWhere, archivedAt: null },
        data: {
          isActive: false,
          archivedAt: now,
          // Arşivle konan iptal arşivle aynı zaman damgasını taşır (geri almada ayırt edilir).
          ...(existing.revokedAt ? {} : { revokedAt: now }),
        },
      });
      if (w.count === 0) return false;
      await tx.auditLog.create({
        data: auditEntry(
          actorFromSession(session),
          {
            action: 'ARCHIVE_QR_CODE',
            entity: 'QRCode',
            entityId: id,
            oldData: { isActive: existing.isActive, revokedAt: existing.revokedAt, dealerId: existing.dealerId },
            newData: { archivedAt: now, feedbacksPreserved: existing._count.feedbacks },
          },
          request
        ),
      });
      await tx.analyticsEvent.create({
        data: {
          userId: session.user.id,
          event: 'qr_code_archived',
          category: 'qr',
          data: { qrCodeId: id, feedbacksPreserved: existing._count.feedbacks },
        },
      });
      return true;
    });

    if (!archived) {
      // Eşzamanlı başka bir arşiv isteği önce davrandı → idempotent başarı.
      return NextResponse.json(
        { success: true, archived: true, alreadyArchived: true, qrCode: { id } },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, archived: true, qrCode: { id, archivedAt: now }, impact },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error archiving QR code:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'QR kod arşivlenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

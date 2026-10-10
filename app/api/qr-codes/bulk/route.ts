import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';


export const dynamic = 'force-dynamic';

/** Tek istekte işlenebilecek en fazla QR (önceden 1000'di: tek tıkla toplu etki). */
const QR_BULK_MAX = 200;

const bulkSchema = z.object({
  action: z.string().min(1),
  ids: z.array(z.string().min(1).max(64)).min(1).max(QR_BULK_MAX),
});

const QR_BULK_DELETE_REMOVED_MESSAGE =
  'Toplu silme kaldırıldı: QR kodlar müşteri yorumlarını taşır. Kodları tek tek arşivleyebilirsiniz; arşivlenen kod yeni tarama almaz, yorumlar korunur.';

/**
 * POST /api/qr-codes/bulk — toplu etkinleştir / devre dışı bırak.
 *
 * P0-24: `delete` eylemi KALDIRILDI (410). Önceden 1000 QR'ı tek istekte `deleteMany`
 * ediyordu; `Feedback.qrCode onDelete: Cascade` ile bütün yorumlar, AI analizleri ve
 * telafiler audit'siz yok oluyordu. Arşivlenmiş QR'lar toplu işlemle yeniden açılamaz.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const raw = await request.json().catch(() => null);
    const parsed = bulkSchema.safeParse(raw);
    if (!parsed.success) {
      const tooMany = parsed.error.errors.some((e) => e.path[0] === 'ids' && e.code === 'too_big');
      return NextResponse.json(
        { error: tooMany ? `Tek seferde en fazla ${QR_BULK_MAX} kayıt işlenebilir` : 'action ve ids gerekli' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { action } = parsed.data;
    const ids = Array.from(new Set(parsed.data.ids));

    if (action === 'delete' || action === 'archive') {
      return NextResponse.json(
        { error: QR_BULK_DELETE_REMOVED_MESSAGE, code: 'BULK_DELETE_REMOVED' },
        { status: 410, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (action !== 'activate' && action !== 'deactivate') {
      return NextResponse.json({ error: 'Geçersiz action' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const where = {
      id: { in: ids },
      archivedAt: null,
      ...(session.user.role === 'DEALER' ? { dealerId: session.user.id } : {}),
    };
    const isActive = action === 'activate';

    const count = await prisma.$transaction(async (tx) => {
      const updated = await tx.qRCode.updateMany({ where, data: { isActive } });
      await tx.auditLog.create({
        data: auditEntry(
          actorFromSession(session),
          {
            action: isActive ? 'BULK_ACTIVATE_QR_CODES' : 'BULK_DEACTIVATE_QR_CODES',
            entity: 'QRCode',
            entityId: `${updated.count} QR`,
            newData: { ids, isActive, affected: updated.count },
          },
          request
        ),
      });
      return updated.count;
    });

    return NextResponse.json({ success: true, count }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('QR bulk error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'İşlem başarısız' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

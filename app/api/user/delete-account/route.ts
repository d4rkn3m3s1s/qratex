import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';
import { anonymizeUser } from '@/lib/gdpr-core';
import { isSameEmail } from '@/lib/auth/normalize-email';
import { actorFromSession } from '@/lib/data-safety/audit';
import { previewUserErasure } from '@/lib/data-safety/user-erasure';
import { computeDueAt, completeDsrIfEvidenced, recordDsrEvent } from '@/lib/dsr-workflow';
import { getAuditRequestMeta } from '@/lib/request-metadata';


export const dynamic = 'force-dynamic';

const deleteSchema = z.object({
    confirmEmail: z.string().min(3).max(320),
});

/**
 * DELETE /api/user/delete-account — "hesabımı sil" (KVKK m.7 silme hakkı, self-servis).
 *
 * P0-25: önceden `user.delete` + cascade → kişinin denetim izi, bayinin QR'ları ve o
 * QR'lara gelmiş başka müşterilerin yorumları yok oluyordu; audit de yazılmıyordu.
 * Şimdi hesap `anonymizeUser` ile geri döndürülemez biçimde anonimleştirilir ve aynı
 * transaction'da bir KVKK talebi (deletion) + yürütme kanıtı (`erasure_executed`) yazılır.
 *
 * Kurallar: YÖNETİCİ hesabı kendini silemez; faturalanabilir aboneliği olan bayi önce
 * aboneliğini iptal etmeli (409).
 */
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAuth(['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const { session } = auth;
        const userId = session.user.id;

        if (session.user.role === 'ADMIN') {
            return NextResponse.json(
                { error: 'Yönetici hesapları kendi kendini silemez. Başka bir yöneticiden rolünüzü değiştirmesini isteyin.', code: 'ADMIN_SELF_DELETE' },
                { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const body = await request.json().catch(() => null);
        const parsed = deleteSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'E-posta doğrulaması gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const preview = await previewUserErasure(userId, { actorId: userId, context: 'self' });
        if (!preview) {
            return NextResponse.json({ error: 'Hesap bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (preview.alreadyAnonymized) {
            return NextResponse.json(
                { success: true, message: 'Hesabınız zaten silinmiş durumda' },
                { headers: PRIVATE_NO_STORE_HEADERS }
            );
        }
        if (!isSameEmail(preview.target.email, parsed.data.confirmEmail)) {
            return NextResponse.json({ error: 'E-posta eşleşmiyor' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (preview.impact.blockers?.length) {
            return NextResponse.json(
                { error: preview.impact.blockers[0], code: 'ARCHIVE_BLOCKED', impact: preview.impact },
                { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const originalEmail = preview.target.email;
        const meta = getAuditRequestMeta(request);
        const now = new Date();

        await anonymizeUser(userId, {
            actor: actorFromSession(session),
            reason: 'self_service',
            request,
            now,
            // KVKK kanıt zinciri: başvuru + yürütme + kapanış, anonimleştirmeyle AYNI tx'te.
            withinTx: async (tx, ctx) => {
                const dsr = await tx.dataSubjectRequest.create({
                    data: {
                        userId,
                        email: originalEmail,
                        type: 'deletion',
                        status: 'received',
                        message: 'Self-servis hesap silme (Ayarlar → Hesabımı sil)',
                        dueAt: computeDueAt(now),
                    },
                    select: { id: true },
                });
                await recordDsrEvent(tx, { requestId: dsr.id, type: 'received', actorId: userId, detail: { channel: 'self_service' }, meta });
                await recordDsrEvent(tx, {
                    requestId: dsr.id,
                    type: 'erasure_executed',
                    actorId: userId,
                    detail: { channel: 'self_service', counts: ctx.counts },
                    meta,
                });
                await completeDsrIfEvidenced(tx, dsr.id, userId, meta);
            },
        });

        return NextResponse.json(
            { success: true, message: 'Hesabınız silindi. Kişisel verileriniz geri döndürülemez biçimde anonimleştirildi.' },
            { headers: PRIVATE_NO_STORE_HEADERS }
        );
    } catch (error) {
        if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
            return NextResponse.json({ error: 'Hesap bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
        }
        console.error('Account deletion error:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Hesap silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}

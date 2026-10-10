import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';
import { anonymizeUser } from '@/lib/gdpr-core';
import { isSameEmail } from '@/lib/auth/normalize-email';
import { actorFromSession } from '@/lib/data-safety/audit';
import { previewUserErasure } from '@/lib/data-safety/user-erasure';
import { computeDueAt, completeDsrIfEvidenced, recordDsrEvent } from '@/lib/dsr-workflow';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { getReauthRequirements, verifySensitiveReauth } from '@/lib/customer-settings/reauth.server';


export const dynamic = 'force-dynamic';

const deleteSchema = z.object({
    confirmEmail: z.string().min(3).max(320),
    /** Şifreli hesapta zorunlu (denetim B4: yeniden kimlik doğrulama). */
    password: z.string().max(200).optional(),
    /** 2FA açık hesapta zorunlu. */
    totp: z.string().max(12).optional(),
});

const ROLES = ['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN'] as const;

function sessionJti(session: unknown): string | null {
    const jti = (session as { jti?: unknown } | null)?.jti;
    return typeof jti === 'string' && jti ? jti : null;
}

/**
 * GET /api/user/delete-account — silme öncesi kayıp özeti + gereken yeniden doğrulama.
 * Kullanıcı neyi kaybedeceğini ve hangi bilgiyle onaylayacağını sunucudan öğrenir.
 */
export async function GET() {
    try {
        const auth = await requireAuth([...ROLES]);
        if ('error' in auth) return auth.error;
        const { session } = auth;
        const userId = session.user.id;

        const preview = await previewUserErasure(userId, { actorId: userId, context: 'self' });
        if (!preview) {
            return NextResponse.json({ success: false, error: 'Hesap bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
        }
        const [badges, rewards, reauth] = await Promise.all([
            prisma.userBadge.count({ where: { userId } }),
            prisma.userReward.count({ where: { userId } }),
            getReauthRequirements(userId, sessionJti(session)),
        ]);
        const count = (key: string) => Number(preview.impact.items.find((i) => i.key === key)?.value ?? 0);

        return NextResponse.json(
            {
                success: true,
                data: {
                    selfDeleteAllowed: session.user.role !== 'ADMIN',
                    alreadyAnonymized: preview.alreadyAnonymized,
                    blockers: preview.impact.blockers ?? [],
                    losses: {
                        points: Math.max(0, preview.target.points ?? 0),
                        badges,
                        rewards,
                        feedbacks: count('feedbacks'),
                        reviews: count('reviews'),
                    },
                    reauth,
                },
            },
            { headers: PRIVATE_NO_STORE_HEADERS }
        );
    } catch (error) {
        console.error('Account deletion preview error:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ success: false, error: 'Silme özeti alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
    }
}

/**
 * DELETE /api/user/delete-account — "hesabımı sil" (KVKK m.7 silme hakkı, self-servis).
 *
 * P0-25: önceden `user.delete` + cascade → kişinin denetim izi, bayinin QR'ları ve o
 * QR'lara gelmiş başka müşterilerin yorumları yok oluyordu; audit de yazılmıyordu.
 * Şimdi hesap `anonymizeUser` ile geri döndürülemez biçimde anonimleştirilir ve aynı
 * transaction'da bir KVKK talebi (deletion) + yürütme kanıtı (`erasure_executed`) yazılır.
 *
 * Denetim B4: açık bir oturuma erişen herkes silemesin diye yeniden kimlik doğrulama
 * zorunlu — şifre (varsa) + 2FA kodu (açıksa); ikisi de yoksa oturum son 10 dk içinde
 * açılmış olmalı. Hassas işlem hız sınırı: 5 deneme / 15 dk.
 *
 * Kurallar: YÖNETİCİ hesabı kendini silemez; faturalanabilir aboneliği olan bayi önce
 * aboneliğini iptal etmeli (409).
 */
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAuth([...ROLES]);
        if ('error' in auth) return auth.error;
        const { session } = auth;
        const userId = session.user.id;

        if (session.user.role === 'ADMIN') {
            return NextResponse.json(
                { error: 'Yönetici hesapları kendi kendini silemez. Başka bir yöneticiden rolünüzü değiştirmesini isteyin.', code: 'ADMIN_SELF_DELETE' },
                { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        try {
            const rl = await checkRateLimitDb(`account_delete:${userId}`, 5, 15 * 60_000);
            if (rl && !rl.ok) {
                return NextResponse.json(
                    { error: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.', code: 'RATE_LIMITED' },
                    { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
                );
            }
        } catch (rlError) {
            console.warn('[delete-account] hız sınırı kontrolü başarısız', rlError);
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
            return NextResponse.json({ error: 'E-posta eşleşmiyor', code: 'EMAIL_MISMATCH' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const reauth = await verifySensitiveReauth(
            userId,
            { password: parsed.data.password, totp: parsed.data.totp },
            { jti: sessionJti(session) }
        );
        if (!reauth.ok) {
            return NextResponse.json(
                { error: reauth.message, code: reauth.code, methods: reauth.methods },
                { status: reauth.status, headers: PRIVATE_NO_STORE_HEADERS }
            );
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
                        message: 'Self-servis hesap silme (Ayarlar → Gizlilik → Hesabımı sil)',
                        dueAt: computeDueAt(now),
                    },
                    select: { id: true },
                });
                await recordDsrEvent(tx, { requestId: dsr.id, type: 'received', actorId: userId, detail: { channel: 'self_service', reauth: reauth.methods }, meta });
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

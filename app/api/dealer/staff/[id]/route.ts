import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { invalidateStaffScope } from '@/lib/auth/scope';
import { invalidateSessionState } from '@/lib/auth/session-state';
import { bumpSessionVersion } from '@/lib/auth/session-version';
import { z } from 'zod';

/** Yanıt DTO'su: PIN hiçbir zaman ham dönmez (GET listesiyle tutarlı: `****`). */
function staffDto(row: { id: string; userId: string; dealerId: string; jobTitle: string | null; pinCode: string | null; isActive: boolean; createdAt: Date }) {
  return {
    id: row.id,
    userId: row.userId,
    dealerId: row.dealerId,
    jobTitle: row.jobTitle,
    pinCode: row.pinCode ? '****' : null,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

const patchStaffSchema = z.object({
  jobTitle: z.string().trim().max(50).nullable().optional(),
  // Liste PIN'i `****` olarak maskeli döner; düzenleme formu bu maskeyi geri gönderirse
  // "PIN değişmedi" sayılır (eskiden 400 "PIN 4-6 haneli olmalı" ile kaydı engelliyordu).
  pinCode: z.preprocess(
    (v) => (v === '****' ? undefined : v),
    z.string().regex(/^\d{4,6}$/, 'PIN 4-6 haneli olmalı').nullable().optional()
  ),
  isActive: z.boolean().optional(),
});


export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const auditMeta = getAuditRequestMeta(request);
        const auth = await requireAuth(['DEALER']);
        if ('error' in auth) return auth.error;
        const { session } = auth;

        const params = await props.params;
        const staffId = params.id;
        const parsed = patchStaffSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        const { jobTitle, pinCode, isActive } = parsed.data;

        const data: { jobTitle?: string | null; pinCode?: string | null; isActive?: boolean } = {};
        if (jobTitle !== undefined) data.jobTitle = jobTitle;
        if (pinCode !== undefined) data.pinCode = pinCode;
        if (isActive !== undefined) data.isActive = isActive;

        if (Object.keys(data).length === 0) {
            const updated = await prisma.dealerStaff.findFirst({
                where: { id: staffId, dealerId: session.user.id },
            });
            if (!updated) {
                return NextResponse.json({ success: false, error: 'Personel bulunamadı veya yetkisiz erişim' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
            }
            return NextResponse.json({ success: true, staff: staffDto(updated) }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        const write = await prisma.dealerStaff.updateMany({
            where: { id: staffId, dealerId: session.user.id },
            data,
        });

        if (write.count === 0) {
            return NextResponse.json({ success: false, error: 'Personel bulunamadı veya yetkisiz erişim' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const updated = await prisma.dealerStaff.findUnique({
            where: { id: staffId },
        });
        if (!updated) {
            return NextResponse.json({ success: false, error: 'Personel bulunamadı veya yetkisiz erişim' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        // Pasifleştirme/yeniden etkinleştirme kapsamı ANINDA etkilesin (Redis sıcak katmanı düşür).
        if (isActive !== undefined) {
            // A2: pasifleştirmede personelin AÇIK oturumları da düşer (sessionVersion artar → eski JWT'ler geçersiz).
            if (isActive === false) {
                await bumpSessionVersion(updated.userId).catch(() => {});
            }
            await Promise.all([
                invalidateStaffScope(updated.userId).catch(() => {}),
                // requireAuth'un oturum durumu önbelleği de düşsün: pasif personel bir sonraki istekte dışarıda.
                invalidateSessionState(updated.userId).catch(() => {}),
            ]);
        }

        await prisma.auditLog.create({
            data: {
                userId: session.user.id,
                action: 'UPDATE_STAFF',
                entity: 'DealerStaff',
                entityId: staffId,
                // PIN denetim kaydına yazılmaz (yalnız değişip değişmediği).
                newData: { jobTitle, pinChanged: pinCode !== undefined, isActive },
                ...auditMeta,
            },
        });

        return NextResponse.json({ success: true, staff: staffDto(updated) }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Update staff error:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ success: false, error: 'Personel güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}

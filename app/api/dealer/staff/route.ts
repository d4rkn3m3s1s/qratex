import { assertModuleEnabled } from '@/lib/module-gate';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { getPublicAppOrigin, getPublicOriginFromRequest } from '@/lib/public-app-origin';
import {
  createStaffInvitation,
  listPendingInvitations,
  sendStaffInvitationEmail,
} from '@/lib/staff-invitations';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

/**
 * P0-04: Personel ekleme artık DAVET akışıdır. Şema bilerek `password` ALMAZ (bayi şifre
 * belirleyemez) ve var olan hiçbir kullanıcı satırına yazılmaz. Eski istemcilerin gönderdiği
 * `name` / `password` / `pinCode` alanları yok sayılır (zod strip).
 */
const inviteStaffSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.').max(191),
  jobTitle: z.string().trim().max(50).optional(),
});

/** Bayi başına saatlik davet sınırı (e-posta bombardımanı / numaralandırma engeli). */
const INVITES_PER_HOUR = 20;

export async function GET() {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    // staff_management modülü kapalıysa uç da kapalı (yalnız menüde değil).
    const moduleGate = await assertModuleEnabled('staff_management', { role: 'dealer' }).catch(() => null);
    if (moduleGate) return moduleGate;
    const dealerId = auth.session.user.id;
    const limited = await enforceRouteRateLimit('dealer.staff.list', dealerId, 'read');
    if (limited) return limited;

    const [staff, pendingInvitations] = await Promise.all([
      prisma.dealerStaff.findMany({
        where: { dealerId, isActive: true },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      listPendingInvitations(dealerId),
    ]);

    return NextResponse.json({
      success: true,
      staff: staff.map((s) => ({
        id: s.id,
        userId: s.userId,
        jobTitle: s.jobTitle,
        pinCode: s.pinCode ? '****' : null,
        isActive: s.isActive,
        createdAt: s.createdAt,
        user: s.user,
      })),
      pendingInvitations,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Dealer staff GET:', error);
    return NextResponse.json(
      { error: 'Personel listesi yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/**
 * POST /api/dealer/staff — personel DAVETİ oluşturur ve davetliye e-posta gönderir.
 * Davetli bağlantıdan kendi hesabını açar ya da (hesabı varsa) giriş yapıp kendisi onaylar.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    // staff_management modülü kapalıysa uç da kapalı (yalnız menüde değil).
    const moduleGate = await assertModuleEnabled('staff_management', { role: 'dealer' }).catch(() => null);
    if (moduleGate) return moduleGate;
    const dealerId = auth.session.user.id;

    const rl = await checkRateLimitDb(`staff-invite:${dealerId}`, INVITES_PER_HOUR, 60 * 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: 'Bir saat içinde çok fazla davet gönderdiniz. Lütfen daha sonra tekrar deneyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 3_600_000) / 1000)),
          },
        }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = inviteStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Geçersiz veri' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const created = await createStaffInvitation({
      dealerId,
      invitedById: dealerId,
      email: parsed.data.email,
      jobTitle: parsed.data.jobTitle ?? null,
    });
    if (!created.ok) {
      return NextResponse.json(
        { success: false, error: created.error, code: created.code },
        { status: created.status, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const dealer = await prisma.user.findUnique({
      where: { id: dealerId },
      select: { businessName: true, name: true },
    });
    const emailSent = await sendStaffInvitationEmail({
      to: created.invitation.email,
      plainToken: created.plainToken,
      businessName: dealer?.businessName || dealer?.name || 'İşletme',
      jobTitle: created.invitation.jobTitle,
      origin: getPublicOriginFromRequest(request) ?? getPublicAppOrigin(),
    });

    await prisma.auditLog
      .create({
        data: {
          userId: dealerId,
          action: 'INVITE_STAFF',
          entity: 'StaffInvitation',
          entityId: created.invitation.id,
          newData: { jobTitle: created.invitation.jobTitle, emailSent },
          ...getAuditRequestMeta(request),
        },
      })
      .catch(() => {});

    return NextResponse.json(
      {
        success: true,
        invited: true,
        emailSent,
        invitation: created.invitation,
        message: emailSent
          ? 'Davet gönderildi. Kişi e-postadaki bağlantıdan daveti kabul ettiğinde ekibinizde görünecek.'
          : 'Davet oluşturuldu ancak e-posta şu anda gönderilemedi. Lütfen biraz sonra daveti yeniden gönderin.',
      },
      { status: 201, headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Dealer staff POST:', error);
    return NextResponse.json(
      { success: false, error: 'Davet oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

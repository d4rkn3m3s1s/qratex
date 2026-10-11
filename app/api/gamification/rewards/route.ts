import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth, getOptionalSession } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { getClientIdentifier } from '@/lib/rate-limit';
import { createRewardSchema } from '@/lib/validations';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { captureApiError } from '@/lib/capture-api-error';
import { assertModuleEnabled } from '@/lib/module-gate';
import { stripPrivateMetadata } from '@/lib/admin-store/code-pool';
import { defineRoute, ok } from '@/lib/http/define-route';
import { claimReward } from '@/lib/wallet-rewards/mutations';
import { rethrowAsApiError } from '@/lib/wallet-rewards/http';
import { assertCustomerModule } from '@/lib/customer-wallet/gate';

// Force dynamic rendering - disable caching
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // Herkese açık katalog okuması: IP başına kötüye kullanım tavanı (oturum isteğe bağlı).
    const limited = await enforceRouteRateLimit('gamification.rewards.read', getClientIdentifier(req), 'read');
    if (limited) return limited;
    const gate = await assertModuleEnabled('rewards');
    if (gate) return gate;
    // Doğrulanmış isteğe bağlı oturum: kendi kuponların ve ADMIN arşiv görünümü ham JWT ile değil
    // DB rolü + yönetici kapısıyla (getOptionalSession, lib/api-auth).
    const session = await getOptionalSession();
    const { searchParams } = new URL(req.url);
    const myRewards = searchParams.get('myRewards') === 'true';
    const status = searchParams.get('status');

    // If requesting user's claimed rewards
    if (myRewards && session?.user?.id) {
      const userRewards = await prisma.userReward.findMany({
        where: { userId: session.user.id },
        include: {
          reward: {
            select: {
              id: true,
              name: true,
              description: true,
              icon: true,
              type: true,
              cost: true,
            },
          },
        },
        orderBy: { redeemedAt: 'desc' },
        take: 200,
      });

      return NextResponse.json(
        {
          success: true,
          data: userRewards.map((ur) => ({
            id: ur.id,
            code: ur.code,
            redeemedAt: ur.redeemedAt,
            claimedAt: ur.claimedAt,
            isUsed: !!ur.claimedAt,
            reward: ur.reward,
          })),
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const isAdmin = session?.user?.role === 'ADMIN';
    const isActiveFilter = status === 'inactive' ? false : status === 'active' ? true : undefined;

    // Default: get all available rewards. Arşivlenmiş ("silinmiş") ödüller listede görünmez;
    // admin `?status=archived` ile arşivi görür (P0-26).
    const rewards = await prisma.reward.findMany({
      where: {
        ...(isAdmin
          ? status === 'archived'
            ? { archivedAt: { not: null } }
            : isActiveFilter !== undefined
              ? { isActive: isActiveFilter, archivedAt: null }
              : { archivedAt: null }
          : { isActive: true, archivedAt: null }),
      },
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: { cost: 'asc' },
      take: 200,
    });

    // Partner kupon kod havuzu yalnız admin BFF'inde görünür (/api/admin/store/rewards).
    return NextResponse.json(
      { success: true, data: rewards.map(stripPrivateMetadata) },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    captureApiError(error, { route: 'GET /api/gamification/rewards', status: 500 });
    console.error('Rewards fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Ödüller yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(req: Request) {
  try {
    const gate = await assertModuleEnabled('rewards');
    if (gate) return gate;
    const auditMeta = getAuditRequestMeta(req);
    // P0-01: yönetici yazma ucu → gizli kapı + DB rolü (`requireAuth`); ham oturum rolü yetmez.
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('gamification.rewards.create', auth.session.user.id, 'mutation');
    if (limited) return limited;
    const { session } = auth;

    // Doğrulama hatası 400 + Türkçe mesaj (eskiden `.parse` ZodError fırlatıp 500 dönüyordu).
    const body: unknown = await req.json().catch(() => null);
    const parsedReward = createRewardSchema.safeParse(body);
    if (!parsedReward.success) {
      return NextResponse.json(
        { success: false, error: parsedReward.error.errors[0]?.message ?? 'Geçersiz ödül bilgisi', code: 'VALIDATION' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const validatedData = parsedReward.data;

    const reward = await prisma.reward.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        icon: validatedData.icon,
        cost: validatedData.cost,
        stock: validatedData.stock,
        type: validatedData.type,
        ...(validatedData.metadata ? { metadata: validatedData.metadata as object } : {}),
        // B7: gönderilen "Aktif" anahtarı uygulanır (eski davranış: her zaman true).
        isActive: typeof (body as { isActive?: unknown })?.isActive === 'boolean' ? (body as { isActive: boolean }).isActive : true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_REWARD',
        entity: 'Reward',
        entityId: reward.id,
        newData: reward as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({
      success: true,
      data: reward,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (err) {
    const db = responseIfDatabaseUnavailable(err);
    if (db) return db;
    captureApiError(err, { route: 'POST /api/gamification/rewards', status: 500 });
    console.error('Reward create error:', err);
    return NextResponse.json(
      { success: false, error: 'Ödül oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * PATCH /api/gamification/rewards — ESKİ ödül alma ucu (geriye uyumlu takma ad).
 *
 * Eskiden ayrı bir alım yolu vardı: ham `getServerSession` (rol yok, askıdaki hesap geçiyordu),
 * kimlikten ÖNCE ve kullanıcıya bağlanmamış idempotency önbelleği (sızan anahtarla başkasının
 * kupon kodu okunabiliyordu), şemasız gövde ve kişi başı limitin kilitsiz sayımı (eşzamanlı
 * taleple aşılabiliyordu). Artık Cüzdan → Ödüller ucuyla AYNI servis (`claimReward`: kullanıcı
 * satırı kilidi altında limit + stok + havuz + defterli borç) ve aynı kapılar kullanılır.
 * Yeni istemci: POST /api/customer/wallet/rewards/claim.
 */
export const PATCH = defineRoute(
  {
    name: 'gamification.rewards.claim.legacy',
    roles: ['CUSTOMER'],
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
    schema: z.object({ rewardId: z.string().trim().min(1).max(64) }),
    idempotent: true,
  },
  async ({ body, user, request }) => {
    await assertCustomerModule('rewards', null, { userId: user.id, request, routeKey: 'gamification.rewards.claim.legacy' });
    try {
      const result = await claimReward({
        userId: user.id,
        rewardId: body.rewardId,
        requestKey: request.headers.get('idempotency-key'),
        audit: getAuditRequestMeta(request),
      });
      return ok({
        message: 'Ödül başarıyla talep edildi',
        rewardName: result.rewardName,
        cost: result.cost,
        newBalance: result.newBalance,
        couponCode: result.code,
        userRewardId: result.userRewardId,
      });
    } catch (err) {
      rethrowAsApiError(err);
    }
  }
);

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { assertModuleEnabled } from '@/lib/module-gate';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { emailLookupFilter } from '@/lib/auth/normalize-email';
import { maskEmail, publicDisplayName } from '@/lib/http/dto';
import {
  SURPRISE_BOX_LIMITS,
  checkCampaign,
  confirmationMatches,
  requiresConfirmation,
  type CampaignTotals,
} from '@/lib/admin-surprise-box';
import { sentTodayBySender, validateBoxCoupon } from '@/lib/admin-surprise-boxes/server';

/**
 * POST /api/admin/surprise-box/send — admin sürpriz kutu gönderimi (P0-19).
 *
 * İki adım:
 *  1. `dryRun: true` → alıcı sayısı, kutu başı / toplam puan, günlük bütçe ve (tek alıcıda)
 *     maskelenmiş alıcı önizlemesi döner. Hiçbir şey yazılmaz.
 *  2. Gönderim: puanlı ya da çok alıcılı ise `confirm: { recipientCount, totalPoints }`
 *     önizlemedeki değerlerle birebir aynı olmalı; değilse 409 + güncel önizleme.
 *
 * Tavanlar `lib/admin-surprise-box.ts`. Kutular, alıcı bildirimleri ve AuditLog tek
 * transaction'da; gönderen başına danışma kilidi (advisory lock) günlük bütçe okumasını
 * yarışsız yapar. `requestId` kampanya kimliğidir: aynı kimlikle tekrar kutu üretilmez.
 */
const sendSchema = z
  .object({
    title: z.string().trim().min(1, 'Başlık girin').max(200, 'Başlık en fazla 200 karakter olabilir'),
    message: z.string().max(2000, 'Mesaj en fazla 2.000 karakter olabilir').optional(),
    couponCode: z.string().trim().max(50).optional(),
    points: z
      .number({ invalid_type_error: 'Puan sayı olmalı' })
      .int('Puan tam sayı olmalı')
      .min(0, 'Puan negatif olamaz')
      .max(
        SURPRISE_BOX_LIMITS.maxPointsPerBox,
        `Kutu başına en fazla ${SURPRISE_BOX_LIMITS.maxPointsPerBox.toLocaleString('tr-TR')} puan verilebilir`
      )
      .default(0),
    rewardType: z.string().max(50).optional(),
    // Tek kullanıcı: userId veya email
    userId: z.string().min(1).max(64).optional(),
    email: z.string().email('Geçerli bir e-posta girin').max(254).optional(),
    // Rastgele N müşteri
    randomCount: z.number().int().min(1).max(SURPRISE_BOX_LIMITS.maxRecipients).optional(),
    dryRun: z.boolean().optional(),
    confirm: z
      .object({
        recipientCount: z.number().int().min(0),
        totalPoints: z.number().int().min(0),
      })
      .optional(),
    requestId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,100}$/, 'Geçersiz istek kimliği')
      .optional(),
  })
  .refine((b) => [b.userId, b.email, b.randomCount].filter((v) => v !== undefined).length === 1, {
    message: 'Tek bir hedef belirtin: kullanıcı ID, e-posta veya rastgele müşteri sayısı (1–500).',
  });

export const dynamic = 'force-dynamic';

type Preview = CampaignTotals & {
  mode: 'single' | 'random';
  remainingToday: number;
  limits: typeof SURPRISE_BOX_LIMITS;
  recipient?: { id: string; name: string | null; email: string | null };
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

/** POST: Admin sürpriz kutu gönderir (isimle veya rastgele) */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const senderId = auth.session.user.id;
  const gate = await assertModuleEnabled('surprise_boxes', {
    role: 'system',
    request: req,
    userId: senderId,
    routeKey: '/admin/surprise-boxes/send',
  });
  if (gate) return gate;

  try {
    const parsed = sendSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? 'Geçersiz istek',
          details: parsed.error.flatten(),
        },
        400
      );
    }
    const input = parsed.data;
    const now = new Date();

    if (!input.dryRun) {
      const rl = await checkRateLimitDb(`admin_surprise_send:${senderId}`, 30, 60 * 60_000);
      if (!rl.ok) {
        return json({ success: false, error: 'Çok fazla gönderim. Biraz sonra tekrar deneyin.' }, 429);
      }
    }

    // ── Hedef çözümleme ──
    let targetUserIds: string[] = [];
    let recipient: Preview['recipient'];
    const mode: Preview['mode'] = input.randomCount ? 'random' : 'single';

    if (input.userId || input.email) {
      const u = await prisma.user.findFirst({
        where: input.userId ? { id: input.userId } : { email: emailLookupFilter(input.email) },
        select: { id: true, name: true, email: true, role: true, suspendedAt: true, anonymizedAt: true, fraudStatus: true },
      });
      if (!u) {
        return json({ success: false, error: 'Belirtilen kullanıcı bulunamadı.' }, 404);
      }
      if (u.role !== 'CUSTOMER') {
        return json({ success: false, error: 'Sürpriz kutu yalnız müşterilere gönderilebilir.' }, 400);
      }
      if (u.suspendedAt || u.anonymizedAt) {
        return json({ success: false, error: 'Bu hesap askıda ya da anonimleştirilmiş; kutu gönderilemez.' }, 409);
      }
      if (u.fraudStatus === 'shadow_ban') {
        return json({ success: false, error: 'Bu hesap dolandırıcılık incelemesinde; kutu gönderilemez.' }, 409);
      }
      targetUserIds = [u.id];
      recipient = { id: u.id, name: publicDisplayName(u.name, 'İsimsiz müşteri'), email: maskEmail(u.email) };
    } else if (input.randomCount) {
      // Gerçek rastgele örnek (veritabanı tarafında); önceki `take N*2` + `sort(random)` her
      // seferinde tablonun başındaki aynı kümeyi seçiyordu.
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User"
        WHERE "role" = 'CUSTOMER'
          AND "suspendedAt" IS NULL
          AND "anonymizedAt" IS NULL
          AND "fraudStatus" <> 'shadow_ban'
        ORDER BY random()
        LIMIT ${input.randomCount}`;
      targetUserIds = rows.map((r) => r.id);
    }

    const usedToday = await sentTodayBySender(prisma, senderId, now);
    const check = checkCampaign({
      recipientCount: targetUserIds.length,
      pointsPerBox: input.points,
      sentTodayBySender: usedToday,
    });
    const preview: Preview = {
      mode,
      ...check.totals,
      remainingToday: check.remainingToday,
      limits: SURPRISE_BOX_LIMITS,
      ...(recipient ? { recipient } : {}),
    };

    if (!check.ok) {
      return json({ success: false, error: check.message, code: check.code, preview }, check.code === 'NO_RECIPIENTS' ? 400 : 422);
    }

    // Kupon gerçek bir Coupon kaydına bağlı olmalı (aktif, süresi geçmemiş, hak yeterli).
    const coupon = await validateBoxCoupon(input.couponCode, targetUserIds.length, now);
    if (!coupon.ok) {
      return json({ success: false, code: 'COUPON_INVALID', error: coupon.message, preview }, 422);
    }
    const couponCode = coupon.code;

    if (input.dryRun) {
      return json({ success: true, dryRun: true, preview });
    }

    if (requiresConfirmation(check.totals) && !confirmationMatches(check.totals, input.confirm ?? {})) {
      return json(
        {
          success: false,
          code: 'CONFIRMATION_REQUIRED',
          error: `Gönderimi onaylayın: ${check.totals.recipientCount.toLocaleString('tr-TR')} alıcı, toplam ${check.totals.totalPoints.toLocaleString('tr-TR')} puan.`,
          preview,
        },
        409
      );
    }

    const campaignId = input.requestId ?? `sb_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const auditMeta = getAuditRequestMeta(req);

    type TxResult =
      | { kind: 'sent'; count: number }
      | { kind: 'duplicate'; count: number }
      | { kind: 'over_budget'; remaining: number }
      | { kind: 'foreign_campaign' };

    const result: TxResult = await prisma.$transaction(async (tx) => {
      // Aynı gönderen için gönderimler sıraya girer: bütçe okuması + yazım yarışsız.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`surprise-box-send:${senderId}`}))`;

      if (input.requestId) {
        // Kampanya kimliği istemciden gelir: başka bir yöneticinin kampanyasıyla çakışırsa
        // kutular o kampanyaya karışır (liste/geri çekme ikisini birlikte etkiler) → reddet.
        const foreign = await tx.userSurpriseBox.findFirst({
          where: { dayKey: null, sentByUserId: { not: senderId }, metadata: { path: ['campaignId'], equals: campaignId } },
          select: { id: true },
        });
        if (foreign) return { kind: 'foreign_campaign' };
        const existing = await tx.userSurpriseBox.count({
          where: { sentByUserId: senderId, metadata: { path: ['campaignId'], equals: campaignId } },
        });
        if (existing > 0) return { kind: 'duplicate', count: existing };
      }

      const used = await sentTodayBySender(tx, senderId, now);
      const again = checkCampaign({
        recipientCount: targetUserIds.length,
        pointsPerBox: input.points,
        sentTodayBySender: used,
      });
      if (!again.ok) return { kind: 'over_budget', remaining: again.remainingToday };

      const metadata = { campaignId, source: 'admin_send' } as Prisma.InputJsonObject;
      const created = await tx.userSurpriseBox.createMany({
        data: targetUserIds.map((uid) => ({
          userId: uid,
          sentByUserId: senderId,
          title: input.title,
          message: input.message ?? null,
          couponCode,
          points: input.points,
          rewardType: input.rewardType ?? (input.points > 0 ? 'points' : couponCode ? 'coupon' : null),
          metadata,
        })),
      });

      await tx.notification.createMany({
        data: targetUserIds.map((uid) => ({
          userId: uid,
          title: '🎁 Bir sürpriz kutunuz var!',
          message: `${input.title} — açmak için Ödüllerim sayfanıza göz atın.`,
          type: 'success',
          data: { kind: 'surprise_box', campaignId, href: '/customer/wallet/owned' } as Prisma.InputJsonObject,
        })),
      });

      await tx.auditLog.create({
        data: {
          userId: senderId,
          actorType: 'user',
          actorSnapshot: {
            email: auth.session.user.email ?? null,
            role: 'ADMIN',
            name: auth.session.user.name ?? null,
          } as Prisma.InputJsonObject,
          action: 'SURPRISE_BOX_SEND',
          entity: 'SurpriseBoxCampaign',
          entityId: campaignId,
          newData: {
            title: input.title,
            mode,
            recipientCount: created.count,
            pointsPerBox: input.points,
            totalPoints: created.count * input.points,
            couponCode,
            // Tek alıcıda kim olduğu iz için gerekli; toplu gönderimde ilk 50 id yeter.
            recipientIds: targetUserIds.slice(0, 50),
          } as Prisma.InputJsonObject,
          ipAddress: auditMeta.ipAddress,
          userAgent: auditMeta.userAgent,
        },
      });

      return { kind: 'sent', count: created.count };
    });

    if (result.kind === 'foreign_campaign') {
      return json(
        { success: false, code: 'CAMPAIGN_ID_CONFLICT', error: 'Bu kampanya kimliği başka bir yöneticiye ait. Formu yenileyip tekrar gönderin.' },
        409
      );
    }

    if (result.kind === 'over_budget') {
      return json(
        {
          success: false,
          code: 'DAILY_BUDGET_EXCEEDED',
          error: `Bugünkü sürpriz kutu puan bütçeniz yetmiyor (kalan ${result.remaining.toLocaleString('tr-TR')}).`,
        },
        422
      );
    }

    return json({
      success: true,
      data: {
        campaignId,
        count: result.count,
        totalPoints: result.count * input.points,
        duplicate: result.kind === 'duplicate',
      },
    });
  } catch (e) {
    console.error('Admin surprise-box send error:', e);
    return json({ success: false, error: 'Kutu gönderilemedi' }, 500);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { cancelSquadBattle, settleSquadBattle } from '@/lib/squad-battle-service';

export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const params = await context.params;

    const battle = await prisma.squadBattle.findUnique({
      where: { id: params.id },
      include: {
        squad1: true,
        squad2: true,
        participants: {
          include: {
            user: { select: { id: true, name: true, image: true } }
          }
        }
      }
    });

    if (!battle) {
      return json({ error: 'Savaş bulunamadı' }, 404);
    }

    return json({ success: true, battle });
  } catch (error) {
    return json({ error: 'Savaş detayları getirilemedi' }, 500);
  }
}

/**
 * PATCH — yalnız adlandırılmış geçişler (P0-20). Ham `status` / `rewardPool` / skor yazımı
 * kaldırıldı: tamamlanmış savaşı yeniden `active` yapıp havuzu ikinci kez ödetmek ve fonlu
 * havuzu büyütüp puan basmak mümkündü.
 *   { action: 'finish' }                               → aktif savaşı sonlandır + öde
 *   { action: 'cancel', reason }                       → bekleyen/aktif savaşı iadeli iptal et
 *   { action: 'extend', endTime }                      → açık savaşın bitişini ileri al
 *   { action: 'adjust_score', squad1Score, squad2Score, reason } → aktif savaşta skor düzeltmesi
 */
const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('finish') }),
  z.object({
    action: z.literal('cancel'),
    reason: z.string().trim().min(3, 'İptal gerekçesi en az 3 karakter olmalı').max(500).default('Yönetici iptali'),
  }),
  z.object({
    action: z.literal('extend'),
    endTime: z.string().datetime({ offset: true, message: 'Geçerli bir bitiş zamanı girin' }),
  }),
  z.object({
    action: z.literal('adjust_score'),
    squad1Score: z.number().int().min(0).max(10_000_000),
    squad2Score: z.number().int().min(0).max(10_000_000),
    reason: z.string().trim().min(5, 'Skor düzeltmesi için en az 5 karakterlik gerekçe yazın').max(500),
  }),
]);

const MAX_EXTEND_MS = 168 * 60 * 60 * 1000; // en fazla 1 hafta ileri

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const actor = { actorId: auth.session.user.id, actorRole: 'admin' as const };

    const params = await context.params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return json(
        {
          error:
            parsed.error.errors[0]?.message ??
            'Geçersiz işlem. Kullanılabilir işlemler: finish, cancel, extend, adjust_score.',
        },
        400
      );
    }
    const input = parsed.data;

    if (input.action === 'finish') {
      const settled = await settleSquadBattle(params.id, actor);
      if (!settled) {
        return json({ error: 'Savaş aktif değil ya da zaten sonuçlandırılmış.', code: 'NOT_ACTIVE' }, 409);
      }
      return json({
        success: true,
        battle: settled.battle,
        summary: {
          winnerId: settled.winnerId,
          paidOut: settled.paidOut,
          perPerson: settled.perPerson,
          refunded: settled.refunded,
        },
      });
    }

    if (input.action === 'cancel') {
      const r = await cancelSquadBattle(prisma, params.id, { ...actor, reason: input.reason });
      if (r.status === 'noop') {
        return r.currentStatus
          ? json({ error: 'Bu savaş zaten sonuçlanmış ya da iptal edilmiş.', code: 'NOT_OPEN' }, 409)
          : json({ error: 'Savaş bulunamadı' }, 404);
      }
      return json({ success: true, status: 'cancelled', refunded: r.refunded });
    }

    const auditMeta = getAuditRequestMeta(request);

    if (input.action === 'extend') {
      const endTime = new Date(input.endTime);
      const now = Date.now();
      if (endTime.getTime() <= now || endTime.getTime() - now > MAX_EXTEND_MS) {
        return json({ error: 'Bitiş zamanı gelecekte ve en fazla 7 gün sonra olmalı.' }, 400);
      }
      const updated = await prisma.$transaction(async (tx) => {
        const before = await tx.squadBattle.findUnique({ where: { id: params.id }, select: { endTime: true, status: true } });
        const r = await tx.squadBattle.updateMany({
          where: { id: params.id, status: { in: ['pending', 'active'] }, endTime: { lt: endTime } },
          data: { endTime },
        });
        if (r.count === 0) return null;
        await tx.auditLog.create({
          data: {
            userId: actor.actorId,
            action: 'SQUAD_BATTLE_EXTEND',
            entity: 'SquadBattle',
            entityId: params.id,
            oldData: { endTime: before?.endTime?.toISOString() ?? null, status: before?.status ?? null },
            newData: { endTime: endTime.toISOString() },
            ...auditMeta,
          },
        });
        return tx.squadBattle.findUnique({ where: { id: params.id } });
      });
      if (!updated) {
        return json({ error: 'Yalnız açık bir savaşın bitişi ileri alınabilir.', code: 'NOT_OPEN' }, 409);
      }
      return json({ success: true, battle: updated });
    }

    // adjust_score — yalnız aktif savaşta, gerekçeli ve denetimli.
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.squadBattle.findUnique({
        where: { id: params.id },
        select: { squad1Score: true, squad2Score: true, status: true },
      });
      const r = await tx.squadBattle.updateMany({
        where: { id: params.id, status: 'active' },
        data: { squad1Score: input.squad1Score, squad2Score: input.squad2Score },
      });
      if (r.count === 0) return null;
      await tx.auditLog.create({
        data: {
          userId: actor.actorId,
          action: 'SQUAD_BATTLE_ADJUST_SCORE',
          entity: 'SquadBattle',
          entityId: params.id,
          oldData: { squad1Score: before?.squad1Score ?? null, squad2Score: before?.squad2Score ?? null },
          newData: {
            squad1Score: input.squad1Score,
            squad2Score: input.squad2Score,
            reason: input.reason,
          } as Prisma.InputJsonObject,
          ...auditMeta,
        },
      });
      return tx.squadBattle.findUnique({ where: { id: params.id } });
    });
    if (!updated) {
      return json({ error: 'Skor yalnız aktif savaşta düzeltilebilir.', code: 'NOT_ACTIVE' }, 409);
    }
    return json({ success: true, battle: updated });
  } catch (error) {
    console.error('[squads/battles PATCH]', error);
    return json({ error: 'Güncelleme başarısız' }, 500);
  }
}

/**
 * DELETE — geriye uyumlu "İptal" düğmesi. Artık SİLMEZ: iadeli soft-cancel (P0-20).
 * Gerekçe `?reason=` ile verilebilir.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const params = await context.params;
    const reasonParam = request.nextUrl.searchParams.get('reason')?.trim();
    const reason = reasonParam && reasonParam.length >= 3 ? reasonParam.slice(0, 500) : 'Yönetici iptali';

    const r = await cancelSquadBattle(prisma, params.id, {
      actorId: auth.session.user.id,
      actorRole: 'admin',
      reason,
    });
    if (r.status === 'noop') {
      return r.currentStatus
        ? json({ error: 'Bu savaş zaten sonuçlanmış ya da iptal edilmiş.', code: 'NOT_OPEN' }, 409)
        : json({ error: 'Savaş bulunamadı' }, 404);
    }
    return json({ success: true, status: 'cancelled', refunded: r.refunded });
  } catch (error) {
    console.error('[squads/battles DELETE]', error);
    return json({ error: 'Savaş iptal edilemedi' }, 500);
  }
}

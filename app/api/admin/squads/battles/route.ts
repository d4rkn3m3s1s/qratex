import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { OPEN_BATTLE_STATUSES } from '@/lib/squad-battle-service';

export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

// Savaşları listele (en yeni 200)
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const battles = await prisma.squadBattle.findMany({
      include: {
        squad1: { select: { id: true, name: true } },
        squad2: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'desc' },
      take: 200,
    });

    return json({ success: true, battles });
  } catch (error) {
    console.error('Error fetching battles:', error);
    return json({ error: 'Savaşlar getirilemedi' }, 500);
  }
}

/**
 * POST — yönetici savaşı (P0-20). Yönetici savaşı escrow ile FONLANMAZ: ödül havuzu yoktur
 * ("onur savaşı"). Önceden formdaki havuz dekoratifti (kimse ödül almıyordu ama "ödüller
 * dağıtıldı" deniyordu) ve sınırsız/negatif değer kabul ediliyordu. Klan başına tek açık
 * savaş kuralı meydan okuma akışıyla aynı transaction içinde uygulanır.
 */
const createSchema = z
  .object({
    squad1Id: z.string().min(1, 'Birinci klanı seçin').max(64),
    squad2Id: z.string().min(1, 'İkinci klanı seçin').max(64),
    startTime: z.string().datetime({ offset: true, message: 'Geçerli bir başlangıç zamanı girin' }),
    endTime: z.string().datetime({ offset: true, message: 'Geçerli bir bitiş zamanı girin' }),
    rewardPool: z.number().int().min(0).optional(),
  })
  .refine((b) => b.squad1Id !== b.squad2Id, { message: 'Bir klan kendisiyle savaşamaz', path: ['squad2Id'] });

class OpenBattleConflict extends Error {}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.errors[0]?.message ?? 'Eksik bilgi', details: parsed.error.flatten() }, 400);
    }
    const { squad1Id, squad2Id, rewardPool = 0 } = parsed.data;
    if (rewardPool > 0) {
      return json(
        {
          error:
            'Yönetici savaşları ödülsüz onur savaşıdır: ödül havuzu yalnız klan sahibinin meydan okumasında, kendi puanından tahsil edilerek oluşur.',
          code: 'ADMIN_BATTLE_UNFUNDED',
        },
        400
      );
    }
    const startTime = new Date(parsed.data.startTime);
    const endTime = new Date(parsed.data.endTime);
    const durationMs = endTime.getTime() - startTime.getTime();
    if (durationMs < 60 * 60 * 1000 || durationMs > 168 * 60 * 60 * 1000) {
      return json({ error: 'Savaş süresi 1 saat ile 7 gün arasında olmalı (bitiş, başlangıçtan sonra).' }, 400);
    }

    const squads = await prisma.squad.findMany({
      where: { id: { in: [squad1Id, squad2Id] } },
      select: { id: true, isFrozen: true },
    });
    if (squads.length !== 2) return json({ error: 'Klanlardan biri bulunamadı' }, 404);
    if (squads.some((s) => s.isFrozen)) return json({ error: 'Dondurulmuş klan savaşa sokulamaz' }, 409);

    try {
      const battle = await prisma.$transaction(async (tx) => {
        const existing = await tx.squadBattle.findFirst({
          where: {
            status: { in: [...OPEN_BATTLE_STATUSES] },
            OR: [
              { squad1Id: { in: [squad1Id, squad2Id] } },
              { squad2Id: { in: [squad1Id, squad2Id] } },
            ],
          },
          select: { id: true },
        });
        if (existing) throw new OpenBattleConflict();
        const created = await tx.squadBattle.create({
          data: {
            squad1Id,
            squad2Id,
            startTime,
            endTime,
            rewardPool: 0,
            rewardFunded: false,
            status: 'pending',
          },
        });
        const meta = getAuditRequestMeta(request);
        await tx.auditLog.create({
          data: {
            userId: auth.session.user.id,
            action: 'SQUAD_BATTLE_CREATE',
            entity: 'SquadBattle',
            entityId: created.id,
            newData: { squad1Id, squad2Id, startTime: startTime.toISOString(), endTime: endTime.toISOString(), origin: 'admin' },
            ...meta,
          },
        });
        return created;
      });
      return json({ success: true, battle });
    } catch (e) {
      if (e instanceof OpenBattleConflict) {
        return json({ error: 'Klanlardan biri zaten bir savaşta ya da bekleyen meydan okuması var' }, 409);
      }
      throw e;
    }
  } catch (error) {
    console.error('Error creating battle:', error);
    return json({ error: 'Savaş oluşturulamadı' }, 500);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { requireAuth, getOptionalSession } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  HAPPY_HOUR_TIME_ZONE,
  getZonedClock,
  happyHourCreateSchema,
  isHappyHourLive,
  isHappyHourUpcoming,
} from '@/lib/happy-hour-live';
import { HAPPY_HOUR_DEFAULT_MULTIPLIER, clampHappyHourMultiplier } from '@/lib/points-multipliers';

export const dynamic = 'force-dynamic';

/** Bir bayinin aynı anda tanımlı tutabileceği aktif mutlu saat sayısı. */
const MAX_ACTIVE_HAPPY_HOURS_PER_DEALER = 50;

/**
 * GET — Bayi/admin listesi (`?list=1`) ya da müşteriye şu an aktif + yaklaşan mutlu saatler.
 * Canlılık İstanbul duvar saatine göre (lib/happy-hour-live); gösterilen çarpan, puana
 * gerçekten uygulanan değerdir ([1, 3] aralığına kırpılmış).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getOptionalSession();
    const { searchParams } = new URL(req.url);
    const list = searchParams.get('list') === '1';

    if (list && session?.user?.id && (session.user.role === 'DEALER' || session.user.role === 'ADMIN')) {
      const where = session.user.role === 'ADMIN' ? {} : { dealerId: session.user.id };
      const happyHours = await prisma.happyHour.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return NextResponse.json(
        {
          success: true,
          happyHours: happyHours.map((hh) => ({
            ...hh,
            effectiveMultiplier: clampHappyHourMultiplier(hh.multiplier),
          })),
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const now = new Date();
    const clock = getZonedClock(now);

    const happyHours = await prisma.happyHour.findMany({
      where: {
        isActive: true,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
      },
      take: 400,
      orderBy: { createdAt: 'desc' },
      include: {
        dealer: {
          select: { id: true, businessName: true, image: true },
        },
      },
    });

    const withEffective = happyHours.map((hh) => ({
      ...hh,
      multiplier: clampHappyHourMultiplier(hh.multiplier),
    }));
    const activeNow = withEffective.filter((hh) => isHappyHourLive(hh, now));
    const activeIds = new Set(activeNow.map((hh) => hh.id));
    const upcoming = withEffective
      .filter((hh) => !activeIds.has(hh.id) && isHappyHourUpcoming(hh, now))
      .slice(0, 5);

    const bestMultiplier = activeNow.length > 0 ? Math.max(...activeNow.map((hh) => hh.multiplier)) : 1;

    return NextResponse.json(
      {
        success: true,
        activeNow,
        upcoming,
        bestMultiplier,
        currentTime: clock.hhmm,
        currentDay: clock.day,
        timeZone: HAPPY_HOUR_TIME_ZONE,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching happy hours:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Mutlu saatler alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/**
 * POST — Mutlu saat oluştur (bayi; admin için global). P0-13: zod şeması — çarpan [1, 3],
 * `SS:dd` saatler, gün 0–6, geçerlilik aralığı tutarlı. Denetim kaydı yazılır.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Geçersiz JSON gövdesi' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const parsed = happyHourCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Geçersiz istek', details: parsed.error.flatten() },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const d = parsed.data;
    const dealerId = session.user.role === 'ADMIN' ? null : session.user.id;

    const activeCount = await prisma.happyHour.count({ where: { dealerId, isActive: true } });
    if (activeCount >= MAX_ACTIVE_HAPPY_HOURS_PER_DEALER) {
      return NextResponse.json(
        { error: `En fazla ${MAX_ACTIVE_HAPPY_HOURS_PER_DEALER} aktif mutlu saat tanımlanabilir` },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const happyHour = await prisma.$transaction(async (tx) => {
      const created = await tx.happyHour.create({
        data: {
          dealerId,
          name: d.name,
          description: d.description ?? null,
          multiplier: d.multiplier ?? HAPPY_HOUR_DEFAULT_MULTIPLIER,
          startTime: d.startTime,
          endTime: d.endTime,
          daysOfWeek: d.daysOfWeek,
          validFrom: d.validFrom,
          validUntil: d.validUntil,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE_HAPPY_HOUR',
          entity: 'HappyHour',
          entityId: created.id,
          newData: {
            dealerId,
            name: created.name,
            multiplier: created.multiplier,
            startTime: created.startTime,
            endTime: created.endTime,
            daysOfWeek: d.daysOfWeek,
            validFrom: created.validFrom?.toISOString() ?? null,
            validUntil: created.validUntil?.toISOString() ?? null,
          },
          ...getAuditRequestMeta(req),
        },
      });
      return created;
    });

    return NextResponse.json({ success: true, happyHour }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error creating happy hour:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Mutlu saat oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

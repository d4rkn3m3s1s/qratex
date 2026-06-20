import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getBirthdayBonusPoints, getPointsMatrix } from '@/lib/points-rules';
import { z } from 'zod';

// GET - Get birthday info

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const matrix = await getPointsMatrix();
    const birthdayBonus = getBirthdayBonusPoints(matrix);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const birthday = await prisma.userBirthday.findUnique({
      where: { userId: session.user.id },
    });

    // Check if today is birthday
    let isBirthdayToday = false;
    let canClaimBonus = false;

    if (birthday?.birthDate) {
      const today = new Date();
      const birthDate = new Date(birthday.birthDate);
      
      isBirthdayToday = 
        today.getMonth() === birthDate.getMonth() &&
        today.getDate() === birthDate.getDate();

      if (isBirthdayToday) {
        const thisYear = today.getFullYear();
        const lastBonus = birthday.lastBonusAt ? new Date(birthday.lastBonusAt) : null;
        
        canClaimBonus = !lastBonus || lastBonus.getFullYear() < thisYear;
      }
    }

    if (isBirthdayToday && canClaimBonus) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const existingReminder = await prisma.notification.findFirst({
        where: {
          userId: session.user.id,
          type: 'BIRTHDAY_CLAIM',
          createdAt: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true },
      });

      if (!existingReminder) {
        await prisma.notification.create({
          data: {
            userId: session.user.id,
            type: 'BIRTHDAY_CLAIM',
            title: '🎂 Doğum günün kutlu olsun!',
            message: `Bugün +${birthdayBonus} bonus puanını talep edebilirsin. Bildirimler veya Ayarlar → Profil üzerinden de alabilirsin.`,
            isRead: false,
            data: { cta: 'birthday_claim', bonusAmount: birthdayBonus } as object,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      birthday,
      isBirthdayToday,
      canClaimBonus,
      bonusAmount: birthdayBonus,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error fetching birthday:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

const birthdayPostSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set'), birthDate: z.string().min(8).max(32) }),
  z.object({ action: z.literal('claim') }),
]);

// POST - Set or claim birthday bonus
export async function POST(req: NextRequest) {
  try {
    const matrix = await getPointsMatrix();
    const birthdayBonus = getBirthdayBonusPoints(matrix);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = birthdayPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Geçersiz istek (action: set|claim)' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    if (parsed.data.action === 'set') {
      const birthDate = new Date(parsed.data.birthDate);
      if (Number.isNaN(birthDate.getTime())) {
        return NextResponse.json(
          { error: 'Geçersiz doğum tarihi' },
          { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      const birthday = await prisma.userBirthday.upsert({
        where: { userId: session.user.id },
        update: { birthDate },
        create: {
          userId: session.user.id,
          birthDate,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Doğum günü kaydedildi!',
        birthday,
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (parsed.data.action === 'claim') {
      // Claim birthday bonus
      const birthday = await prisma.userBirthday.findUnique({
        where: { userId: session.user.id },
      });

      if (!birthday) {
        return NextResponse.json({ error: 'Birthday not set' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      const today = new Date();
      const birth = new Date(birthday.birthDate);
      
      const isBirthdayToday = 
        today.getMonth() === birth.getMonth() &&
        today.getDate() === birth.getDate();

      if (!isBirthdayToday) {
        return NextResponse.json({ error: 'Today is not your birthday' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      // Check if already claimed this year (ön kontrol — asıl guard tx içinde atomik)
      const thisYear = today.getUTCFullYear();
      const yearStart = new Date(Date.UTC(thisYear, 0, 1, 0, 0, 0, 0));
      const lastBonus = birthday.lastBonusAt ? new Date(birthday.lastBonusAt) : null;

      if (lastBonus && lastBonus >= yearStart) {
        return NextResponse.json({ error: 'Already claimed this year' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      // Claim bonus — atomik guard: yalnızca bu yıl içinde claim edilmemiş kayıt
      // güncellenir. İki eşzamanlı istekten yalnızca biri count=1 alır.
      const claimed = await prisma.$transaction(async (tx) => {
        const guard = await tx.userBirthday.updateMany({
          where: {
            userId: session.user.id,
            OR: [{ lastBonusAt: null }, { lastBonusAt: { lt: yearStart } }],
          },
          data: {
            bonusGiven: true,
            lastBonusAt: new Date(),
          },
        });

        if (guard.count === 0) {
          return false; // başka bir istek bu yılki bonusu zaten aldı
        }

        await tx.notification.deleteMany({
          where: { userId: session.user.id, type: 'BIRTHDAY_CLAIM' },
        });

        await creditPointsAndXp(tx, {
          userId: session.user.id,
          points: birthdayBonus,
        });

        await tx.notification.create({
          data: {
            userId: session.user.id,
            type: 'BIRTHDAY_BONUS',
            title: '🎂 Doğum Günün Kutlu Olsun!',
            message: `${birthdayBonus} bonus puan hesabına eklendi!`,
          },
        });
        return true;
      });

      if (!claimed) {
        return NextResponse.json({ error: 'Already claimed this year' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }

      return NextResponse.json({
        success: true,
        message: `🎂 Doğum günün kutlu olsun! ${birthdayBonus} puan kazandın!`,
        pointsEarned: birthdayBonus,
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error processing birthday:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

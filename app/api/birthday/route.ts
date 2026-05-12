import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getBirthdayBonusPoints, getPointsMatrix } from '@/lib/points-rules';

// GET - Get birthday info

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const matrix = await getPointsMatrix();
    const birthdayBonus = getBirthdayBonusPoints(matrix);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    return NextResponse.json({
      success: true,
      birthday,
      isBirthdayToday,
      canClaimBonus,
      bonusAmount: birthdayBonus,
    });
  } catch (error) {
    console.error('Error fetching birthday:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Set or claim birthday bonus
export async function POST(req: NextRequest) {
  try {
    const matrix = await getPointsMatrix();
    const birthdayBonus = getBirthdayBonusPoints(matrix);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, birthDate } = body;

    if (action === 'set' && birthDate) {
      // Set birthday
      const birthday = await prisma.userBirthday.upsert({
        where: { userId: session.user.id },
        update: { birthDate: new Date(birthDate) },
        create: {
          userId: session.user.id,
          birthDate: new Date(birthDate),
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Doğum günü kaydedildi!',
        birthday,
      });
    }

    if (action === 'claim') {
      // Claim birthday bonus
      const birthday = await prisma.userBirthday.findUnique({
        where: { userId: session.user.id },
      });

      if (!birthday) {
        return NextResponse.json({ error: 'Birthday not set' }, { status: 400 });
      }

      const today = new Date();
      const birth = new Date(birthday.birthDate);
      
      const isBirthdayToday = 
        today.getMonth() === birth.getMonth() &&
        today.getDate() === birth.getDate();

      if (!isBirthdayToday) {
        return NextResponse.json({ error: 'Today is not your birthday' }, { status: 400 });
      }

      // Check if already claimed this year
      const thisYear = today.getFullYear();
      const lastBonus = birthday.lastBonusAt ? new Date(birthday.lastBonusAt) : null;
      
      if (lastBonus && lastBonus.getFullYear() >= thisYear) {
        return NextResponse.json({ error: 'Already claimed this year' }, { status: 400 });
      }

      // Claim bonus
      await prisma.$transaction(async (tx) => {
        await creditPointsAndXp(tx, {
          userId: session.user.id,
          points: birthdayBonus,
        });

        await (tx as any).userBirthday.update({
          where: { userId: session.user.id },
          data: {
            bonusGiven: true,
            lastBonusAt: new Date(),
          },
        });

        await tx.notification.create({
          data: {
            userId: session.user.id,
            type: 'BIRTHDAY_BONUS',
            title: '🎂 Doğum Günün Kutlu Olsun!',
            message: `${birthdayBonus} bonus puan hesabına eklendi!`,
          },
        });
      });

      return NextResponse.json({
        success: true,
        message: `🎂 Doğum günün kutlu olsun! ${birthdayBonus} puan kazandın!`,
        pointsEarned: birthdayBonus,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing birthday:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

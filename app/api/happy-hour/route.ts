import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - List dealer's campaigns (list=1) or active/upcoming for display

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const list = searchParams.get('list') === '1';

    if (list && session?.user?.id && (session.user.role === 'DEALER' || session.user.role === 'ADMIN')) {
      const where = session.user.role === 'ADMIN' ? {} : { dealerId: session.user.id };
      const happyHours = await prisma.happyHour.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ success: true, happyHours });
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`;
    const currentDay = now.getDay(); // 0 = Sunday

    // Get all active happy hours
    const happyHours = await prisma.happyHour.findMany({
      where: {
        isActive: true,
        OR: [
          { validFrom: null },
          { validFrom: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { validUntil: null },
              { validUntil: { gte: now } },
            ],
          },
        ],
      },
      include: {
        dealer: {
          select: { id: true, businessName: true, image: true },
        },
      },
    });

    // Filter by current time and day
    const activeNow = happyHours.filter((hh: any) => {
      const days = hh.daysOfWeek as number[];
      if (!days.includes(currentDay)) return false;

      const start = hh.startTime;
      const end = hh.endTime;

      // Handle overnight happy hours (e.g., 22:00 - 02:00)
      if (end < start) {
        return currentTime >= start || currentTime <= end;
      }
      return currentTime >= start && currentTime <= end;
    });

    // Get upcoming happy hours (next 24 hours)
    const upcoming = happyHours.filter((hh: any) => {
      const days = hh.daysOfWeek as number[];
      const tomorrow = (currentDay + 1) % 7;
      
      // Check if active later today or tomorrow
      if (days.includes(currentDay) && hh.startTime > currentTime) {
        return true;
      }
      if (days.includes(tomorrow)) {
        return true;
      }
      return false;
    }).slice(0, 5);

    // Calculate best current multiplier
    const bestMultiplier = activeNow.length > 0 
      ? Math.max(...activeNow.map((hh: any) => hh.multiplier))
      : 1;

    return NextResponse.json({
      success: true,
      activeNow,
      upcoming,
      bestMultiplier,
      currentTime,
      currentDay,
    });
  } catch (error) {
    console.error('Error fetching happy hours:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create happy hour (dealer only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'DEALER' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only dealers can create happy hours' }, { status: 403 });
    }

    const body = await req.json();
    const { name, description, multiplier, startTime, endTime, daysOfWeek, validFrom, validUntil } = body;

    if (!name || !startTime || !endTime || !daysOfWeek || !Array.isArray(daysOfWeek)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const happyHour = await prisma.happyHour.create({
      data: {
        dealerId: session.user.role === 'ADMIN' ? null : session.user.id,
        name,
        description,
        multiplier: multiplier || 2.0,
        startTime,
        endTime,
        daysOfWeek,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    });

    return NextResponse.json({
      success: true,
      happyHour,
    });
  } catch (error) {
    console.error('Error creating happy hour:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

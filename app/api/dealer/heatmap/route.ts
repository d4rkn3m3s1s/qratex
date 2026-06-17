import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== 'DEALER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const dealerId = session.user.id;
    const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

    // 7x24 grid (TR-locale: 0 = Pazartesi .. 6 = Pazar).
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    // Ham getDay() (Paz=0..Cmt=6) → TR-locale (Pzt=0..Paz=6).
    const toTrDay = (rawDay: number) => (rawDay === 0 ? 6 : rawDay - 1);

    // Önce KALICI HeatmapData'dan oku (tam geçmiş, kapaksız sayım).
    const rows = await prisma.heatmapData.findMany({
      where: { dealerId },
      select: { dayOfWeek: true, hour: true, count: true },
    });

    if (rows.length > 0) {
      for (const r of rows) {
        const d = toTrDay(r.dayOfWeek);
        if (d >= 0 && d < 7 && r.hour >= 0 && r.hour < 24) grid[d][r.hour] += r.count;
      }
    } else {
      // Cold start (henüz olay yazılmadan önce): son kayıtlardan sentezle (fallback).
      const [consumptions, feedbacks] = await Promise.all([
        prisma.consumption.findMany({
          where: { dealerId },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        prisma.feedback.findMany({
          where: { qrCode: { dealerId } },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ]);
      for (const event of [...consumptions, ...feedbacks]) {
        const date = new Date(event.createdAt);
        grid[toTrDay(date.getUTCDay())][date.getUTCHours()] += 1;
      }
    }

    // Format for Frontend
    const heatmapData = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (grid[d][h] > 0) {
          heatmapData.push({ dayIndex: d, dayName: days[d], hour: h, count: grid[d][h] });
        }
      }
    }

    // Veri yoksa SAHTE yoğunluk verisi ÜRETMİYORUZ; boş + empty bayrağı döner.
    return NextResponse.json(
      { data: heatmapData, empty: heatmapData.length === 0 },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );

  } catch (error) {
    console.error('[HEATMAP_API_ERROR]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

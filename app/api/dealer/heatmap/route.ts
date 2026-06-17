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

    // Fetch the consumptions and feedbacks
    const [consumptions, feedbacks] = await Promise.all([
      prisma.consumption.findMany({
        where: { dealerId },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500
      }),
      prisma.feedback.findMany({
        where: { qrCode: { dealerId } },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500
      })
    ]);

    // Initialize an empty 7x24 grid
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    // Combine and aggregate
    const allEvents = [...consumptions, ...feedbacks];

    for (const event of allEvents) {
      const date = new Date(event.createdAt);
      const day = date.getDay(); // 0 (Sun) - 6 (Sat)
      const hour = date.getHours(); // 0 - 23

      // Map to 0 = Monday ... 6 = Sunday format (TR Locale)
      const trLocalDay = day === 0 ? 6 : day - 1;
      grid[trLocalDay][hour] += 1;
    }

    // Format for Frontend
    const heatmapData = [];
    const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (grid[d][h] > 0) {
          heatmapData.push({
            dayIndex: d,
            dayName: days[d],
            hour: h,
            count: grid[d][h]
          });
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

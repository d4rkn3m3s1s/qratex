import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma'; // Note: Ensure it points to the correct location for your project.
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Default benchmarks aggregated by businessCategory
        const dealers = await prisma.user.findMany({
            where: { role: 'DEALER' },
            select: {
                id: true,
                businessCategory: true,
            }
        });

        const categoryStats: Record<string, { count: number, avgRating: number, scanCount: number }> = {};

        for (const dealer of dealers) {
            const cat = dealer.businessCategory || 'uncategorized';

            if (!categoryStats[cat]) {
                categoryStats[cat] = { count: 0, avgRating: 0, scanCount: 0 };
            }

            categoryStats[cat].count += 1;

            // Group their stats 
            const [feedbacks, scans] = await Promise.all([
                prisma.feedback.aggregate({
                    where: { qrCode: { dealerId: dealer.id } },
                    _avg: { rating: true }
                }),
                prisma.qRCode.aggregate({
                    where: { dealerId: dealer.id },
                    _sum: { scanCount: true }
                })
            ]);

            const avgRating = feedbacks._avg.rating || 0;
            const scanSum = scans._sum.scanCount || 0;

            // Weighted moving average concept applied simply
            const currentAvg = categoryStats[cat].avgRating;
            const count = categoryStats[cat].count;

            categoryStats[cat].avgRating = currentAvg === 0 ? avgRating : ((currentAvg * (count - 1)) + avgRating) / count;
            categoryStats[cat].scanCount += scanSum;
        }

        const categoriesList = Object.entries(categoryStats).map(([category, stats]) => ({
            category,
            dealerCount: stats.count,
            avgRating: Number(stats.avgRating.toFixed(2)),
            totalScans: stats.scanCount
        }));

        // Veri yoksa SAHTE örnek istatistik ÜRETMİYORUZ (admin'i yanıltır).
        // Boş sonuç + empty bayrağı döndürülür; UI boş durumu gösterir.
        const isEmpty =
            categoriesList.length === 0 ||
            categoriesList.every((c) => c.category === 'uncategorized' && c.totalScans === 0);

        return NextResponse.json({ data: categoriesList, empty: isEmpty }, { headers: PRIVATE_NO_STORE_HEADERS });

    } catch (error) {
        console.error('[ADMIN_INSIGHTS_ERROR]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}

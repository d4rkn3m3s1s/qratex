import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Kategori bazında benchmark — önceden N dealer × 2 sorgu + hatalı hareketli
        // ortalama vardı. Artık 2 toplu SQL: (1) kategori başına dealer sayısı +
        // ortalama rating (qrCode join), (2) kategori başına tarama toplamı.
        const [ratingRows, scanRows] = await Promise.all([
            prisma.$queryRaw<Array<{ category: string; dealerCount: bigint; avgRating: number | null }>>(Prisma.sql`
                SELECT COALESCE(u."businessCategory", 'uncategorized') AS category,
                       COUNT(DISTINCT u."id") AS "dealerCount",
                       AVG(f."rating") AS "avgRating"
                FROM "User" u
                LEFT JOIN "QRCode" q ON q."dealerId" = u."id"
                LEFT JOIN "Feedback" f ON f."qrCodeId" = q."id" AND f."deletedAt" IS NULL
                WHERE u."role" = 'DEALER'
                GROUP BY COALESCE(u."businessCategory", 'uncategorized')
            `),
            prisma.$queryRaw<Array<{ category: string; totalScans: bigint | null }>>(Prisma.sql`
                SELECT COALESCE(u."businessCategory", 'uncategorized') AS category,
                       COALESCE(SUM(q."scanCount"), 0) AS "totalScans"
                FROM "User" u
                LEFT JOIN "QRCode" q ON q."dealerId" = u."id"
                WHERE u."role" = 'DEALER'
                GROUP BY COALESCE(u."businessCategory", 'uncategorized')
            `),
        ]);

        const scanByCat = new Map(scanRows.map((r) => [r.category, Number(r.totalScans ?? 0)]));
        const categoryStats: Record<string, { count: number; avgRating: number; scanCount: number }> = {};
        for (const r of ratingRows) {
            const cat = r.category || 'uncategorized';
            categoryStats[cat] = {
                count: Number(r.dealerCount ?? 0),
                avgRating: r.avgRating != null ? Number(r.avgRating) : 0,
                scanCount: scanByCat.get(cat) ?? 0,
            };
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

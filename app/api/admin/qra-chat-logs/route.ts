import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '25', 10)));
    const q = searchParams.get('q')?.trim();

    const skip = (page - 1) * limit;

    const where: Prisma.QraChatLogWhereInput | undefined = q
      ? {
          OR: [
            { userMessage: { contains: q, mode: 'insensitive' } },
            { assistantMessage: { contains: q, mode: 'insensitive' } },
            {
              user: {
                OR: [
                  { email: { contains: q, mode: 'insensitive' } },
                  { name: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      prisma.qraChatLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, email: true, name: true, role: true },
          },
        },
      }),
      prisma.qraChatLog.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('qra-chat-logs GET:', error);
    return NextResponse.json({ error: 'Kayıtlar alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

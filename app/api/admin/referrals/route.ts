import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || '20')));
  const sort = searchParams.get('sort') || 'newest';

  const referralWhere = q
    ? {
        OR: [
          { referralCode: { contains: q, mode: 'insensitive' as const } },
          { referrer: { email: { contains: q, mode: 'insensitive' as const } } },
          { referred: { email: { contains: q, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const referralOrderBy =
    sort === 'oldest' ? ({ createdAt: 'asc' } as const) : ({ createdAt: 'desc' } as const);

  const topCodesOrderBy =
    sort === 'usage_asc' ? ({ usageCount: 'asc' } as const) : ({ usageCount: 'desc' } as const);

  const [totals, recent, topCodes, totalCount] = await Promise.all([
    prisma.referral.aggregate({
      _count: true,
      _sum: { pointsEarned: true, bonusGiven: true },
    }),
    prisma.referral.findMany({
      where: referralWhere,
      orderBy: referralOrderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        referrer: { select: { id: true, name: true, email: true } },
        referred: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.referralCode.findMany({
      orderBy: topCodesOrderBy,
      take: 20,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.referral.count({ where: referralWhere }),
  ]);

  return NextResponse.json({
    success: true,
    stats: {
      totalReferrals: totals._count,
      totalReferrerPoints: totals._sum.pointsEarned || 0,
      totalReferredBonus: totals._sum.bonusGiven || 0,
    },
    recent,
    topCodes,
    pagination: {
      page,
      pageSize,
      total: totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    },
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const codeId = String(body?.referralCodeId || '');
  const isActive = Boolean(body?.isActive);
  if (!codeId) {
    return NextResponse.json({ success: false, error: 'Kod ID gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const code = await prisma.referralCode.update({
    where: { id: codeId },
    data: { isActive },
    select: { id: true, code: true, isActive: true },
  });

  return NextResponse.json({ success: true, code }, { headers: PRIVATE_NO_STORE_HEADERS });
}

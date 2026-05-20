import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const sort = searchParams.get('sort') || 'newest';

    const skip = (page - 1) * pageSize;

    // Build where clause
    const where: any = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { inviteCode: { contains: q, mode: 'insensitive' } },
        { owner: { email: { contains: q, mode: 'insensitive' } } },
        { owner: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    // Build orderBy
    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'oldest') orderBy = { createdAt: 'asc' };
    if (sort === 'members_desc') orderBy = { members: { _count: 'desc' } };
    if (sort === 'members_asc') orderBy = { members: { _count: 'asc' } };

    // Fetch data
    const [squads, total, stats] = await Promise.all([
      prisma.squad.findMany({
        where,
        include: {
          owner: { select: { name: true, email: true } },
          members: { include: { user: { select: { name: true, email: true, points: true } } } },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
      prisma.squad.count({ where }),
      prisma.$transaction([
        prisma.squad.count(),
        prisma.squadMember.count(),
      ]),
    ]);

    const [totalSquads, totalMembers] = stats;

    return NextResponse.json({
      success: true,
      squads,
      stats: {
        totalSquads,
        totalMembers,
        avgMembersPerSquad: totalSquads > 0 ? (totalMembers / totalSquads).toFixed(1) : 0,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching admin squads:', error);
    return NextResponse.json({ error: 'Klanlar getirilemedi' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const { squadId, action } = await req.json();

    if (action === 'freeze' || action === 'unfreeze') {
      await prisma.squad.update({
        where: { id: squadId },
        data: { isFrozen: action === 'freeze' },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Geçersiz aksiyon' }, { status: 400 });
  } catch (error) {
    console.error('Error updating squad:', error);
    return NextResponse.json({ error: 'Squad güncellenemedi' }, { status: 500 });
  }
}

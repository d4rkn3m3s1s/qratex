import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

const FREEZE_KEY = 'admin_frozen_squads';

async function getFrozenSquadIds(): Promise<string[]> {
  const row = await prisma.settings.findUnique({
    where: { key: FREEZE_KEY },
    select: { value: true },
  });
  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) return [];
  const arr = (row.value as { squadIds?: unknown }).squadIds;
  return Array.isArray(arr) ? arr.map(String) : [];
}

async function saveFrozenSquadIds(ids: string[]) {
  await prisma.settings.upsert({
    where: { key: FREEZE_KEY },
    create: { key: FREEZE_KEY, category: 'admin', value: { squadIds: ids } as object },
    update: { value: { squadIds: ids } as object },
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || '20')));
  const sort = searchParams.get('sort') || 'newest';
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { inviteCode: { contains: q, mode: 'insensitive' as const } },
          { owner: { email: { contains: q, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const orderBy =
    sort === 'members_desc'
      ? [{ members: { _count: 'desc' as const } }]
      : sort === 'members_asc'
        ? [{ members: { _count: 'asc' as const } }]
        : sort === 'oldest'
          ? [{ createdAt: 'asc' as const }]
          : [{ createdAt: 'desc' as const }];

  const [squads, memberCount, totalSquads, frozenIds] = await Promise.all([
    prisma.squad.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true, points: true } },
          },
        },
      },
    }),
    prisma.squadMember.count(),
    prisma.squad.count({ where }),
    getFrozenSquadIds(),
  ]);

  return NextResponse.json({
    success: true,
    stats: {
      totalSquads,
      totalMembers: memberCount,
      avgMembersPerSquad: totalSquads > 0 ? Number((memberCount / totalSquads).toFixed(2)) : 0,
    },
    pagination: {
      page,
      pageSize,
      total: totalSquads,
      totalPages: Math.max(1, Math.ceil(totalSquads / pageSize)),
    },
    squads: squads.map((s) => ({ ...s, isFrozen: frozenIds.includes(s.id) })),
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const squadId = String(body?.squadId || '');
  const action = String(body?.action || '');
  if (!squadId || (action !== 'freeze' && action !== 'unfreeze')) {
    return NextResponse.json({ success: false, error: 'Geçersiz istek' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const ids = await getFrozenSquadIds();
  const next =
    action === 'freeze' ? Array.from(new Set([...ids, squadId])) : ids.filter((id) => id !== squadId);
  await saveFrozenSquadIds(next);
  return NextResponse.json({ success: true, frozenSquadIds: next }, { headers: PRIVATE_NO_STORE_HEADERS });
}

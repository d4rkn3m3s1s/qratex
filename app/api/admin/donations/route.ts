import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const onlyActive = searchParams.get('onlyActive') === 'true';
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || '20')));
  const sort = searchParams.get('sort') || 'newest';

  const projectWhere = {
    ...(onlyActive ? { isActive: true } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { category: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const projectOrderBy =
    sort === 'points_desc'
      ? [{ current: 'desc' as const }]
      : sort === 'goal_desc'
        ? [{ goal: 'desc' as const }]
        : [{ isActive: 'desc' as const }, { createdAt: 'desc' as const }];

  const [projectCount, projects, totals, recent] = await Promise.all([
    prisma.donationProject.count({ where: projectWhere }),
    prisma.donationProject.findMany({
      where: projectWhere,
      orderBy: projectOrderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        category: true,
        current: true,
        goal: true,
        impact: true,
        tags: true,
        isActive: true,
      },
    }),
    prisma.donation.aggregate({
      _sum: { points: true },
      _count: true,
    }),
    prisma.donation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, category: true } },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    stats: {
      totalDonations: totals._count,
      totalPointsDonated: totals._sum.points || 0,
      activeProjects: projects.filter((p) => p.isActive).length,
    },
    pagination: {
      page,
      pageSize,
      total: projectCount,
      totalPages: Math.max(1, Math.ceil(projectCount / pageSize)),
    },
    projects: projects.map((p) => ({
      ...p,
      target: p.goal,
    })),
    recent,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const projectId = String(body?.projectId || '');
  const action = String(body?.action || '');
  if (!projectId || (action !== 'activate' && action !== 'deactivate' && action !== 'freeze')) {
    return NextResponse.json({ success: false, error: 'Geçersiz istek' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const isActive = action === 'activate';
  const updated = await prisma.donationProject.update({
    where: { id: projectId },
    data: { isActive },
    select: { id: true, name: true, isActive: true },
  });

  return NextResponse.json({ success: true, project: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const projectId = String(body?.projectId || '');
  if (!projectId) {
    return NextResponse.json({ success: false, error: 'projectId gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const updated = await prisma.donationProject.update({
    where: { id: projectId },
    data: {
      name: typeof body?.name === 'string' ? body.name : undefined,
      description: typeof body?.description === 'string' ? body.description : undefined,
      icon: typeof body?.icon === 'string' ? body.icon : undefined,
      category: typeof body?.category === 'string' ? body.category : undefined,
      goal: typeof body?.goal === 'number' ? Math.max(0, Math.floor(body.goal)) : undefined,
      impact: body?.impact && typeof body.impact === 'object' ? body.impact : undefined,
      tags: Array.isArray(body?.tags) ? body.tags : undefined,
      isActive: typeof body?.isActive === 'boolean' ? body.isActive : undefined,
    },
    select: {
      id: true,
      name: true,
      description: true,
      icon: true,
      category: true,
      current: true,
      goal: true,
      impact: true,
      tags: true,
      isActive: true,
    },
  });

  return NextResponse.json({ success: true, project: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
}

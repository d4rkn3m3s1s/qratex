import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';

// GET /api/gamification/badges/[id] - Get single badge

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const badge = await prisma.badge.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!badge) {
      return NextResponse.json(
        { success: false, error: 'Rozet bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json({ success: true, data: badge }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching badge:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// PATCH /api/gamification/badges/[id] - Update badge
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { id } = await params;
    const body = await request.json();

    // Get old badge for audit
    const oldBadge = await prisma.badge.findUnique({ where: { id } });
    if (!oldBadge) {
      return NextResponse.json(
        { success: false, error: 'Rozet bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const badge = await prisma.badge.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        icon: body.icon,
        category: body.category || undefined,
        rarity: (body.rarity || 'common').toLowerCase(),
        requirement: (typeof body.requirement === 'object' && body.requirement)
          ? body.requirement as object
          : { type: 'custom', value: body.points || 100 },
        ...(typeof body.pointCost === 'number' || body.pointCost === null ? { pointCost: body.pointCost } : {}),
        isActive: body.isActive,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_BADGE',
        entity: 'Badge',
        entityId: badge.id,
        oldData: oldBadge as object,
        newData: badge as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, data: badge }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error updating badge:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// DELETE /api/gamification/badges/[id] - Delete badge
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { id } = await params;

    // Get badge for audit
    const badge = await prisma.badge.findUnique({ where: { id } });
    if (!badge) {
      return NextResponse.json(
        { success: false, error: 'Rozet bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Delete badge
    await prisma.badge.delete({ where: { id } });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE_BADGE',
        entity: 'Badge',
        entityId: id,
        oldData: badge as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, message: 'Rozet silindi' }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error deleting badge:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}



import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/gamification/badges/[id] - Get single badge
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
        { success: false, error: 'Rozet bulunamadı' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: badge });
  } catch (error) {
    console.error('Error fetching badge:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet getirilemedi' },
      { status: 500 }
    );
  }
}

// PATCH /api/gamification/badges/[id] - Update badge
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Get old badge for audit
    const oldBadge = await prisma.badge.findUnique({ where: { id } });
    if (!oldBadge) {
      return NextResponse.json(
        { success: false, error: 'Rozet bulunamadı' },
        { status: 404 }
      );
    }

    // Update badge
    const badge = await prisma.badge.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        icon: body.icon,
        rarity: (body.rarity || 'common').toLowerCase(),
        requirement: { type: 'custom', value: body.points || 100 },
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
      },
    });

    return NextResponse.json({ success: true, data: badge });
  } catch (error) {
    console.error('Error updating badge:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet güncellenemedi' },
      { status: 500 }
    );
  }
}

// DELETE /api/gamification/badges/[id] - Delete badge
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get badge for audit
    const badge = await prisma.badge.findUnique({ where: { id } });
    if (!badge) {
      return NextResponse.json(
        { success: false, error: 'Rozet bulunamadı' },
        { status: 404 }
      );
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
      },
    });

    return NextResponse.json({ success: true, message: 'Rozet silindi' });
  } catch (error) {
    console.error('Error deleting badge:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet silinemedi' },
      { status: 500 }
    );
  }
}


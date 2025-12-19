import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/gamification/rewards/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const reward = await prisma.reward.findUnique({
      where: { id },
    });

    if (!reward) {
      return NextResponse.json(
        { success: false, error: 'Ödül bulunamadı' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: reward });
  } catch (error) {
    console.error('Error fetching reward:', error);
    return NextResponse.json(
      { success: false, error: 'Ödül getirilemedi' },
      { status: 500 }
    );
  }
}

// PATCH /api/gamification/rewards/[id]
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

    const oldReward = await prisma.reward.findUnique({ where: { id } });
    if (!oldReward) {
      return NextResponse.json(
        { success: false, error: 'Ödül bulunamadı' },
        { status: 404 }
      );
    }

    const reward = await prisma.reward.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        type: body.type,
        value: body.value,
        pointsCost: body.pointsCost,
        stock: body.stock,
        isActive: body.isActive,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_REWARD',
        entity: 'Reward',
        entityId: reward.id,
        oldData: oldReward as object,
        newData: reward as object,
      },
    });

    return NextResponse.json({ success: true, data: reward });
  } catch (error) {
    console.error('Error updating reward:', error);
    return NextResponse.json(
      { success: false, error: 'Ödül güncellenemedi' },
      { status: 500 }
    );
  }
}

// DELETE /api/gamification/rewards/[id]
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

    const reward = await prisma.reward.findUnique({ where: { id } });
    if (!reward) {
      return NextResponse.json(
        { success: false, error: 'Ödül bulunamadı' },
        { status: 404 }
      );
    }

    await prisma.reward.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE_REWARD',
        entity: 'Reward',
        entityId: id,
        oldData: reward as object,
      },
    });

    return NextResponse.json({ success: true, message: 'Ödül silindi' });
  } catch (error) {
    console.error('Error deleting reward:', error);
    return NextResponse.json(
      { success: false, error: 'Ödül silinemedi' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/gamification/quests/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const quest = await prisma.quest.findUnique({
      where: { id },
    });

    if (!quest) {
      return NextResponse.json(
        { success: false, error: 'Görev bulunamadı' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: quest });
  } catch (error) {
    console.error('Error fetching quest:', error);
    return NextResponse.json(
      { success: false, error: 'Görev getirilemedi' },
      { status: 500 }
    );
  }
}

// PATCH /api/gamification/quests/[id]
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

    const oldQuest = await prisma.quest.findUnique({ where: { id } });
    if (!oldQuest) {
      return NextResponse.json(
        { success: false, error: 'Görev bulunamadı' },
        { status: 404 }
      );
    }

    const quest = await prisma.quest.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        icon: body.icon,
        type: body.type,
        requirement: body.requirement,
        reward: body.reward,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        isActive: body.isActive ?? true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_QUEST',
        entity: 'Quest',
        entityId: quest.id,
        oldData: oldQuest as object,
        newData: quest as object,
      },
    });

    return NextResponse.json({ success: true, data: quest });
  } catch (error) {
    console.error('Error updating quest:', error);
    return NextResponse.json(
      { success: false, error: 'Görev güncellenemedi' },
      { status: 500 }
    );
  }
}

// DELETE /api/gamification/quests/[id]
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

    const quest = await prisma.quest.findUnique({ where: { id } });
    if (!quest) {
      return NextResponse.json(
        { success: false, error: 'Görev bulunamadı' },
        { status: 404 }
      );
    }

    await prisma.quest.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE_QUEST',
        entity: 'Quest',
        entityId: id,
        oldData: quest as object,
      },
    });

    return NextResponse.json({ success: true, message: 'Görev silindi' });
  } catch (error) {
    console.error('Error deleting quest:', error);
    return NextResponse.json(
      { success: false, error: 'Görev silinemedi' },
      { status: 500 }
    );
  }
}


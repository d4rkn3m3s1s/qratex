import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { createQuestSchema } from '@/lib/validations';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    const quests = await prisma.quest.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { userQuests: true },
        },
        ...(userId && {
          userQuests: {
            where: { userId },
            select: {
              progress: true,
              completed: true,
              completedAt: true,
            },
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: quests,
    });
  } catch (error) {
    console.error('Quests fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Görevler yüklenemedi' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Yetkisiz erişim' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validatedData = createQuestSchema.parse(body);

    const quest = await prisma.quest.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        type: validatedData.type,
        target: validatedData.target,
        reward: validatedData.reward,
        expiresAt: validatedData.expiresAt,
        isActive: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_QUEST',
        resource: 'Quest',
        resourceId: quest.id,
        newData: quest as object,
      },
    });

    return NextResponse.json({
      success: true,
      data: quest,
    });
  } catch (error) {
    console.error('Quest create error:', error);
    return NextResponse.json(
      { success: false, error: 'Görev oluşturulamadı' },
      { status: 500 }
    );
  }
}


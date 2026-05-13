import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { authOptions } from '@/lib/auth';
import { createQuestSchema } from '@/lib/validations';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { getPointsMatrix, getQuestReward } from '@/lib/points-rules';
import { assertModuleEnabled } from '@/lib/module-gate';


export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const gate = await assertModuleEnabled('quests');
    if (gate) return gate;
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const userIdParam = searchParams.get('userId');
    const userId = userIdParam === 'me' ? session?.user?.id ?? null : userIdParam;

    if (userIdParam === 'me' && !userId) {
      return NextResponse.json(
        { success: false, error: 'Giriş yapmalısınız' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const quests = await prisma.quest.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { users: true },
        },
        ...(userId && {
          users: {
            where: { userId },
            select: {
              id: true,
              progress: true,
              completedAt: true,
            },
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    if (!userId) {
      return NextResponse.json({
        success: true,
        data: quests,
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const matrix = await getPointsMatrix();
    const userQuestIds = quests
      .map((quest) => quest.users?.[0]?.id)
      .filter((id): id is string => !!id);

    const claimLogs = userQuestIds.length
      ? await prisma.auditLog.findMany({
          where: {
            userId,
            action: 'CLAIM_QUEST_REWARD',
            entity: 'UserQuest',
            entityId: { in: userQuestIds },
          },
          select: { entityId: true },
          take: 200,
        })
      : [];

    const claimedQuestSet = new Set(claimLogs.map((log) => log.entityId).filter(Boolean));

    const normalized = quests.map((quest) => {
      const userQuest = quest.users?.[0] || null;
      const requirement = (quest.requirement || {}) as { count?: number };
      const target = typeof requirement.count === 'number' && requirement.count > 0 ? requirement.count : 1;
      const progress = userQuest?.progress || 0;
      const completed = !!userQuest?.completedAt || progress >= target;

      return {
        ...quest,
        target,
        reward: getQuestReward(quest.reward, matrix),
        progress,
        completed,
        claimed: userQuest ? claimedQuestSet.has(userQuest.id) : false,
        userQuestId: userQuest?.id ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: normalized,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Quests fetch error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Görevler yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(req: Request) {
  try {
    const gate = await assertModuleEnabled('quests');
    if (gate) return gate;
    const auditMeta = getAuditRequestMeta(req);
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Yetkisiz erişim' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const body = await req.json();
    const validatedData = createQuestSchema.parse(body);

    const quest = await prisma.quest.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        icon: validatedData.icon,
        type: validatedData.type,
        requirement: validatedData.requirement as object,
        reward: validatedData.reward as object,
        expiresAt: validatedData.expiresAt,
        isActive: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_QUEST',
        entity: 'Quest',
        entityId: quest.id,
        newData: quest as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({
      success: true,
      data: quest,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Quest create error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Görev oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}


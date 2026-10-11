import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth, getOptionalSession } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { getClientIdentifier } from '@/lib/rate-limit';
import { createQuestSchema } from '@/lib/validations';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { getPointsMatrix, getQuestReward } from '@/lib/points-rules';
import { assertModuleEnabled } from '@/lib/module-gate';
import { isAutoRewardQuest } from '@/lib/quests/reward';
import { resolveSubjectUserId } from '@/lib/auth/subject-user';


export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // Herkese açık katalog okuması: IP başına kötüye kullanım tavanı (oturum isteğe bağlı).
    const limited = await enforceRouteRateLimit('gamification.quests.read', getClientIdentifier(req), 'read');
    if (limited) return limited;
    const gate = await assertModuleEnabled('quests');
    if (gate) return gate;
    // Doğrulanmış isteğe bağlı oturum: ADMIN'in `?userId=<başkası>` yetkisi kapı + DB rolüyle.
    const session = await getOptionalSession();
    const { searchParams } = new URL(req.url);
    // P0-09: `?userId=` yalnız `me` (oturumlu) ya da ADMIN için; başkasının görev profili okunamaz.
    const subject = resolveSubjectUserId(session, searchParams.get('userId'));
    if (!subject.ok) {
      return NextResponse.json(
        { success: false, error: subject.error, code: subject.code },
        { status: subject.status, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const userId = subject.userId;

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
              rewardedAt: true,
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
      // P0-15: otomatik ödenen görevler (ziyaret, başarım) tamamlandığında zaten ödendi →
      // "alındı" görünür, claim düğmesi çıkmaz. rewardedAt tek kaynak; eski satırlar için audit.
      const autoReward = isAutoRewardQuest(quest);
      const claimed = userQuest
        ? !!userQuest.rewardedAt || claimedQuestSet.has(userQuest.id) || (autoReward && completed)
        : false;

      return {
        ...quest,
        target,
        reward: getQuestReward(quest.reward, matrix),
        progress,
        completed,
        claimed,
        autoReward,
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
    // P0-01: yönetici yazma ucu → gizli kapı + DB rolü (`requireAuth`); ham oturum rolü yetmez.
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('gamification.quests.create', auth.session.user.id, 'mutation');
    if (limited) return limited;
    const { session } = auth;

    const body = await req.json().catch(() => null);
    // P0-39: doğrulama hatası 400 + Türkçe mesaj döner (eskiden ZodError → 500).
    const parsedQuest = createQuestSchema.safeParse(body);
    if (!parsedQuest.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsedQuest.error.issues[0]?.message || 'Görev bilgileri geçersiz',
          code: 'VALIDATION_ERROR',
        },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const validatedData = parsedQuest.data;

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


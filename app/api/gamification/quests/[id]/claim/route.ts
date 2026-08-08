import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkIdempotency, storeIdempotency } from '@/lib/idempotency';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getPointsMatrix, getQuestReward } from '@/lib/points-rules';
import { getVariant } from '@/lib/gamification-ab';
import { assertModuleEnabled } from '@/lib/module-gate';


export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await assertModuleEnabled('quests');
    if (gate) return gate;
    const idemCheck = await checkIdempotency(request, 'quest-claim');
    if ('error' in idemCheck) return idemCheck.error;
    if (idemCheck.cached) return idemCheck.response;
    const idemKey = idemCheck.key;

    const auditMeta = getAuditRequestMeta(request);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Giriş yapmalısınız' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { id: questId } = await params;
    const userId = session.user.id;
    const matrix = await getPointsMatrix();
    const abVariant = await getVariant(userId, 'reward_copy');

    const result = await prisma.$transaction(async (tx) => {
      const quest = await tx.quest.findUnique({
        where: { id: questId },
        select: {
          id: true,
          name: true,
          reward: true,
          requirement: true,
          isActive: true,
          expiresAt: true,
        },
      });

      if (!quest || !quest.isActive) {
        throw new Error('QUEST_NOT_FOUND');
      }

      if (quest.expiresAt && quest.expiresAt < new Date()) {
        throw new Error('QUEST_EXPIRED');
      }

      const userQuest = await tx.userQuest.findUnique({
        where: {
          userId_questId: { userId, questId: quest.id },
        },
      });

      if (!userQuest) {
        throw new Error('QUEST_PROGRESS_NOT_FOUND');
      }

      const requirement = (quest.requirement || {}) as { count?: number };
      const target = typeof requirement.count === 'number' && requirement.count > 0 ? requirement.count : 1;
      const isCompleted = !!userQuest.completedAt || userQuest.progress >= target;

      if (!isCompleted) {
        throw new Error('QUEST_NOT_COMPLETED');
      }

      const lockId = userQuest.id;
      await tx.$queryRaw`SELECT id FROM "UserQuest" WHERE id = ${lockId} FOR UPDATE`;

      const alreadyClaimed = await tx.auditLog.findFirst({
        where: {
          userId,
          action: 'CLAIM_QUEST_REWARD',
          entity: 'UserQuest',
          entityId: lockId,
        },
        select: { id: true },
      });

      if (alreadyClaimed) {
        throw new Error('QUEST_ALREADY_CLAIMED');
      }

      const reward = getQuestReward(quest.reward, matrix);
      const updatedUser = await creditPointsAndXp(tx, {
        userId,
        points: reward.points,
        xp: reward.xp,
      });

      // Anti-fraud görünürlüğü: kredilenen puanı points_credited olarak işle (aynı tx).
      // NOT: Buradaki mevcut gamification_ab_impression event'i AYRI bir amaç (A/B) içindir.
      if (reward.points > 0) {
        await tx.analyticsEvent.create({
          data: { userId, event: 'points_credited', category: 'quest', data: { points: reward.points, questId: quest.id } },
        });
      }

      if (!userQuest.completedAt) {
        await tx.userQuest.update({
          where: { id: userQuest.id },
          data: { completedAt: new Date() },
        });
      }

      await tx.notification.create({
        data: {
          userId,
          title: 'Görev Ödülü Alındı! 🎉',
          message: `${quest.name} görevi için +${reward.points} puan ve +${reward.xp} XP kazandınız.`,
          type: 'success',
          data: {
            questId: quest.id,
            questName: quest.name,
            points: reward.points,
            xp: reward.xp,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CLAIM_QUEST_REWARD',
          entity: 'UserQuest',
          entityId: userQuest.id,
          newData: {
            questId: quest.id,
            questName: quest.name,
            points: reward.points,
            xp: reward.xp,
          },
          ...auditMeta,
        },
      });

      await tx.analyticsEvent.create({
        data: {
          userId,
          event: 'gamification_ab_impression',
          category: 'gamification',
          data: {
            experiment: 'reward_copy',
            variant: abVariant ?? 'default',
            outcome: 'quest_claim',
            questId: quest.id,
          },
        },
      });

      return {
        questId: quest.id,
        questName: quest.name,
        reward,
        userPoints: updatedUser.points,
        userXp: updatedUser.xp,
      };
    });

    const resBody = {
      success: true,
      message: 'Görev ödülü cüzdana işlendi',
      data: result,
    };
    if (idemKey) await storeIdempotency(idemKey, 'quest-claim', 200, resBody);
    return NextResponse.json(resBody, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'QUEST_NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: 'Görev bulunamadı veya aktif değil' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      if (error.message === 'QUEST_EXPIRED') {
        return NextResponse.json(
          { success: false, error: 'Görevin süresi dolmuş' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      if (error.message === 'QUEST_PROGRESS_NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: 'Bu görev için ilerleme kaydınız yok' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      if (error.message === 'QUEST_NOT_COMPLETED') {
        return NextResponse.json(
          { success: false, error: 'Görev henüz tamamlanmadı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      if (error.message === 'QUEST_ALREADY_CLAIMED') {
        return NextResponse.json(
          { success: false, error: 'Bu görevin ödülü daha önce alındı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }
    }

    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/gamification/quests/[id]/claim', status: 500 });
    console.error('Quest claim error:', error);
    return NextResponse.json(
      { success: false, error: 'Görev ödülü alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

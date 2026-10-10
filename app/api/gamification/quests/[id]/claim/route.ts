import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkIdempotency, storeIdempotency } from '@/lib/idempotency';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { getPointsMatrix, getQuestReward } from '@/lib/points-rules';
import { getVariant } from '@/lib/gamification-ab';
import { assertModuleEnabled } from '@/lib/module-gate';
import { isAutoRewardQuest, rewardQuestOnce } from '@/lib/quests/reward';

export const dynamic = 'force-dynamic';

type ClaimErrorCode =
  | 'QUEST_NOT_FOUND'
  | 'QUEST_EXPIRED'
  | 'QUEST_AUTO_REWARDED'
  | 'QUEST_PROGRESS_NOT_FOUND'
  | 'QUEST_NOT_COMPLETED'
  | 'QUEST_ALREADY_CLAIMED';

class QuestClaimError extends Error {
  constructor(public code: ClaimErrorCode) {
    super(code);
    this.name = 'QuestClaimError';
  }
}

const CLAIM_ERRORS: Record<ClaimErrorCode, { status: number; message: string }> = {
  QUEST_NOT_FOUND: { status: 404, message: 'Görev bulunamadı veya aktif değil' },
  QUEST_EXPIRED: { status: 400, message: 'Görevin süresi dolmuş' },
  QUEST_AUTO_REWARDED: {
    status: 409,
    message: 'Bu görevin ödülü tamamlandığında otomatik olarak hesabına işlenir',
  },
  QUEST_PROGRESS_NOT_FOUND: { status: 400, message: 'Bu görev için ilerleme kaydınız yok' },
  QUEST_NOT_COMPLETED: { status: 400, message: 'Görev henüz tamamlanmadı' },
  QUEST_ALREADY_CLAIMED: { status: 409, message: 'Bu görevin ödülü daha önce alındı' },
};

/**
 * POST /api/gamification/quests/[id]/claim — manuel görev ödülü.
 *
 * P0-15: ödeme yalnız `rewardQuestOnce` ile (UserQuest.rewardedAt tek kaynak + mintPoints
 * defteri). Otomatik ödenen görevler (ziyaret, başarım) bu uçtan ödenmez → 409.
 * `rewardedAt` alanından önce claim edilmiş satırlar için eski `CLAIM_QUEST_REWARD` audit'i
 * geçiş dönemi guard'ı olarak okunmaya devam eder.
 */
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
        { success: false, error: 'Giriş yapmalısınız' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
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
          archivedAt: true,
          expiresAt: true,
        },
      });

      if (!quest || !quest.isActive || quest.archivedAt) {
        throw new QuestClaimError('QUEST_NOT_FOUND');
      }

      if (quest.expiresAt && quest.expiresAt < new Date()) {
        throw new QuestClaimError('QUEST_EXPIRED');
      }

      // Otomatik ödenen görev: ödül tamamlandığında zaten verildi. Claim ikinci ödeme olurdu.
      if (isAutoRewardQuest(quest)) {
        throw new QuestClaimError('QUEST_AUTO_REWARDED');
      }

      const found = await tx.userQuest.findUnique({
        where: { userId_questId: { userId, questId: quest.id } },
        select: { id: true },
      });
      if (!found) {
        throw new QuestClaimError('QUEST_PROGRESS_NOT_FOUND');
      }

      // Satır kilidi + kilit SONRASI taze okuma (eşzamanlı claim'ler sıraya girer).
      await tx.$queryRaw`SELECT id FROM "UserQuest" WHERE id = ${found.id} FOR UPDATE`;
      const userQuest = await tx.userQuest.findUnique({
        where: { id: found.id },
        select: { id: true, progress: true, completedAt: true, rewardedAt: true },
      });
      if (!userQuest) {
        throw new QuestClaimError('QUEST_PROGRESS_NOT_FOUND');
      }

      const requirement = (quest.requirement || {}) as { count?: number };
      const target = typeof requirement.count === 'number' && requirement.count > 0 ? requirement.count : 1;
      const isCompleted = !!userQuest.completedAt || userQuest.progress >= target;
      if (!isCompleted) {
        throw new QuestClaimError('QUEST_NOT_COMPLETED');
      }

      if (userQuest.rewardedAt) {
        throw new QuestClaimError('QUEST_ALREADY_CLAIMED');
      }

      // Geçiş dönemi: rewardedAt alanından ÖNCE claim edilmiş satırlar.
      const legacyClaim = await tx.auditLog.findFirst({
        where: { userId, action: 'CLAIM_QUEST_REWARD', entity: 'UserQuest', entityId: userQuest.id },
        select: { id: true },
      });
      if (legacyClaim) {
        throw new QuestClaimError('QUEST_ALREADY_CLAIMED');
      }

      const reward = getQuestReward(quest.reward, matrix);
      const paid = await rewardQuestOnce(tx, {
        userQuestId: userQuest.id,
        userId,
        questId: quest.id,
        points: reward.points,
        xp: reward.xp,
        source: 'quest',
        completedAt: userQuest.completedAt ?? new Date(),
      });
      if (!paid.rewarded) {
        throw new QuestClaimError('QUEST_ALREADY_CLAIMED');
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
        userPoints: paid.balance,
        userXp: paid.xp,
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
    if (error instanceof QuestClaimError) {
      const e = CLAIM_ERRORS[error.code];
      return NextResponse.json(
        { success: false, error: e.message, code: error.code },
        { status: e.status, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/gamification/quests/[id]/claim', status: 500 });
    console.error('Quest claim error:', error);
    return NextResponse.json(
      { success: false, error: 'Görev ödülü alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

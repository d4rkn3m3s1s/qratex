import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';
import {
  awardBadgeInTx,
  AWARD_BADGE_REJECT_MESSAGES,
  type AwardBadgeRejectReason,
} from '@/lib/badges/award';

export const dynamic = 'force-dynamic';

/** awardBadge reddi: borçlandırma da geri alınsın diye tx içinden fırlatılır. */
class BadgeUnlockRejected extends Error {
  constructor(public reason: AwardBadgeRejectReason) {
    super(reason);
    this.name = 'BadgeUnlockRejected';
  }
}

const REJECT_STATUS: Record<AwardBadgeRejectReason, number> = {
  BADGE_NOT_FOUND: 404,
  BADGE_INACTIVE: 404,
  BADGE_HIDDEN: 400,
  ALREADY_OWNED: 409,
};

/**
 * POST /api/gamification/badges/[id]/unlock
 * Puanla rozet açma: pointCost kadar puan düşülür, rozet `awardBadge` ile verilir.
 * Borçlandırma ve rozet AYNI transaction'da; rozet verilemezse (zaten sahip, eşzamanlı istek,
 * pasif/sürpriz rozet) borç da geri alınır. Satın alınan rozet kazanım ödülü basmaz
 * (`reward: 'none'`): aksi hâlde ödülü fiyatından yüksek rozet puan basma döngüsü olurdu.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const userId = session.user.id;
    const { id: badgeId } = await params;

    const badge = await prisma.badge.findUnique({
      where: { id: badgeId },
      select: { id: true, name: true, pointCost: true, isActive: true, archivedAt: true, hiddenUntilEarned: true },
    });

    if (!badge || !badge.isActive || badge.archivedAt) {
      return NextResponse.json({ success: false, error: 'Rozet bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const pointCost = badge.pointCost ?? 0;
    if (pointCost <= 0) {
      return NextResponse.json(
        { success: false, error: 'Bu rozet puanla açılamaz' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Sürpriz rozetler puanla SATIN ALINAMAZ — yalnız koşul sağlanınca otomatik açılır
    // (aksi halde müşteri badgeId tahmin edip sürprizi satın alarak bozabilirdi).
    if (badge.hiddenUntilEarned) {
      return NextResponse.json(
        { success: false, error: AWARD_BADGE_REJECT_MESSAGES.BADGE_HIDDEN }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    let newPoints: number;
    try {
      newPoints = await prisma.$transaction(async (tx) => {
        // Atomik harcama: guarded decrement + defter + points_spent (eksi bakiye imkânsız).
        const wallet = await debitPoints(tx, {
          userId,
          points: pointCost,
          source: 'badge_unlock',
          sourceId: badgeId,
        });
        const award = await awardBadgeInTx(tx, {
          userId,
          badgeId,
          source: 'purchase',
          reward: 'none',
          allowHidden: false,
        });
        if (!award.awarded) throw new BadgeUnlockRejected(award.reason);
        return wallet.points;
      });
    } catch (err) {
      if (err instanceof InsufficientPointsError) {
        return NextResponse.json(
          { success: false, error: `Yeterli puanınız yok. Gerekli: ${pointCost} puan` },
          { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      if (err instanceof BadgeUnlockRejected) {
        return NextResponse.json(
          { success: false, error: AWARD_BADGE_REJECT_MESSAGES[err.reason], code: err.reason },
          { status: REJECT_STATUS[err.reason], headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      throw err;
    }

    // Rozet kazanım e-postası (opt-out kontrollü, ateşle-unut).
    const earnedBadgeName = badge.name;
    import('@/lib/notify-email')
      .then(({ emailBadgeEarned }) => emailBadgeEarned({ userId, badgeName: earnedBadgeName }))
      .catch((e) => console.error('[BADGE_EMAIL]', e));

    return NextResponse.json({
      success: true,
      data: {
        badgeId,
        newPoints,
      },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Badge unlock error:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet açılamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

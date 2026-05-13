import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getPointsMatrix } from '@/lib/points-rules';


export const dynamic = 'force-dynamic';

/**
 * Puan ekonomisi what-if: matris + basit senaryo çarpanları.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const sp = req.nextUrl.searchParams;
  const feedbackCount = Math.max(0, Math.min(10_000, Number(sp.get('feedbackCount') || '100')));
  const detailedRatio = Math.max(0, Math.min(1, Number(sp.get('detailedRatio') || '0.2')));
  const questCompletions = Math.max(0, Math.min(5000, Number(sp.get('questCompletions') || '40')));
  const spinPulls = Math.max(0, Math.min(5000, Number(sp.get('spinPulls') || '200')));

  const matrix = await getPointsMatrix();
  const base = matrix.feedback.base;
  const detailed = matrix.feedback.detailed;
  const detailedN = Math.round(feedbackCount * detailedRatio);
  const baseN = feedbackCount - detailedN;
  const feedbackPoints = baseN * base.points + detailedN * detailed.points;
  const feedbackXp = baseN * base.xp + detailedN * detailed.xp;

  const questGrant = matrix.quest.default;
  const questPoints = questCompletions * questGrant.points;
  const questXp = questCompletions * questGrant.xp;

  let spinPoints = 0;
  let spinXp = 0;
  if (matrix.spin.enabled && matrix.spin.prizes.length > 0) {
    const totalW = matrix.spin.prizes.reduce((s, p) => s + p.weight, 0) || 1;
    const expPerPull =
      matrix.spin.prizes.reduce((s, p) => {
        const share = p.weight / totalW;
        if (p.type === 'points') return s + p.value * share;
        if (p.type === 'xp') return s; // xp tracked separately
        return s;
      }, 0) * spinPulls;
    const expXpPerPull =
      matrix.spin.prizes.reduce((s, p) => {
        const share = p.weight / totalW;
        if (p.type === 'xp') return s + p.value * share;
        return s;
      }, 0) * spinPulls;
    spinPoints = Math.round(expPerPull);
    spinXp = Math.round(expXpPerPull);
  }

  const totalPoints = feedbackPoints + questPoints + spinPoints;
  const totalXp = feedbackXp + questXp + spinXp;

  return NextResponse.json({
    success: true,
    inputs: { feedbackCount, detailedRatio, questCompletions, spinPulls },
    matrixSnapshot: {
      feedbackBase: base,
      feedbackDetailed: detailed,
      questDefault: questGrant,
      spinEnabled: matrix.spin.enabled,
    },
    estimate: {
      feedbackPoints,
      feedbackXp,
      questPoints,
      questXp,
      spinPoints,
      spinXp,
      totalPoints,
      totalXp,
    },
    note: 'Tahmindir; gerçek dağılım kullanıcı davranışına bağlıdır.',
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

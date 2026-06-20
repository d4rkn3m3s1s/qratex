import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getDealerPlanLimits } from '@/lib/plan-limits';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  // null = planı kaldır (ücretsiz kademeye düşür)
  pricingPlanId: z.string().min(1).nullable(),
});

/**
 * PATCH /api/admin/users/[id]/plan — admin bir bayiye fiyatlandırma planı atar
 * (veya kaldırır). Plan atanınca kota uygulaması (lib/plan-limits) devreye girer.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'pricingPlanId gerekli (string veya null)' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (user.role !== 'DEALER') {
    return NextResponse.json(
      { error: 'Plan yalnızca bayilere atanabilir' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  // Geçerli plan mı (null değilse)?
  if (parsed.data.pricingPlanId) {
    const plan = await prisma.pricingPlan.findUnique({
      where: { id: parsed.data.pricingPlanId },
      select: { id: true },
    });
    if (!plan) {
      return NextResponse.json({ error: 'Plan bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
  }

  await prisma.user.update({
    where: { id },
    data: { pricingPlanId: parsed.data.pricingPlanId },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: 'dealer_plan_assigned',
      entity: 'User',
      entityId: id,
      newData: { pricingPlanId: parsed.data.pricingPlanId } as object,
    },
  });

  const limits = await getDealerPlanLimits(id);
  return NextResponse.json({ success: true, limits }, { headers: PRIVATE_NO_STORE_HEADERS });
}

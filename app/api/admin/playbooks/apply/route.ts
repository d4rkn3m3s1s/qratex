import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { buildPlaybookDrafts, getPlaybookById } from '@/lib/growth-playbooks';


export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  playbookId: z.string().min(1),
  dealerId: z.string().min(1),
  createCampaign: z.boolean().optional().default(true),
  createQuest: z.boolean().optional().default(false),
});

/**
 * Playbook → bayi kampanya taslağı (+ isteğe bağlı global görev).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const pb = getPlaybookById(parsed.data.playbookId);
  if (!pb) {
    return NextResponse.json({ error: 'Playbook bulunamadı' }, { status: 404 });
  }

  const dealer = await prisma.user.findFirst({
    where: { id: parsed.data.dealerId, role: 'DEALER' },
    select: { id: true, businessName: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: 'Bayi bulunamadı' }, { status: 404 });
  }

  const drafts = buildPlaybookDrafts(pb, { dealerLabel: dealer.businessName || undefined });

  let campaignId: string | null = null;
  let questId: string | null = null;

  if (parsed.data.createCampaign) {
    const c = await prisma.campaign.create({
      data: {
        dealerId: dealer.id,
        title: drafts.campaign.title.slice(0, 200),
        message: drafts.campaign.message,
        targetSegment: drafts.campaign.targetSegment,
        channel: drafts.campaign.channel,
        status: 'draft',
      },
    });
    campaignId = c.id;
  }

  if (parsed.data.createQuest) {
    const q = await prisma.quest.create({
      data: {
        name: drafts.quest.name.slice(0, 120),
        description: drafts.quest.description,
        icon: drafts.quest.icon,
        type: drafts.quest.type,
        requirement: drafts.quest.requirement as object,
        reward: drafts.quest.reward as object,
        isActive: drafts.quest.isActive,
      },
    });
    questId = q.id;
  }

  return NextResponse.json({
    success: true,
    playbookId: pb.id,
    campaignId,
    questId,
    drafts,
  });
}

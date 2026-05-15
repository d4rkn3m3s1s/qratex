import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { parsePositiveIntEnv } from '@/lib/safe-env-number';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const AI_QUALITY_SAMPLE_SIZE = parsePositiveIntEnv(process.env.AI_QUALITY_SAMPLE_SIZE, 100);

export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const feedbacks = await prisma.feedback.findMany({
    where: {
      deletedAt: null,
      aiProcessedAt: { not: null },
      text: { not: null },
      createdAt: { gte: weekAgo },
    },
    select: { id: true },
    take: AI_QUALITY_SAMPLE_SIZE * 2,
    orderBy: { createdAt: 'desc' },
  });

  const existing = await prisma.aIQualitySample.findMany({
    where: { feedbackId: { in: feedbacks.map((f) => f.id) } },
    select: { feedbackId: true },
  });
  const existingIds = new Set(existing.map((e) => e.feedbackId));
  const toAdd = feedbacks.filter((f) => !existingIds.has(f.id)).slice(0, AI_QUALITY_SAMPLE_SIZE);

  const result = await prisma.aIQualitySample.createMany({
    data: toAdd.map((f) => ({ feedbackId: f.id, status: 'pending' })),
    skipDuplicates: true,
  });
  return NextResponse.json({ checked: feedbacks.length, samplesCreated: result.count });
}

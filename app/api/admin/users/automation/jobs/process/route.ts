import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { processNextAutomationJob } from '@/lib/users-automation/queue';


export const dynamic = 'force-dynamic';

const processSchema = z.object({
  maxJobs: z.number().int().min(1).max(50).default(10),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const parsed = processSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Geçersiz veri' }, { status: 400 });
    }

    const processed: Array<{ jobId: string; status: string }> = [];
    for (let i = 0; i < parsed.data.maxJobs; i += 1) {
      const result = await processNextAutomationJob(`process-route-${i + 1}`);
      if (!result) break;
      processed.push({ jobId: result.jobId, status: result.status });
    }

    return NextResponse.json({ success: true, processedCount: processed.length, processed });
  } catch {
    return NextResponse.json({ error: 'Job işleme başarısız' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { runAutomationActions } from '@/lib/users-automation/engine';


export const dynamic = 'force-dynamic';

const dryRunSchema = z.object({
  condition: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(z.record(z.string(), z.unknown())).default([]),
  limit: z.number().int().min(1).max(1000).default(500),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const body = await request.json();
    const parsed = dryRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const result = await runAutomationActions({
      condition: parsed.data.condition,
      actions: parsed.data.actions as never[],
      dryRun: true,
      limit: parsed.data.limit,
    });
    return NextResponse.json({ success: true, result }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ error: 'Dry-run başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

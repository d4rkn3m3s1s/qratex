import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { processOutbox } from '@/lib/outbox';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();
  const count = await processOutbox();
  return NextResponse.json({ processed: count });
}

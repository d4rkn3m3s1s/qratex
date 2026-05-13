import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  deleteAnalyticsEventsOlderThan,
  DEFAULT_RETENTION_DAYS,
} from '@/lib/analytics-event-retention';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const deleted = await deleteAnalyticsEventsOlderThan(DEFAULT_RETENTION_DAYS);
  return NextResponse.json({ deletedCount: deleted, olderThanDays: DEFAULT_RETENTION_DAYS });
}

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runCustomerReminderNudges } from '@/lib/customer-reminders';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const result = await runCustomerReminderNudges();
  return NextResponse.json(result);
}

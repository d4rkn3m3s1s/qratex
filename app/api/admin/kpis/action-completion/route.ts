import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getActionCompletionAggregate } from '@/lib/kpis/action-completion';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') || '30d') as '7d' | '30d' | '90d';
  if (!['7d', '30d', '90d'].includes(period)) {
    return NextResponse.json({ error: 'Geçersiz period' }, { status: 400 });
  }

  const result = await getActionCompletionAggregate(period);
  return NextResponse.json(result);
}

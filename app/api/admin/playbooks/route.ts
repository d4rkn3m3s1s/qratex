import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { GROWTH_PLAYBOOKS, getPlaybookById } from '@/lib/growth-playbooks';


export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    const pb = getPlaybookById(id);
    if (!pb) return NextResponse.json({ error: 'Playbook bulunamadı' }, { status: 404 });
    return NextResponse.json({ success: true, playbook: pb });
  }

  return NextResponse.json({ success: true, playbooks: GROWTH_PLAYBOOKS });
}

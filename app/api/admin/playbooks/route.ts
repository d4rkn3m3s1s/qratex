import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { GROWTH_PLAYBOOKS, getPlaybookById } from '@/lib/growth-playbooks';


export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    const pb = getPlaybookById(id);
    if (!pb) return NextResponse.json({ error: 'Playbook bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    return NextResponse.json({ success: true, playbook: pb }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  return NextResponse.json({ success: true, playbooks: GROWTH_PLAYBOOKS }, { headers: PRIVATE_NO_STORE_HEADERS });
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/inbox/[id] — tek mailin TAM içeriği (bodyText/bodyHtml). Açınca seen=true yapar.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const msg = await prisma.inboxMessage.findUnique({ where: { id } }).catch(() => null);
  if (!msg) return NextResponse.json({ success: false, error: 'Mail bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });

  // Açıldı → okundu işaretle.
  if (!msg.seen) await prisma.inboxMessage.update({ where: { id }, data: { seen: true } }).catch(() => {});

  return NextResponse.json({ success: true, message: { ...msg, seen: true } }, { headers: PRIVATE_NO_STORE_HEADERS });
}

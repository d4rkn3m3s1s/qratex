import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const bulkRoleSchema = z.object({
  action: z.literal('update_role'),
  userIds: z.array(z.string().cuid()).min(1).max(100),
  role: z.enum(['ADMIN', 'DEALER', 'CUSTOMER']),
});

const bulkDeleteSchema = z.object({
  action: z.literal('delete'),
  userIds: z.array(z.string().cuid()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const rl = checkAdminRateLimit(auth.session.user.id);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
          },
        }
      );
    }

    const body = await request.json();
    if (body.action === 'update_role') {
      const parsed = bulkRoleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      const { userIds, role } = parsed.data;
      const currentUser = auth.session.user.id;
      const ids = userIds.filter((id) => id !== currentUser);
      if (ids.length === 0) {
        return NextResponse.json({ error: 'Kendinizin rolünü toplu değiştiremezsiniz' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      await prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { role },
      });
      // Toplu rol değişikliği izlenmeli (tekil işlemler gibi) — kritik yetki değişimi.
      await prisma.auditLog.create({
        data: {
          userId: currentUser, action: 'BULK_UPDATE_USER_ROLE', entity: 'User', entityId: `${ids.length} kullanıcı`,
          newData: { userIds: ids, role } as object, ...getAuditRequestMeta(request),
        },
      }).catch((e) => console.error('[users/bulk] audit failed:', e));
      return NextResponse.json({ ok: true, updated: ids.length }, { headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (body.action === 'delete') {
      const parsed = bulkDeleteSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      const { userIds } = parsed.data;
      const currentUser = auth.session.user.id;
      const ids = userIds.filter((id) => id !== currentUser);
      if (ids.length === 0) {
        return NextResponse.json({ error: 'Kendinizi silemezsiniz' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      // Silinecek kullanıcıların özetini audit için önce al (silindikten sonra erişilemez).
      const victims = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, role: true } }).catch(() => []);
      await prisma.user.deleteMany({
        where: { id: { in: ids } },
      });
      // Toplu kullanıcı SİLME mutlaka izlenmeli (kalıcı, geri alınamaz).
      await prisma.auditLog.create({
        data: {
          userId: currentUser, action: 'BULK_DELETE_USERS', entity: 'User', entityId: `${ids.length} kullanıcı`,
          oldData: { deleted: victims } as object, ...getAuditRequestMeta(request),
        },
      }).catch((e) => console.error('[users/bulk] audit failed:', e));
      return NextResponse.json({ ok: true, deleted: ids.length }, { headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: 'Bilinmeyen işlem' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Bulk users error:', e);
    return NextResponse.json({ error: 'Toplu işlem başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

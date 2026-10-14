/**
 * GET /api/admin/team/tasks/[id]/file?k=<key> — görev eki (PRIVATE, `tasks/` öneki) yetkili akış.
 * Yalnız görevi GÖREBİLEN ekip üyesi (findVisibleTask kapsamı) ve key bu görevin bir ekine ya da
 * yorum ekine ait olmalı (başka görevin key'iyle erişilemez). Riskli türler indirme olarak verilir.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute } from '@/lib/http/define-route';
import { TEAM_ROUTE_ROLES, findVisibleTask, requireTeamViewer } from '@/lib/team/access';
import { legacyPublicBase, safeFileHeaders, storedKeyOf } from '@/lib/storage/served-url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const params = z.object({ id: z.string().min(1).max(60) });
const query = z.object({ k: z.string().min(1).max(600) });

export const GET = defineRoute(
  { name: 'team.task.file', roles: TEAM_ROUTE_ROLES, params, query, rateLimit: 'read' },
  async ({ user, params: p, query: q }) => {
    const key = storedKeyOf(q.k);
    if (!key || key !== q.k || !key.startsWith('tasks/')) throw new ApiError('NOT_FOUND', 'Dosya bulunamadı.');

    const viewer = await requireTeamViewer(user.id);
    const task = await findVisibleTask(viewer, p.id, { id: true });

    // DB'de key (yeni), `/key` ya da eski tam public URL (geri uyum) olarak saklanmış olabilir.
    const base = legacyPublicBase();
    const forms = [key, `/${key}`, ...(base ? [`${base}/${key}`] : [])];
    const att = await prisma.taskAttachment.findFirst({
      where: { taskId: task.id, path: { in: forms } },
      select: { filename: true, mime: true },
    });
    let meta = att;
    if (!meta) {
      const c = await prisma.taskComment.findFirst({
        where: { taskId: task.id, attachmentPath: { in: forms } },
        select: { attachmentName: true },
      });
      if (!c) throw new ApiError('NOT_FOUND', 'Dosya bulunamadı.');
      const src = await prisma.taskAttachment.findFirst({ where: { path: { in: forms } }, select: { mime: true } });
      meta = { filename: c.attachmentName ?? key.slice(key.lastIndexOf('/') + 1), mime: src?.mime ?? 'application/octet-stream' };
    }

    const { isR2Configured, getR2Object } = await import('@/lib/r2-storage');
    if (!isR2Configured()) throw new ApiError('SERVICE_UNAVAILABLE', 'Dosya deposuna şu anda ulaşılamıyor.');
    const obj = await getR2Object(key);
    if (!obj) throw new ApiError('NOT_FOUND', 'Dosya depoda bulunamadı.');
    return new Response(obj.body, {
      status: 200,
      headers: {
        ...safeFileHeaders(meta.mime, meta.filename),
        'Cache-Control': 'private, no-store',
        ...(obj.size != null ? { 'Content-Length': String(obj.size) } : {}),
      },
    });
  }
);

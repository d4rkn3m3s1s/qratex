import type { Prisma } from '@prisma/client';
import { toServedUrl } from '@/lib/storage/served-url';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { TEAM_ROUTE_ROLES, requireTeamViewer, scopedTaskWhere } from '@/lib/team/access';
import { canDeleteAttachment } from '@/lib/team/permissions';

export const dynamic = 'force-dynamic';

const TYPE_MIMES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  office: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
  ],
  text: ['text/plain', 'text/csv', 'application/json', 'text/markdown'],
  archive: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'],
  video: ['video/mp4', 'video/webm'],
};

const PAGE = 48;

const query = z.object({
  q: z.string().max(120).optional(),
  type: z.enum(['image', 'pdf', 'office', 'text', 'archive', 'video']).optional(),
  department: z.string().max(60).optional(),
  uploadedBy: z.string().max(60).optional(),
  cursor: z.string().max(60).optional(),
});

/**
 * GET — görev ekleri (Dosyalar). YALNIZ görünür görevlerin ekleri (denetim Y4: üye şirketin
 * tüm eklerini görüyordu); imleçli sayfalama (eski kod 300 kayıtla kesiyordu).
 */
export const GET = defineRoute(
  { name: 'team.files.list', roles: TEAM_ROUTE_ROLES, query, rateLimit: 'read' },
  async ({ user, query: q }) => {
    const viewer = await requireTeamViewer(user.id);
    const and: Prisma.TaskAttachmentWhereInput[] = [{ task: scopedTaskWhere(viewer) }];
    if (q.type === 'image') and.push({ mime: { startsWith: 'image/' } });
    else if (q.type) and.push({ mime: { in: TYPE_MIMES[q.type] } });
    if (q.uploadedBy) and.push({ uploadedById: q.uploadedBy });
    if (q.department && viewer.isManager) and.push({ task: { department: q.department } });
    const s = q.q?.trim();
    if (s) and.push({ OR: [{ filename: { contains: s, mode: 'insensitive' } }, { task: { title: { contains: s, mode: 'insensitive' } } }] });
    const where: Prisma.TaskAttachmentWhereInput = { AND: and };

    const [rows, agg] = await Promise.all([
      prisma.taskAttachment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          filename: true,
          path: true,
          mime: true,
          size: true,
          createdAt: true,
          uploadedById: true,
          uploadedBy: { select: { id: true, name: true, image: true } },
          task: { select: { id: true, title: true, department: true } },
        },
      }),
      q.cursor ? Promise.resolve(null) : prisma.taskAttachment.aggregate({ where, _sum: { size: true }, _count: true }),
    ]);
    const hasMore = rows.length > PAGE;
    const items = rows.slice(0, PAGE).map((f) => ({
      id: f.id,
      filename: f.filename,
      path: toServedUrl(f.path, { kind: 'task', taskId: f.task.id }) ?? '',
      mime: f.mime,
      size: f.size,
      createdAt: f.createdAt.toISOString(),
      uploadedBy: f.uploadedBy,
      task: f.task,
      canDelete: canDeleteAttachment(viewer, f),
    }));
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      stats: agg ? { count: agg._count, totalSize: agg._sum.size ?? 0 } : null,
    };
  }
);

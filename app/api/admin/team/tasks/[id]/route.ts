import { after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ApiError } from '@/lib/http/define-route';
import { TEAM_ROUTE_ROLES, findVisibleTask, requireTeamViewer } from '@/lib/team/access';
import { canDeleteComment, canEditChecklist, canEditComment, canLogTime } from '@/lib/team/permissions';
import { loadTaskDetail } from '@/lib/team/detail';
import { parseDueDay } from '@/lib/team/tasks';
import { formatMinutes } from '@/lib/team/dates';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(60) });

/** GET — görev detayı (kapsam dışı görev 404; yetenek bayraklarıyla). */
export const GET = defineRoute(
  { name: 'team.task.detail', roles: TEAM_ROUTE_ROLES, params, rateLimit: 'read' },
  async ({ user, params: p }) => {
    const viewer = await requireTeamViewer(user.id);
    return loadTaskDetail(viewer, p.id);
  }
);

const REACTIONS = ['👍', '❤️', '🎉', '🚀', '👀'] as const;

const actionBody = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_checklist'),
    text: z.string().trim().min(1).max(300),
    assignedToId: z.string().max(60).nullish(),
    dueDate: z.string().max(10).nullish(),
  }),
  z.object({ op: z.literal('add_checklist_many'), items: z.array(z.string().trim().min(1).max(300)).min(1).max(20) }),
  z.object({ op: z.literal('toggle_checklist'), itemId: z.string().max(60), done: z.boolean() }),
  z.object({
    op: z.literal('update_checklist'),
    itemId: z.string().max(60),
    assignedToId: z.string().max(60).nullish(),
    dueDate: z.string().max(10).nullish(),
    text: z.string().trim().min(1).max(300).optional(),
  }),
  z.object({ op: z.literal('delete_checklist'), itemId: z.string().max(60) }),
  z.object({
    op: z.literal('add_comment'),
    text: z.string().trim().min(1).max(4000),
    mentions: z.array(z.string().max(60)).max(20).optional(),
    parentId: z.string().max(60).nullish(),
    /** Yalnız BU göreve yüklenmiş bir ekin kimliği (serbest URL kabul edilmez). */
    attachmentId: z.string().max(60).nullish(),
  }),
  z.object({ op: z.literal('edit_comment'), commentId: z.string().max(60), text: z.string().trim().min(1).max(4000) }),
  z.object({ op: z.literal('delete_comment'), commentId: z.string().max(60) }),
  z.object({ op: z.literal('toggle_reaction'), commentId: z.string().max(60), emoji: z.enum(REACTIONS) }),
  /** Süre kaydı — atanan kişi (ya da yönetici); atomik artış (denetim Y1, Bulgu 88). */
  z.object({ op: z.literal('log_time'), minutes: z.number().int().min(1).max(24 * 60) }),
]);

/** POST — detay alt işlemleri; yanıt güncel detaydır (istemci ikinci istek atmaz). */
export const POST = defineRoute(
  { name: 'team.task.action', roles: TEAM_ROUTE_ROLES, params, schema: actionBody, rateLimit: 'mutation' },
  async ({ user, params: p, body }) => {
    const viewer = await requireTeamViewer(user.id);
    const task = await findVisibleTask(viewer, p.id, { id: true, title: true, assignedToId: true, createdById: true, status: true });
    const log = (action: string, detail: string) =>
      prisma.taskActivity.create({ data: { taskId: task.id, actorId: viewer.userId, action, detail } }).catch(() => undefined);
    const itemOf = async (itemId: string) => {
      const item = await prisma.taskChecklistItem.findFirst({ where: { id: itemId, taskId: task.id }, select: { id: true, text: true } });
      if (!item) throw new ApiError('NOT_FOUND', 'Alt görev bulunamadı.');
      return item;
    };
    const commentOf = async (commentId: string) => {
      const c = await prisma.taskComment.findFirst({ where: { id: commentId, taskId: task.id }, select: { id: true, authorId: true } });
      if (!c) throw new ApiError('NOT_FOUND', 'Yorum bulunamadı.');
      return c;
    };
    const requireChecklistRight = () => {
      if (!canEditChecklist(viewer, task)) throw new ApiError('FORBIDDEN', 'Bu görevin alt görevlerini yalnız atanan kişi ve yönetici düzenleyebilir.');
    };

    switch (body.op) {
      case 'add_checklist': {
        requireChecklistRight();
        if (body.assignedToId && !viewer.isManager) throw new ApiError('FORBIDDEN', 'Alt görevi yalnız yönetici birine atayabilir.');
        const max = await prisma.taskChecklistItem.aggregate({ where: { taskId: task.id }, _max: { order: true } });
        await prisma.taskChecklistItem.create({
          data: {
            taskId: task.id,
            text: body.text,
            order: (max._max.order ?? -1) + 1,
            assignedToId: body.assignedToId || null,
            dueAt: parseDueDay(body.dueDate),
          },
        });
        await log('checklist', `Alt görev ekledi: ${body.text.slice(0, 60)}`);
        break;
      }
      case 'add_checklist_many': {
        requireChecklistRight();
        const max = await prisma.taskChecklistItem.aggregate({ where: { taskId: task.id }, _max: { order: true } });
        const base = (max._max.order ?? -1) + 1;
        await prisma.taskChecklistItem.createMany({ data: body.items.map((text, i) => ({ taskId: task.id, text, order: base + i })) });
        await log('checklist', `${body.items.length} alt görev ekledi`);
        break;
      }
      case 'toggle_checklist': {
        requireChecklistRight();
        const item = await itemOf(body.itemId);
        await prisma.taskChecklistItem.update({ where: { id: item.id }, data: { done: body.done } });
        await log('checklist', `${body.done ? 'Tamamladı' : 'Yeniden açtı'}: ${item.text.slice(0, 60)}`);
        break;
      }
      case 'update_checklist': {
        if (!viewer.isManager && (body.assignedToId !== undefined || body.dueDate !== undefined)) {
          throw new ApiError('FORBIDDEN', 'Alt görev ataması ve tarihi yalnız yöneticidedir.');
        }
        requireChecklistRight();
        const item = await itemOf(body.itemId);
        await prisma.taskChecklistItem.update({
          where: { id: item.id },
          data: {
            ...(body.assignedToId !== undefined ? { assignedToId: body.assignedToId || null } : {}),
            ...(body.dueDate !== undefined ? { dueAt: parseDueDay(body.dueDate) } : {}),
            ...(body.text !== undefined ? { text: body.text } : {}),
          },
        });
        break;
      }
      case 'delete_checklist': {
        requireChecklistRight();
        const item = await itemOf(body.itemId);
        await prisma.taskChecklistItem.delete({ where: { id: item.id } });
        await log('checklist', `Alt görevi sildi: ${item.text.slice(0, 60)}`);
        break;
      }
      case 'add_comment': {
        if (body.parentId) await commentOf(body.parentId);
        let attachment: { path: string; filename: string } | null = null;
        if (body.attachmentId) {
          attachment = await prisma.taskAttachment.findFirst({
            where: { id: body.attachmentId, taskId: task.id, uploadedById: viewer.userId },
            select: { path: true, filename: true },
          });
          if (!attachment) throw new ApiError('VALIDATION', 'Ek bu göreve ait değil.');
        }
        await prisma.taskComment.create({
          data: {
            taskId: task.id,
            authorId: viewer.userId,
            text: body.text,
            parentId: body.parentId || null,
            attachmentPath: attachment?.path ?? null,
            attachmentName: attachment?.filename ?? null,
          },
        });
        const mentionIds = [...new Set((body.mentions ?? []).filter((m) => m && m !== viewer.userId))];
        const mentioned = mentionIds.length
          ? await prisma.user.findMany({
              where: { id: { in: mentionIds }, OR: [{ adminTeamRole: { not: null } }, { role: 'ADMIN' }] },
              select: { id: true, name: true, email: true, role: true },
            })
          : [];
        await log(mentioned.length ? 'mentioned' : 'commented', mentioned.length ? `Yorumda ${mentioned.map((u) => u.name || 'bir üye').join(', ')} kişisini etiketledi` : 'Yorum yaptı');
        if (mentioned.length > 0) {
          const text = body.text;
          after(async () => {
            const [{ teamTaskHref }, { getPublicAppOrigin }, email, notify] = await Promise.all([
              import('@/lib/team/href'),
              import('@/lib/public-app-origin'),
              import('@/lib/team-email'),
              import('@/lib/team-notify'),
            ]);
            const origin = getPublicAppOrigin().replace(/\/$/, '');
            await Promise.allSettled(
              mentioned.flatMap((u) => [
                email.sendMentionEmail({
                  to: u.email,
                  mentionName: u.name,
                  byName: viewer.name,
                  taskTitle: task.title,
                  commentText: text,
                  link: `${origin}${teamTaskHref(u.role, task.id)}`,
                }),
                notify.notifyMention({ userId: u.id, taskId: task.id, taskTitle: task.title, byName: viewer.name }),
              ])
            );
          });
        }
        break;
      }
      case 'edit_comment': {
        const c = await commentOf(body.commentId);
        if (!canEditComment(viewer, c)) throw new ApiError('FORBIDDEN', 'Yalnız kendi yorumunu düzenleyebilirsin.');
        await prisma.taskComment.update({ where: { id: c.id }, data: { text: body.text, editedAt: new Date() } });
        break;
      }
      case 'delete_comment': {
        const c = await commentOf(body.commentId);
        if (!canDeleteComment(viewer, c)) throw new ApiError('FORBIDDEN', 'Bu yorumu silemezsin.');
        await prisma.taskComment.delete({ where: { id: c.id } });
        await log('commented', 'Bir yorumu sildi');
        break;
      }
      case 'toggle_reaction': {
        const c = await commentOf(body.commentId);
        const existing = await prisma.taskCommentReaction.findUnique({
          where: { commentId_userId_emoji: { commentId: c.id, userId: viewer.userId, emoji: body.emoji } },
          select: { id: true },
        });
        if (existing) await prisma.taskCommentReaction.delete({ where: { id: existing.id } });
        else await prisma.taskCommentReaction.create({ data: { commentId: c.id, userId: viewer.userId, emoji: body.emoji } });
        break;
      }
      case 'log_time': {
        if (!canLogTime(viewer, task)) throw new ApiError('FORBIDDEN', 'Süreyi yalnız görevi yapan kişi ve yönetici kaydedebilir.');
        await prisma.companyTask.update({ where: { id: task.id }, data: { spentMin: { increment: body.minutes } } });
        await log('time', `${formatMinutes(body.minutes)} çalışma süresi ekledi`);
        break;
      }
    }

    return loadTaskDetail(viewer, task.id);
  }
);


import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/** GET: tek görev + checklist + yorumlar + aktivite geçmişi (detay modalı için). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const task = await prisma.companyTask.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true, image: true } },
      createdBy: { select: { id: true, name: true } },
      blockedBy: { select: { id: true, title: true, status: true } },
      checklist: { orderBy: { order: 'asc' }, include: { assignedTo: { select: { id: true, name: true, email: true, image: true } } } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, name: true, email: true, image: true } },
          reactions: { select: { emoji: true, userId: true } },
        },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { actor: { select: { id: true, name: true } } },
      },
      attachments: {
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { name: true } } },
      },
    },
  });
  if (!task) return NextResponse.json({ success: false, error: 'Görev bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  return NextResponse.json({ success: true, task }, { headers: PRIVATE_NO_STORE_HEADERS });
}

const actionSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add_checklist'), text: z.string().min(1).max(300), assignedToId: z.string().optional().nullable(), dueAt: z.string().datetime().optional().nullable() }),
  z.object({ op: z.literal('toggle_checklist'), itemId: z.string(), done: z.boolean() }),
  z.object({ op: z.literal('update_checklist'), itemId: z.string(), assignedToId: z.string().optional().nullable(), dueAt: z.string().datetime().optional().nullable(), text: z.string().max(300).optional() }),
  z.object({ op: z.literal('delete_checklist'), itemId: z.string() }),
  z.object({
    op: z.literal('add_comment'), text: z.string().min(1).max(2000),
    mentions: z.array(z.string()).max(20).optional(),
    parentId: z.string().optional().nullable(), // yanıt (thread)
    attachmentPath: z.string().max(500).optional().nullable(), // yoruma iliştirilmiş dosya (R2 URL)
    attachmentName: z.string().max(200).optional().nullable(),
  }),
  z.object({ op: z.literal('edit_comment'), commentId: z.string(), text: z.string().min(1).max(2000) }),
  z.object({ op: z.literal('delete_comment'), commentId: z.string() }),
  z.object({ op: z.literal('toggle_reaction'), commentId: z.string(), emoji: z.string().min(1).max(8) }),
]);

/** POST: detay alt-işlemleri (checklist ekle/işaretle/sil, yorum ekle/sil). Aktivite kaydı yazar. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const { id: taskId } = await params;
  const userId = auth.session.user.id;
  const isManager = auth.isManager;

  // Görev var mı + ERİŞİM: yönetici her göreve; üye YALNIZ kendine atanmış göreve
  // alt-işlem yapabilir (başkasının görevini yorumlayarak/kanıt enjekte ederek
  // onay akışını kirletmesini engeller).
  const task = await prisma.companyTask.findUnique({ where: { id: taskId }, select: { id: true, assignedToId: true } });
  if (!task) return NextResponse.json({ success: false, error: 'Görev bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  if (!isManager && task.assignedToId !== userId) {
    return NextResponse.json({ success: false, error: 'Yalnızca size atanmış görevlerde işlem yapabilirsiniz.' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz işlem' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const d = parsed.data;

  const logActivity = (action: string, detail: string) =>
    prisma.taskActivity.create({ data: { taskId, actorId: userId, action, detail } });

  // Bir checklist item / yorumun gerçekten BU göreve ait olduğunu doğrula (IDOR koruması).
  const checklistBelongs = async (itemId: string) =>
    (await prisma.taskChecklistItem.findUnique({ where: { id: itemId }, select: { taskId: true } }))?.taskId === taskId;
  const commentBelongs = async (commentId: string) =>
    (await prisma.taskComment.findUnique({ where: { id: commentId }, select: { taskId: true } }))?.taskId === taskId;
  const NOT_FOUND = NextResponse.json({ success: false, error: 'Kayıt bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });

  switch (d.op) {
    case 'add_checklist': {
      const count = await prisma.taskChecklistItem.count({ where: { taskId } });
      await prisma.taskChecklistItem.create({ data: {
        taskId, text: d.text, order: count,
        assignedToId: d.assignedToId || null,
        dueAt: d.dueAt ? new Date(d.dueAt) : null,
      } });
      await logActivity('checklist', `Alt görev eklendi: ${d.text.slice(0, 40)}`);
      break;
    }
    case 'toggle_checklist':
      if (!(await checklistBelongs(d.itemId))) return NOT_FOUND;
      await prisma.taskChecklistItem.update({ where: { id: d.itemId }, data: { done: d.done } });
      break;
    case 'update_checklist': {
      if (!(await checklistBelongs(d.itemId))) return NOT_FOUND;
      const upd: { assignedToId?: string | null; dueAt?: Date | null; text?: string } = {};
      if (d.assignedToId !== undefined) upd.assignedToId = d.assignedToId || null;
      if (d.dueAt !== undefined) upd.dueAt = d.dueAt ? new Date(d.dueAt) : null;
      if (d.text !== undefined) upd.text = d.text;
      await prisma.taskChecklistItem.update({ where: { id: d.itemId }, data: upd }).catch(() => null);
      break;
    }
    case 'delete_checklist':
      if (!(await checklistBelongs(d.itemId))) return NOT_FOUND;
      await prisma.taskChecklistItem.delete({ where: { id: d.itemId } }).catch(() => null);
      break;
    case 'add_comment': {
      await prisma.taskComment.create({ data: {
        taskId, authorId: userId, text: d.text,
        parentId: d.parentId || null,
        attachmentPath: d.attachmentPath || null,
        attachmentName: d.attachmentName || null,
      } });
      // @bahsedilenlere bildirim (kendini etiketleme sayılmaz).
      const mentionIds = [...new Set((d.mentions ?? []).filter((m) => m && m !== userId))];
      if (mentionIds.length > 0) {
        const [task, mentioned, actor] = await Promise.all([
          prisma.companyTask.findUnique({ where: { id: taskId }, select: { title: true } }),
          prisma.user.findMany({ where: { id: { in: mentionIds } }, select: { id: true, name: true, email: true } }),
          prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
        ]);
        const names = mentioned.map((u) => u.name || u.email).join(', ');
        await logActivity('mentioned', names ? `${names} etiketlendi` : 'Yorum yaptı');
        if (task) {
          import('@/lib/team-email').then((m) =>
            Promise.all(mentioned.map((u) => m.sendMentionEmail({
              to: u.email, mentionName: u.name, byName: actor?.name, taskTitle: task.title, commentText: d.text,
            })))
          ).catch(() => {});
          import('@/lib/team-notify').then((m) =>
            Promise.all(mentioned.map((u) => m.notifyMention({
              userId: u.id, taskId, taskTitle: task.title, byName: actor?.name,
            })))
          ).catch(() => {});
        }
      } else {
        await logActivity('commented', 'Yorum yaptı');
      }
      break;
    }
    case 'edit_comment': {
      // Yorum bu göreve ait olmalı + yalnızca yazarı düzenleyebilir.
      const comment = await prisma.taskComment.findUnique({ where: { id: d.commentId }, select: { authorId: true, taskId: true } });
      if (!comment || comment.taskId !== taskId) return NOT_FOUND;
      if (comment.authorId !== userId) {
        return NextResponse.json({ success: false, error: 'Bu yorumu düzenleyemezsiniz' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
      }
      await prisma.taskComment.update({ where: { id: d.commentId }, data: { text: d.text, editedAt: new Date() } });
      break;
    }
    case 'delete_comment': {
      // Yorum bu göreve ait olmalı + yalnızca YAZARI veya YÖNETİCİ silebilir.
      const comment = await prisma.taskComment.findUnique({ where: { id: d.commentId }, select: { authorId: true, taskId: true } });
      if (!comment || comment.taskId !== taskId) return NOT_FOUND;
      if (comment.authorId !== userId && !isManager) {
        return NextResponse.json({ success: false, error: 'Bu yorumu silemezsiniz' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
      }
      await prisma.taskComment.delete({ where: { id: d.commentId } }).catch(() => null);
      break;
    }
    case 'toggle_reaction': {
      // Yorum bu göreve ait olmalı (IDOR koruması).
      if (!(await commentBelongs(d.commentId))) return NOT_FOUND;
      // Aynı (yorum,kullanıcı,emoji) varsa kaldır, yoksa ekle (toggle).
      const existing = await prisma.taskCommentReaction.findUnique({
        where: { commentId_userId_emoji: { commentId: d.commentId, userId, emoji: d.emoji } },
      }).catch(() => null);
      if (existing) {
        await prisma.taskCommentReaction.delete({ where: { id: existing.id } }).catch(() => null);
      } else {
        await prisma.taskCommentReaction.create({ data: { commentId: d.commentId, userId, emoji: d.emoji } }).catch(() => null);
      }
      break;
    }
  }

  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}

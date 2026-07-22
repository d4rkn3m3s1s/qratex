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
      checklist: { orderBy: { order: 'asc' } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, email: true, image: true } } },
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
  z.object({ op: z.literal('add_checklist'), text: z.string().min(1).max(300) }),
  z.object({ op: z.literal('toggle_checklist'), itemId: z.string(), done: z.boolean() }),
  z.object({ op: z.literal('delete_checklist'), itemId: z.string() }),
  z.object({ op: z.literal('add_comment'), text: z.string().min(1).max(2000), mentions: z.array(z.string()).max(20).optional() }),
  z.object({ op: z.literal('delete_comment'), commentId: z.string() }),
]);

/** POST: detay alt-işlemleri (checklist ekle/işaretle/sil, yorum ekle/sil). Aktivite kaydı yazar. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const { id: taskId } = await params;
  const userId = auth.session.user.id;

  const raw = await req.json().catch(() => ({}));
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz işlem' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const d = parsed.data;

  const logActivity = (action: string, detail: string) =>
    prisma.taskActivity.create({ data: { taskId, actorId: userId, action, detail } });

  switch (d.op) {
    case 'add_checklist': {
      const count = await prisma.taskChecklistItem.count({ where: { taskId } });
      await prisma.taskChecklistItem.create({ data: { taskId, text: d.text, order: count } });
      await logActivity('checklist', `Alt görev eklendi: ${d.text.slice(0, 40)}`);
      break;
    }
    case 'toggle_checklist':
      await prisma.taskChecklistItem.update({ where: { id: d.itemId }, data: { done: d.done } });
      break;
    case 'delete_checklist':
      await prisma.taskChecklistItem.delete({ where: { id: d.itemId } }).catch(() => null);
      break;
    case 'add_comment': {
      await prisma.taskComment.create({ data: { taskId, authorId: userId, text: d.text } });
      // @bahsedilenlere bildirim (kendini etiketleme sayılmaz).
      const mentionIds = [...new Set((d.mentions ?? []).filter((m) => m && m !== userId))];
      if (mentionIds.length > 0) {
        const [task, mentioned, actor] = await Promise.all([
          prisma.companyTask.findUnique({ where: { id: taskId }, select: { title: true } }),
          prisma.user.findMany({ where: { id: { in: mentionIds } }, select: { name: true, email: true } }),
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
        }
      } else {
        await logActivity('commented', 'Yorum yaptı');
      }
      break;
    }
    case 'delete_comment':
      await prisma.taskComment.delete({ where: { id: d.commentId } }).catch(() => null);
      break;
  }

  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}

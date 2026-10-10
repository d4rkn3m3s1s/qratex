import { prisma } from '@/lib/prisma';
import { parseTags, isTaskPriority, PRIORITY_META } from '@/lib/team/constants';

/**
 * Otomasyon tetikleme motoru (denetim O4/O5, admin_ekip Bulgu 8/12).
 *
 * Tetikler — hepsi gerçekten çağrılır:
 *  - `status_changed` → lib/team/transitions.ts (PUT, toplu işlem, cron)
 *  - `assigned`       → görev atama/yeniden atama (PUT, toplu atama)
 *  - `created`        → görev oluşturma, şablondan üretim, kopyalama, işletme verisinden üretim
 *  - `overdue`        → günlük bakım cron'u (görev başına bir kez)
 *
 * Aksiyonlar: bildir, etiket ekle, öncelik ata, kişiye ata, durum değiştir. "Durum değiştir"
 * onay akışını ATLAYAMAZ: geçiş `transitionTask` üzerinden "otomasyon" aktörüyle yapılır;
 * "Bitti"ye geçirme ve "Bitti"den çıkarma reddedilir, kanıt ve bağımlılık kuralı aynen uygulanır.
 *
 * Gözlemlenebilirlik: her çalışma ve hata görevin geçmişine `automation` aktivitesi olarak
 * yazılır (kural adıyla); otomasyon diyaloğu son çalışmaları buradan gösterir.
 *
 * Zincirleme yok: otomasyonun yaptığı değişiklik yeni otomasyon tetiklemez.
 * Çağıran taraf bu fonksiyonu `after()` içinde çalıştırır (yanıt sonrası kesilmesin).
 */

export type AutomationTrigger = 'status_changed' | 'assigned' | 'created' | 'overdue';

export const AUTOMATION_SET_STATUS_TARGETS = ['todo', 'in_progress', 'review'] as const;

export async function runAutomations(opts: {
  trigger: AutomationTrigger;
  triggerValue?: string;
  task: { id: string; title: string; department: string | null; assignedToId: string | null; tags: string | null };
  actorId: string;
}): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  let rules: Awaited<ReturnType<typeof prisma.teamAutomation.findMany>> = [];
  try {
    rules = await prisma.teamAutomation.findMany({
      where: {
        enabled: true,
        triggerType: opts.trigger,
        OR: [{ department: null }, ...(opts.task.department ? [{ department: opts.task.department }] : [])],
      },
      orderBy: { createdAt: 'asc' },
    });
  } catch (err) {
    console.warn('[team-automation] kurallar okunamadı:', err);
    return { applied, failed };
  }

  let tags = opts.task.tags;
  for (const rule of rules) {
    if (rule.triggerValue && rule.triggerValue !== opts.triggerValue) continue;
    const log = (detail: string) =>
      prisma.taskActivity
        .create({ data: { taskId: opts.task.id, actorId: rule.createdById, action: 'automation', detail: `Otomasyon "${rule.name}": ${detail}`.slice(0, 300) } })
        .catch(() => undefined);
    try {
      switch (rule.actionType) {
        case 'notify': {
          const { notifyAutomation } = await import('@/lib/team-notify');
          await notifyAutomation({ ruleName: rule.name, taskId: opts.task.id, taskTitle: opts.task.title });
          await log('yöneticilere bildirim gönderildi');
          break;
        }
        case 'add_tag': {
          const tag = (rule.actionValue ?? '').trim();
          if (!tag) throw new Error('etiket boş');
          const set = new Set(parseTags(tags));
          if (![...set].some((t) => t.toLocaleLowerCase('tr') === tag.toLocaleLowerCase('tr'))) {
            set.add(tag);
            tags = [...set].join(',');
            await prisma.companyTask.update({ where: { id: opts.task.id }, data: { tags } });
          }
          await log(`#${tag} etiketi eklendi`);
          break;
        }
        case 'set_priority': {
          const p = rule.actionValue ?? '';
          if (!isTaskPriority(p)) throw new Error('geçersiz öncelik');
          await prisma.companyTask.update({ where: { id: opts.task.id }, data: { priority: p } });
          await log(`öncelik "${PRIORITY_META[p].label}" yapıldı`);
          break;
        }
        case 'assign': {
          const userId = rule.actionValue ?? '';
          const member = await prisma.user.findFirst({
            where: { id: userId, OR: [{ adminTeamRole: { not: null } }, { role: 'ADMIN' }] },
            select: { id: true, name: true, email: true },
          });
          if (!member) throw new Error('atanacak kişi artık ekipte değil');
          if (opts.task.assignedToId !== member.id) {
            await prisma.companyTask.update({ where: { id: opts.task.id }, data: { assignedToId: member.id } });
            const { notifyTaskAssigned } = await import('@/lib/team-notify');
            await notifyTaskAssigned({ userId: member.id, taskId: opts.task.id, taskTitle: opts.task.title });
          }
          await log(`${member.name || member.email} kişisine atandı`);
          break;
        }
        case 'set_status': {
          const target = rule.actionValue ?? '';
          if (!(AUTOMATION_SET_STATUS_TARGETS as readonly string[]).includes(target)) {
            throw new Error('otomasyon görevi "Bitti"ye geçiremez');
          }
          const { transitionTask, runEffects } = await import('@/lib/team/transitions');
          const result = await transitionTask({
            taskId: opts.task.id,
            to: target as (typeof AUTOMATION_SET_STATUS_TARGETS)[number],
            actor: { userId: rule.createdById, kind: 'automation', name: `Otomasyon: ${rule.name}` },
            triggerAutomations: false,
          });
          await runEffects(result.effects);
          break;
        }
        default:
          throw new Error('bilinmeyen aksiyon');
      }
      applied++;
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : 'bilinmeyen hata';
      await log(`çalışamadı (${reason})`);
    }
  }
  return { applied, failed };
}

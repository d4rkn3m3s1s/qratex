import { prisma } from '@/lib/prisma';

/**
 * Otomasyon tetikleme motoru.
 * Bir görev olayı (durum değişti / atandı / oluşturuldu / gecikti) gerçekleştiğinde
 * eşleşen aktif TeamAutomation kurallarını bulur ve aksiyonlarını uygular.
 *
 * NOT: Bu fonksiyon route değildir; başka handler'lardan çağrılan bir helper'dır.
 * Sonsuz döngü güvenliği: aksiyonlar yalnızca DB update yapar, tekrar runAutomations
 * çağrılmaz. Dolayısıyla set_status / add_tag / assign gibi aksiyonlar yeni bir
 * otomasyon zinciri tetiklemez.
 */
export async function runAutomations(opts: {
  trigger: 'status_changed' | 'assigned' | 'created' | 'overdue';
  triggerValue?: string;
  task: {
    id: string;
    title: string;
    department: string | null;
    assignedToId: string | null;
    tags: string | null;
  };
  actorId: string;
}): Promise<void> {
  try {
    // 1) Eşleşen aktif kuralları bul: tetik tipi aynı + departman ya null (hepsi) ya da görev departmanı.
    const rules = await prisma.teamAutomation.findMany({
      where: {
        enabled: true,
        triggerType: opts.trigger,
        OR: [{ department: null }, { department: opts.task.department }],
      },
    });

    for (const rule of rules) {
      try {
        // 2) triggerValue kontrolü: kuralda bir triggerValue tanımlıysa gelen değerle birebir eşleşmeli.
        //    (ör. status_changed tetiği için yalnızca "done" durumuna geçince çalışsın gibi.)
        if (rule.triggerValue && rule.triggerValue !== opts.triggerValue) {
          continue;
        }

        // 3) actionType'a göre aksiyonu uygula.
        switch (rule.actionType) {
          case 'notify': {
            // Tüm yöneticilere bildirim oluştur (ADMIN rolü veya adminTeamRole='yonetici').
            const managers = await prisma.user.findMany({
              where: { OR: [{ role: 'ADMIN' }, { adminTeamRole: 'yonetici' }] },
              select: { id: true },
            });
            await Promise.all(
              managers.map((m) =>
                prisma.notification.create({
                  data: {
                    userId: m.id,
                    title: '⚙️ Otomasyon: ' + rule.name,
                    message: opts.task.title,
                    type: 'info',
                    data: {
                      kind: 'team-automation',
                      taskId: opts.task.id,
                      href: '/admin/ekip?task=' + opts.task.id,
                    },
                  },
                }),
              ),
            );
            break;
          }

          case 'add_tag': {
            // Mevcut tags CSV'sine actionValue etiketini tekrarsız ekle.
            if (rule.actionValue) {
              const existing = (opts.task.tags ?? '')
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
              const set = new Set(existing);
              set.add(rule.actionValue.trim());
              await prisma.companyTask.update({
                where: { id: opts.task.id },
                data: { tags: Array.from(set).join(',') },
              });
            }
            break;
          }

          case 'set_priority': {
            // Öncelik ata (low / medium / high).
            if (rule.actionValue) {
              await prisma.companyTask.update({
                where: { id: opts.task.id },
                data: { priority: rule.actionValue },
              });
            }
            break;
          }

          case 'assign': {
            // Görevi belirtilen kullanıcıya ata.
            if (rule.actionValue) {
              await prisma.companyTask.update({
                where: { id: opts.task.id },
                data: { assignedToId: rule.actionValue },
              });
            }
            break;
          }

          case 'set_status': {
            // Durumu değiştir; 'done' ise completedAt'i işaretle, değilse temizle.
            if (rule.actionValue) {
              await prisma.companyTask.update({
                where: { id: opts.task.id },
                data: {
                  status: rule.actionValue,
                  completedAt: rule.actionValue === 'done' ? new Date() : null,
                },
              });
            }
            break;
          }

          default:
            // Bilinmeyen aksiyon tipi: sessizce atla.
            break;
        }
      } catch {
        // Tek bir kuralın hatası diğer kuralları ve çağıran akışı bozmasın.
      }
    }
  } catch {
    // Motorun tümü sessiz: hata çağıran işlemi (görev güncelleme vb.) engellemez.
  }
}

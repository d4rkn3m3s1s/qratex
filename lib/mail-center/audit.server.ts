import type { Session } from 'next-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * İletişim yüzeyinin denetim kaydı (gelen kutusu okuma/yanıt/arşiv/silme, şablon kaydı, gönderim).
 * Denetim yazılamazsa işlem GERİ ALINMAZ ama hata loglanır (gönderilmiş maili geri çağıramayız).
 */
export async function writeMailAudit(input: {
  session: Session;
  action: string;
  entity: string;
  entityId?: string | null;
  newData?: Record<string, unknown>;
  oldData?: Record<string, unknown>;
  meta?: { ipAddress: string | null; userAgent: string | null };
}): Promise<void> {
  const u = input.session.user as { id: string; email?: string | null; name?: string | null; role?: string };
  await prisma.auditLog
    .create({
      data: {
        userId: u.id,
        actorType: 'user',
        actorSnapshot: { email: u.email ?? null, role: u.role ?? 'ADMIN', name: u.name ?? null } as Prisma.InputJsonValue,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        ...(input.newData ? { newData: input.newData as Prisma.InputJsonValue } : {}),
        ...(input.oldData ? { oldData: input.oldData as Prisma.InputJsonValue } : {}),
        ipAddress: input.meta?.ipAddress ?? null,
        userAgent: input.meta?.userAgent ?? null,
      },
    })
    .catch((e) => console.error('[mail-center] denetim kaydı yazılamadı:', input.action, e instanceof Error ? e.message : e));
}

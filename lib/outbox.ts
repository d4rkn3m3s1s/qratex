/**
 * Outbox pattern: DB yazımı + event publish atomik olsun.
 * Kritik akışlarda prisma.$transaction ile insertFeedback + insertOutboxEvent.
 * Worker/Inngest: outbox'dan oku -> event gönder -> processedAt güncelle.
 */
import { prisma } from '@/lib/prisma';
import { inngest } from '@/lib/inngest/client';

export type OutboxPayload = { feedbackId: string; dealerId?: string };

/**
 * Outbox'a event ekle (transaction içinde çağrılır).
 */
export async function createOutboxEvent(
  tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>,
  eventName: string,
  payload: OutboxPayload
): Promise<void> {
  await (tx as any).outboxEvent.create({
    data: { eventName, payload: payload as object },
  });
}

/**
 * İşlenmemiş outbox event'lerini al ve Inngest'e gönder.
 */
export async function processOutbox(): Promise<number> {
  const pending = await prisma.outboxEvent.findMany({
    where: { processedAt: null },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });

  let processed = 0;
  for (const ev of pending) {
    try {
      const payload = ev.payload as OutboxPayload;
      if (ev.eventName === 'feedback/created' && payload.feedbackId) {
        await inngest.send({
          name: ev.eventName,
          data: { feedbackId: payload.feedbackId, dealerId: payload.dealerId ?? '' },
        });
      }
      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: { processedAt: new Date() },
      });
      processed++;
    } catch (err) {
      console.error('[Outbox] Failed to process event', ev.id, err);
    }
  }
  return processed;
}

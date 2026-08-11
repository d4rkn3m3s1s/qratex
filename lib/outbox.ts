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

/** Bir outbox event bu kadar başarısız denemeden sonra DLQ'ya (deadAt) düşer — poison event
 *  kuyruğu tıkamasın, taze event'ler ilerlesin. */
const MAX_OUTBOX_ATTEMPTS = 10;

/**
 * İşlenmemiş outbox event'lerini al ve Inngest'e gönder. Sürekli patlayan (poison) event
 * MAX_OUTBOX_ATTEMPTS sonra deadAt ile işaretlenip sorgudan çıkarılır (DLQ).
 */
export async function processOutbox(): Promise<number> {
  const pending = await prisma.outboxEvent.findMany({
    where: { processedAt: null, deadAt: null },
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
      const nextAttempt = (ev.attemptCount ?? 0) + 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Outbox] event ${ev.id} işlenemedi (deneme ${nextAttempt}/${MAX_OUTBOX_ATTEMPTS}):`, msg);
      // Deneme sayacını artır; eşiği aşarsa DLQ'ya al (deadAt) — bir daha getirilmez.
      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: {
          attemptCount: { increment: 1 },
          lastError: msg.slice(0, 500),
          ...(nextAttempt >= MAX_OUTBOX_ATTEMPTS ? { deadAt: new Date() } : {}),
        },
      }).catch(() => {});
    }
  }
  return processed;
}

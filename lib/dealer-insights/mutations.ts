/**
 * İçgörüler — yazma işlemleri (yalnız DEALER; çağıran kapsamı çözer).
 *
 *  1. Öneriyi aksiyon listesine ekle: aynı (normalize) metin açık listede varsa YENİ KAYIT
 *     AÇILMAZ (eski sayfa 3 paralel GET ile mükerrer kayıt üretebiliyordu); atanan kişi bayinin
 *     kendisi ya da aktif personeli olmalı; `critical` → `high` (eski sayfa `medium` yazıyordu);
 *     bitiş günü İstanbul gün sonu.
 *  2. Duygu düzeltme: sahiplik doğrulanır, denetim izi `AIFeedbackCorrection`'a yazılır ve
 *     geri bildirimin duygusu güncellenir (eski formda düzeltme ekrana yansımıyordu).
 */
import { prisma } from '@/lib/prisma';
import { validateAssignee } from '@/lib/dealer/assignee';
import { addDays, istanbulDay, istanbulDayStart, isValidDay } from '@/components/ds/page/date-range';
import { recommendationId, toActionPriority } from './core';
import type { RecPriority } from './types';

export class InsightMutationError extends Error {
  readonly code: 'VALIDATION' | 'NOT_FOUND';
  constructor(code: InsightMutationError['code'], message: string) {
    super(message);
    this.name = 'InsightMutationError';
    this.code = code;
  }
}

const OPEN = ['pending', 'assigned', 'in_progress'];

/** `YYYY-MM-DD` → o İstanbul gününün son anı. Geçmiş gün reddedilir. */
export function dueAtFromDay(day: string, today: string = istanbulDay()): Date {
  if (!isValidDay(day)) throw new InsightMutationError('VALIDATION', 'Bitiş tarihi geçersiz.');
  if (day < today) throw new InsightMutationError('VALIDATION', 'Bitiş tarihi geçmişte olamaz.');
  return new Date(istanbulDayStart(addDays(day, 1)).getTime() - 1);
}

export async function createInsightAction(input: {
  dealerId: string;
  text: string;
  priority: RecPriority;
  assignedToId?: string | null;
  dueDay?: string | null;
  feedbackIds?: string[];
}): Promise<{ created: boolean; id: string }> {
  const text = input.text.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (text.length < 3) throw new InsightMutationError('VALIDATION', 'Aksiyon metni çok kısa.');
  const rid = recommendationId(text);

  const open = await prisma.actionItem.findMany({
    where: { dealerId: input.dealerId, status: { in: OPEN } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, suggestionText: true },
  });
  const dup = open.find((o) => recommendationId(o.suggestionText) === rid);
  if (dup) return { created: false, id: dup.id };

  const assignee = await validateAssignee(input.dealerId, input.assignedToId ?? null);
  if (!assignee.ok) throw new InsightMutationError('VALIDATION', assignee.error);
  const dueAt = input.dueDay ? dueAtFromDay(input.dueDay) : null;

  let feedbackId: string | null = null;
  const ids = (input.feedbackIds ?? []).filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)).slice(0, 5);
  if (ids.length > 0) {
    const fb = await prisma.feedback.findFirst({
      where: { id: { in: ids }, deletedAt: null, qrCode: { dealerId: input.dealerId } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    feedbackId = fb?.id ?? null;
  }

  const row = await prisma.actionItem.create({
    data: {
      dealerId: input.dealerId,
      suggestionText: text,
      priority: toActionPriority(input.priority),
      status: assignee.value ? 'assigned' : 'pending',
      assignedToId: assignee.value ?? null,
      dueAt,
      feedbackId,
      sourceModule: 'ai_insights',
    },
    select: { id: true },
  });
  return { created: true, id: row.id };
}

export type CorrectableSentiment = 'positive' | 'neutral' | 'negative';

export async function correctFeedbackSentiment(input: {
  dealerId: string;
  actorId: string;
  feedbackId: string;
  sentiment: CorrectableSentiment;
}): Promise<{ changed: boolean; sentiment: CorrectableSentiment }> {
  const fb = await prisma.feedback.findFirst({
    where: { id: input.feedbackId, deletedAt: null, qrCode: { dealerId: input.dealerId } },
    select: { id: true, sentiment: true },
  });
  if (!fb) throw new InsightMutationError('NOT_FOUND', 'Geri bildirim bulunamadı.');
  if ((fb.sentiment ?? '').toLowerCase() === input.sentiment) return { changed: false, sentiment: input.sentiment };

  await prisma.$transaction([
    prisma.aIFeedbackCorrection.create({
      data: {
        dealerId: input.dealerId,
        feedbackId: fb.id,
        field: 'sentiment',
        ...(fb.sentiment ? { oldValue: fb.sentiment } : {}),
        newValue: input.sentiment,
        note: `insights:${input.actorId}`,
      },
    }),
    prisma.feedback.update({ where: { id: fb.id }, data: { sentiment: input.sentiment } }),
  ]);
  return { changed: true, sentiment: input.sentiment };
}

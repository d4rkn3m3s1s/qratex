/**
 * Bugün → Yapılacaklar yazma işlemleri (ActionItem).
 *
 * Eski copilot'taki "Ekle" butonu yalnız sayfa değiştiriyordu (SAHTE, copilot B2). Burada
 * öneri gerçekten aksiyon kalemine dönüşür; "Yoksay" da kayıt bırakır (status=cancelled) ki
 * aynı öneri bir daha önerilmesin. Kapsam: kayıt daima oturumdaki bayiye bağlı; başka bayinin
 * geri bildirimine bağlanamaz (404). Hard delete yok.
 */
import { prisma } from '@/lib/prisma';
import { normalizeText } from './core';
import type { TodoPriority } from './types';

type Db = typeof prisma;

export class TodoNotFoundError extends Error {
  constructor(message = 'Kayıt bulunamadı.') {
    super(message);
    this.name = 'TodoNotFoundError';
  }
}

export class TodoDuplicateError extends Error {
  constructor() {
    super('Bu öneri zaten yapılacaklar listesinde.');
    this.name = 'TodoDuplicateError';
  }
}

export interface CreateTodoInput {
  feedbackId: string;
  text: string;
  priority: TodoPriority;
  /** true → öneri yoksayıldı (status=cancelled), listeye girmez ama bir daha önerilmez. */
  dismiss?: boolean;
}

export async function createTodoFromSuggestion(dealerId: string, input: CreateTodoInput, db: Db = prisma) {
  const feedback = await db.feedback.findFirst({
    where: { id: input.feedbackId, qrCode: { dealerId }, deletedAt: null },
    select: { id: true },
  });
  if (!feedback) throw new TodoNotFoundError('Geri bildirim bulunamadı.');

  const text = input.text.trim();
  const norm = normalizeText(text);
  const existing = await db.actionItem.findMany({
    where: { dealerId, feedbackId: feedback.id },
    select: { suggestionText: true, status: true },
    take: 100,
  });
  if (existing.some((e) => normalizeText(e.suggestionText) === norm)) throw new TodoDuplicateError();

  const item = await db.actionItem.create({
    data: {
      dealerId,
      feedbackId: feedback.id,
      suggestionText: text,
      priority: input.priority,
      status: input.dismiss ? 'cancelled' : 'pending',
      sourceModule: 'today',
      ...(input.dismiss ? { completedAt: new Date() } : {}),
    },
    select: { id: true, status: true },
  });
  return item;
}

export async function setTodoStatus(dealerId: string, id: string, status: 'done' | 'pending', db: Db = prisma) {
  const res = await db.actionItem.updateMany({
    where: { id, dealerId, status: status === 'done' ? { in: ['pending', 'assigned', 'in_progress'] } : 'done' },
    data: { status, completedAt: status === 'done' ? new Date() : null },
  });
  if (res.count === 0) {
    const exists = await db.actionItem.findFirst({ where: { id, dealerId }, select: { status: true } });
    if (!exists) throw new TodoNotFoundError();
    // Zaten istenen durumda (çift tık / iki sekme) → idempotent başarı.
    return { id, status: exists.status };
  }
  return { id, status };
}

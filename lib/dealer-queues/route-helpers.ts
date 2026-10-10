/**
 * Kuyruk BFF uçlarının ortak parçaları: aktör, modül durumu ve gövde şemaları.
 */
import { z } from 'zod';
import type { Session } from 'next-auth';
import type { DealerScope } from '@/lib/auth/scope';
import { getModuleControls } from '@/lib/module-gate';
import type { QueueActor } from './audit';
import { istanbulEndOfDay } from './time';

export function actorOf(tenant: DealerScope, session: Session | null): QueueActor {
  const name = typeof session?.user?.name === 'string' && session.user.name.trim() ? session.user.name.trim().slice(0, 80) : null;
  return { id: tenant.actorId, name, role: tenant.actorRole };
}

/** Modül genel olarak açık mı? (Ayar okunamazsa açık kabul edilir — kapı route'ta ayrıca var.) */
export async function isModuleOn(key: string): Promise<boolean> {
  try {
    const controls = await getModuleControls();
    return controls[key] !== false;
  } catch {
    return true;
  }
}

const MAX_DUE_RANGE_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/**
 * Son tarih: `YYYY-MM-DD` (İstanbul günü → gün sonu), ISO tarih-saat ya da `null` (kaldır).
 * Bugünden ±2 yıl dışı reddedilir.
 */
export const DueAtSchema = z
  .union([z.string().max(40), z.null()])
  .transform((v, ctx) => {
    if (v === null || v === '') return null;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? istanbulEndOfDay(v) : new Date(v);
    if (!d || Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Geçersiz tarih.' });
      return z.NEVER;
    }
    if (Math.abs(d.getTime() - Date.now()) > MAX_DUE_RANGE_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Son tarih çok uzak.' });
      return z.NEVER;
    }
    return d;
  });

export const IdParams = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) });

export const AssigneeIdSchema = z.union([z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), z.null()]);

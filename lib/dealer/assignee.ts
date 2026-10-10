/**
 * Bayi içi atama (aksiyon maddesi, olay) yardımcıları — P0-11.
 *
 * Eski desen: `assignedToId` serbest metindi; bayi, liderlik/churn uçlarından topladığı HERHANGİ
 * bir kullanıcı id'sini bir aksiyona "atayıp" listeyi çekerek o kişinin adını ve e-postasını
 * okuyabiliyordu (platform genelinde e-posta toplama). Ayrıca yanıtlar `...row` yayılımı ve
 * `assignedTo: { email }` ile ham e-posta taşıyordu.
 *
 * Sözleşme:
 *  - Atanabilir kişi = bayinin KENDİSİ ya da o bayinin AKTİF `DealerStaff` kaydı.
 *  - Yanıtta atanan kişi açık DTO ile döner; e-posta her zaman maskelenir.
 */
import { prisma } from '@/lib/prisma';
import { maskEmail } from '@/lib/http/dto';

export const INVALID_ASSIGNEE_MESSAGE = 'Yalnızca işletme sahibi ya da aktif personeliniz atanabilir.';

/** `userId` bu bayiye atanabilir mi? (bayinin kendisi ya da aktif personeli) */
export async function isAssignableToDealer(dealerId: string, userId: string): Promise<boolean> {
  if (!dealerId || !userId) return false;
  if (userId === dealerId) return true;
  const row = await prisma.dealerStaff.findFirst({
    where: { dealerId, userId, isActive: true },
    select: { id: true },
  });
  return !!row;
}

/**
 * Atama alanını doğrular: `undefined` → dokunma; `null`/boş → atamayı kaldır; değer → doğrula.
 * Geçersizse `{ ok: false }`.
 */
export async function validateAssignee(
  dealerId: string,
  assignedToId: string | null | undefined
): Promise<{ ok: true; value: string | null | undefined } | { ok: false; error: string }> {
  if (assignedToId === undefined) return { ok: true, value: undefined };
  if (assignedToId === null || assignedToId === '') return { ok: true, value: null };
  const valid = await isAssignableToDealer(dealerId, assignedToId);
  return valid ? { ok: true, value: assignedToId } : { ok: false, error: INVALID_ASSIGNEE_MESSAGE };
}

/** Prisma `select` — atanan kişi için en az alan. */
export const ASSIGNEE_SELECT = { id: true, name: true, email: true } as const;

export type AssigneeRow = { id: string; name: string | null; email: string | null } | null | undefined;

/** Atanan kişi DTO'su: id + ad + MASKELİ e-posta. */
export function assigneeDto(row: AssigneeRow): { id: string; name: string | null; email: string } | null {
  if (!row) return null;
  return { id: row.id, name: row.name ?? null, email: maskEmail(row.email) };
}

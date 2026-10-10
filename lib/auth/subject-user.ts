/**
 * `?userId=` öznesi çözümleyicisi (P0-09).
 *
 * Eski desen: `gamification/badges` ve `gamification/quests` GET uçları oturumsuz `?userId=<id>`
 * ile BAŞKA kullanıcının puan, seviye, rozet ve görev profilini döndürüyordu.
 *
 * Sözleşme (VARSAYILAN REDDET):
 *  - parametre yok / boş → `userId: null` (kullanıcısız katalog görünümü).
 *  - `me` → oturum ZORUNLU; oturumdaki kullanıcı.
 *  - başka bir id → yalnız ADMIN ya da id'nin kendisi; diğer herkes 403, oturumsuz 401.
 */
import type { Session } from 'next-auth';

export type SubjectUserResult =
  | { ok: true; userId: string | null; isSelf: boolean }
  | { ok: false; status: 400 | 401 | 403; error: string; code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'BAD_REQUEST' };

const ID_RE = /^[A-Za-z0-9_-]{1,191}$/;

export function resolveSubjectUserId(session: Session | null | undefined, raw: string | null | undefined): SubjectUserResult {
  const param = typeof raw === 'string' ? raw.trim() : '';
  if (!param) return { ok: true, userId: null, isSelf: false };

  const sessionUserId = typeof session?.user?.id === 'string' && session.user.id ? session.user.id : null;
  const role = typeof session?.user?.role === 'string' ? session.user.role : null;

  if (param === 'me') {
    if (!sessionUserId) return { ok: false, status: 401, error: 'Giriş yapmalısınız.', code: 'UNAUTHENTICATED' };
    return { ok: true, userId: sessionUserId, isSelf: true };
  }

  if (!ID_RE.test(param)) return { ok: false, status: 400, error: 'Geçersiz kullanıcı kimliği.', code: 'BAD_REQUEST' };
  if (!sessionUserId) return { ok: false, status: 401, error: 'Giriş yapmalısınız.', code: 'UNAUTHENTICATED' };
  if (param === sessionUserId) return { ok: true, userId: sessionUserId, isSelf: true };
  if (role === 'ADMIN') return { ok: true, userId: param, isSelf: false };
  return { ok: false, status: 403, error: 'Başka bir kullanıcının profilini görüntüleyemezsiniz.', code: 'FORBIDDEN' };
}

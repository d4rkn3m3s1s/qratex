/**
 * Oturum İSTEĞE BAĞLI uçlar için görüntüleyen kimliği — yetki kararı DB'den (§4.4 ilke 2).
 *
 * QR geri bildirimi oturumsuz da gönderilir; oturum varsa puan bu kimliğe basılır. Bu yüzden
 * JWT'ye değil `requireAuth`'un DB doğrulamasına (oturum sürümü, ban, güncel rol) güvenilir.
 * Doğrulanamayan oturum (iptal, askı, kapı, DB hatası) ANONİM sayılır: kayıt alınır, puan
 * hiçbir doğrulanmamış kimliğe basılmaz.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireAuth } from '@/lib/api-auth';

export type FunnelViewer = { userId: string; role: 'CUSTOMER' | 'DEALER' | 'STAFF' | 'ADMIN' };

export async function resolveOptionalViewer(): Promise<FunnelViewer | null> {
  try {
    const raw = await getServerSession(authOptions);
    if (!raw?.user?.id) return null;
    // Yönetici kapısı AÇIK kalır: kapıdan geçmemiş yönetici anonim sayılır (kapı süse dönmez).
    const auth = await requireAuth(['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN']);
    if ('error' in auth) return null;
    const role = String(auth.session.user.role ?? '');
    if (role !== 'CUSTOMER' && role !== 'DEALER' && role !== 'STAFF' && role !== 'ADMIN') return null;
    return { userId: auth.session.user.id, role };
  } catch {
    return null;
  }
}

/** Rol → kendi paneli (başarı ekranındaki "panelime dön" bağlantısı). */
export function homePathForRole(role: FunnelViewer['role']): string {
  switch (role) {
    case 'DEALER':
      return '/dealer';
    case 'STAFF':
      return '/staff';
    case 'ADMIN':
      return '/admin';
    default:
      return '/customer';
  }
}

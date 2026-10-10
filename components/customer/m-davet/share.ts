/**
 * Paylaşım/kopyalama — saf ve test edilebilir (tarayıcı API'leri parametre).
 *
 * Denetim #9/#10: eskiden `clipboard.writeText` beklenmiyor, hata yakalanmıyor ve paylaşım
 * iptali (`AbortError`) "kopyalandı" diyordu; masaüstü yalnız KODU kopyalıyordu. Artık:
 *  - paylaşım iptali sessiz (`cancelled`), gerçek kopyalama sonucu bildirilir;
 *  - geri dönüş BAĞLANTIYI kopyalar; kopyalanamazsa `failed` → arayüz bağlantıyı seçili gösterir.
 */

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

export interface ShareEnv {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  writeText?: (text: string) => Promise<void>;
  /** `document.execCommand('copy')` yedeği (eski Safari / izinsiz bağlam). */
  legacyCopy?: (text: string) => boolean;
}

export function browserShareEnv(): ShareEnv {
  if (typeof window === 'undefined') return {};
  const nav = window.navigator;
  return {
    share: typeof nav.share === 'function' ? nav.share.bind(nav) : undefined,
    canShare: typeof nav.canShare === 'function' ? nav.canShare.bind(nav) : undefined,
    writeText: nav.clipboard?.writeText ? nav.clipboard.writeText.bind(nav.clipboard) : undefined,
    legacyCopy: (text: string) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    },
  };
}

export async function copyText(text: string, env: ShareEnv = browserShareEnv()): Promise<boolean> {
  if (env.writeText) {
    try {
      await env.writeText(text);
      return true;
    } catch {
      /* izin reddi → yedek */
    }
  }
  return env.legacyCopy ? env.legacyCopy(text) : false;
}

function isAbort(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError';
}

/** Web Share varsa açar; yoksa (ya da paylaşım hata verirse) bağlantıyı kopyalar. */
export async function shareInvite(data: { title: string; text: string; url: string }, env: ShareEnv = browserShareEnv()): Promise<ShareOutcome> {
  if (env.share && (!env.canShare || env.canShare(data))) {
    try {
      await env.share(data);
      return 'shared';
    } catch (e) {
      if (isAbort(e)) return 'cancelled';
      // NotAllowedError vb. → kopyalamaya düş.
    }
  }
  return (await copyText(data.url, env)) ? 'copied' : 'failed';
}

/** Kayıt sayfası bağlantısı (kayıt formu `?ref=` okur). */
export function buildInviteUrl(origin: string, code: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/auth/register?ref=${encodeURIComponent(code)}`;
}

export function buildWhatsAppUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/** Ekran okuyucu için harf harf okunuş: `7KQ2` → `7 K Q 2`. */
export function spellCode(code: string): string {
  return code.split('').join(' ');
}

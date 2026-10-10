/**
 * Kopyalama/paylaşım — tarayıcı API'leri parametre (saf, test edilebilir).
 * Denetim (dealer_surveys #8): `clipboard.writeText` beklenmiyor/yakalanmıyordu → başarısızlıkta
 * da "kopyalandı" deniyordu. Artık gerçek sonuç döner; kopyalanamazsa arayüz alanı seçili gösterir.
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

export interface ShareEnv {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  writeText?: (text: string) => Promise<void>;
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

export function canNativeShare(env: ShareEnv = browserShareEnv()): boolean {
  return typeof env.share === 'function';
}

export async function nativeShare(data: { title: string; text: string; url: string }, env: ShareEnv = browserShareEnv()): Promise<ShareOutcome> {
  if (env.share && (!env.canShare || env.canShare(data))) {
    try {
      await env.share(data);
      return 'shared';
    } catch (e) {
      if (e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(data.url, env)) ? 'copied' : 'failed';
}

export function whatsappUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

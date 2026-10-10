import type { InsightAlert } from '@/lib/dealer-insights/types';

/** Sunucudaki `NARRATIVE_MIN_SAMPLE` ile aynı (sunucu modülü istemciye alınmaz: prisma içerir). */
export const NARRATIVE_MIN_SAMPLE_CLIENT = 3;

/** Kaynak/kanıt gezinmesi — ekran tek yerden sağlar (çekmece + derin bağlantılar). */
export interface RefHandlers {
  openTheme: (key: string, label: string) => void;
  openRec: (key: string, label: string) => void;
  openEntity: (key: string, label: string) => void;
  /** Uyarının hedefi: Gelen Kutusu süzgeci (href) ya da tema (null döner, çekmece açılır). */
  alertHref: (alert: InsightAlert) => string | null;
}

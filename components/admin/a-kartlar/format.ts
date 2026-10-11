import { Archive, Ban, CircleDashed, CreditCard } from 'lucide-react';
import { defineStatusMap } from '@/components/ds/data';
import type { CardListItem } from '@/lib/admin-cards/contract';

/** Durum rozetleri: tema token'lı ton (açık temada düşük kontrastlı gri/yeşil yok). */
export const CARD_STATUS = defineStatusMap({
  UNUSED: { label: 'Kullanılmamış', tone: 'neutral', icon: CircleDashed },
  ACTIVATED: { label: 'Aktif', tone: 'success', icon: CreditCard },
  BLOCKED: { label: 'Bloklu', tone: 'danger', icon: Ban },
  ARCHIVED: { label: 'Arşivde', tone: 'neutral', icon: Archive },
});

export const viewStatus = (c: Pick<CardListItem, 'status' | 'archived'>) => (c.archived ? 'ARCHIVED' : c.status);

const TZ = 'Europe/Istanbul';
const dateFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const numFmt = new Intl.NumberFormat('tr-TR');

export const fmtDate = (v: string | null | undefined) => (v ? dateFmt.format(new Date(v)) : '—');
export const fmtDateTime = (v: string | null | undefined) => (v ? dateTimeFmt.format(new Date(v)) : '—');
export const fmtNumber = (n: number | null | undefined) => numFmt.format(n ?? 0);

/** Okunur kod: 4'lü gruplar (yalnız görüntü; kopyalanan değer ham token). */
export const groupToken = (t: string) => t.replace(/(.{4})(?=.)/g, '$1 ');

export const customerLabel = (c: { name: string | null; email: string } | null) => (c ? c.name?.trim() || c.email : '—');

/** Pano yazımı — hata olursa false (eski sürüm hata olsa da "kopyalandı" diyordu). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

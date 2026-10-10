import type { OpenState } from '@/lib/places/business-hours';
import { weekdayName, type ShareCopy, type ShareLocale } from './copy';

export type OpenTone = 'success' | 'warning' | 'neutral';

/** Açık/kapalı durumu → tek satırlık etiket + ton. Durum bilinmiyorsa `null` (gösterilmez). */
export function openStateLabel(
  state: OpenState | null,
  copy: ShareCopy,
  locale: ShareLocale
): { text: string; tone: OpenTone } | null {
  if (!state) return null;
  if (state.status === 'holiday') return { text: copy.holiday, tone: 'neutral' };
  if (state.status === 'open') {
    if (!state.closesAt) return { text: copy.openAllDay, tone: 'success' };
    if (state.closingSoon) return { text: copy.closingSoon(state.closesAt), tone: 'warning' };
    return { text: copy.openUntil(state.closesAt), tone: 'success' };
  }
  const next = state.nextOpen;
  if (!next) return { text: copy.closed, tone: 'neutral' };
  if (next.inDays === 0) return { text: copy.closedOpensToday(next.time), tone: 'neutral' };
  if (next.inDays === 1) return { text: copy.closedOpensTomorrow(next.time), tone: 'neutral' };
  return { text: copy.closedOpensOn(weekdayName(locale, next.weekday), next.time), tone: 'neutral' };
}

/** Kayıt/giriş sonrası güvenli dönüş yolu (yalnız uygulama içi göreli yol). */
export function authHref(kind: 'register' | 'login', callbackPath: string): string {
  const safe = callbackPath.startsWith('/') && !callbackPath.startsWith('//') ? callbackPath : '/';
  return `/auth/${kind}?callbackUrl=${encodeURIComponent(safe)}`;
}

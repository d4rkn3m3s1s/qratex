/**
 * API hata metninin dili (mobil-erisilebilirlik-i18n B1 — "API'ler locale-kör").
 *
 * Sözleşme: hata gövdesinde makine kodu (`code`) her zaman var; insan-okur metin (`error` /
 * `message`) isteğin diline göre seçilir. Türkçe istekte (varsayılan) uç noktanın yazdığı özel
 * Türkçe mesaj aynen gider. İngilizce istekte:
 *  - uç `messageEn` verdiyse o,
 *  - vermediyse kodun genel İngilizce metni (özgüllük kaybolur ama EN kullanıcı Türkçe hata
 *    görmez; istemci gerekirse `code` ile kendi metnini seçer).
 *
 * Dil kaynağı: `qratex-locale` çerezi (uygulama dil seçimi; tarayıcıdan her istekte gelir) →
 * yoksa `Accept-Language` (çerezsiz dış istemci) → `tr`.
 */
import { LOCALE_COOKIE_NAME } from '@/lib/locale-shared';

export type RequestLocale = 'tr' | 'en';

export const EN_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  BAD_REQUEST: 'The request is invalid.',
  VALIDATION: 'Some of the information you entered is invalid. Please check it and try again.',
  UNAUTHENTICATED: 'Your session was not found. Please sign in.',
  FORBIDDEN: 'You do not have permission to do this.',
  NOT_FOUND: 'The record was not found.',
  CONFLICT: 'This action conflicts with an existing record.',
  PAYLOAD_TOO_LARGE: 'The data you sent is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'The request must be sent as JSON.',
  RATE_LIMITED: 'You have sent too many requests. Please try again in a moment.',
  MODULE_DISABLED: 'This feature has been temporarily turned off by an administrator.',
  INSUFFICIENT_POINTS: 'You do not have enough points for this.',
  TENANT_REQUIRED: 'Select a business before doing this.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again shortly.',
  INTERNAL: 'An unexpected error occurred. Please try again.',
  NETWORK: 'Could not connect. Check your internet connection and try again.',
  BAD_RESPONSE: 'The server returned an unexpected response. Please try again.',
  CSRF_ORIGIN_MISMATCH: 'The request was blocked for security reasons. Reload the page and try again.',
};

const EN_FALLBACK = 'The action could not be completed. Please try again.';

/** Durum koduna göre genel İngilizce metin (kod tanınmıyorsa). */
export function enMessageForStatus(status: number): string {
  if (status === 0) return EN_ERROR_MESSAGES.NETWORK;
  if (status === 400) return EN_ERROR_MESSAGES.BAD_REQUEST;
  if (status === 401) return EN_ERROR_MESSAGES.UNAUTHENTICATED;
  if (status === 403) return EN_ERROR_MESSAGES.FORBIDDEN;
  if (status === 404) return EN_ERROR_MESSAGES.NOT_FOUND;
  if (status === 409) return EN_ERROR_MESSAGES.CONFLICT;
  if (status === 413) return EN_ERROR_MESSAGES.PAYLOAD_TOO_LARGE;
  if (status === 429) return EN_ERROR_MESSAGES.RATE_LIMITED;
  if (status === 503) return EN_ERROR_MESSAGES.SERVICE_UNAVAILABLE;
  if (status >= 500) return EN_ERROR_MESSAGES.INTERNAL;
  return EN_FALLBACK;
}

/** İngilizce kullanıcıya gösterilecek metin: özel EN metin > kodun genel metni > duruma göre. */
export function englishErrorMessage(code: string, status: number, messageEn?: string): string {
  if (messageEn) return messageEn;
  return EN_ERROR_MESSAGES[code] ?? enMessageForStatus(status);
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

/** İsteğin dili: uygulama dil çerezi > Accept-Language > tr. */
export function requestLocale(headers: Pick<Headers, 'get'> | null | undefined): RequestLocale {
  if (!headers) return 'tr';
  const cookie = readCookie(headers.get('cookie'), LOCALE_COOKIE_NAME);
  if (cookie === 'en' || cookie === 'tr') return cookie;
  const accept = headers.get('accept-language');
  if (!accept) return 'tr';
  // İlk tercih edilen dil (q sıralaması tarayıcıda zaten azalan): "en-US,en;q=0.9,tr;q=0.8".
  const first = accept.split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('en') ? 'en' : 'tr';
}

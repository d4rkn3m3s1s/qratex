/**
 * İstemci tarafı yedek hata metinleri (ağ kopması, gövdesiz yanıt). Sunucu mesajı geldiğinde o
 * gösterilir (sunucu zaten isteğin diline göre yazar — lib/http/error-locale.ts); bu metinler
 * yalnız sunucudan metin gelmediğinde devreye girer. Dil, uygulama dil çerezinden okunur
 * (yalnız tarayıcıda çağrılır: olay/sorgu hatası anı, ilk boyama değil).
 */
import { readLocaleCookieClient } from '@/lib/locale-shared';
import { EN_ERROR_MESSAGES } from '@/lib/http/error-locale';

export type ClientMessageKind = 'network' | 'networkShort' | 'failed' | 'requestFailed' | 'unexpected' | 'uploadFailed' | 'forbidden' | 'unavailable';

const TR: Record<ClientMessageKind, string> = {
  network: 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.',
  networkShort: 'Bağlantı kurulamadı.',
  failed: 'İşlem tamamlanamadı.',
  requestFailed: 'İstek tamamlanamadı.',
  unexpected: 'Beklenmeyen bir hata oluştu.',
  uploadFailed: 'Dosya yüklenemedi.',
  forbidden: 'Bu işlem için yetkiniz yok.',
  unavailable: 'Sunucu şu an yanıt veremiyor. Lütfen birazdan tekrar deneyin.',
};

const EN: Record<ClientMessageKind, string> = {
  network: EN_ERROR_MESSAGES.NETWORK ?? 'Could not connect. Check your internet connection and try again.',
  networkShort: 'Could not connect.',
  failed: 'The action could not be completed.',
  requestFailed: 'The request could not be completed.',
  unexpected: EN_ERROR_MESSAGES.INTERNAL ?? 'An unexpected error occurred.',
  uploadFailed: 'The file could not be uploaded.',
  forbidden: EN_ERROR_MESSAGES.FORBIDDEN ?? 'You do not have permission to do this.',
  unavailable: EN_ERROR_MESSAGES.SERVICE_UNAVAILABLE ?? 'The service is temporarily unavailable. Please try again shortly.',
};

export function clientMessage(kind: ClientMessageKind): string {
  return (readLocaleCookieClient() === 'en' ? EN : TR)[kind];
}

/** "İstek başarısız (503)." */
export function requestFailedStatus(status: number): string {
  return readLocaleCookieClient() === 'en' ? `Request failed (${status}).` : `İstek başarısız (${status}).`;
}

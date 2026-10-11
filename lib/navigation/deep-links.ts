/**
 * Kayda özgü derin bağlantılar — emekli detay rotalarının (`/customer/consumptions/[id]`,
 * `/customer/feedbacks/[id]/journey`, `/customer/remedy/[offerId]`) yerine geçen kanonik adresler.
 *
 * Eski rotalar emekli koçanı olarak DURUR (veritabanındaki eski bildirim/e-posta bağlantıları
 * çalışsın diye) ama yeni kod doğrudan buradaki adresi üretir: her tıklamada fazladan bir
 * yönlendirme turu olmaz (`__tests__/architecture/nav-links.test.ts` emekli hedefe yeni bağlantıyı
 * yakalar). Saf modül.
 */

const enc = encodeURIComponent;

/** Tüketim (ziyaret) kaydı ve yorumu → Ben › Seslerim detay çekmecesi. */
export function consumptionVoiceHref(consumptionId: string): string {
  return `/customer/me/voices?id=${enc(`cs-${consumptionId}`)}`;
}

/** QR geri bildirimi (yolculuk dahil) → Ben › Seslerim detay çekmecesi. */
export function feedbackVoiceHref(feedbackId: string): string {
  return `/customer/me/voices?id=${enc(`fb-${feedbackId}`)}`;
}

/** Telafi teklifi → Ben › Seslerim telafi çekmecesi. */
export function remedyOfferHref(offerId: string): string {
  return `/customer/me/voices?offer=${enc(offerId)}`;
}

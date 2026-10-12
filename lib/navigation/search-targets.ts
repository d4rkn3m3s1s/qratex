/**
 * ⌘K "Veriler" sonuçlarının iniş adresleri — rol başına, kayıt başına (B4c).
 *
 * Kural: her sonuç tıklandığında KENDİ kaydına iner (detay sayfası ya da liste + detay
 * çekmecesi). Rolün o varlık türü için gerçek bir yüzeyi yoksa (`null`) sonuç hiç
 * gösterilmez — filtresiz bir listeye ya da başka bir sayfaya düşmek yok. Hedefler
 * yalnız menü kaydındaki canlı yüzeylerdir (emekli koçanına inen hedef yok; test).
 *
 * Saf modül (Prisma / Next içe aktarmaz) — `__tests__/lib/navigation-search-targets.test.ts`.
 */

export type SearchRole = 'ADMIN' | 'DEALER' | 'CUSTOMER';

const enc = encodeURIComponent;

/** Kullanıcı yalnız admin aramasında döner → Kullanıcı 360. */
export function userHref(role: SearchRole, userId: string): string | null {
  return role === 'ADMIN' ? `/admin/users/${enc(userId)}` : null;
}

/**
 * QR geri bildirimi → ilgili gelen kutusunda o kaydın detay çekmecesi.
 * (admin: `qr:<id>` anahtarı · bayi: `qr-<id>` · müşteri Seslerim: `fb-<id>`.)
 */
export function feedbackHref(role: SearchRole, feedbackId: string): string {
  if (role === 'ADMIN') return `/admin/feedbacks?view=all&id=${enc(`qr:${feedbackId}`)}`;
  if (role === 'DEALER') return `/dealer/inbox?id=${enc(`qr-${feedbackId}`)}`;
  return `/customer/me/voices?id=${enc(`fb-${feedbackId}`)}`;
}

/**
 * Ürün → bayi: kendi kataloğunda o ürün aranmış hâli · müşteri: o ürünü içeren ziyaretleri
 * (Cüzdan › Hareketler › Ziyaretler, arama ürün adında da eşleşir) · admin: ürün yüzeyi yok.
 */
export function productHref(role: SearchRole, productName: string): string | null {
  const q = enc(productName.trim().slice(0, 80));
  if (role === 'DEALER') return `/dealer/products?q=${q}`;
  if (role === 'CUSTOMER') return `/customer/wallet/activity?tab=visits&q=${q}`;
  return null;
}

/** QR kodu → bayi: kendi QR listesinde aranmış hâli · admin: sahibi bayinin sağlık çekmecesi. */
export function qrHref(role: SearchRole, code: { code: string; dealerId: string | null }): string | null {
  if (role === 'DEALER') return `/dealer/qr-codes?q=${enc(code.code)}`;
  if (role === 'ADMIN') return code.dealerId ? `/admin/dealers-health?dealer=${enc(code.dealerId)}` : null;
  return null;
}

/** Fiziksel kart token'ı → yalnız admin: kart listesi o token ile aranmış hâli. */
export function cardHref(role: SearchRole, token: string): string | null {
  return role === 'ADMIN' ? `/admin/cards?q=${enc(token.trim().slice(0, 80))}` : null;
}

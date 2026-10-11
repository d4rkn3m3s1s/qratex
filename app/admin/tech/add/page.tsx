import { permanentRedirect } from 'next/navigation';

/**
 * Emekli: /admin/tech/add ("Teknoloji Ekle") — üç formun kopyası kardeş sayfalarda zaten vardı ve
 * sapmıştı (geçersiz olaylar). Oluşturma artık bağlam içinde:
 *   ?type=webhook → Entegrasyonlar › Webhook'lar (yeni webhook diyaloğu)
 *   ?type=apikey  → Entegrasyonlar › API anahtarları (yeni anahtar diyaloğu)
 *   diğer (özellik bayrağı) → /admin/features
 */
export default async function LegacyTechAddRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).type;
  const type = Array.isArray(raw) ? raw[0] : raw;
  if (type === 'webhook') permanentRedirect('/admin/integrations?tab=webhooklar&create=webhook');
  if (type === 'apikey' || type === 'api-key' || type === 'key') permanentRedirect('/admin/integrations?tab=anahtarlar&create=key');
  permanentRedirect('/admin/features');
}

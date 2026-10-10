import { ImageResponse } from 'next/og';
import { getServerLocale } from '@/lib/server-locale';
import { getPublicExperience } from '@/lib/experience-share/public';
import { getShareCopy } from '@/components/public/p-deneyim-anket/copy';
import { OG_SIZE, ogAccent, ShareOgCard } from '@/components/public/p-deneyim-anket/og';

/**
 * Dinamik paylaşım görseli — mekân adı, öneri notu, puan, ruh hâli. Okuma YAN ETKİSİZ
 * (önizleme botları görüntülenme sayacını şişirmez). DB okunamazsa genel Qratex kartı.
 */
export const alt = 'Qratex anonim deneyim kartı';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let locale: 'tr' | 'en' = 'tr';
  try {
    locale = await getServerLocale();
  } catch {
    locale = 'tr';
  }
  const copy = getShareCopy(locale);
  const result = await getPublicExperience(token, { withStats: false }).catch(() => null);

  if (!result || result.status !== 'ok') {
    return new ImageResponse(
      <ShareOgCard eyebrow="Qratex" title={copy.expMetaTitleGeneric} chips={[]} accent={ogAccent(null)} avatarText="Q" />,
      size
    );
  }
  const { card } = result;
  const name = card.venue.name ?? copy.venueFallback;
  const chips = [
    card.caption ? copy.expRatingLabel(card.caption.rating) : null,
    copy.moods[card.mood],
    card.venue.category ? copy.categories[card.venue.category] : null,
  ].filter((c): c is string => Boolean(c));

  return new ImageResponse(
    <ShareOgCard
      eyebrow={copy.expEyebrow}
      title={name}
      subtitle={card.caption ? copy.captions[card.caption.key] : null}
      chips={chips}
      accent={ogAccent(card.venue.category)}
      avatarText={name}
    />,
    size
  );
}

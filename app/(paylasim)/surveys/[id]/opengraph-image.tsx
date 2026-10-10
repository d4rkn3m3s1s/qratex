import { ImageResponse } from 'next/og';
import { getServerLocale } from '@/lib/server-locale';
import { loadSurveyMeta } from '@/lib/survey-fill';
import { getShareCopy } from '@/components/public/p-deneyim-anket/copy';
import { OG_SIZE, ogAccent, ShareOgCard } from '@/components/public/p-deneyim-anket/og';

/**
 * Anket bağlantısının paylaşım görseli (denetim B8): işletme + anket başlığı + soru sayısı.
 * Yan etkisiz; DB okunamazsa genel kart.
 */
export const alt = 'Qratex anket';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let locale: 'tr' | 'en' = 'tr';
  try {
    locale = await getServerLocale();
  } catch {
    locale = 'tr';
  }
  const copy = getShareCopy(locale);
  const meta = await loadSurveyMeta(id);
  if (!meta) {
    return new ImageResponse(
      <ShareOgCard eyebrow="Qratex" title={copy.svMetaNotFound} chips={[]} accent={ogAccent(null)} avatarText="Q" />,
      size
    );
  }
  return new ImageResponse(
    <ShareOgCard
      eyebrow={meta.dealerName ?? 'Qratex'}
      title={meta.title}
      subtitle={copy.svMetaDescription(meta.dealerName, meta.questionCount)}
      chips={[copy.svQuestions(meta.questionCount)]}
      accent={ogAccent(null)}
      avatarText={meta.dealerName ?? meta.title}
    />,
    size
  );
}

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { ApiError } from '@/lib/http/define-route';
import { gateSurveyPage } from '@/lib/dealer-surveys/page-gate.server';
import { getSurveyResults, getSurveyTitle } from '@/lib/dealer-surveys/service.server';
import { DEFAULT_SURVEY_RANGE, isSurveyRange, type SurveyResultsData } from '@/lib/dealer-surveys/types';
import { getServerLocale } from '@/lib/server-locale';
import { SurveyResultsScreen } from '@/components/dealer/b-anketler/results-screen';
import { SurveysBlocked } from '@/components/dealer/b-anketler/blocked';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Sekme başlığında anket adı (denetim results #37). Okunamazsa genel başlık. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, locale] = await Promise.all([params, getServerLocale()]);
  const suffix = locale === 'en' ? 'Results' : 'Sonuçlar';
  const auth = await requireAuth(['DEALER']);
  const title = 'error' in auth ? null : await getSurveyTitle(auth.session.user.id, id);
  return { title: title ? `${title} · ${suffix}` : suffix };
}

/**
 * Anket detay merkezi — sonuçlar (`/dealer/surveys/[id]/results?range=&tab=&share=1`).
 * Sunucu önce: kimlik + modül kapısı + seçili dönemin sonuç modeli (BFF ile aynı yükleyici).
 * Bulunamayan anket açık "bulunamadı" durumu; okuma hatasında ada BFF'i yeniden dener.
 */
export default async function SurveyResultsPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const gate = await gateSurveyPage(`/dealer/surveys/${id}/results`);
  if (!gate.ok) return <SurveysBlocked kind={gate.kind} withBack />;

  const range = isSurveyRange(sp.range) ? sp.range : DEFAULT_SURVEY_RANGE;
  let initial: SurveyResultsData | null = null;
  try {
    initial = await getSurveyResults(gate.dealerId, id, range);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return <SurveysBlocked kind="notFound" withBack />;
    console.error('[dealer-surveys] SSR sonuç okuması başarısız; istemci yeniden deneyecek', error);
  }
  return <SurveyResultsScreen surveyId={id} initial={initial} initialRange={range} now={Date.now()} />;
}

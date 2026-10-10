import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { SURVEY_LIMITS } from '@/lib/survey-schema';
import { gateSurveyPage } from '@/lib/dealer-surveys/page-gate.server';
import { getServerLocale } from '@/lib/server-locale';
import { SurveyBuilder } from '@/components/dealer/b-anketler/survey-builder';
import { SurveysBlocked } from '@/components/dealer/b-anketler/blocked';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return { title: locale === 'en' ? 'New survey' : 'Yeni anket' };
}

/**
 * Yeni anket (`/dealer/surveys/create?template=<anahtar>|start=blank`). Kota sunucuda okunur:
 * dolu kotada form doldurulup sonra reddedilmez, baştan söylenir (denetim #27).
 */
export default async function CreateSurveyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await gateSurveyPage('/dealer/surveys/create');
  if (!gate.ok) return <SurveysBlocked kind={gate.kind} withBack />;

  const sp = await searchParams;
  const template = typeof sp.template === 'string' ? sp.template.slice(0, 40) : null;
  const startBlank = sp.start === 'blank';

  let quota: { used: number; limit: number } | null = null;
  try {
    quota = { used: await prisma.survey.count({ where: { dealerId: gate.dealerId } }), limit: SURVEY_LIMITS.surveysPerDealer };
  } catch (error) {
    // Kota okunamazsa form açılır; sunucu POST'ta kotayı yine uygular (409 SURVEY_QUOTA).
    console.error('[dealer-surveys] kota okunamadı', error);
  }

  return <SurveyBuilder mode="create" quota={quota} templateKey={template} startBlank={startBlank} />;
}

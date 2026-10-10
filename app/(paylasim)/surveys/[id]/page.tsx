import type { Metadata } from 'next';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { CalendarX2 } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { getServerLocale } from '@/lib/server-locale';
import { isPlausibleSurveyId, loadSurveyForFill, parseDoneCookie, SURVEY_DONE_COOKIE } from '@/lib/survey-fill';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { getShareCopy } from '@/components/public/p-deneyim-anket/copy';
import { StatusPanel } from '@/components/public/p-deneyim-anket/status-panel';
import { RefreshButton } from '@/components/public/p-deneyim-anket/experience-client';
import { SurveyFlow } from '@/components/public/p-deneyim-anket/survey-flow';
import Link from 'next/link';

/**
 * `/surveys/[id]` — bayinin dağıttığı anketin herkese açık doldurma sayfası.
 *
 * Sunucu bileşeni (denetim B4/B8): işletme kimliği, sorular ve "zaten yanıtladın" bilgisi
 * ilk HTML'de; spinner → fetch şelalesi yok. Durumlar: form · zaten yanıtlandı · anket
 * kapandı (pasif / modül kapalı / bayi askıda) · bulunamadı (404) · geçici hata (yeniden dene).
 * Etkileşim tek istemci adasında (`SurveyFlow`): soru-başına-ekran, ilerleme, taslak, özet.
 */
export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

const viewer = cache(async () => {
  try {
    const session = await getServerSession(authOptions);
    return session?.user?.id ? { id: session.user.id as string, role: String(session.user.role ?? '') } : null;
  } catch {
    return null;
  }
});

const doneIds = cache(async () => {
  try {
    return parseDoneCookie((await cookies()).get(SURVEY_DONE_COOKIE)?.value ?? null);
  } catch {
    return [];
  }
});

const loadSurvey = cache(async (id: string) => {
  const [v, done] = await Promise.all([viewer(), doneIds()]);
  return loadSurveyForFill(id, { userId: v?.id ?? null, doneIds: done });
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const copy = getShareCopy(await getServerLocale());
  const robots = { index: false, follow: false } as const;
  if (!isPlausibleSurveyId(id)) return { title: copy.svMetaNotFound, robots };
  const load = await loadSurvey(id);
  if (load.status !== 'ok') return { title: copy.svMetaNotFound, robots };
  const { survey } = load;
  const title = copy.svMetaTitle(survey.title, survey.dealer.name);
  const description = survey.description?.slice(0, 160) || copy.svMetaDescription(survey.dealer.name, survey.questions.length);
  const url = `/surveys/${id}`;
  return {
    title,
    description,
    robots,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function SurveyFillPage({ params }: PageProps) {
  const { id } = await params;
  if (!isPlausibleSurveyId(id)) notFound();

  const locale = await getServerLocale();
  const copy = getShareCopy(locale);
  const [load, me] = await Promise.all([loadSurvey(id), viewer()]);

  if (load.status === 'not_found') notFound();

  if (load.status === 'unavailable') {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-12 sm:py-16">
        <ErrorState
          variant="page"
          kind="generic"
          title={copy.unavailableTitle}
          description={copy.unavailableBody}
          action={<RefreshButton label={copy.retry} />}
        />
      </div>
    );
  }

  if (load.status === 'closed') {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-12 sm:py-16">
        <StatusPanel
          icon={CalendarX2}
          title={copy.svClosedTitle}
          description={copy.svClosedBody(load.dealerName)}
          actions={
            <Button asChild variant="outline" className="w-full">
              <Link href="/">{copy.goHome}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <SurveyFlow
      survey={load.survey}
      alreadyResponded={load.alreadyResponded}
      viewer={me ? { signedIn: true, role: me.role } : { signedIn: false, role: null }}
      locale={locale}
    />
  );
}

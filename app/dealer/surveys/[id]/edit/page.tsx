import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { ApiError } from '@/lib/http/define-route';
import { gateSurveyPage } from '@/lib/dealer-surveys/page-gate.server';
import { getSurveyForEditor, getSurveyTitle } from '@/lib/dealer-surveys/service.server';
import { getServerLocale } from '@/lib/server-locale';
import type { SurveyEditorData } from '@/lib/dealer-surveys/types';
import { SurveyBuilder } from '@/components/dealer/b-anketler/survey-builder';
import { SurveysBlocked } from '@/components/dealer/b-anketler/blocked';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, locale] = await Promise.all([params, getServerLocale()]);
  const prefix = locale === 'en' ? 'Edit' : 'Düzenle';
  const auth = await requireAuth(['DEALER']);
  const title = 'error' in auth ? null : await getSurveyTitle(auth.session.user.id, id);
  return { title: title ? `${prefix}: ${title}` : prefix };
}

/**
 * Anketi düzenle (`/dealer/surveys/[id]/edit`) — oluşturucuyla aynı bileşen. Yanıt almış
 * ankette yapısal kilit hem arayüzde hem sunucuda (PUT 409) uygulanır.
 */
export default async function EditSurveyPage({ params }: Props) {
  const { id } = await params;
  const gate = await gateSurveyPage(`/dealer/surveys/${id}/edit`);
  if (!gate.ok) return <SurveysBlocked kind={gate.kind} withBack />;

  let editor: SurveyEditorData;
  try {
    editor = await getSurveyForEditor(gate.dealerId, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return <SurveysBlocked kind="notFound" withBack />;
    console.error('[dealer-surveys] düzenleyici okunamadı', error);
    return <SurveysBlocked kind="generic" withBack />;
  }
  return <SurveyBuilder key={editor.survey.id} mode="edit" editor={editor} />;
}

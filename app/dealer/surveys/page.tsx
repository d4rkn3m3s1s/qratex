import { gateSurveyPage } from '@/lib/dealer-surveys/page-gate.server';
import { listDealerSurveys } from '@/lib/dealer-surveys/service.server';
import type { SurveyListData } from '@/lib/dealer-surveys/types';
import { SurveysScreen } from '@/components/dealer/b-anketler/surveys-screen';
import { SurveysBlocked } from '@/components/dealer/b-anketler/blocked';

export const dynamic = 'force-dynamic';

/**
 * Pazarlama → Anketler (`/dealer/surveys`). Sunucu önce: kimlik + modül kapısı + liste okuma
 * modeli (BFF ile AYNI yükleyici) sunucuda; istemci adası `initial` ile açılır. Sunucu okuması
 * başarısızsa ada BFF'i çağırır ve hatayı görünür gösterir (asla "Henüz anket yok" değil).
 */
export default async function DealerSurveysPage() {
  const gate = await gateSurveyPage('/dealer/surveys');
  if (!gate.ok) return <SurveysBlocked kind={gate.kind} />;

  let initial: SurveyListData | null = null;
  try {
    initial = await listDealerSurveys(gate.dealerId);
  } catch (error) {
    console.error('[dealer-surveys] SSR liste okuması başarısız; istemci yeniden deneyecek', error);
  }
  return <SurveysScreen initial={initial} now={Date.now()} />;
}

'use client';

import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import { useSurveyCopy } from './copy';

/**
 * Modül kapalı / yetkisiz / okunamadı — sayfa iskeleti korunur, sıfırlı içerik ÇİZİLMEZ.
 * (Denetim: modül kapatılınca yalnız menü gizleniyor, URL çalışmaya devam ediyordu.)
 */
export function SurveysBlocked({ kind, withBack = false }: { kind: 'moduleDisabled' | 'forbidden' | 'generic' | 'notFound'; withBack?: boolean }) {
  const { copy } = useSurveyCopy();
  return (
    <PanelPage register="ops" header={<PageHeader eyebrow={copy.eyebrow} title={copy.listTitle} icon={<ClipboardList />} />}>
      <ErrorState
        kind={kind === 'generic' ? 'generic' : kind}
        title={kind === 'moduleDisabled' ? copy.moduleDisabledTitle : kind === 'notFound' ? copy.errors.SURVEY_NOT_FOUND ?? undefined : undefined}
        description={kind === 'moduleDisabled' ? copy.moduleDisabledBody : undefined}
        onRetry={kind === 'generic' ? () => window.location.reload() : undefined}
        action={
          withBack ? (
            <Button asChild variant="outline">
              <Link href="/dealer/surveys">{copy.backToList}</Link>
            </Button>
          ) : undefined
        }
      />
    </PanelPage>
  );
}

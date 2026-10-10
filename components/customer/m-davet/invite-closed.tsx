'use client';

import { UserPlus } from 'lucide-react';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { ErrorState, type ErrorKind } from '@/components/states';
import { useInviteCopy } from './copy';

/** Modül kapalı / yetkisiz durumları — sayfa iskeleti korunur, sıfırlı içerik ÇİZİLMEZ (denetim #3). */
export function InviteBlocked({ kind }: { kind: Extract<ErrorKind, 'moduleDisabled' | 'forbidden'> }) {
  const { copy } = useInviteCopy();
  return (
    <PanelPage
      register="play"
      header={<PageHeader eyebrow={copy.eyebrow} title={copy.title} icon={<UserPlus />} />}
    >
      <ErrorState
        kind={kind}
        description={kind === 'moduleDisabled' ? copy.errors.MODULE_DISABLED as string : undefined}
      />
    </PanelPage>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Timeline } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { QueryState } from '@/components/states';
import { fetchAudit, usersKeys } from '../api';
import { auditLabel } from '../format';
import { Pager } from '../parts';

export function AuditTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: usersKeys.sub(userId, 'audit', page),
    queryFn: () => fetchAudit(userId, page),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  return (
    <SectionCard
      title="Denetim izi"
      icon={<ScrollText />}
      description="Bu kullanıcı üzerinde yapılan ve kullanıcının kendi yaptığı kayıtlı işlemler."
      actions={
        <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          <Link href="/admin/audit">Tüm denetim günlüğü</Link>
        </Button>
      }
    >
      <QueryState query={q} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: 'Denetim kaydı yok', compact: true }}>
        {(d) => (
          <>
            <Timeline
              groupByDay
              events={d.items.map((a) => ({
                id: a.id,
                at: a.createdAt,
                title: auditLabel(a.action),
                actor: a.direction === 'subject' ? a.actorLabel : `Kullanıcının kendisi · ${a.actorLabel}`,
                description: a.summary ? <code className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-fg-muted">{a.summary}</code> : undefined,
                tone: /SUSPEND|ANONYM|REVOKE|ELEVATION/i.test(a.action) ? 'warning' : 'neutral',
              }))}
            />
            <Pager page={d.page} pageCount={d.pageCount} total={d.total} onPage={setPage} label="Denetim izi" />
          </>
        )}
      </QueryState>
    </SectionCard>
  );
}

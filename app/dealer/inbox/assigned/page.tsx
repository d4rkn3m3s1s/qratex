import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getServerLocale } from '@/lib/server-locale';
import { getWorkSummary, listWork } from '@/lib/dealer-queues/work-server';
import { WORK_PAGE_SIZE, normalizeWorkKind, normalizeWorkScope } from '@/lib/dealer-queues/work-core';
import { normalizeSearch } from '@/lib/dealer-queues/remedy-core';
import { loadAssigneeDirectory } from '@/lib/dealer-queues/assignees';
import { isModuleOn } from '@/lib/dealer-queues/route-helpers';
import { SkeletonList } from '@/components/states';
import { firstParam, gateQueuePage, settle } from '@/components/dealer/b-gelen-kuyruklar/shared/page-gate';
import { AssignedScreen, type AssignedInitial } from '@/components/dealer/b-gelen-kuyruklar/assigned/assigned-screen';

/**
 * Gelen Kutusu → Bana atananlar (yol haritası §4.3, F3.2(b)). Eski `/dealer/action-items` buraya
 * kalıcı yönlenir. Görev + vaka birleşik kuyruğu; sayfa SALT OKUR (LLM yok, kayıt üretmez).
 * Atama yazımı sunucuda `validateAssignee` ile doğrulanır (A3).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Assigned to me', description: 'Tasks and incidents in one prioritised list.', robots: { index: false } }
    : { title: 'Bana atananlar', description: 'Görevler ve vakalar tek, önceliklendirilmiş listede.', robots: { index: false } };
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AssignedPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const gate = await gateQueuePage('action_items', sp);
  if (!gate.ok) return gate.node;

  const scope = normalizeWorkScope(firstParam(sp.scope));
  const kind = normalizeWorkKind(firstParam(sp.kind));
  const q = normalizeSearch(firstParam(sp.q));
  const { dealerId, actorId } = gate.scope;
  const actor = { id: actorId, role: gate.scope.actorRole, name: gate.actorName };

  const [dir, incidentsEnabled] = await Promise.all([
    settle('assignees', loadAssigneeDirectory(dealerId, actorId)),
    isModuleOn('incidents').catch(() => false),
  ]);
  const [list, summary] = await Promise.all([
    dir
      ? settle('work-list', listWork(dealerId, actor, { scope, kind, q, offset: 0, limit: WORK_PAGE_SIZE }, dir, { incidentsEnabled }))
      : null,
    settle('work-summary', getWorkSummary(dealerId, actor, { incidentsEnabled })),
  ]);

  const initial: AssignedInitial = {
    scope,
    kind,
    q,
    list: list && summary ? { ...list, summary } : null,
    assignees: dir?.list ?? null,
    meId: actorId,
    readOnly: gate.readOnly,
  };

  return (
    <Suspense fallback={<SkeletonList rows={6} />}>
      <AssignedScreen initial={initial} />
    </Suspense>
  );
}

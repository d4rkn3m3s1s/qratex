import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getServerLocale } from '@/lib/server-locale';
import { getIncidentSummary, listIncidents, normalizeIncidentView } from '@/lib/dealer-queues/incident-server';
import { INCIDENT_GROUPS, INCIDENT_PAGE_SIZE, INCIDENT_SEVERITIES, type IncidentSeverity, type IncidentTypeGroup } from '@/lib/dealer-queues/incident-catalog';
import { normalizeSearch } from '@/lib/dealer-queues/remedy-core';
import { loadAssigneeDirectory } from '@/lib/dealer-queues/assignees';
import { getRadarStatus } from '@/lib/dealer-queues/radar';
import { SkeletonList } from '@/components/states';
import { firstParam, gateQueuePage, settle } from '@/components/dealer/b-gelen-kuyruklar/shared/page-gate';
import { IncidentsScreen, type IncidentsInitial } from '@/components/dealer/b-gelen-kuyruklar/incidents/incidents-screen';

/**
 * Gelen Kutusu → Vakalar (yol haritası §4.3, F3.2(b)). Eski `/dealer/incidents` buraya kalıcı
 * yönlenir. Sayfa SALT OKUR: radar durumu ölçülür ama vaka üretilmez (üretim olay güdümlü /
 * günlük bakım / "Şimdi tara").
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Incidents', description: 'Crisis radar, table signals and incidents: claim, assign, resolve.', robots: { index: false } }
    : { title: 'Vakalar', description: 'Kriz radarı, masa sinyalleri ve vakalar: üstlen, ata, çöz.', robots: { index: false } };
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function IncidentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const gate = await gateQueuePage('incidents', sp);
  if (!gate.ok) return gate.node;

  const view = normalizeIncidentView(firstParam(sp.view));
  const sevRaw = firstParam(sp.severity) ?? '';
  const severity: IncidentSeverity | 'all' = (INCIDENT_SEVERITIES as readonly string[]).includes(sevRaw) ? (sevRaw as IncidentSeverity) : 'all';
  const groupRaw = firstParam(sp.group) ?? '';
  const group: IncidentTypeGroup | 'all' = (INCIDENT_GROUPS as readonly string[]).includes(groupRaw) ? (groupRaw as IncidentTypeGroup) : 'all';
  const q = normalizeSearch(firstParam(sp.q));
  const page = Math.min(500, Math.max(1, Number(firstParam(sp.page)) || 1));
  const { dealerId, actorId } = gate.scope;

  const dir = await settle('assignees', loadAssigneeDirectory(dealerId, actorId));
  const [list, summary, radar] = await Promise.all([
    dir ? settle('incident-list', listIncidents(dealerId, actorId, { view, severity, group, q, page, pageSize: INCIDENT_PAGE_SIZE }, dir)) : null,
    settle('incident-summary', getIncidentSummary(dealerId, actorId)),
    settle('radar', getRadarStatus(dealerId)),
  ]);

  const initial: IncidentsInitial = {
    view,
    severity,
    group,
    q,
    page,
    list: list && summary ? { ...list, summary } : null,
    radar,
    assignees: dir?.list ?? null,
    meId: actorId,
    readOnly: gate.readOnly,
  };

  return (
    <Suspense fallback={<SkeletonList rows={5} />}>
      <IncidentsScreen initial={initial} />
    </Suspense>
  );
}

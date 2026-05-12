import type { PrismaClient } from '@prisma/client';

export type TimelineRow = { at: string; kind: string; label: string; meta?: Record<string, unknown> };

export async function appendRemedyTimelineEvent(
  prisma: PrismaClient,
  remedyOfferId: string,
  kind: string,
  label: string,
  meta?: Record<string, unknown>
) {
  await prisma.remedyTimelineEvent.create({
    data: {
      remedyOfferId,
      kind,
      label,
      meta: meta ? (meta as object) : undefined,
    },
  });
}

export function buildRemedyTimeline(
  offer: { createdAt: Date; acceptedAt: Date | null; status: string; message: string },
  events: { kind: string; label: string; meta: unknown; createdAt: Date }[]
): TimelineRow[] {
  const sorted = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const hasCreated = sorted.some((e) => e.kind === 'created');
  const rows: TimelineRow[] = [];

  if (!hasCreated) {
    rows.push({
      at: offer.createdAt.toISOString(),
      kind: 'created',
      label: 'Teklif oluşturuldu',
      meta: { preview: offer.message.slice(0, 120) },
    });
  }

  for (const e of sorted) {
    rows.push({
      at: e.createdAt.toISOString(),
      kind: e.kind,
      label: e.label,
      meta: (e.meta as Record<string, unknown>) || undefined,
    });
  }

  if (offer.acceptedAt && !sorted.some((e) => e.kind === 'accepted')) {
    rows.push({
      at: offer.acceptedAt.toISOString(),
      kind: 'accepted',
      label: 'Kullanım / kabul',
    });
  }

  return rows.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

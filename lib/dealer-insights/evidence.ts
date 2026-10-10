/**
 * İçgörüler — kanıt listesi (tema / öneri / varlık → o kümeyi oluşturan geri bildirimler).
 *
 * Her sayının arkasındaki kayıtlar okunabilsin (kıyas: Qualtrics Text iQ drill-down). Liste
 * sunucuda süzülür ve imleçle sayfalanır (eski sayfa yalnız istemcideki son 50 kaydı arıyordu).
 * Temalar/öneriler/varlıklar yalnız QR geri bildiriminde bulunur (tüketim yorumunda AI teması yok).
 */
import { prisma } from '@/lib/prisma';
import { unifiedSentiment } from '@/lib/dealer-inbox/core';
import { normalizeKey, parseEntities, parseSuggestions, parseThemes, recommendationId } from './core';
import { toInstants } from './params';
import { ROW_CAP } from './server';
import type { EvidenceItem, EvidencePage, InsightsQuery } from './types';

export type EvidenceFilter =
  | { kind: 'theme'; key: string }
  | { kind: 'rec'; key: string }
  | { kind: 'entity'; key: string };

export const EVIDENCE_PAGE_SIZE = 20;

type Cursor = { at: number; id: string };

export function encodeEvidenceCursor(c: Cursor): string {
  return Buffer.from(`${c.at}|${c.id}`, 'utf8').toString('base64url');
}

export function decodeEvidenceCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 200) return null;
  try {
    const [at, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    const n = Number(at);
    if (!Number.isFinite(n) || !id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
    return { at: n, id };
  } catch {
    return null;
  }
}

/** Satır, süzgeçle eşleşiyor mu (saf; test edilir). */
export function matchesFilter(
  row: { themes?: unknown; actionSuggestions?: unknown; entities?: unknown },
  filter: EvidenceFilter
): boolean {
  if (filter.kind === 'theme') return parseThemes(row.themes).some((t) => normalizeKey(t.label) === filter.key);
  if (filter.kind === 'rec') return parseSuggestions(row.actionSuggestions).some((s) => recommendationId(s.text) === filter.key);
  return parseEntities(row.entities).some((e) => `${e.type}:${normalizeKey(e.name)}` === filter.key);
}

/** İmleçten sonraki öğeler (createdAt desc, id desc). */
export function afterCursor<T extends { at: number; id: string }>(list: readonly T[], cursor: Cursor | null): T[] {
  if (!cursor) return [...list];
  return list.filter((r) => r.at < cursor.at || (r.at === cursor.at && r.id < cursor.id));
}

function preview(text: string | null): string | null {
  if (!text) return null;
  const s = text.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > 280 ? `${s.slice(0, 279).trimEnd()}…` : s;
}

export async function loadEvidence(
  dealerId: string,
  query: InsightsQuery,
  filter: EvidenceFilter,
  opts: { cursor?: string | null; limit?: number; canCorrect?: boolean } = {}
): Promise<EvidencePage> {
  const { from, to } = toInstants(query.range);
  const location = query.location;
  const select =
    filter.kind === 'theme'
      ? { id: true, createdAt: true, themes: true }
      : filter.kind === 'rec'
        ? { id: true, createdAt: true, actionSuggestions: true }
        : { id: true, createdAt: true, entities: true };
  const candidates = (await prisma.feedback.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: from, lt: to },
      aiProcessedAt: { not: null },
      qrCode: { dealerId, ...(location ? (location === 'none' ? { locationId: null } : { locationId: location }) : {}) },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: ROW_CAP,
    select,
  })) as Array<{ id: string; createdAt: Date; themes?: unknown; actionSuggestions?: unknown; entities?: unknown }>;

  const matched = candidates.filter((r) => matchesFilter(r, filter)).map((r) => ({ id: r.id, at: r.createdAt.getTime() }));
  const limit = Math.min(Math.max(opts.limit ?? EVIDENCE_PAGE_SIZE, 1), 50);
  const rest = afterCursor(matched, decodeEvidenceCursor(opts.cursor));
  const page = rest.slice(0, limit);
  const hasMore = rest.length > limit;

  if (page.length === 0) return { items: [], nextCursor: null, total: matched.length };

  const details = await prisma.feedback.findMany({
    where: { id: { in: page.map((p) => p.id) }, qrCode: { dealerId } },
    select: {
      id: true,
      rating: true,
      sentiment: true,
      text: true,
      aiProcessedAt: true,
      dealerRepliedAt: true,
      createdAt: true,
      qrCode: { select: { name: true } },
      aiCorrections: { where: { dealerId, field: 'sentiment' }, select: { id: true }, take: 1 },
    },
  });
  const byId = new Map(details.map((d) => [d.id, d]));
  const items: EvidenceItem[] = [];
  for (const p of page) {
    const d = byId.get(p.id);
    if (!d) continue;
    const corrected = d.aiCorrections.length > 0;
    const u = unifiedSentiment({
      sentiment: d.sentiment,
      rating: d.rating,
      hasText: !!d.text?.trim(),
      analyzed: d.aiProcessedAt != null,
    });
    items.push({
      key: `qr-${d.id}`,
      source: 'qr',
      rating: d.rating,
      sentiment: u.sentiment,
      sentimentBasis: corrected ? 'corrected' : u.basis,
      preview: preview(d.text),
      createdAt: d.createdAt.toISOString(),
      replied: d.dealerRepliedAt != null,
      corrected,
      canCorrect: opts.canCorrect !== false,
      qrName: d.qrCode?.name ?? null,
    });
  }
  const last = page[page.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeEvidenceCursor({ at: last.at, id: last.id }) : null,
    total: matched.length,
  };
}

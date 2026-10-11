'use client';

/**
 * Segmentler — istemci veri katmanı. Zarf v2 çözülür; hata ASLA boş veri gibi dönmez
 * (eski sayfalar 401/500'ü "segment yok" / "bekleyen öneri yok" diye gösteriyordu).
 */
import type {
  AdminDecision,
  BulkDecideResult,
  DecideResult,
  MemberSortKey,
  ModuleFeatureKey,
  ModulesState,
  ProposalDetail,
  ProposalListResult,
  ProposalStatus,
  SegmentMembersPage,
  SegmentOverview,
} from '../domain';
import { clientMessage } from '@/lib/client-messages';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function parse<T>(res: Response): Promise<T> {
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  if (!res.ok || !json || json.ok === false || json.success === false) {
    const message =
      (json && typeof json.error === 'string' && json.error) ||
      (res.status === 401 || res.status === 403
        ? clientMessage('forbidden')
        : res.status >= 500
          ? clientMessage('unavailable')
          : clientMessage('failed'));
    throw new ApiRequestError(message, res.status, typeof json?.code === 'string' ? json.code : undefined, json?.details);
  }
  return (json.data ?? json) as T;
}

async function send<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return parse<T>(res);
}

export function fetchOverview(opts: { fresh?: boolean } = {}, signal?: AbortSignal): Promise<SegmentOverview> {
  return fetch(`/api/admin/segments${opts.fresh ? '?fresh=1' : ''}`, { signal, cache: 'no-store' }).then((r) => parse<SegmentOverview>(r));
}

export interface MembersParams {
  segmentId: string;
  q: string;
  sort: string | null;
  page: number;
  size: number;
}

function membersSearch(p: Omit<MembersParams, 'segmentId' | 'page' | 'size'> & { page?: number; size?: number }): URLSearchParams {
  const sp = new URLSearchParams();
  if (p.q) sp.set('q', p.q);
  if (p.sort) sp.set('sort', p.sort);
  if (p.page && p.page > 1) sp.set('page', String(p.page));
  if (p.size) sp.set('size', String(p.size));
  return sp;
}

export function fetchMembers(p: MembersParams, signal?: AbortSignal): Promise<SegmentMembersPage> {
  return fetch(`/api/admin/segments/${encodeURIComponent(p.segmentId)}/members?${membersSearch(p)}`, { signal, cache: 'no-store' }).then((r) =>
    parse<SegmentMembersPage>(r)
  );
}

export function membersExportUrl(p: { segmentId: string; q: string; sort: string | null }): string {
  const sp = membersSearch({ q: p.q, sort: p.sort });
  sp.set('segment', p.segmentId);
  return `/api/admin/segments/export?${sp}`;
}

export interface ProposalParams {
  status: ProposalStatus | 'ALL';
  q: string;
  seg: string;
  source: string;
  page: number;
  size: number;
}

export function proposalsKey(p: ProposalParams): string {
  return [p.status, p.q, p.seg, p.source, p.page, p.size].join('|');
}

export function fetchProposals(p: ProposalParams, signal?: AbortSignal): Promise<ProposalListResult> {
  const sp = new URLSearchParams();
  sp.set('status', p.status);
  if (p.q) sp.set('q', p.q);
  if (p.seg) sp.set('seg', p.seg);
  if (p.source) sp.set('source', p.source);
  if (p.page > 1) sp.set('page', String(p.page));
  sp.set('size', String(p.size));
  return fetch(`/api/admin/segments/proposals?${sp}`, { signal, cache: 'no-store' }).then((r) => parse<ProposalListResult>(r));
}

export function fetchProposal(id: string, signal?: AbortSignal): Promise<ProposalDetail> {
  return fetch(`/api/admin/segments/proposals/${encodeURIComponent(id)}`, { signal, cache: 'no-store' }).then((r) => parse<ProposalDetail>(r));
}

export function decide(id: string, decision: AdminDecision, note: string | null): Promise<DecideResult> {
  return send(`/api/admin/segments/proposals/${encodeURIComponent(id)}`, 'PATCH', { decision, note });
}

export function bulkDecide(ids: string[], decision: AdminDecision, note: string | null): Promise<BulkDecideResult> {
  return send('/api/admin/segments/proposals/bulk', 'POST', { ids, decision, note });
}

export function fetchModules(signal?: AbortSignal): Promise<ModulesState> {
  return fetch('/api/admin/segments/modules', { signal, cache: 'no-store' }).then((r) => parse<ModulesState>(r));
}

export function patchFeatures(version: string | null, features: Partial<Record<ModuleFeatureKey, boolean>>): Promise<ModulesState> {
  return send('/api/admin/segments/modules', 'PATCH', { section: 'features', version, features });
}

export function patchReferral(version: string | null, referral: ModulesState['referral']): Promise<ModulesState> {
  return send('/api/admin/segments/modules', 'PATCH', { section: 'referral', version, referral });
}

export function patchPartner(version: string | null, partnerDigest: { enabled: boolean; url: string }): Promise<ModulesState> {
  return send('/api/admin/segments/modules', 'PATCH', { section: 'partnerDigest', version, partnerDigest });
}

export function rotateSecret(version: string | null): Promise<{ secret: string; state: ModulesState }> {
  return send('/api/admin/segments/modules/rotate-secret', 'POST', { version });
}

export type { MemberSortKey };

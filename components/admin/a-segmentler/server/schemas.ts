/** Segmentler BFF zod sözleşmeleri (katı; bilinmeyen alan reddedilir). */
import { z } from 'zod';
import { parseSort } from '@/components/ds/data/table-url';
import {
  ADMIN_DECISIONS,
  BULK_MAX,
  DECISION_NOTE_MAX,
  INNOVATION_SEGMENT_KEYS,
  MEMBER_PAGE_SIZES,
  MEMBER_SORT_KEYS,
  MODULE_FEATURE_KEYS,
  PROPOSAL_PAGE_SIZES,
  PROPOSAL_STATUSES,
  type MemberSortKey,
} from '../domain';

const one = z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v[0] : v));

const pageSize = (sizes: readonly number[], fallback: number) =>
  one
    .optional()
    .transform((v) => {
      const n = Number(v);
      return Number.isInteger(n) && sizes.includes(n) ? n : fallback;
    });

const page = one.optional().transform((v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
});

const sortParam = one.optional().transform((v): { id: MemberSortKey; desc: boolean } | null => {
  const s = parseSort(v ?? null, MEMBER_SORT_KEYS)[0];
  return s ? { id: s.id as MemberSortKey, desc: s.desc } : null;
});

export const OverviewQuery = z.object({ fresh: one.optional() }).passthrough();

export const SegmentParams = z.object({ segmentId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) });

export const MembersQuery = z
  .object({
    q: one.optional().transform((v) => (v ?? '').slice(0, 100)),
    sort: sortParam,
    page,
    size: pageSize(MEMBER_PAGE_SIZES, 20),
  })
  .passthrough();

export const ExportQuery = z
  .object({
    segment: one.pipe(z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)),
    q: one.optional().transform((v) => (v ?? '').slice(0, 100)),
    sort: sortParam,
  })
  .passthrough();

export const ProposalListQuery = z
  .object({
    status: one
      .optional()
      .transform((v) => ((PROPOSAL_STATUSES as readonly string[]).includes(v ?? '') ? (v as (typeof PROPOSAL_STATUSES)[number]) : v === 'ALL' ? 'ALL' : 'PENDING')),
    q: one.optional().transform((v) => (v ?? '').slice(0, 100)),
    seg: one.optional().transform((v) => ((INNOVATION_SEGMENT_KEYS as readonly string[]).includes(v ?? '') ? (v as string) : null)),
    source: one.optional().transform((v) => (v === 'demo' || v === 'real' ? v : 'all') as 'all' | 'real' | 'demo'),
    page,
    size: pageSize(PROPOSAL_PAGE_SIZES, 20),
  })
  .passthrough();

export const ProposalParams = z.object({ id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) });

const note = z.string().max(DECISION_NOTE_MAX).optional().nullable();

export const DecideBody = z.object({ decision: z.enum(ADMIN_DECISIONS), note }).strict();

export const BulkDecideBody = z
  .object({
    ids: z.array(z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)).min(1).max(BULK_MAX),
    decision: z.enum(ADMIN_DECISIONS),
    note,
  })
  .strict();

const featureShape = Object.fromEntries(MODULE_FEATURE_KEYS.map((k) => [k, z.boolean().optional()])) as Record<
  (typeof MODULE_FEATURE_KEYS)[number],
  z.ZodOptional<z.ZodBoolean>
>;

const version = z.string().datetime().nullable();

export const ModulesPatchBody = z.discriminatedUnion('section', [
  z.object({ section: z.literal('features'), version, features: z.object(featureShape).strict() }).strict(),
  z
    .object({
      section: z.literal('referral'),
      version,
      referral: z
        .object({
          maxInvitesPerReferrerLifetime: z.number().int().min(0).max(10_000),
          maxRedemptionsPerReferralCodePerMonth: z.number().int().min(0).max(10_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      section: z.literal('partnerDigest'),
      version,
      partnerDigest: z.object({ enabled: z.boolean(), url: z.string().max(500) }).strict(),
    })
    .strict(),
]);

export const RotateSecretBody = z.object({ version }).strict();

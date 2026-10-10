/**
 * Bayi → Müşteriler uçlarının paylaşılan zod şemaları (liste, dışa aktarma, aksiyon gövdesi).
 */
import { z } from 'zod';
import { isCustomerTag, isRiskLevel, isWinBackBand, legacySortAlias, normalizeSearch, parseSortParam } from './core';
import { CUSTOMER_TAGS, MESSAGE_TEMPLATES, NOTE_MAX, WIN_BACK_BANDS, type CustomerTag, type RiskLevel, type WinBackBand } from './types';

const optionalEnum = <T extends string>(guard: (v: unknown) => v is T) =>
  z
    .string()
    .optional()
    .transform((v) => (v && guard(v) ? v : null));

/** `?q=&segment=&risk=&band=&sort=spend.desc&page=1&size=20` (eski `?sort=churn&limit=` da kabul). */
export const CustomerListQuery = z
  .object({
    q: z.string().max(200).optional(),
    segment: optionalEnum<CustomerTag>(isCustomerTag),
    risk: optionalEnum<RiskLevel>(isRiskLevel),
    band: optionalEnum<WinBackBand>(isWinBackBand),
    sort: z.string().max(60).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    size: z.coerce.number().int().min(1).max(100).optional(),
    /** Eski istemci: `limit` (tek sayfa). */
    limit: z.coerce.number().int().min(1).max(200).optional(),
    dealerId: z.string().max(191).optional(),
  })
  .transform((v) => ({
    q: normalizeSearch(v.q),
    segment: v.segment,
    risk: v.risk,
    band: v.band,
    sort: parseSortParam(legacySortAlias(v.sort)),
    page: v.page ?? 1,
    pageSize: Math.min(100, v.size ?? v.limit ?? 20),
  }));

export type CustomerListQueryValue = z.infer<typeof CustomerListQuery>;

const Ref = z.string().min(3).max(200).regex(/^c_[A-Za-z0-9_-]+$/);

export const ActionBody = z.object({
  mode: z.enum(['preview', 'execute']),
  audience: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('segment'), tag: z.enum(CUSTOMER_TAGS) }),
    z.object({ kind: z.literal('band'), band: z.enum([...WIN_BACK_BANDS, 'all'] as [string, ...string[]]) }),
    z.object({ kind: z.literal('customers'), refs: z.array(Ref).min(1).max(200) }),
  ]),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('message'), template: z.enum(MESSAGE_TEMPLATES), note: z.string().max(NOTE_MAX * 2).optional() }),
    z.object({ type: z.literal('personal_offer'), note: z.string().max(NOTE_MAX * 2).optional() }),
  ]),
});

export type ActionBodyValue = z.infer<typeof ActionBody>;

export const RefParams = z.object({ ref: Ref });

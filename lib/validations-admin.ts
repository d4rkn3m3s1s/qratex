import { z } from 'zod';
import { INPUT_LIMITS } from '@/lib/input-limits';

// ─────────────────────────────────────────────────────────────
// LIST QUERY DEFAULTS (K1: merkezi sayfalama/arama)
// ─────────────────────────────────────────────────────────────
export const LIST_QUERY_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
} as const;

/** Ortak list query params: page, pageSize, search (admin/public listelerde kullanılabilir) */
export const listQueryBaseSchema = z.object({
  page: z.coerce.number().int().min(1).default(LIST_QUERY_DEFAULTS.page),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIST_QUERY_DEFAULTS.maxPageSize)
    .default(LIST_QUERY_DEFAULTS.pageSize),
  search: z
    .string()
    .max(INPUT_LIMITS.searchQuery)
    .optional()
    .transform((s) => (s?.trim() || undefined)),
});

/** POST /api/admin/api-keys - create API key */
export const adminApiKeyCreateSchema = z.object({
  name: z.string().min(1, 'İsim gerekli').max(100).optional(),
  scope: z.array(z.string()).optional(),
});

/** DELETE /api/admin/feedbacks - soft delete or remove feedbacks */
export const adminFeedbacksDeleteSchema = z.object({
  feedbackIds: z.array(z.string().min(1)).min(1, 'En az bir feedback ID gerekli'),
  type: z.enum(['qr', 'consumption']).optional(),
});

/** POST /api/admin/feedbacks/restore - restore soft-deleted feedbacks */
export const adminFeedbacksRestoreSchema = z.object({
  feedbackIds: z.array(z.string().min(1)).min(1, 'En az bir feedback ID gerekli'),
});

/** POST /api/admin/settings - batch update */
export const adminSettingsBatchSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().min(1, 'key gerekli'),
        value: z.unknown(),
        category: z.string().optional(),
      })
    )
    .min(1, 'En az bir ayar gerekli')
    .max(200, 'Tek istekte en fazla 200 ayar güncellenebilir'),
});

/** PUT /api/admin/seo - global + pageOverrides (loose; sanitize does the rest) */
export const adminSeoPutSchema = z.object({
  global: z.record(z.unknown()).optional(),
  pageOverrides: z.array(
    z.object({
      path: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      canonical: z.string().optional(),
    }).passthrough()
  ).optional(),
}).passthrough();

/** POST /api/admin/seo/rollback */
export const adminSeoRollbackSchema = z.object({
  auditLogId: z.string().min(1, 'auditLogId gerekli'),
});

/** POST /api/admin/webhooks */
export const adminWebhookCreateSchema = z.object({
  url: z.string().min(1, 'URL gerekli').max(2000),
  secret: z.string().max(500).optional(),
  events: z.array(z.string()).optional(),
});

/** PUT /api/admin/settings/points-matrix */
export const adminPointsMatrixPutSchema = z.object({
  matrix: z.unknown(),
});

/** PUT /api/admin/discovery */
export const adminDiscoveryPutSchema = z.object({
  config: z.unknown(),
});

/** PUT /api/admin/settings/leagues */
export const adminLeaguesPutSchema = z.object({
  rules: z.unknown(),
});

/** GET /api/admin/feedbacks - query params (page, pageSize, search) */
export const adminFeedbacksQuerySchema = listQueryBaseSchema;

/** GET /api/admin/users - query params (page, pageSize, search, role, cursor) */
export const adminUsersQuerySchema = listQueryBaseSchema.extend({
  role: z.enum(['ADMIN', 'DEALER', 'CUSTOMER']).optional(),
  cursor: z.string().optional(),
});

/** GET /api/admin/cards - query params (page, pageSize, search, status, batchId) */
export const adminCardsQuerySchema = listQueryBaseSchema.extend({
  status: z.enum(['UNUSED', 'ACTIVATED', 'BLOCKED']).optional(),
  batchId: z.string().optional(),
});

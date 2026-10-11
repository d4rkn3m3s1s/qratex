/** Bayi Sağlığı BFF uçlarının zod şemaları (tek kaynak). */
import { z } from 'zod';
import { BAND_KEYS, CSM_PRIORITIES, CSM_STATUSES, FLAG_KEYS, PAGE_SIZES, SORT_KEYS, type HealthWindow } from '../domain';

const windowSchema = z
  .enum(['7', '30', '90'])
  .optional()
  .transform((v): HealthWindow => (v ? (Number(v) as HealthWindow) : 30));

const sortSchema = z
  .string()
  .regex(new RegExp(`^(${SORT_KEYS.join('|')})(\\.(asc|desc))?$`))
  .optional();

export const ListQuery = z.object({
  window: windowSchema,
  q: z.string().trim().max(120).optional(),
  band: z.enum(BAND_KEYS).optional(),
  flag: z.enum(FLAG_KEYS).optional(),
  sort: sortSchema,
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  size: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n), 'Geçersiz sayfa boyutu')
    .optional(),
  fresh: z.enum(['0', '1']).optional(),
});

export const ExportQuery = z.object({
  window: windowSchema,
  q: z.string().trim().max(120).optional(),
  band: z.enum(BAND_KEYS).optional(),
  flag: z.enum(FLAG_KEYS).optional(),
  sort: sortSchema,
});

export const WindowQuery = z.object({ window: windowSchema });

export const DealerParams = z.object({ dealerId: z.string().min(1).max(64) });
export const TaskParams = z.object({ taskId: z.string().min(1).max(64) });

export const CreateCsmBody = z.object({
  priority: z.enum(CSM_PRIORITIES).default('medium'),
  note: z.string().trim().min(3, 'Not en az 3 karakter olmalı.').max(1000, 'Not en fazla 1000 karakter olabilir.'),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  assignToMe: z.boolean().optional(),
  window: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
});

export const UpdateCsmBody = z
  .object({
    status: z.enum(CSM_STATUSES).optional(),
    assignToMe: z.boolean().optional(),
    expectedStatus: z.enum(CSM_STATUSES).optional(),
  })
  .refine((b) => b.status !== undefined || b.assignToMe !== undefined, 'Değişiklik yok.');

export const ApplyBody = z.object({
  playbookId: z.string().min(1).max(64),
  dealerId: z.string().min(1).max(64),
  dryRun: z.boolean().optional().default(false),
});

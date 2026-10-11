/** Telafi teklif kataloğu — form/BFF şemaları ve tür metinleri (saf). */
import { z } from 'zod';

export const REMEDY_TYPES = ['discount', 'points', 'free_item'] as const;
export type RemedyType = (typeof REMEDY_TYPES)[number];

export const REMEDY_TYPE_META: Readonly<Record<RemedyType, { label: string; unit: string; hint: string; format: (v: number) => string }>> = {
  discount: { label: 'İndirim', unit: '%', hint: 'Yüzde indirim; personel kasada uygular.', format: (v) => `%${v}` },
  points: { label: 'Puan', unit: 'puan', hint: 'Müşteri cüzdanına puan olarak verilir.', format: (v) => `${v} puan` },
  free_item: { label: 'Ücretsiz ürün/içecek', unit: 'adet', hint: 'Adet olarak; personel kasada uygular.', format: (v) => `${v} adet` },
};

export function isRemedyType(v: unknown): v is RemedyType {
  return typeof v === 'string' && (REMEDY_TYPES as readonly string[]).includes(v);
}

const values = z.array(z.number({ invalid_type_error: 'Değer sayı olmalı.' })).min(1, 'En az bir değer girin.').max(8, 'En fazla 8 değer girilebilir.');

export const remedyTemplateCreateSchema = z.object({
  locationId: z.string().min(1).max(64).nullable(),
  type: z.enum(REMEDY_TYPES, { errorMap: () => ({ message: 'Telafi türü seçin.' }) }),
  label: z.string().trim().max(60, 'Etiket en fazla 60 karakter olabilir.').nullable().optional(),
  values,
  isActive: z.boolean().default(true),
});

export const remedyTemplateUpdateSchema = z
  .object({
    label: z.string().trim().max(60, 'Etiket en fazla 60 karakter olabilir.').nullable().optional(),
    values: values.optional(),
    isActive: z.boolean().optional(),
    move: z.enum(['up', 'down']).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Değişiklik yok.' });

/** "10, 15 ve 20" girişini sayılara ayırır ("1,5" Türkçe ondalık değil, ayraç sayılır). */
export function parseValueInput(text: string): { values: number[]; invalid: string[] } {
  const parts = text
    .split(/[\s,;]+/)
    .map((p) => p.trim().replace(/^%/, ''))
    .filter(Boolean);
  const values: number[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (/^\d+(?:\.\d+)?$/.test(p)) values.push(Number(p));
    else invalid.push(p);
  }
  return { values, invalid };
}

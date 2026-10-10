/**
 * Keşfet BFF sorgu şemaları (zod). Boş metin parametresi "yok" sayılır (`?lat=` → undefined);
 * konum ~110 m'ye yuvarlanarak işlenir (gizlilik). Saf modül — testlerde doğrudan kullanılır.
 */
import { z } from 'zod';
import { PLACE_CATEGORY_SLUGS } from './categories';
import { clampRadiusKm, coarsen, DEFAULT_RADIUS_KM } from './geo';

const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optNumber = (min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().finite().min(min).max(max).optional());

const flag = z.preprocess(blankToUndefined, z.enum(['1', '0', 'true', 'false']).optional()).transform((v) => v === '1' || v === 'true');

const coords = {
  lat: optNumber(-90, 90).transform((v) => (v === undefined ? undefined : coarsen(v))),
  lng: optNumber(-180, 180).transform((v) => (v === undefined ? undefined : coarsen(v))),
};

export const nearbyQuerySchema = z
  .object({
    ...coords,
    radius: optNumber(0.1, 1000).transform((v) => clampRadiusKm(v ?? DEFAULT_RADIUS_KM)),
    category: z.preprocess(blankToUndefined, z.enum(PLACE_CATEGORY_SLUGS).optional()),
    q: z.preprocess(blankToUndefined, z.string().trim().max(60).optional()),
    open: flag,
    boost: flag,
    sort: z.preprocess(blankToUndefined, z.enum(['distance', 'rating']).optional()),
    offset: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(5000).optional()),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: 'Enlem ve boylam birlikte verilmeli.', path: ['lat'] });

export const coordsQuerySchema = z
  .object(coords)
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: 'Enlem ve boylam birlikte verilmeli.', path: ['lat'] });

export const topQuerySchema = z.object({
  category: z.preprocess(blankToUndefined, z.enum(PLACE_CATEGORY_SLUGS).optional()),
  window: z.preprocess(blankToUndefined, z.enum(['30', '90']).optional()).transform((v) => (v === '30' ? 30 : 90) as 30 | 90),
});

export const dealerParamsSchema = z.object({ dealerId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) });

export const claimBodySchema = z
  .object({ campaignId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional() })
  .strict()
  .optional();

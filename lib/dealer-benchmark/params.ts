/**
 * Bayi Kıyas — URL ↔ sorgu sözleşmesi (saf). Sunucu sayfası, BFF ve istemci aynı fonksiyonu
 * kullanır → aynı React Query anahtarı.
 */
import { z } from 'zod';
import {
  BENCHMARK_DEFAULT_PRESET,
  BENCHMARK_PRESETS,
  PEER_GROUPS,
  type BenchmarkPreset,
  type BenchmarkQuery,
  type PeerGroup,
} from './types';
import { PLACE_CATEGORY_SLUGS, type PlaceCategory } from '@/lib/places/categories';

type ParamsLike = { get(key: string): string | null };

export function parseBenchmarkSearch(params: ParamsLike): BenchmarkQuery {
  const p = params.get('period');
  const g = params.get('group');
  return {
    preset: (BENCHMARK_PRESETS as readonly string[]).includes(p ?? '') ? (p as BenchmarkPreset) : BENCHMARK_DEFAULT_PRESET,
    group: (PEER_GROUPS as readonly string[]).includes(g ?? '') ? (g as PeerGroup) : null,
  };
}

export function benchmarkSearchString(q: BenchmarkQuery): string {
  const sp = new URLSearchParams();
  if (q.preset !== BENCHMARK_DEFAULT_PRESET) sp.set('period', q.preset);
  if (q.group) sp.set('group', q.group);
  return sp.toString();
}

export const benchmarkQuerySchema = z.object({
  period: z.enum(BENCHMARK_PRESETS as unknown as [BenchmarkPreset, ...BenchmarkPreset[]]).optional(),
  group: z.enum(PEER_GROUPS as unknown as [PeerGroup, ...PeerGroup[]]).optional(),
  fresh: z.enum(['0', '1']).optional(),
  dealerId: z.string().max(191).optional(),
});

/** Bayinin kendi sektörünü seçmesi (kontrollü sözlük; null → temizle). */
export const benchmarkCategorySchema = z
  .object({
    category: z.enum(PLACE_CATEGORY_SLUGS as unknown as [PlaceCategory, ...PlaceCategory[]]).nullable(),
  })
  .strict();

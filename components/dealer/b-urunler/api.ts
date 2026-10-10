'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CATALOG_QUERY_ROOT,
  catalogQueryKey,
  catalogSearchString,
  productDetailQueryKey,
  type CatalogQuery,
  type ProductBulkInput,
  type ProductCreateInput,
  type ProductUpdateInput,
} from '@/lib/dealer/catalog/schemas';
import type { CatalogPageDto, CatalogProductDto, ImportReportDto, ProductDetailDto } from '@/lib/dealer/catalog/types';

/** Zarf v2 hatası — `QueryState` / `applyServerErrors` `status`, `code`, `details` okur. */
export class CatalogFetchError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  readonly retryable: boolean;
  constructor(message: string, status: number, code: string | null, details: unknown, retryable = false) {
    super(message);
    this.name = 'CatalogFetchError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

type Envelope<T> = { ok?: boolean; success?: boolean; data?: T; error?: string; code?: string; details?: unknown; retryable?: boolean };

/** `!res.ok` ya da `success:false` → kodlu hata ("200 + boş liste" yok; Bulgu 1). */
async function readEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false || json.ok === false) {
    throw new CatalogFetchError(json?.error || `HTTP ${res.status}`, res.status, json?.code ?? null, json?.details, !!json?.retryable);
  }
  return json.data as T;
}

function idemKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function send<T>(url: string, method: 'POST' | 'PATCH', body: unknown, idempotent = false): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(idempotent ? { 'Idempotency-Key': idemKey() } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  return readEnvelope<T>(res);
}

const noRetryOn4xx = (count: number, error: unknown) => {
  if (error instanceof CatalogFetchError && error.status >= 400 && error.status < 500 && error.status !== 429) return false;
  return count < 2;
};

export function useCatalog(q: CatalogQuery) {
  return useQuery({
    queryKey: catalogQueryKey(q),
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/dealer/catalog${catalogSearchString(q)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
      });
      return readEnvelope<CatalogPageDto>(res);
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: noRetryOn4xx,
  });
}

export function useProductDetail(productId: string | null) {
  return useQuery({
    queryKey: productDetailQueryKey(productId ?? ''),
    enabled: !!productId,
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/dealer/catalog/products/${encodeURIComponent(productId!)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
      });
      return readEnvelope<ProductDetailDto>(res);
    },
    staleTime: 30_000,
    retry: noRetryOn4xx,
  });
}

/** Her yazmadan sonra katalog sorgularını (tüm sayfa/filtre anahtarları) tazele. */
export function useInvalidateCatalog() {
  const qc = useQueryClient();
  return (productId?: string) => {
    void qc.invalidateQueries({ queryKey: CATALOG_QUERY_ROOT });
    if (productId) void qc.invalidateQueries({ queryKey: productDetailQueryKey(productId) });
  };
}

export const catalogApi = {
  createProduct: (body: ProductCreateInput) =>
    send<{ product: CatalogProductDto }>('/api/dealer/catalog/products', 'POST', body, true),
  updateProduct: (id: string, body: ProductUpdateInput) =>
    send<{ product: CatalogProductDto }>(`/api/dealer/catalog/products/${encodeURIComponent(id)}`, 'PATCH', body),
  copyProduct: (id: string) =>
    send<{ product: CatalogProductDto }>(`/api/dealer/catalog/products/${encodeURIComponent(id)}/copy`, 'POST', {}, true),
  bulk: (body: ProductBulkInput) =>
    send<{ updated: number; skipped: number; skippedReasons: string[] }>('/api/dealer/catalog/products/bulk', 'POST', body, true),
  createCategory: (body: { name: string; icon: string }) =>
    send<{ category: { id: string } }>('/api/dealer/catalog/categories', 'POST', body, true),
  updateCategory: (id: string, body: { name?: string; icon?: string }) =>
    send<{ category: { id: string } }>(`/api/dealer/catalog/categories/${encodeURIComponent(id)}`, 'PATCH', body),
  archiveCategory: (id: string, moveToCategoryId: string | null) =>
    send<{ moved: number }>(`/api/dealer/catalog/categories/${encodeURIComponent(id)}/archive`, 'POST', { moveToCategoryId }),
  restoreCategory: (id: string) =>
    send<{ category: { id: string } }>(`/api/dealer/catalog/categories/${encodeURIComponent(id)}/restore`, 'POST', {}),
  reorderCategories: (ids: string[]) => send<{ updated: number }>('/api/dealer/catalog/categories/reorder', 'POST', { ids }),
  importCsv: (csv: string, onDuplicate: 'skip' | 'update', commit: boolean) =>
    send<ImportReportDto>('/api/dealer/catalog/import', 'POST', { csv, onDuplicate, commit }, commit),
  async uploadImage(file: File): Promise<{ url: string }> {
    const fd = new FormData();
    fd.append('photo', file, file.name || 'urun.jpg');
    const res = await fetch('/api/dealer/catalog/images', { method: 'POST', credentials: 'same-origin', body: fd });
    return readEnvelope<{ url: string }>(res);
  },
};

/** Arşivle → "Geri al" toast'ı için tek ürün geri yükleme dahil, ortak mutasyon. */
export function useSetProductActive() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => catalogApi.updateProduct(id, { isActive: active }),
    onSettled: (_d, _e, v) => invalidate(v.id),
  });
}

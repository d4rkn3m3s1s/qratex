/**
 * Shared HTTP response headers and safe query parsing for API routes.
 */

import { NextResponse } from 'next/server';
import { isPrismaConnectivityError } from '@/lib/prisma';

export const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
} as const;

const SERVICE_UNAVAILABLE_HEADERS: Record<string, string> = {
  ...PRIVATE_NO_STORE_HEADERS,
  'Retry-After': '8',
};

/** Neon / ağ kesintisi (P1001 vb.) için 503; yoksa null. */
export function responseIfDatabaseUnavailable(error: unknown): NextResponse | null {
  if (!isPrismaConnectivityError(error)) return null;
  return NextResponse.json(
    {
      error: 'Veritabanı geçici olarak ulaşılamıyor',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    },
    { status: 503, headers: SERVICE_UNAVAILABLE_HEADERS }
  );
}

/**
 * Tutarlı BAŞARI yanıtı — { success: true, ...data }. Yeni/refactor edilen route'lar bunu
 * kullanmalı (istemci hata yönetimi tek şekle dayansın). Mevcut route'lar kademeli geçebilir.
 */
export function apiOk<T extends object>(data: T, init?: { status?: number; headers?: Record<string, string> }): NextResponse {
  return NextResponse.json(
    { success: true, ...data },
    { status: init?.status ?? 200, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(init?.headers ?? {}) } }
  );
}

/**
 * Tutarlı HATA yanıtı — { success: false, error, code?, retryable? }.
 */
export function apiError(
  message: string,
  init?: { status?: number; code?: string; retryable?: boolean; headers?: Record<string, string> }
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(init?.code ? { code: init.code } : {}),
      ...(init?.retryable != null ? { retryable: init.retryable } : {}),
    },
    { status: init?.status ?? 400, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(init?.headers ?? {}) } }
  );
}

const MAX_REASONABLE_PAGE = 50_000;

/** Page number for offset pagination (1-based). */
export function clampPageParam(raw: string | null, fallback = 1): number {
  const n = parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), MAX_REASONABLE_PAGE);
}

/** Page size with upper bound to limit DB load and response size. */
export function clampPageSizeParam(raw: string | null, fallback: number, max: number): number {
  const n = parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.max(1, Math.floor(n)), max);
}

/** List `take` style limits (e.g. ?limit=). */
export function clampTakeParam(raw: string | null, fallback: number, max: number): number {
  const n = parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.max(1, Math.floor(n)), max);
}

export function paginationSkip(page: number, pageSize: number): number {
  return Math.max(0, (page - 1) * pageSize);
}

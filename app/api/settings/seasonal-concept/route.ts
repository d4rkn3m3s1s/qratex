import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import {
  ACTIVE_SEASONAL_CONCEPT_KEY,
  readValidSeasonalCache,
  resolveSeasonalConcept,
} from '@/lib/seasonal-concept-core';

export const dynamic = 'force-dynamic';

/** İçerik kullanıcıya özel değil: CDN'de kısa süre paylaşılır (her sayfa yüklemesinde DB'ye gitmez). */
const PUBLIC_CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

/**
 * GET /api/settings/seasonal-concept — Aktif dönemsel konsepti döndürür (public).
 * Settings önbelleği "kazanan + bir sonraki değişim anı" taşır; o an gelmediyse tek okuma
 * yeter (konsept yoksa da). Geçmişse canlı çözülür (sonradan başlayan yüksek öncelikli
 * konsept cron'u beklemeden görünür).
 */
export async function GET() {
  try {
    const now = new Date();
    const setting = await prisma.settings.findUnique({
      where: { key: ACTIVE_SEASONAL_CONCEPT_KEY },
      select: { value: true },
    });

    const cached = readValidSeasonalCache(setting?.value, now);
    if (cached) return NextResponse.json({ concept: cached.concept }, { headers: PUBLIC_CACHE_HEADERS });

    const live = await resolveSeasonalConcept(now);
    return NextResponse.json({ concept: live.concept }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error fetching seasonal concept:', error);
    return NextResponse.json({ concept: null }, { headers: PRIVATE_NO_STORE_HEADERS });
  }
}

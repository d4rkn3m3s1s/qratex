import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import {
  ACTIVE_SEASONAL_CONCEPT_KEY,
  getActiveSeasonalConcept,
  parseActiveSeasonalConcept,
} from '@/lib/seasonal-concept-core';

export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/seasonal-concept — Aktif dönemsel konsepti döndürür (public).
 * Önce Settings cache'ini okur; cache'teki konseptin penceresi geçmişse veya yoksa
 * canlı hesaplar (cron arası kaçışları önler).
 */
export async function GET() {
  try {
    const now = new Date();
    const setting = await prisma.settings.findUnique({
      where: { key: ACTIVE_SEASONAL_CONCEPT_KEY },
      select: { value: true },
    });

    const cached = parseActiveSeasonalConcept(setting?.value);
    // Cache geçerli mi? (konsept var ve bitiş tarihi gelecekte)
    if (cached && cached.endDate && new Date(cached.endDate) > now) {
      return NextResponse.json({ concept: cached }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Cache yok/eski → canlı hesapla (Settings'i güncellemeden; cron yazar).
    const live = await getActiveSeasonalConcept(now);
    return NextResponse.json({ concept: live }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error fetching seasonal concept:', error);
    return NextResponse.json({ concept: null }, { headers: PRIVATE_NO_STORE_HEADERS });
  }
}

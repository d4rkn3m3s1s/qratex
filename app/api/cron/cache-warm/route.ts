import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { internalAppBaseUrl } from '@/lib/inngest/internal-http';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * CACHE-WARM cron: GLOBAL (kullanıcıdan bağımsız) cache'leri önceden ısıtır → ilk gerçek
 * kullanıcı cache-miss beklemez. Yalnızca herkese aynı görünen (public/leaderboard) uçları
 * ısıtır; per-kullanıcı/per-bayi cache'ler ısıtılmaz (çok fazla anahtar olur).
 *
 * ⚠️ VARSAYILAN OLARAK KAPALI — 2026-08 Neon duraklatmasından sonra.
 *
 * 5 dakikada bir çağrılıyordu: günde 288 tetikleme. Isıttığı iki uç da veritabanına
 * gidiyor, yani bu iş aslında UYUYAN COMPUTE'U UYANDIRIYORDU. Neon faturası sorgu
 * sayısına değil compute'un uyanık kaldığı süreye baktığı için, tek başına en büyük
 * tüketim kalemiydi ve karşılığında kazandırdığı tek şey ilk ziyaretçinin birkaç yüz
 * milisaniyesiydi — o da Redis ilk gerçek istekte nasılsa doluyor.
 *
 * Açmak için: CACHE_WARM_ENABLED=1. Açmadan önce Neon compute grafiğine bak.
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  // Yetki kontrolünden SONRA: bayrak durumu yalnız yetkili çağırana sızsın.
  if (process.env.CACHE_WARM_ENABLED !== '1') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'CACHE_WARM_ENABLED=1 değil — compute tasarrufu için kapalı.',
    });
  }

  const base = internalAppBaseUrl();
  // Isıtılacak GLOBAL uçlar (Redis/unstable_cache doldurur). Self-fetch: yanıtı umursamayız,
  // yalnız cache dolsun. Her biri ayrı try — biri patlarsa diğerleri devam eder.
  // Eski /api/leaderboard emekli (410; oturumsuz çağrıda zaten 401 dönüyordu — boşa iş).
  const targets = ['/api/public/stats'];
  const results: { path: string; ok: boolean; ms: number }[] = [];
  for (const path of targets) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(12_000), cache: 'no-store' });
      results.push({ path, ok: res.ok, ms: Date.now() - t0 });
    } catch {
      results.push({ path, ok: false, ms: Date.now() - t0 });
    }
  }
  return NextResponse.json({ ok: true, warmed: results });
}

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { runFeedbackAnalyzePipeline } from '@/lib/inngest/feedback-analyze-pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * AI-RETRY cron: gerçek LLM analizini alamamış (aiProcessedAt=null → o an GROQ yoktu / geçici
 * hata) feedback'leri tekrar analiz eder. GROQ artık erişilebilirse local-fallback'ten gerçek
 * analize yükselir; hâlâ yoksa zarar yok (yine fallback kalır). Her koşuda EN FAZLA 15 tane
 * (bounded — cron süresi/GROQ kotası taşmasın). cron-job.org'dan saatte 1 (Bearer CRON_SECRET).
 */
function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret.trim()}`;
  const got = (authHeader ?? '').trim();
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ZAMAN BÜTÇESİ: cron-job.org test timeout'u 30 sn. Her feedback GROQ'a gider (yavaş/yoksa
  // 5-10 sn sürebilir) → 22 sn'de dur, kısmi dön. Kalanlar bir sonraki koşuda işlenir.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 18_000; // + PER_ITEM_MS(8sn) worst-case = 26sn < cron 30sn timeout

  // İlk (inline) analizle YARIŞMAMAK için: yalnız 3 dk'dan eski, metni olan, hiç işlenmemişler.
  const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
  const stuck = await prisma.feedback.findMany({
    where: {
      aiProcessedAt: null,
      text: { not: null },
      deletedAt: null,
      createdAt: { lt: threeMinAgo },
    },
    orderBy: { createdAt: 'desc' }, // en yeni sıkışanlar önce (kullanıcı en çok onları bekler)
    take: 15,
    select: { id: true },
  }).catch(() => []);

  // FEEDBACK-BAŞINA timeout: tek bir pipeline GROQ'ta takılsa bile bütünü bloklamasın.
  // Race timeout pipeline'ı İPTAL ETMEZ (Vercel'de arkada bitmeye devam eder, sorun değil);
  // sadece beklemeyi bırakır → yanıt hızlı döner, kalanı sonraki koşu toplar.
  const PER_ITEM_MS = 8_000;
  const timedOut = Symbol('timeout');
  const withTimeout = (p: Promise<unknown>) =>
    Promise.race([p.then(() => 'done' as const), new Promise((r) => setTimeout(() => r(timedOut), PER_ITEM_MS))]);

  let upgraded = 0;
  let stillFallback = 0;
  let failed = 0;
  let processed = 0;
  let timeouts = 0;
  for (const f of stuck) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break; // bütçe doldu → kalanı sonraki koşuya bırak
    processed++;
    try {
      const race = await withTimeout(runFeedbackAnalyzePipeline(f.id));
      if (race === timedOut) { timeouts++; continue; } // bu feedback yavaş → sonraki koşuda tekrar
      // Pipeline sonrası gerçek analiz olduysa aiProcessedAt dolar.
      const after = await prisma.feedback.findUnique({
        where: { id: f.id },
        select: { aiProcessedAt: true },
      });
      if (after?.aiProcessedAt) upgraded++;
      else stillFallback++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: stuck.length,
    processed,      // bu koşuda gerçekten denenen (zaman bütçesi nedeniyle < scanned olabilir)
    upgraded,       // gerçek AI'ye yükseldi
    stillFallback,  // GROQ hâlâ yok → fallback kaldı
    timeouts,       // 8sn'de bitmeyen (arkada devam eder, sonraki koşuda tekrar denenir)
    failed,
    tookMs: Date.now() - startedAt,
  });
}

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
  const TIME_BUDGET_MS = 22_000;

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

  let upgraded = 0;
  let stillFallback = 0;
  let failed = 0;
  let processed = 0;
  for (const f of stuck) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break; // bütçe doldu → kalanı sonraki koşuya bırak
    processed++;
    try {
      await runFeedbackAnalyzePipeline(f.id);
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
    failed,
    tookMs: Date.now() - startedAt,
  });
}

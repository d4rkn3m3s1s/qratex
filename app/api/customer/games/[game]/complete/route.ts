import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { handleGameComplete } from '@/lib/game-routes';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sessionId: z.string().min(1).max(64),
  /** İstemcinin skor beyanı — sunucu kırpar ve makullüğünü denetler. */
  score: z.number().int().min(0).max(1_000_000),
  /** İstemcinin ölçtüğü süre (sn) — sunucu kendi saatini esas alır. */
  durationSec: z.number().int().min(0).max(86_400),
  /** Kozmetik; kazanma kararı sunucunundur (geriye uyumluluk için kabul edilir). */
  won: z.boolean().optional(),
  /** start'ın verdiği HMAC imzalı deneme belirteci. */
  attemptToken: z.string().max(2048).optional().nullable(),
});

/**
 * POST — Generic mini oyun bitirici. Ödül SUNUCUDA: skor kırpılır, süre ve saniye başına
 * skor makullüğü sunucu saatine göre denetlenir, kazanma kararı sunucuda verilir; ödül
 * `mintPoints` ile atomik + tek seferlik + oyun kategorisi tavanlı. Ayrıntı: lib/game-session.ts
 */
export async function POST(req: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Geçersiz oyun sonucu.', details: parsed.error.issues.map((i) => i.path.join('.')) },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  return handleGameComplete(game, parsed.data);
}

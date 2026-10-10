import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { handleGameComplete } from '@/lib/game-routes';
import { MINIGAME } from '@/lib/minigame-config';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sessionId: z.string().min(1).max(64),
  /** Toplanan yıldız (skor). Üst sınır sunucuda kırpılır. */
  starsCollected: z.number().int().min(0).max(1000),
  /** İstemcinin ölçtüğü süre (sn) — sunucu kendi saatini esas alır. */
  durationSec: z.number().int().min(0).max(86_400),
  /** Kozmetik; kazanma kararı sunucunundur. */
  won: z.boolean().optional(),
  attemptToken: z.string().max(2048).optional().nullable(),
});

/**
 * POST — Pacman denemesini bitirir. Generic çekirdek: oturumun `gameType`'ı pacman
 * OLMALI (başka oyunun oturumu bu kuralla kapatılamaz), sunucu saati + yıldız/sn
 * makullüğü, kazanma kararı sunucuda, ödül `mintPoints` (tavan + points_credited).
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Geçersiz oyun sonucu.', details: parsed.error.issues.map((i) => i.path.join('.')) },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  const { sessionId, starsCollected, durationSec, won, attemptToken } = parsed.data;
  return handleGameComplete(MINIGAME.gameType, {
    sessionId,
    score: starsCollected,
    durationSec,
    won,
    attemptToken,
  });
}

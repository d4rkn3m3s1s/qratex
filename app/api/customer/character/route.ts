import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';
import {
  CHARACTER_PROFILES,
  getCategoryProgress,
  revealReadyCategoryBadge,
} from '@/lib/character-badges';
import { BADGE_CATALOG } from '@/lib/badge-catalog';
import { CATEGORY_BY_CHARACTER } from '@/lib/character-categories';

export const dynamic = 'force-dynamic';

const CHAR_IDS = CHARACTER_PROFILES.map((c) => c.badgeId);

const characterBodySchema = z
  .object({
    action: z.enum(['feature', 'reveal']).optional(),
    badgeId: z.string().trim().min(1).max(64).optional(),
  })
  .passthrough();

/** Bir karakter badgeId'sinin kategorisini (varsa) sadeleştirir (UI teması için). */
function categoryOf(badgeId: string) {
  const c = CATEGORY_BY_CHARACTER[badgeId];
  return c ? { key: c.key, name: c.name, emoji: c.emoji, accent: c.accent, description: c.description } : null;
}

/** Katalogdan rarity (common|rare|epic|legendary). Yoksa common. */
function rarityOf(badgeId: string): string {
  return BADGE_CATALOG.find((b) => b.id === badgeId)?.rarity ?? 'common';
}

/**
 * GET kaldırıldı (Dalga 2): koleksiyon + gizli bar + kategori vitrini + ana karakter artık
 * `GET /api/customer/badges` (lib/badges/customer-collection.ts) içinde, tek turda ve
 * sunucuda ilk render ile geliyor. Bu uç yalnız reveal ve ana karakter seçimi (POST) içindir.
 */

/**
 * POST: iki mod —
 *  1) body {action:'feature', badgeId} → profil "ana karakter"ini ayarla (sahip olunan rozet).
 *  2) (varsayılan) "keşfet" — eşiği dolmuş kategoride alınmamış karakteri açar (reveal).
 */
export async function POST(req: Request) {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const limited = await enforceRouteRateLimit('customer.character', auth.session.user.id, { max: 20, windowMs: 60_000 });
  if (limited) return limited;
  const userId = auth.session.user.id;

  // Gövde şemalı (müşteri API denetimi D1): gövdesiz istek = reveal; `feature` yalnız
  // kısa bir rozet kimliğiyle. Nesne/sayı gibi beklenmeyen tipler 400 (eskiden String(...) ile
  // "[object Object]" aranıyordu).
  const raw: unknown = await req.json().catch(() => ({}));
  const parsed = characterBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Geçersiz istek.', code: 'VALIDATION' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  const body = parsed.data;

  // ── Ana karakter seçimi ──
  if (body.action === 'feature') {
    const badgeId = body.badgeId ?? '';
    // Yalnızca SAHİP OLUNAN bir karakter rozeti ana yapılabilir.
    const owns = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId } }, select: { id: true },
    }).catch(() => null);
    if (!owns || !CHAR_IDS.includes(badgeId)) {
      return NextResponse.json({ success: false, error: 'Bu rozet sende yok.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    await prisma.user.update({ where: { id: userId }, data: { featuredCharacterBadgeId: badgeId } });
    return NextResponse.json({ success: true, featuredBadgeId: badgeId }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  // ── Reveal (varsayılan) ──
  const prog = await getCategoryProgress(userId);
  if (!prog.ready) {
    return NextResponse.json(
      { success: false, error: 'Henüz keşfe hazır değilsin, biraz daha yorum yaz.', bar: { current: prog.current, threshold: prog.threshold } },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const result = await revealReadyCategoryBadge(userId);
  if (!result) {
    return NextResponse.json(
      { success: false, error: 'Şu an açılamadı, birazdan tekrar dene.' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  // Reveal, "character-ready" bildirimini KARŞILAR → okundu işaretle. Böylece bir
  // sonraki bar dolumunda dedup temizlenir ve yeni bildirim gelebilir (loop kapanır).
  prisma.notification.updateMany({
    where: { userId, isRead: false, type: 'badge', data: { path: ['kind'], equals: 'character-ready' } },
    data: { isRead: true, readAt: new Date() },
  }).catch(() => {});

  const catalog = BADGE_CATALOG.find((b) => b.id === result.badgeId);
  // Nadir oran (reveal görkemi için).
  const [holders, totalCustomers] = await Promise.all([
    prisma.userBadge.count({ where: { badgeId: result.badgeId } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
  ]);
  const ratePct = totalCustomers > 0 ? Math.round((holders / totalCustomers) * 1000) / 10 : null;

  return NextResponse.json(
    {
      success: true,
      character: {
        badgeId: result.badgeId, name: result.name, why: result.why,
        icon: catalog?.icon, description: catalog?.description,
        category: categoryOf(result.badgeId),
        rarity: rarityOf(result.badgeId),
        holders, ratePct,
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}

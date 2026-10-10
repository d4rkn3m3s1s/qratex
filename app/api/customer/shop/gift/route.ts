import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { emailLookupFilter } from '@/lib/auth/normalize-email';
import { maskEmail, publicDisplayName } from '@/lib/http/dto';

export const dynamic = 'force-dynamic';

/**
 * Kozmetik hediye (P0-23).
 *
 * Önceki durum: alıcı serbest metinle (e-posta YA DA isim) `orderBy`'sız `findFirst` ile
 * bulunuyordu → aynı isimde birden çok müşteri varken puan rastgele/yanlış kişiye gidiyordu ve
 * gönderen kime gittiğini görmeden ödüyordu (geri alınamaz).
 *
 * Yeni akış:
 *  1. GET ?q=<e-posta | tam ad> → alıcı ÖNİZLEMESİ: yalnız TEK eşleşmede `recipientUserId` +
 *     maskelenmiş ad/e-posta döner; isim birden çok kişiye uyuyorsa 409 (e-postayla arayın).
 *  2. POST { cosmeticId, recipientUserId, message, requestId } → ödeme yalnız önizlemede
 *     onaylanan kimliğe gider. Puan düşümü defterli (`source: gift`), `requestId` ile tek-kez.
 */

type Session = { user: { id: string; role: string } };

async function customerSession(): Promise<Session | null> {
  const session = (await getServerSession(authOptions)) as Session | null;
  if (!session || session.user.role !== 'CUSTOMER') return null;
  return session;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

const ELIGIBLE_RECIPIENT: Prisma.UserWhereInput = {
  role: 'CUSTOMER',
  suspendedAt: null,
  anonymizedAt: null,
};

/** GET — alıcı önizlemesi. */
export async function GET(req: NextRequest) {
  try {
    const session = await customerSession();
    if (!session) return json({ error: 'Oturum açmanız gerekiyor' }, 401);

    const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
    if (q.length < 3 || q.length > 254) {
      return json({ error: 'Alıcının e-posta adresini ya da tam adını girin (en az 3 karakter).' }, 400);
    }

    // Kullanıcı tabanı numaralandırmasına karşı: kişi başı 10 dakikada 30 arama.
    const rl = await checkRateLimitDb(`gift_lookup:${session.user.id}`, 30, 10 * 60_000);
    if (!rl.ok) return json({ error: 'Çok fazla arama yaptınız. Biraz sonra tekrar deneyin.' }, 429);

    const byEmail = q.includes('@');
    const matches = await prisma.user.findMany({
      where: {
        ...ELIGIBLE_RECIPIENT,
        ...(byEmail ? { email: emailLookupFilter(q) } : { name: { equals: q, mode: 'insensitive' } }),
      },
      select: { id: true, name: true, email: true, image: true },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });

    if (matches.length === 0) {
      return json({ error: 'Bu bilgilerle bir müşteri bulunamadı.' }, 404);
    }
    if (matches.length > 1) {
      return json(
        { error: 'Bu isimde birden çok kullanıcı var. Doğru kişiye gitmesi için e-posta adresiyle arayın.', code: 'AMBIGUOUS_RECIPIENT' },
        409
      );
    }
    const r = matches[0];
    if (r.id === session.user.id) {
      return json({ error: 'Kendinize hediye gönderemezsiniz. Normal satın almayı kullanın.' }, 400);
    }

    return json({
      success: true,
      recipient: {
        recipientUserId: r.id,
        displayName: publicDisplayName(r.name, 'İsimsiz müşteri'),
        maskedEmail: maskEmail(r.email),
        image: r.image ?? null,
      },
    });
  } catch (error) {
    console.error('[SHOP_GIFT_LOOKUP_ERROR]', error);
    return json({ error: 'Alıcı aranırken bir hata oluştu.' }, 500);
  }
}

const giftSchema = z.object({
  cosmeticId: z.string().min(1).max(64),
  recipientUserId: z.string({ required_error: 'Önce alıcıyı arayıp doğrulayın.' }).min(1).max(64),
  message: z.string().max(2000).optional().nullable(),
  requestId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,100}$/, 'Geçersiz istek kimliği')
    .optional(),
});

class AlreadyOwnedError extends Error {}

export async function POST(req: NextRequest) {
  try {
    const session = await customerSession();
    if (!session) return json({ error: 'Oturum açmanız gerekiyor' }, 401);
    const senderId = session.user.id;

    const raw = await req.json().catch(() => null);
    if (raw && typeof raw === 'object' && 'recipientIdentifier' in raw && !('recipientUserId' in raw)) {
      return json({ error: 'Önce alıcıyı arayıp doğrulayın; hediye yalnız onaylanan kişiye gönderilir.', code: 'RECIPIENT_PREVIEW_REQUIRED' }, 400);
    }
    const parsed = giftSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.errors[0]?.message ?? 'Geçersiz istek' }, 400);
    }
    const { cosmeticId, recipientUserId, requestId } = parsed.data;
    // Hediye mesajı: 280 karakter.
    const safeMessage = typeof parsed.data.message === 'string' ? parsed.data.message.trim().slice(0, 280) || null : null;

    if (recipientUserId === senderId) {
      return json({ error: 'Kendinize hediye gönderemezsiniz. Normal satın almayı kullanın.' }, 400);
    }

    const rl = await checkRateLimitDb(`gift_send:${senderId}`, 20, 60 * 60_000);
    if (!rl.ok) return json({ error: 'Çok fazla hediye gönderdiniz. Biraz sonra tekrar deneyin.' }, 429);

    const [cosmetic, sender, recipient] = await Promise.all([
      prisma.cosmeticItem.findUnique({ where: { id: cosmeticId } }),
      prisma.user.findUnique({ where: { id: senderId }, select: { name: true } }),
      prisma.user.findFirst({ where: { id: recipientUserId, ...ELIGIBLE_RECIPIENT }, select: { id: true, name: true } }),
    ]);

    if (!cosmetic || !cosmetic.isActive) {
      return json({ error: 'Kozmetik öğesi bulunamadı veya aktif değil.' }, 404);
    }
    if (!sender) return json({ error: 'Gönderici hesabı bulunamadı.' }, 404);
    if (!recipient) return json({ error: 'Alıcı bulunamadı ya da hediye alamıyor.' }, 404);

    let duplicate = false;
    try {
      await prisma.$transaction(async (tx) => {
        const owned = await tx.userCosmetic.findFirst({
          where: { userId: recipient.id, cosmeticId },
          select: { id: true, giftedByUserId: true },
        });
        if (owned) throw new AlreadyOwnedError();

        // Atomik, defterli harcama (eksi bakiye imkânsız; requestId ile tek-kez).
        const debit = await debitPoints(tx, {
          userId: senderId,
          points: cosmetic.price,
          source: 'gift',
          sourceId: cosmetic.id,
          idempotencyKey: requestId ? `gift:${senderId}:${requestId}` : null,
          reason: `Hediye: ${cosmetic.name}`,
          meta: { recipientUserId: recipient.id, cosmeticId: cosmetic.id },
        });
        if (debit.duplicate) {
          duplicate = true;
          return;
        }

        await tx.userCosmetic.create({
          data: {
            userId: recipient.id,
            cosmeticId,
            giftedByUserId: senderId,
            giftMessage: safeMessage,
            isEquipped: false,
          },
        });

        const giftMsgPart = safeMessage ? ` Mesajı: "${safeMessage}"` : '';
        await tx.notification.create({
          data: {
            userId: recipient.id,
            title: '🎁 Bir Hediye Aldınız!',
            message: `${sender.name || 'Bir kullanıcı'} size "${cosmetic.name}" hediye etti!${giftMsgPart}`,
            type: 'success',
          },
        });
      });
    } catch (err) {
      if (err instanceof AlreadyOwnedError) {
        return json({ error: 'Alıcı bu kozmetik öğesine zaten sahip.' }, 409);
      }
      if (err instanceof InsufficientPointsError) {
        return json({ error: `Yetersiz puan. Bu hediye ${cosmetic.price.toLocaleString('tr-TR')} puan gerektiriyor, sizde ${err.currentPoints.toLocaleString('tr-TR')} puan var.` }, 400);
      }
      if ((err as { code?: string })?.code === 'P2002') {
        return json({ error: 'Alıcı bu kozmetik öğesine zaten sahip.' }, 409);
      }
      throw err;
    }

    if (!duplicate) {
      // Hediye ustası başarımı (hata hediyeyi bozmasın).
      try {
        const { advanceAchievementProgress } = await import('@/lib/achievements');
        await advanceAchievementProgress(senderId, 'quest-gift-master', 1, 'increment');
      } catch (e) {
        console.error('[SHOP_GIFT_ACHIEVEMENT]', e);
      }
    }

    return json({
      success: true,
      duplicate,
      message: `${publicDisplayName(recipient.name, 'Alıcı')} kullanıcısına başarıyla hediye edildi!`,
    });
  } catch (error) {
    console.error('[SHOP_GIFT_ERROR]', error);
    return json({ error: 'Hediye gönderme işlemi sırasında bir sunucu hatası oluştu.' }, 500);
  }
}

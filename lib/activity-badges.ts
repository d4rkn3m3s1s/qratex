import { prisma } from '@/lib/prisma';
import { creditBadgeRewardInTx } from '@/lib/badge-reward-points';
import { EMOJI_BADGE_TEXTS } from '@/lib/emoji-badge-texts';

/**
 * DAVRANIŞSAL (aktivite) ROZET ATAMA — metin analizi YOK, saf sayaç/zaman verisi.
 *
 * [[emoji-badge-texts]] içindeki `kind: 'behavioral'` rozetlerinden, mevcut veriyle
 * GERÇEKTEN tespit edilebilenleri atar. Tespit edilemeyenler (aşağıda) bilinçli olarak
 * DIŞARIDA bırakılmıştır — uydurma kural yazmak yerine eksik veri açıkça belgelenir.
 *
 * ── ŞU AN UYGULANAMAYANLAR (veri yok) ─────────────────────────────────
 *  • Beğeni/etkileşim gerektirenler: Beğeni Perisi, Mücevher, Katalizör, İlham Kaynağı,
 *    Kelime Büyücüsü, Keskin Nişancı → kullanıcı yorumlarına REAKSİYON MODELİ YOK
 *    (şemada yalnız TaskCommentReaction var, o ekip görevleri için).
 *  • Sessiz Sinema (yorum=0 + kullanım logu), Hızlı ve Öfkeli (session verisi),
 *    Tur Rehberi/Tetikçi (yorumlara yanıt / "ilk yorum" ilişkisi) → gerekli ilişki/log yok.
 *  Bunlar için önce ilgili modeller/olaylar eklenmeli.
 *
 * ── EKONOMİ İNVARYANTLARI ([[points-economy-invariants]]) ─────────────
 *  • createMany + skipDuplicates → aynı rozet iki kez verilemez (unique guard).
 *  • Ödül puanı YALNIZ count>0 iken, AYNI tx'te kredilenir (kısmi durum yok).
 *  • Her kredi points_credited analytics olayı yazar (anti-fraud görünürlüğü).
 *  • Fonksiyon idempotenttir: tekrar çalıştırmak puan çoğaltmaz.
 */

/** Bir kullanıcının toplam yorum sayısı (Feedback + ConsumptionReview, silinmişler hariç). */
async function totalReviewCount(userId: string): Promise<number> {
  const [fb, cr] = await Promise.all([
    prisma.feedback.count({ where: { userId, deletedAt: null } }),
    prisma.consumptionReview.count({ where: { customerId: userId } }),
  ]);
  return fb + cr;
}

/** Kullanıcının ortalama yorum uzunluğu (kelime) — Filozof için (içerik-bazlı ama basit metrik). */
async function averageWordCount(userId: string): Promise<{ avgWords: number; sample: number }> {
  const [fbs, crs] = await Promise.all([
    prisma.feedback.findMany({
      where: { userId, deletedAt: null, text: { not: null } },
      select: { text: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.consumptionReview.findMany({
      where: { customerId: userId, text: { not: null } },
      select: { text: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const texts = [...fbs, ...crs].map((r) => r.text ?? '').filter((t) => t.trim().length > 0);
  if (texts.length === 0) return { avgWords: 0, sample: 0 };
  const totalWords = texts.reduce((sum, t) => sum + t.trim().split(/\s+/).length, 0);
  return { avgWords: totalWords / texts.length, sample: texts.length };
}

/** Yorumlardaki emoji oranı — Emoji Ustası için. */
async function emojiRatio(userId: string): Promise<{ ratio: number; sample: number }> {
  const [fbs, crs] = await Promise.all([
    prisma.feedback.findMany({
      where: { userId, deletedAt: null, text: { not: null } },
      select: { text: true }, take: 100, orderBy: { createdAt: 'desc' },
    }),
    prisma.consumptionReview.findMany({
      where: { customerId: userId, text: { not: null } },
      select: { text: true }, take: 100, orderBy: { createdAt: 'desc' },
    }),
  ]);
  const texts = [...fbs, ...crs].map((r) => r.text ?? '').filter((t) => t.trim().length > 0);
  if (texts.length === 0) return { ratio: 0, sample: 0 };
  // Emoji aralıkları (yaygın blokları kapsar).
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
  let withEmoji = 0;
  for (const t of texts) if (emojiRe.test(t)) withEmoji++;
  return { ratio: withEmoji / texts.length, sample: texts.length };
}

/** Metin benzerlik oranı (Copy-CV): aynı ilk-40-karakterle başlayan yorum oranı. */
async function repetitionRatio(userId: string): Promise<{ ratio: number; sample: number }> {
  const [fbs, crs] = await Promise.all([
    prisma.feedback.findMany({
      where: { userId, deletedAt: null, text: { not: null } },
      select: { text: true }, take: 100, orderBy: { createdAt: 'desc' },
    }),
    prisma.consumptionReview.findMany({
      where: { customerId: userId, text: { not: null } },
      select: { text: true }, take: 100, orderBy: { createdAt: 'desc' },
    }),
  ]);
  const texts = [...fbs, ...crs]
    .map((r) => (r.text ?? '').trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((t) => t.length >= 10);
  if (texts.length < 4) return { ratio: 0, sample: texts.length };
  const keys = new Map<string, number>();
  for (const t of texts) {
    const k = t.slice(0, 40);
    keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  const duplicates = [...keys.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);
  return { ratio: duplicates / texts.length, sample: texts.length };
}

/** Eşikler — tek yerden ayarlanabilir. */
export const ACTIVITY_BADGE_THRESHOLDS = {
  ustaYorumcu: 20,
  efsane: 50,
  tahtSahibi: 100,
  yorumMakinesiPerMonth: 12,     // aylık yorum sıklığı (yüksek frekans)
  filozofAvgWords: 100,          // ortalama 100+ kelime
  filozofMinSample: 3,           // en az 3 yorum olsun (tek uzun yorum yetmesin)
  emojiRatio: 0.6,               // yorumların %60+'sında emoji
  emojiMinSample: 5,
  copyCvRatio: 0.5,              // yorumların %50+'si tekrar
  copyCvMinSample: 4,
  hayaletInactiveDays: 30,       // 1-2 yorum + 30 gün sessizlik
  nostaljiGapDays: 60,           // 60 gün ara sonrası dönüş
  firtinaBurstCount: 5,          // 1 saatte 5+ yorum
  filizMemberDays: 30,           // <30 gün üyelik
  filizMinReviews: 5,            // + hızlı katkı
  konukOyuncuMinDays: 120,       // uzun üyelik
  konukOyuncuMaxPerMonth: 1.5,   // seyrek ama düzenli
} as const;

export type ActivityBadgeAwardResult = { badgeId: string; points: number }[];

/**
 * Kullanıcı için hak edilen davranışsal rozetleri atar (idempotent).
 * Yorum sonrası veya cron'dan çağrılabilir.
 */
export async function awardActivityBadges(userId: string): Promise<ActivityBadgeAwardResult> {
  const awarded: ActivityBadgeAwardResult = [];
  try {
    const T = ACTIVITY_BADGE_THRESHOLDS;

    // Zaten sahip olunan rozetleri bir kez çek (gereksiz iş yapma).
    const owned = new Set(
      (await prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } }))
        .map((b) => b.badgeId)
    );

    const candidates: string[] = [];
    const total = await totalReviewCount(userId);

    // ── Sayaç eşikleri (kümülatif) ────────────────────────────────────
    if (total >= 1) candidates.push('badge-yeni-ses');
    if (total >= T.ustaYorumcu) candidates.push('badge-usta-yorumcu');
    if (total >= T.efsane) candidates.push('badge-efsane');
    if (total >= T.tahtSahibi) candidates.push('badge-taht-sahibi');

    // Aday kalmadıysa erken çık (yeni kullanıcıda tek sorgu yeter).
    const fresh = candidates.filter((id) => !owned.has(id));

    // ── Zaman/desen bazlı kurallar (yalnız gerekiyorsa sorgula) ───────
    const needTimeline =
      !owned.has('badge-yorum-makinesi') || !owned.has('badge-hayalet-yorumcu') ||
      !owned.has('badge-nostalji') || !owned.has('badge-firtina') ||
      !owned.has('badge-filiz') || !owned.has('badge-konuk-oyuncu');

    if (needTimeline && total > 0) {
      const [fbDates, crDates, user] = await Promise.all([
        prisma.feedback.findMany({
          where: { userId, deletedAt: null }, select: { createdAt: true },
          orderBy: { createdAt: 'desc' }, take: 500,
        }),
        prisma.consumptionReview.findMany({
          where: { customerId: userId }, select: { createdAt: true },
          orderBy: { createdAt: 'desc' }, take: 500,
        }),
        prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      ]);
      const dates = [...fbDates, ...crDates]
        .map((d) => d.createdAt.getTime())
        .sort((a, b) => b - a); // yeniden eskiye

      if (dates.length > 0 && user) {
        const now = Date.now();
        const DAY = 86_400_000;
        const lastAt = dates[0];
        const daysSinceLast = (now - lastAt) / DAY;
        const memberDays = Math.max(1, (now - user.createdAt.getTime()) / DAY);
        const perMonth = (dates.length / memberDays) * 30;

        // Yorum Makinesi: yüksek aylık frekans + hâlâ aktif
        if (!owned.has('badge-yorum-makinesi') && perMonth >= T.yorumMakinesiPerMonth && daysSinceLast <= 14) {
          fresh.push('badge-yorum-makinesi');
        }
        // Hayalet Yorumcu: 1-2 yorum + uzun sessizlik
        if (!owned.has('badge-hayalet-yorumcu') && dates.length <= 2 && daysSinceLast >= T.hayaletInactiveDays) {
          fresh.push('badge-hayalet-yorumcu');
        }
        // Nostalji: iki yorum arasında uzun boşluk (dönüş yapmış)
        if (!owned.has('badge-nostalji') && dates.length >= 2) {
          const gapDays = (dates[0] - dates[1]) / DAY;
          if (gapDays >= T.nostaljiGapDays) fresh.push('badge-nostalji');
        }
        // Fırtına: 1 saatlik pencerede yoğun yorum patlaması
        if (!owned.has('badge-firtina') && dates.length >= T.firtinaBurstCount) {
          const HOUR = 3_600_000;
          let burst = false;
          for (let i = 0; i + T.firtinaBurstCount - 1 < dates.length; i++) {
            if (dates[i] - dates[i + T.firtinaBurstCount - 1] <= HOUR) { burst = true; break; }
          }
          if (burst) fresh.push('badge-firtina');
        }
        // Filiz: yeni üye + hızlı katkı
        if (!owned.has('badge-filiz') && memberDays < T.filizMemberDays && dates.length >= T.filizMinReviews) {
          fresh.push('badge-filiz');
        }
        // Konuk Oyuncu: uzun üyelik + seyrek ama süregelen katkı
        if (!owned.has('badge-konuk-oyuncu') && memberDays >= T.konukOyuncuMinDays
            && perMonth > 0 && perMonth <= T.konukOyuncuMaxPerMonth && dates.length >= 3) {
          fresh.push('badge-konuk-oyuncu');
        }
      }
    }

    // ── Metin metrikleri (basit, AI gerektirmez) ──────────────────────
    if (!owned.has('badge-filozof') && total >= ACTIVITY_BADGE_THRESHOLDS.filozofMinSample) {
      const { avgWords, sample } = await averageWordCount(userId);
      if (sample >= T.filozofMinSample && avgWords >= T.filozofAvgWords) fresh.push('badge-filozof');
    }
    if (!owned.has('badge-emoji-ustasi') && total >= T.emojiMinSample) {
      const { ratio, sample } = await emojiRatio(userId);
      if (sample >= T.emojiMinSample && ratio >= T.emojiRatio) fresh.push('badge-emoji-ustasi');
    }
    if (!owned.has('badge-copy-cv') && total >= T.copyCvMinSample) {
      const { ratio, sample } = await repetitionRatio(userId);
      if (sample >= T.copyCvMinSample && ratio >= T.copyCvRatio) fresh.push('badge-copy-cv');
    }

    // ── Atama: her rozet ATOMİK + ödülü aynı tx'te ────────────────────
    const uniqueFresh = [...new Set(fresh)];
    if (uniqueFresh.length === 0) return awarded;

    // Katalog kontrolü TEK sorguda (rozet başına findUnique = gereksiz N+1 idi).
    const existing = new Map(
      (await prisma.badge.findMany({
        where: { id: { in: uniqueFresh } },
        select: { id: true, name: true },
      })).map((b) => [b.id, b])
    );

    for (const badgeId of uniqueFresh) {
      const exists = existing.get(badgeId); // katalogda yoksa FK hatası verirdi
      if (!exists) continue;

      // `created`: rozet BU çağrıda mı verildi (yarışta kaybettiysek false).
      // Puan ayrı tutulur — ödülü 0 olan rozet de "verildi" sayılmalı.
      const outcome = await prisma.$transaction(async (tx) => {
        const res = await tx.userBadge.createMany({
          data: [{ userId, badgeId }],
          skipDuplicates: true, // unique guard → çift veremez
        });
        if (res.count === 0) return { created: false, points: 0 }; // yarış → puan BASILMAZ
        const p = await creditBadgeRewardInTx(tx as never, { userId, badgeId, justCreated: true });
        return { created: true, points: p };
      }).catch((e: unknown) => {
        // Sessiz yutma yok: tx rollback olduğu için durum tutarlı (rozet de verilmedi),
        // ama sebebi görünür olmalı — aksi halde rozet hiç gelmez ve kimse fark etmez.
        console.error('[ACTIVITY_BADGE] award tx failed:', badgeId, e);
        return { created: false, points: 0 };
      });

      if (outcome.created) {
        const points = outcome.points;
        awarded.push({ badgeId, points });
        const text = EMOJI_BADGE_TEXTS[badgeId];
        await prisma.notification.create({
          data: {
            userId,
            type: 'badge',
            title: '🏅 Yeni rozet kazandın!',
            message: text?.quote ?? `Yeni bir rozet açıldı: ${exists.name}`,
            data: { kind: 'activity-badge', badgeId, href: '/customer/badges' } as object,
          },
        }).catch(() => {});
      }
    }

    return awarded;
  } catch (err) {
    console.error('[ACTIVITY_BADGE] award failed:', err);
    return [];
  }
}

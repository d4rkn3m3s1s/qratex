/**
 * Davranışsal (aktivite) rozet kuralları — TEK kaynak (saf; Prisma/DOM yok).
 *
 * Oyunlaştırma-ekonomi O3 ("rozet motorları çelişiyor; kullanıcıya yanlış kural anlatılıyor"):
 * aynı rozet iki motorda farklı anlamdaydı — örn. Fırtına tohum kaydında "7 gün üst üste"
 * (`requirement.type: 'streak'`, sürpriz motoru giriş serisiyle verebiliyordu), davranış
 * motorunda "1 saatte 5+ yorum patlaması"; Usta Yorumcu katalogda "50 geri bildirim", motorda 20.
 * Müşteri koleksiyonunda DB'deki eski tohum açıklaması gösteriliyordu.
 *
 * Kural: buradaki rozetlerin TEK sahibi `lib/activity-badges.ts`'tir. Sürpriz motoru
 * (`lib/surprise-badges.ts`) bu kimlikleri değerlendirmez; koleksiyon açıklaması bu
 * dosyadaki eşiklerden üretilir (eşik değişince metin de değişir).
 */

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

const T = ACTIVITY_BADGE_THRESHOLDS;
const pct = (r: number) => `%${Math.round(r * 100)}`;

/** Davranış motorunun verdiği rozetler ve müşteriye anlatılan GERÇEK kural (yorum = QR + ziyaret yorumu). */
export const ACTIVITY_BADGE_RULES: Readonly<Record<string, string>> = {
  'badge-yeni-ses': 'İlk yorumunu bıraktın.',
  'badge-usta-yorumcu': `Toplam ${T.ustaYorumcu} yoruma ulaştın.`,
  'badge-efsane': `Toplam ${T.efsane} yoruma ulaştın.`,
  'badge-taht-sahibi': `Toplam ${T.tahtSahibi} yoruma ulaştın.`,
  'badge-yorum-makinesi': `Ayda ortalama ${T.yorumMakinesiPerMonth}+ yorum yazıyorsun ve son 14 günde aktifsin.`,
  'badge-hayalet-yorumcu': `Bir iki yorum bırakıp ${T.hayaletInactiveDays} gün sessiz kaldın.`,
  'badge-nostalji': `${T.nostaljiGapDays} günlük bir aradan sonra yeniden yorum yazdın.`,
  'badge-firtina': `Bir saat içinde ${T.firtinaBurstCount}+ yorum bıraktın.`,
  'badge-filiz': `Üyeliğinin ilk ${T.filizMemberDays} gününde ${T.filizMinReviews}+ yorum yazdın.`,
  'badge-konuk-oyuncu': `${T.konukOyuncuMinDays}+ gündür üyesin; seyrek ama düzenli yorum yazıyorsun.`,
  'badge-filozof': `Yorumlarının ortalaması ${T.filozofAvgWords}+ kelime (en az ${T.filozofMinSample} yorum).`,
  'badge-emoji-ustasi': `Yorumlarının ${pct(T.emojiRatio)}'ından fazlasında emoji var (en az ${T.emojiMinSample} yorum).`,
  'badge-copy-cv': `Yorumlarının ${pct(T.copyCvRatio)}'ı birbirine çok benziyor (en az ${T.copyCvMinSample} yorum).`,
};

export const ACTIVITY_BADGE_IDS: ReadonlySet<string> = new Set(Object.keys(ACTIVITY_BADGE_RULES));

/** Davranış motorunun rozetiyse gerçek kural metni, değilse null. */
export function activityBadgeRuleText(badgeId: string): string | null {
  return ACTIVITY_BADGE_RULES[badgeId] ?? null;
}

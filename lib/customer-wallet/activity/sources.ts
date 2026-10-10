/**
 * Puan defteri kaynak sözlüğü — SAF modül (sunucu + istemci ortak; React/Prisma yok).
 *
 * `PointsLedger.source` ve eski `points_credited` olaylarının `data.source` / `category`
 * değerleri buradaki gruplara eşlenir. Filtre (sunucu) ve etiket/ikon (istemci) aynı
 * tablodan beslenir; bilinmeyen kaynak "Diğer" olarak görünür, hiçbir satır kaybolmaz.
 */

export const SOURCE_GROUPS = ['feedback', 'visit', 'game', 'mission', 'social', 'bonus', 'spend', 'adjust'] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number];

/** Grup → defterde o gruba sayılan ham kaynak adları (sunucu filtresi bunu kullanır). */
export const GROUP_SOURCES: Readonly<Record<SourceGroup, readonly string[]>> = {
  feedback: ['feedback', 'review', 'consumption_review', 'rating_fallback'],
  visit: ['consumption', 'dealer_passive', 'consumption_passive'],
  game: ['game', 'game_streak', 'tournament', 'spin'],
  mission: [
    'quest',
    'badge',
    'character',
    'collection',
    'visit_mission',
    'seasonal',
    'seasonal_event',
    'seasonal_challenge',
    'event',
  ],
  social: ['referral', 'referral_milestone', 'squad', 'squad_battle', 'squad_escrow', 'squad_escrow_refund', 'gift'],
  bonus: ['streak', 'login_streak', 'birthday', 'surprise', 'remedy', 'automation', 'risk_segment_campaign'],
  spend: ['shop', 'reward', 'donation', 'badge_unlock', 'spend', 'purchase'],
  adjust: ['admin_adjust', 'reversal', 'opening_balance'],
};

const SOURCE_TO_GROUP: ReadonlyMap<string, SourceGroup> = new Map(
  SOURCE_GROUPS.flatMap((g) => GROUP_SOURCES[g].map((s) => [s, g] as const)),
);

export function groupOfSource(source: string | null | undefined): SourceGroup | 'other' {
  if (!source) return 'other';
  return SOURCE_TO_GROUP.get(source) ?? 'other';
}

export function isSourceGroup(value: unknown): value is SourceGroup {
  return typeof value === 'string' && (SOURCE_GROUPS as readonly string[]).includes(value);
}

type Label = { tr: string; en: string };

export const GROUP_LABELS: Readonly<Record<SourceGroup | 'other', Label>> = {
  feedback: { tr: 'Geri bildirim', en: 'Feedback' },
  visit: { tr: 'Ziyaret', en: 'Visits' },
  game: { tr: 'Oyun', en: 'Games' },
  mission: { tr: 'Görev ve rozet', en: 'Quests & badges' },
  social: { tr: 'Davet ve klan', en: 'Invites & squads' },
  bonus: { tr: 'Bonus', en: 'Bonuses' },
  spend: { tr: 'Harcama', en: 'Spending' },
  adjust: { tr: 'Düzeltme', en: 'Adjustments' },
  other: { tr: 'Diğer', en: 'Other' },
};

/** Kaynak bazında daha özel başlık (yoksa grup etiketi kullanılır). */
const SOURCE_LABELS: Readonly<Record<string, Label>> = {
  feedback: { tr: 'Geri bildirim ödülü', en: 'Feedback reward' },
  review: { tr: 'Ziyaret yorumu ödülü', en: 'Visit review reward' },
  consumption_review: { tr: 'Ziyaret yorumu ödülü', en: 'Visit review reward' },
  consumption: { tr: 'Ziyaret puanı', en: 'Visit points' },
  dealer_passive: { tr: 'Ziyaret puanı', en: 'Visit points' },
  consumption_passive: { tr: 'Ziyaret puanı', en: 'Visit points' },
  game: { tr: 'Oyun ödülü', en: 'Game reward' },
  game_streak: { tr: 'Oyun serisi bonusu', en: 'Game streak bonus' },
  tournament: { tr: 'Turnuva ödülü', en: 'Tournament prize' },
  spin: { tr: 'Günlük çark', en: 'Daily spin' },
  quest: { tr: 'Görev ödülü', en: 'Quest reward' },
  badge: { tr: 'Rozet ödülü', en: 'Badge reward' },
  character: { tr: 'Karakter rozeti ödülü', en: 'Character badge reward' },
  collection: { tr: 'Koleksiyon ödülü', en: 'Collection reward' },
  visit_mission: { tr: 'Ziyaret görevi', en: 'Visit mission' },
  seasonal: { tr: 'Sezon etkinliği', en: 'Seasonal event' },
  seasonal_event: { tr: 'Sezon etkinliği', en: 'Seasonal event' },
  seasonal_challenge: { tr: 'Sezon görevi', en: 'Seasonal challenge' },
  event: { tr: 'Etkinlik ödülü', en: 'Event reward' },
  referral: { tr: 'Davet ödülü', en: 'Referral reward' },
  referral_milestone: { tr: 'Davet kademe ödülü', en: 'Referral milestone' },
  squad: { tr: 'Klan ödülü', en: 'Squad reward' },
  squad_battle: { tr: 'Klan savaşı', en: 'Squad battle' },
  squad_escrow: { tr: 'Klan savaşı katılımı', en: 'Squad battle stake' },
  squad_escrow_refund: { tr: 'Klan savaşı iadesi', en: 'Squad battle refund' },
  gift: { tr: 'Hediye', en: 'Gift' },
  streak: { tr: 'Seri bonusu', en: 'Streak bonus' },
  login_streak: { tr: 'Giriş serisi bonusu', en: 'Login streak bonus' },
  birthday: { tr: 'Doğum günü hediyesi', en: 'Birthday gift' },
  surprise: { tr: 'Sürpriz kutu', en: 'Surprise box' },
  remedy: { tr: 'Telafi puanı', en: 'Make-good points' },
  automation: { tr: 'Kampanya puanı', en: 'Campaign points' },
  risk_segment_campaign: { tr: 'Kampanya puanı', en: 'Campaign points' },
  shop: { tr: 'Mağaza alışverişi', en: 'Shop purchase' },
  reward: { tr: 'Ödül kullanımı', en: 'Reward redemption' },
  donation: { tr: 'Bağış', en: 'Donation' },
  badge_unlock: { tr: 'Rozet kilidi açma', en: 'Badge unlock' },
  spend: { tr: 'Harcama', en: 'Spending' },
  purchase: { tr: 'Satın alma', en: 'Purchase' },
  admin_adjust: { tr: 'Hesap düzeltmesi', en: 'Account adjustment' },
  reversal: { tr: 'Geri alma', en: 'Reversal' },
  opening_balance: { tr: 'Açılış bakiyesi', en: 'Opening balance' },
};

export function sourceLabel(source: string | null | undefined, locale: 'tr' | 'en' = 'tr'): string {
  const own = source ? SOURCE_LABELS[source] : undefined;
  if (own) return own[locale];
  return GROUP_LABELS[groupOfSource(source)][locale];
}

/** Ham kaynak adı güvenli mi (sorgu girdisi değil; yalnız gösterim). */
export function normalizeSource(raw: unknown): string {
  if (typeof raw !== 'string') return 'other';
  const s = raw.trim().toLowerCase();
  return /^[a-z][a-z0-9_]{0,47}$/.test(s) ? s : 'other';
}

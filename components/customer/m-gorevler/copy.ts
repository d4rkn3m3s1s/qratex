/**
 * Görevler ekranı metinleri (TR/EN). Uygulama dilini DS kaynağından izler (`useDsLocale`);
 * sunucu metin değil KOD döndürür (mekanik, durum, hata kodu), dil burada seçilir.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';
import type { QuestClaimErrorCode, QuestCtaKind, QuestGroup, QuestMechanic } from './types';

type Copy = {
  title: string;
  description: string;
  refresh: string;
  refreshing: string;
  groups: Record<QuestGroup, string>;
  groupHint: Record<QuestGroup, string>;
  groupsAria: string;
  heroDaily: (done: number, total: number) => string;
  heroNoDaily: string;
  dayEnds: string;
  weekEnds: string;
  monthEnds: string;
  streakLabel: string;
  streakAtRisk: string;
  streakSafe: string;
  streakNone: string;
  pendingTitle: string;
  pendingNone: string;
  claimAll: (n: number) => string;
  claim: string;
  claimAria: (name: string) => string;
  claiming: string;
  claimed: string;
  autoRewarded: string;
  autoNote: string;
  inProgress: string;
  completed: string;
  progressAria: (name: string, p: number, t: number) => string;
  points: (n: string) => string;
  xp: (n: string) => string;
  details: string;
  detailsAria: (name: string) => string;
  howTo: string;
  mechanics: Record<QuestMechanic, string>;
  cta: Record<QuestCtaKind, string>;
  endsIn: string;
  claimUntil: string;
  resetNote: Record<'daily' | 'weekly' | 'monthly' | 'once', string>;
  claimedSection: (n: number) => string;
  emptyTitle: string;
  emptyDescription: string;
  emptyGroup: string;
  disabledTitle: string;
  disabledDescription: string;
  errors: Record<QuestClaimErrorCode | 'GENERIC' | 'RATE_LIMITED' | 'OFFLINE', string>;
  toastClaimed: (name: string, points: string) => string;
  toastClaimedAll: (count: number, points: string) => string;
  toastNothing: string;
  toastSkipped: (n: number) => string;
  season: {
    title: string;
    endsIn: string;
    goal: Record<'games_played' | 'reviews_written', (goal: number) => string>;
    reward: (points: string) => string;
    badge: string;
    claim: string;
    claimed: string;
    open: string;
    failed: string;
    done: (points: string) => string;
  };
  close: string;
};

const TR: Copy = {
  title: 'Görevler',
  description: 'Günlük ve haftalık hedefleri tamamla, ödülünü al.',
  refresh: 'Görevleri yenile',
  refreshing: 'Yenileniyor',
  groups: { daily: 'Bugün', weekly: 'Bu hafta', monthly: 'Bu ay', season: 'Sezon' },
  groupHint: {
    daily: 'Her gece 00:00’da (İstanbul) yenilenir.',
    weekly: 'Her pazartesi 00:00’da (İstanbul) yenilenir.',
    monthly: 'Her ayın 1’inde 00:00’da (İstanbul) yenilenir.',
    season: 'Tek seferlik ve özel görevler. Bazıları tamamlanınca ödülünü kendiliğinden verir.',
  },
  groupsAria: 'Görev grupları',
  heroDaily: (d, t) => `Bugünün görevleri: ${d}/${t}`,
  heroNoDaily: 'Bugün için günlük görev yok',
  dayEnds: 'Gün sonuna',
  weekEnds: 'Hafta sonuna',
  monthEnds: 'Ay sonuna',
  streakLabel: 'Yorum serisi',
  streakAtRisk: 'Bugün bir yorum yaz, serin bozulmasın.',
  streakSafe: 'Bugünkü yorumun yazıldı.',
  streakNone: 'Bugün bir yorum yazarak seri başlat.',
  pendingTitle: 'Bekleyen ödül',
  pendingNone: 'Bekleyen ödül yok',
  claimAll: (n) => (n > 1 ? `Hepsini al (${n})` : 'Ödülü al'),
  claim: 'Ödülü al',
  claimAria: (name) => `${name} görevinin ödülünü al`,
  claiming: 'Alınıyor…',
  claimed: 'Alındı',
  autoRewarded: 'Otomatik verildi',
  autoNote: 'Bu görevin ödülü tamamlandığında hesabına kendiliğinden işlenir; ayrıca almana gerek yok.',
  inProgress: 'Devam ediyor',
  completed: 'Tamamlandı',
  progressAria: (name, p, t) => `${name}: ${p}/${t}`,
  points: (n) => `${n} puan`,
  xp: (n) => `${n} XP`,
  details: 'Ayrıntı',
  detailsAria: (name) => `${name} görevinin ayrıntıları`,
  howTo: 'Nasıl ilerlerim?',
  mechanics: {
    give_feedback: 'Bir işletmenin QR kodunu okut ya da tüketimini yorumla. Her geri bildirim 1 sayılır.',
    feedback_with_photo: 'QR geri bildirimine en az bir fotoğraf ekle.',
    detailed_feedback: 'En az 100 karakterlik bir yorum yaz (QR geri bildirimi ya da tüketim yorumu).',
    visit_businesses: 'Farklı işletmelere geri bildirim ver ya da kartınla alışveriş yap. Her işletme bir kez sayılır.',
    referral: 'Davet kodunla katılan bir arkadaşın ilk etkileşimini tamamladığında sayılır.',
    visit_category: 'Kartınla farklı işletmelerde alışveriş yap. Her yeni işletme ilerletir; tamamlanınca ödül kendiliğinden gelir.',
    achievement: 'Görevdeki işlemi yaptığında ilerler; tamamlanınca ödül kendiliğinden gelir.',
    custom: 'Bu görevin ilerlemesi ekip tarafından işlenir.',
  },
  cta: {
    scan: 'QR okut',
    nearby: 'Yakındaki işletmeler',
    referral: 'Arkadaşını davet et',
    shop: 'Mağazaya git',
    settings: 'Profil ayarları',
  },
  endsIn: 'Bitişe',
  claimUntil: 'Ödülü şu tarihe kadar al:',
  resetNote: {
    daily: 'Günlük görev: ödülü gün bitmeden al; gece yarısı ilerleme sıfırlanır.',
    weekly: 'Haftalık görev: ödülü pazartesi 00:00’dan önce al.',
    monthly: 'Aylık görev: ödülü ay bitmeden al.',
    once: 'Tek seferlik görev.',
  },
  claimedSection: (n) => `Tamamlananlar (${n})`,
  emptyTitle: 'Şu an aktif görev yok',
  emptyDescription: 'Yeni görevler yayınlandığında burada görünecek. Bu arada QR okutup yorum yazarak puan kazanabilirsin.',
  emptyGroup: 'Bu grupta görev yok.',
  disabledTitle: 'Görevler şu an kapalı',
  disabledDescription: 'Bu özellik yönetici tarafından geçici olarak kapatıldı. Puanların ve ilerlemen korunuyor.',
  errors: {
    QUEST_NOT_FOUND: 'Bu görev artık aktif değil.',
    QUEST_EXPIRED: 'Görevin süresi ve ödül alma penceresi doldu.',
    QUEST_AUTO_REWARDED: 'Bu görevin ödülü otomatik olarak verildi.',
    QUEST_NOT_TRACKED: 'Bu görev henüz tamamlanmış görünmüyor.',
    QUEST_NOT_COMPLETED: 'Görev henüz tamamlanmadı.',
    QUEST_ALREADY_CLAIMED: 'Bu ödülü bu dönem zaten aldın.',
    QUEST_CLAIM_FAILED: 'Bazı ödüller alınamadı. Lütfen tekrar dene.',
    RATE_LIMITED: 'Çok hızlı denedin. Birkaç saniye sonra tekrar dene.',
    OFFLINE: 'İnternet bağlantın yok gibi görünüyor.',
    GENERIC: 'Ödül şu an alınamadı. Lütfen tekrar dene.',
  },
  toastClaimed: (name, p) => `${name}: +${p} puan hesabında.`,
  toastClaimedAll: (c, p) => `${c} görevin ödülü alındı: +${p} puan.`,
  toastNothing: 'Alınacak ödül kalmamış.',
  toastSkipped: (n) => `${n} ödül alınamadı; liste güncellendi.`,
  season: {
    title: 'Sezon etkinliği',
    endsIn: 'Etkinlik bitişine',
    goal: {
      games_played: (g) => `Etkinlik süresince ${g} oyun tamamla.`,
      reviews_written: (g) => `Etkinlik süresince ${g} tüketim yorumu yaz.`,
    },
    reward: (p) => `+${p} puan`,
    badge: 'Özel rozet',
    claim: 'Etkinlik ödülünü al',
    claimed: 'Etkinlik ödülü alındı',
    open: 'Etkinliğe git',
    failed: 'Etkinlik ödülü alınamadı. Lütfen tekrar dene.',
    done: (p) => (p === '0' ? 'Etkinlik ödülün hesabında.' : `Etkinlik ödülü: +${p} puan.`),
  },
  close: 'Kapat',
};

const EN: Copy = {
  title: 'Quests',
  description: 'Complete daily and weekly goals and collect your rewards.',
  refresh: 'Refresh quests',
  refreshing: 'Refreshing',
  groups: { daily: 'Today', weekly: 'This week', monthly: 'This month', season: 'Season' },
  groupHint: {
    daily: 'Resets every night at 00:00 (Istanbul).',
    weekly: 'Resets every Monday at 00:00 (Istanbul).',
    monthly: 'Resets on the 1st of each month at 00:00 (Istanbul).',
    season: 'One-time and special quests. Some pay out automatically when completed.',
  },
  groupsAria: 'Quest groups',
  heroDaily: (d, t) => `Today’s quests: ${d}/${t}`,
  heroNoDaily: 'No daily quests today',
  dayEnds: 'Day ends in',
  weekEnds: 'Week ends in',
  monthEnds: 'Month ends in',
  streakLabel: 'Review streak',
  streakAtRisk: 'Write a review today to keep your streak.',
  streakSafe: 'Today’s review is in.',
  streakNone: 'Write a review today to start a streak.',
  pendingTitle: 'Pending reward',
  pendingNone: 'No pending rewards',
  claimAll: (n) => (n > 1 ? `Claim all (${n})` : 'Claim reward'),
  claim: 'Claim reward',
  claimAria: (name) => `Claim the reward for ${name}`,
  claiming: 'Claiming…',
  claimed: 'Claimed',
  autoRewarded: 'Paid automatically',
  autoNote: 'This quest pays out automatically when completed; nothing to claim.',
  inProgress: 'In progress',
  completed: 'Completed',
  progressAria: (name, p, t) => `${name}: ${p}/${t}`,
  points: (n) => `${n} pts`,
  xp: (n) => `${n} XP`,
  details: 'Details',
  detailsAria: (name) => `Details for ${name}`,
  howTo: 'How do I progress?',
  mechanics: {
    give_feedback: 'Scan a venue’s QR code or review a purchase. Each piece of feedback counts once.',
    feedback_with_photo: 'Add at least one photo to a QR feedback.',
    detailed_feedback: 'Write a review of at least 100 characters (QR feedback or purchase review).',
    visit_businesses: 'Give feedback to or shop with your card at different venues. Each venue counts once.',
    referral: 'Counts when a friend who joined with your code completes their first interaction.',
    visit_category: 'Shop with your card at different venues. Each new venue counts; the reward pays out automatically.',
    achievement: 'Progresses when you do the action in the quest; the reward pays out automatically.',
    custom: 'This quest’s progress is recorded by the team.',
  },
  cta: {
    scan: 'Scan a QR',
    nearby: 'Venues nearby',
    referral: 'Invite a friend',
    shop: 'Go to shop',
    settings: 'Profile settings',
  },
  endsIn: 'Ends in',
  claimUntil: 'Claim the reward by:',
  resetNote: {
    daily: 'Daily quest: claim before the day ends; progress resets at midnight.',
    weekly: 'Weekly quest: claim before Monday 00:00.',
    monthly: 'Monthly quest: claim before the month ends.',
    once: 'One-time quest.',
  },
  claimedSection: (n) => `Completed (${n})`,
  emptyTitle: 'No active quests right now',
  emptyDescription: 'New quests will appear here when they are published. Meanwhile you can earn points by scanning QR codes and writing reviews.',
  emptyGroup: 'No quests in this group.',
  disabledTitle: 'Quests are turned off',
  disabledDescription: 'An administrator has temporarily disabled this feature. Your points and progress are kept.',
  errors: {
    QUEST_NOT_FOUND: 'This quest is no longer active.',
    QUEST_EXPIRED: 'This quest and its claim window have expired.',
    QUEST_AUTO_REWARDED: 'This quest’s reward was paid automatically.',
    QUEST_NOT_TRACKED: 'This quest doesn’t look completed yet.',
    QUEST_NOT_COMPLETED: 'Quest not completed yet.',
    QUEST_ALREADY_CLAIMED: 'You already claimed this reward for this period.',
    QUEST_CLAIM_FAILED: 'Some rewards could not be claimed. Please try again.',
    RATE_LIMITED: 'Too fast. Try again in a few seconds.',
    OFFLINE: 'You seem to be offline.',
    GENERIC: 'The reward could not be claimed. Please try again.',
  },
  toastClaimed: (name, p) => `${name}: +${p} points added.`,
  toastClaimedAll: (c, p) => `Claimed ${c} quest rewards: +${p} points.`,
  toastNothing: 'Nothing left to claim.',
  toastSkipped: (n) => `${n} rewards could not be claimed; the list was refreshed.`,
  season: {
    title: 'Seasonal event',
    endsIn: 'Event ends in',
    goal: {
      games_played: (g) => `Complete ${g} games during the event.`,
      reviews_written: (g) => `Write ${g} purchase reviews during the event.`,
    },
    reward: (p) => `+${p} pts`,
    badge: 'Special badge',
    claim: 'Claim event reward',
    claimed: 'Event reward claimed',
    open: 'Open event',
    failed: 'The event reward could not be claimed. Please try again.',
    done: (p) => (p === '0' ? 'Your event reward is in your account.' : `Event reward: +${p} points.`),
  },
  close: 'Close',
};

export type QuestCopy = Copy;

export function useQuestCopy(): { copy: Copy; locale: 'tr' | 'en' } {
  const locale = useDsLocale();
  return { copy: locale === 'en' ? EN : TR, locale };
}

export function formatCount(n: number, locale: 'tr' | 'en'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR').format(Math.max(0, Math.round(n)));
}

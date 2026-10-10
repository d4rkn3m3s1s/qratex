/**
 * Oyna → Lig metinleri (TR/EN), saf (sunucu ve istemci). İstemci kancası: `use-lig-copy.ts`.
 * Hitap: samimi "sen" (müşteri marka dili).
 */
import type { LeagueCategory, LeaguePeriod } from '@/lib/league-board/periods';

export type LigLocale = 'tr' | 'en';

type CategoryCopy = { label: string; unit: string; metric: string; ctaLabel: string; ctaHref: string };

export type LigCopy = {
  title: string;
  description: string;
  periodLabel: string;
  categoryLabel: string;
  period: Record<LeaguePeriod, string>;
  seasonN: (n: number) => string;
  category: Record<LeagueCategory, CategoryCopy>;
  yourLeague: string;
  leagueName: (name: string) => string;
  rankAria: (rank: number, total: number) => string;
  ofPlayers: (total: string, truncated: boolean) => string;
  rankFloor: (n: string) => string;
  notRanked: string;
  notRankedHint: (metric: string) => string;
  atTop: string;
  gapToNext: (amount: string, unit: string, targetRank: number) => string;
  gapToTop10: (amount: string, unit: string) => string;
  sinceLastVisitUp: (n: number) => string;
  sinceLastVisitDown: (n: number) => string;
  toNextLeague: (amount: string, league: string) => string;
  topLeague: string;
  balance: (points: string) => string;
  weekEndsIn: string;
  seasonEndsIn: string;
  podiumTitle: string;
  podiumEmpty: string;
  rankingTitle: string;
  you: string;
  hiddenBadge: string;
  hiddenBadgeTitle: string;
  level: (n: number) => string;
  rowAria: (rank: number, name: string, score: string, unit: string, isMe: boolean) => string;
  emptyTitle: string;
  emptyDescription: string;
  prev: string;
  next: string;
  pageOf: (p: number, n: number) => string;
  goToMe: string;
  stickyMe: (rank: string, score: string, unit: string) => string;
  lastWeekTitle: string;
  lastWeekEmpty: string;
  privacyTitle: string;
  privacySwitch: string;
  privacyOn: string;
  privacyOff: string;
  privacyNote: string;
  privacySaved: (visible: boolean) => string;
  privacyError: string;
  hiddenModeBanner: string;
  refreshing: string;
  moduleDisabledTitle: string;
  moduleDisabledDescription: string;
  errorTitle: string;
  errorDescription: string;
  rulesTitle: string;
  rules: string[];
};

const TR: LigCopy = {
  title: 'Lig',
  description: 'Bu hafta ve bu sezon nerede durduğunu gör, bir sonraki adımını bil.',
  periodLabel: 'Dönem',
  categoryLabel: 'Sıralama türü',
  period: { week: 'Bu hafta', season: 'Sezon', all: 'Tüm zamanlar' },
  seasonN: (n) => `Sezon ${n}`,
  category: {
    points: {
      label: 'Puan',
      unit: 'puan',
      metric: 'Dönem içinde kazandığın puan: yorum, oyun, rozet, görev ve davet ödülleri. İadeler ve yönetici düzeltmeleri sayılmaz. Tüm zamanlarda güncel bakiyen sayılır.',
      ctaLabel: 'Oyna, puan kazan',
      ctaHref: '/customer/games',
    },
    feedbacks: {
      label: 'Yorum',
      unit: 'yorum',
      metric: 'Dönem içinde yazdığın yorumlar. Silinen ve güven incelemesine takılan yorumlar sayılmaz.',
      ctaLabel: 'QR okut, yorum yaz',
      ctaHref: '/customer/scan',
    },
    badges: {
      label: 'Rozet',
      unit: 'rozet',
      metric: 'Dönem içinde kazandığın rozetler.',
      ctaLabel: 'Rozetlerini gör',
      ctaHref: '/customer/badges',
    },
    referrals: {
      label: 'Davet',
      unit: 'davet',
      metric: 'Dönem içinde tamamlanan davetlerin. Bekleyen ya da süresi dolan davetler sayılmaz.',
      ctaLabel: 'Arkadaşını davet et',
      ctaHref: '/customer/referral',
    },
  },
  yourLeague: 'Ligin',
  leagueName: (n) => `${n} ligi`,
  rankAria: (r, t) => `Sıran ${r}, toplam ${t} oyuncu`,
  ofPlayers: (t, tr) => `/ ${t}${tr ? '+' : ''} oyuncu`,
  rankFloor: (n) => `${n}+`,
  notRanked: 'Henüz sıralamada değilsin',
  notRankedHint: (m) => `Bu dönemde ilk ${m} kazandığında sıralamaya girersin.`,
  atTop: 'Zirvedesin. Yerini korumak için devam et.',
  gapToNext: (a, u, r) => `${r}. sıraya çıkmak için ${a} ${u}`,
  gapToTop10: (a, u) => `İlk 10'a girmek için ${a} ${u}`,
  sinceLastVisitUp: (n) => `Son ziyaretinden beri ${n} sıra yükseldin`,
  sinceLastVisitDown: (n) => `Son ziyaretinden beri ${n} sıra düştün`,
  toNextLeague: (a, l) => `${l} ligine ${a} puan kaldı`,
  topLeague: 'En üst ligdesin',
  balance: (p) => `Bakiye ${p} puan`,
  weekEndsIn: 'Hafta bitimine',
  seasonEndsIn: 'Sezon sonuna',
  podiumTitle: 'İlk üç',
  podiumEmpty: 'Bu basamak boş. İlk sen ol.',
  rankingTitle: 'Sıralama',
  you: 'Sen',
  hiddenBadge: 'Gizli',
  hiddenBadgeTitle: 'Bu satırı yalnız sen görüyorsun',
  level: (n) => `Sv. ${n}`,
  rowAria: (r, n, s, u, me) => `${r}. sıra, ${n}${me ? ' (sen)' : ''}, ${s} ${u}`,
  emptyTitle: 'Bu dönemde henüz kimse sıralamada değil',
  emptyDescription: 'Dönemin ilk skoru seninki olabilir.',
  prev: 'Önceki',
  next: 'Sonraki',
  pageOf: (p, n) => `Sayfa ${p} / ${n}`,
  goToMe: 'Sırama git',
  stickyMe: (r, s, u) => `Sen · ${r} · ${s} ${u}`,
  lastWeekTitle: 'Geçen haftanın ilk üçü',
  lastWeekEmpty: 'Geçen hafta bu türde sıralamaya giren olmadı.',
  privacyTitle: 'Gizlilik',
  privacySwitch: 'Sıralamada görün',
  privacyOn: 'Adın (soyadın baş harfiyle) ve fotoğrafın diğer oyuncuların listesinde görünür.',
  privacyOff: 'Gizli moddasın: başkalarının listesinde yoksun. Kendi sıranı yine görürsün.',
  privacyNote: 'Değişiklik diğer oyunculara en geç bir dakika içinde yansır.',
  privacySaved: (v) => (v ? 'Artık sıralamada görünüyorsun.' : 'Gizli moda geçtin.'),
  privacyError: 'Tercih kaydedilemedi. Lütfen tekrar dene.',
  hiddenModeBanner: 'Gizli moddasın: sıranı yalnız sen görüyorsun.',
  refreshing: 'Güncelleniyor',
  moduleDisabledTitle: 'Lig şu an kapalı',
  moduleDisabledDescription: 'Bu bölüm yönetici tarafından geçici olarak kapatıldı.',
  errorTitle: 'Sıralama yüklenemedi',
  errorDescription: 'Bağlantında ya da sunucuda geçici bir sorun var.',
  rulesTitle: 'Nasıl sayılıyor?',
  rules: [
    'Hafta, İstanbul saatiyle Pazartesi 00:00\'da başlar. Sezon 8 hafta sürer.',
    'Eşit skorda o skora daha önce ulaşan öndedir (tüm zamanlarda daha eski hesap).',
    'Lig, güncel puan bakiyene göre belirlenir.',
    'Güven incelemesindeki hesaplar başkalarının listesinde görünmez.',
  ],
};

const EN: LigCopy = {
  title: 'League',
  description: 'See where you stand this week and this season, and know your next step.',
  periodLabel: 'Period',
  categoryLabel: 'Ranking type',
  period: { week: 'This week', season: 'Season', all: 'All time' },
  seasonN: (n) => `Season ${n}`,
  category: {
    points: {
      label: 'Points',
      unit: 'pts',
      metric: 'Points you earned in the period: reviews, games, badges, quests and invite rewards. Refunds and admin corrections do not count. All time uses your current balance.',
      ctaLabel: 'Play and earn points',
      ctaHref: '/customer/games',
    },
    feedbacks: {
      label: 'Reviews',
      unit: 'reviews',
      metric: 'Reviews you wrote in the period. Deleted and trust-flagged reviews do not count.',
      ctaLabel: 'Scan a QR, write a review',
      ctaHref: '/customer/scan',
    },
    badges: {
      label: 'Badges',
      unit: 'badges',
      metric: 'Badges you earned in the period.',
      ctaLabel: 'See your badges',
      ctaHref: '/customer/badges',
    },
    referrals: {
      label: 'Invites',
      unit: 'invites',
      metric: 'Invites completed in the period. Pending or expired invites do not count.',
      ctaLabel: 'Invite a friend',
      ctaHref: '/customer/referral',
    },
  },
  yourLeague: 'Your league',
  leagueName: (n) => `${n} league`,
  rankAria: (r, t) => `Your rank ${r} of ${t} players`,
  ofPlayers: (t, tr) => `/ ${t}${tr ? '+' : ''} players`,
  rankFloor: (n) => `${n}+`,
  notRanked: 'You are not ranked yet',
  notRankedHint: (m) => `Earn your first ${m} this period to enter the ranking.`,
  atTop: 'You are on top. Keep going to hold your spot.',
  gapToNext: (a, u, r) => `${a} ${u} to reach #${r}`,
  gapToTop10: (a, u) => `${a} ${u} to enter the top 10`,
  sinceLastVisitUp: (n) => `Up ${n} since your last visit`,
  sinceLastVisitDown: (n) => `Down ${n} since your last visit`,
  toNextLeague: (a, l) => `${a} points to ${l} league`,
  topLeague: 'You are in the top league',
  balance: (p) => `Balance ${p} pts`,
  weekEndsIn: 'Week ends in',
  seasonEndsIn: 'Season ends in',
  podiumTitle: 'Top three',
  podiumEmpty: 'This spot is open. Be the first.',
  rankingTitle: 'Ranking',
  you: 'You',
  hiddenBadge: 'Hidden',
  hiddenBadgeTitle: 'Only you can see this row',
  level: (n) => `Lv. ${n}`,
  rowAria: (r, n, s, u, me) => `Rank ${r}, ${n}${me ? ' (you)' : ''}, ${s} ${u}`,
  emptyTitle: 'Nobody is ranked in this period yet',
  emptyDescription: 'The first score of the period could be yours.',
  prev: 'Previous',
  next: 'Next',
  pageOf: (p, n) => `Page ${p} of ${n}`,
  goToMe: 'Jump to me',
  stickyMe: (r, s, u) => `You · ${r} · ${s} ${u}`,
  lastWeekTitle: 'Last week’s top three',
  lastWeekEmpty: 'Nobody ranked in this category last week.',
  privacyTitle: 'Privacy',
  privacySwitch: 'Show me in rankings',
  privacyOn: 'Your name (with last initial) and photo appear in other players’ lists.',
  privacyOff: 'Hidden mode: you are not in other players’ lists. You still see your own rank.',
  privacyNote: 'Other players see the change within a minute.',
  privacySaved: (v) => (v ? 'You are visible in rankings again.' : 'Hidden mode is on.'),
  privacyError: 'Could not save your preference. Please try again.',
  hiddenModeBanner: 'Hidden mode: only you can see your rank.',
  refreshing: 'Updating',
  moduleDisabledTitle: 'League is unavailable',
  moduleDisabledDescription: 'This section has been temporarily turned off by an administrator.',
  errorTitle: 'Could not load the ranking',
  errorDescription: 'There is a temporary problem with your connection or our server.',
  rulesTitle: 'How it is counted',
  rules: [
    'The week starts Monday 00:00 Istanbul time. A season lasts 8 weeks.',
    'On equal scores, whoever reached the score first ranks higher (older account for all time).',
    'Your league follows your current points balance.',
    'Accounts under trust review do not appear in other players’ lists.',
  ],
};

export function getLigCopy(locale: LigLocale): LigCopy {
  return locale === 'en' ? EN : TR;
}

export function ligNumberFormat(locale: LigLocale): (n: number) => string {
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR');
  return (n: number) => nf.format(n);
}

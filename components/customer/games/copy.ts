/**
 * Mini oyun ortak arayüz metinleri (TR/EN): kabuk, liderlik, haftalık turnuva, oyun sayfası.
 * Oyun içerik havuzları (soru/kelime/yorum) ve oyuna özel `lib/minigame-copy` varyantları
 * Türkçe kalır; burada yalnız arayüz metinleri var. Uygulama dilini `useLocaleSafe` ile izler
 * (sağlayıcı dışında da çalışır: izole test/önizleme).
 */
import { useLocaleSafe } from '@/lib/app-locale';

export type GamesLocale = 'tr' | 'en';

const tr = {
  shell: {
    dailyResetNote: 'Yeni sıralı hak her gece 00:00’da (Türkiye saati) açılır',
    winTitle: 'Kazandın! 🎉',
    loseTitle: 'Bu sefer olmadı',
    practiceHint: 'Pratik: sınırsız, ödülsüz — liderliğe girmez.',
    rankedHint: 'Günde 1 hak — kazan, puan + XP kap!',
    pause: 'Oyunu duraklat',
    paused: 'Duraklatıldı',
    resume: 'Devam et',
    endRound: 'Turu bitir',
    endRoundConfirm: 'Eminim, bitir (deneme kullanılır)',
    endRoundRanked: 'Turu bitir (deneme kullanılır)',
    loadingSubmit: 'Sonuç kaydediliyor…',
    loadingStart: 'Oyun başlatılıyor…',
    startPractice: '▶ Pratik yap',
    startRanked: '▶ Oyna',
    controls: 'Kontroller:',
    scoreLabel: 'Skorun',
    practiceResult: 'Pratik turu — ödül ve liderlik yok. İstediğin kadar tekrar oyna.',
    reward: (points: number, xp: number) => `+${points} puan · +${xp} XP`,
    rewardMiss: (threshold: number | string) => `Ödül için ${threshold} skor gerekiyordu. Yarın yeni hakla tekrar dene!`,
    playAgain: 'Tekrar oyna',
    switchRanked: 'Sıralıya geç',
    comeBack: 'Yarın yeni bir hak için tekrar gel. 🌙',
    practiceNoReward: 'Pratik yap (ödülsüz)',
    lockedTitle: 'Bugünün oyununu oynadın',
    playPractice: 'Pratik modunda oyna',
    mode: 'Oyun modu',
    ranked: 'Sıralı',
    practice: 'Pratik',
    rankedUsed: 'Bugünkü hak kullanıldı',
    rankedHintShort: 'Günde 1 · ödüllü',
    practiceHintShort: 'Sınırsız · ödülsüz',
    soundOff: 'Oyun sesini kapat',
    soundOn: 'Oyun sesini aç',
    hapticsOff: 'Titreşimi kapat',
    hapticsOn: 'Titreşimi aç',
    practiceBadge: 'Pratik — ödülsüz',
    howToPlay: 'Nasıl oynanır?',
    next: 'Sıradaki',
    keyboard: 'Klavye:',
  },
  leaderboard: {
    loading: 'Liderlik yükleniyor…',
    failed: 'Liderlik tablosu şu an alınamadı.',
    retry: 'Tekrar dene',
    empty: 'Henüz skor yok — ilk rekoru sen kır! 🏁',
    title: 'Liderlik · tüm zamanlar',
    players: (n: string) => `${n} oyuncu`,
    youTag: '(sen)',
    you: 'Sen',
  },
  tournament: {
    claimFailed: 'Ödül alınamadı',
    claimed: (rank: number, points: number) => `🏆 ${rank}. oldun — +${points} puan!`,
    title: 'Haftalık Turnuva',
    remaining: (t: string) => `${t} kaldı`,
    closing: 'Kapanıyor',
    lastWeek: (rank: number, game?: string | null) =>
      `Geçen hafta${game ? ` ${game} turnuvasında` : ''} ${rank}. oldun!`,
    waiting: (points: number) => `+${points} puan seni bekliyor`,
    claim: 'Ödülü al →',
    unrewarded: 'Bu oyunun sıralaması ödülsüz.',
    featured: (emoji: string, title: string) => `Bu haftanın ödüllü turnuvası: ${emoji} ${title}`,
    minPlayers: (min: number | undefined, needed: number) => `Ödüller için en az ${min} oyuncu gerekli — ${needed} oyuncu daha!`,
    empty: 'Bu hafta ilk skoru sen yap, lider ol! 🎯',
    you: 'Sen',
    countdown: (d: number, h: number, m: number) => (d > 0 ? `${d}g ${h}s` : h > 0 ? `${h}s ${m}d` : `${m}d`),
  },
  page: {
    hub: 'Oyun Merkezi',
    disabledTitle: 'Bu oyun şu anda kapalı',
    disabledDesc: 'Oyun yönetici tarafından geçici olarak kapatıldı. Oyun Merkezi’nden başka bir oyun seçebilirsin.',
    backToHub: 'Oyun Merkezi’ne dön',
  },
};

type Copy = typeof tr;

const en: Copy = {
  shell: {
    dailyResetNote: 'A new ranked try unlocks every night at 00:00 (Turkey time)',
    winTitle: 'You won! 🎉',
    loseTitle: 'Not this time',
    practiceHint: 'Practice: unlimited, no rewards, not on the leaderboard.',
    rankedHint: '1 try a day — win to earn points + XP!',
    pause: 'Pause game',
    paused: 'Paused',
    resume: 'Resume',
    endRound: 'End round',
    endRoundConfirm: 'Yes, end it (uses your try)',
    endRoundRanked: 'End round (uses your try)',
    loadingSubmit: 'Saving your result…',
    loadingStart: 'Starting game…',
    startPractice: '▶ Practice',
    startRanked: '▶ Play',
    controls: 'Controls:',
    scoreLabel: 'Your score',
    practiceResult: 'Practice round: no rewards or leaderboard. Play as often as you like.',
    reward: (points, xp) => `+${points} points · +${xp} XP`,
    rewardMiss: (threshold) => `You needed a score of ${threshold} for the reward. Try again tomorrow with a fresh try!`,
    playAgain: 'Play again',
    switchRanked: 'Switch to ranked',
    comeBack: 'Come back tomorrow for a new try. 🌙',
    practiceNoReward: 'Practice (no rewards)',
    lockedTitle: 'You’ve played today’s game',
    playPractice: 'Play in practice mode',
    mode: 'Game mode',
    ranked: 'Ranked',
    practice: 'Practice',
    rankedUsed: 'Today’s try used',
    rankedHintShort: '1 a day · rewarded',
    practiceHintShort: 'Unlimited · no rewards',
    soundOff: 'Mute game sound',
    soundOn: 'Unmute game sound',
    hapticsOff: 'Turn off vibration',
    hapticsOn: 'Turn on vibration',
    practiceBadge: 'Practice, no rewards',
    howToPlay: 'How to play',
    next: 'Next',
    keyboard: 'Keyboard:',
  },
  leaderboard: {
    loading: 'Loading leaderboard…',
    failed: 'Couldn’t load the leaderboard right now.',
    retry: 'Try again',
    empty: 'No scores yet. Set the first record! 🏁',
    title: 'Leaderboard · all time',
    players: (n) => `${n} players`,
    youTag: '(you)',
    you: 'You',
  },
  tournament: {
    claimFailed: 'Couldn’t claim the reward',
    claimed: (rank, points) => `🏆 You placed #${rank}: +${points} points!`,
    title: 'Weekly Tournament',
    remaining: (t) => `${t} left`,
    closing: 'Closing',
    lastWeek: (rank, game) => `Last week you placed #${rank}${game ? ` in the ${game} tournament` : ''}!`,
    waiting: (points) => `+${points} points are waiting for you`,
    claim: 'Claim reward →',
    unrewarded: 'This game’s ranking has no rewards.',
    featured: (emoji, title) => `This week’s rewarded tournament: ${emoji} ${title}`,
    minPlayers: (min, needed) => `Rewards need at least ${min} players: ${needed} more to go!`,
    empty: 'Post the first score this week and take the lead! 🎯',
    you: 'You',
    countdown: (d, h, m) => (d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`),
  },
  page: {
    hub: 'Game Center',
    disabledTitle: 'This game is turned off right now',
    disabledDesc: 'An admin has paused this game for now. Pick another one from the Game Center.',
    backToHub: 'Back to Game Center',
  },
};

export const GAMES_COPY: Record<GamesLocale, Copy> = { tr, en };
export type GamesCopy = Copy;

export function gamesCopy(locale: string | null | undefined): Copy {
  return locale === 'en' ? en : tr;
}

export function useGamesCopy(): Copy {
  return gamesCopy(useLocaleSafe());
}

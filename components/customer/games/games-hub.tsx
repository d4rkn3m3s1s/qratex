'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Gamepad2, CheckCircle2, Trophy, Flame } from 'lucide-react';
import { MINI_GAMES } from '@/lib/minigame-config';
import { AchievementsPanel } from './achievements-panel';

/**
 * Oyun lobisi: Pacman + registry'deki tüm yeni mini oyunları kart olarak listeler.
 * Yeni oyun eklemek = MINI_GAMES'e satır; burada otomatik görünür. Bugün
 * tamamlanan oyunlar /api/customer/games/status'tan çekilip "oynandı" işaretlenir.
 */
interface HubCard {
  gameType: string;
  href: string;
  title: string;
  description: string;
  emoji: string;
  accent: string;
}

const PACMAN: HubCard = {
  gameType: 'pacman',
  href: '/customer/games/pacman',
  title: 'Yıldız Avı',
  description: 'QRatex labirentinde yıldızları topla, hayaletlerden kaç! 5 yıldız = ödül.',
  emoji: '👾',
  accent: '#fbbf24',
};

export function GamesHub() {
  const [playedToday, setPlayedToday] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [streak, setStreak] = useState<{ current: number; longest: number; playedToday: boolean } | null>(null);

  // Aktif oyunların etkin (admin override sonrası) hub kartları. Server'dan gelene
  // kadar registry varsayılanı gösterilir (flicker önler); status yüklenince
  // pasifleştirilmiş oyunlar listeden düşer ve güncel görseller uygulanır.
  const [activeGames, setActiveGames] = useState<Omit<HubCard, 'href'>[] | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/api/customer/games/status').then((r) => r.json()).catch(() => null),
      fetch('/api/customer/games/streak').then((r) => r.json()).catch(() => null),
    ])
      .then(([status, st]) => {
        if (!alive) return;
        if (status && Array.isArray(status.playedToday)) setPlayedToday(status.playedToday);
        if (status && Array.isArray(status.games)) {
          setActiveGames(
            status.games.map((g: { gameType: string; title: string; description: string; emoji: string; accent: string }) => ({
              gameType: g.gameType,
              title: g.title,
              description: g.description,
              emoji: g.emoji,
              accent: g.accent,
            }))
          );
        }
        if (st && typeof st.current === 'number') {
          setStreak({ current: st.current, longest: st.longest ?? 0, playedToday: !!st.playedToday });
        }
      })
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  // Server listesi geldiyse onu, gelmediyse registry varsayılanını kullan.
  const gameList = activeGames ?? MINI_GAMES.map((g) => ({
    gameType: g.gameType,
    title: g.title,
    description: g.description,
    emoji: g.emoji,
    accent: g.accent,
  }));

  const cards: HubCard[] = [
    PACMAN,
    ...gameList.map((g) => ({
      gameType: g.gameType,
      href: `/customer/games/${g.gameType}`,
      title: g.title,
      description: g.description,
      emoji: g.emoji,
      accent: g.accent,
    })),
  ];

  const playedSet = new Set(playedToday);
  const doneCount = cards.filter((c) => playedSet.has(c.gameType)).length;
  const pct = Math.round((doneCount / cards.length) * 100);

  return (
    <div className="space-y-5">
      {/* Günlük seri (streak) banner */}
      {streak && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4"
          style={{
            borderColor: streak.current > 0 ? '#fb923c66' : 'rgba(255,255,255,0.1)',
            background:
              streak.current > 0
                ? 'linear-gradient(120deg, rgba(120,53,15,0.5), rgba(60,20,5,0.6))'
                : 'linear-gradient(120deg, rgba(30,18,55,0.9), rgba(8,5,20,0.95))',
          }}
        >
          <motion.div
            className="text-5xl"
            animate={streak.current > 0 ? { scale: [1, 1.15, 1], rotate: [0, -6, 6, 0] } : {}}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ filter: streak.current > 0 ? 'none' : 'grayscale(1) opacity(0.5)' }}
          >
            🔥
          </motion.div>
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black tabular-nums text-white">{streak.current}</span>
              <span className="text-sm font-semibold text-orange-200">günlük seri</span>
            </div>
            <p className="mt-0.5 text-xs text-white/60">
              {streak.current === 0
                ? 'Bugün bir oyun bitir, seriyi başlat! Her gün +XP bonus.'
                : streak.playedToday
                ? `Harika! En uzun serin: ${streak.longest} gün. Yarın da gel, seriyi büyüt!`
                : 'Serini korumak için bugün bir oyun bitir! 🔥'}
            </p>
          </div>
          <Flame
            className="h-6 w-6 shrink-0"
            style={{ color: streak.current > 0 ? '#fb923c' : '#52525b' }}
          />
        </motion.div>
      )}

      {/* Günlük ilerleme şeridi */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-white/10 p-4"
        style={{ background: 'linear-gradient(120deg, rgba(30,18,55,0.9), rgba(8,5,20,0.95))' }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Trophy className="h-4 w-4 text-amber-400" />
            Bugünkü ilerlemen
          </div>
          <span className="text-sm font-bold tabular-nums text-white">
            {loaded ? `${doneCount}/${cards.length}` : '…'}
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${loaded ? pct : 0}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ background: 'linear-gradient(90deg, #a855f7, #22d3ee, #34d399)' }}
          />
        </div>
        <p className="mt-2 text-xs text-white/50">
          {doneCount === cards.length && loaded
            ? '🎉 Bugün tüm oyunları bitirdin! Efsanesin.'
            : 'Her oyundan günde 1 hakkın var — hepsini bitir, puanları topla!'}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => {
          const done = playedSet.has(c.gameType);
          return (
            <motion.div
              key={c.href}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={c.href}
                className="group relative block h-full overflow-hidden rounded-2xl border p-5 transition-transform hover:-translate-y-1"
                style={{
                  borderColor: done ? `${c.accent}66` : `${c.accent}40`,
                  background:
                    'radial-gradient(120% 120% at 50% 0%, rgba(20,12,40,0.9) 0%, rgba(6,4,16,0.97) 70%)',
                  boxShadow: `0 0 30px ${c.accent}1f`,
                  opacity: done ? 0.78 : 1,
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.1] transition-opacity group-hover:opacity-25"
                  style={{
                    backgroundImage: `radial-gradient(circle at 80% 10%, ${c.accent}, transparent 60%)`,
                  }}
                />

                {/* Oynandı rozeti */}
                {done && (
                  <div
                    className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{ background: `${c.accent}22`, color: c.accent, border: `1px solid ${c.accent}55` }}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Bitti
                  </div>
                )}

                <div className="relative z-10 flex flex-col gap-3">
                  <motion.div
                    className="text-5xl"
                    style={{ textShadow: `0 0 30px ${c.accent}`, filter: done ? 'grayscale(0.3)' : 'none' }}
                    whileHover={{ scale: 1.15, rotate: 6 }}
                  >
                    {c.emoji}
                  </motion.div>
                  <h3 className="text-lg font-bold text-white" style={{ textShadow: `0 0 14px ${c.accent}66` }}>
                    {c.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-white/60">{c.description}</p>
                  <div
                    className="mt-1 flex items-center gap-1.5 text-sm font-semibold transition-transform group-hover:translate-x-1"
                    style={{ color: c.accent }}
                  >
                    {done ? 'Tekrar gör' : 'Oyna'} <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}

        {/* Yakında */}
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 p-5 text-center text-white/40">
          <Gamepad2 className="h-8 w-8" />
          <p className="text-sm font-semibold">Daha fazla oyun yolda…</p>
          <p className="text-xs">Her hafta yeni mini oyunlar ekleniyor!</p>
        </div>
      </div>

      {/* Başarımlar */}
      <AchievementsPanel />
    </div>
  );
}

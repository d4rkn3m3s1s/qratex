'use client';

import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Loader2, Trophy, Lock, RotateCcw, Sparkles, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GameLeaderboard } from './game-leaderboard';
import { GameTournament } from './game-tournament';
import type { MiniGamePhase, MiniGameResult } from '@/lib/use-mini-game';
import { pickVariant, type GameCopy } from '@/lib/minigame-copy';

function reducedMotion(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.classList.contains('reduce-animations');
}

/** Ödül kazanınca neon konfeti patlatır (accent renge uyumlu). */
function celebrate(accent: string) {
  if (reducedMotion()) return;
  const colors = [accent, '#ffffff', '#fbbf24'];
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.55 }, colors, scalar: 0.9 });
  setTimeout(
    () => confetti({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, colors }),
    180
  );
  setTimeout(
    () => confetti({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, colors }),
    300
  );
}

/**
 * Tüm yeni mini oyunların ortak neon cyberpunk kabuğu. Başlat / oynanış /
 * sonuç / "bugün oynandı" ekranlarını ve animasyonlu çerçeveyi yönetir; içine
 * verilen `children` yalnızca oynanış (phase==='playing') sırasında gösterilir.
 */
export interface GameShellProps {
  title: string;
  emoji: string;
  description: string;
  accent: string;
  phase: MiniGamePhase;
  alreadyPlayed: boolean;
  result: MiniGameResult | null;
  rewardThreshold?: number;
  onStart: () => void;
  /** Liderlik tablosu için oyun anahtarı (verilmezse tablo gizlenir). */
  gameType?: string;
  /** Oyuna özel kişilik metinleri (verilmezse genel varsayılanlar). */
  copy?: GameCopy;
  /** Oynanış alanı — sadece phase==='playing' iken görünür. */
  children: ReactNode;
}

export function GameShell({
  title,
  emoji,
  description,
  accent,
  phase,
  alreadyPlayed,
  result,
  rewardThreshold,
  onStart,
  gameType,
  copy,
  children,
}: GameShellProps) {
  const playing = phase === 'playing';
  const loading = phase === 'starting' || phase === 'submitting';
  const showResult = phase === 'done' && !!result;
  const showLocked = phase === 'done' && alreadyPlayed && !result;

  // Kazanma/kaybetme başlığı: varyant dizisinden bir kez seç (her render'da
  // titremesin diye sonuç kimliğine bağlı memo). Aynı oyunu tekrar oynayınca
  // farklı başlık çıkar → tekdüzelik kırılır.
  const resultTitle = useMemo(() => {
    if (!result) return '';
    return result.won
      ? pickVariant(copy?.winTitles, 'Kazandın! 🎉')
      : pickVariant(copy?.loseTitles, 'Bu sefer olmadı');
    // result objesi her tamamlamada yenilenir → o zaman yeni varyant seçilir.
  }, [result, copy]);

  // Ödül kazanıldığında bir kez konfeti patlat.
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (showResult && result?.rewarded && !celebratedRef.current) {
      celebratedRef.current = true;
      celebrate(accent);
    }
    if (phase !== 'done') celebratedRef.current = false;
  }, [showResult, result?.rewarded, accent, phase]);

  return (
    <div
      className="relative overflow-hidden rounded-3xl border p-4 sm:p-6"
      style={{
        borderColor: `${accent}40`,
        background:
          'radial-gradient(120% 120% at 50% 0%, rgba(20,12,40,0.92) 0%, rgba(6,4,16,0.98) 70%)',
        boxShadow: `0 0 60px ${accent}22, inset 0 0 80px rgba(0,0,0,0.6)`,
      }}
    >
      {/* Arka plan parçacık ızgarası */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `linear-gradient(${accent}55 1px, transparent 1px), linear-gradient(90deg, ${accent}55 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Cyberpunk köşe aksanları */}
      {[
        'left-2 top-2 border-l-2 border-t-2 rounded-tl-xl',
        'right-2 top-2 border-r-2 border-t-2 rounded-tr-xl',
        'left-2 bottom-2 border-l-2 border-b-2 rounded-bl-xl',
        'right-2 bottom-2 border-r-2 border-b-2 rounded-br-xl',
      ].map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={`pointer-events-none absolute h-6 w-6 ${pos}`}
          style={{ borderColor: `${accent}99` }}
        />
      ))}

      <div className="relative z-10 flex min-h-[460px] flex-col items-center justify-center">
        {/* OYNANIŞ — AnimatePresence DIŞINDA: canvas oyunlarında ref'in geç mount
            olmaması için phase 'playing' olur olmaz koşulsuz/anında DOM'a basılır. */}
        {playing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {children}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {/* YÜKLENİYOR */}
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 text-white/80"
            >
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: accent }} />
              <p className="text-sm">
                {phase === 'submitting'
                  ? copy?.loadingSubmit ?? 'Sonuç kaydediliyor…'
                  : copy?.loadingStart ?? 'Oyun başlatılıyor…'}
              </p>
            </motion.div>
          )}

          {/* BAŞLANGIÇ */}
          {phase === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="flex max-w-md flex-col items-center gap-5 text-center"
            >
              <motion.div
                className="text-7xl"
                animate={{ y: [0, -10, 0], filter: ['brightness(1)', 'brightness(1.4)', 'brightness(1)'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                style={{ textShadow: `0 0 40px ${accent}` }}
              >
                {emoji}
              </motion.div>
              <h2 className="text-2xl font-bold text-white" style={{ textShadow: `0 0 20px ${accent}99` }}>
                {title}
              </h2>
              <p className="text-sm leading-relaxed text-white/70">{description}</p>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/60">
                <Sparkles className="h-3.5 w-3.5" style={{ color: accent }} />
                {copy?.startHint ?? 'Günde 1 hak — kazan, puan + XP kap!'}
              </div>
              <motion.div
                className="relative mt-2"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
              >
                {/* nabız halkası */}
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-md"
                  animate={{ boxShadow: [`0 0 0 0 ${accent}66`, `0 0 0 14px ${accent}00`] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
                <Button
                  onClick={onStart}
                  className="relative px-9 py-6 text-base font-bold"
                  style={{ background: accent, boxShadow: `0 0 30px ${accent}88` }}
                >
                  {copy?.startCta ?? '▶ Oyna'}
                </Button>
              </motion.div>

              {gameType && (
                <div className="mt-4 w-full space-y-4 border-t border-white/10 pt-4">
                  <GameTournament gameType={gameType} accent={accent} />
                  <div className="border-t border-white/10 pt-4">
                    <GameLeaderboard gameType={gameType} accent={accent} />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* SONUÇ */}
          {showResult && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex max-w-md flex-col items-center gap-4 text-center"
            >
              {/* Trofe + dönen parlama halkası */}
              <div className="relative flex h-28 w-28 items-center justify-center">
                {result.won && (
                  <motion.div
                    aria-hidden
                    className="absolute inset-0"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    style={{
                      background: `conic-gradient(from 0deg, transparent, ${accent}, transparent 40%)`,
                      borderRadius: '9999px',
                      filter: 'blur(6px)',
                      opacity: 0.7,
                    }}
                  />
                )}
                <motion.div
                  animate={{
                    rotate: result.won ? [0, -10, 10, 0] : 0,
                    scale: result.won ? [1, 1.2, 1] : [1, 1.1, 1],
                    y: result.won ? [0, -6, 0] : 0,
                  }}
                  transition={{ duration: 0.7, repeat: result.won ? Infinity : 0, repeatDelay: 1.2 }}
                  className="relative z-10 text-7xl"
                  style={{ textShadow: `0 0 40px ${accent}` }}
                >
                  {result.won ? '🏆' : '💀'}
                </motion.div>
              </div>

              <motion.h2
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="text-2xl font-bold text-white"
                style={{ textShadow: result.won ? `0 0 22px ${accent}99` : 'none' }}
              >
                {resultTitle}
              </motion.h2>

              <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-1.5 text-sm text-white/80">
                <Star className="h-4 w-4" style={{ color: accent }} /> {copy?.scoreLabel ?? 'Skorun'}:{' '}
                <span className="font-bold tabular-nums text-white">{result.score}</span>
              </div>

              {result.rewarded ? (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 16 }}
                  className="flex items-center gap-2 rounded-2xl px-6 py-3.5 text-base font-bold text-white"
                  style={{
                    background: `linear-gradient(135deg, ${accent}33, ${accent}11)`,
                    border: `1px solid ${accent}88`,
                    boxShadow: `0 0 30px ${accent}55`,
                  }}
                >
                  <Trophy className="h-5 w-5" style={{ color: accent }} />
                  +{result.rewardPoints} puan · +{result.rewardXp} XP
                </motion.div>
              ) : (
                <p className="text-xs text-white/50">
                  {copy?.rewardMissNote ??
                    `Ödül için ${rewardThreshold ?? '—'} skor gerekiyordu. Yarın yeni hakla tekrar dene!`}
                </p>
              )}
              <p className="mt-1 text-xs text-white/40">
                {copy?.comeBackNote ?? 'Yarın yeni bir hak için tekrar gel. 🌙'}
              </p>

              {gameType && (
                <div className="mt-3 w-full border-t border-white/10 pt-4">
                  <GameLeaderboard gameType={gameType} accent={accent} />
                </div>
              )}
            </motion.div>
          )}

          {/* BUGÜN ZATEN OYNANDI */}
          {showLocked && (
            <motion.div
              key="locked"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex max-w-md flex-col items-center gap-4 text-center"
            >
              <Lock className="h-12 w-12 text-white/50" />
              <h2 className="text-xl font-bold text-white">
                {copy?.lockedTitle ?? 'Bugünün oyununu oynadın'}
              </h2>
              <p className="text-sm text-white/60">
                {copy?.lockedNote ?? copy?.comeBackNote ?? 'Yarın yeni bir hakla tekrar gel. 🌙'}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-white/40">
                <RotateCcw className="h-3.5 w-3.5" /> Her gün 00:00 (UTC) sıfırlanır
              </div>

              {gameType && (
                <div className="mt-3 w-full border-t border-white/10 pt-4">
                  <GameLeaderboard gameType={gameType} accent={accent} />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

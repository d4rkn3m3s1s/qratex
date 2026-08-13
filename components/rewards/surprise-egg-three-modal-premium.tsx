'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { Copy, Gift, Sparkles, Star, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LEAGUE_EGG_THEME } from '@/lib/league-egg-themes';
import type { LeagueKey } from '@/lib/utils';

interface SurpriseEggThreeModalProps {
  open: boolean;
  title?: string;
  message?: string | null;
  couponCode?: string | null;
  leagueKey?: LeagueKey;
  onClose: () => void;
}

const LEAGUE_DISPLAY_NAMES: Record<LeagueKey, string> = {
  BASLANGIC: 'Başlangıç',
  KOR: 'Kor',
  VEYRA: 'Veyra',
  SAVASCI: 'Savaşçı',
  ETERON: 'Eteron',
  VETRA: 'Vetra',
  ZENOR: 'Zenor',
};

export function SurpriseEggThreeModal({
  open,
  title = 'Sürpriz Ödül Açıldı!',
  message,
  couponCode,
  leagueKey = 'ZENOR',
  onClose,
}: SurpriseEggThreeModalProps) {
  const [phase, setPhase] = useState<'idle' | 'intro' | 'reveal' | 'done'>('idle');
  const [showParticles, setShowParticles] = useState(false);
  const leagueTheme = LEAGUE_EGG_THEME[leagueKey];
  const leagueName = LEAGUE_DISPLAY_NAMES[leagueKey];

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setShowParticles(false);
      return;
    }

    setPhase('intro');
    const revealTimer = window.setTimeout(() => {
      setShowParticles(true);
      setPhase('reveal');
    }, 720);
    const doneTimer = window.setTimeout(() => setPhase('done'), 1380);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(doneTimer);
    };
  }, [open]);

  const copyCode = async () => {
    if (!couponCode) return;
    await navigator.clipboard.writeText(couponCode);
    toast.success('Kupon kodu kopyalandı');
  };

  if (!open) return null;

  const pointsText = message && message.toLowerCase().includes('puan') ? message : null;

  return (
    <AnimatePresence>
      <Motion.div
        className="fixed inset-0 z-[100] overflow-y-auto bg-[#050505]/95 text-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && phase === 'done' && onClose()}
      >
        <div className="relative min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-10">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute left-1/2 top-[-8rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full blur-3xl"
              style={{
                background: `radial-gradient(circle, ${leagueTheme.glowPrimary}40 0%, ${leagueTheme.glowSecondary}18 42%, transparent 72%)`,
              }}
            />
            <div className="absolute bottom-[-11rem] right-[-5rem] h-[24rem] w-[24rem] rounded-full bg-white/10 blur-3xl" />
            <div className="absolute left-[-4rem] top-[20%] h-[16rem] w-[16rem] rounded-full bg-amber-400/10 blur-3xl" />
          </div>

          <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-6xl items-center justify-center">
            <Motion.section
              className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_40px_140px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
              initial={{ scale: 0.96, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 16 }}
              transition={{ type: 'spring', damping: 24, stiffness: 180 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid md:grid-cols-[1.05fr_0.95fr]">
                <div className="relative min-h-[20rem] overflow-hidden border-b border-white/10 md:min-h-[38rem] md:border-b-0 md:border-r">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `radial-gradient(circle at 50% 18%, ${leagueTheme.glowPrimary}28 0%, transparent 36%), radial-gradient(circle at 18% 20%, ${leagueTheme.glowSecondary}1d 0%, transparent 28%), radial-gradient(circle at 84% 74%, rgba(255,255,255,0.08) 0%, transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.07), transparent 18%, transparent 72%, rgba(0,0,0,0.28))`,
                    }}
                  />

                  <div className="relative z-10 flex h-full flex-col p-5 sm:p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-white/85 uppercase">
                        <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                        Sürpriz kutu açıldı
                      </div>
                      <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-white/70 uppercase">
                        {leagueName}
                      </div>
                    </div>

                    <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                      <Motion.div
                        className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_45%)]"
                        animate={{ opacity: [0.28, 0.62, 0.28], scale: [1, 1.05, 1] }}
                        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <Motion.div
                        className="absolute left-6 top-6 h-24 w-24 rounded-full bg-amber-300/20 blur-3xl"
                        animate={{ x: [0, 20, 0], y: [0, 8, 0], opacity: [0.18, 0.42, 0.18] }}
                        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <Motion.div
                        className="absolute bottom-8 right-8 h-28 w-28 rounded-full bg-white/10 blur-3xl"
                        animate={{ x: [0, -18, 0], y: [0, -10, 0], opacity: [0.16, 0.32, 0.16] }}
                        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                      />

                      <Motion.div
                        className="relative z-10 flex h-[18rem] w-full max-w-[34rem] items-center justify-center md:h-[28rem]"
                        animate={phase === 'intro' ? { scale: [0.98, 1.01, 1], rotate: [-1.2, 1.2, 0] } : { scale: 1, rotate: 0 }}
                        transition={{ duration: 1.5, ease: 'easeOut' }}
                      >
                        <div
                          className="absolute inset-x-8 top-8 mx-auto h-40 w-40 rounded-full blur-3xl"
                          style={{ background: `radial-gradient(circle, ${leagueTheme.shellLight}66, transparent 70%)` }}
                        />
                        <div
                          className="absolute inset-x-6 bottom-10 mx-auto h-24 w-56 rounded-full blur-3xl"
                          style={{ background: `radial-gradient(circle, ${leagueTheme.glowSecondary}40, transparent 70%)` }}
                        />

                        <Motion.div
                          className="relative flex h-56 w-56 items-center justify-center rounded-[2rem] border border-white/12 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                          animate={phase === 'intro' ? { y: [0, -8, 0], rotate: [-2, 2, 0] } : { y: 0, rotate: 0 }}
                          transition={{ duration: 1.8, ease: 'easeInOut' }}
                        >
                          <Motion.div
                            className="absolute inset-4 rounded-[1.5rem]"
                            style={{
                              background: `linear-gradient(145deg, ${leagueTheme.shellLight}, ${leagueTheme.shellMid} 55%, ${leagueTheme.shellDark})`,
                              boxShadow: `inset 0 1px 1px rgba(255,255,255,0.35), 0 20px 70px ${leagueTheme.glowPrimary}22`,
                            }}
                            animate={phase === 'intro' ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                          />

                          <Motion.div
                            className="absolute left-8 top-10 h-16 w-16 rounded-full bg-white/18 blur-2xl"
                            animate={phase === 'reveal' || phase === 'done' ? { opacity: 0.8, scale: 1.12 } : { opacity: 0.35, scale: 1 }}
                          />
                          <Motion.div
                            className="absolute bottom-12 right-9 h-14 w-14 rounded-full bg-black/20 blur-2xl"
                            animate={phase === 'reveal' || phase === 'done' ? { opacity: 0.75, scale: 1.15 } : { opacity: 0.25, scale: 1 }}
                          />

                          <div className="relative z-10 flex flex-col items-center gap-4 text-center">
                            <Motion.div
                              className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-black/15 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
                              animate={phase === 'intro' ? { y: [0, -4, 0] } : { y: 0 }}
                              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                            >
                              <Gift className="h-10 w-10 text-white/90" />
                            </Motion.div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.24em] text-white/58">Bugünün sürprizi</p>
                              <p className="mt-1 text-sm font-medium text-white/84">{leagueName} ligi içinde açıldı</p>
                            </div>
                          </div>
                        </Motion.div>

                        <AnimatePresence>
                          {showParticles &&
                            [...Array(14)].map((_, i) => (
                              <Motion.span
                                key={i}
                                className="absolute h-2 w-2 rounded-full bg-amber-200"
                                initial={{ opacity: 0.9, scale: 1, x: 0, y: 0 }}
                                animate={{
                                  opacity: 0,
                                  scale: 0,
                                  x: (i - 7) * 28 + (Math.random() - 0.5) * 40,
                                  y: -130 - Math.random() * 90,
                                }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1.1, delay: Math.min(i, 10) * 0.04, ease: 'easeOut' }}
                              />
                            ))}
                        </AnimatePresence>
                      </Motion.div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Tema</p>
                        <p className="mt-1 text-sm font-semibold text-white/90">{leagueName}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Durum</p>
                        <p className="mt-1 text-sm font-semibold text-white/90">{phase === 'done' ? 'Hazır' : 'Açılıyor'}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Ödül</p>
                        <p className="mt-1 text-sm font-semibold text-white/90">{couponCode ? 'Kupon kodu' : 'Puan bonusu'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative flex flex-col justify-between p-5 sm:p-6 md:p-8 lg:p-10">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.7, y: 6 }}
                        transition={{ duration: 0.6, delay: 0.05 }}
                        className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-amber-200 uppercase"
                      >
                        <Trophy className="h-3.5 w-3.5" />
                        Günün ödülü
                      </Motion.div>

                      <Motion.h3
                        className="max-w-[14ch] text-balance text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl md:text-5xl"
                        initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                        animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0.8, y: 8, filter: 'blur(4px)' }}
                        transition={{ duration: 0.8, delay: 0.12 }}
                      >
                        {title}
                      </Motion.h3>

                      <Motion.p
                        className="max-w-xl text-pretty text-sm leading-7 text-white/68 sm:text-base"
                        initial={{ opacity: 0, y: 12 }}
                        animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.72, y: 6 }}
                        transition={{ duration: 0.7, delay: 0.18 }}
                      >
                        {message || 'Ödül hesabına işlendi. Bu kutu sadece bir bildirim değil, günlük ritminin bir parçası gibi tasarlandı.'}
                      </Motion.p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {pointsText ? (
                        <Motion.div
                          className="rounded-[1.4rem] border border-amber-300/20 bg-gradient-to-br from-amber-300/15 via-amber-200/10 to-transparent p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                          initial={{ opacity: 0, y: 16 }}
                          animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.8, y: 8 }}
                          transition={{ duration: 0.7, delay: 0.24 }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-300/15 text-amber-200 ring-1 ring-amber-200/20">
                              <Star className="h-5 w-5 fill-current" />
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-100/55">Kazanılan puan</p>
                              <p className="text-2xl font-semibold tracking-[-0.03em] text-white">{pointsText}</p>
                            </div>
                          </div>
                        </Motion.div>
                      ) : (
                        <Motion.div
                          className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                          initial={{ opacity: 0, y: 16 }}
                          animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.8, y: 8 }}
                          transition={{ duration: 0.7, delay: 0.24 }}
                        >
                          <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Ödül tipi</p>
                          <p className="mt-1 text-lg font-semibold text-white">Anında erişim</p>
                          <p className="mt-1 text-sm text-white/55">Kazanılan içerik hesabında hazır.</p>
                        </Motion.div>
                      )}

                      <Motion.div
                        className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        initial={{ opacity: 0, y: 16 }}
                        animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.8, y: 8 }}
                        transition={{ duration: 0.7, delay: 0.3 }}
                      >
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Lig seviyesi</p>
                        <p className="mt-1 text-lg font-semibold text-white">{leagueName}</p>
                        <p className="mt-1 text-sm text-white/55">Tema, ödüle göre dinamik olarak değişiyor.</p>
                      </Motion.div>
                    </div>

                    {couponCode ? (
                      <Motion.div
                        className="space-y-3 rounded-[1.6rem] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        initial={{ opacity: 0, y: 18 }}
                        animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.84, y: 10 }}
                        transition={{ duration: 0.7, delay: 0.36 }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Kupon kodu</p>
                            <p className="mt-1 text-sm text-white/62">Kodu kaybetme, bir işletmede kullanacaksın.</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 min-h-10 min-w-10 shrink-0 rounded-full border border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/10 hover:text-white"
                            onClick={copyCode}
                            aria-label="Kupon kodunu kopyala"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.05] px-4 py-3">
                          <code className="min-w-0 truncate font-mono text-lg font-semibold tracking-[0.22em] text-white">
                            {couponCode}
                          </code>
                          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-medium tracking-[0.18em] text-emerald-100 uppercase">
                            Aktif
                          </span>
                        </div>
                      </Motion.div>
                    ) : null}
                  </div>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-xs text-white/45">
                      <Gift className="h-4 w-4 text-amber-200" />
                      Bu açılış hesabında saklanır.
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button
                        variant="ghost"
                        className="h-12 min-h-12 rounded-full border border-white/10 bg-white/[0.04] px-5 text-white/80 hover:bg-white/10 hover:text-white"
                        onClick={onClose}
                      >
                        Kapat
                      </Button>
                      {phase === 'done' ? (
                        <Button
                          className="h-12 min-h-12 rounded-full bg-white px-5 font-semibold text-black hover:bg-white/90"
                          onClick={onClose}
                        >
                          Harika
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-4 z-10 h-11 w-11 min-h-11 min-w-11 rounded-full border border-white/10 bg-black/30 text-white/85 hover:bg-black/45 hover:text-white"
                onClick={onClose}
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </Button>
            </Motion.section>
          </div>
        </div>
      </Motion.div>
    </AnimatePresence>
  );
}

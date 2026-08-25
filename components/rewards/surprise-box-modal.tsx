'use client';

import { useState, useEffect } from 'react';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { Copy, Coins, Gift, Sparkles, Star, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SignatureGiftBox3D from '@/components/rewards/signature-gift-box-lazy';
import { toast } from 'sonner';
import { useAppT } from '@/lib/app-locale';

export interface SurpriseBoxContent {
  title: string;
  message?: string | null;
  couponCode?: string | null;
  points?: number;
  rewardType?: string | null;
}

interface SurpriseBoxModalProps {
  open: boolean;
  content: SurpriseBoxContent | null;
  onClose: () => void;
  /** Açılış sonrası ek puan (API’den dönen) */
  pointsGranted?: number;
}

export function SurpriseBoxModal({
  open,
  content,
  onClose,
  pointsGranted = 0,
}: SurpriseBoxModalProps) {
  const t = useAppT();
  const [phase, setPhase] = useState<'idle' | 'shaking' | 'opening' | 'reveal' | 'done'>('idle');
  const [showParticles, setShowParticles] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setShowParticles(false);
      return;
    }
    setPhase('shaking');
    const t1 = setTimeout(() => setPhase('opening'), 800);
    const t2 = setTimeout(() => {
      setShowParticles(true);
      setPhase('reveal');
    }, 1400);
    const t3 = setTimeout(() => setPhase('done'), 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [open]);

  const copyCode = () => {
    if (content?.couponCode) {
      navigator.clipboard.writeText(content.couponCode);
      toast.success(t('surpriseBoxes.copied') || 'Kupon kodu kopyalandı');
    }
  };

  if (!open) return null;

  const hasPoints = (content?.points !== undefined && content.points > 0) || pointsGranted > 0;
  const rewardPoints = pointsGranted ?? content?.points ?? 0;

  return (
    <AnimatePresence>
      <Motion.div
        className="fixed inset-0 z-[100] overflow-y-auto bg-[#050505]/95 text-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && phase === 'done' && onClose()}
      >
        <div className="relative min-h-[100dvh] px-3 py-4 sm:px-6 sm:py-10">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-[-10rem] h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-[#5aa2ff]/12 blur-3xl" />
            <div className="absolute bottom-[-10rem] right-[-6rem] h-[24rem] w-[24rem] rounded-full bg-white/8 blur-3xl" />
            <div className="absolute left-[-6rem] top-[18%] h-[18rem] w-[18rem] rounded-full bg-primary/10 blur-3xl" />
          </div>

          <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-6xl items-center justify-center">
            <Motion.section
              className="relative w-full max-w-[min(100%,78rem)] overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.035] shadow-[0_40px_140px_rgba(0,0,0,0.58)] backdrop-blur-2xl sm:rounded-[2rem]"
              initial={{ scale: 0.88, opacity: 0, y: 36, rotateX: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0, rotateX: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20, rotateX: 6 }}
              transition={{ type: 'spring', damping: 22, stiffness: 150, mass: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr]">
                <div className="relative min-h-[20rem] overflow-hidden border-b border-white/10 md:min-h-[40rem] md:border-b-0 md:border-r">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 18%, rgba(255,255,255,0.12) 0%, transparent 34%), radial-gradient(circle at 18% 20%, rgba(90,162,255,0.14) 0%, transparent 24%), radial-gradient(circle at 84% 74%, rgba(255,255,255,0.06) 0%, transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.05), transparent 18%, transparent 72%, rgba(0,0,0,0.34))',
                    }}
                  />

                  <div className="relative z-10 flex h-full flex-col p-5 sm:p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-white/85 uppercase">
                        <Sparkles className="h-3.5 w-3.5 text-[#bfe0ff]" />
                        {t('surpriseBoxes.modalOpened') || 'Sürpriz Kutu Açıldı'}
                      </div>
                      <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-white/70 uppercase">
                        Ödül merkezi
                      </div>
                    </div>

                    <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/25 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:rounded-[1.6rem] sm:p-3">
                      <Motion.div
                        className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_45%)]"
                        animate={{ opacity: [0.28, 0.62, 0.28], scale: [1, 1.05, 1] }}
                        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <Motion.div
                        className="absolute left-4 top-6 h-28 w-28 rounded-full bg-[#5aa2ff]/14 blur-3xl"
                        animate={{ x: [0, 18, 0], y: [0, 6, 0], opacity: [0.12, 0.28, 0.12] }}
                        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <Motion.div
                        className="absolute bottom-4 right-6 h-32 w-32 rounded-full bg-white/8 blur-3xl"
                        animate={{ x: [0, -14, 0], y: [0, -8, 0], opacity: [0.1, 0.22, 0.1] }}
                        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                      />

                      {/* İMZA 3B KUTU — three.js sahnesi (ayrı chunk, lazy yüklenir).
                          Kapak arkaya doğru açılır ve MERKEZ boş kalır: ödül tam oraya çıkar. */}
                      <div className="relative z-10 flex h-[18rem] w-full max-w-[40rem] items-center justify-center md:h-[30rem]">
                        <SignatureGiftBox3D phase={phase} className="h-full w-full max-w-[30rem]" />

                        {/* ÖDÜL YUVASI — kutunun açılan ağzının üstünde belirir */}
                        <AnimatePresence>
                          {(phase === 'reveal' || phase === 'done') && (
                            <Motion.div
                              className="pointer-events-none absolute inset-x-0 top-[14%] flex flex-col items-center gap-3 text-center"
                              initial={{ opacity: 0, y: 30, scale: 0.8 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ type: 'spring', damping: 17, stiffness: 190, delay: 0.18 }}
                            >
                              <div
                                className="grid h-20 w-20 place-items-center rounded-2xl border border-white/20 backdrop-blur-sm sm:h-24 sm:w-24"
                                style={{
                                  background: 'linear-gradient(150deg, rgba(191,224,255,0.22), rgba(18,58,134,0.35))',
                                  boxShadow: '0 0 42px rgba(120,180,255,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
                                }}
                              >
                                {content?.couponCode
                                  ? <Gift className="h-10 w-10 text-white sm:h-12 sm:w-12" />
                                  : <Coins className="h-10 w-10 text-white sm:h-12 sm:w-12" />}
                              </div>
                              {hasPoints && (
                                <span
                                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-extrabold text-white"
                                  style={{ textShadow: '0 0 18px rgba(150,200,255,0.9)' }}
                                >
                                  +{rewardPoints}
                                </span>
                              )}
                            </Motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Durum</p>
                        <p className="mt-1 text-sm font-semibold text-white/90">{phase === 'done' ? 'Hazır' : 'Açılıyor'}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Tür</p>
                        <p className="mt-1 text-sm font-semibold text-white/90">{content?.couponCode ? 'Kupon' : 'Puan'}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Seviye</p>
                        <p className="mt-1 text-sm font-semibold text-white/90">Premium</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative flex flex-col justify-between p-4 sm:p-6 md:p-8 lg:p-10">
                  <div className="space-y-5 sm:space-y-6">
                    <div className="space-y-3">
                      <Motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.7, y: 6 }}
                        transition={{ duration: 0.6, delay: 0.05 }}
                        className="inline-flex items-center gap-2 rounded-full border border-[#5aa2ff]/25 bg-[#5aa2ff]/12 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-[#bfe0ff] uppercase sm:text-[11px]"
                      >
                        <Trophy className="h-3.5 w-3.5" />
                        Günlük giriş ödülü
                      </Motion.div>

                      <Motion.h3
                        className="max-w-[14ch] text-balance text-2xl font-semibold tracking-[-0.04em] text-white sm:text-4xl md:text-5xl"
                        initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                        animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0.8, y: 8, filter: 'blur(4px)' }}
                        transition={{ duration: 0.8, delay: 0.12 }}
                      >
                        {content?.title ?? (t('surpriseBoxes.congratulations') || 'Tebrikler!')}
                      </Motion.h3>

                      <Motion.p
                        className="max-w-xl text-pretty text-sm leading-6 text-white/68 sm:leading-7 sm:text-base"
                        initial={{ opacity: 0, y: 12 }}
                        animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.72, y: 6 }}
                        transition={{ duration: 0.7, delay: 0.18 }}
                      >
                        {content?.message || 'Her gün giriş yaparak yeni sürprizler kazanabilirsin. Bugünün ödülü hesabına işlendi.'}
                      </Motion.p>
                    </div>

                    <Motion.div
                      className="grid gap-3 sm:grid-cols-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.18, y: 4 }}
                      transition={{ duration: 0.7, delay: 0.18 }}
                    >
                      {hasPoints ? (
                        <Motion.div
                          className="rounded-[1.4rem] border border-[#5aa2ff]/25 bg-gradient-to-br from-[#bfe0ff]/12 via-[#3f7fd8]/10 to-transparent p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                          initial={{ opacity: 0, y: 16 }}
                          animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.8, y: 8 }}
                          transition={{ duration: 0.7, delay: 0.24 }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#5aa2ff]/15 text-[#bfe0ff] ring-1 ring-[#bfe0ff]/25">
                              <Star className="h-5 w-5 fill-current" />
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.2em] text-[#bfe0ff]/60">Kazanılan puan</p>
                              <p className="text-2xl font-semibold tracking-[-0.03em] text-white">+{rewardPoints.toLocaleString()}</p>
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
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Durum</p>
                        <p className="mt-1 text-lg font-semibold text-white">{phase === 'done' ? 'Kayıtlandı' : 'İşleniyor'}</p>
                        <p className="mt-1 text-sm text-white/55">Ödül hesabına güvenle işlendi.</p>
                      </Motion.div>
                    </Motion.div>

                    {content?.couponCode ? (
                      <Motion.div
                        className="space-y-3 rounded-[1.6rem] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        initial={{ opacity: 0, y: 18 }}
                        animate={phase === 'reveal' || phase === 'done' ? { opacity: 1, y: 0 } : { opacity: 0.08, y: 10 }}
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
                            aria-label={t('surpriseBoxes.copyCode') || 'Kupon kodunu kopyala'}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.05] px-4 py-3">
                          <code className="min-w-0 truncate font-mono text-lg font-semibold tracking-[0.22em] text-white">
                            {content.couponCode}
                          </code>
                          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-medium tracking-[0.18em] text-emerald-100 uppercase">
                            Aktif
                          </span>
                        </div>
                      </Motion.div>
                    ) : null}
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-xs text-white/45">
                      <Gift className="h-4 w-4 text-[#bfe0ff]" />
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
                className="absolute right-3 top-3 z-10 h-10 w-10 min-h-10 min-w-10 rounded-full border border-white/10 bg-black/30 text-white/85 hover:bg-black/45 hover:text-white sm:right-4 sm:top-4 sm:h-11 sm:w-11 sm:min-h-11 sm:min-w-11"
                onClick={onClose}
                aria-label={t('common.close') || 'Kapat'}
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </Motion.section>
          </div>
        </div>
      </Motion.div>
    </AnimatePresence>
  );
}

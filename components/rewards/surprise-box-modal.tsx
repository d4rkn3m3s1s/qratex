'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Sparkles, X, Copy, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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
      toast.success('Kupon kodu kopyalandı');
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && phase === 'done' && onClose()}
      >
        <motion.div
          className="relative w-full max-w-md"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}
        >
          {/* Parıltı / ışık halkası */}
          <motion.div
            className="absolute inset-0 rounded-3xl bg-gradient-to-r from-amber-400/30 via-yellow-300/40 to-amber-400/30"
            animate={{
              opacity: [0.3, 0.7, 0.3],
              scale: [1, 1.05, 1],
            }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ filter: 'blur(24px)' }}
          />

          {/* Kutu container */}
          <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-amber-500/50 shadow-2xl shadow-amber-500/20">
            {/* Üst kısım: kutu kapağı animasyonu */}
            <div className="relative h-40 flex items-center justify-center overflow-hidden">
              <motion.div
                className="absolute inset-0 bg-gradient-to-b from-amber-600/20 to-transparent"
                animate={phase === 'reveal' || phase === 'done' ? { opacity: 0 } : { opacity: 1 }}
              />
              <motion.div
                className="relative w-36 h-40 flex flex-col items-center justify-end"
                animate={
                  phase === 'shaking'
                    ? { rotate: [-2, 2, -2, 2, 0], transition: { duration: 0.6 } }
                    : phase === 'opening'
                      ? { scale: [1, 1.15], y: [0, -12] }
                      : {}
                }
              >
                {/* Kutu gövde */}
                <motion.div
                  className="relative w-32 h-24 rounded-b-lg bg-gradient-to-br from-amber-700 to-amber-900 border-2 border-amber-400/60 border-t-0"
                  style={{
                    boxShadow:
                      'inset 0 2px 8px rgba(255,255,255,0.12), 0 6px 20px rgba(0,0,0,0.35)',
                  }}
                  animate={
                    phase === 'opening' || phase === 'reveal' || phase === 'done'
                      ? { opacity: 0.6, scale: 0.95 }
                      : { opacity: 1, scale: 1 }
                  }
                >
                  <motion.div
                    className="absolute inset-0 rounded-b-lg bg-gradient-to-t from-amber-400/30 to-transparent"
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  {phase !== 'opening' && phase !== 'reveal' && phase !== 'done' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Gift className="w-10 h-10 text-amber-200/90 drop-shadow" />
                    </div>
                  )}
                </motion.div>
                {/* Kapak - açılınca yukarı uçar */}
                <motion.div
                  className="absolute left-1 top-0 w-14 h-10 origin-bottom-right rounded-tl-lg bg-gradient-to-b from-amber-500 to-amber-600 border-2 border-amber-400/60 border-b-0 shadow-lg"
                  style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.2)' }}
                  initial={{ y: 0 }}
                  animate={
                    phase === 'opening' || phase === 'reveal' || phase === 'done'
                      ? { y: -38, x: -8, opacity: 0.65, rotate: -18 }
                      : { y: 0, x: 0, opacity: 1, rotate: 0 }
                  }
                  transition={{ type: 'spring', damping: 16, stiffness: 200 }}
                />
                <motion.div
                  className="absolute right-1 top-0 w-14 h-10 origin-bottom-left rounded-tr-lg bg-gradient-to-b from-amber-500 to-amber-600 border-2 border-amber-400/60 border-b-0 shadow-lg"
                  style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.2)' }}
                  initial={{ y: 0 }}
                  animate={
                    phase === 'opening' || phase === 'reveal' || phase === 'done'
                      ? { y: -38, x: 8, opacity: 0.65, rotate: 18 }
                      : { y: 0, x: 0, opacity: 1, rotate: 0 }
                  }
                  transition={{ type: 'spring', damping: 16, stiffness: 200 }}
                />
                <motion.div
                  className="absolute top-5 h-16 w-2 rounded-full bg-gradient-to-b from-yellow-200/0 via-yellow-200 to-yellow-200/0"
                  initial={{ opacity: 0, scaleY: 0 }}
                  animate={
                    phase === 'reveal' || phase === 'done'
                      ? { opacity: [0.45, 0.9, 0.45], scaleY: [0.8, 1.15, 0.8] }
                      : { opacity: 0, scaleY: 0 }
                  }
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </motion.div>

              {/* Partiküller */}
              <AnimatePresence>
                {showParticles &&
                  [...Array(12)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-2 h-2 rounded-full bg-amber-300"
                      initial={{
                        x: 0,
                        y: 0,
                        opacity: 1,
                        scale: 1,
                      }}
                      animate={{
                        x: (Math.random() - 0.5) * 200,
                        y: -80 - Math.random() * 60,
                        opacity: 0,
                        scale: 0,
                      }}
                      transition={{ duration: 1.2, delay: i * 0.05 }}
                      exit={{ opacity: 0 }}
                    />
                  ))}
              </AnimatePresence>
            </div>

            {/* İçerik alanı */}
            <motion.div
              className="px-6 pb-6 pt-2 overflow-hidden"
              initial={{ opacity: 0, height: 0 }}
              animate={
                phase === 'reveal' || phase === 'done'
                  ? { opacity: 1, height: 'auto' }
                  : { opacity: 0, height: 0 }
              }
              transition={{ duration: 0.4 }}
            >
              <div className="flex items-center gap-2 text-amber-400 mb-3">
                <Sparkles className="w-5 h-5" />
                <span className="font-semibold text-sm uppercase tracking-wide">
                  Sürpriz Kutu Açıldı!
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {content?.title ?? 'Tebrikler!'}
              </h3>
              {content?.message && (
                <p className="text-slate-300 text-sm mb-4 whitespace-pre-wrap">{content.message}</p>
              )}
              {(content?.points !== undefined && content.points > 0) || pointsGranted > 0 ? (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 mb-4">
                  <Coins className="w-5 h-5 text-amber-400" />
                  <span className="text-amber-200 font-semibold">
                    +{(pointsGranted ?? content?.points ?? 0)} puan
                  </span>
                </div>
              ) : null}
              {content?.couponCode && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-700/50 border border-slate-600 px-3 py-2 mb-4">
                  <span className="text-slate-300 text-sm">Kupon kodu</span>
                  <div className="flex items-center gap-2">
                    <code className="text-amber-300 font-mono font-bold">
                      {content.couponCode}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 min-h-10 min-w-10 shrink-0 touch-manipulation text-slate-400 hover:text-white"
                      onClick={copyCode}
                      aria-label="Kupon kodunu kopyala"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              {phase === 'done' && (
                <Button
                  className="h-12 w-full min-h-12 touch-manipulation bg-amber-500 font-semibold text-slate-900 hover:bg-amber-600"
                  onClick={onClose}
                >
                  Harika!
                </Button>
              )}
            </motion.div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-1 -top-1 z-10 h-11 w-11 min-h-11 min-w-11 touch-manipulation rounded-full bg-slate-800 text-white hover:bg-slate-700 sm:-right-2 sm:-top-2"
            onClick={onClose}
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Gift,
  Star,
  Zap,
  Trophy,
  Sparkles,
  Coins,
  Crown,
  Heart,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { BRAND_ACCENT_PINK_HEX, BRAND_PRIMARY_HEX } from '@/lib/brand-colors';
import { CHART_HEX } from '@/lib/chart-palette';

interface Prize {
  id: string;
  label: string;
  value: number;
  type: 'points' | 'xp' | 'nothing';
  color: string;
  icon: React.ElementType;
}

const DEFAULT_PRIZES: Prize[] = [
  { id: 'spin_p_10', label: '10 Puan', value: 10, type: 'points', color: CHART_HEX.green, icon: Coins },
  { id: 'spin_p_25', label: '25 Puan', value: 25, type: 'points', color: CHART_HEX.blue, icon: Coins },
  { id: 'spin_p_50', label: '50 Puan', value: 50, type: 'points', color: BRAND_PRIMARY_HEX, icon: Star },
  { id: 'spin_p_100', label: '100 Puan', value: 100, type: 'points', color: CHART_HEX.amber, icon: Trophy },
  { id: 'spin_x_20', label: '20 XP', value: 20, type: 'xp', color: CHART_HEX.pink, icon: Zap },
  { id: 'spin_x_50', label: '50 XP', value: 50, type: 'xp', color: CHART_HEX.teal, icon: Zap },
  { id: 'spin_n_0', label: 'Tekrar Dene', value: 0, type: 'nothing', color: CHART_HEX.slate, icon: Heart },
];

interface SpinWheelProps {
  onPrizeWon?: (prize: Prize) => void;
  compact?: boolean;
  disabled?: boolean;
  lastSpinDate?: string | null;
}

export function SpinWheel({ onPrizeWon, compact = false, disabled = false, lastSpinDate }: SpinWheelProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [selectedPrize, setSelectedPrize] = useState<Prize | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [canSpin, setCanSpin] = useState(true);
  const [prizes, setPrizes] = useState<Prize[]>(DEFAULT_PRIZES);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Check if user can spin today
  useEffect(() => {
    if (lastSpinDate) {
      const lastSpin = new Date(lastSpinDate);
      const today = new Date();
      const isSameDay = lastSpin.toDateString() === today.toDateString();
      setCanSpin(!isSameDay);
    }
  }, [lastSpinDate]);

  useEffect(() => {
    const loadSpinState = async () => {
      try {
        const res = await fetch('/api/gamification/spin', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || data?.error) return;

        if (Array.isArray(data.prizes) && data.prizes.length > 0) {
          const mapped: Prize[] = data.prizes.map(
            (
              prize: { id?: string; label?: string; type?: 'points' | 'xp' | 'nothing'; value?: number },
              index: number
            ) => {
              const fallback = DEFAULT_PRIZES[index % DEFAULT_PRIZES.length];
              const type = prize.type === 'points' || prize.type === 'xp' || prize.type === 'nothing' ? prize.type : fallback.type;
              const icon = type === 'points' ? Coins : type === 'xp' ? Zap : Heart;
              const palette = [
                CHART_HEX.green,
                CHART_HEX.blue,
                BRAND_PRIMARY_HEX,
                CHART_HEX.amber,
                CHART_HEX.pink,
                CHART_HEX.teal,
                CHART_HEX.slate,
              ];
              return {
                id: prize.id || fallback.id,
                label: prize.label || fallback.label,
                type,
                value: Number(prize.value ?? fallback.value),
                color: palette[index % palette.length],
                icon,
              };
            }
          );
          setPrizes(mapped);
        }

        setCanSpin(Boolean(data.canSpin));
      } catch (error) {
        console.error('Spin state load failed:', error);
      }
    };
    loadSpinState();
  }, []);

  const segmentAngle = 360 / Math.max(prizes.length, 1);

  const spinWheel = async () => {
    if (isSpinning || disabled || !canSpin) return;

    setIsSpinning(true);
    setSelectedPrize(null);
    setShowResult(false);

    try {
      const res = await fetch('/api/gamification/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.prize) {
        setIsSpinning(false);
        if (data?.canSpin === false) {
          setCanSpin(false);
        }
        toast.error(data?.error || 'Çark çevrilemedi');
        return;
      }

      const apiPrize = data.prize as {
        id?: string;
        type: 'points' | 'xp' | 'nothing';
        value: number;
        label: string;
        index?: number;
      };
      const selectedIndexFromId = prizes.findIndex((p) => p.id === apiPrize.id);
      const selectedIndex =
        selectedIndexFromId >= 0
          ? selectedIndexFromId
          : typeof apiPrize.index === 'number'
            ? Math.max(0, Math.min(prizes.length - 1, apiPrize.index))
            : 0;
      const prize = prizes[selectedIndex];

      if (!prize) {
        setIsSpinning(false);
        toast.error('Çark ödülü eşleştirilemedi');
        return;
      }

      const prizeAngle = selectedIndex * segmentAngle + segmentAngle / 2;
      const spins = 5 + Math.random() * 3;
      const finalRotation = rotation + spins * 360 + (360 - prizeAngle);
      setRotation(finalRotation);

      setTimeout(() => {
        setIsSpinning(false);
        setSelectedPrize(prize);
        setShowResult(true);
        setCanSpin(false);

        if (prize.type === 'points') {
          toast.success(`🎉 ${prize.value} puan hesabına eklendi!`);
        } else if (prize.type === 'xp') {
          toast.success(`⚡ ${prize.value} XP kazandın!`);
        } else {
          toast.info('Bir dahaki sefere şansın açık olsun!');
        }

        if (prize.type !== 'nothing' && prize.value >= 50) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: [BRAND_PRIMARY_HEX, BRAND_ACCENT_PINK_HEX, CHART_HEX.amber, CHART_HEX.green],
          });
        }

        if (onPrizeWon) {
          onPrizeWon(prize);
        }
      }, 4000);
    } catch (error) {
      console.error('Spin failed:', error);
      setIsSpinning(false);
      toast.error('Bağlantı hatası - çark çevrilemedi');
    }
  };

  if (compact) {
    return (
      <Card className="bg-card border-border/50 overflow-hidden h-full">
        <CardContent className="p-4 flex flex-col items-center justify-center h-full">
          {/* Mini Wheel */}
          <div className="relative w-14 h-14 mb-2">
            <m.div
              ref={wheelRef}
              className="w-full h-full rounded-full"
              style={{
                background: `conic-gradient(${prizes.map((p, i) =>
                  `${p.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`
                ).join(', ')})`,
                boxShadow: '0 0 15px rgba(139, 92, 246, 0.4)',
              }}
              animate={{ rotate: rotation }}
              transition={{ duration: 4, ease: [0.2, 0.8, 0.2, 1] }}
            />
            {/* Center */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
                <Sparkles className="h-3 w-3 text-white" />
              </div>
            </div>
            {/* Pointer */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent border-t-amber-400 drop-shadow-lg" />
          </div>

          {canSpin && !disabled ? (
            <Button
              onClick={spinWheel}
              disabled={isSpinning}
              size="sm"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8"
            >
              {isSpinning ? (
                <m.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="h-3 w-3" />
                </m.div>
              ) : (
                <span className="flex items-center gap-1">
                  <Gift className="h-3 w-3" />
                  Çevir!
                </span>
              )}
            </Button>
          ) : (
            <p className="text-[10px] text-center text-muted-foreground">
              {selectedPrize ? (
                <span className="text-green-400 font-medium">🎉 {selectedPrize.label}</span>
              ) : (
                'Yarın gel!'
              )}
            </p>
          )}
        </CardContent>

        {/* Result Dialog */}
        <Dialog open={showResult} onOpenChange={setShowResult}>
          <DialogContent className="bg-card border-border text-center max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-2xl">
                {selectedPrize?.type !== 'nothing' ? '🎉 Tebrikler!' : '😅 Bir Dahaki Sefere!'}
              </DialogTitle>
            </DialogHeader>
            {selectedPrize && (
              <m.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="py-6"
              >
                <div
                  className="w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-4"
                  style={{ backgroundColor: selectedPrize.color + '30' }}
                >
                  <selectedPrize.icon className="h-12 w-12" style={{ color: selectedPrize.color }} />
                </div>
                <p className="text-3xl font-bold text-foreground mb-2">{selectedPrize.label}</p>
                <p className="text-muted-foreground">
                  {selectedPrize.type === 'points' && 'Puanlar hesabına eklendi!'}
                  {selectedPrize.type === 'xp' && 'XP kazandın!'}
                  {selectedPrize.type === 'nothing' && 'Yarın tekrar dene!'}
                </p>
              </m.div>
            )}
            <Button onClick={() => setShowResult(false)} className="w-full">
              Tamam
            </Button>
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  // Full size wheel
  return (
    <Card className="bg-card border-border/50 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 justify-center">
          <Gift className="h-5 w-5 text-primary" />
          Günlük Şans Çarkı
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-6">
        {/* Wheel Container */}
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl scale-110" />

          {/* Wheel */}
          <div className="relative w-64 h-64 md:w-80 md:h-80">
            <m.div
              ref={wheelRef}
              className="w-full h-full rounded-full relative overflow-hidden"
              style={{
                boxShadow: '0 0 40px rgba(139, 92, 246, 0.5), inset 0 0 20px rgba(0,0,0,0.3)',
              }}
              animate={{ rotate: rotation }}
              transition={{ duration: 4, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {prizes.map((prize, index) => {
                const startAngle = index * segmentAngle;
                const Icon = prize.icon;
                return (
                  <div
                    key={prize.id}
                    className="absolute w-full h-full"
                    style={{
                      background: `conic-gradient(from ${startAngle}deg, ${prize.color} 0deg, ${prize.color} ${segmentAngle}deg, transparent ${segmentAngle}deg)`,
                    }}
                  >
                    {/* Prize label and icon */}
                    <div
                      className="absolute flex flex-col items-center justify-center"
                      style={{
                        transform: `rotate(${startAngle + segmentAngle / 2}deg)`,
                        transformOrigin: 'center center',
                        left: '50%',
                        top: '15%',
                        marginLeft: '-30px',
                      }}
                    >
                      <Icon className="h-5 w-5 text-white drop-shadow-lg mb-1" />
                      <span className="text-[10px] font-bold text-white drop-shadow-lg whitespace-nowrap">
                        {prize.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </m.div>

            {/* Center button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <m.div
                className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary flex items-center justify-center shadow-2xl cursor-pointer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={spinWheel}
              >
                <Sparkles className="h-8 w-8 text-white" />
              </m.div>
            </div>

            {/* Pointer */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
              <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-amber-400 drop-shadow-lg" />
            </div>
          </div>
        </div>

        {/* Spin Button */}
        {canSpin && !disabled ? (
          <Button
            onClick={spinWheel}
            disabled={isSpinning}
            size="lg"
            className="w-full max-w-xs bg-primary hover:bg-primary/90 text-primary-foreground text-lg font-bold"
          >
            {isSpinning ? (
              <span className="flex items-center gap-2">
                <m.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="h-5 w-5" />
                </m.div>
                Çark Dönüyor...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Gift className="h-5 w-5" />
                Çarkı Çevir!
              </span>
            )}
          </Button>
        ) : (
          <div className="text-center p-4 rounded-lg bg-slate-800/50 w-full max-w-xs">
            <p className="text-muted-foreground">
              {selectedPrize ? (
                <>
                  <span className="text-green-400 font-bold text-lg block mb-1">
                    🎉 {selectedPrize.label} kazandın!
                  </span>
                  <span className="text-sm">Yarın tekrar çevirebilirsin</span>
                </>
              ) : (
                'Bugünlük hakkını kullandın. Yarın tekrar gel!'
              )}
            </p>
          </div>
        )}

        {/* Prize list */}
        <div className="grid grid-cols-4 gap-2 w-full max-w-md">
          {prizes.map((prize) => (
            <div
              key={prize.id}
              className="flex flex-col items-center p-2 rounded-lg bg-black/20 border border-white/5"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center mb-1"
                style={{ backgroundColor: prize.color + '30' }}
              >
                <prize.icon className="h-4 w-4" style={{ color: prize.color }} />
              </div>
              <span className="text-[10px] text-muted-foreground text-center">{prize.label}</span>
            </div>
          ))}
        </div>
      </CardContent>

      {/* Result Dialog */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="bg-card border-border text-center max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {selectedPrize?.type !== 'nothing' ? '🎉 Tebrikler!' : '😅 Bir Dahaki Sefere!'}
            </DialogTitle>
          </DialogHeader>
          {selectedPrize && (
            <m.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="py-6"
            >
              <div
                className="w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-4"
                style={{ backgroundColor: selectedPrize.color + '30' }}
              >
                <selectedPrize.icon className="h-12 w-12" style={{ color: selectedPrize.color }} />
              </div>
              <p className="text-3xl font-bold text-foreground mb-2">{selectedPrize.label}</p>
              <p className="text-muted-foreground">
                {selectedPrize.type === 'points' && 'Puanlar hesabına eklendi!'}
                {selectedPrize.type === 'xp' && 'XP kazandın!'}
                {selectedPrize.type === 'nothing' && 'Yarın tekrar dene!'}
              </p>
            </m.div>
          )}
          <Button onClick={() => setShowResult(false)} className="w-full">
            Tamam
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


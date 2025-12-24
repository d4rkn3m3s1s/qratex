'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

interface Prize {
  id: number;
  label: string;
  value: number;
  type: 'points' | 'xp' | 'badge' | 'multiplier' | 'nothing';
  color: string;
  icon: React.ElementType;
  probability: number;
}

const prizes: Prize[] = [
  { id: 1, label: '10 Puan', value: 10, type: 'points', color: '#22c55e', icon: Coins, probability: 25 },
  { id: 2, label: '25 Puan', value: 25, type: 'points', color: '#3b82f6', icon: Coins, probability: 20 },
  { id: 3, label: '50 Puan', value: 50, type: 'points', color: '#8b5cf6', icon: Star, probability: 15 },
  { id: 4, label: '100 Puan', value: 100, type: 'points', color: '#f59e0b', icon: Trophy, probability: 10 },
  { id: 5, label: '20 XP', value: 20, type: 'xp', color: '#ec4899', icon: Zap, probability: 15 },
  { id: 6, label: '50 XP', value: 50, type: 'xp', color: '#14b8a6', icon: Zap, probability: 8 },
  { id: 7, label: '2x Bonus', value: 2, type: 'multiplier', color: '#f97316', icon: Crown, probability: 5 },
  { id: 8, label: 'Tekrar Dene', value: 0, type: 'nothing', color: '#64748b', icon: Heart, probability: 2 },
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

  const segmentAngle = 360 / prizes.length;

  const spinWheel = async () => {
    if (isSpinning || disabled || !canSpin) return;

    setIsSpinning(true);
    setSelectedPrize(null);
    setShowResult(false);

    // Weighted random selection
    const totalProbability = prizes.reduce((sum, p) => sum + p.probability, 0);
    let random = Math.random() * totalProbability;
    let selectedIndex = 0;

    for (let i = 0; i < prizes.length; i++) {
      random -= prizes[i].probability;
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }

    const prize = prizes[selectedIndex];
    
    // Calculate rotation to land on selected prize
    const prizeAngle = selectedIndex * segmentAngle + segmentAngle / 2;
    const spins = 5 + Math.random() * 3; // 5-8 full rotations
    const finalRotation = rotation + (spins * 360) + (360 - prizeAngle);

    setRotation(finalRotation);

    // Wait for animation
    setTimeout(() => {
      setIsSpinning(false);
      setSelectedPrize(prize);
      setShowResult(true);
      setCanSpin(false);

      // Trigger confetti for good prizes
      if (prize.type !== 'nothing' && prize.value >= 50) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#8b5cf6', '#d946ef', '#f59e0b', '#22c55e'],
        });
      }

      // Callback
      if (onPrizeWon) {
        onPrizeWon(prize);
      }

      // Save to API
      saveSpin(prize);
    }, 4000);
  };

  const saveSpin = async (prize: Prize) => {
    try {
      await fetch('/api/gamification/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prizeType: prize.type,
          prizeValue: prize.value,
          prizeLabel: prize.label,
        }),
      });
    } catch (error) {
      console.error('Failed to save spin:', error);
    }
  };

  if (compact) {
    return (
      <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30 overflow-hidden h-full">
        <CardContent className="p-4 flex flex-col items-center justify-center h-full">
          {/* Mini Wheel */}
          <div className="relative w-14 h-14 mb-2">
            <motion.div
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
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
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
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-xs h-8"
            >
              {isSpinning ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="h-3 w-3" />
                </motion.div>
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
          <DialogContent className="bg-gradient-to-br from-slate-900 to-slate-950 border-purple-500/30 text-center max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-2xl">
                {selectedPrize?.type !== 'nothing' ? '🎉 Tebrikler!' : '😅 Bir Dahaki Sefere!'}
              </DialogTitle>
            </DialogHeader>
            {selectedPrize && (
              <motion.div
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
                <p className="text-3xl font-bold text-white mb-2">{selectedPrize.label}</p>
                <p className="text-muted-foreground">
                  {selectedPrize.type === 'points' && 'Puanlar hesabına eklendi!'}
                  {selectedPrize.type === 'xp' && 'XP kazandın!'}
                  {selectedPrize.type === 'multiplier' && 'Sonraki puanların 2 katı!'}
                  {selectedPrize.type === 'nothing' && 'Yarın tekrar dene!'}
                </p>
              </motion.div>
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
    <Card className="bg-gradient-to-br from-slate-900/50 to-slate-950/50 border-purple-500/30 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 justify-center">
          <Gift className="h-5 w-5 text-purple-400" />
          Günlük Şans Çarkı
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-6">
        {/* Wheel Container */}
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 blur-2xl scale-110" />
          
          {/* Wheel */}
          <div className="relative w-64 h-64 md:w-80 md:h-80">
            <motion.div
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
            </motion.div>

            {/* Center button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-2xl cursor-pointer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={spinWheel}
              >
                <Sparkles className="h-8 w-8 text-white" />
              </motion.div>
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
            className="w-full max-w-xs bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-lg font-bold"
          >
            {isSpinning ? (
              <span className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="h-5 w-5" />
                </motion.div>
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
        <DialogContent className="bg-gradient-to-br from-slate-900 to-slate-950 border-purple-500/30 text-center max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {selectedPrize?.type !== 'nothing' ? '🎉 Tebrikler!' : '😅 Bir Dahaki Sefere!'}
            </DialogTitle>
          </DialogHeader>
          {selectedPrize && (
            <motion.div
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
              <p className="text-3xl font-bold text-white mb-2">{selectedPrize.label}</p>
              <p className="text-muted-foreground">
                {selectedPrize.type === 'points' && 'Puanlar hesabına eklendi!'}
                {selectedPrize.type === 'xp' && 'XP kazandın!'}
                {selectedPrize.type === 'multiplier' && 'Sonraki puanların 2 katı!'}
                {selectedPrize.type === 'nothing' && 'Yarın tekrar dene!'}
              </p>
            </motion.div>
          )}
          <Button onClick={() => setShowResult(false)} className="w-full">
            Tamam
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


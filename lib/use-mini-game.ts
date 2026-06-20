'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { primeAudio } from '@/lib/game-sounds';

/**
 * Tüm yeni mini oyunların ortak yaşam döngüsü hook'u. Generic start/complete
 * API'larını (app/api/customer/games/[game]/...) çağırır, "günde 1 hak"ı yönetir,
 * süreyi ölçer ve ödül toast'ını gösterir. Oyunun kendisi sadece oynanışa ve
 * `score`/`won` üretmeye odaklanır.
 *
 * Akış:
 *   const g = useMiniGame('mind-thief');
 *   g.start()        → sunucu oturumu açar; izinliyse phase='playing'
 *   g.finish(score, won) → sonucu sunucuda doğrular, ödül verir; phase='done'
 */
export type MiniGamePhase =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'submitting'
  | 'done';

export interface MiniGameConfig {
  maxScore: number;
  rewardThreshold: number;
  rewardPoints: number;
}

export interface MiniGameResult {
  rewarded: boolean;
  rewardPoints: number;
  rewardXp: number;
  score: number;
  won: boolean;
  /** Güncel günlük oyun serisi (bu tamamlama sonrası). 0 = bonus verilmedi. */
  streak: number;
  /** Bu tamamlamada verilen seri bonus XP'si. */
  streakBonusXp: number;
  /** Bu tamamlamayla yeni açılan başarımlar. */
  newAchievements: { id: string; title: string; icon: string }[];
}

export function useMiniGame(gameType: string) {
  const [phase, setPhase] = useState<MiniGamePhase>('idle');
  const [config, setConfig] = useState<MiniGameConfig | null>(null);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [result, setResult] = useState<MiniGameResult | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef(0);

  /** Sunucu oturumunu açar. İzinliyse phase='playing' yapar. */
  const start = useCallback(async (): Promise<boolean> => {
    primeAudio();
    setPhase('starting');
    setResult(null);
    try {
      const res = await fetch(`/api/customer/games/${gameType}/start`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Oyun başlatılamadı');
      }
      if (json.alreadyPlayed || json.canPlay === false) {
        setAlreadyPlayed(true);
        setPhase('done');
        return false;
      }
      sessionIdRef.current = json.sessionId ?? null;
      if (json.config) setConfig(json.config as MiniGameConfig);
      startTimeRef.current = Date.now();
      setPhase('playing');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oyun başlatılamadı');
      setPhase('idle');
      return false;
    }
  }, [gameType]);

  /** Oyunu bitirir: sonucu sunucuda doğrular, ödülü gösterir. */
  const finish = useCallback(
    async (score: number, won: boolean): Promise<void> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        setPhase('done');
        return;
      }
      setPhase('submitting');
      const durationSec = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
      try {
        const res = await fetch(`/api/customer/games/${gameType}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, score: Math.floor(score), durationSec, won }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || 'Sonuç kaydedilemedi');
        }
        const r: MiniGameResult = {
          rewarded: !!json.rewarded,
          rewardPoints: json.rewardPoints ?? 0,
          rewardXp: json.rewardXp ?? 0,
          score: Math.floor(score),
          won,
          streak: json.streak ?? 0,
          streakBonusXp: json.streakBonusXp ?? 0,
          newAchievements: Array.isArray(json.newAchievements) ? json.newAchievements : [],
        };
        setResult(r);
        if (r.rewarded) {
          toast.success(`🎉 ${r.rewardPoints} puan + ${r.rewardXp} XP kazandın!`);
        } else if (won) {
          toast.message('Kazandın ama ödül eşiğini geçemedin. Yarın tekrar dene!');
        }
        // Seri bonusu (günün ilk oyunu): ayrı, motive edici toast.
        if (r.streakBonusXp > 0) {
          const fire = '🔥'.repeat(Math.min(5, Math.max(1, Math.ceil(r.streak / 3))));
          toast.success(`${fire} ${r.streak} günlük seri! +${r.streakBonusXp} bonus XP`);
        }
        // Yeni başarımlar — her biri için kutlama toast'ı.
        for (const a of r.newAchievements) {
          toast.success(`🏆 Yeni başarım: ${a.icon} ${a.title}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Sonuç kaydedilemedi');
        setResult({ rewarded: false, rewardPoints: 0, rewardXp: 0, score: Math.floor(score), won, streak: 0, streakBonusXp: 0, newAchievements: [] });
      } finally {
        sessionIdRef.current = null;
        setPhase('done');
      }
    },
    [gameType]
  );

  return { phase, config, alreadyPlayed, result, start, finish };
}

'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { moments } from '@/lib/moments/client';
import { primeAudio } from '@/lib/game-sounds';

/**
 * Tüm yeni mini oyunların ortak yaşam döngüsü hook'u. Generic start/complete
 * API'larını (app/api/customer/games/[game]/...) çağırır, "günde 1 deneme"yi yönetir,
 * süreyi ölçer ve ödül toast'ını gösterir. Oyunun kendisi sadece oynanışa ve
 * `score`/`won` üretmeye odaklanır.
 *
 * Akış:
 *   const g = useMiniGame('mind-thief');
 *   g.start()        → sunucu denemesi açar (deneme başlangıçta harcanır); izinliyse phase='playing'
 *   g.finish(score, won) → sonucu sunucu doğrular ve KARAR VERİR; phase='done'
 *
 * Sunucu otoritesi (P0-17): `won` artık yalnız kozmetik bir ipucu; kazanma ve ödül kararı
 * sunucudadır (skor kırpma + süre/sn başına skor makullüğü). `result.won` sunucunun
 * kararıdır. start'ın verdiği imzalı `attemptToken` complete'e otomatik eklenir.
 *
 * Sözleşme geriye uyumlu: { phase, config, alreadyPlayed, result, start, finish } aynı;
 * eklenenler: `seed`, `playedOutcome`, `lockedMessage`.
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
  /** Etkin (admin override sonrası) değerler — sunucu start cevabından. */
  rewardXp?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  title?: string;
  description?: string;
  emoji?: string;
  accent?: string;
}

export interface MiniGameResult {
  rewarded: boolean;
  rewardPoints: number;
  rewardXp: number;
  score: number;
  /** Sunucunun kazanma kararı. */
  won: boolean;
  /** Güncel günlük oyun serisi (bu tamamlama sonrası). 0 = bonus verilmedi. */
  streak: number;
  /** Bu tamamlamada verilen seri bonus XP'si. */
  streakBonusXp: number;
  /** Bu tamamlamayla yeni açılan başarımlar. */
  newAchievements: { id: string; title: string; icon: string }[];
  /** Kazanılamadıysa / ödül yoksa sunucunun Türkçe gerekçesi. */
  reason?: string | null;
  /** Günlük oyun puanı tavanı ödülü kısalttı mı. */
  capped?: boolean;
}

export function useMiniGame(gameType: string) {
  const [phase, setPhase] = useState<MiniGamePhase>('idle');
  const [config, setConfig] = useState<MiniGameConfig | null>(null);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [playedOutcome, setPlayedOutcome] = useState<'won' | 'lost' | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [result, setResult] = useState<MiniGameResult | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const startTimeRef = useRef(0);
  // Çift finish (ör. süre bitişi + son dokunuş aynı karede) tek gönderime iner.
  const finishingRef = useRef(false);

  /** Sunucu denemesini açar. İzinliyse phase='playing' yapar. */
  const start = useCallback(async (): Promise<boolean> => {
    primeAudio();
    setPhase('starting');
    setResult(null);
    finishingRef.current = false;
    try {
      const res = await fetch(`/api/customer/games/${gameType}/start`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Oyun başlatılamadı');
      }
      if (json.alreadyPlayed || json.canPlay === false) {
        setAlreadyPlayed(true);
        setPlayedOutcome(json.outcome === 'won' || json.outcome === 'lost' ? json.outcome : null);
        setLockedMessage(typeof json.message === 'string' ? json.message : null);
        setPhase('done');
        return false;
      }
      sessionIdRef.current = json.sessionId ?? null;
      tokenRef.current = typeof json.attemptToken === 'string' ? json.attemptToken : null;
      setSeed(typeof json.seed === 'string' ? json.seed : null);
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

  /** Oyunu bitirir: sonucu sunucu doğrular ve karar verir; ödülü gösterir. */
  const finish = useCallback(
    async (score: number, won: boolean): Promise<void> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        setPhase('done');
        return;
      }
      if (finishingRef.current) return;
      finishingRef.current = true;
      setPhase('submitting');
      const durationSec = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
      try {
        const res = await fetch(`/api/customer/games/${gameType}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            score: Math.max(0, Math.floor(score)),
            durationSec,
            won,
            attemptToken: tokenRef.current,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || 'Sonuç kaydedilemedi');
        }
        const serverWon = typeof json.won === 'boolean' ? json.won : won;
        const r: MiniGameResult = {
          rewarded: !!json.rewarded,
          rewardPoints: json.rewardPoints ?? 0,
          rewardXp: json.rewardXp ?? 0,
          score: typeof json.score === 'number' ? json.score : Math.floor(score),
          won: serverWon,
          streak: json.streak ?? 0,
          streakBonusXp: json.streakBonusXp ?? 0,
          newAchievements: Array.isArray(json.newAchievements) ? json.newAchievements : [],
          reason: typeof json.reason === 'string' ? json.reason : null,
          capped: !!json.capped,
        };
        setResult(r);
        // Tekrar gönderim (ağ tekrarı): kayıtlı sonuç; kutlamayı yineleme.
        if (!json.alreadyCompleted) {
          if (r.rewarded) {
            // An Motoru puan kapsülü; Host yoksa eski toast yedeği (çift bildirim yok).
            if (!moments.points({ points: r.rewardPoints, xp: r.rewardXp })) {
              toast.success(`🎉 ${r.rewardPoints} puan + ${r.rewardXp} XP kazandın!`);
            }
          } else if (r.reason) {
            toast.message(r.reason);
          } else if (serverWon) {
            toast.message('Kazandın ama ödül eşiğini geçemedin. Yarın tekrar dene!');
          }
          // Seri bonusu (günün ilk kazanılan oyunu): ayrı, motive edici toast.
          if (r.streakBonusXp > 0) {
            const fire = '🔥'.repeat(Math.min(5, Math.max(1, Math.ceil(r.streak / 3))));
            toast.success(`${fire} ${r.streak} günlük seri! +${r.streakBonusXp} bonus XP`);
          }
          // Seviye/lig/rozet anları sunucuda kayıtlı → Host hemen çekip tam bir kez oynatır.
          if (r.rewarded || r.streakBonusXp > 0) moments.refresh();
          // Yeni başarımlar — her biri için kutlama toast'ı.
          for (const a of r.newAchievements) {
            toast.success(`🏆 Yeni başarım: ${a.icon} ${a.title}`);
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Sonuç kaydedilemedi');
        setResult({
          rewarded: false,
          rewardPoints: 0,
          rewardXp: 0,
          score: Math.floor(score),
          won,
          streak: 0,
          streakBonusXp: 0,
          newAchievements: [],
          reason: null,
        });
      } finally {
        sessionIdRef.current = null;
        tokenRef.current = null;
        setPhase('done');
      }
    },
    [gameType]
  );

  return { phase, config, alreadyPlayed, result, start, finish, seed, playedOutcome, lockedMessage };
}

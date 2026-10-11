'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { moments } from '@/lib/moments/client';
import { primeAudio } from '@/lib/game-sounds';
import { track } from '@/lib/analytics';
import type { PublicContentItem } from '@/lib/games/verify/types';

/** complete yeniden deneme beklemeleri (ms). Sunucu idempotent: aynı deneme tekrar gönderilebilir. */
const COMPLETE_RETRY_DELAYS_MS = [800, 2000] as const;

/** Ağ hatası ya da geçici sunucu hatası (429/5xx) → yeniden denenebilir; 4xx kalıcıdır. */
function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * complete'i gönderir; ağ hatası ve geçici hatalarda kısa beklemeyle yeniden dener. Oturum
 * sunucuda idempotent kapanır (aynı deneme → kayıtlı sonuç), çift ödül olmaz. Böylece kısa
 * bir bağlantı kopması dürüst oyuncunun ödüllü denemesini "yarım kaldı → kayıp"a çevirmez.
 */
async function postCompleteWithRetry(url: string, body: string): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!isTransientStatus(res.status) || i >= COMPLETE_RETRY_DELAYS_MS.length) return res;
    } catch (e) {
      if (i >= COMPLETE_RETRY_DELAYS_MS.length) throw e;
    }
    await new Promise((r) => setTimeout(r, COMPLETE_RETRY_DELAYS_MS[i]));
  }
}

/**
 * Tüm mini oyunların ortak yaşam döngüsü hook'u. Generic start/complete/practice
 * API'larını (app/api/customer/games/[game]/...) çağırır, "günde 1 sıralı deneme"yi yönetir,
 * süreyi ölçer ve ödül bildirimini gösterir. Oyunun kendisi yalnız oynanışa ve
 * `score`/`won` (+ sıralıda doğrulama kanıtı) üretmeye odaklanır.
 *
 * Akış:
 *   const g = useMiniGame('mind-thief');
 *   g.start()                    → SIRALI: sunucu denemesi açar (başlangıçta harcanır)
 *                                  PRATİK: ödülsüz tur (yeni tohum; sınıflandırmada etiketli içerik)
 *   g.finish(score, won, proof?) → SIRALI: sonucu sunucu doğrular ve KARAR VERİR
 *                                  PRATİK: yerel sonuç (sunucuya gitmez, puan yok)
 *
 * İki mod (yol haritası §7.2 ilke 2): `mode` = 'ranked' (varsayılan; eski bileşenler değişmeden
 * çalışır) | 'practice'. `setMode` yalnız tur dışında (idle/done) geçerlidir.
 *
 * Sunucu otoritesi (P0-17 + lib/games/verify): `won` yalnız kozmetik bir ipucu; kazanma ve
 * ödül kararı sunucudadır. `result.won` sunucunun kararıdır. start'ın verdiği imzalı
 * `attemptToken` ve oyunun kanıtı (`proof`) complete'e otomatik eklenir.
 *
 * Sözleşme geriye uyumlu: { phase, config, alreadyPlayed, result, start, finish, seed,
 * playedOutcome, lockedMessage } aynı; eklenenler: `mode`, `setMode`, `content`,
 * `answerKey`, `reset`.
 */
export type MiniGamePhase =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'submitting'
  | 'done';

export type MiniGameMode = 'ranked' | 'practice';

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
  /** Sunucunun kazanma kararı (pratikte istemcinin kozmetik bildirimi). */
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
  /** Pratik turu sonucu (ödülsüz, sunucuya gönderilmedi). */
  practice?: boolean;
}

export interface UseMiniGameOptions {
  /** Başlangıç modu (varsayılan 'ranked'). */
  initialMode?: MiniGameMode;
}

export function useMiniGame(gameType: string, options: UseMiniGameOptions = {}) {
  const [phase, setPhase] = useState<MiniGamePhase>('idle');
  const [mode, setModeState] = useState<MiniGameMode>(options.initialMode ?? 'ranked');
  const [config, setConfig] = useState<MiniGameConfig | null>(null);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [playedOutcome, setPlayedOutcome] = useState<'won' | 'lost' | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [content, setContent] = useState<PublicContentItem[] | null>(null);
  const [answerKey, setAnswerKey] = useState<Record<string, string> | null>(null);
  const [result, setResult] = useState<MiniGameResult | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const startTimeRef = useRef(0);
  const modeRef = useRef<MiniGameMode>(mode);
  const phaseRef = useRef<MiniGamePhase>('idle');
  // Çift finish (ör. süre bitişi + son dokunuş aynı karede) tek gönderime iner.
  const finishingRef = useRef(false);

  const go = useCallback((p: MiniGamePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  /** Modu değiştirir (tur sürerken yok sayılır). */
  const setMode = useCallback(
    (m: MiniGameMode) => {
      const p = phaseRef.current;
      if (p === 'starting' || p === 'playing' || p === 'submitting') return;
      modeRef.current = m;
      setModeState(m);
      setResult(null);
      go('idle');
    },
    [go]
  );

  /** Sonuç/kilit ekranından başlangıç ekranına döner. */
  const reset = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'starting' || p === 'playing' || p === 'submitting') return;
    setResult(null);
    go('idle');
  }, [go]);

  const startPractice = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`/api/customer/games/${gameType}/practice`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || 'Pratik turu başlatılamadı');
    sessionIdRef.current = null;
    tokenRef.current = null;
    setSeed(typeof json.seed === 'string' ? json.seed : null);
    setContent(Array.isArray(json.content) ? (json.content as PublicContentItem[]) : null);
    setAnswerKey(json.answerKey && typeof json.answerKey === 'object' ? (json.answerKey as Record<string, string>) : null);
    if (json.config) setConfig(json.config as MiniGameConfig);
    startTimeRef.current = Date.now();
    track('game_start', { gameType, mode: 'practice' });
    go('playing');
    return true;
  }, [gameType, go]);

  /** Denemeyi/turu açar. İzinliyse phase='playing' yapar. */
  const start = useCallback(async (): Promise<boolean> => {
    // Yeniden giriş koruması: "starting" sırasında CTA'ya ikinci dokunuş / Enter-Space tekrarı
    // birden çok /start isteği atıyor ve her biri startTimeRef'i sıfırlayıp istemci süresini
    // kısaltıyordu (e2e: 4 paralel /start → complete "too_fast"). Tur sürerken başlatma yok.
    const p = phaseRef.current;
    if (p === 'starting' || p === 'playing' || p === 'submitting') return false;
    primeAudio();
    go('starting');
    setResult(null);
    finishingRef.current = false;
    try {
      if (modeRef.current === 'practice') return await startPractice();

      const res = await fetch(`/api/customer/games/${gameType}/start`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Oyun başlatılamadı');
      }
      if (json.alreadyPlayed || json.canPlay === false) {
        track('game_locked', { gameType, outcome: json.outcome ?? null });
        setAlreadyPlayed(true);
        setPlayedOutcome(json.outcome === 'won' || json.outcome === 'lost' ? json.outcome : null);
        setLockedMessage(typeof json.message === 'string' ? json.message : null);
        go('done');
        return false;
      }
      sessionIdRef.current = json.sessionId ?? null;
      tokenRef.current = typeof json.attemptToken === 'string' ? json.attemptToken : null;
      setSeed(typeof json.seed === 'string' ? json.seed : null);
      setContent(Array.isArray(json.content) ? (json.content as PublicContentItem[]) : null);
      setAnswerKey(null); // sıralıda etiket istemciye ASLA gelmez
      if (json.config) setConfig(json.config as MiniGameConfig);
      startTimeRef.current = Date.now();
      track('game_start', { gameType, mode: 'ranked', resumed: !!json.resumed });
      go('playing');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oyun başlatılamadı');
      go('idle');
      return false;
    }
  }, [gameType, go, startPractice]);

  /**
   * Oyunu bitirir. Sıralıda sonucu sunucu doğrular ve karar verir; pratikte yerel sonuç.
   * `proof`: oyunun doğrulayıcı ailesine uygun kanıt (lib/games/verify) — sıralıda gönderilir.
   */
  const finish = useCallback(
    async (score: number, won: boolean, proof?: unknown): Promise<void> => {
      if (finishingRef.current) return;

      if (modeRef.current === 'practice') {
        finishingRef.current = true;
        track('game_end', {
          gameType,
          mode: 'practice',
          won,
          score: Math.max(0, Math.floor(score)),
          durationSec: Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000)),
        });
        setResult({
          rewarded: false,
          rewardPoints: 0,
          rewardXp: 0,
          score: Math.max(0, Math.floor(score)),
          won,
          streak: 0,
          streakBonusXp: 0,
          newAchievements: [],
          reason: null,
          practice: true,
        });
        go('done');
        return;
      }

      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        go('done');
        return;
      }
      finishingRef.current = true;
      go('submitting');
      const durationSec = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
      try {
        const res = await postCompleteWithRetry(
          `/api/customer/games/${gameType}/complete`,
          JSON.stringify({
            sessionId,
            score: Math.max(0, Math.floor(score)),
            durationSec,
            won,
            attemptToken: tokenRef.current,
            ...(proof !== undefined ? { proof } : {}),
          })
        );
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
        track('game_end', {
          gameType,
          mode: 'ranked',
          won: serverWon,
          rewarded: r.rewarded,
          capped: !!r.capped,
          score: r.score,
          durationSec,
        });
        // Sıralı deneme kullanıldı: kabuk "bugün oynandı" bilgisini bilsin.
        setAlreadyPlayed(true);
        setPlayedOutcome(serverWon ? 'won' : 'lost');
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
        const message = e instanceof Error ? e.message : 'Sonuç kaydedilemedi';
        toast.error(message);
        track('game_submit_failed', { gameType, durationSec });
        // Dürüst sonuç: sunucu kararı alınamadı/kabul edilmedi → "kazandın" gösterilmez (istemcinin `won`'u
        // yalnız kozmetik bir ipucu; ödül ve kazanma kararı sunucunun).
        setResult({
          rewarded: false,
          rewardPoints: 0,
          rewardXp: 0,
          score: Math.floor(score),
          won: false,
          streak: 0,
          streakBonusXp: 0,
          newAchievements: [],
          reason: `${message.replace(/[.!]+$/, "")}. Bugünkü denemenin durumunu Oyna merkezinde görebilirsin.`,
        });
      } finally {
        sessionIdRef.current = null;
        tokenRef.current = null;
        go('done');
      }
    },
    [gameType, go]
  );

  return {
    phase,
    config,
    alreadyPlayed,
    result,
    start,
    finish,
    seed,
    playedOutcome,
    lockedMessage,
    mode,
    setMode,
    content,
    answerKey,
    reset,
  };
}

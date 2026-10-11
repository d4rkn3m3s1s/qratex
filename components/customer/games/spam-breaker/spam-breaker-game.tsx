'use client';

/**
 * Spam Kırıcı — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül GameHost'ta).
 *
 * Döngü: motorun 60 Hz sabit adımı → `sim.step()` (saf, tohumlu, tamsayı fizik). Hız ekranın
 * tazeleme hızından bağımsız (eski 120/144 Hz 2× hız hatası kapandı). React state'e karede
 * YAZILMAZ: HUD 10 Hz'de ref'ten okunur. Girdi bir sonraki adımın başında simülasyona verilir ve
 * yalnız kabul edilen girdi `sim.tick` ile kaydedilir → sunucu aynı tohumla birebir yeniden oynatır.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Pause, Rocket, Share2, Shield, Star, Trophy } from 'lucide-react';
import { useCanvasSurface, useCoarsePointer, useGameInput, useGameLoop, useLatestRef } from '@/lib/games/engine/hooks';
import { createInputRecorder } from '@/lib/games/engine/record';
import type { GameAction } from '@/lib/games/engine/input';
import type { GameComponentProps } from '@/lib/games/registry/types';
import type { DeterministicProof } from '@/lib/games/verify';
import { sfxClick, sfxCollectStar, sfxFanfare, sfxHit, sfxPowerUp, sfxWin, sfxBoom } from '@/lib/game-sounds';
import {
  CODE_HOLD,
  CODE_LAUNCH,
  CODE_TARGET,
  END_TEXT,
  LEVELS,
  SB_H,
  SB_W,
  createBreakerSim,
  starsFor,
  type BreakerSim,
  type EndCause,
  type SimEvent,
} from './sim';
import { applyEventsToFx, createFxState, drawFrame, PALETTE, stepFx } from './render';

const TUTORIAL_KEY = 'qx.spam-breaker.tutorial.v2';
const bestKey = (mode: string) => `qx.spam-breaker.best.${mode}`;
/** Sıralı modda özet ekranı bu kadar sn sonra sonucu kendiliğinden gönderir (deneme kaybolmasın). */
const AUTO_SUBMIT_SEC = 12;

const KEYMAP: Readonly<Record<string, GameAction>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'primary',
  Enter: 'primary',
  ArrowUp: 'primary',
  KeyW: 'primary',
  Escape: 'pause',
  KeyP: 'pause',
};

function readLs(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLs(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* gizli pencere: yalnız kolaylık */
  }
}

interface Hud {
  score: number;
  level: number;
  lives: number;
  bricksLeft: number;
  wide: boolean;
  phase: BreakerSim['phase'];
}

const snapshot = (sim: BreakerSim): Hud => ({
  score: sim.score,
  level: sim.level,
  lives: sim.lives,
  bricksLeft: sim.bricksLeft,
  wide: sim.wideTicks > 0,
  phase: sim.phase,
});

interface Summary {
  score: number;
  won: boolean;
  level: number;
  cause: EndCause | null;
  seconds: number;
  stars: 0 | 1 | 2 | 3;
  prevBest: number | null;
}

export function SpamBreakerGame({ mode, seed, config, paused, onPauseRequest, onFinish, fx }: GameComponentProps) {
  const threshold = config.rewardThreshold;
  const [stage, setStage] = useState<'tutorial' | 'playing' | 'summary'>(() =>
    readLs(TUTORIAL_KEY) ? 'playing' : 'tutorial'
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const surface = useCanvasSurface(canvasRef, { width: SB_W, height: SB_H });
  const [simObj] = useState<BreakerSim>(() => createBreakerSim(seed, { events: true, threshold }));
  const recRef = useRef(createInputRecorder());
  const fxRef = useRef(createFxState());
  const finishedRef = useRef(false);
  const [hud, setHud] = useState<Hud>(() => snapshot(simObj));
  const [announce, setAnnounce] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const coarse = useCoarsePointer();
  const coarseRef = useLatestRef(coarse);

  // Bekleyen girdiler (bir sonraki mantık adımının başında simülasyona verilir).
  const pending = useRef({ launch: false, target: null as number | null, lastTarget: -1, holdDirty: false });
  const held = useRef({ left: false, right: false });

  const playing = stage === 'playing';
  const rich = fx.canCelebrate();

  const handleEvents = useCallback(
    (events: SimEvent[]) => {
      if (events.length === 0) return;
      applyEventsToFx(fxRef.current, events, rich, (px) => fx.shake(px));
      for (const e of events) {
        switch (e.t) {
          case 'launch':
            fx.sfx(() => sfxPowerUp());
            fx.haptic('tap');
            break;
          case 'paddle':
            fx.sfx(() => sfxClick());
            break;
          case 'hit':
            fx.sfx(() => sfxCollectStar(e.score % 6));
            if (e.destroyed) fx.haptic('tap');
            if (e.score % 10 === 0) setAnnounce(`${e.score} isabet.`);
            break;
          case 'capsule':
            setAnnounce(e.kind === 'wide' ? 'Geniş kalkan kapsülü düşüyor.' : 'Can kapsülü düşüyor.');
            break;
          case 'catch':
            fx.sfx(() => sfxFanfare());
            fx.haptic('success');
            setAnnounce(e.kind === 'wide' ? 'Kalkan 10 saniye genişledi.' : 'Bir can kazandın.');
            break;
          case 'threshold':
            fx.sfx(() => sfxWin());
            fx.haptic('success');
            setAnnounce(`Ödül eşiği ${threshold} geçildi. Artık top kaçsa da skorun sayılır.`);
            break;
          case 'lose':
            fx.sfx(() => sfxHit());
            fx.haptic('big');
            setAnnounce(e.lives > 0 ? `Top kaçtı. ${e.lives} can kaldı.` : 'Son can gitti.');
            break;
          case 'level':
            fx.sfx(() => sfxFanfare());
            fx.haptic('success');
            setAnnounce(`Seviye temizlendi. Sıradaki: ${e.level} / ${LEVELS}; top hızlanıyor.`);
            break;
          case 'over':
            if (e.cause === 'clear') {
              fx.sfx(() => sfxFanfare());
              fx.confetti('sides');
            } else fx.sfx(() => sfxBoom());
            break;
          default:
            break;
        }
      }
    },
    [fx, rich, threshold]
  );

  const endRun = useCallback(() => {
    const sim = simObj;
    let prevBest: number | null = null;
    const raw = readLs(bestKey(mode));
    if (raw !== null && Number.isFinite(Number(raw))) prevBest = Number(raw);
    if (prevBest === null || sim.score > prevBest) writeLs(bestKey(mode), String(sim.score));
    const s: Summary = {
      score: sim.score,
      won: sim.won,
      level: sim.level,
      cause: sim.cause,
      seconds: Math.round(sim.tick / 60),
      stars: starsFor(sim.score, threshold, sim.won),
      prevBest,
    };
    setSummary(s);
    setHud(snapshot(sim));
    setStage('summary');
    setAnnounce(`${s.cause ? END_TEXT[s.cause] : 'Oyun bitti'}. Skor ${s.score}. ${s.stars} yıldız.`);
  }, [mode, threshold, simObj]);

  const applyPending = useCallback(() => {
    const sim = simObj;
    const p = pending.current;
    const rec = recRef.current;
    if (p.holdDirty) {
      p.holdDirty = false;
      const dir = (held.current.right ? 1 : 0) - (held.current.left ? 1 : 0);
      if (sim.input(CODE_HOLD, dir)) rec.record(sim.tick, CODE_HOLD, dir);
    }
    if (p.target !== null && sim.tick % 2 === 0) {
      const t = Math.max(0, Math.min(SB_W, Math.round(p.target)));
      p.target = null;
      if (t !== p.lastTarget && sim.input(CODE_TARGET, t)) {
        rec.record(sim.tick, CODE_TARGET, t);
        p.lastTarget = t;
      }
    }
    if (p.launch) {
      p.launch = false;
      if (sim.input(CODE_LAUNCH)) rec.record(sim.tick, CODE_LAUNCH);
    }
  }, [simObj]);

  useGameLoop({
    active: playing,
    paused,
    onAutoPause: onPauseRequest,
    update: () => {
      const sim = simObj;
      if (sim.over) return;
      applyPending();
      sim.step();
      handleEvents(sim.drainEvents());
      if (sim.over) endRun();
    },
    render: () => {
      const s = surface.current;
      if (!s) return;
      drawFrame(s.beginFrame(), simObj, fxRef.current, { coarse: coarseRef.current });
    },
  });

  // Efekt saati (parçacık sönümü) — mantıktan bağımsız.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      stepFx(fxRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // HUD ≤ 10 Hz.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHud(snapshot(simObj)), 100);
    return () => window.clearInterval(id);
  }, [playing, simObj]);

  // Duraklayınca basılı yönleri bırak (devamda kalkan kendiliğinden kaymasın).
  useEffect(() => {
    if (!paused) return;
    if (held.current.left || held.current.right) {
      held.current = { left: false, right: false };
      pending.current.holdDirty = true;
    }
  }, [paused]);

  const setHeld = useCallback((side: 'left' | 'right', on: boolean) => {
    if (held.current[side] === on) return;
    held.current = { ...held.current, [side]: on };
    pending.current.holdDirty = true;
  }, []);

  const requestLaunch = useCallback(() => {
    if (stage !== 'playing' || paused) return;
    pending.current.launch = true;
  }, [stage, paused]);

  useGameInput(boardRef, {
    active: playing,
    keymap: KEYMAP,
    swipe: false,
    pointer: true,
    toLogical: (x, y) => surface.current?.toLogical(x, y) ?? { x, y },
    onInput: (e) => {
      if (paused) return;
      if (e.type === 'pointer') {
        if (e.phase === 'down' || e.phase === 'move') {
          // Fare yalnız üzerinde gezinince de kalkanı sürer; dokunmada sürükleme.
          pending.current.target = e.x;
        }
        if (e.phase === 'up' && simObj.phase === 'serve') pending.current.launch = true;
        return;
      }
      if (e.type === 'press') {
        if (e.action === 'pause') {
          onPauseRequest();
          return;
        }
        if (e.action === 'left' || e.action === 'right') setHeld(e.action, true);
        else if (e.action === 'primary' && !e.repeat) requestLaunch();
        return;
      }
      if (e.type === 'release' && (e.action === 'left' || e.action === 'right')) setHeld(e.action, false);
    },
  });

  const submit = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const sim = simObj;
    onFinish({
      score: sim.score,
      won: sim.score >= threshold,
      proof: { log: recRef.current.entries() as DeterministicProof['log'], steps: sim.tick },
    });
  }, [onFinish, threshold, simObj]);

  const [autoLeft, setAutoLeft] = useState(AUTO_SUBMIT_SEC);
  useEffect(() => {
    if (stage !== 'summary' || mode !== 'ranked' || paused) return;
    const id = window.setInterval(() => {
      setAutoLeft((n) => {
        if (n <= 1) {
          window.clearInterval(id);
          submit();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage, mode, paused, submit]);

  const startFromTutorial = () => {
    writeLs(TUTORIAL_KEY, '1');
    setStage('playing');
  };

  useEffect(() => {
    if (stage === 'playing') boardRef.current?.focus();
  }, [stage]);

  const [shareNote, setShareNote] = useState('');
  const share = async () => {
    if (!summary) return;
    const url = `${window.location.origin}/customer/games/spam-breaker`;
    const text = summary.won
      ? `Qratex Spam Kırıcı'da ${LEVELS} seviyenin hepsini temizledim: ${summary.score} isabet!`
      : `Qratex Spam Kırıcı'da ${summary.level}. seviyede ${summary.score} isabet yaptım. Sen geçebilir misin?`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Spam Kırıcı', text, url });
        setShareNote('Paylaşıldı.');
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShareNote('Panoya kopyalandı.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setShareNote('Paylaşılamadı; tarayıcın bu özelliği desteklemiyor olabilir.');
    }
  };

  const progress = Math.min(1, hud.score / Math.max(1, threshold));
  const hudSummary = useMemo(
    () =>
      `Seviye ${hud.level} / ${LEVELS}, ${hud.bricksLeft} tuğla kaldı, ${hud.lives} can. Skor ${hud.score}, ödül eşiği ${threshold}.`,
    [hud.level, hud.bricksLeft, hud.lives, hud.score, threshold]
  );

  const holdButton = (side: 'left' | 'right', label: string, Icon: typeof ChevronLeft) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
        setHeld(side, true);
      }}
      onPointerUp={() => setHeld(side, false)}
      onPointerCancel={() => setHeld(side, false)}
      onLostPointerCapture={() => setHeld(side, false)}
      onContextMenu={(e) => e.preventDefault()}
      className="flex h-14 flex-1 touch-none items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white active:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <Icon className="h-7 w-7" aria-hidden />
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[460px] select-none">
      {/* HUD şeridi */}
      <div className="mb-2 flex items-center gap-2 text-white" aria-hidden={stage !== 'playing'}>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-xs text-white/75">
            <span className="flex items-center gap-1.5">
              Seviye <b className="tabular-nums text-white">{hud.level}</b>/{LEVELS}
              <span className="flex items-center gap-0.5" aria-label={`${hud.lives} can`}>
                {Array.from({ length: hud.lives }).map((_, i) => (
                  <Heart key={i} className="h-3.5 w-3.5" fill={PALETTE.life} style={{ color: PALETTE.life }} aria-hidden />
                ))}
              </span>
              {hud.wide && <Shield className="h-3.5 w-3.5" style={{ color: PALETTE.wide }} aria-label="Geniş kalkan" />}
            </span>
            <span>
              Skor <b className="tabular-nums text-white">{hud.score}</b>
              <span className="text-white/60"> · eşik {threshold}</span>
            </span>
          </div>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Ödül eşiğine ilerleme"
            aria-valuemin={0}
            aria-valuemax={threshold}
            aria-valuenow={Math.min(hud.score, threshold)}
          >
            <div
              className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${progress * 100}%`, background: progress >= 1 ? PALETTE.good : PALETTE.paddle }}
            />
          </div>
          <p className="mt-1 text-[11px] text-white/70">
            {hud.score >= threshold
              ? 'Eşik geçildi — top kaçsa da skorun sayılır. Devam et, rekoru büyüt.'
              : `${threshold} isabetten sonra top kaçsa da ödül hakkın kalır.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onPauseRequest}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Duraklat"
        >
          <Pause className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <p id="sb-rules" className="sr-only">
        {hudSummary} Sol ve sağ ok ya da A ve D ile kalkanı sür, Boşluk ile topu fırlat. Dokunmatikte oyun alanında
        parmağını kaydır, dokunup bırakınca top fırlar. Esc duraklatır.
      </p>

      <div
        ref={boardRef}
        tabIndex={0}
        role="application"
        aria-label="Spam Kırıcı oyun alanı"
        aria-describedby="sb-rules"
        className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-2xl border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        style={{ background: PALETTE.bg }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

        {stage === 'tutorial' && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sb-tut-title"
            className="absolute inset-0 flex flex-col justify-center [justify-content:safe_center] gap-3 overflow-y-auto bg-[#0b1020]/92 p-5 text-white"
          >
            <h3 id="sb-tut-title" className="text-center text-xl font-bold">
              Nasıl oynanır?
            </h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <Shield className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.paddle }} aria-hidden />
                <span>
                  <b>Kalkanı kaydır, topu sektir.</b> Topun kalkanın neresine çarptığı açısını belirler: kenar = yatık,
                  orta = dik.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold text-[#1a1206]" style={{ background: PALETTE.spam }} aria-hidden>
                  @
                </span>
                <span>
                  <b>Spam tuğlası</b> (turuncu, @) tek vuruşta, <b>bot tuğlası</b> (mavi, iki gözlü) iki vuruşta kırılır.
                  Her vuruş 1 skor; {LEVELS} seviye, top her seviyede hızlanır.
                </span>
              </li>
              <li className="flex gap-3">
                <Heart className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.life }} aria-hidden />
                <span>
                  <b>Kapsülleri yakala:</b> sarı ↔ kalkanı 10 sn genişletir, pembe + bir can verir. 3 canla başlarsın.
                </span>
              </li>
              <li className="flex gap-3">
                <Trophy className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.good }} aria-hidden />
                <span>
                  <b>Ödül eşiği {threshold}.</b> Eşiği geçtikten sonra top kaçsa bile skorun sayılır.
                </span>
              </li>
            </ol>
            <p className="text-center text-xs text-white/70">
              {coarse
                ? 'Oyun alanında parmağını kaydır ya da alttaki düğmeleri kullan; dokunup bırakınca top fırlar.'
                : '← / → ya da A / D · Boşluk: fırlat · fare ile de sürebilirsin · Esc: duraklat'}
            </p>
            <button
              type="button"
              autoFocus
              onClick={startFromTutorial}
              className="mx-auto h-12 rounded-xl px-8 font-bold text-[#0b1020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              style={{ background: PALETTE.paddle }}
            >
              Anladım, başla
            </button>
          </div>
        )}

        {stage === 'summary' && summary && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sb-sum-title"
            className="absolute inset-0 flex flex-col items-center justify-center [justify-content:safe_center] gap-2.5 overflow-y-auto bg-[#0b1020]/92 p-5 text-center text-white"
          >
            <h3 id="sb-sum-title" className="text-xl font-bold">
              {summary.cause ? END_TEXT[summary.cause] : 'Oyun bitti'}
            </h3>
            <div className="flex gap-1" role="img" aria-label={`3 yıldızdan ${summary.stars}`}>
              {[1, 2, 3].map((n) => (
                <Star
                  key={n}
                  className="h-9 w-9"
                  aria-hidden
                  style={{ color: n <= summary.stars ? PALETTE.wide : 'rgba(255,255,255,0.25)' }}
                  fill={n <= summary.stars ? PALETTE.wide : 'none'}
                />
              ))}
            </div>
            <p className="text-4xl font-black tabular-nums">{summary.score}</p>
            <p className="text-xs text-white/70">
              {summary.prevBest === null
                ? 'İlk skorun bu cihazda kaydedildi.'
                : summary.score > summary.prevBest
                  ? `Yeni kişisel rekor! (önceki ${summary.prevBest})`
                  : `En iyin: ${summary.prevBest}`}
              {mode === 'practice' ? ' · Pratik' : ''}
            </p>
            <dl className="grid w-full max-w-xs grid-cols-2 gap-2 text-xs">
              {[
                ['Seviye', `${summary.level}/${LEVELS}`],
                ['Süre', `${Math.floor(summary.seconds / 60)}:${String(summary.seconds % 60).padStart(2, '0')}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-white/5 px-2 py-1.5">
                  <dt className="text-white/60">{k}</dt>
                  <dd className="font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-white/70">
              {summary.score >= threshold
                ? mode === 'ranked'
                  ? 'Ödül eşiğini geçtin — sunucu oyunu yeniden oynatıp doğruladıktan sonra ödül hesaplanır.'
                  : 'Eşiği geçtin. Sıralı modda bu skor ödül getirirdi.'
                : `Ödül eşiği ${threshold}; ${threshold - summary.score} isabet kaldı.`}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={share}
                className="flex h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Share2 className="h-4 w-4" aria-hidden /> Paylaş
              </button>
              <button
                type="button"
                autoFocus
                onClick={submit}
                className="flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-[#0b1020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{ background: PALETTE.paddle }}
              >
                <Trophy className="h-4 w-4" aria-hidden />
                {mode === 'ranked' ? `Sonucu kaydet (${autoLeft})` : 'Devam'}
              </button>
            </div>
            <p className="min-h-[1rem] text-xs text-white/70" aria-live="polite">
              {shareNote}
            </p>
          </div>
        )}
      </div>

      {/* Dokunmatik kontroller: ekran genişliğiyle değil işaretçi türüyle gösterilir. */}
      {coarse && stage === 'playing' && (
        <div className="mt-3 flex gap-2" role="group" aria-label="Kalkan kontrolleri">
          {holdButton('left', 'Kalkanı sola sür', ChevronLeft)}
          <button
            type="button"
            aria-label="Topu fırlat"
            disabled={hud.phase !== 'serve'}
            onClick={requestLaunch}
            className="flex h-14 w-20 touch-manipulation items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white active:bg-white/25 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Rocket className="h-6 w-6" aria-hidden />
          </button>
          {holdButton('right', 'Kalkanı sağa sür', ChevronRight)}
        </div>
      )}

      <p className="mt-2 text-center text-xs text-white/70">
        {mode === 'practice'
          ? 'Pratik: ödülsüz, liderliğe girmez.'
          : 'Sıralı: skor sunucuda yeniden oynatılarak doğrulanır.'}
      </p>
    </div>
  );
}

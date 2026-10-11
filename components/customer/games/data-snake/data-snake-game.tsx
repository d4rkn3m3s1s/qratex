'use client';

/**
 * Veri Yılanı — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül GameHost'ta).
 *
 * Döngü: motorun 60 Hz sabit adımı → `sim.step()` (saf, tohumlu). React state'e karede YAZILMAZ:
 * HUD 10 Hz'de ref'ten okunur. Girdi `sim.tick` ile kaydedilir ve yalnız simülasyonun kabul
 * ettiği girdi kayda girer → sunucu aynı tohumla birebir yeniden oynatır.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bot, Diamond, Pause, Share2, Star, Trophy, Waypoints } from 'lucide-react';
import { useCanvasSurface, useCoarsePointer, useGameInput, useGameLoop } from '@/lib/games/engine/hooks';
import { createInputRecorder } from '@/lib/games/engine/record';
import type { GameAction } from '@/lib/games/engine/input';
import type { GameComponentProps } from '@/lib/games/registry/types';
import type { DeterministicProof } from '@/lib/games/verify';
import { sfxClick, sfxCollectStar, sfxFanfare, sfxHit, sfxPowerUp, sfxWin } from '@/lib/game-sounds';
import {
  DEATH_TEXT,
  DIR,
  DS_H,
  DS_W,
  LEVELS,
  PACKETS_PER_LEVEL,
  TOTAL_PACKETS,
  createSnakeSim,
  starsFor,
  type DeathCause,
  type SimEvent,
  type SnakeSim,
} from './sim';
import { applyEventsToFx, createFxState, drawFrame, PALETTE, stepFx } from './render';

const TUTORIAL_KEY = 'qx.data-snake.tutorial.v1';
const bestKey = (mode: string) => `qx.data-snake.best.${mode}`;
/** Sıralı modda özet ekranı bu kadar sn sonra sonucu kendiliğinden gönderir (deneme kaybolmasın). */
const AUTO_SUBMIT_SEC = 12;

const KEYMAP: Readonly<Record<string, GameAction>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Escape: 'pause',
  KeyP: 'pause',
};

const ACTION_DIR: Partial<Record<GameAction, number>> = {
  up: DIR.UP,
  down: DIR.DOWN,
  left: DIR.LEFT,
  right: DIR.RIGHT,
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
  eatenInLevel: number;
  phase: SnakeSim['phase'];
}

const snapshot = (sim: SnakeSim): Hud => ({
  score: sim.score,
  level: sim.level,
  eatenInLevel: sim.eatenInLevel,
  phase: sim.phase,
});

interface Summary {
  score: number;
  won: boolean;
  level: number;
  cause: DeathCause | null;
  length: number;
  stars: 0 | 1 | 2 | 3;
  prevBest: number | null;
}

export function DataSnakeGame({ mode, seed, config, paused, onPauseRequest, onFinish, fx }: GameComponentProps) {
  const threshold = config.rewardThreshold;
  const [stage, setStage] = useState<'tutorial' | 'playing' | 'summary'>(() =>
    readLs(TUTORIAL_KEY) ? 'playing' : 'tutorial'
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const surface = useCanvasSurface(canvasRef, { width: DS_W, height: DS_H });
  const [simObj] = useState<SnakeSim>(() => createSnakeSim(seed, { events: true, threshold }));
  const recRef = useRef(createInputRecorder());
  const fxRef = useRef(createFxState());
  const finishedRef = useRef(false);
  const [hud, setHud] = useState<Hud>(() => snapshot(simObj));
  const [announce, setAnnounce] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const coarse = useCoarsePointer();

  const playing = stage === 'playing';
  const rich = fx.canCelebrate();

  const handleEvents = useCallback(
    (events: SimEvent[]) => {
      if (events.length === 0) return;
      applyEventsToFx(fxRef.current, events, rich, (px) => fx.shake(px));
      for (const e of events) {
        switch (e.t) {
          case 'count':
            fx.sfx(() => sfxClick());
            setAnnounce(String(e.n));
            break;
          case 'go':
            fx.sfx(() => sfxPowerUp());
            setAnnounce('Başla!');
            break;
          case 'eat':
            fx.sfx(() => sfxCollectStar(e.score % PACKETS_PER_LEVEL));
            fx.haptic('tap');
            if (e.score % 5 === 0) setAnnounce(`${e.score} paket.`);
            break;
          case 'threshold':
            fx.sfx(() => sfxWin());
            fx.haptic('success');
            setAnnounce(`Ödül eşiği ${threshold} geçildi. Artık çarpsan da skorun sayılır.`);
            break;
          case 'level':
            fx.sfx(() => sfxFanfare());
            fx.haptic('success');
            setAnnounce(
              `Seviye ${e.level} / ${LEVELS}. ${e.level >= 4 ? 'Devriye botları sahada.' : 'Yeni bot duvarları belirdi.'}`
            );
            break;
          case 'die':
            fx.sfx(() => sfxHit());
            fx.haptic('big');
            setAnnounce(`${DEATH_TEXT[e.cause]}.`);
            break;
          case 'clear':
            fx.sfx(() => sfxFanfare());
            fx.haptic('big');
            fx.confetti('sides');
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
      length: sim.snake.length,
      stars: starsFor(sim.score, threshold),
      prevBest,
    };
    setSummary(s);
    setHud(snapshot(sim));
    setStage('summary');
    setAnnounce(
      `${s.won ? 'Tüm seviyeler tamamlandı' : s.cause ? DEATH_TEXT[s.cause] : 'Oyun bitti'}. Skor ${s.score}. ${s.stars} yıldız.`
    );
  }, [mode, threshold, simObj]);

  useGameLoop({
    active: playing,
    paused,
    onAutoPause: onPauseRequest,
    update: () => {
      const sim = simObj;
      if (sim.over) return;
      sim.step();
      handleEvents(sim.drainEvents());
      if (sim.over) endRun();
    },
    render: () => {
      const s = surface.current;
      if (!s) return;
      drawFrame(s.beginFrame(), simObj, fxRef.current, { smooth: rich, now: performance.now() });
    },
  });

  // Efekt saati (parçacık/halka sönümü) — mantıktan bağımsız, ~60 Hz.
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

  /** Yönü simülasyona ver; kabul edilirse sim.tick ile kaydet (sunucu replay'i birebir). */
  const turn = useCallback(
    (code: number) => {
      if (stage !== 'playing' || paused) return false;
      const sim = simObj;
      const ok = sim.input(code);
      if (ok) recRef.current.record(sim.tick, code);
      return ok;
    },
    [stage, paused, simObj]
  );

  useGameInput(boardRef, {
    active: playing,
    keymap: KEYMAP,
    swipe: true,
    swipeThreshold: 18,
    pointer: false,
    onInput: (e) => {
      if (e.type === 'swipe') {
        turn(ACTION_DIR[e.direction]!);
        return;
      }
      if (e.type !== 'press') return;
      if (e.action === 'pause') {
        onPauseRequest();
        return;
      }
      const code = ACTION_DIR[e.action];
      if (code && !e.repeat) turn(code);
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

  // Sıralıda özet ekranı sonucu kendiliğinden gönderir.
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
    window.setTimeout(() => boardRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (stage === 'playing') boardRef.current?.focus();
  }, [stage]);

  const [shareNote, setShareNote] = useState('');
  const share = async () => {
    if (!summary) return;
    const url = `${window.location.origin}/customer/games/data-snake`;
    const text = summary.won
      ? `Qratex Veri Yılanı'nda ${LEVELS} seviyenin hepsini bitirdim: ${summary.score} paket, ${summary.stars} yıldız!`
      : `Qratex Veri Yılanı'nda ${summary.level}. seviyede ${summary.score} paket topladım. Sen geçebilir misin?`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Veri Yılanı', text, url });
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
      `Seviye ${hud.level} / ${LEVELS}, bu seviyede ${hud.eatenInLevel} / ${PACKETS_PER_LEVEL} paket. Skor ${hud.score}, ödül eşiği ${threshold}.`,
    [hud.level, hud.eatenInLevel, hud.score, threshold]
  );

  const dpad = (action: 'up' | 'down' | 'left' | 'right', label: string, Icon: typeof ArrowUp) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        turn(ACTION_DIR[action]!);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          turn(ACTION_DIR[action]!);
        }
      }}
      className="flex h-14 w-14 touch-manipulation items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white active:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[460px] select-none">
      {/* HUD şeridi */}
      <div className="mb-2 flex items-center gap-2 text-white" aria-hidden={stage !== 'playing'}>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-xs text-white/75">
            <span>
              Seviye <b className="tabular-nums text-white">{hud.level}</b>/{LEVELS}
              <span className="text-white/60">
                {' '}
                · {hud.eatenInLevel}/{PACKETS_PER_LEVEL}
              </span>
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
              style={{ width: `${progress * 100}%`, background: progress >= 1 ? PALETTE.food : PALETTE.head }}
            />
          </div>
          <p className="mt-1 text-[11px] text-white/65">
            {hud.score >= threshold
              ? 'Eşik geçildi — çarpsan da skorun sayılır. 30 = tam tur.'
              : `${threshold} paketten sonra çarpsan da ödül hakkın kalır.`}
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
      <p id="ds-rules" className="sr-only">
        {hudSummary} Ok tuşları ya da WASD ile yön ver, dokunmatikte kaydır ya da yön düğmelerini kullan. Esc duraklatır.
      </p>

      <div
        ref={boardRef}
        tabIndex={0}
        role="application"
        aria-label="Veri Yılanı oyun alanı"
        aria-describedby="ds-rules"
        className="relative aspect-square w-full touch-none overflow-hidden rounded-2xl border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        style={{ background: PALETTE.bg }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

        {/* İlk oynayış öğreticisi */}
        {stage === 'tutorial' && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ds-tut-title"
            className="absolute inset-0 flex flex-col justify-center gap-3 overflow-y-auto bg-[#0b1020]/92 p-5 text-white"
          >
            <h3 id="ds-tut-title" className="text-center text-xl font-bold">
              Nasıl oynanır?
            </h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <Diamond className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.food }} aria-hidden />
                <span>
                  <b>Sarı veri paketlerini yut.</b> Her paket 1 skor; her 6 pakette seviye atlarsın ({LEVELS} seviye,
                  toplam {TOTAL_PACKETS}).
                </span>
              </li>
              <li className="flex gap-3">
                <Waypoints className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.wall }} aria-hidden />
                <span>
                  <b>Bot duvarlarından kaç.</b> Çapraz taralı turuncu kareler 2. seviyede belirir; kenara ve kendi
                  kuyruğuna da çarpma.
                </span>
              </li>
              <li className="flex gap-3">
                <Bot className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.bot }} aria-hidden />
                <span>
                  <b>Devriye botları</b> 4. seviyeden itibaren soluk yollarında gidip gelir. Hız her seviyede artar.
                </span>
              </li>
              <li className="flex gap-3">
                <Trophy className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.head }} aria-hidden />
                <span>
                  <b>Ödül eşiği {threshold}.</b> Eşiği geçtikten sonra çarpsan bile skorun sayılır.
                </span>
              </li>
            </ol>
            <p className="text-center text-xs text-white/65">
              {coarse ? 'Kaydır ya da alttaki yön düğmelerini kullan.' : 'Ok tuşları / WASD · Esc duraklat'}
            </p>
            <button
              type="button"
              autoFocus
              onClick={startFromTutorial}
              className="mx-auto h-12 rounded-xl px-8 font-bold text-[#0b1020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              style={{ background: PALETTE.head }}
            >
              Anladım, başla
            </button>
          </div>
        )}

        {/* Sonuç özeti */}
        {stage === 'summary' && summary && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ds-sum-title"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 overflow-y-auto bg-[#0b1020]/92 p-5 text-center text-white"
          >
            <h3 id="ds-sum-title" className="text-xl font-bold">
              {summary.won ? 'Tam tur! Tüm seviyeler bitti' : summary.cause ? DEATH_TEXT[summary.cause] : 'Oyun bitti'}
            </h3>
            <div className="flex gap-1" role="img" aria-label={`3 yıldızdan ${summary.stars}`}>
              {[1, 2, 3].map((n) => (
                <Star
                  key={n}
                  className="h-9 w-9"
                  aria-hidden
                  style={{ color: n <= summary.stars ? PALETTE.food : 'rgba(255,255,255,0.25)' }}
                  fill={n <= summary.stars ? PALETTE.food : 'none'}
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
                ['Uzunluk', String(summary.length)],
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
                : `Ödül eşiği ${threshold}; ${threshold - summary.score} paket kaldı.`}
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
                style={{ background: PALETTE.head }}
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

      {/* Dokunmatik D-pad: ekran genişliğiyle değil işaretçi türüyle gösterilir. */}
      {coarse && stage === 'playing' && (
        <div className="mt-3 grid grid-cols-3 justify-items-center gap-2" role="group" aria-label="Yön düğmeleri">
          <span />
          {dpad('up', 'Yukarı', ArrowUp)}
          <span />
          {dpad('left', 'Sola', ArrowLeft)}
          {dpad('down', 'Aşağı', ArrowDown)}
          {dpad('right', 'Sağa', ArrowRight)}
        </div>
      )}

      <p className="mt-2 text-center text-xs text-white/65">
        {mode === 'practice'
          ? 'Pratik: ödülsüz, liderliğe girmez.'
          : 'Sıralı: skor sunucuda yeniden oynatılarak doğrulanır.'}
      </p>
    </div>
  );
}

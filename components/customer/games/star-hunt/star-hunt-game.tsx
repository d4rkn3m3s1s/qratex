'use client';

/**
 * Yıldız Avı — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül GameHost'ta).
 *
 * Eski `components/customer/pacman-game.tsx` hatalarının yapısal kapanışı:
 *  - Bayat kapanış (sonuç hiç gönderilmiyordu): oturum/ödül kabukta (`useMiniGame`, ref tabanlı);
 *    bileşen yalnız `onFinish`'i BİR kez çağırır (`finishedRef`).
 *  - Kayıpta döngü durmuyordu: döngü `stage === 'playing'` iken çalışır; `sim.over` olunca
 *    `update` erken döner ve özet ekranına geçilir.
 *  - Kare hızına bağlı hız: motorun 60 Hz sabit adımı + tamsayı alt birimli simülasyon.
 *  - Sekme gizlenince duraklama: motorun otomatik duraklatması → `onPauseRequest`.
 *  - Retina bulanıklığı: `useCanvasSurface` (DPR) + labirent önbelleği.
 * React state'e karede YAZILMAZ: HUD 10 Hz.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ghost, Heart, Pause, Share2, Star, Trophy, Zap } from 'lucide-react';
import { useCanvasSurface, useCoarsePointer, useGameInput, useGameLoop } from '@/lib/games/engine/hooks';
import { createInputRecorder } from '@/lib/games/engine/record';
import type { GameAction } from '@/lib/games/engine/input';
import type { GameComponentProps } from '@/lib/games/registry/types';
import type { DeterministicProof } from '@/lib/games/verify';
import { sfxCollectStar, sfxCombo, sfxEatGhost, sfxHit, sfxPowerUp, sfxWarn, sfxWin } from '@/lib/game-sounds';
import {
  HZ,
  MAX_SCORE,
  SH_CODE,
  SH_H,
  SH_W,
  START_LIVES,
  STARS_PER_LEVEL,
  TOTAL_LEVELS,
  createStarHuntSim,
  trophiesFor,
  type Phase,
  type SimEvent,
  type StarHuntSim,
} from './sim';
import { applyEventsToFx, createFxState, drawFrame, PALETTE, stepFx } from './render';

const TUTORIAL_KEY = 'qx.star-hunt.tutorial.v1';
const bestKey = (mode: string) => `qx.star-hunt.best.${mode}`;
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

const DIR_CODE: Partial<Record<GameAction, number>> = {
  up: SH_CODE.UP,
  down: SH_CODE.DOWN,
  left: SH_CODE.LEFT,
  right: SH_CODE.RIGHT,
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
  phase: Phase;
  level: number;
  levelStars: number;
  score: number;
  lives: number;
  power: number; // 0..1
  powerSec: number;
}

function snapshot(sim: StarHuntSim): Hud {
  return {
    phase: sim.phase,
    level: sim.level,
    levelStars: sim.levelStars,
    score: sim.score,
    lives: sim.lives,
    power: sim.powerTicks > 0 ? sim.powerTicks / sim.spec.powerTicks : 0,
    powerSec: Math.ceil(sim.powerTicks / HZ),
  };
}

interface Summary {
  score: number;
  won: boolean;
  level: number;
  ghostsEaten: number;
  bestChain: number;
  seconds: number;
  trophies: 0 | 1 | 2 | 3;
  prevBest: number | null;
}

export function StarHuntGame({ mode, seed, config, paused, onPauseRequest, onFinish, fx }: GameComponentProps) {
  const threshold = config.rewardThreshold;
  const [stage, setStage] = useState<'tutorial' | 'playing' | 'summary'>(() =>
    readLs(TUTORIAL_KEY) ? 'playing' : 'tutorial'
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surface = useCanvasSurface(canvasRef, { width: SH_W, height: SH_H });
  const [simObj] = useState<StarHuntSim>(() => createStarHuntSim(seed, { events: true, threshold }));
  const recRef = useRef(createInputRecorder());
  const [fxState] = useState(() => createFxState(fx.canCelebrate()));
  const finishedRef = useRef(false);
  const lastDirRef = useRef(4);
  const [hud, setHud] = useState<Hud>(() => snapshot(simObj));
  const [announce, setAnnounce] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const coarse = useCoarsePointer();

  const playing = stage === 'playing';

  const handleEvents = useCallback(
    (events: SimEvent[]) => {
      if (events.length === 0) return;
      applyEventsToFx(fxState, events, (px) => fx.shake(px));
      for (const e of events) {
        switch (e.t) {
          case 'star':
            fx.sfx(() => sfxCollectStar(e.levelStars - 1));
            fx.haptic('tap');
            setAnnounce(`Yıldız: seviyede ${e.levelStars} / ${STARS_PER_LEVEL}, toplam ${e.total}.`);
            break;
          case 'pellet':
            fx.sfx(() => sfxPowerUp());
            fx.haptic('success');
            setAnnounce('Güç kapsülü! Hayaletler kısa süre korkuyor, onları yakalayabilirsin.');
            break;
          case 'power-warn':
            fx.sfx(() => sfxWarn());
            setAnnounce('Güç bitmek üzere.');
            break;
          case 'eat':
            fx.sfx(() => (e.chain > 1 ? sfxCombo(Math.min(4, e.chain)) : sfxEatGhost()));
            fx.haptic('success');
            break;
          case 'caught':
            fx.sfx(() => sfxHit());
            fx.haptic('big');
            setAnnounce(e.lives > 0 ? `Yakalandın. ${e.lives} can kaldı.` : 'Yakalandın. Canın bitti.');
            break;
          case 'clear':
            fx.sfx(() => sfxWin());
            fx.haptic('success');
            setAnnounce(`Seviye ${e.level} temizlendi.`);
            break;
          case 'level':
            setAnnounce(`Seviye ${e.level} / ${TOTAL_LEVELS} başlıyor.`);
            break;
          case 'threshold':
            setAnnounce('Ödül eşiği geçildi.');
            break;
          default:
            break;
        }
      }
    },
    [fx, fxState]
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
      ghostsEaten: sim.ghostsEaten,
      bestChain: sim.bestChain,
      seconds: Math.round(sim.tick / HZ),
      trophies: trophiesFor(sim.score, sim.won, threshold),
      prevBest,
    };
    setSummary(s);
    setHud(snapshot(sim));
    setStage('summary');
    setAnnounce(
      `${s.won ? 'Tüm seviyeler tamamlandı' : `Oyun bitti, seviye ${s.level}`}. ${s.score} yıldız. ${s.trophies} kupa.`
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
      // Kozmetik efekt adımı çizimle (duraklatmada donar).
      if (!paused) stepFx(fxState);
      drawFrame(s.beginFrame(), s.scale, simObj, fxState, lastDirRef.current);
    },
  });

  // HUD ≤ 10 Hz.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHud(snapshot(simObj)), 100);
    return () => window.clearInterval(id);
  }, [playing, simObj]);

  /** Yönü simülasyona ver; kabul edilirse sim.tick ile kaydet (sunucu replay'i birebir). */
  const sendDir = useCallback(
    (code: number) => {
      if (stage !== 'playing' || paused) return;
      const sim = simObj;
      if (code === sim.queued) return; // aynı yön: kayıt şişmesin
      if (sim.input(code)) {
        recRef.current.record(sim.tick, code);
        lastDirRef.current = code;
      }
    },
    [stage, paused, simObj]
  );

  useGameInput(canvasRef, {
    active: playing,
    keymap: KEYMAP,
    swipe: true,
    swipeThreshold: 18,
    pointer: false,
    onInput: (e) => {
      if (e.type === 'swipe') {
        const code = DIR_CODE[e.direction];
        if (code) sendDir(code);
        return;
      }
      if (e.type !== 'press' || e.repeat) return;
      if (e.action === 'pause') {
        onPauseRequest();
        return;
      }
      const code = DIR_CODE[e.action];
      if (code) sendDir(code);
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
    window.setTimeout(() => canvasRef.current?.focus(), 0);
  };

  const [shareNote, setShareNote] = useState('');
  const share = async () => {
    if (!summary) return;
    const url = `${window.location.origin}/customer/games/star-hunt`;
    const text = summary.won
      ? `Qratex Yıldız Avı'nda ${TOTAL_LEVELS} labirentin hepsini bitirdim: ${summary.score} yıldız!`
      : `Qratex Yıldız Avı'nda ${summary.level}. seviyeye kadar gittim: ${summary.score} yıldız. Sen geçebilir misin?`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Yıldız Avı', text, url });
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
      `Seviye ${hud.level} / ${TOTAL_LEVELS}. Bu seviyede ${hud.levelStars} / ${STARS_PER_LEVEL} yıldız, toplam ${hud.score}, ödül eşiği ${threshold}. ${hud.lives} can.`,
    [hud.level, hud.levelStars, hud.score, hud.lives, threshold]
  );

  const pad = (label: string, code: number, Icon: typeof ArrowUp, cls: string) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(ev) => {
        ev.preventDefault();
        sendDir(code);
        fx.haptic('tap');
      }}
      onClick={(ev) => {
        // Klavyeyle (Enter/Boşluk) etkinleştirme: işaretçi olayı yok.
        if (ev.detail === 0) sendDir(code);
      }}
      className={`flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white active:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${cls}`}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[420px] select-none">
      {/* HUD şeridi */}
      <div className="mb-2 flex items-center gap-2 text-white" aria-hidden={stage !== 'playing'}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-xs text-white/75">
            <span>
              Seviye <b className="tabular-nums text-white">{hud.level}</b>/{TOTAL_LEVELS}
            </span>
            <span className="flex items-center gap-0.5" aria-label={`Bu seviyede ${hud.levelStars} yıldız`}>
              {Array.from({ length: STARS_PER_LEVEL }, (_, i) => (
                <Star
                  key={i}
                  className="h-3.5 w-3.5"
                  aria-hidden
                  style={{ color: i < hud.levelStars ? PALETTE.star : 'rgba(255,255,255,0.3)' }}
                  fill={i < hud.levelStars ? PALETTE.star : 'none'}
                />
              ))}
            </span>
            <span className="flex items-center gap-0.5">
              {Array.from({ length: START_LIVES }, (_, i) => (
                <Heart
                  key={i}
                  className="h-3.5 w-3.5"
                  aria-hidden
                  style={{ color: i < hud.lives ? PALETTE.danger : 'rgba(255,255,255,0.3)' }}
                  fill={i < hud.lives ? PALETTE.danger : 'none'}
                />
              ))}
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
              style={{ width: `${progress * 100}%`, background: progress >= 1 ? PALETTE.pellet : PALETTE.star }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-white/75">
            <span>
              Toplam <b className="tabular-nums text-white">{hud.score}</b>
              <span className="text-white/60"> · eşik {threshold}</span>
            </span>
            {hud.power > 0 && (
              <span className="flex items-center gap-1 font-semibold" style={{ color: PALETTE.pellet }}>
                <Zap className="h-3.5 w-3.5" aria-hidden /> Güç {hud.powerSec} sn
              </span>
            )}
          </div>
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
      <p id="sh-rules" className="sr-only">
        {hudSummary} Ok tuşları ya da W, A, S, D ile yön ver; Esc duraklatır. Turuncu beş köşeli yıldızları topla,
        hayaletlere değme. Mavi halka güç kapsülüdür: alınca hayaletler kısa süre korkar ve yakalanabilir.
      </p>

      <div className="relative aspect-[13/15] w-full overflow-hidden rounded-2xl border border-white/10" style={{ background: PALETTE.bg }}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Yıldız Avı labirenti"
          aria-describedby="sh-rules"
          className="absolute inset-0 h-full w-full touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
        />

        {/* İlk oynayış öğreticisi */}
        {stage === 'tutorial' && (
          <div role="dialog" aria-modal="true" aria-labelledby="sh-tut-title" className="absolute inset-0 flex flex-col justify-center gap-3 bg-[#0b1020]/92 p-5 text-white">
            <h3 id="sh-tut-title" className="text-center text-xl font-bold">
              Nasıl oynanır?
            </h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <Star className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.star }} fill={PALETTE.star} aria-hidden />
                <span>
                  <b>5 yıldızı topla, seviyeyi geç.</b> {TOTAL_LEVELS} labirent var; her biri biraz daha zor. İlk{' '}
                  {threshold} yıldız ödül eşiği.
                </span>
              </li>
              <li className="flex gap-3">
                <Ghost className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.danger }} aria-hidden />
                <span>
                  <b>Hayaletlere değme.</b> {START_LIVES} canın var; her hayaletin kendi biçimi ve huyu var (kovalayan,
                  önünü kesen, gezinen, çekingen).
                </span>
              </li>
              <li className="flex gap-3">
                <Zap className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.pellet }} aria-hidden />
                <span>
                  <b>Mavi halka = güç.</b> Alınca hayaletler solup kesik kenarlı olur; o sürede onları yakalayıp eve
                  gönderebilirsin.
                </span>
              </li>
            </ol>
            <p className="text-center text-xs text-white/65">
              {coarse ? 'Kaydır ya da alttaki yön tuşlarını kullan.' : 'Klavye: ok tuşları / WASD · Esc duraklat'}
            </p>
            <button
              type="button"
              autoFocus
              onClick={startFromTutorial}
              className="mx-auto h-12 rounded-xl px-8 font-bold text-[#0b1020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              style={{ background: PALETTE.player }}
            >
              Anladım, başla
            </button>
          </div>
        )}

        {/* Sonuç özeti */}
        {stage === 'summary' && summary && (
          <div role="dialog" aria-modal="true" aria-labelledby="sh-sum-title" className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-[#0b1020]/92 p-5 text-center text-white">
            <h3 id="sh-sum-title" className="text-xl font-bold">
              {summary.won ? 'Tüm labirentler bitti!' : `Oyun bitti — seviye ${summary.level}`}
            </h3>
            <div className="flex gap-1" role="img" aria-label={`3 kupadan ${summary.trophies}`}>
              {[1, 2, 3].map((n) => (
                <Trophy
                  key={n}
                  className="h-9 w-9"
                  aria-hidden
                  style={{ color: n <= summary.trophies ? PALETTE.player : 'rgba(255,255,255,0.25)' }}
                  fill={n <= summary.trophies ? PALETTE.player : 'none'}
                />
              ))}
            </div>
            <p className="text-4xl font-black tabular-nums">
              {summary.score}
              <span className="text-base font-semibold text-white/60"> / {MAX_SCORE} yıldız</span>
            </p>
            <p className="text-xs text-white/70">
              {summary.prevBest === null
                ? 'İlk skorun bu cihazda kaydedildi.'
                : summary.score > summary.prevBest
                  ? `Yeni kişisel rekor! (önceki ${summary.prevBest})`
                  : `En iyin: ${summary.prevBest}`}
              {mode === 'practice' ? ' · Pratik' : ''}
            </p>
            <dl className="grid w-full max-w-xs grid-cols-3 gap-2 text-xs">
              {[
                ['Seviye', `${summary.won ? TOTAL_LEVELS : summary.level}/${TOTAL_LEVELS}`],
                ['Yakalanan', String(summary.ghostsEaten)],
                ['Süre', `${summary.seconds} sn`],
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
                  ? 'Ödül eşiğini geçtin — oyun sunucuda yeniden oynatılıp doğrulandıktan sonra ödül hesaplanır.'
                  : 'Eşiği geçtin. Sıralı modda bu skor ödül getirirdi.'
                : `Ödül eşiği ${threshold} yıldız; ${threshold - summary.score} yıldız kaldı.`}
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
                style={{ background: PALETTE.player }}
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

      {/* Sanal yön tuşları: dokunmatik cihazlarda (genişlikten bağımsız), başparmak bölgesinde. */}
      {coarse && stage === 'playing' && (
        <div className="mt-3 grid grid-cols-3 grid-rows-2 justify-center gap-2 [grid-template-columns:repeat(3,3.5rem)] mx-auto w-max" role="group" aria-label="Yön tuşları">
          {pad('Yukarı', SH_CODE.UP, ArrowUp, 'col-start-2 row-start-1')}
          {pad('Sola', SH_CODE.LEFT, ArrowLeft, 'col-start-1 row-start-2')}
          {pad('Aşağı', SH_CODE.DOWN, ArrowDown, 'col-start-2 row-start-2')}
          {pad('Sağa', SH_CODE.RIGHT, ArrowRight, 'col-start-3 row-start-2')}
        </div>
      )}
      <p className="mt-2 text-center text-xs text-white/65">
        {mode === 'practice' ? 'Pratik: ödülsüz, liderliğe girmez.' : 'Sıralı: oyun sunucuda yeniden oynatılarak doğrulanır.'}
      </p>
    </div>
  );
}

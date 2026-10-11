'use client';

/**
 * Çekirdek Savunması — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül GameHost'ta).
 *
 * Döngü: motorun 60 Hz sabit adımı → `sim.step()` (saf, tohumlu). React state'e karede YAZILMAZ:
 * HUD 10 Hz'de ref'ten okunur, efektler canvas'ta. Girdi `sim.tick` ile kaydedilir ve yalnız
 * simülasyonun kabul ettiği girdi kayda girer → sunucu aynı tohumla birebir yeniden oynatır.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Pause, Share2, Shield, Sparkles, Star, Trophy } from 'lucide-react';
import { useCanvasSurface, useGameInput, useGameLoop } from '@/lib/games/engine/hooks';
import { createInputRecorder } from '@/lib/games/engine/record';
import type { GameAction } from '@/lib/games/engine/input';
import type { GameComponentProps } from '@/lib/games/registry/types';
import type { DeterministicProof } from '@/lib/games/verify';
import { sfxBoom, sfxClick, sfxCombo, sfxHit, sfxPowerUp, sfxWarn, sfxWin } from '@/lib/game-sounds';
import {
  CD_CODE,
  CD_H,
  CD_W,
  HZ,
  PICK_TIMEOUT_TICKS,
  TOTAL_WAVES,
  UPGRADES,
  createCoreSim,
  starsFor,
  type CoreSim,
  type SimEvent,
  type UpgradeId,
} from './sim';
import { applyEventsToFx, createFxState, drawFrame, PALETTE, stepFx } from './render';

const TUTORIAL_KEY = 'qx.core-defense.tutorial.v1';
const bestKey = (mode: string) => `qx.core-defense.best.${mode}`;
/** Sıralı modda özet ekranı bu kadar sn sonra sonucu kendiliğinden gönderir (deneme kaybolmasın). */
const AUTO_SUBMIT_SEC = 12;

const KEYMAP: Readonly<Record<string, GameAction>> = {
  Space: 'primary',
  Enter: 'primary',
  KeyQ: 'secondary',
  KeyX: 'secondary',
  ShiftLeft: 'secondary',
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
  phase: CoreSim['phase'];
  wave: number;
  score: number;
  hp: number;
  maxHp: number;
  charge: number;
  combo: number;
  choices: UpgradeId[];
  levels: Record<UpgradeId, number>;
  pickLeft: number;
}

function snapshot(sim: CoreSim): Hud {
  return {
    phase: sim.phase,
    wave: sim.wave,
    score: sim.score,
    hp: sim.coreHp,
    maxHp: sim.coreMaxHp,
    charge: sim.charge,
    combo: sim.combo,
    choices: [...sim.choices],
    levels: { ...sim.levels },
    pickLeft: sim.phase === 'pick' ? Math.ceil(sim.phaseTicks / HZ) : 0,
  };
}

interface Summary {
  score: number;
  won: boolean;
  wave: number;
  kills: number;
  accuracy: number;
  bestCombo: number;
  hp: number;
  maxHp: number;
  stars: 0 | 1 | 2 | 3;
  prevBest: number | null;
}

export function CoreDefenseGame({ mode, seed, config, paused, onPauseRequest, onFinish, fx }: GameComponentProps) {
  const threshold = config.rewardThreshold;
  const [stage, setStage] = useState<'tutorial' | 'playing' | 'summary'>(() =>
    readLs(TUTORIAL_KEY) ? 'playing' : 'tutorial'
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surface = useCanvasSurface(canvasRef, { width: CD_W, height: CD_H });
  // Değişken nesne (useState yalnız bir kez kurar); mantık onu yerinde ilerletir.
  const [simObj] = useState<CoreSim>(() => createCoreSim(seed, { events: true, threshold }));
  const recRef = useRef(createInputRecorder());
  const fxRef = useRef(createFxState());
  const finishedRef = useRef(false);
  const [hud, setHud] = useState<Hud>(() => snapshot(simObj));
  const [announce, setAnnounce] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const lastHpAnnounce = useRef(0);

  const playing = stage === 'playing';
  const rich = fx.canCelebrate();

  const handleEvents = useCallback(
    (events: SimEvent[]) => {
      if (events.length === 0) return;
      applyEventsToFx(fxRef.current, events, rich, (px) => fx.shake(px));
      const sim = simObj;
      for (const e of events) {
        switch (e.t) {
          case 'kill':
            fx.sfx(() => (e.combo >= 5 && e.combo % 5 === 0 ? sfxCombo(Math.min(4, e.combo / 5)) : sfxHit()));
            if (e.kind === 'boss') fx.haptic('success');
            break;
          case 'core':
            fx.sfx(() => sfxBoom());
            fx.haptic(e.dmg >= 4 ? 'big' : 'tap');
            if (sim.tick - lastHpAnnounce.current > HZ) {
              lastHpAnnounce.current = sim.tick;
              setAnnounce(`Çekirdek hasar aldı: ${sim.coreHp} / ${sim.coreMaxHp} can.`);
            }
            break;
          case 'pulse':
            fx.sfx(() => sfxPowerUp());
            fx.haptic('success');
            break;
          case 'pulse-empty':
          case 'cooldown':
            break;
          case 'wave-start':
            setAnnounce(`Dalga ${e.wave} / ${TOTAL_WAVES} başladı${e.boss ? ', boss geliyor' : ''}.`);
            if (e.boss) fx.sfx(() => sfxWarn());
            break;
          case 'wave-clear':
            fx.sfx(() => sfxCombo(2));
            setAnnounce(
              `Dalga ${e.wave} temizlendi, ${e.bonus} bonus.${e.wave < TOTAL_WAVES ? ' Bir yükseltme seç: 1, 2 ya da 3.' : ''}`
            );
            break;
          case 'threshold':
            fx.sfx(() => sfxWin());
            fx.haptic('success');
            setAnnounce('Ödül eşiği geçildi.');
            break;
          case 'upgrade':
            fx.sfx(() => sfxClick());
            break;
          default:
            break;
        }
      }
    },
    [fx, rich, simObj]
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
      wave: sim.wave,
      kills: sim.kills,
      accuracy: sim.shots > 0 ? Math.round((sim.hits / sim.shots) * 100) : 0,
      bestCombo: sim.bestCombo,
      hp: sim.coreHp,
      maxHp: sim.coreMaxHp,
      stars: starsFor({ score: sim.score, won: sim.won, coreHp: sim.coreHp, coreMaxHp: sim.coreMaxHp }, threshold),
      prevBest,
    };
    setSummary(s);
    setStage('summary');
    setAnnounce(
      `${s.won ? 'Tüm dalgalar püskürtüldü' : `Çekirdek düştü, dalga ${s.wave}`}. Skor ${s.score}. ${s.stars} yıldız.`
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
      stepFx(fxRef.current);
      handleEvents(sim.drainEvents());
      if (sim.over) endRun();
    },
    render: () => {
      const s = surface.current;
      if (!s) return;
      drawFrame(s.beginFrame(), simObj, fxRef.current);
    },
  });

  // HUD ≤ 10 Hz.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHud(snapshot(simObj)), 100);
    return () => window.clearInterval(id);
  }, [playing, simObj]);

  /** Girdiyi simülasyona ver; kabul edilirse sim.tick ile kaydet (sunucu replay'i birebir). */
  const send = useCallback(
    (code: number, a?: number, b?: number) => {
      if (stage !== 'playing' || paused) return false;
      const sim = simObj;
      const ok = sim.input(code, a, b);
      if (ok) recRef.current.record(sim.tick, code, a, b);
      handleEvents(sim.drainEvents());
      return ok;
    },
    [stage, paused, handleEvents, simObj]
  );

  const pulse = useCallback(() => {
    const ok = send(CD_CODE.PULSE);
    if (!ok) fx.haptic([8, 30, 8]);
  }, [send, fx]);

  const pick = useCallback(
    (i: number) => {
      if (send(CD_CODE.PICK, i)) setHud(snapshot(simObj));
    },
    [send, simObj]
  );

  useGameInput(canvasRef, {
    active: playing,
    keymap: KEYMAP,
    swipe: false,
    toLogical: (x, y) => surface.current?.toLogical(x, y) ?? { x, y },
    onInput: (e) => {
      if (e.type === 'pointer') {
        if (e.phase !== 'down') return;
        // Tamsayıya yuvarla: kayıt ile simülasyon aynı değeri görsün.
        const x = Math.round(Math.max(0, Math.min(CD_W, e.x)));
        const y = Math.round(Math.max(0, Math.min(CD_H, e.y)));
        send(CD_CODE.TAP, x, y);
        return;
      }
      if (e.type !== 'press') return;
      if (e.action === 'pause') {
        onPauseRequest();
        return;
      }
      if (e.action === 'primary') send(CD_CODE.AUTO);
      else if (e.action === 'secondary' && !e.repeat) pulse();
    },
  });

  // 1-3: yükseltme seçimi.
  useEffect(() => {
    if (!playing) return;
    const onKey = (ev: KeyboardEvent) => {
      const m = /^(?:Digit|Numpad)([123])$/.exec(ev.code);
      if (!m) return;
      const sim = simObj;
      if (sim.phase !== 'pick') return;
      ev.preventDefault();
      pick(Number(m[1]) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, pick, simObj]);

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
    const url = `${window.location.origin}/customer/games/core-defense`;
    const text = summary.won
      ? `Qratex Çekirdek Savunması'nda ${TOTAL_WAVES} dalganın hepsini püskürttüm: ${summary.score} skor, ${summary.stars} yıldız!`
      : `Qratex Çekirdek Savunması'nda ${summary.wave}. dalgaya kadar dayandım: ${summary.score} skor. Sen geçebilir misin?`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Çekirdek Savunması', text, url });
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
  const chargeReady = hud.charge >= 1;
  const hpLabel = `${hud.hp} / ${hud.maxHp}`;
  const hudSummary = useMemo(
    () => `Dalga ${hud.wave} / ${TOTAL_WAVES}. Skor ${hud.score}, ödül eşiği ${threshold}. Çekirdek canı ${hpLabel}.`,
    [hud.wave, hud.score, threshold, hpLabel]
  );

  return (
    <div className="mx-auto w-full max-w-[420px] select-none">
      {/* HUD şeridi */}
      <div className="mb-2 flex items-center gap-2 text-white" aria-hidden={stage !== 'playing'}>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-xs text-white/75">
            <span>
              Dalga <b className="tabular-nums text-white">{hud.wave}</b>/{TOTAL_WAVES}
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
              style={{ width: `${progress * 100}%`, background: progress >= 1 ? PALETTE.pulse : PALETTE.core }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-white/75">
            <span>
              Çekirdek <b className="tabular-nums text-white">{hpLabel}</b>
            </span>
            {hud.combo >= 2 && (
              <span className="font-semibold" style={{ color: PALETTE.pulse }}>
                Kombo ×{hud.combo}
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
      <p id="cd-rules" className="sr-only">
        {hudSummary} Düşmanlara dokunarak ateş et. Klavyede Boşluk en tehlikeli düşmana ateş eder, Q kalkan darbesini
        patlatır, 1-3 yükseltme seçer, Esc duraklatır.
      </p>

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-white/10" style={{ background: PALETTE.bg }}>
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Çekirdek Savunması oyun alanı"
          aria-describedby="cd-rules"
          className="absolute inset-0 h-full w-full touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
        />

        {/* Yükseltme seçimi */}
        {stage === 'playing' && hud.phase === 'pick' && hud.choices.length > 0 && (
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby="cd-pick-title"
            className="absolute inset-0 flex flex-col justify-center gap-2 bg-[#0b1020]/85 p-4"
          >
            <h3 id="cd-pick-title" className="text-center text-lg font-bold text-white">
              Dalga {hud.wave} temizlendi — yükseltme seç
            </h3>
            <p className="text-center text-xs text-white/70">
              {hud.pickLeft} sn içinde seçmezsen ilki seçilir. Tuşlar: 1 · 2 · 3
            </p>
            {hud.choices.map((id, i) => {
              const u = UPGRADES[id];
              const lvl = hud.levels[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => pick(i)}
                  autoFocus={i === 0}
                  className="flex min-h-[56px] items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-3 text-left text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0E442]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-bold" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{u.title}</span>
                    <span className="block text-xs text-white/70">{u.desc}</span>
                  </span>
                  {u.max < 99 && (
                    <span className="text-xs tabular-nums text-white/60">
                      Sv {lvl}/{u.max}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="mx-auto mt-1 h-1 w-40 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <div className="h-full bg-white/50" style={{ width: `${(hud.pickLeft * HZ * 100) / PICK_TIMEOUT_TICKS}%` }} />
            </div>
          </div>
        )}

        {/* İlk oynayış öğreticisi */}
        {stage === 'tutorial' && (
          <div role="dialog" aria-modal="true" aria-labelledby="cd-tut-title" className="absolute inset-0 flex flex-col justify-center gap-3 bg-[#0b1020]/92 p-5 text-white">
            <h3 id="cd-tut-title" className="text-center text-xl font-bold">
              Nasıl oynanır?
            </h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <Crosshair className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.core }} aria-hidden />
                <span>
                  <b>Düşmana dokun, vur.</b> Turuncu elmaslar (spam) hızlı ve tek vuruşluk; pembe boynuzlu kareler (trol)
                  3 vuruş ister. Altıgen dev = boss.
                </span>
              </li>
              <li className="flex gap-3">
                <Shield className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.pulse }} aria-hidden />
                <span>
                  <b>Kalkan darbesi.</b> Öldürdükçe dolar; dolunca sağ alttaki düğmeyle (ya da Q) çevredeki herkese hasar
                  ver ve geri it.
                </span>
              </li>
              <li className="flex gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PALETTE.troll }} aria-hidden />
                <span>
                  <b>Çekirdeğin canı biterse oyun biter.</b> {TOTAL_WAVES} dalga var; aralarda bir yükseltme seç. Seri
                  vuruş kombo, hasarsız dalga bonus verir.
                </span>
              </li>
            </ol>
            <p className="text-center text-xs text-white/65">
              Klavye: Boşluk ateş · Q kalkan · 1-3 yükseltme · Esc duraklat
            </p>
            <button
              type="button"
              autoFocus
              onClick={startFromTutorial}
              className="mx-auto h-12 rounded-xl px-8 font-bold text-[#0b1020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              style={{ background: PALETTE.core }}
            >
              Anladım, başla
            </button>
          </div>
        )}

        {/* Sonuç özeti */}
        {stage === 'summary' && summary && (
          <div role="dialog" aria-modal="true" aria-labelledby="cd-sum-title" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b1020]/92 p-5 text-center text-white">
            <h3 id="cd-sum-title" className="text-xl font-bold">
              {summary.won ? 'Tüm dalgalar püskürtüldü!' : `Çekirdek ${summary.wave}. dalgada düştü`}
            </h3>
            <div className="flex gap-1" role="img" aria-label={`3 yıldızdan ${summary.stars}`}>
              {[1, 2, 3].map((n) => (
                <Star
                  key={n}
                  className="h-9 w-9"
                  aria-hidden
                  style={{ color: n <= summary.stars ? PALETTE.pulse : 'rgba(255,255,255,0.25)' }}
                  fill={n <= summary.stars ? PALETTE.pulse : 'none'}
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
                ['Dalga', `${summary.won ? TOTAL_WAVES : summary.wave}/${TOTAL_WAVES}`],
                ['Devrilen', String(summary.kills)],
                ['İsabet', `%${summary.accuracy}`],
                ['En iyi kombo', `×${summary.bestCombo}`],
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
                  ? 'Ödül eşiğini geçtin — sunucu doğrulaması sonrası ödül hesaplanır.'
                  : 'Eşiği geçtin. Sıralı modda bu skor ödül getirirdi.'
                : `Ödül eşiği ${threshold}; ${threshold - summary.score} skor kaldı.`}
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
                style={{ background: PALETTE.core }}
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

        {/* Kalkan düğmesi (başparmak erişimi) */}
        {stage === 'playing' && hud.phase !== 'pick' && (
          <button
            type="button"
            onClick={pulse}
            aria-label={chargeReady ? 'Kalkan darbesi hazır — patlat' : `Kalkan doluyor, yüzde ${Math.floor(hud.charge * 100)}`}
            aria-disabled={!chargeReady}
            className="absolute bottom-3 right-3 flex h-16 w-16 items-center justify-center rounded-full border-2 text-[#0b1020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{
              borderColor: PALETTE.pulse,
              background: chargeReady
                ? PALETTE.pulse
                : `conic-gradient(${PALETTE.pulse} ${hud.charge * 360}deg, rgba(255,255,255,0.08) 0deg)`,
            }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: chargeReady ? 'transparent' : PALETTE.bg }}>
              <Shield className="h-6 w-6" style={{ color: chargeReady ? PALETTE.bg : PALETTE.pulse }} aria-hidden />
            </span>
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-white/65">
        {mode === 'practice' ? 'Pratik: ödülsüz, liderliğe girmez.' : 'Sıralı: skor sunucuda yeniden oynatılarak doğrulanır.'}
      </p>
    </div>
  );
}

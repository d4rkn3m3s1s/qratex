'use client';

import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { m as Motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  Trophy,
  Lock,
  RotateCcw,
  Sparkles,
  Star,
  Pause,
  Play,
  LogOut,
  Volume2,
  VolumeX,
  Vibrate,
  VibrateOff,
  Dumbbell,
  Medal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GameLeaderboard } from './game-leaderboard';
import { GameTournament } from './game-tournament';
import type { MiniGameMode, MiniGamePhase, MiniGameResult } from '@/lib/use-mini-game';
import { pickVariant, type GameCopy } from '@/lib/minigame-copy';
import { confetti } from '@/lib/moments/effects';
import { useMotionPolicy } from '@/lib/motion';
import { useGamePrefs } from '@/lib/games/engine/hooks';

/**
 * Ödül kazanınca neon konfeti (accent renge uyumlu). TEK efekt cephesi üzerinden:
 * azaltılmış harekette (OS VEYA `html.reduce-animations`) hiç çalmaz. Kazanılan puanın
 * kapsülü ve olası seviye/lig/rozet anları `useMiniGame` → `moments` (An Motoru) ile oynar;
 * kabuk bunları TEKRARLAMAZ.
 */
function celebrate(accent: string) {
  confetti('sides', { colors: [accent, '#ffffff', '#fbbf24'] });
}

/** Günlük sıralı hakkın yenilendiği an (gün anahtarı Europe/Istanbul takvim günü). */
const DAILY_RESET_NOTE = 'Yeni sıralı hak her gece 00:00’da (Türkiye saati) açılır';

/**
 * Tüm mini oyunların ortak kabuğu (play kaydı: koyu arena, glow). Başlat / oynanış /
 * sonuç / "bugün oynandı" ekranlarını yönetir; `children` yalnız oynanışta görünür.
 *
 * v2 eklentileri (hepsi İSTEĞE BAĞLI; eski 20 oyun hiçbirini vermez ve aynen çalışır):
 *  - `mode` + `onModeChange` → başlangıçta Sıralı / Pratik seçimi; kilit ve sonuç ekranında
 *    "Pratik yap" geçişi.
 *  - `onPause` / `paused` / `onResume` / `onQuit` → oynanış sırasında duraklat düğmesi ve
 *    duraklatma menüsü (Esc ile devam).
 *  - `settings` → ses / titreşim anahtarları (yalnız motorun `fx` cephesini kullanan oyunlar
 *    bu tercihi uygular; bu yüzden eski oyunlarda gösterilmez).
 *  - `controls` → klavye/dokunma şeması (erişilebilirlik).
 */
export interface GameShellProps {
  title: string;
  emoji: string;
  description: string;
  accent: string;
  phase: MiniGamePhase;
  alreadyPlayed: boolean;
  result: MiniGameResult | null;
  rewardThreshold?: number;
  onStart: () => void;
  /** Liderlik tablosu için oyun anahtarı (verilmezse tablo gizlenir). */
  gameType?: string;
  /** Oyuna özel kişilik metinleri (verilmezse genel varsayılanlar). */
  copy?: GameCopy;
  /** Oynanış alanı — sadece phase==='playing' iken görünür. */
  children: ReactNode;
  /** v2: etkin mod. */
  mode?: MiniGameMode;
  /** v2: mod değişimi (verilirse Sıralı / Pratik seçimi görünür). */
  onModeChange?: (mode: MiniGameMode) => void;
  /** v2: oynanışta duraklat düğmesi. */
  onPause?: () => void;
  /** v2: duraklatma menüsü açık mı. */
  paused?: boolean;
  onResume?: () => void;
  /** v2: turdan çık (sıralıda deneme kullanılmış sayılır — menü bunu söyler). */
  onQuit?: () => void;
  /** v2: ses / titreşim anahtarları. */
  settings?: boolean;
  /** v2: kontrol şeması metni. */
  controls?: string;
}

export function GameShell({
  title,
  emoji,
  description,
  accent,
  phase,
  alreadyPlayed,
  result,
  rewardThreshold,
  onStart,
  gameType,
  copy,
  children,
  mode,
  onModeChange,
  onPause,
  paused,
  onResume,
  onQuit,
  settings,
  controls,
}: GameShellProps) {
  const { reduce } = useMotionPolicy();
  const playing = phase === 'playing';
  const loading = phase === 'starting' || phase === 'submitting';
  const showResult = phase === 'done' && !!result;
  const showLocked = phase === 'done' && alreadyPlayed && !result;
  const practice = mode === 'practice';
  const canPractice = typeof onModeChange === 'function';

  // Kazanma/kaybetme başlığı: varyant dizisinden bir kez seç (her render'da
  // titremesin diye sonuç kimliğine bağlı memo). Aynı oyunu tekrar oynayınca
  // farklı başlık çıkar → tekdüzelik kırılır.
  const resultTitle = useMemo(() => {
    if (!result) return '';
    return result.won
      ? pickVariant(copy?.winTitles, 'Kazandın! 🎉')
      : pickVariant(copy?.loseTitles, 'Bu sefer olmadı');
    // result objesi her tamamlamada yenilenir → o zaman yeni varyant seçilir.
  }, [result, copy]);

  // Ödül kazanıldığında bir kez konfeti patlat.
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (showResult && result?.rewarded && !celebratedRef.current) {
      celebratedRef.current = true;
      celebrate(accent);
    }
    if (phase !== 'done') celebratedRef.current = false;
  }, [showResult, result?.rewarded, accent, phase]);

  // Duraklatma menüsü: açılınca "Devam"a odaklan, Esc ile devam et.
  const resumeRef = useRef<HTMLButtonElement | null>(null);
  const pauseOpen = playing && paused === true;
  useEffect(() => {
    if (!pauseOpen) return;
    resumeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onResume?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pauseOpen, onResume]);

  const startHint = practice
    ? 'Pratik: sınırsız, ödülsüz — liderliğe girmez.'
    : copy?.startHint ?? 'Günde 1 hak — kazan, puan + XP kap!';

  return (
    <div
      data-register="play"
      className="relative overflow-hidden rounded-3xl border p-4 sm:p-6"
      style={{
        borderColor: `${accent}40`,
        background:
          'radial-gradient(120% 120% at 50% 0%, rgba(20,12,40,0.92) 0%, rgba(6,4,16,0.98) 70%)',
        boxShadow: `0 0 60px ${accent}22, inset 0 0 80px rgba(0,0,0,0.6)`,
      }}
    >
      {/* Arka plan parçacık ızgarası */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `linear-gradient(${accent}55 1px, transparent 1px), linear-gradient(90deg, ${accent}55 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Cyberpunk köşe aksanları */}
      {[
        'left-2 top-2 border-l-2 border-t-2 rounded-tl-xl',
        'right-2 top-2 border-r-2 border-t-2 rounded-tr-xl',
        'left-2 bottom-2 border-l-2 border-b-2 rounded-bl-xl',
        'right-2 bottom-2 border-r-2 border-b-2 rounded-br-xl',
      ].map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={`pointer-events-none absolute h-6 w-6 ${pos}`}
          style={{ borderColor: `${accent}99` }}
        />
      ))}

      {/* Üst araç şeridi (v2): ses/titreşim + oynanışta duraklat */}
      {(settings || (playing && onPause)) && (
        <div className="relative z-20 mb-2 flex items-center justify-end gap-1">
          {settings && <GamePrefsToggles />}
          {playing && onPause && !pauseOpen && (
            <button
              type="button"
              onClick={onPause}
              aria-label="Oyunu duraklat"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <Pause className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
      )}

      <div
        className="relative z-10 flex min-h-[460px] flex-col items-center justify-center"
        aria-busy={loading || undefined}
      >
        {/* OYNANIŞ — AnimatePresence DIŞINDA: canvas oyunlarında ref'in geç mount
            olmaması için phase 'playing' olur olmaz koşulsuz/anında DOM'a basılır. */}
        {playing && (
          <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="relative w-full"
            aria-hidden={pauseOpen || undefined}
          >
            {children}
          </Motion.div>
        )}

        {/* DURAKLATMA MENÜSÜ (v2) */}
        {pauseOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-pause-title"
            className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm"
          >
            <div className="flex w-full max-w-xs flex-col items-stretch gap-3 p-4 text-center">
              <h2 id="game-pause-title" className="text-xl font-bold text-white">
                Duraklatıldı
              </h2>
              {controls && <p className="text-xs leading-relaxed text-white/70">{controls}</p>}
              <Button
                ref={resumeRef}
                onClick={onResume}
                className="h-12 text-base font-bold"
                style={{ background: accent }}
              >
                <Play className="mr-2 h-4 w-4" aria-hidden /> Devam et
              </Button>
              {onQuit && (
                <Button
                  variant="outline"
                  onClick={onQuit}
                  className="h-12 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="mr-2 h-4 w-4" aria-hidden />
                  {practice ? 'Turu bitir' : 'Turu bitir (deneme kullanılır)'}
                </Button>
              )}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* YÜKLENİYOR */}
          {loading && (
            <Motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="status"
              className="flex flex-col items-center gap-3 text-white/80"
            >
              <Loader2 className={reduce ? 'h-8 w-8' : 'h-8 w-8 animate-spin'} style={{ color: accent }} aria-hidden />
              <p className="text-sm">
                {phase === 'submitting'
                  ? copy?.loadingSubmit ?? 'Sonuç kaydediliyor…'
                  : copy?.loadingStart ?? 'Oyun başlatılıyor…'}
              </p>
            </Motion.div>
          )}

          {/* BAŞLANGIÇ */}
          {phase === 'idle' && (
            <Motion.div
              key="idle"
              initial={{ opacity: 0, y: reduce ? 0 : 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -16 }}
              className="flex w-full max-w-md flex-col items-center gap-5 text-center"
            >
              <Motion.div
                aria-hidden
                className="text-7xl"
                animate={reduce ? undefined : { y: [0, -10, 0], filter: ['brightness(1)', 'brightness(1.4)', 'brightness(1)'] }}
                transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                style={{ textShadow: `0 0 40px ${accent}` }}
              >
                {emoji}
              </Motion.div>
              <h2 className="text-2xl font-bold text-white" style={{ textShadow: `0 0 20px ${accent}99` }}>
                {title}
              </h2>
              <p className="text-sm leading-relaxed text-white/75">{description}</p>

              {canPractice && mode && (
                <ModeSwitch mode={mode} onChange={onModeChange!} accent={accent} rankedUsed={alreadyPlayed} />
              )}

              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/70">
                <Sparkles className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden />
                {startHint}
              </div>
              <Motion.div
                className="relative mt-2"
                whileHover={reduce ? undefined : { scale: 1.05 }}
                whileTap={reduce ? undefined : { scale: 0.96 }}
              >
                {/* nabız halkası (play kaydı; azaltılmış harekette yok) */}
                {!reduce && (
                  <Motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-md"
                    animate={{ boxShadow: [`0 0 0 0 ${accent}66`, `0 0 0 14px ${accent}00`] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  />
                )}
                <Button
                  onClick={onStart}
                  className="relative px-9 py-6 text-base font-bold"
                  style={{ background: accent, boxShadow: `0 0 30px ${accent}88` }}
                >
                  {practice ? '▶ Pratik yap' : copy?.startCta ?? '▶ Oyna'}
                </Button>
              </Motion.div>

              {controls && (
                <p className="text-xs text-white/60">
                  <span className="font-semibold text-white/75">Kontroller:</span> {controls}
                </p>
              )}

              {gameType && (
                <div className="mt-4 w-full space-y-4 border-t border-white/10 pt-4">
                  <GameTournament gameType={gameType} accent={accent} />
                  <div className="border-t border-white/10 pt-4">
                    <GameLeaderboard gameType={gameType} accent={accent} />
                  </div>
                </div>
              )}
            </Motion.div>
          )}

          {/* SONUÇ */}
          {showResult && result && (
            <Motion.div
              key="result"
              initial={{ opacity: 0, scale: reduce ? 1 : 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex w-full max-w-md flex-col items-center gap-4 text-center"
            >
              {/* Trofe + dönen parlama halkası */}
              <div className="relative flex h-28 w-28 items-center justify-center" aria-hidden>
                {result.won && !reduce && (
                  <Motion.div
                    className="absolute inset-0"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    style={{
                      background: `conic-gradient(from 0deg, transparent, ${accent}, transparent 40%)`,
                      borderRadius: '9999px',
                      filter: 'blur(6px)',
                      opacity: 0.7,
                    }}
                  />
                )}
                <Motion.div
                  animate={
                    reduce
                      ? undefined
                      : {
                          rotate: result.won ? [0, -10, 10, 0] : 0,
                          scale: result.won ? [1, 1.2, 1] : [1, 1.1, 1],
                          y: result.won ? [0, -6, 0] : 0,
                        }
                  }
                  transition={reduce ? undefined : { duration: 0.7, repeat: result.won ? Infinity : 0, repeatDelay: 1.2 }}
                  className="relative z-10 text-7xl"
                  style={{ textShadow: `0 0 40px ${accent}` }}
                >
                  {result.won ? '🏆' : '💀'}
                </Motion.div>
              </div>

              <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
                <Motion.h2
                  initial={{ y: reduce ? 0 : 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: reduce ? 0 : 0.15 }}
                  className="text-2xl font-bold text-white"
                  style={{ textShadow: result.won ? `0 0 22px ${accent}99` : 'none' }}
                >
                  {resultTitle}
                </Motion.h2>

                <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-1.5 text-sm text-white/80">
                  <Star className="h-4 w-4" style={{ color: accent }} aria-hidden /> {copy?.scoreLabel ?? 'Skorun'}:{' '}
                  <span className="font-bold tabular-nums text-white">{result.score}</span>
                </div>

                {result.practice ? (
                  <p className="text-xs text-white/70">Pratik turu — ödül ve liderlik yok. İstediğin kadar tekrar oyna.</p>
                ) : result.rewarded ? (
                  <Motion.div
                    initial={{ scale: reduce ? 1 : 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={reduce ? { duration: 0 } : { delay: 0.3, type: 'spring', stiffness: 260, damping: 16 }}
                    className="flex items-center gap-2 rounded-2xl px-6 py-3.5 text-base font-bold text-white"
                    style={{
                      background: `linear-gradient(135deg, ${accent}33, ${accent}11)`,
                      border: `1px solid ${accent}88`,
                      boxShadow: `0 0 30px ${accent}55`,
                    }}
                  >
                    <Trophy className="h-5 w-5" style={{ color: accent }} aria-hidden />
                    +{result.rewardPoints} puan · +{result.rewardXp} XP
                  </Motion.div>
                ) : (
                  <p className="text-xs text-white/65">
                    {result.reason ??
                      copy?.rewardMissNote ??
                      `Ödül için ${rewardThreshold ?? '—'} skor gerekiyordu. Yarın yeni hakla tekrar dene!`}
                  </p>
                )}
              </div>

              {result.practice ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={onStart} className="h-11 font-bold" style={{ background: accent }}>
                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Tekrar oyna
                  </Button>
                  {canPractice && !alreadyPlayed && (
                    <Button
                      variant="outline"
                      onClick={() => onModeChange?.('ranked')}
                      className="h-11 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    >
                      <Medal className="mr-2 h-4 w-4" aria-hidden /> Sıralıya geç
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <p className="mt-1 text-xs text-white/55">
                    {copy?.comeBackNote ?? 'Yarın yeni bir hak için tekrar gel. 🌙'}
                  </p>
                  {canPractice && (
                    <Button
                      variant="outline"
                      onClick={() => onModeChange?.('practice')}
                      className="h-11 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    >
                      <Dumbbell className="mr-2 h-4 w-4" aria-hidden /> Pratik yap (ödülsüz)
                    </Button>
                  )}
                </>
              )}

              {gameType && !result.practice && (
                <div className="mt-3 w-full border-t border-white/10 pt-4">
                  <GameLeaderboard gameType={gameType} accent={accent} />
                </div>
              )}
            </Motion.div>
          )}

          {/* BUGÜN ZATEN OYNANDI */}
          {showLocked && (
            <Motion.div
              key="locked"
              initial={{ opacity: 0, scale: reduce ? 1 : 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex w-full max-w-md flex-col items-center gap-4 text-center"
            >
              <Lock className="h-12 w-12 text-white/60" aria-hidden />
              <h2 className="text-xl font-bold text-white">
                {copy?.lockedTitle ?? 'Bugünün oyununu oynadın'}
              </h2>
              <p className="text-sm text-white/70">
                {copy?.lockedNote ?? copy?.comeBackNote ?? 'Yarın yeni bir hakla tekrar gel. 🌙'}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-white/55">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {DAILY_RESET_NOTE}
              </div>
              {canPractice && (
                <Button
                  onClick={() => onModeChange?.('practice')}
                  className="h-11 font-bold"
                  style={{ background: accent }}
                >
                  <Dumbbell className="mr-2 h-4 w-4" aria-hidden /> Pratik modunda oyna
                </Button>
              )}

              {gameType && (
                <div className="mt-3 w-full border-t border-white/10 pt-4">
                  <GameLeaderboard gameType={gameType} accent={accent} />
                </div>
              )}
            </Motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Sıralı / Pratik seçimi (radiogroup; ok tuşlarıyla gezilir). */
function ModeSwitch({
  mode,
  onChange,
  accent,
  rankedUsed,
}: {
  mode: MiniGameMode;
  onChange: (m: MiniGameMode) => void;
  accent: string;
  rankedUsed: boolean;
}) {
  const options: { value: MiniGameMode; label: string; hint: string; Icon: typeof Medal }[] = [
    { value: 'ranked', label: 'Sıralı', hint: rankedUsed ? 'Bugünkü hak kullanıldı' : 'Günde 1 · ödüllü', Icon: Medal },
    { value: 'practice', label: 'Pratik', hint: 'Sınırsız · ödülsüz', Icon: Dumbbell },
  ];
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(mode === 'ranked' ? 'practice' : 'ranked');
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label="Oyun modu"
      onKeyDown={onKeyDown}
      className="grid w-full grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1"
    >
      {options.map(({ value, label, hint, Icon }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(value)}
            className="flex min-h-[44px] flex-col items-center justify-center rounded-xl px-3 py-2 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            style={active ? { background: `${accent}33`, boxShadow: `inset 0 0 0 1px ${accent}` } : undefined}
          >
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </span>
            <span className="text-[12px] text-white/70">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Ses / titreşim anahtarları (kalıcı; motorun `fx` cephesi uygular). */
function GamePrefsToggles() {
  const [prefs, setPrefs] = useGamePrefs();
  const base =
    'inline-flex h-11 w-11 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80';
  return (
    <>
      <button
        type="button"
        className={base}
        aria-pressed={prefs.sound}
        aria-label={prefs.sound ? 'Oyun sesini kapat' : 'Oyun sesini aç'}
        onClick={() => setPrefs({ sound: !prefs.sound })}
      >
        {prefs.sound ? <Volume2 className="h-5 w-5" aria-hidden /> : <VolumeX className="h-5 w-5" aria-hidden />}
      </button>
      <button
        type="button"
        className={base}
        aria-pressed={prefs.haptics}
        aria-label={prefs.haptics ? 'Titreşimi kapat' : 'Titreşimi aç'}
        onClick={() => setPrefs({ haptics: !prefs.haptics })}
      >
        {prefs.haptics ? <Vibrate className="h-5 w-5" aria-hidden /> : <VibrateOff className="h-5 w-5" aria-hidden />}
      </button>
    </>
  );
}

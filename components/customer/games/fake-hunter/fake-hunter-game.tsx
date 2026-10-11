'use client';

/**
 * Sahte Avcısı — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül GameHost'ta).
 *
 * Dört aşama: Kaydır → Dosya → Kelime → Profil (her aşamada 3 öğe).
 *  - Sıralı: içerik sunucudan ETİKETSİZ gelir; kararlar kilitlenir, puanı sunucu hesaplar
 *    (`lib/games/validators/fake-hunter.ts`). Öğe başına süre var; süre dolarsa "timeout".
 *  - Pratik: ayrı havuz, etiketli; anında geri bildirim + "neden?" açıklaması; süre yok;
 *    sonraki öğe oyuncunun Elo'suna göre seçilir (uyarlanır zorluk). Ödülsüz.
 * Klavye: ← / A sahte · → / D gerçek · 1–4 cümle seç · Enter devam · Esc duraklat.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, m, useAnimationControls } from 'framer-motion';
import { CheckCircle2, Flame, Gauge, Share2, Sparkles, Timer, XCircle } from 'lucide-react';
import type { GameComponentProps } from '@/lib/games/registry/types';
import { useReducedMotionPref } from '@/lib/motion';
import { sfxClick, sfxCombo, sfxFanfare, sfxHit, sfxReveal } from '@/lib/game-sounds';
import {
  ITEM_TIME_MS,
  MODE_ORDER,
  RANKED_PER_MODE,
  TIMEOUT_VERDICT,
  eloLevel,
  maxPossibleScore,
  pickAdaptive,
  scoreAnswer,
  starsFor,
  updateElo,
  type FakeHunterMode,
} from './rules';
import { readLocal, writeLocal } from './storage';
import { FAKE_COLOR, FileCard, ProfileCard, REAL_COLOR, SwipeCard, VerdictButtons, WordCard, type FHItem } from './cards';
import { useFakeHunterCopy, type FakeHunterCopy } from './copy';

type Phase = 'tutorial' | 'intro' | 'item' | 'feedback' | 'summary';

interface Answer {
  id: string;
  verdict: string;
  tMs: number;
}

interface Feedback {
  correct: boolean;
  chosen: string;
  truth: string;
  why: string;
  gained: number;
}

/** İnsan için makul en kısa kilit (sunucunun `minAnswerGapMs` = 400'ünün üstünde). */
const LOCK_MS = 450;

function isMode(v: unknown): v is FakeHunterMode {
  return v === 'kaydir' || v === 'dosya' || v === 'kelime' || v === 'profil';
}

function toItems(content: GameComponentProps['content']): FHItem[] {
  return (content ?? []).filter((c): c is FHItem => isMode((c as { mode?: unknown }).mode)) as FHItem[];
}

function verdictText(tx: FakeHunterCopy, mode: FakeHunterMode, v: string, parts?: unknown): string {
  if (v === TIMEOUT_VERDICT) return tx.timeUp;
  if (mode === 'kelime') {
    const i = Number(v.slice(1));
    const p = Array.isArray(parts) ? (parts as string[])[i] : undefined;
    return p ? tx.sentence(i + 1) : v;
  }
  return v === 'fake' ? tx.modes[mode].fakeLabel : tx.modes[mode].realLabel;
}

export function FakeHunterGame({ mode, config, content, answerKey, paused, onPauseRequest, onFinish, fx, accent }: GameComponentProps) {
  const reduce = useReducedMotionPref();
  const tx = useFakeHunterCopy();
  const ranked = mode === 'ranked';
  const all = useMemo(() => toItems(content), [content]);

  // ── Kuyruk: sıralıda sunucu sırası; pratikte mod başına havuz + Elo seçimi ──
  // `?mod=dosya|kelime|profil` (eski oyun yönlendirmeleri): pratikte o aşamadan başlar.
  // Sıralıda sıra sunucunundur; ipucu yok sayılır.
  const modHint = useSearchParams()?.get('mod');
  const plan = useMemo(() => {
    if (ranked) return { total: all.length, stages: MODE_ORDER.filter((md) => all.some((i) => i.mode === md)) };
    const startAt = MODE_ORDER.indexOf(modHint as FakeHunterMode);
    const order = startAt > 0 ? [...MODE_ORDER.slice(startAt), ...MODE_ORDER.slice(0, startAt)] : MODE_ORDER;
    const stages = order.filter((md) => all.some((i) => i.mode === md));
    const total = stages.reduce((n, md) => n + Math.min(RANKED_PER_MODE, all.filter((i) => i.mode === md).length), 0);
    return { total, stages };
  }, [all, ranked, modHint]);

  const localRef = useRef(readLocal());
  const [elo, setElo] = useState(localRef.current.elo);
  const eloStart = useRef(localRef.current.elo);
  const usedRef = useRef(new Set<string>());
  const servedPerStage = useRef<Record<string, number>>({});

  const pickNext = useCallback(
    (answeredCount: number, currentElo: number): FHItem | null => {
      if (answeredCount >= plan.total) return null;
      if (ranked) return all[answeredCount] ?? null;
      for (const md of plan.stages) {
        const served = servedPerStage.current[md] ?? 0;
        const cap = Math.min(RANKED_PER_MODE, all.filter((i) => i.mode === md).length);
        if (served >= cap) continue;
        const remaining = all.filter((i) => i.mode === md && !usedRef.current.has(i.id));
        const idx = pickAdaptive(remaining, currentElo);
        if (idx < 0) continue;
        return remaining[idx];
      }
      return null;
    },
    [all, plan, ranked]
  );

  const [phase, setPhase] = useState<Phase>(() => (localRef.current.tutorialSeen ? 'intro' : 'tutorial'));
  const [current, setCurrent] = useState<FHItem | null>(() => pickNext(0, localRef.current.elo));
  const [answered, setAnswered] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [burst, setBurst] = useState(0);
  const [history, setHistory] = useState<{ mode: FakeHunterMode; correct: boolean | null }[]>([]);
  const [shareMsg, setShareMsg] = useState('');

  const t0 = useRef(Date.now());
  const answersRef = useRef<Answer[]>([]);
  const lockRef = useRef(false);
  const finishedRef = useRef(false);
  const itemElapsed = useRef(0);
  const shake = useAnimationControls();

  const currentMode: FakeHunterMode | null = current ? current.mode : null;
  const threshold = config.rewardThreshold;
  const maxScore = Math.min(config.maxScore, maxPossibleScore(plan.total));

  // ── Bitiş ──
  const finishRanked = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    // Sıralıda doğruluk istemcide bilinmez (etiketler sunucuda); skoru sunucu hesaplar.
    onFinish({ score: 0, won: false, proof: { answers: answersRef.current } });
  }, [onFinish]);

  const finishPractice = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish({ score, won: score >= threshold, proof: { answers: answersRef.current } });
  }, [onFinish, score, threshold]);

  // ── İlerleme ──
  const advance = useCallback(
    (nextCount: number, nextElo: number) => {
      const prevMode = current?.mode;
      const next = pickNext(nextCount, nextElo);
      setFeedback(null);
      setChosen(null);
      if (!next) {
        setCurrent(null);
        if (ranked) finishRanked();
        else {
          setPhase('summary');
          lockRef.current = false;
          setLocked(false);
        }
        return;
      }
      setCurrent(next);
      itemElapsed.current = 0;
      setRemainingMs(ranked ? ITEM_TIME_MS[next.mode] : null);
      setPhase(next.mode !== prevMode ? 'intro' : 'item');
      lockRef.current = false;
      setLocked(false);
    },
    [current, pickNext, ranked, finishRanked]
  );

  const answer = useCallback(
    (verdict: string) => {
      if (lockRef.current || paused || phase !== 'item' || !current) return;
      lockRef.current = true;
      setLocked(true);
      const tMs = Date.now() - t0.current;
      answersRef.current.push({ id: current.id, verdict, tMs });
      usedRef.current.add(current.id);
      servedPerStage.current[current.mode] = (servedPerStage.current[current.mode] ?? 0) + 1;
      setChosen(verdict);
      const nextCount = answered + 1;
      setAnswered(nextCount);

      if (ranked || !answerKey) {
        // Sıralı: karar kilitlenir, sonuç sunucuda.
        fx.sfx(() => sfxClick());
        fx.haptic('tap');
        setHistory((h) => [...h, { mode: current.mode, correct: null }]);
        window.setTimeout(() => advance(nextCount, elo), LOCK_MS);
        return;
      }

      const truth = answerKey[current.id] ?? '';
      const correct = verdict === truth;
      const nextStreak = correct ? streak + 1 : 0;
      const gained = scoreAnswer({ correct, streak: nextStreak });
      setStreak(nextStreak);
      setScore((s) => s + gained);
      if (correct) setCorrectCount((c) => c + 1);
      const d = (current.difficulty === 1 || current.difficulty === 3 ? current.difficulty : 2) as 1 | 2 | 3;
      const nextElo = updateElo(elo, d, correct);
      setElo(nextElo);
      setHistory((h) => [...h, { mode: current.mode, correct }]);
      setFeedback({ correct, chosen: verdict, truth, why: String(current.why ?? ''), gained });
      setPhase('feedback');
      if (correct) {
        fx.sfx(() => (nextStreak > 0 && nextStreak % 3 === 0 ? sfxFanfare() : sfxCombo(Math.min(nextStreak, 5))));
        fx.haptic('success');
        if (fx.canCelebrate()) setBurst((b) => b + 1);
      } else {
        fx.sfx(() => sfxHit());
        fx.haptic([40, 30, 40]);
        const a = fx.shake(8);
        if (a > 0) void shake.start({ x: [0, -a, a, -a / 2, a / 2, 0], transition: { duration: 0.32 } });
      }
      window.setTimeout(() => {
        lockRef.current = false;
        setLocked(false);
      }, LOCK_MS);
    },
    [paused, phase, current, answered, ranked, answerKey, fx, advance, elo, streak, shake]
  );

  const continueFromFeedback = useCallback(() => {
    if (lockRef.current || phase !== 'feedback') return;
    lockRef.current = true;
    advance(answered, elo);
  }, [phase, advance, answered, elo]);

  const startItem = useCallback(() => {
    if (phase === 'tutorial') {
      localRef.current = writeLocal({ tutorialSeen: true });
      setPhase('intro');
      return;
    }
    if (phase === 'intro' && current) {
      itemElapsed.current = 0;
      setRemainingMs(ranked ? ITEM_TIME_MS[current.mode] : null);
      fx.sfx(() => sfxReveal());
      setPhase('item');
    }
  }, [phase, current, ranked, fx]);

  // ── Süre (yalnız sıralı; duraklatmada durur) ──
  useEffect(() => {
    if (!ranked || phase !== 'item' || paused || !current) return;
    let last = Date.now();
    const limit = ITEM_TIME_MS[current.mode];
    const id = window.setInterval(() => {
      const now = Date.now();
      itemElapsed.current += now - last;
      last = now;
      const left = Math.max(0, limit - itemElapsed.current);
      setRemainingMs(left);
      if (left <= 0) {
        window.clearInterval(id);
        fx.sfx(() => sfxHit());
        answer(TIMEOUT_VERDICT);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [ranked, phase, paused, current, answer, fx]);

  // ── Pratik sonu: rekor + Elo kaydı ──
  useEffect(() => {
    if (phase !== 'summary' || ranked) return;
    const best = Math.max(localRef.current.bestPractice, score);
    localRef.current = writeLocal({ elo, bestPractice: best });
    if (starsFor(score, threshold, maxScore) === 3) fx.confetti('burst');
  }, [phase, ranked, score, elo, threshold, maxScore, fx]);

  // ── Klavye + sekme gizlenince duraklat ──
  const latest = useRef({ answer, startItem, continueFromFeedback, finishPractice, phase, currentMode, paused, onPauseRequest });
  latest.current = { answer, startItem, continueFromFeedback, finishPractice, phase, currentMode, paused, onPauseRequest };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const L = latest.current;
      if (e.key === 'Escape') {
        L.onPauseRequest();
        return;
      }
      if (L.paused || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const onButton = tag === 'BUTTON' || tag === 'A';
      if (e.key === 'Enter' || e.key === ' ') {
        if (onButton) return; // odaktaki düğme kendi tıklamasını yapar
        if (L.phase === 'tutorial' || L.phase === 'intro') L.startItem();
        else if (L.phase === 'feedback') L.continueFromFeedback();
        else return;
        e.preventDefault();
        return;
      }
      if (L.phase !== 'item' || !L.currentMode) return;
      if (L.currentMode === 'kelime') {
        if (/^[1-4]$/.test(e.key)) {
          L.answer(`s${Number(e.key) - 1}`);
          e.preventDefault();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowLeft' || k === 'a') {
        L.answer('fake');
        e.preventDefault();
      } else if (e.key === 'ArrowRight' || k === 'd') {
        L.answer('real');
        e.preventDefault();
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') latest.current.onPauseRequest();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // ── Boş içerik: dürüst durum ──
  if (all.length === 0 || plan.total === 0) {
    return (
      <div role="alert" className="rounded-2xl border border-white/15 bg-black/60 p-6 text-center text-sm text-white">
        {tx.noContent}
        <button
          type="button"
          onClick={() => onFinish({ score: 0, won: false, proof: { answers: [] } })}
          className="mx-auto mt-4 block min-h-[44px] rounded-xl border border-white/30 px-4 font-semibold"
        >
          {tx.closeRound}
        </button>
      </div>
    );
  }

  const stageIndex = currentMode ? plan.stages.indexOf(currentMode) : plan.stages.length - 1;
  const timeLimit = currentMode ? ITEM_TIME_MS[currentMode] : 1;
  const timeFrac = remainingMs === null ? 1 : remainingMs / timeLimit;
  const liveText =
    phase === 'item' && current
      ? tx.liveItem(answered + 1, plan.total, tx.modes[current.mode].title)
      : phase === 'feedback' && feedback
        ? `${feedback.correct ? tx.correct : tx.wrong}. ${feedback.why}`
        : phase === 'summary'
          ? tx.liveDone(score)
          : '';

  return (
    <div className="relative">
      {/* Arena konumu dışta; sarsıntı içteki m.div'de. */}
      <m.div
        animate={shake}
        className="relative overflow-hidden rounded-3xl border border-white/10 p-3 sm:p-4"
        style={{ background: 'radial-gradient(circle at 50% 20%, #053b34 0%, #04201d 45%, #03060f 90%)' }}
      >
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {liveText}
        </p>

        {/* HUD */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-white">
          <ol className="flex items-center gap-1.5" aria-label={tx.stages}>
            {plan.stages.map((md, i) => (
              <li
                key={md}
                aria-current={i === stageIndex ? 'step' : undefined}
                className="rounded-full border px-2 py-0.5 text-[11px]"
                style={{
                  borderColor: i <= stageIndex ? accent : 'rgba(255,255,255,0.2)',
                  background: i === stageIndex ? `${accent}33` : 'transparent',
                  color: i <= stageIndex ? '#fff' : 'rgba(255,255,255,0.6)',
                }}
              >
                {tx.modes[md].title}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-white/80">
              {Math.min(answered + (phase === 'item' ? 1 : 0), plan.total)}/{plan.total}
            </span>
            {ranked ? (
              <span className="text-xs text-white/70">{tx.rankedTarget(threshold)}</span>
            ) : (
              <>
                {streak >= 2 && (
                  <span className="flex items-center gap-0.5 text-amber-300">
                    <Flame aria-hidden className="h-4 w-4" />
                    {streak}
                  </span>
                )}
                <span className="tabular-nums" style={{ color: accent }}>
                  {Math.max(0, score)} / {threshold}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Süre çubuğu (sıralı) */}
        {ranked && phase === 'item' && (
          <div
            className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
            role="timer"
            aria-label={tx.timeLeft(Math.ceil((remainingMs ?? 0) / 1000))}
          >
            <div
              className="h-full rounded-full transition-[width] duration-100 ease-linear motion-reduce:transition-none"
              style={{ width: `${Math.max(0, timeFrac) * 100}%`, background: timeFrac < 0.3 ? FAKE_COLOR : accent }}
            />
          </div>
        )}

        <div className="relative min-h-[360px]">
          {phase === 'tutorial' && <Tutorial accent={accent} ranked={ranked} threshold={threshold} onStart={startItem} />}

          {phase === 'intro' && current && (
            <StageIntro
              mode={current.mode}
              index={plan.stages.indexOf(current.mode)}
              count={plan.stages.length}
              ranked={ranked}
              accent={accent}
              onStart={startItem}
            />
          )}

          {(phase === 'item' || phase === 'feedback') && current && (
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={current.id}
                initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
                transition={{ duration: reduce ? 0 : 0.2 }}
              >
                {current.mode === 'kaydir' && (
                  <SwipeCard item={current} accent={accent} disabled={locked || phase !== 'item' || paused} reduce={reduce} onVerdict={answer} />
                )}
                {current.mode === 'dosya' && <FileCard item={current} accent={accent} />}
                {current.mode === 'profil' && <ProfileCard item={current} accent={accent} reduce={reduce} />}
                {current.mode === 'kelime' && (
                  <WordCard
                    item={current}
                    accent={accent}
                    disabled={locked || phase !== 'item' || paused}
                    chosen={chosen}
                    correct={phase === 'feedback' && feedback ? feedback.truth : null}
                    onVerdict={answer}
                  />
                )}
                {current.mode !== 'kelime' && phase === 'item' && (
                  <VerdictButtons mode={current.mode} disabled={locked || paused} onVerdict={answer} />
                )}
                {ranked && locked && chosen && (
                  <p className="mt-3 text-center text-sm font-semibold text-white/80" aria-hidden>
                    {tx.locked} {verdictText(tx, current.mode, chosen, current.parts)}
                  </p>
                )}
              </m.div>
            </AnimatePresence>
          )}

          {phase === 'feedback' && feedback && current && (
            <FeedbackPanel feedback={feedback} item={current} onNext={continueFromFeedback} disabled={locked} />
          )}

          {phase === 'summary' && (
            <PracticeSummary
              score={Math.max(0, score)}
              threshold={threshold}
              maxScore={maxScore}
              correct={correctCount}
              total={plan.total}
              best={Math.max(localRef.current.bestPractice, score)}
              eloFrom={eloStart.current}
              eloTo={elo}
              history={history}
              accent={accent}
              shareMsg={shareMsg}
              onShare={async () => {
                const stars = '★'.repeat(starsFor(score, threshold, maxScore)).padEnd(3, '☆');
                const text = tx.share(Math.max(0, score), stars, correctCount, plan.total);
                try {
                  if (navigator.share) {
                    await navigator.share({ title: tx.shareTitle, text, url: `${window.location.origin}/customer/games/fake-hunter` });
                    setShareMsg(tx.shared);
                  } else {
                    await navigator.clipboard.writeText(text);
                    setShareMsg(tx.copied);
                  }
                } catch {
                  setShareMsg(tx.shareFailed);
                }
              }}
              onDone={finishPractice}
            />
          )}

          <Burst key={burst} active={burst > 0 && !reduce} />
        </div>
      </m.div>
    </div>
  );
}

// ───────────────────────────── Alt bileşenler ─────────────────────────────

function PrimaryButton({ children, onClick, accent, disabled }: { children: React.ReactNode; onClick: () => void; accent: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mx-auto mt-5 flex min-h-[48px] w-full max-w-xs items-center justify-center gap-2 rounded-2xl text-base font-bold text-black transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 motion-reduce:transition-none"
      style={{ background: accent, boxShadow: `0 0 20px ${accent}55` }}
    >
      {children}
    </button>
  );
}

function Tutorial({ accent, ranked, threshold, onStart }: { accent: string; ranked: boolean; threshold: number; onStart: () => void }) {
  const tx = useFakeHunterCopy();
  return (
    <div className="mx-auto max-w-md text-white">
      <h3 className="text-center text-lg font-bold">{tx.howTo}</h3>
      <p className="mt-1 text-center text-sm text-white/80">{tx.intro}</p>
      <ol className="mt-4 space-y-2">
        {MODE_ORDER.map((md, i) => (
          <li key={md} className="flex gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
            <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black text-black" style={{ background: accent }}>
              {i + 1}
            </span>
            <span>
              <span className="block text-sm font-bold">{tx.modes[md].title} — {tx.modes[md].short}</span>
              <span className="block text-xs leading-relaxed text-white/75">{tx.modes[md].how}</span>
            </span>
          </li>
        ))}
      </ol>
      <ul className="mt-3 space-y-1 text-xs text-white/75">
        <li>{tx.scoring}</li>
        {ranked ? (
          <li>{tx.rankedRule(threshold)}</li>
        ) : (
          <li>{tx.practiceRule}</li>
        )}
        <li>
          {tx.keyboard} <kbd>←</kbd> <span style={{ color: FAKE_COLOR }}>{tx.keyFake}</span> · <kbd>→</kbd>{' '}
          <span style={{ color: REAL_COLOR }}>{tx.keyReal}</span> · <kbd>1–4</kbd> {tx.keySentence} · <kbd>Esc</kbd> {tx.keyPause}
        </li>
      </ul>
      <PrimaryButton onClick={onStart} accent={accent}>
        {tx.letsGo}
      </PrimaryButton>
    </div>
  );
}

function StageIntro({
  mode,
  index,
  count,
  ranked,
  accent,
  onStart,
}: {
  mode: FakeHunterMode;
  index: number;
  count: number;
  ranked: boolean;
  accent: string;
  onStart: () => void;
}) {
  const tx = useFakeHunterCopy();
  const meta = tx.modes[mode];
  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-6 text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
        {tx.stageOf(index + 1, count)}
      </p>
      <h3 className="mt-1 text-2xl font-black" style={{ color: accent }}>
        {meta.title}
      </h3>
      <p className="mt-1 text-sm font-semibold">{meta.short}</p>
      <p className="mt-3 text-sm leading-relaxed text-white/80">{meta.how}</p>
      {ranked && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/70">
          <Timer aria-hidden className="h-3.5 w-3.5" /> {tx.perCase(Math.round(ITEM_TIME_MS[mode] / 1000))}
        </p>
      )}
      <PrimaryButton onClick={onStart} accent={accent}>
        {tx.start}
      </PrimaryButton>
    </div>
  );
}

function FeedbackPanel({ feedback, item, onNext, disabled }: { feedback: Feedback; item: FHItem; onNext: () => void; disabled: boolean }) {
  const tx = useFakeHunterCopy();
  const color = feedback.correct ? REAL_COLOR : FAKE_COLOR;
  const truthText = verdictText(tx, item.mode, feedback.truth, item.parts);
  return (
    <div className="mx-auto mt-4 max-w-[24rem] rounded-2xl border-2 bg-black/60 p-4 text-white" style={{ borderColor: color }}>
      <p className="flex items-center gap-2 text-base font-bold" style={{ color }}>
        {feedback.correct ? <CheckCircle2 aria-hidden className="h-5 w-5" /> : <XCircle aria-hidden className="h-5 w-5" />}
        {feedback.correct ? tx.correct : feedback.chosen === TIMEOUT_VERDICT ? tx.timeUpTitle : tx.wrong}
        <span className="ml-auto text-sm tabular-nums text-white/80">
          {feedback.gained > 0 ? `+${feedback.gained}` : feedback.gained}
        </span>
      </p>
      {!feedback.correct && <p className="mt-1 text-sm text-white/85">{tx.answerWas(truthText)}</p>}
      {feedback.why && <p className="mt-2 text-sm leading-relaxed text-white/85">{feedback.why}</p>}
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        autoFocus
        className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/30 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
      >
        {tx.next}
      </button>
    </div>
  );
}

function PracticeSummary({
  score,
  threshold,
  maxScore,
  correct,
  total,
  best,
  eloFrom,
  eloTo,
  history,
  accent,
  shareMsg,
  onShare,
  onDone,
}: {
  score: number;
  threshold: number;
  maxScore: number;
  correct: number;
  total: number;
  best: number;
  eloFrom: number;
  eloTo: number;
  history: { mode: FakeHunterMode; correct: boolean | null }[];
  accent: string;
  shareMsg: string;
  onShare: () => void;
  onDone: () => void;
}) {
  const tx = useFakeHunterCopy();
  const stars = starsFor(score, threshold, maxScore);
  const delta = eloTo - eloFrom;
  return (
    <div className="mx-auto max-w-md pt-2 text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/70">{tx.practiceDone}</p>
      <p className="mt-1 text-4xl font-black tabular-nums" style={{ color: accent }}>
        {score}
      </p>
      <p className="mt-1 text-2xl" role="img" aria-label={tx.starsLabel(stars)}>
        <span style={{ color: '#fbbf24' }}>{'★'.repeat(stars)}</span>
        <span className="text-white/30">{'★'.repeat(3 - stars)}</span>
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-xl bg-black/40 p-2">
          <dt className="text-[11px] text-white/70">{tx.statCorrect}</dt>
          <dd className="font-bold tabular-nums">
            {correct}/{total}
          </dd>
        </div>
        <div className="rounded-xl bg-black/40 p-2">
          <dt className="text-[11px] text-white/70">{tx.statBest}</dt>
          <dd className="font-bold tabular-nums">{best}</dd>
        </div>
        <div className="rounded-xl bg-black/40 p-2">
          <dt className="flex items-center justify-center gap-1 text-[11px] text-white/70">
            <Gauge aria-hidden className="h-3 w-3" /> {tx.statLevel}
          </dt>
          <dd className="font-bold tabular-nums">
            {eloTo}{' '}
            <span className="text-xs" style={{ color: delta >= 0 ? REAL_COLOR : FAKE_COLOR }}>
              ({delta >= 0 ? '+' : ''}
              {delta})
            </span>
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-sm text-white/80">
        {tx.rank} <span className="font-semibold">{tx.eloTitles[eloLevel(eloTo)]}</span>
        {score < threshold ? tx.belowThreshold(threshold) : tx.aboveThreshold}
      </p>
      <ol className="mt-3 flex flex-wrap justify-center gap-1.5" aria-label={tx.caseSummary}>
        {history.map((h, i) => (
          <li
            key={i}
            className="flex h-7 min-w-[2.25rem] items-center justify-center gap-0.5 rounded-md border px-1 text-[11px] font-semibold"
            style={{ borderColor: h.correct ? REAL_COLOR : FAKE_COLOR, color: h.correct ? REAL_COLOR : FAKE_COLOR }}
            aria-label={tx.caseItem(i + 1, tx.modes[h.mode].title, !!h.correct)}
          >
            {h.correct ? '✓' : '✕'} {tx.modes[h.mode].title.slice(0, 1)}
          </li>
        ))}
      </ol>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onShare}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-white/30 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Share2 aria-hidden className="h-4 w-4" /> {tx.shareBtn}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl font-bold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ background: accent }}
        >
          <Sparkles aria-hidden className="h-4 w-4" /> {tx.endRound}
        </button>
      </div>
      <p className="mt-2 min-h-[1.25rem] text-xs text-white/75" role="status">
        {shareMsg}
      </p>
    </div>
  );
}

/** Doğru cevapta küçük parçacık patlaması (kozmetik; azaltılmış harekette çizilmez). */
function Burst({ active }: { active: boolean }) {
  const parts = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const r = 60 + Math.random() * 50;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r, c: i % 2 ? REAL_COLOR : '#a7f3d0' };
      }),
    []
  );
  if (!active) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 h-0 w-0">
      {parts.map((p, i) => (
        <m.span
          key={i}
          className="absolute block h-2 w-2 rounded-full"
          style={{ background: p.c }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

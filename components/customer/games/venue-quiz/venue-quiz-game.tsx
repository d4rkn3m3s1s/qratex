'use client';

/**
 * Mekân Bilgi Yarışması — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül GameHost'ta).
 *
 *  - Sıralı: 10 soru (kolay → zor), içerik sunucudan ETİKETSİZ gelir. Cevap kilitlenir, doğruluk
 *    turda gösterilmez; puanı sunucu hesaplar (`lib/games/validators/venue-quiz.ts`). Soru başına
 *    15 sn; süre DURAKLATMADA DA işler (sunucu duvar saatine bakar).
 *  - Pratik: kategori seç (ya da karışık), 8 soru, anında geri bildirim + açıklama; duraklatma
 *    süreyi dondurur. Ödülsüz.
 *  - Düello (pratik menüsünden): aynı kod → aynı sorular; puanı sunucu hesaplar
 *    (`/api/customer/venue-quiz/duel`), imzalı meydan okuma bağlantısı paylaşılır. Ödülsüz.
 * Klavye: 1–4 / A–D şık · Enter devam · Esc duraklat.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m, useAnimationControls } from 'framer-motion';
import { Check, Flame, Link2, Share2, Swords, Timer, Trophy, X } from 'lucide-react';
import type { GameComponentProps } from '@/lib/games/registry/types';
import { createRng } from '@/lib/games/engine/rng';
import { useLatestRef } from '@/lib/games/engine/hooks';
import { useVenueQuizCopy, type VenueQuizCopy } from './copy';
import { useReducedMotionPref } from '@/lib/motion';
import { sfxClick, sfxCombo, sfxFanfare, sfxHit, sfxWarn } from '@/lib/game-sounds';
import {
  CATEGORIES,
  PRACTICE_COUNT,
  QUESTION_MS,
  TIMEOUT_VERDICT,
  TRANSITION_MS,
  categoryMeta,
  maxPossibleScore,
  scoreRun,
  starsFor,
  type TimedAnswer,
} from './rules';
import { readLocal, writeLocal } from './storage';

// Renk körü güvenli çift (mavi ↔ turuncu) + her durumda ikon/metin.
const CORRECT = '#38bdf8';
const WRONG = '#fb923c';
const LETTERS = ['A', 'B', 'C', 'D'] as const;

interface Question {
  id: string;
  category: string;
  prompt: string;
  options: { id: string; text: string }[];
  difficulty: number;
  why?: string;
  sponsor?: { name: string };
}

type RunKind = 'ranked' | 'practice' | 'duel';

interface Run {
  kind: RunKind;
  questions: Question[];
  key: Record<string, string> | null;
  /** Pratik kategori anahtarı ('karisik' ya da kategori). */
  catKey: string;
  roundToken?: string;
  challenger?: { name: string; score: number } | null;
}

type Screen =
  | 'tutorial'
  | 'menu'
  | 'invite'
  | 'loading'
  | 'ready'
  | 'countdown'
  | 'question'
  | 'feedback'
  | 'transition'
  | 'submitting'
  | 'summary'
  | 'duel-result'
  | 'error';

interface DuelResult {
  score: number;
  correct: number;
  total: number;
  review: { id: string; answer: string; correct: boolean; timedOut: boolean; points: number; why: string | null }[];
  challengeToken: string;
  challengeExpiresAt: string;
  versus: { opponentName: string; opponentScore: number; result: 'win' | 'lose' | 'draw' } | null;
}

interface DuelRound {
  code: string;
  items: unknown[];
  roundToken: string;
  challenger: { name: string; score: number } | null;
}

function toQuestions(content: unknown[] | null | undefined): Question[] {
  const out: Question[] = [];
  for (const c of content ?? []) {
    const o = c as Partial<Question>;
    if (typeof o.id !== 'string' || typeof o.prompt !== 'string' || !Array.isArray(o.options) || o.options.length !== 4) continue;
    out.push({
      id: o.id,
      category: typeof o.category === 'string' ? o.category : 'mekan',
      prompt: o.prompt,
      options: o.options.filter((x): x is { id: string; text: string } => !!x && typeof x.id === 'string' && typeof x.text === 'string'),
      difficulty: typeof o.difficulty === 'number' ? o.difficulty : 2,
      why: typeof o.why === 'string' ? o.why : undefined,
      sponsor: o.sponsor && typeof o.sponsor.name === 'string' ? { name: o.sponsor.name } : undefined,
    });
  }
  return out.filter((q) => q.options.length === 4);
}

async function postDuel<T>(body: unknown, fallbackError: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/customer/venue-quiz/duel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string } | null;
    if (res.ok && json?.ok && json.data) return { ok: true, data: json.data };
    return { ok: false, error: json?.error ?? fallbackError };
  } catch {
    return { ok: false, error: fallbackError };
  }
}

function readDuelParam(): string | null {
  try {
    const v = new URLSearchParams(window.location.search).get('duello');
    return v && v.length <= 1024 ? v : null;
  } catch {
    return null;
  }
}

/** Kategori başlığı/açıklaması: EN'de çeviri, yoksa kayıttaki Türkçe. */
function catText(tx: VenueQuizCopy, id: string): { title: string; blurb: string; emoji: string } {
  const meta = categoryMeta(id);
  const tr = tx.categories?.[id];
  return { emoji: meta.emoji, title: tr?.title ?? meta.title, blurb: tr?.blurb ?? meta.blurb };
}

function clearDuelParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('duello')) return;
    url.searchParams.delete('duello');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* önemsiz */
  }
}

export function VenueQuizGame({ mode, seed, config, content, answerKey, paused, onPauseRequest, onFinish, fx, accent }: GameComponentProps) {
  const reduce = useReducedMotionPref();
  const tx = useVenueQuizCopy();
  const txRef = useLatestRef(tx);
  const ranked = mode === 'ranked';
  const all = useMemo(() => toQuestions(content), [content]);
  const [local, setLocal] = useState(readLocal);

  const [screen, setScreen] = useState<Screen>(() => (ranked ? 'ready' : readLocal().tutorialSeen ? 'menu' : 'tutorial'));
  const [run, setRun] = useState<Run | null>(() => (ranked ? { kind: 'ranked', questions: all, key: null, catKey: 'sirali' } : null));
  const [idx, setIdx] = useState(0);
  const [count, setCount] = useState(3);
  const [remainingMs, setRemainingMs] = useState(QUESTION_MS);
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lastPoints, setLastPoints] = useState(0);
  const [results, setResults] = useState<{ id: string; correct: boolean; timedOut: boolean }[]>([]);
  const [burst, setBurst] = useState(0);
  const [error, setError] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [duelResult, setDuelResult] = useState<DuelResult | null>(null);
  const [shareMsg, setShareMsg] = useState('');
  const [practiceRound, setPracticeRound] = useState(0);
  const shake = useAnimationControls();

  // Zaman muhasebesi (ref'ler; React state'e her karede yazılmaz).
  const answersRef = useRef<TimedAnswer[]>([]);
  const t0Ref = useRef(0);
  const shownAtRef = useRef(0);
  const activeTotalRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const pausedTotalRef = useRef(0);
  const finishedRef = useRef(false);

  // Duello bağlantısı (yalnız pratikte; sıralıda yok sayılır).
  useEffect(() => {
    if (ranked) return;
    const tok = readDuelParam();
    if (tok) {
      setInviteToken(tok);
      setScreen('invite');
    }
  }, [ranked]);

  // Pratikte duraklatma süreyi dondurur; sıralı/düelloda duvar saati işler.
  const freezeOnPause = run?.kind === 'practice';
  useEffect(() => {
    if (!freezeOnPause) return;
    if (paused && pausedAtRef.current === null) pausedAtRef.current = performance.now();
    if (!paused && pausedAtRef.current !== null) {
      pausedTotalRef.current += performance.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
  }, [paused, freezeOnPause]);

  const clock = useCallback(() => {
    const now = performance.now();
    if (!freezeOnPause) return now;
    const pausedNow = pausedAtRef.current !== null ? now - pausedAtRef.current : 0;
    return now - pausedTotalRef.current - pausedNow;
  }, [freezeOnPause]);

  const questions = run?.questions ?? [];
  const current = questions[idx] ?? null;
  const total = questions.length;

  // ── Tur başlatma ──
  const beginRun = useCallback(
    (r: Run) => {
      answersRef.current = [];
      activeTotalRef.current = 0;
      pausedTotalRef.current = 0;
      pausedAtRef.current = paused ? performance.now() : null;
      setRun(r);
      setIdx(0);
      setScore(0);
      setStreak(0);
      setResults([]);
      setChosen(null);
      setShareMsg('');
      setCount(3);
      setScreen('countdown');
    },
    [paused]
  );

  // Geri sayım: 3-2-1 (pratikte duraklatmada bekler).
  useEffect(() => {
    if (screen !== 'countdown') return;
    if (paused && run?.kind === 'practice') return;
    const id = window.setTimeout(() => {
      if (count > 1) {
        setCount((c) => c - 1);
        fx.sfx(() => sfxClick());
      } else {
        const now = performance.now();
        t0Ref.current = now;
        shownAtRef.current = clock();
        setRemainingMs(QUESTION_MS);
        setScreen('question');
      }
    }, reduce ? 600 : 750);
    return () => window.clearTimeout(id);
  }, [screen, count, paused, run, fx, reduce, clock]);

  const finishRanked = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    // Sıralıda doğruluk istemcide bilinmez (etiketler sunucuda); skoru sunucu hesaplar.
    onFinish({ score: 0, won: false, proof: { answers: answersRef.current } });
  }, [onFinish]);

  const submitDuel = useCallback(
    async (r: Run) => {
      setScreen('submitting');
      const res = await postDuel<DuelResult>(
        { action: 'submit', roundToken: r.roundToken, answers: answersRef.current },
        txRef.current.serverError
      );
      if (!res.ok) {
        setError(res.error);
        setScreen('error');
        return;
      }
      setDuelResult(res.data);
      setScreen('duel-result');
      if (res.data.versus?.result === 'win' || (!res.data.versus && res.data.correct >= Math.ceil(res.data.total * 0.75))) {
        fx.sfx(() => sfxFanfare());
        fx.haptic('big');
        fx.confetti('burst');
      }
    },
    [fx, txRef]
  );

  const finishPracticeRun = useCallback(
    (finalScore: number) => {
      if (!run) return;
      const cur = readLocal();
      if (finalScore > (cur.best[run.catKey] ?? 0)) setLocal(writeLocal({ best: { ...cur.best, [run.catKey]: finalScore } }));
      setScreen('summary');
      const max = maxPossibleScore(run.questions.length);
      const thr = Math.round((config.rewardThreshold * run.questions.length) / 10);
      if (starsFor(finalScore, thr, max) >= 2) {
        fx.sfx(() => sfxFanfare());
        fx.confetti('burst');
      }
    },
    [run, config.rewardThreshold, fx]
  );

  const goNext = useCallback(() => {
    if (!run) return;
    const next = idx + 1;
    setChosen(null);
    if (next >= run.questions.length) {
      if (run.kind === 'ranked') finishRanked();
      else if (run.kind === 'duel') void submitDuel(run);
      else finishPracticeRun(score);
      return;
    }
    setIdx(next);
    shownAtRef.current = clock();
    setRemainingMs(QUESTION_MS);
    setScreen('question');
  }, [run, idx, finishRanked, submitDuel, finishPracticeRun, score, clock]);

  // ── Cevap ──
  const answer = useCallback(
    (verdict: string) => {
      if (screen !== 'question' || !current || !run) return;
      if (run.kind === 'practice' && paused) return;
      const answerMs = Math.max(0, Math.round(clock() - shownAtRef.current));
      let tMs: number;
      if (run.kind === 'practice') {
        // Pratikte geri bildirim ekranı süreye sayılmaz: sanal saat = aktif süre + sabit geçişler.
        activeTotalRef.current += answerMs;
        tMs = activeTotalRef.current + answersRef.current.length * TRANSITION_MS;
      } else {
        tMs = Math.max(0, Math.round(performance.now() - t0Ref.current));
      }
      answersRef.current = [...answersRef.current, { id: current.id, verdict, tMs }];
      setChosen(verdict);

      if (run.kind === 'practice' && run.key) {
        const scored = scoreRun(answersRef.current, run.key);
        const last = scored.answers[scored.answers.length - 1];
        setScore(scored.score);
        setStreak(last.streak);
        setLastPoints(last.points);
        setResults((r) => [...r, { id: current.id, correct: last.correct, timedOut: last.timedOut }]);
        if (last.correct) {
          setBurst((b) => b + 1);
          fx.sfx(() => sfxCombo(Math.min(4, last.streak - 1)));
          fx.haptic('success');
        } else {
          fx.sfx(() => (last.timedOut ? sfxWarn() : sfxHit()));
          fx.haptic([30, 40, 30]);
          const a = fx.shake(7);
          if (a > 0) void shake.start({ x: [0, -a, a, -a / 2, a / 2, 0], transition: { duration: 0.32 } });
        }
        setScreen('feedback');
        return;
      }
      // Sıralı/düello: kilitle, sabit geçiş, sonraki soru (doğruluk turda gösterilmez).
      fx.sfx(() => (verdict === TIMEOUT_VERDICT ? sfxWarn() : sfxClick()));
      fx.haptic('tap');
      setResults((r) => [...r, { id: current.id, correct: false, timedOut: verdict === TIMEOUT_VERDICT }]);
      setScreen('transition');
    },
    [screen, current, run, paused, clock, fx, shake]
  );

  // Geçiş zamanlayıcısı (sıralı/düello): TAM TRANSITION_MS — sunucu cevap süresini buna göre hesaplar.
  // goNext ref'ten okunur: kimliği değişse de zamanlayıcı yeniden kurulmaz (geçiş uzamaz).
  const goNextRef = useRef(goNext);
  useEffect(() => {
    goNextRef.current = goNext;
  }, [goNext]);
  useEffect(() => {
    if (screen !== 'transition') return;
    const id = window.setTimeout(() => goNextRef.current(), TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [screen, idx]);

  // Soru zamanlayıcısı (≤ 10 Hz).
  useEffect(() => {
    if (screen !== 'question') return;
    const id = window.setInterval(() => {
      if (run?.kind === 'practice' && paused) return;
      const left = QUESTION_MS - (clock() - shownAtRef.current);
      setRemainingMs(Math.max(0, left));
      if (left <= 0) answer(TIMEOUT_VERDICT);
    }, 100);
    return () => window.clearInterval(id);
  }, [screen, run, paused, clock, answer]);

  // ── Klavye + sekme ──
  const latest = useRef({ answer, goNext, screen, current, onPauseRequest });
  useEffect(() => {
    latest.current = { answer, goNext, screen, current, onPauseRequest };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const L = latest.current;
      if (e.key === 'Escape') {
        L.onPauseRequest();
        e.preventDefault();
        return;
      }
      if (L.screen === 'question' && L.current) {
        const k = e.key.toLowerCase();
        const i = ['1', '2', '3', '4'].indexOf(k) >= 0 ? Number(k) - 1 : ['a', 'b', 'c', 'd'].indexOf(k);
        if (i >= 0 && L.current.options[i]) {
          L.answer(L.current.options[i].id);
          e.preventDefault();
        }
        return;
      }
      if (L.screen === 'feedback' && e.key === 'Enter') {
        L.goNext();
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

  // ── Pratik: kategori turu ──
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of all) map.set(q.category, (map.get(q.category) ?? 0) + 1);
    return map;
  }, [all]);

  const startPractice = useCallback(
    (catKey: string) => {
      if (!answerKey) return;
      const pool = catKey === 'karisik' ? all : all.filter((q) => q.category === catKey);
      const rng = createRng(`${seed}:${practiceRound}:${catKey}`);
      const picked = rng
        .shuffle(pool)
        .slice(0, PRACTICE_COUNT)
        .sort((a, b) => a.difficulty - b.difficulty);
      setPracticeRound((n) => n + 1);
      if (!readLocal().tutorialSeen) setLocal(writeLocal({ tutorialSeen: true }));
      beginRun({ kind: 'practice', questions: picked, key: answerKey, catKey });
    },
    [all, answerKey, seed, practiceRound, beginRun]
  );

  // ── Düello ──
  const loadDuel = useCallback(async (challenge: string | null) => {
    setScreen('loading');
    setError('');
    const res = await postDuel<DuelRound>({ action: 'round', ...(challenge ? { challenge } : {}) }, txRef.current.serverError);
    if (challenge) clearDuelParam();
    if (!res.ok) {
      setError(res.error);
      setScreen('error');
      return;
    }
    const qs = toQuestions(res.data.items);
    if (qs.length === 0) {
      setError(txRef.current.duelLoadFailed);
      setScreen('error');
      return;
    }
    setRun({ kind: 'duel', questions: qs, key: null, catKey: 'duello', roundToken: res.data.roundToken, challenger: res.data.challenger });
    setScreen('ready');
  }, [txRef]);

  const share = useCallback(async (text: string, url: string, title: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        setShareMsg(txRef.current.shared);
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShareMsg(txRef.current.linkCopied);
      }
    } catch {
      setShareMsg(txRef.current.shareFailed);
    }
  }, [txRef]);

  const exitPractice = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish({ score, won: false, proof: { answers: [] } });
  }, [onFinish, score]);

  // ── Boş içerik: dürüst durum ──
  if (all.length === 0 || (!ranked && !answerKey)) {
    return (
      <div role="alert" className="rounded-2xl border border-white/15 bg-black/60 p-6 text-center text-sm text-white">
        {tx.noContent}
        <button
          type="button"
          onClick={() => {
            if (finishedRef.current) return;
            finishedRef.current = true;
            onFinish({ score: 0, won: false, proof: { answers: [] } });
          }}
          className="mx-auto mt-4 block min-h-[44px] rounded-xl border border-white/30 px-4 font-semibold"
        >
          {tx.closeRound}
        </button>
      </div>
    );
  }

  const timeFrac = remainingMs / QUESTION_MS;
  const secs = Math.ceil(remainingMs / 1000);
  const truth = run?.key && current ? run.key[current.id] : null;
  const liveText =
    screen === 'question' && current
      ? tx.liveQuestion(idx + 1, total, current.prompt)
      : screen === 'feedback' && current
        ? `${chosen === truth ? tx.liveCorrect(lastPoints) : chosen === TIMEOUT_VERDICT ? tx.liveTimeUp : tx.liveWrong} ${current.why ?? ''}`
        : screen === 'transition'
          ? tx.liveSaved
          : screen === 'countdown'
            ? `${count}`
            : '';

  const showHud = screen === 'question' || screen === 'feedback' || screen === 'transition';

  return (
    <div className="relative">
      {/* Konum dışta; sarsıntı içteki m.div'de (framer inline transform). */}
      <m.div
        animate={shake}
        className="relative overflow-hidden rounded-3xl border border-white/10 p-3 sm:p-5"
        style={{ background: 'radial-gradient(circle at 50% 0%, #2e1065 0%, #170a33 45%, #07040f 90%)' }}
      >
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {liveText}
        </p>

        {showHud && run && (
          <div className="mb-3 space-y-2 text-white">
            <div className="flex items-center justify-between gap-2 text-sm font-semibold">
              <ol className="flex flex-wrap items-center gap-1" aria-label={tx.questionOf(idx + 1, total)}>
                {questions.map((q, i) => {
                  const r = results[i];
                  const practice = run.kind === 'practice';
                  const state = !r ? (i === idx ? 'now' : 'todo') : practice ? (r.correct ? 'ok' : 'bad') : 'done';
                  return (
                    <li
                      key={q.id}
                      aria-hidden
                      className="flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-black"
                      style={{
                        borderColor: state === 'now' ? accent : state === 'ok' ? CORRECT : state === 'bad' ? WRONG : 'rgba(255,255,255,0.25)',
                        background: state === 'ok' ? CORRECT : state === 'bad' ? WRONG : state === 'done' ? 'rgba(255,255,255,0.35)' : 'transparent',
                        color: '#0b0b12',
                      }}
                    >
                      {state === 'ok' ? '✓' : state === 'bad' ? '✕' : ''}
                    </li>
                  );
                })}
              </ol>
              <div className="flex items-center gap-3">
                {run.kind === 'practice' ? (
                  <>
                    {streak >= 2 && (
                      <span className="flex items-center gap-0.5 text-amber-300" aria-label={tx.streak(streak)}>
                        <Flame aria-hidden className="h-4 w-4" />
                        {streak}
                      </span>
                    )}
                    <span className="tabular-nums" style={{ color: accent }}>
                      {tx.points(score)}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-white/70">{run.kind === 'ranked' ? tx.serverScores : tx.duelServerScores}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                <div
                  className="h-full rounded-full transition-[width] duration-100 ease-linear motion-reduce:transition-none"
                  style={{
                    width: `${screen === 'question' ? Math.max(0, timeFrac) * 100 : 0}%`,
                    background: timeFrac < 0.3 ? WRONG : accent,
                  }}
                />
              </div>
              <span className="flex w-12 items-center justify-end gap-1 text-xs tabular-nums text-white/80" role="timer" aria-label={tx.timeLeft(secs)}>
                <Timer aria-hidden className="h-3.5 w-3.5" />
                {screen === 'question' ? secs : '–'}
              </span>
            </div>
          </div>
        )}

        <div className="relative min-h-[380px]">
          {screen === 'tutorial' && (
            <Tutorial
              accent={accent}
              onDone={() => {
                setLocal(writeLocal({ tutorialSeen: true }));
                setScreen(inviteToken ? 'invite' : 'menu');
              }}
            />
          )}

          {screen === 'menu' && (
            <PracticeMenu
              accent={accent}
              counts={categoryCounts}
              total={all.length}
              best={local.best}
              onPick={startPractice}
              onDuel={() => void loadDuel(null)}
              onExit={exitPractice}
              onTutorial={() => setScreen('tutorial')}
            />
          )}

          {screen === 'invite' && (
            <Centered>
              <Swords aria-hidden className="mx-auto h-10 w-10" style={{ color: accent }} />
              <h3 className="mt-2 text-xl font-black">{tx.inviteTitle}</h3>
              <p className="mt-2 text-sm text-white/80">{tx.inviteBody}</p>
              <PrimaryButton accent={accent} onClick={() => void loadDuel(inviteToken)}>
                {tx.accept}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  clearDuelParam();
                  setInviteToken(null);
                  setScreen('menu');
                }}
              >
                {tx.notNow}
              </SecondaryButton>
            </Centered>
          )}

          {(screen === 'loading' || screen === 'submitting') && (
            <Centered>
              <div role="status" className="text-sm text-white/80">
                {screen === 'loading' ? tx.preparing : tx.scoring}
              </div>
            </Centered>
          )}

          {screen === 'error' && (
            <Centered>
              <p role="alert" className="text-sm text-white">
                {error}
              </p>
              <PrimaryButton accent={accent} onClick={() => setScreen('menu')}>
                {tx.backToMenu}
              </PrimaryButton>
            </Centered>
          )}

          {screen === 'ready' && run && (
            <ReadyCard
              run={run}
              accent={accent}
              threshold={config.rewardThreshold}
              onStart={() => {
                if (!readLocal().tutorialSeen) setLocal(writeLocal({ tutorialSeen: true }));
                beginRun(run);
              }}
            />
          )}

          {screen === 'countdown' && (
            <Centered>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">{tx.getReady}</p>
              <AnimatePresence mode="popLayout" initial={false}>
                <m.p
                  key={count}
                  initial={reduce ? false : { scale: 1.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.25 }}
                  className="mt-2 text-7xl font-black tabular-nums"
                  style={{ color: accent }}
                  aria-hidden
                >
                  {count}
                </m.p>
              </AnimatePresence>
            </Centered>
          )}

          {(screen === 'question' || screen === 'feedback' || screen === 'transition') && current && run && (
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={current.id}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                transition={{ duration: reduce ? 0 : 0.2 }}
                className="text-white"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1">
                    <span aria-hidden>{catText(tx, current.category).emoji} </span>
                    {catText(tx, current.category).title}
                  </span>
                  <span className="rounded-full border border-white/15 px-2 py-1 text-white/70">
                    {current.difficulty <= 1 ? tx.easy : current.difficulty >= 3 ? tx.hard : tx.medium}
                  </span>
                  {current.sponsor && (
                    <span className="rounded-full border border-amber-300/50 bg-amber-300/10 px-2 py-1 text-amber-200">
                      {tx.sponsored(current.sponsor.name)}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold leading-snug sm:text-xl">{current.prompt}</h3>
                <div role="group" aria-label={tx.options} className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {current.options.map((o, i) => {
                    const isChosen = chosen === o.id;
                    const reveal = screen === 'feedback' && !!truth;
                    const isTruth = reveal && o.id === truth;
                    const isWrongPick = reveal && isChosen && o.id !== truth;
                    const locked = screen !== 'question';
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={locked || (run.kind === 'practice' && paused)}
                        onClick={() => answer(o.id)}
                        aria-pressed={isChosen}
                        className="group flex min-h-[56px] w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left text-[15px] font-semibold transition-[transform,background-color,border-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white enabled:hover:bg-white/10 enabled:active:scale-[0.98] disabled:cursor-default motion-reduce:transition-none"
                        style={{
                          borderColor: isTruth ? CORRECT : isWrongPick ? WRONG : isChosen ? accent : 'rgba(255,255,255,0.18)',
                          background: isTruth ? `${CORRECT}26` : isWrongPick ? `${WRONG}26` : isChosen ? `${accent}33` : 'rgba(0,0,0,0.25)',
                          opacity: locked && !isChosen && !isTruth ? 0.6 : 1,
                        }}
                      >
                        <span
                          aria-hidden
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                          style={{
                            background: isTruth ? CORRECT : isWrongPick ? WRONG : 'rgba(255,255,255,0.12)',
                            color: isTruth || isWrongPick ? '#0b0b12' : '#fff',
                          }}
                        >
                          {isTruth ? <Check className="h-4 w-4" /> : isWrongPick ? <X className="h-4 w-4" /> : LETTERS[i]}
                        </span>
                        <span className="flex-1">{o.text}</span>
                        {isTruth && <span className="sr-only">{tx.correctAnswer}</span>}
                        {isWrongPick && <span className="sr-only">{tx.yourWrongPick}</span>}
                      </button>
                    );
                  })}
                </div>

                {screen === 'transition' && (
                  <p className="mt-4 text-center text-sm font-semibold text-white/80">
                    {chosen === TIMEOUT_VERDICT ? tx.timeUpNext : tx.lockedNext}
                  </p>
                )}

                {screen === 'feedback' && (
                  <div className="mt-4 rounded-2xl border border-white/15 bg-black/40 p-3 text-sm">
                    <p className="flex items-center gap-2 font-bold" style={{ color: chosen === truth ? CORRECT : WRONG }}>
                      {chosen === truth ? <Check aria-hidden className="h-4 w-4" /> : <X aria-hidden className="h-4 w-4" />}
                      {chosen === truth ? tx.correctPts(lastPoints) : chosen === TIMEOUT_VERDICT ? tx.timeUp : tx.wrong}
                    </p>
                    {current.why && <p className="mt-1 leading-relaxed text-white/85">{current.why}</p>}
                    <PrimaryButton accent={accent} onClick={goNext}>
                      {idx + 1 >= total ? tx.seeResult : tx.cont} <span className="text-xs font-semibold opacity-70">(Enter)</span>
                    </PrimaryButton>
                  </div>
                )}
              </m.div>
            </AnimatePresence>
          )}

          {screen === 'summary' && run && (
            <PracticeSummary
              run={run}
              score={score}
              results={results}
              threshold={Math.round((config.rewardThreshold * run.questions.length) / 10)}
              best={local.best[run.catKey] ?? score}
              accent={accent}
              shareMsg={shareMsg}
              onShare={() => {
                const cat = run.catKey === 'karisik' ? tx.mixed : catText(tx, run.catKey).title;
                const correct = results.filter((r) => r.correct).length;
                void share(
                  tx.sharePractice(cat, correct, run.questions.length, score),
                  `${window.location.origin}/customer/games/venue-quiz?kip=pratik`,
                  tx.shareTitle
                );
              }}
              onAgain={() => startPractice(run.catKey)}
              onMenu={() => setScreen('menu')}
              onExit={exitPractice}
            />
          )}

          {screen === 'duel-result' && duelResult && run && (
            <DuelSummary
              result={duelResult}
              questions={run.questions}
              accent={accent}
              shareMsg={shareMsg}
              onShare={() => {
                const url = `${window.location.origin}/customer/games/venue-quiz?kip=pratik&duello=${encodeURIComponent(duelResult.challengeToken)}`;
                void share(
                  tx.shareDuel(duelResult.score, duelResult.correct, duelResult.total),
                  url,
                  tx.shareDuelTitle
                );
              }}
              onNewDuel={() => {
                setDuelResult(null);
                void loadDuel(null);
              }}
              onMenu={() => {
                setDuelResult(null);
                setScreen('menu');
              }}
            />
          )}

          <Burst key={burst} active={burst > 0 && !reduce} />
        </div>
      </m.div>
    </div>
  );
}

// ───────────────────────────── Alt bileşenler ─────────────────────────────

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-md flex-col items-center pt-8 text-center text-white">{children}</div>;
}

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

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto mt-2 flex min-h-[44px] w-full max-w-xs items-center justify-center gap-2 rounded-2xl border border-white/25 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {children}
    </button>
  );
}

function RulesList({ ranked }: { ranked: boolean }) {
  const tx = useVenueQuizCopy();
  return (
    <ul className="mt-3 space-y-1.5 text-left text-xs leading-relaxed text-white/80">
      <li>{tx.ruleTime(QUESTION_MS / 1000)}</li>
      <li>{tx.ruleSpeed}</li>
      {ranked ? <li>{tx.ruleRanked}</li> : <li>{tx.rulePractice}</li>}
      <li>
        {tx.ruleKeysPre} <kbd>1–4</kbd> {tx.ruleKeysOr} <kbd>A–D</kbd> {tx.ruleKeysOption} <kbd>Enter</kbd> {tx.ruleKeysNext}{' '}
        <kbd>Esc</kbd> {tx.ruleKeysPause}
      </li>
    </ul>
  );
}

function Tutorial({ accent, onDone }: { accent: string; onDone: () => void }) {
  const tx = useVenueQuizCopy();
  return (
    <div className="mx-auto max-w-md text-white">
      <h3 className="text-center text-lg font-bold">{tx.howTo}</h3>
      <p className="mt-1 text-center text-sm text-white/80">{tx.tutorialIntro}</p>
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
        <p className="text-sm font-bold">{tx.sampleTitle}</p>
        <p className="mt-1 text-sm text-white/85">{tx.sampleQuestion}</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
          {tx.sampleOptions.map((t, i) => (
            <span
              key={t}
              className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5"
              style={{ borderColor: i === 0 ? CORRECT : 'rgba(255,255,255,0.15)', background: i === 0 ? `${CORRECT}22` : 'transparent' }}
            >
              <span aria-hidden className="font-black">
                {i === 0 ? '✓' : LETTERS[i]}
              </span>
              {t}
              {i === 0 && <span className="sr-only">{tx.correctAnswer}</span>}
            </span>
          ))}
        </div>
      </div>
      <RulesList ranked={false} />
      <p className="mt-2 text-xs text-white/70">
        {tx.tutorialOutro}
      </p>
      <PrimaryButton onClick={onDone} accent={accent}>
        {tx.gotIt}
      </PrimaryButton>
    </div>
  );
}

function PracticeMenu({
  accent,
  counts,
  total,
  best,
  onPick,
  onDuel,
  onExit,
  onTutorial,
}: {
  accent: string;
  counts: Map<string, number>;
  total: number;
  best: Record<string, number>;
  onPick: (cat: string) => void;
  onDuel: () => void;
  onExit: () => void;
  onTutorial: () => void;
}) {
  const tx = useVenueQuizCopy();
  return (
    <div className="mx-auto max-w-lg text-white">
      <h3 className="text-center text-lg font-bold">{tx.menuTitle}</h3>
      <p className="mt-1 text-center text-xs text-white/70">{tx.menuSub(PRACTICE_COUNT)}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <CategoryButton emoji="🎲" title={tx.mixed} blurb={tx.pool(total)} best={best.karisik} accent={accent} onClick={() => onPick('karisik')} />
        {CATEGORIES.map((c) => {
          const n = counts.get(c.id) ?? 0;
          const ct = catText(tx, c.id);
          return (
            <CategoryButton
              key={c.id}
              emoji={c.emoji}
              title={ct.title}
              blurb={n >= 3 ? ct.blurb : tx.notEnough}
              best={best[c.id]}
              accent={accent}
              disabled={n < 3}
              onClick={() => onPick(c.id)}
            />
          );
        })}
      </div>
      <button
        type="button"
        onClick={onDuel}
        className="mt-4 flex min-h-[56px] w-full items-center gap-3 rounded-2xl border-2 px-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white hover:bg-white/10"
        style={{ borderColor: accent }}
      >
        <Swords aria-hidden className="h-6 w-6 shrink-0" style={{ color: accent }} />
        <span>
          <span className="block text-sm font-bold">{tx.duelCta}</span>
          <span className="block text-xs text-white/70">{tx.duelCtaSub}</span>
        </span>
      </button>
      <div className="mt-2 flex gap-2">
        <SecondaryButton onClick={onTutorial}>{tx.howTo}</SecondaryButton>
        <SecondaryButton onClick={onExit}>{tx.endPractice}</SecondaryButton>
      </div>
    </div>
  );
}

function CategoryButton({
  emoji,
  title,
  blurb,
  best,
  accent,
  disabled,
  onClick,
}: {
  emoji: string;
  title: string;
  blurb: string;
  best?: number;
  accent: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const tx = useVenueQuizCopy();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[88px] flex-col items-start rounded-2xl border border-white/15 bg-black/30 p-3 text-left transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40 motion-reduce:transition-none"
    >
      <span aria-hidden className="text-2xl">
        {emoji}
      </span>
      <span className="mt-1 text-sm font-bold">{title}</span>
      <span className="text-[11px] leading-tight text-white/70">{blurb}</span>
      {typeof best === 'number' && best > 0 && (
        <span className="mt-1 text-[11px] font-semibold" style={{ color: accent }}>
          {tx.best(best)}
        </span>
      )}
    </button>
  );
}

function ReadyCard({ run, accent, threshold, onStart }: { run: Run; accent: string; threshold: number; onStart: () => void }) {
  const tx = useVenueQuizCopy();
  const ranked = run.kind === 'ranked';
  return (
    <Centered>
      {ranked ? <Trophy aria-hidden className="h-10 w-10" style={{ color: accent }} /> : <Swords aria-hidden className="h-10 w-10" style={{ color: accent }} />}
      <h3 className="mt-2 text-xl font-black">{ranked ? tx.rankedRound : tx.duelRound}</h3>
      <p className="mt-1 text-sm text-white/80">
        {tx.questionsIntro(run.questions.length)}{' '}
        {ranked ? tx.rankedNeed(threshold) : tx.duelNoReward}
      </p>
      {run.kind === 'duel' && run.challenger && (
        <p className="mt-3 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm">
          <strong>{run.challenger.name}</strong>
          {tx.challengerMid}
          <strong style={{ color: accent }}>{tx.challengerPts(run.challenger.score)}</strong>
          {tx.challengerTail}
        </p>
      )}
      <RulesList ranked={ranked} />
      {ranked && <p className="mt-2 text-xs text-white/60">{tx.firstTime}</p>}
      <PrimaryButton accent={accent} onClick={onStart}>
        {tx.start}
      </PrimaryButton>
    </Centered>
  );
}

function Stars({ n }: { n: number }) {
  const tx = useVenueQuizCopy();
  return (
    <p className="mt-1 text-3xl tracking-widest" aria-label={tx.starsOf(n)}>
      <span aria-hidden>
        {'★'.repeat(n)}
        <span className="text-white/25">{'★'.repeat(3 - n)}</span>
      </span>
    </p>
  );
}

function PracticeSummary({
  run,
  score,
  results,
  threshold,
  best,
  accent,
  shareMsg,
  onShare,
  onAgain,
  onMenu,
  onExit,
}: {
  run: Run;
  score: number;
  results: { id: string; correct: boolean; timedOut: boolean }[];
  threshold: number;
  best: number;
  accent: string;
  shareMsg: string;
  onShare: () => void;
  onAgain: () => void;
  onMenu: () => void;
  onExit: () => void;
}) {
  const max = maxPossibleScore(run.questions.length);
  const stars = starsFor(score, threshold, max);
  const tx = useVenueQuizCopy();
  const correct = results.filter((r) => r.correct).length;
  const cat = run.catKey === 'karisik' ? tx.mixed : catText(tx, run.catKey).title;
  return (
    <div className="mx-auto max-w-md text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/70">{tx.practiceCat(cat)}</p>
      <p className="mt-1 text-5xl font-black tabular-nums" style={{ color: accent }}>
        {score}
      </p>
      <Stars n={stars} />
      <p className="mt-1 text-sm text-white/80">
        {tx.practiceStats(correct, run.questions.length, Math.max(best, score), max)}
      </p>
      <ul className="mt-3 space-y-1 text-left text-xs">
        {run.questions.map((q, i) => {
          const r = results[i];
          return (
            <li key={q.id} className="flex items-start gap-2 rounded-lg bg-black/30 px-2 py-1.5">
              <span aria-hidden className="font-black" style={{ color: r?.correct ? CORRECT : WRONG }}>
                {r?.correct ? '✓' : '✕'}
              </span>
              <span className="sr-only">{r?.correct ? tx.srCorrect : r?.timedOut ? tx.srTimeUp : tx.srWrong}</span>
              <span className="text-white/85">{q.prompt}</span>
            </li>
          );
        })}
      </ul>
      <PrimaryButton accent={accent} onClick={onAgain}>
        {tx.again}
      </PrimaryButton>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <SecondaryButton onClick={onShare}>
          <Share2 aria-hidden className="h-4 w-4" /> {tx.share}
        </SecondaryButton>
        <SecondaryButton onClick={onMenu}>{tx.pickCategory}</SecondaryButton>
      </div>
      <SecondaryButton onClick={onExit}>{tx.endPractice}</SecondaryButton>
      <p className="mt-2 min-h-[1.25rem] text-xs text-white/70" aria-live="polite">
        {shareMsg}
      </p>
    </div>
  );
}

function DuelSummary({
  result,
  questions,
  accent,
  shareMsg,
  onShare,
  onNewDuel,
  onMenu,
}: {
  result: DuelResult;
  questions: Question[];
  accent: string;
  shareMsg: string;
  onShare: () => void;
  onNewDuel: () => void;
  onMenu: () => void;
}) {
  const tx = useVenueQuizCopy();
  const v = result.versus;
  const title = v ? (v.result === 'win' ? tx.duelWon : v.result === 'lose' ? tx.duelLost : tx.duelDraw) : tx.duelReady;
  const expires = new Date(result.challengeExpiresAt).toLocaleDateString(tx.dateLocale, { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long' });
  return (
    <div className="mx-auto max-w-md text-center text-white">
      <h3 className="text-xl font-black">{title}</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border-2 p-3" style={{ borderColor: accent }}>
          <p className="text-xs text-white/70">{tx.you}</p>
          <p className="text-3xl font-black tabular-nums" style={{ color: accent }}>
            {result.score}
          </p>
          <p className="text-xs text-white/70">
            {tx.correctOf(result.correct, result.total)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/20 p-3">
          <p className="text-xs text-white/70">{v ? v.opponentName : tx.opponent}</p>
          <p className="text-3xl font-black tabular-nums">{v ? v.opponentScore : '—'}</p>
          <p className="text-xs text-white/70">{v ? tx.serverScore : tx.shareLink}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-left text-xs">
        {result.review.map((r, i) => {
          const q = questions.find((x) => x.id === r.id) ?? questions[i];
          const ans = q?.options.find((o) => o.id === r.answer)?.text ?? '';
          return (
            <li key={r.id} className="rounded-lg bg-black/30 px-2 py-1.5">
              <p className="flex items-start gap-2">
                <span aria-hidden className="font-black" style={{ color: r.correct ? CORRECT : WRONG }}>
                  {r.correct ? '✓' : '✕'}
                </span>
                <span className="sr-only">{r.correct ? tx.srCorrect : r.timedOut ? tx.srTimeUp : tx.srWrong}</span>
                <span className="text-white/85">{q?.prompt}</span>
              </p>
              <p className="ml-5 mt-0.5 text-white/70">
                {tx.answerWas} <strong className="text-white">{ans}</strong>
                {r.points > 0 && <span style={{ color: accent }}> · +{r.points}</span>}
              </p>
              {r.why && <p className="ml-5 text-white/60">{r.why}</p>}
            </li>
          );
        })}
      </ul>
      <PrimaryButton accent={accent} onClick={onShare}>
        <Link2 aria-hidden className="h-4 w-4" /> {v ? tx.rematch : tx.duelLink}
      </PrimaryButton>
      <p className="mt-1 text-[11px] text-white/60">{tx.linkValid(expires)}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <SecondaryButton onClick={onNewDuel}>{tx.newDuel}</SecondaryButton>
        <SecondaryButton onClick={onMenu}>{tx.backToMenu}</SecondaryButton>
      </div>
      <p className="mt-2 min-h-[1.25rem] text-xs text-white/70" aria-live="polite">
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
        return { x: Math.cos(a) * r, y: Math.sin(a) * r, c: i % 2 ? CORRECT : '#c4b5fd' };
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

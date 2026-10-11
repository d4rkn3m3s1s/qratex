'use client';

/**
 * Günün Kelimesi — v2 oyun bileşeni (yalnız oynanış; kabuk/mod/oturum/ödül `GameHost`'ta).
 *
 * Kelime istemcide YOK: her tahmin `POST /api/customer/daily-word/guess` ile sunucuda renklenir.
 * Sıralıda sunucu imzalı bir zincir döner; bitişte `onFinish({ proof: { chain, guesses } })`
 * (doğrulayıcı: lib/games/validators/daily-word.ts). Pratikte ödül yok, kelime tohumdan sunucuda.
 *
 * Erişilebilirlik: renk tek ayırt edici değil (doğru = ✓ köşe işareti + dolu, var = • + kesik
 * kenar), yüksek kontrast (turuncu/mavi) seçeneği, tam klavye, her satır için ekran okuyucu özeti,
 * `aria-live` duyuru. Hareket: çevirme/sarsıntı/konfeti azaltılmış harekette kapalı.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { Delete, CornerDownLeft, HelpCircle, Share2, Star, Trophy, Contrast, Loader2 } from 'lucide-react';
import type { GameComponentProps } from '@/lib/games/registry/types';
import type { GameProof } from '@/lib/games/registry/types';
import { useReducedMotionPref } from '@/lib/motion';
import { getMiniGame } from '@/lib/minigame-config';
import { sfxClick, sfxHit, sfxReveal, sfxWarn } from '@/lib/game-sounds';
import {
  MAX_GUESSES,
  WORD_LENGTH,
  isTrLetter,
  mergeKeyState,
  normalizeWord,
  scoreFor,
  shareText,
  starsFor,
  type Mark,
} from './rules';

const TUTORIAL_KEY = 'qx.daily-word.tutorial.v1';
const CONTRAST_KEY = 'qx.daily-word.contrast';
const BEST_KEY = 'qx.daily-word.best';
const AUTO_SUBMIT_SEC = 20;

const KB_ROWS: string[][] = [
  ['E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
  ['ENTER', 'Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç', 'BACK'],
];

const PALETTE = {
  bg: '#0b1020',
  normal: { hit: '#15803d', near: '#a16207', miss: '#334155' },
  contrast: { hit: '#c2410c', near: '#1d4ed8', miss: '#334155' },
};

const MARK_TEXT: Record<Mark, string> = { 2: 'doğru yerde', 1: 'kelimede var, başka yerde', 0: 'kelimede yok' };

interface Row {
  guess: string;
  marks: Mark[];
}

interface Saved {
  rows: Row[];
  chain: string | null;
  dayKey: string | null;
  answer: string | null;
}

interface Stats {
  played: number;
  wins: number;
  winRate: number;
  currentStreak: number;
  maxStreak: number;
  distribution: number[];
}

function readLs(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLs(key: string, v: string | null) {
  try {
    if (v === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, v);
  } catch {
    /* gizli pencere / engelli depolama: yalnız kolaylık kaybı */
  }
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; code?: string; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: string; code?: string } | null;
    if (res.ok && json?.ok) return { ok: true, data: json.data as T };
    return { ok: false, status: res.status, code: json?.code, error: json?.error ?? 'Sunucuya ulaşılamadı.' };
  } catch {
    return { ok: false, status: 0, error: 'Bağlantı hatası. Tekrar dene.' };
  }
}

export function DailyWordGame({ mode, seed, config, paused, onPauseRequest, onFinish, fx }: GameComponentProps) {
  const reduced = useReducedMotionPref();
  const storeKey = `qx.daily-word.run.${seed}`;
  const [stage, setStage] = useState<'tutorial' | 'playing' | 'summary'>(() => (readLs(TUTORIAL_KEY) ? 'playing' : 'tutorial'));
  const [rows, setRows] = useState<Row[]>([]);
  const [current, setCurrent] = useState('');
  const [chain, setChain] = useState<string | null>(null);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [contrast, setContrast] = useState(() => readLs(CONTRAST_KEY) === '1');
  const [announce, setAnnounce] = useState('');
  const startedAt = useRef(Date.now());
  const finishedRef = useRef(false);

  const colors = contrast ? PALETTE.contrast : PALETTE.normal;
  const solved = rows.length > 0 && rows[rows.length - 1].marks.every((x) => x === 2);
  const over = solved || rows.length >= MAX_GUESSES;
  const keyState = useMemo(() => rows.reduce<Record<string, Mark>>((acc, r) => mergeKeyState(acc, r.guess, r.marks), {}), [rows]);

  // Yarım kalan sıralı denemeyi (aynı tohum, kısa yenileme penceresi) geri yükle.
  useEffect(() => {
    const raw = readLs(storeKey);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Saved;
      if (Array.isArray(s.rows)) {
        setRows(s.rows);
        setChain(s.chain);
        setDayKey(s.dayKey);
        setAnswer(s.answer);
        const last = s.rows[s.rows.length - 1];
        if (s.rows.length >= MAX_GUESSES || last?.marks.every((x) => x === 2)) setStage('summary');
      }
    } catch {
      /* bozuk kayıt: yok say */
    }
  }, [storeKey]);

  useEffect(() => {
    if (rows.length === 0) return;
    writeLs(storeKey, JSON.stringify({ rows, chain, dayKey, answer } satisfies Saved));
  }, [rows, chain, dayKey, answer, storeKey]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  const flash = useCallback(
    (msg: string) => {
      setToast(msg);
      setAnnounce(msg);
      setShakeKey((k) => k + 1);
      fx.sfx(() => sfxWarn());
      fx.haptic('tap');
    },
    [fx]
  );

  const endGame = useCallback(
    (win: boolean) => {
      if (win) {
        fx.sound('win');
        fx.haptic('success');
        fx.confetti('celebration');
      } else {
        fx.sfx(() => sfxHit());
      }
      window.setTimeout(() => setStage('summary'), reduced ? 200 : 1500);
    },
    [fx, reduced]
  );

  const submitGuess = useCallback(async () => {
    if (busy || over || paused || stage !== 'playing') return;
    if (Array.from(current).length < WORD_LENGTH) {
      flash('Yetersiz harf: 5 harfli bir kelime yaz.');
      return;
    }
    setBusy(true);
    const body =
      mode === 'ranked' ? { mode: 'ranked', seed, guess: current, chain } : { mode: 'practice', seed, guess: current };
    const r = await postJson<{ guess: string; marks: Mark[]; solved: boolean; done?: boolean; answer?: string; chain?: string; dayKey?: string }>(
      '/api/customer/daily-word/guess',
      body
    );
    setBusy(false);
    if (!r.ok) {
      flash(r.error);
      return;
    }
    const d = r.data;
    const nextRows = [...rows, { guess: d.guess, marks: d.marks }];
    setRows(nextRows);
    setCurrent('');
    if (d.chain) setChain(d.chain);
    if (d.dayKey) setDayKey(d.dayKey);
    fx.sfx(() => sfxReveal());
    const summaryText = Array.from(d.guess)
      .map((ch, i) => `${ch} ${MARK_TEXT[d.marks[i]]}`)
      .join(', ');
    setAnnounce(`Tahmin ${nextRows.length}: ${summaryText}.`);
    const done = d.solved || nextRows.length >= MAX_GUESSES;
    if (!done) return;
    let ans = d.answer ?? null;
    if (!ans && mode === 'practice') {
      const rv = await postJson<{ answer: string }>('/api/customer/daily-word/guess', { mode: 'practice', seed, reveal: true });
      if (rv.ok) ans = rv.data.answer;
    }
    setAnswer(ans);
    endGame(d.solved);
  }, [busy, over, paused, stage, current, mode, seed, chain, rows, flash, fx, endGame]);

  const press = useCallback(
    (key: string) => {
      if (stage !== 'playing' || paused || over || busy) return;
      if (key === 'ENTER') {
        void submitGuess();
        return;
      }
      if (key === 'BACK') {
        setCurrent((c) => Array.from(c).slice(0, -1).join(''));
        return;
      }
      if (!isTrLetter(key)) return;
      setCurrent((c) => (Array.from(c).length >= WORD_LENGTH ? c : c + key));
      fx.sfx(() => sfxClick());
    },
    [stage, paused, over, busy, submitGuess, fx]
  );

  // Fiziksel klavye: Türkçe harfler `tr-TR` büyük harfle (i → İ, ı → I).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        if (stage === 'playing') onPauseRequest();
        return;
      }
      if (stage !== 'playing') return;
      if (e.key === 'Enter') {
        // Odak bir düğmedeyse (ekran klavyesi) düğmenin kendi tıklaması çalışsın.
        if (target?.tagName === 'BUTTON') return;
        e.preventDefault();
        press('ENTER');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        press('BACK');
      } else if (e.key.length === 1) {
        const k = normalizeWord(e.key);
        if (isTrLetter(k)) {
          e.preventDefault();
          press(k);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, stage, onPauseRequest]);

  // ── Sonuç ──
  const score = scoreFor(solved, rows.length);
  const stars = starsFor(solved, rows.length);
  const threshold = config.rewardThreshold;
  // Sunucu makullük kuralları (en kısa süre + saniye başına skor) — erken gönderim dürüst oyunu yakmasın.
  const def = getMiniGame('daily-word');
  const minSec = Math.max(config.minDurationSec ?? def?.minDurationSec ?? 0, def?.maxScorePerSec ? score / def.maxScorePerSec : 0) + 1;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (stage !== 'summary') return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [stage]);
  const waitLeft = Math.max(0, Math.ceil(minSec - (now - startedAt.current) / 1000));

  const [prevBest] = useState<number | null>(() => {
    const v = Number(readLs(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  });

  const submit = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    writeLs(storeKey, null);
    if (score > (prevBest ?? 0)) writeLs(BEST_KEY, String(score));
    const proof =
      mode === 'ranked' && chain ? ({ chain, guesses: rows.map((r) => r.guess) } as unknown as GameProof) : undefined;
    onFinish({ score, won: score >= threshold, proof });
  }, [storeKey, score, prevBest, mode, chain, rows, onFinish, threshold]);

  const [autoLeft, setAutoLeft] = useState(AUTO_SUBMIT_SEC);
  useEffect(() => {
    if (stage !== 'summary' || mode !== 'ranked' || paused || waitLeft > 0) return;
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
  }, [stage, mode, paused, waitLeft, submit]);

  // Sıralı istatistik (sunucu; yalnız kayıtlı günler). Hata görünür.
  const [stats, setStats] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; data?: Stats }>({ state: 'idle' });
  const loadStats = useCallback(async () => {
    setStats({ state: 'loading' });
    try {
      const res = await fetch('/api/customer/daily-word/stats', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: { stats: Stats } } | null;
      if (!res.ok || !json?.ok || !json.data) throw new Error('stats');
      setStats({ state: 'ok', data: json.data.stats });
    } catch {
      setStats({ state: 'error' });
    }
  }, []);
  useEffect(() => {
    if (stage === 'summary' && stats.state === 'idle') void loadStats();
  }, [stage, stats.state, loadStats]);

  const [shareNote, setShareNote] = useState('');
  const share = async () => {
    const text = shareText({ dayLabel: dayKey, rows: rows.map((r) => r.marks), solved, highContrast: contrast, practice: mode === 'practice' });
    const url = `${window.location.origin}/customer/games/daily-word`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Günün Kelimesi', text, url });
        setShareNote('Paylaşıldı.');
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareNote('Sonuç kartı panoya kopyalandı.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setShareNote('Paylaşılamadı; tarayıcın bu özelliği desteklemiyor olabilir.');
    }
  };

  const toggleContrast = () => {
    setContrast((c) => {
      writeLs(CONTRAST_KEY, c ? '0' : '1');
      return !c;
    });
  };

  const tileStyle = (mk: Mark | undefined) =>
    mk === undefined
      ? undefined
      : { background: mk === 2 ? colors.hit : mk === 1 ? colors.near : colors.miss, borderColor: 'transparent' };

  const shakeAmp = fx.shake(8);

  // ── Çizim ──
  const grid = Array.from({ length: MAX_GUESSES }, (_, r) => {
    const row = rows[r];
    const isCurrent = r === rows.length && !over;
    const letters = row ? Array.from(row.guess) : isCurrent ? Array.from(current) : [];
    const label = row
      ? `Tahmin ${r + 1}: ${letters.map((ch, i) => `${ch} ${MARK_TEXT[row.marks[i]]}`).join(', ')}`
      : isCurrent
        ? `Yazılan: ${letters.join('') || 'boş'}`
        : `Satır ${r + 1}: boş`;
    return (
      <m.div
        key={isCurrent ? `cur-${shakeKey}` : `r-${r}`}
        role="group"
        aria-label={label}
        className="grid grid-cols-5 gap-1.5"
        animate={isCurrent && shakeKey > 0 && shakeAmp > 0 ? { x: [0, -shakeAmp, shakeAmp, -shakeAmp / 2, shakeAmp / 2, 0] } : undefined}
        transition={{ duration: 0.35 }}
      >
        {Array.from({ length: WORD_LENGTH }, (_, c) => {
          const ch = letters[c] ?? '';
          const mk = row?.marks[c];
          return (
            <m.div
              key={`${r}-${c}-${row ? 'done' : 'live'}`}
              aria-hidden
              initial={row && !reduced ? { rotateX: -90 } : false}
              animate={row && !reduced ? { rotateX: 0 } : ch && isCurrent && !reduced ? { scale: [1, 1.08, 1] } : undefined}
              transition={{ duration: row ? 0.32 : 0.12, delay: row ? c * 0.12 : 0 }}
              className={`relative flex aspect-square items-center justify-center rounded-lg border-2 text-2xl font-extrabold uppercase text-white sm:text-3xl ${
                mk === undefined ? (ch ? 'border-white/60 bg-white/5' : 'border-white/15 bg-white/[0.02]') : ''
              } ${mk === 1 ? 'outline-dashed outline-2 -outline-offset-4 outline-white/70' : ''}`}
              style={tileStyle(mk)}
            >
              {ch}
              {mk === 2 && <span className="absolute right-1 top-0.5 text-[10px] leading-none">✓</span>}
              {mk === 1 && <span className="absolute right-1 top-0.5 text-xs leading-none">•</span>}
            </m.div>
          );
        })}
      </m.div>
    );
  });

  return (
    <div className="mx-auto w-full max-w-[480px] select-none text-white">
      {/* HUD */}
      <div className="mb-3 flex items-center justify-between gap-2 text-sm">
        <span className="rounded-full bg-white/10 px-3 py-1 font-semibold tabular-nums">
          Tahmin {Math.min(rows.length + (over ? 0 : 1), MAX_GUESSES)}/{MAX_GUESSES}
        </span>
        <span className="text-xs text-white/70">{mode === 'practice' ? 'Pratik · ödülsüz' : `Günün kelimesi${dayKey ? ` · ${dayKey}` : ''}`}</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={toggleContrast}
            aria-pressed={contrast}
            aria-label="Yüksek kontrast renkler (turuncu/mavi)"
            className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Contrast className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setStage('tutorial')}
            disabled={stage === 'summary'}
            aria-label="Nasıl oynanır"
            className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
          >
            <HelpCircle className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="relative rounded-3xl p-3" style={{ background: PALETTE.bg, perspective: 600 }}>
        <div className="mx-auto grid max-w-[330px] gap-1.5">{grid}</div>

        <p className="mt-2 min-h-[1.25rem] text-center text-sm font-semibold" aria-hidden>
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin motion-reduce:animate-none" /> : toast}
        </p>

        {stage === 'tutorial' && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dw-tut-title"
            className="absolute inset-0 z-10 flex flex-col justify-center [justify-content:safe_center] gap-3 overflow-y-auto rounded-3xl bg-[#0b1020]/95 p-4"
          >
            <h3 id="dw-tut-title" className="text-center text-lg font-bold">
              Nasıl oynanır?
            </h3>
            <p className="text-sm text-white/85">
              Günün 5 harfli Türkçe kelimesini <b>{MAX_GUESSES} denemede</b> bul. Herkes bugün aynı kelimeyi arıyor; her tahmin sözlükte
              olmalı. Sözlükte olmayan kelime hak yemez.
            </p>
            <ul className="space-y-2 text-sm">
              {(
                [
                  [2, 'K', 'K doğru yerde (dolu + ✓).'],
                  [1, 'A', 'A kelimede var ama başka yerde (• + kesik çerçeve).'],
                  [0, 'L', 'L kelimede yok.'],
                ] as Array<[Mark, string, string]>
              ).map(([mk, ch, t]) => (
                <li key={ch} className="flex items-center gap-3">
                  <span
                    className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-extrabold ${mk === 1 ? 'outline-dashed outline-2 -outline-offset-4 outline-white/70' : ''}`}
                    style={tileStyle(mk)}
                    aria-hidden
                  >
                    {ch}
                    {mk === 2 && <span className="absolute right-0.5 top-0 text-[9px]">✓</span>}
                    {mk === 1 && <span className="absolute right-0.5 top-0 text-[10px]">•</span>}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-white/85">
              Skor: 1. tahminde {MAX_GUESSES}, 6. tahminde 1 puan. Ödül eşiği {threshold}.{' '}
              {mode === 'ranked' ? 'Her tahmin sunucuda denetlenir.' : 'Pratikte ödül yok, istediğin kadar oyna.'}
            </p>
            <p className="text-xs text-white/70">Klavye: harfler · Enter tahmin · Backspace sil · Esc duraklat.</p>
            <button
              type="button"
              autoFocus
              onClick={() => {
                writeLs(TUTORIAL_KEY, '1');
                setStage('playing');
              }}
              className="mx-auto h-12 rounded-xl px-8 font-bold text-[#0b1020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              style={{ background: '#a3e635' }}
            >
              Anladım, başla
            </button>
          </div>
        )}

        {stage === 'summary' && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dw-sum-title"
            className="absolute inset-0 z-10 flex flex-col items-center gap-2 overflow-y-auto rounded-3xl bg-[#0b1020]/95 p-4 text-center"
          >
            <h3 id="dw-sum-title" className="text-lg font-bold">
              {solved ? `${rows.length}. tahminde buldun!` : 'Bu sefer olmadı'}
            </h3>
            {answer && (
              <p className="text-sm text-white/85">
                Kelime: <b className="tracking-widest">{answer}</b>
              </p>
            )}
            <div className="flex gap-1" role="img" aria-label={`3 yıldızdan ${stars}`}>
              {[1, 2, 3].map((n) => (
                <Star key={n} className="h-7 w-7" aria-hidden style={{ color: n <= stars ? '#facc15' : 'rgba(255,255,255,0.25)' }} fill={n <= stars ? '#facc15' : 'none'} />
              ))}
            </div>
            <p className="text-4xl font-black tabular-nums">{score}</p>
            <p className="text-xs text-white/75">
              {prevBest === null ? 'İlk skorun bu cihazda kaydedildi.' : score > prevBest ? `Yeni kişisel rekor! (önceki ${prevBest})` : `En iyin: ${prevBest}`}
            </p>

            <section aria-labelledby="dw-stats" className="w-full max-w-[18rem] rounded-xl bg-white/5 p-2 text-left text-xs">
              <h4 id="dw-stats" className="mb-1 font-semibold text-white/85">
                Sıralı istatistiğin
              </h4>
              {stats.state === 'loading' && <p className="text-white/70">Yükleniyor…</p>}
              {stats.state === 'error' && (
                <p className="text-white/80">
                  İstatistik alınamadı.{' '}
                  <button type="button" onClick={() => void loadStats()} className="min-h-[44px] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    Tekrar dene
                  </button>
                </p>
              )}
              {stats.state === 'ok' && stats.data && (
                <>
                  {stats.data.played === 0 ? (
                    <p className="text-white/75">Henüz kayıtlı sıralı günün yok.</p>
                  ) : (
                    <>
                      <dl className="mb-2 grid grid-cols-4 gap-1 text-center">
                        {(
                          [
                            ['Oynanan', stats.data.played],
                            ['Kazanma', `%${stats.data.winRate}`],
                            ['Seri', stats.data.currentStreak],
                            ['En uzun', stats.data.maxStreak],
                          ] as Array<[string, string | number]>
                        ).map(([k, v]) => (
                          <div key={k}>
                            <dd className="text-base font-bold tabular-nums">{v}</dd>
                            <dt className="text-[10px] text-white/65">{k}</dt>
                          </div>
                        ))}
                      </dl>
                      <ol className="space-y-0.5" aria-label="Tahmin dağılımı">
                        {stats.data.distribution.map((cnt, i) => {
                          const max = Math.max(1, ...stats.data!.distribution);
                          return (
                            <li key={i} className="flex items-center gap-1.5">
                              <span className="w-3 tabular-nums">{i + 1}</span>
                              <span className="h-4 rounded-sm px-1 text-right text-[10px] font-bold leading-4" style={{ width: `${Math.max(8, (cnt / max) * 100)}%`, background: colors.hit }}>
                                {cnt}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </>
                  )}
                  {mode === 'ranked' && <p className="mt-1 text-[10px] text-white/60">Bugünkü sonuç kaydedildikten sonra eklenir.</p>}
                </>
              )}
            </section>

            <p className="text-xs text-white/75">
              {score >= threshold
                ? mode === 'ranked'
                  ? 'Eşiği geçtin — sunucu tahmin zincirini doğruladıktan sonra ödül hesaplanır.'
                  : 'Sıralı modda bu sonuç ödül getirirdi.'
                : 'Ödül için kelimeyi 6 tahmin içinde bulmalısın.'}
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
                disabled={mode === 'ranked' && waitLeft > 0}
                onClick={submit}
                className="flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-[#0b1020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
                style={{ background: '#a3e635' }}
              >
                <Trophy className="h-4 w-4" aria-hidden />
                {mode === 'ranked' ? (waitLeft > 0 ? `Kaydediliyor… ${waitLeft} sn` : `Sonucu kaydet (${autoLeft})`) : 'Devam'}
              </button>
            </div>
            <p className="min-h-[1rem] text-xs text-white/75" aria-live="polite">
              {shareNote}
            </p>
          </div>
        )}
      </div>

      {/* Ekran klavyesi (Türkçe Q, Q/W/X yok) */}
      <div className="mt-3 space-y-1.5" role="group" aria-label="Ekran klavyesi">
        {KB_ROWS.map((row, i) => (
          <div key={i} className="flex justify-center gap-1">
            {row.map((k) => {
              const mk = keyState[k];
              const wide = k === 'ENTER' || k === 'BACK';
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => press(k)}
                  disabled={stage !== 'playing' || over}
                  aria-label={k === 'ENTER' ? 'Tahmin et' : k === 'BACK' ? 'Sil' : `${k}${mk !== undefined ? `, ${MARK_TEXT[mk]}` : ''}`}
                  className={`relative flex h-14 min-w-0 touch-manipulation items-center justify-center rounded-lg text-base font-bold text-white transition-colors active:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-70 ${
                    wide ? 'flex-[1.6] text-xs' : 'flex-1'
                  } ${mk === undefined ? 'bg-white/15' : ''} ${mk === 0 ? 'opacity-60' : ''}`}
                  style={mk === undefined ? undefined : { background: mk === 2 ? colors.hit : mk === 1 ? colors.near : colors.miss }}
                >
                  {k === 'ENTER' ? <CornerDownLeft className="h-5 w-5" aria-hidden /> : k === 'BACK' ? <Delete className="h-5 w-5" aria-hidden /> : k}
                  {mk === 2 && <span className="absolute right-0.5 top-0 text-[9px]" aria-hidden>✓</span>}
                  {mk === 1 && <span className="absolute right-0.5 top-0 text-[10px]" aria-hidden>•</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <p className="mt-2 text-center text-xs text-white/70">
        {mode === 'practice' ? 'Pratik: ödülsüz, liderliğe girmez.' : 'Sıralı: her tahmin sunucuda renklenir ve doğrulanır.'}
      </p>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Star, Trophy, Ghost as GhostIcon, RotateCcw, Shield, Zap } from 'lucide-react';
import { toast } from 'sonner';
import {
  primeAudio,
  sfxCollectStar,
  sfxEatGhost,
  sfxHit,
  sfxPowerUp,
  sfxWarn,
  sfxWin,
} from '@/lib/game-sounds';

/**
 * QRatex temalı, gelişmiş Pacman benzeri oyun. Akıcı piksel hareket (60fps),
 * neon görseller + particle efektleri, power-up (kalkan/hayalet-yeme), skor/kombo,
 * ekran sarsıntısı ve Web Audio ses. 5 yıldız toplayınca kazanır; sonuç sunucuda
 * doğrulanır (günde 1 hak, ödül backend'de hesaplanır).
 */
const GRID: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];
const ROWS = GRID.length;
const COLS = GRID[0].length;
const CELL = 34;
const W = COLS * CELL;
const H = ROWS * CELL;

type Pos = { x: number; y: number };
type Dir = { dx: number; dy: number };

const STAR_POSITIONS: Pos[] = [
  { x: 1, y: 1 },
  { x: 14, y: 1 },
  { x: 1, y: 9 },
  { x: 14, y: 9 },
  { x: 7, y: 5 },
];
// Power pellet (hayaletleri yenebilir kılan) konumları.
const PELLET_POSITIONS: Pos[] = [
  { x: 1, y: 5 },
  { x: 14, y: 5 },
];
const PLAYER_START: Pos = { x: 7, y: 7 };
const GHOST_STARTS: Pos[] = [
  { x: 1, y: 3 },
  { x: 14, y: 7 },
  { x: 7, y: 3 },
];
const GHOST_COLORS = ['#ef4444', '#06b6d4', '#f59e0b'];

function isWall(x: number, y: number): boolean {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return true;
  return GRID[y][x] === 1;
}

type GameState = 'idle' | 'starting' | 'playing' | 'won' | 'lost' | 'done';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type Mover = {
  // hücre koordinatı (mantık) + piksel koordinatı (render, akıcı interpolasyon)
  cx: number;
  cy: number;
  px: number;
  py: number;
  dir: Dir;
  speed: number; // piksel/kare
};

const SPEED_PLAYER = 2.4;
const SPEED_GHOST = 1.7;
const POWER_MS = 6000;

export function PacmanGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<GameState>('idle');
  const [stars, setStars] = useState(0);
  const [score, setScore] = useState(0);
  const [powerLeft, setPowerLeft] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Oyun durumu ref'lerde (animasyon döngüsü render'a bağımlı olmasın).
  const playerRef = useRef<Mover>(makeMover(PLAYER_START, SPEED_PLAYER));
  const queuedDirRef = useRef<Dir>({ dx: 0, dy: 0 });
  const ghostsRef = useRef<Mover[]>([]);
  const collectedRef = useRef<Set<number>>(new Set());
  const pelletsRef = useRef<Set<number>>(new Set());
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const powerUntilRef = useRef(0);
  const ghostScaredRef = useRef<boolean[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef(0);
  const startTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const warnedRef = useRef(false);

  const spawnParticles = useCallback((px: number, py: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const sp = 1 + Math.random() * 3;
      particlesRef.current.push({
        x: px,
        y: py,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 1,
        maxLife: 22 + Math.random() * 14,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }, []);

  // ── Çizim ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    frameRef.current += 1;
    const f = frameRef.current;

    ctx.save();
    // Ekran sarsıntısı
    if (shakeRef.current > 0) {
      const s = shakeRef.current;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      shakeRef.current = Math.max(0, s - 0.6);
    }

    // Arka plan gradyanı
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a0518');
    bg.addColorStop(1, '#130a2e');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // Duvarlar (neon)
    ctx.lineWidth = 3;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (GRID[y][x] === 1) {
          const gx = x * CELL;
          const gy = y * CELL;
          ctx.fillStyle = 'rgba(124,58,237,0.18)';
          roundRect(ctx, gx + 2, gy + 2, CELL - 4, CELL - 4, 7);
          ctx.fill();
          ctx.shadowColor = '#a855f7';
          ctx.shadowBlur = 8;
          ctx.strokeStyle = '#a855f7';
          roundRect(ctx, gx + 2, gy + 2, CELL - 4, CELL - 4, 7);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    }

    // Power pellet'ler (nabız atan)
    PELLET_POSITIONS.forEach((p, i) => {
      if (pelletsRef.current.has(i)) return;
      const cx = p.x * CELL + CELL / 2;
      const cy = p.y * CELL + CELL / 2;
      const pulse = 5 + Math.sin(f * 0.15) * 2;
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Yıldızlar (dönen + parlayan)
    STAR_POSITIONS.forEach((s, i) => {
      if (collectedRef.current.has(i)) return;
      const cx = s.x * CELL + CELL / 2;
      const cy = s.y * CELL + CELL / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(f * 0.03 + i);
      const glow = 9 + Math.sin(f * 0.1 + i) * 2;
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const a1 = (Math.PI / 2) * 3 + (p * 2 * Math.PI) / 5;
        const a2 = a1 + Math.PI / 5;
        ctx.lineTo(Math.cos(a1) * glow, Math.sin(a1) * glow);
        ctx.lineTo(Math.cos(a2) * (glow * 0.45), Math.sin(a2) * (glow * 0.45));
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    });

    // Particle'lar
    particlesRef.current.forEach((pt) => {
      const alpha = pt.life;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Oyuncu (parlayan disk + ağız animasyonu + power halkası)
    const pl = playerRef.current;
    const powered = powerUntilRef.current > performance.now();
    if (powered) {
      ctx.strokeStyle = '#22d3ee';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pl.px, pl.py, CELL / 2 + 2 + Math.sin(f * 0.3) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 16;
    ctx.fillStyle = powered ? '#c4b5fd' : '#a855f7';
    const mouth = 0.18 + 0.18 * Math.abs(Math.sin(f * 0.25));
    let a0 = mouth * Math.PI;
    let a1 = (2 - mouth) * Math.PI;
    let rot = 0;
    const d = pl.dir;
    if (d.dx === 1) rot = 0;
    else if (d.dx === -1) rot = Math.PI;
    else if (d.dy === 1) rot = Math.PI / 2;
    else if (d.dy === -1) rot = -Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(pl.px, pl.py);
    ctx.arc(pl.px, pl.py, CELL / 2 - 3, a0 + rot, a1 + rot);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Hayaletler (korkmuşsa mavi yanıp söner)
    ghostsRef.current.forEach((g, i) => {
      const scared = powered && ghostScaredRef.current[i];
      const blink = scared && powerUntilRef.current - performance.now() < 1600 && f % 16 < 8;
      const color = scared ? (blink ? '#fff' : '#3b82f6') : GHOST_COLORS[i % GHOST_COLORS.length];
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      const gx = g.px;
      const gy = g.py;
      const r = CELL / 2 - 3;
      ctx.beginPath();
      ctx.arc(gx, gy, r, Math.PI, 0);
      const wob = Math.sin(f * 0.3 + i) * 1.5;
      ctx.lineTo(gx + r, gy + r + wob);
      ctx.lineTo(gx + r / 2, gy + r - 2);
      ctx.lineTo(gx, gy + r + wob);
      ctx.lineTo(gx - r / 2, gy + r - 2);
      ctx.lineTo(gx - r, gy + r + wob);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      // gözler
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(gx - 4, gy - 2, 3, 0, Math.PI * 2);
      ctx.arc(gx + 4, gy - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = scared ? '#1e3a8a' : '#1e1b4b';
      ctx.beginPath();
      ctx.arc(gx - 4 + g.dir.dx, gy - 2 + g.dir.dy, 1.5, 0, Math.PI * 2);
      ctx.arc(gx + 4 + g.dir.dx, gy - 2 + g.dir.dy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }, []);

  const finishGame = useCallback(
    async (won: boolean) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (won) sfxWin();
      else sfxHit();
      setState(won ? 'won' : 'lost');
      const starsCollected = collectedRef.current.size;
      setStars(starsCollected);
      if (!sessionId) return;
      setSubmitting(true);
      try {
        const durationSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const res = await fetch('/api/customer/games/pacman/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, starsCollected, durationSec, won }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Sonuç kaydedilemedi');
        if (json.rewarded) {
          setResultMsg(`${json.rewardPoints} puan + ${json.rewardXp} XP kazandın! 🎉`);
          toast.success('Ödül hesabına eklendi!');
        } else if (won) {
          setResultMsg('Kazandın ama ödül koşulları sağlanmadı.');
        } else {
          setResultMsg('Bu sefer olmadı. Yarın tekrar dene!');
        }
        setState('done');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Hata');
        setState('done');
      } finally {
        setSubmitting(false);
      }
    },
    [sessionId]
  );

  // ── Hareket yardımcısı: bir mover'ı yönünde akıcı taşı, hücre merkezine gelince
  // mantıksal hücreyi günceller ve yeni yön uygular. ──
  const stepMover = useCallback((m: Mover, chooseDir: (m: Mover) => Dir) => {
    const targetX = m.cx * CELL + CELL / 2;
    const targetY = m.cy * CELL + CELL / 2;
    const atCenter = Math.abs(m.px - targetX) < m.speed && Math.abs(m.py - targetY) < m.speed;

    if (atCenter) {
      m.px = targetX;
      m.py = targetY;
      const nd = chooseDir(m);
      m.dir = nd;
      const nx = m.cx + nd.dx;
      const ny = m.cy + nd.dy;
      if (!isWall(nx, ny) && (nd.dx !== 0 || nd.dy !== 0)) {
        m.cx = nx;
        m.cy = ny;
      }
    }
    // hedefe doğru piksel ilerlet
    const tx = m.cx * CELL + CELL / 2;
    const ty = m.cy * CELL + CELL / 2;
    m.px += Math.sign(tx - m.px) * Math.min(m.speed, Math.abs(tx - m.px));
    m.py += Math.sign(ty - m.py) * Math.min(m.speed, Math.abs(ty - m.py));
  }, []);

  // ── Oyun döngüsü ──
  const loop = useCallback(() => {
    const nowMs = performance.now();
    const powered = powerUntilRef.current > nowMs;
    setPowerLeft(powered ? Math.ceil((powerUntilRef.current - nowMs) / 1000) : 0);
    if (powered && !warnedRef.current && powerUntilRef.current - nowMs < 1600) {
      warnedRef.current = true;
      sfxWarn();
    }

    // Oyuncu hareketi: kuyruktaki yön uygulanabiliyorsa uygula.
    stepMover(playerRef.current, (m) => {
      const q = queuedDirRef.current;
      if ((q.dx !== 0 || q.dy !== 0) && !isWall(m.cx + q.dx, m.cy + q.dy)) return q;
      if (!isWall(m.cx + m.dir.dx, m.cy + m.dir.dy)) return m.dir;
      return { dx: 0, dy: 0 };
    });

    const pl = playerRef.current;

    // Yıldız toplama
    STAR_POSITIONS.forEach((s, i) => {
      if (!collectedRef.current.has(i) && s.x === pl.cx && s.y === pl.cy) {
        collectedRef.current.add(i);
        comboRef.current += 1;
        const gain = 100 * comboRef.current;
        scoreRef.current += gain;
        setScore(scoreRef.current);
        setStars(collectedRef.current.size);
        sfxCollectStar(collectedRef.current.size);
        spawnParticles(pl.px, pl.py, '#fbbf24', 16);
        shakeRef.current = Math.min(6, shakeRef.current + 3);
      }
    });

    // Power pellet
    PELLET_POSITIONS.forEach((p, i) => {
      if (!pelletsRef.current.has(i) && p.x === pl.cx && p.y === pl.cy) {
        pelletsRef.current.add(i);
        powerUntilRef.current = nowMs + POWER_MS;
        warnedRef.current = false;
        ghostScaredRef.current = ghostsRef.current.map(() => true);
        sfxPowerUp();
        spawnParticles(pl.px, pl.py, '#22d3ee', 22);
        shakeRef.current = 6;
      }
    });

    if (collectedRef.current.size >= STAR_POSITIONS.length) {
      void finishGame(true);
      return;
    }

    // Hayaletler: merkeze geldiklerinde yön seçer (oyuncuya doğru / korkmuşsa kaçış).
    ghostsRef.current.forEach((g, i) => {
      const scared = powerUntilRef.current > nowMs && ghostScaredRef.current[i];
      stepMover(g, (m) => {
        const opts: Dir[] = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ].filter((o) => !isWall(m.cx + o.dx, m.cy + o.dy));
        if (opts.length === 0) return { dx: 0, dy: 0 };
        // U dönüşünü engelle (mümkünse)
        const noBack = opts.filter((o) => !(o.dx === -m.dir.dx && o.dy === -m.dir.dy));
        const pool = noBack.length > 0 ? noBack : opts;
        pool.sort((a, b) => {
          const da = Math.abs(m.cx + a.dx - pl.cx) + Math.abs(m.cy + a.dy - pl.cy);
          const db = Math.abs(m.cx + b.dx - pl.cx) + Math.abs(m.cy + b.dy - pl.cy);
          return scared ? db - da : da - db; // korkmuşsa uzaklaş
        });
        const greedy = Math.random() < (scared ? 0.6 : 0.78);
        return greedy ? pool[0] : pool[(Math.random() * pool.length) | 0];
      });
    });

    // Çarpışma (piksel mesafesi)
    ghostsRef.current.forEach((g, i) => {
      const dist = Math.hypot(g.px - pl.px, g.py - pl.py);
      if (dist < CELL * 0.6) {
        if (powerUntilRef.current > nowMs && ghostScaredRef.current[i]) {
          // hayaleti ye → başa ışınla, skor
          spawnParticles(g.px, g.py, '#3b82f6', 18);
          sfxEatGhost();
          scoreRef.current += 300;
          setScore(scoreRef.current);
          ghostScaredRef.current[i] = false;
          const home = GHOST_STARTS[i];
          g.cx = home.x;
          g.cy = home.y;
          g.px = home.x * CELL + CELL / 2;
          g.py = home.y * CELL + CELL / 2;
          shakeRef.current = 5;
        } else if (powerUntilRef.current <= nowMs) {
          spawnParticles(pl.px, pl.py, '#ef4444', 26);
          shakeRef.current = 10;
          void finishGame(false);
        }
      }
    });

    // Particle güncelle
    particlesRef.current = particlesRef.current.filter((pt) => {
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= 1 / pt.maxLife;
      return pt.life > 0;
    });

    draw();
    rafRef.current = requestAnimationFrame(loop);
  }, [draw, finishGame, spawnParticles, stepMover]);

  const startGame = async () => {
    primeAudio();
    setState('starting');
    try {
      const res = await fetch('/api/customer/games/pacman/start', { method: 'POST' });
      const json = await res.json();
      if (json.alreadyPlayed) {
        setAlreadyPlayed(true);
        setState('done');
        setResultMsg(json.message || 'Bugünün oyununu zaten oynadınız.');
        return;
      }
      if (!res.ok || !json.canPlay) throw new Error(json.error || 'Oyun başlatılamadı');
      setSessionId(json.sessionId);
      // Durumu sıfırla
      playerRef.current = makeMover(PLAYER_START, SPEED_PLAYER);
      queuedDirRef.current = { dx: 0, dy: 0 };
      ghostsRef.current = GHOST_STARTS.map((g) => makeMover(g, SPEED_GHOST));
      ghostScaredRef.current = GHOST_STARTS.map(() => false);
      collectedRef.current = new Set();
      pelletsRef.current = new Set();
      particlesRef.current = [];
      scoreRef.current = 0;
      comboRef.current = 0;
      powerUntilRef.current = 0;
      shakeRef.current = 0;
      frameRef.current = 0;
      warnedRef.current = false;
      startTimeRef.current = Date.now();
      setStars(0);
      setScore(0);
      setPowerLeft(0);
      setResultMsg(null);
      setState('playing');
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
      setState('idle');
    }
  };

  // Klavye
  useEffect(() => {
    if (state !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: { dx: 0, dy: -1 },
        ArrowDown: { dx: 0, dy: 1 },
        ArrowLeft: { dx: -1, dy: 0 },
        ArrowRight: { dx: 1, dy: 0 },
        w: { dx: 0, dy: -1 },
        s: { dx: 0, dy: 1 },
        a: { dx: -1, dy: 0 },
        d: { dx: 1, dy: 0 },
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        queuedDirRef.current = dir;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  // Dokunmatik kaydırma
  useEffect(() => {
    if (state !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let sx = 0;
    let sy = 0;
    const onStart = (e: TouchEvent) => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      queuedDirRef.current =
        Math.abs(dx) > Math.abs(dy)
          ? { dx: dx > 0 ? 1 : -1, dy: 0 }
          : { dx: 0, dy: dy > 0 ? 1 : -1 };
    };
    canvas.addEventListener('touchstart', onStart, { passive: true });
    canvas.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchend', onEnd);
    };
  }, [state]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const setDir = (d: Dir) => {
    if (state === 'playing') queuedDirRef.current = d;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* HUD */}
      <div className="flex items-center gap-3 sm:gap-5 text-sm flex-wrap justify-center">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Star className="w-4 h-4 text-amber-500" /> {stars}/{STAR_POSITIONS.length}
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums">
          <Zap className="w-4 h-4 text-primary" /> {score.toLocaleString('tr-TR')}
        </span>
        {powerLeft > 0 && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-500 animate-pulse">
            <Shield className="w-4 h-4" /> {powerLeft}sn
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <GhostIcon className="w-4 h-4" /> kaç!
        </span>
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-primary/30 shadow-[0_0_30px_-8px] shadow-primary/40">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block max-w-full h-auto touch-none bg-[#0a0518]"
        />

        {state !== 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-black/80 to-purple-950/80 backdrop-blur-sm text-white p-6 text-center">
            {state === 'idle' && (
              <>
                <Trophy className="w-12 h-12 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
                <p className="text-lg font-bold">Yıldız Avı</p>
                <p className="text-sm text-white/80 max-w-xs">
                  5 yıldızı topla, hayaletlerden kaç! Mavi küreyi yutarsan hayaletleri yiyebilirsin.
                </p>
                <p className="text-xs text-white/60">Günde 1 hak · 5 yıldız = 150 puan + 75 XP</p>
                <Button onClick={startGame} size="lg" className="mt-1">
                  Oyna ▶
                </Button>
              </>
            )}
            {state === 'starting' && <Loader2 className="w-8 h-8 animate-spin" />}
            {(state === 'won' || state === 'lost' || state === 'done') && (
              <>
                {state === 'won' && (
                  <Trophy className="w-12 h-12 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
                )}
                {submitting ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  <>
                    <p className="text-lg font-bold">
                      {alreadyPlayed
                        ? 'Bugünün oyunu bitti'
                        : state === 'won'
                          ? 'Kazandın! 🎉'
                          : state === 'lost'
                            ? 'Yakalandın!'
                            : 'Oyun bitti'}
                    </p>
                    {score > 0 && <p className="text-sm text-white/80">Skor: {score.toLocaleString('tr-TR')}</p>}
                    {resultMsg && <p className="text-sm text-white/80">{resultMsg}</p>}
                    {!alreadyPlayed && <p className="text-xs text-white/60">Yarın yeni bir hak için tekrar gel.</p>}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Dokunmatik kontroller */}
      {state === 'playing' && (
        <div className="grid grid-cols-3 gap-2 w-44 sm:hidden">
          <div />
          <Button variant="outline" size="icon" onClick={() => setDir({ dx: 0, dy: -1 })}>▲</Button>
          <div />
          <Button variant="outline" size="icon" onClick={() => setDir({ dx: -1, dy: 0 })}>◀</Button>
          <Button variant="outline" size="icon" onClick={() => setDir({ dx: 0, dy: 1 })}>▼</Button>
          <Button variant="outline" size="icon" onClick={() => setDir({ dx: 1, dy: 0 })}>▶</Button>
        </div>
      )}
      {state === 'playing' && (
        <p className="text-xs text-muted-foreground hidden sm:block">
          Ok tuşları / WASD ile hareket · mavi küre = hayalet avı
        </p>
      )}

      {(state === 'done' || state === 'won' || state === 'lost') && alreadyPlayed && (
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RotateCcw className="w-4 h-4 mr-2" /> Yenile
        </Button>
      )}
    </div>
  );
}

// ── yardımcılar ──
function makeMover(cell: Pos, speed: number): Mover {
  return {
    cx: cell.x,
    cy: cell.y,
    px: cell.x * CELL + CELL / 2,
    py: cell.y * CELL + CELL / 2,
    dir: { dx: 0, dy: 0 },
    speed,
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

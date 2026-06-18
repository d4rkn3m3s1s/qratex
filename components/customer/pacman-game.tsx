'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Star, Trophy, Ghost as GhostIcon, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * QRatex temalı, Pacman benzeri 2D ızgara oyunu. Oyuncu labirentte gezip yıldız
 * toplar; 5 yıldızda kazanır. Hayaletler basit takip AI'ı ile kovalar; yakalanırsa
 * kaybeder. Sonuç sunucuya bildirilir (ödül sunucuda hesaplanır).
 *
 * 16x11 ızgara. 1 = duvar, 0 = yol. Yıldız ve hayalet konumları yoldan seçilir.
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
const CELL = 32;

type Pos = { x: number; y: number };
type Dir = { dx: number; dy: number };

const STAR_POSITIONS: Pos[] = [
  { x: 1, y: 1 },
  { x: 14, y: 1 },
  { x: 1, y: 9 },
  { x: 14, y: 9 },
  { x: 7, y: 5 },
];
const PLAYER_START: Pos = { x: 7, y: 7 };
const GHOST_STARTS: Pos[] = [
  { x: 1, y: 5 },
  { x: 14, y: 5 },
];

function isWall(x: number, y: number): boolean {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return true;
  return GRID[y][x] === 1;
}

type GameState = 'idle' | 'starting' | 'playing' | 'won' | 'lost' | 'done';

export function PacmanGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<GameState>('idle');
  const [stars, setStars] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Oyun durumu ref'lerde (render'a bağımlı olmadan animasyon döngüsü).
  const playerRef = useRef<Pos>({ ...PLAYER_START });
  const dirRef = useRef<Dir>({ dx: 0, dy: 0 });
  const ghostsRef = useRef<Pos[]>(GHOST_STARTS.map((g) => ({ ...g })));
  const collectedRef = useRef<Set<number>>(new Set());
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Arka plan
    ctx.fillStyle = '#0b0a17';
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    // Duvarlar (marka moru)
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (GRID[y][x] === 1) {
          ctx.fillStyle = '#3b1d72';
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
          ctx.strokeStyle = '#7c3aed';
          ctx.lineWidth = 1;
          ctx.strokeRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }

    // Yıldızlar
    STAR_POSITIONS.forEach((s, i) => {
      if (collectedRef.current.has(i)) return;
      const cx = s.x * CELL + CELL / 2;
      const cy = s.y * CELL + CELL / 2;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const ang = (Math.PI / 2) * 3 + (p * 2 * Math.PI) / 5;
        const ang2 = ang + Math.PI / 5;
        ctx.lineTo(cx + Math.cos(ang) * 9, cy + Math.sin(ang) * 9);
        ctx.lineTo(cx + Math.cos(ang2) * 4, cy + Math.sin(ang2) * 4);
      }
      ctx.closePath();
      ctx.fill();
    });

    // Oyuncu (QRatex pac — mor disk, ağız)
    const p = playerRef.current;
    const px = p.x * CELL + CELL / 2;
    const py = p.y * CELL + CELL / 2;
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    const mouth = 0.25 + 0.15 * Math.sin(tickRef.current * 0.3);
    let a0 = mouth * Math.PI;
    let a1 = (2 - mouth) * Math.PI;
    const d = dirRef.current;
    let rot = 0;
    if (d.dx === 1) rot = 0;
    else if (d.dx === -1) rot = Math.PI;
    else if (d.dy === 1) rot = Math.PI / 2;
    else if (d.dy === -1) rot = -Math.PI / 2;
    a0 += rot;
    a1 += rot;
    ctx.moveTo(px, py);
    ctx.arc(px, py, CELL / 2 - 3, a0, a1);
    ctx.closePath();
    ctx.fill();

    // Hayaletler
    const ghostColors = ['#ef4444', '#06b6d4'];
    ghostsRef.current.forEach((g, i) => {
      const gx = g.x * CELL + CELL / 2;
      const gy = g.y * CELL + CELL / 2;
      ctx.fillStyle = ghostColors[i % ghostColors.length];
      ctx.beginPath();
      ctx.arc(gx, gy, CELL / 2 - 3, Math.PI, 0);
      ctx.lineTo(gx + CELL / 2 - 3, gy + CELL / 2 - 3);
      ctx.lineTo(gx + CELL / 4, gy + CELL / 4);
      ctx.lineTo(gx, gy + CELL / 2 - 3);
      ctx.lineTo(gx - CELL / 4, gy + CELL / 4);
      ctx.lineTo(gx - CELL / 2 + 3, gy + CELL / 2 - 3);
      ctx.closePath();
      ctx.fill();
      // gözler
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(gx - 4, gy - 2, 3, 0, 2 * Math.PI);
      ctx.arc(gx + 4, gy - 2, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
  }, []);

  const finishGame = useCallback(
    async (won: boolean) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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

  // Oyun döngüsü: oyuncuyu sürekli yönünde, hayaletleri periyodik taşır.
  const loop = useCallback(() => {
    tickRef.current += 1;

    // Oyuncu her ~8 tick'te bir hücre ilerler.
    if (tickRef.current % 8 === 0) {
      const p = playerRef.current;
      const d = dirRef.current;
      const nx = p.x + d.dx;
      const ny = p.y + d.dy;
      if (!isWall(nx, ny)) {
        p.x = nx;
        p.y = ny;
      }
      // Yıldız topla
      STAR_POSITIONS.forEach((s, i) => {
        if (!collectedRef.current.has(i) && s.x === p.x && s.y === p.y) {
          collectedRef.current.add(i);
          setStars(collectedRef.current.size);
        }
      });
      if (collectedRef.current.size >= STAR_POSITIONS.length) {
        void finishGame(true);
        return;
      }
    }

    // Hayaletler her ~14 tick'te bir hücre, oyuncuya doğru basit yönelim.
    if (tickRef.current % 14 === 0) {
      const p = playerRef.current;
      ghostsRef.current.forEach((g) => {
        const options: Dir[] = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ].filter((o) => !isWall(g.x + o.dx, g.y + o.dy));
        if (options.length === 0) return;
        // Oyuncuya en çok yaklaştıran yön (basit greedy, %70 ihtimalle).
        options.sort((a, b) => {
          const da = Math.abs(g.x + a.dx - p.x) + Math.abs(g.y + a.dy - p.y);
          const db = Math.abs(g.x + b.dx - p.x) + Math.abs(g.y + b.dy - p.y);
          return da - db;
        });
        const choice = Math.random() < 0.7 ? options[0] : options[(Math.random() * options.length) | 0];
        g.x += choice.dx;
        g.y += choice.dy;
      });
      // Çarpışma kontrolü
      const p2 = playerRef.current;
      if (ghostsRef.current.some((g) => g.x === p2.x && g.y === p2.y)) {
        void finishGame(false);
        return;
      }
    }

    draw();
    rafRef.current = requestAnimationFrame(loop);
  }, [draw, finishGame]);

  const startGame = async () => {
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
      playerRef.current = { ...PLAYER_START };
      dirRef.current = { dx: 0, dy: 0 };
      ghostsRef.current = GHOST_STARTS.map((g) => ({ ...g }));
      collectedRef.current = new Set();
      tickRef.current = 0;
      startTimeRef.current = Date.now();
      setStars(0);
      setResultMsg(null);
      setState('playing');
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
      setState('idle');
    }
  };

  // Klavye kontrolü
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
        dirRef.current = dir;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  // Temizlik
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const setDir = (d: Dir) => {
    if (state === 'playing') dirRef.current = d;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1 font-semibold">
          <Star className="w-4 h-4 text-amber-500" /> {stars} / {STAR_POSITIONS.length}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <GhostIcon className="w-4 h-4" /> Hayaletlerden kaç!
        </span>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-border/60 shadow-md">
        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          className="block max-w-full h-auto touch-none"
        />

        {state !== 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white p-6 text-center">
            {state === 'idle' && (
              <>
                <Trophy className="w-10 h-10 text-amber-400" />
                <p className="font-semibold">5 yıldızı topla, hayaletlerden kaç!</p>
                <p className="text-xs text-white/70">Günde 1 hak. 5 yıldız = 150 puan + 75 XP.</p>
                <Button onClick={startGame}>Oyna</Button>
              </>
            )}
            {state === 'starting' && <Loader2 className="w-8 h-8 animate-spin" />}
            {(state === 'won' || state === 'lost' || state === 'done') && (
              <>
                {state === 'won' && <Trophy className="w-10 h-10 text-amber-400" />}
                {submitting ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  <>
                    <p className="font-semibold">
                      {alreadyPlayed
                        ? 'Bugünün oyunu bitti'
                        : state === 'won'
                          ? 'Kazandın! 🎉'
                          : state === 'lost'
                            ? 'Yakalandın!'
                            : 'Oyun bitti'}
                    </p>
                    {resultMsg && <p className="text-sm text-white/80">{resultMsg}</p>}
                    {!alreadyPlayed && (
                      <p className="text-xs text-white/60">Yarın yeni bir hak için tekrar gel.</p>
                    )}
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
          Ok tuşları veya WASD ile hareket et.
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

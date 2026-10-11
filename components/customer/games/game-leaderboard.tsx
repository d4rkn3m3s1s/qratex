'use client';

import { useEffect, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { Crown, Medal, Loader2, RotateCw } from 'lucide-react';
import { useMotionPolicy } from '@/lib/motion';

interface Row {
  rank: number;
  name: string;
  image: string | null;
  score: number;
  isMe: boolean;
}
interface Me {
  /** Sıralama penceresi (ilk 100) dışındaysa null → "100+". */
  rank: number | null;
  score: number;
  inTop: boolean;
}

/**
 * Bir oyunun tüm zamanlar en yüksek skor tablosu. GameShell'in başlangıç
 * ekranında, oyun lobisinde gösterilir. /api/customer/games/[game]/leaderboard.
 */
export function GameLeaderboard({ gameType, accent }: { gameType: string; accent: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [total, setTotal] = useState(0);
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { reduce } = useMotionPolicy();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    fetch(`/api/customer/games/${gameType}/leaderboard`)
      .then(async (r) => {
        // Hata yanıtı "henüz skor yok" gibi gösterilmez (sahte boş durum).
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        setRows(Array.isArray(j.leaderboard) ? j.leaderboard : []);
        setMe(j.me ?? null);
        setTotal(j.totalPlayers ?? 0);
        setCapped(j.totalCapped === true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [gameType, reloadKey]);

  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-white/60">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> Liderlik yükleniyor…
      </div>
    );
  }

  if (failed) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 py-4 text-center text-xs text-white/70">
        <span>Liderlik tablosu şu an alınamadı.</span>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 font-medium text-white/90 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden /> Tekrar dene
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-white/40">
        Henüz skor yok — ilk rekoru sen kır! 🏁
      </p>
    );
  }

  const medal = (rank: number) => {
    // İkon yalnız görsel; sıra ekran okuyucuya metin olarak gider.
    if (rank === 1) return <><Crown className="h-4 w-4 text-amber-400" aria-hidden /><span className="sr-only">1.</span></>;
    if (rank === 2) return <><Medal className="h-4 w-4 text-slate-300" aria-hidden /><span className="sr-only">2.</span></>;
    if (rank === 3) return <><Medal className="h-4 w-4 text-amber-700" aria-hidden /><span className="sr-only">3.</span></>;
    return <span className="w-4 text-center text-[11px] text-white/40">{rank}</span>;
  };

  return (
    <div className="w-full max-w-sm space-y-1.5">
      <div className="mb-1 flex items-center justify-between px-1 text-[11px] uppercase tracking-wider text-white/40">
        <span>Liderlik · tüm zamanlar</span>
        <span>{capped ? `${total}+` : total} oyuncu</span>
      </div>
      {rows.map((r, i) => (
        <Motion.div
          key={r.rank}
          initial={reduce ? false : { opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduce ? { duration: 0 } : { delay: Math.min(i, 10) * 0.04 }}
          className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm"
          style={{
            background: r.isMe ? `${accent}1f` : 'rgba(255,255,255,0.04)',
            border: r.isMe ? `1px solid ${accent}66` : '1px solid transparent',
          }}
        >
          <span className="flex w-5 justify-center">{medal(r.rank)}</span>
          <span className="flex-1 truncate font-medium text-white/90">
            {r.name} {r.isMe && <span className="text-[10px] text-white/50">(sen)</span>}
          </span>
          <span className="font-bold tabular-nums" style={{ color: accent }}>
            {r.score}
          </span>
        </Motion.div>
      ))}

      {/* İlk 10 dışındaysam kendi sıram */}
      {me && !me.inTop && (
        <div
          className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm"
          style={{ background: `${accent}1f`, border: `1px solid ${accent}66` }}
        >
          <span className="min-w-5 text-center text-[11px] tabular-nums text-white/60">{me.rank ?? `${total}+`}</span>
          <span className="flex-1 truncate font-medium text-white/90">Sen</span>
          <span className="font-bold tabular-nums" style={{ color: accent }}>
            {me.score}
          </span>
        </div>
      )}
    </div>
  );
}

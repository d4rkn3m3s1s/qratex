'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Award, Lock, Loader2 } from 'lucide-react';
import { RARITY_COLOR, type AchievementProgress } from '@/lib/game-achievements';

/**
 * Oyun Merkezi'ndeki "Başarımlar" bölümü. /api/customer/games/achievements'tan
 * ilerlemeleri çeker; kilitli/açık rozetleri nadir-renk kodlu kartlar olarak
 * gösterir. Kilitlilerde ilerleme çubuğu vardır.
 */
export function AchievementsPanel() {
  const [items, setItems] = useState<AchievementProgress[]>([]);
  const [unlocked, setUnlocked] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/customer/games/achievements')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (Array.isArray(j.achievements)) setItems(j.achievements);
        setUnlocked(j.unlockedCount ?? 0);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 py-8 text-sm text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" /> Başarımlar yükleniyor…
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-white/10 p-4"
      style={{ background: 'linear-gradient(120deg, rgba(20,14,40,0.9), rgba(8,5,20,0.95))' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Award className="h-4 w-4 text-amber-400" /> Başarımlar
        </div>
        <span className="text-sm font-bold tabular-nums text-white">
          {unlocked}/{items.length}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {items.map((a, i) => {
          const color = RARITY_COLOR[a.rarity];
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="relative flex flex-col gap-1.5 rounded-xl border p-3"
              style={{
                borderColor: a.unlocked ? `${color}88` : 'rgba(255,255,255,0.08)',
                background: a.unlocked
                  ? `linear-gradient(135deg, ${color}22, ${color}08)`
                  : 'rgba(255,255,255,0.03)',
                boxShadow: a.unlocked ? `0 0 18px ${color}33` : 'none',
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-2xl"
                  style={{ filter: a.unlocked ? 'none' : 'grayscale(1) opacity(0.4)' }}
                >
                  {a.icon}
                </span>
                {a.unlocked ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                    style={{ background: `${color}33`, color }}
                  >
                    {a.rarity}
                  </span>
                ) : (
                  <Lock className="h-3.5 w-3.5 text-white/30" />
                )}
              </div>
              <div className="text-[12px] font-bold text-white">{a.title}</div>
              <div className="text-[10px] leading-tight text-white/50">{a.description}</div>
              {!a.unlocked && (
                <div className="mt-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${a.pct}%`, background: color }} />
                  </div>
                  <div className="mt-0.5 text-right text-[9px] tabular-nums text-white/40">
                    {a.progress}/{a.target}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

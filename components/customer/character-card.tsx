'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CharacterReveal, type RevealCharacter } from '@/components/customer/character-reveal';

type Category = { key: string; name: string; emoji: string; accent: string; description: string };
type Character = { badgeId: string; name: string; icon?: string; description?: string; why?: string; category?: Category | null };
type State = {
  character: Character | null;
  canDiscover: boolean;
  feedbackCount: number;
  threshold: number;
  remaining: number;
  progress: number;
};

/**
 * "Karakterin" kartı — AI'ın yorumlara göre atadığı dizi/film karakter rozetini gösterir.
 *  • Rozet yoksa + eşik dolmadıysa: ilerleme BARI (kaç yorum kaldı) gösterir.
 *  • Eşik dolduysa: "Karakterimi Keşfet" → SİHİRLİ KÜRE reveal ekranını açar (sürpriz).
 *  • Rozet varsa: karakteri + kategorisini gösterir.
 * Reveal ekranı iki varyantlı (orb/mascot); kullanıcı hangisini beğendiğine karar versin
 * diye küçük bir varyant seçici sunulur.
 */
export function CharacterCard() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealOpen, setRevealOpen] = useState(false);
  const [variant, setVariant] = useState<'orb' | 'mascot'>('orb');

  const load = () => {
    fetch('/api/customer/character', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: State | null) => data && setState(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading || !state) return null;

  const c = state.character;
  const cat = c?.category ?? null;
  const pct = Math.round((state.progress ?? 0) * 100);

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-fuchsia-500/10 p-5 shadow-sm">
        {/* Üst etiket */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-4 w-4" />
            Karakterin
          </div>
          {/* Varyant seçici (sadece keşif aşamasında görünür) — kullanıcı beğendiğini seçer */}
          {!c && state.canDiscover && (
            <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-card/60 p-0.5 text-[11px]">
              <button
                onClick={() => setVariant('orb')}
                className={`rounded-full px-2 py-0.5 font-medium transition-colors ${variant === 'orb' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                🔮 Küre
              </button>
              <button
                onClick={() => setVariant('mascot')}
                className={`rounded-full px-2 py-0.5 font-medium transition-colors ${variant === 'mascot' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                🧙 Maskot
              </button>
            </div>
          )}
        </div>

        {c ? (
          /* ── Kazanılmış karakter ── */
          <div className="mt-3 flex items-center gap-4">
            {c.icon ? (
              <Image src={c.icon} alt={c.name} width={64} height={64} className="h-16 w-16 shrink-0 object-contain" />
            ) : (
              <div
                className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-3xl"
                style={{ background: cat ? `${cat.accent}22` : 'hsl(var(--primary)/0.15)' }}
              >
                {cat?.emoji ?? '🎭'}
              </div>
            )}
            <div className="min-w-0">
              {cat && (
                <span
                  className="mb-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: `${cat.accent}1f`, color: cat.accent }}
                >
                  {cat.emoji} {cat.name}
                </span>
              )}
              <p className="text-xl font-bold leading-tight">{c.name}</p>
              <p className="text-sm text-muted-foreground">{c.description}</p>
            </div>
          </div>
        ) : state.canDiscover ? (
          /* ── Eşik doldu: keşfe hazır ── */
          <div className="mt-3 flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Yorumların analiz edilmeye hazır! Sihirli {variant === 'orb' ? 'küre' : 'maskot'} sana hangi karakterin
              uyduğunu açığa çıkaracak. <span className="text-foreground/70">Ne çıkacağını kimse bilmiyor…</span>
            </p>
            <Button onClick={() => setRevealOpen(true)} className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700">
              <Wand2 className="mr-2 h-4 w-4" />
              Karakterimi Keşfet
            </Button>
          </div>
        ) : (
          /* ── Eşik dolmadı: ilerleme BARI ── */
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{state.remaining}</span> yorum daha yaz, karakterin
              belirlensin! Her yorum barı doldurur.
            </p>
            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-primary transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-muted-foreground/70">
              {state.feedbackCount}/{state.threshold} yorum
            </p>
          </div>
        )}
      </div>

      {/* Sihirli reveal ekranı — açılınca POST atıp sürpriz açar */}
      <CharacterReveal
        open={revealOpen}
        onClose={() => setRevealOpen(false)}
        variant={variant}
        fetchOnOpen
        onReveal={(revealed: NonNullable<RevealCharacter>) => {
          // Kart durumunu tazele (yeni karakter + kategori görünsün).
          setState((prev) => (prev ? { ...prev, character: revealed as Character } : prev));
          load();
        }}
      />
    </>
  );
}

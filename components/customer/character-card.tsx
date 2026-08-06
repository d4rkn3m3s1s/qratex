'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CharacterReveal, type RevealCharacter } from '@/components/customer/character-reveal';
import { MysteryBar } from '@/components/customer/mystery-bar';

type Category = { key: string; name: string; emoji: string; accent: string; description: string };
type Character = { badgeId: string; name: string; icon?: string; description?: string; earnedAt?: string; category?: Category | null };
type Bar = { current: number; threshold: number; progress: number; remaining: number; ready: boolean };
type State = {
  character: Character | null;
  collection: Character[];
  bar: Bar;
};

/**
 * "Karakterin" kartı — kategori-bazlı GİZLİ ilerleme sistemi.
 *  • Bar dolar ama kullanıcı HANGİ kategoriyi doldurduğunu BİLMEZ (gizemli).
 *  • Bar dolunca (ready) → "Karakterini Aç" → sihirli küre/maskot reveal (sürpriz).
 *  • Sadece KAZANILAN rozetler gösterilir; kilitli/diğer karakterler görünmez.
 * Reveal iki varyantlı (orb/mascot); kullanıcı beğendiğini seçebilir.
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

  const bar = state.bar;
  const collection = state.collection ?? [];
  const ready = bar?.ready;

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-fuchsia-500/10 p-5 shadow-sm">
        {/* Üst etiket + varyant seçici (reveal'e hazırken) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-4 w-4" />
            Karakter Koleksiyonun
          </div>
          {ready && (
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

        {/* ── GİZLİ İLERLEME BARI / REVEAL TETİK ── */}
        {ready ? (
          <div className="mt-3 flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              ✨ Bir karakter senin için hazırlandı! Sihirli {variant === 'orb' ? 'küre' : 'maskot'} onu açığa
              çıkarmayı bekliyor. <span className="text-foreground/70">Ne çıkacağını kimse bilmiyor…</span>
            </p>
            <Button
              onClick={() => setRevealOpen(true)}
              className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 motion-safe:animate-[pulse_2.2s_ease-in-out_infinite]"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              Karakterini Aç
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground">
              Yorumların gizemli bir koleksiyonu besliyor… <span className="font-semibold text-foreground">{bar?.remaining ?? '?'}</span> yorum
              daha, yeni bir karakter açığa çıkabilir. <span className="text-foreground/60">Hangi karakter? Sürpriz.</span>
            </p>
            {/* Gizemli merak-bar: akışkan renk + rozet yuvaları + kader küresi şarjı */}
            <div className="mt-3">
              <MysteryBar
                progress={bar?.progress ?? 0}
                current={bar?.current ?? 0}
                threshold={bar?.threshold ?? 6}
                ready={false}
              />
            </div>
          </div>
        )}

        {/* ── KAZANILAN KOLEKSİYON (sadece kazanılanlar; kilitliler gizli) ── */}
        {collection.length > 0 && (
          <div className="mt-4 border-t border-border/50 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Kazandığın karakterler ({collection.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {collection.map((c) => (
                <div
                  key={c.badgeId}
                  className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/50 px-2.5 py-1.5"
                  title={c.description}
                >
                  {c.icon ? (
                    <Image src={c.icon} alt={c.name} width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
                  ) : (
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base"
                      style={{ background: c.category ? `${c.category.accent}22` : 'hsl(var(--primary)/0.15)' }}
                    >
                      {c.category?.emoji ?? '🎭'}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight">{c.name}</p>
                    {c.category && (
                      <span className="text-[10px] font-medium" style={{ color: c.category.accent }}>
                        {c.category.emoji} {c.category.name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
          // Yeni karakter koleksiyona eklendi; kartı ve barı tazele.
          void revealed;
          load();
        }}
      />
    </>
  );
}

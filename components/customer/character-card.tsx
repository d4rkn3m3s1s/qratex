'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';

type Character = { badgeId: string; name: string; icon?: string; description?: string; why?: string };
type State = { character: Character | null; canDiscover: boolean; feedbackCount: number; threshold: number };

/**
 * "Karakterin" kartı — AI'ın yorumlara göre atadığı dizi/film karakter rozetini gösterir.
 * Rozet yoksa ve eşik dolduysa "Karakterimi Keşfet" butonu sunar (kullanıcı tetikler).
 */
export function CharacterCard() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);

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

  const discover = async () => {
    setDiscovering(true);
    try {
      const res = await fetch('/api/customer/character', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Analiz başarısız');
      toast.success(`Karakterin belirlendi: ${data.character.name}! 🎭`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setDiscovering(false);
    }
  };

  if (loading || !state) return null;

  const c = state.character;

  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-fuchsia-500/10 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
        <Sparkles className="h-4 w-4" />
        Karakterin
      </div>

      {c ? (
        <div className="mt-3 flex items-center gap-4">
          {c.icon ? (
            <Image src={c.icon} alt={c.name} width={64} height={64} className="h-16 w-16 shrink-0 object-contain" />
          ) : (
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/15 text-3xl">🎭</div>
          )}
          <div className="min-w-0">
            <p className="text-xl font-bold">{c.name}</p>
            <p className="text-sm text-muted-foreground">{c.description}</p>
          </div>
        </div>
      ) : state.canDiscover ? (
        <div className="mt-3 flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Yorumların analiz edilmeye hazır! Sana hangi dizi/film karakterinin uyduğunu keşfet.
          </p>
          <Button onClick={discover} disabled={discovering}>
            <Wand2 className="mr-2 h-4 w-4" />
            {discovering ? 'Analiz ediliyor…' : 'Karakterimi Keşfet'}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {state.threshold - state.feedbackCount} yorum daha yaz, karakterin belirlensin!
          <span className="mt-1 block text-xs text-muted-foreground/70">
            ({state.feedbackCount}/{state.threshold} yorum)
          </span>
        </p>
      )}
    </div>
  );
}

'use client';

import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCard } from '@/components/ds/page';
import { QueryState } from '@/components/states';
import { DEFAULT_WEEKLY } from '@/lib/admin-discovery/contract';
import { runPreview } from '../api';
import { fmtDecimal } from '../format';
import { useDiscoveryDraft } from './discovery-center';

const FIELDS = [
  { key: 'ambienceLabel', winnerKey: 'ambience', title: 'Ambiyans', hint: 'Son 7 günün değerlendirmelerinde ambiyans puanı en yüksek işletme.' },
  { key: 'foodLabel', winnerKey: 'food', title: 'Lezzet', hint: 'Son 7 günün değerlendirmelerinde lezzet puanı en yüksek işletme.' },
  { key: 'serviceLabel', winnerKey: 'service', title: 'Hizmet', hint: 'Son 7 günün değerlendirmelerinde hizmet puanı en yüksek işletme.' },
] as const;

/**
 * Haftanın enleri — üç başlık (2–40 karakter; boş bırakılırsa varsayılan) + bu haftanın gerçek
 * kazananları (müşteri ucuyla aynı hesap, canlı ayarla).
 */
export function WeeklyTab() {
  const id = useId();
  const { draft, update } = useDiscoveryDraft();
  const winners = useQuery({ queryKey: ['admin-discovery', 'weekly-winners'], queryFn: () => runPreview({ mode: 'live' }), staleTime: 60_000 });

  return (
    <div className="space-y-4 pt-4">
      <p className="max-w-2xl text-sm text-fg-muted">
        Başlıklar müşteri keşif yanıtındaki “Haftanın enleri” kartlarında görünür. Kazanan, son 7 günün yorum boyutlarından (ambiyans, lezzet, hizmet) ortalaması en yüksek işletmedir; buradan
        değiştirilemez.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {FIELDS.map((f) => {
          const value = draft.weeklyHighlights[f.key];
          const tooShort = value.trim().length > 0 && value.trim().length < 2;
          const winner = winners.data?.weeklyBest.find((w) => w.key === f.winnerKey)?.winner ?? null;
          return (
            <SectionCard key={f.key} title={f.title} icon={<Trophy />}>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-${f.key}`}>Kart başlığı</Label>
                  <Input
                    id={`${id}-${f.key}`}
                    className="min-h-11"
                    maxLength={40}
                    value={value}
                    placeholder={DEFAULT_WEEKLY[f.key]}
                    aria-invalid={tooShort || undefined}
                    aria-describedby={`${id}-${f.key}-hint`}
                    onChange={(e) => update((d) => ({ ...d, weeklyHighlights: { ...d.weeklyHighlights, [f.key]: e.target.value } }))}
                  />
                  <p id={`${id}-${f.key}-hint`} className={tooShort ? 'text-xs text-danger' : 'text-xs text-fg-muted'}>
                    {tooShort ? 'En az 2 karakter; boş bırakılırsa varsayılan başlık kullanılır.' : `${value.length}/40 · ${f.hint}`}
                  </p>
                </div>
                <QueryState query={winners} skeleton="list" error={{ title: 'Kazanan hesaplanamadı' }}>
                  {() =>
                    winner ? (
                      <p className="text-sm">
                        Bu hafta: <span className="font-medium text-fg">{winner.businessName}</span> <span className="tabular-nums text-fg-muted">({fmtDecimal(winner.score)} / 5)</span>
                      </p>
                    ) : (
                      <p className="text-sm text-fg-muted">Son 7 günde bu boyutta değerlendirme yok; kart müşteride boş görünür.</p>
                    )
                  }
                </QueryState>
              </div>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}

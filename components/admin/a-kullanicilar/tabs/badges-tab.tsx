'use client';

import { useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, Gift, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { ConfirmAction, InlineError, QueryState } from '@/components/states';
import type { EarnedBadge, User360 } from '@/lib/admin-users/contract';
import { errorText, fetchBadgeCatalog, fetchBadges, fetchRewardCatalog, fetchRewards, grantBadge, grantReward, revokeBadge, usersKeys } from '../api';
import { fmtDate, fmtNumber, rarityLabel } from '../format';
import { FormField, Pager, ReasonDialog } from '../parts';

const RARITY_TONE: Record<string, 'neutral' | 'info' | 'brand' | 'warning'> = { common: 'neutral', rare: 'info', epic: 'brand', legendary: 'warning' };

export function BadgesTab({ user: u, onChanged }: { user: User360; onChanged: () => void }) {
  const locked = u.identity.status === 'anonymized';
  return (
    <div className="space-y-6">
      <EarnedBadges userId={u.identity.id} locked={locked} onChanged={onChanged} />
      {/* Kendine ödül hediyesi sunucuda reddedilir (puan düzeltmesindeki kural); düğme de gösterilmez. */}
      <Rewards userId={u.identity.id} locked={locked || u.isSelf} onChanged={onChanged} />
    </div>
  );
}

function EarnedBadges({ userId, locked, onChanged }: { userId: string; locked: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: usersKeys.sub(userId, 'badges'), queryFn: () => fetchBadges(userId), staleTime: 15_000 });
  const [granting, setGranting] = useState(false);
  const [revoke, setRevoke] = useState<EarnedBadge | null>(null);
  const refresh = async () => {
    onChanged();
    await qc.invalidateQueries({ queryKey: usersKeys.sub(userId, 'badges') });
  };
  const owned = useMemo(() => new Set((q.data?.items ?? []).map((b) => b.badgeId)), [q.data]);

  return (
    <SectionCard
      title="Rozetler"
      icon={<Award />}
      description="Karakter ve gizli rozetler dahil. Yönetici hediyesi puan ödülü basmaz."
      actions={
        !locked ? (
          <Button size="sm" className="min-h-11 sm:min-h-9" onClick={() => setGranting((v) => !v)} aria-expanded={granting}>
            <Plus className="h-4 w-4" aria-hidden />
            Rozet ver
          </Button>
        ) : undefined
      }
    >
      {granting ? <GrantBadgePicker userId={userId} owned={owned} onDone={async () => { setGranting(false); await refresh(); }} /> : null}
      <QueryState query={q} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: 'Henüz rozet yok', compact: true }}>
        {(d) => (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Kazanılan rozetler">
            {d.items.map((b) => (
              <li key={b.badgeId} className="flex items-center gap-3 rounded-lg border border-subtle bg-surface-1 p-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-xl" aria-hidden>
                  {b.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-fg">{b.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                    <StatusBadge size="sm" icon={null} tone={RARITY_TONE[b.rarity] ?? 'neutral'} label={rarityLabel(b.rarity)} />
                    <span>{fmtDate(b.earnedAt)}</span>
                    {b.category === 'character' ? <span>Karakter</span> : null}
                    {b.featured ? <span>Vitrinde</span> : null}
                    {b.hidden ? <span>Gizli</span> : null}
                    {b.archived ? <span>Arşivli</span> : null}
                  </div>
                </div>
                {!locked ? (
                  <IconButton aria-label={`${b.name} rozetini geri al`} variant="ghost" icon={<X />} onClick={() => setRevoke(b)} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <ReasonDialog
        open={revoke != null}
        onOpenChange={(o) => !o && setRevoke(null)}
        title={`“${revoke?.name ?? ''}” rozeti geri alınsın mı?`}
        description="Rozet hesaptan kaldırılır ve kullanıcı bilgilendirilir. Rozetle kazanılmış puan geri alınmaz; gerekiyorsa Ekonomi sekmesinden düzeltin."
        confirmLabel="Geri al"
        tone="danger"
        onConfirm={async (reason) => {
          await revokeBadge(userId, revoke!.badgeId, reason);
          toast.success('Rozet geri alındı.');
          await refresh();
        }}
      />
    </SectionCard>
  );
}

function GrantBadgePicker({ userId, owned, onDone }: { userId: string; owned: Set<string>; onDone: () => Promise<void> }) {
  const id = useId();
  const catalog = useQuery({ queryKey: usersKeys.catalog('badges'), queryFn: fetchBadgeCatalog, staleTime: 5 * 60_000 });
  const [term, setTerm] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = useMemo(() => {
    const t = term.trim().toLocaleLowerCase('tr-TR');
    return (catalog.data?.items ?? []).filter((b) => !owned.has(b.id) && (!t || b.name.toLocaleLowerCase('tr-TR').includes(t) || b.category.includes(t))).slice(0, 40);
  }, [catalog.data, owned, term]);
  return (
    <div className="mb-4 space-y-3 rounded-lg border border-subtle bg-surface-2 p-3">
      <FormField htmlFor={`${id}-q`} label="Rozet ara" hint="Kullanıcının sahip olmadığı rozetler; en fazla 40 sonuç.">
        <Input id={`${id}-q`} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Rozet adı ya da kategori" />
      </FormField>
      {error ? <InlineError>{error}</InlineError> : null}
      <QueryState query={catalog} skeleton="list" isEmpty={() => items.length === 0} empty={{ title: 'Eşleşen rozet yok', compact: true }}>
        {() => (
          <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="Verilebilir rozetler">
            {items.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={busyId != null}
                  aria-busy={busyId === b.id}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
                  onClick={async () => {
                    setBusyId(b.id);
                    setError(null);
                    try {
                      const r = await grantBadge(userId, b.id);
                      toast.success(`“${r.name}” rozeti verildi.`);
                      await onDone();
                    } catch (err) {
                      setError(errorText(err));
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  <span aria-hidden className="text-lg">
                    {b.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{b.name}</span>
                  <span className="text-xs text-fg-muted">
                    {rarityLabel(b.rarity)}
                    {b.hidden ? ' · gizli' : ''}
                    {!b.isActive ? ' · pasif' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

function Rewards({ userId, locked, onChanged }: { userId: string; locked: boolean; onChanged: () => void }) {
  const id = useId();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: usersKeys.sub(userId, 'rewards', page), queryFn: () => fetchRewards(userId, page), staleTime: 15_000 });
  const [pickerOpen, setPickerOpen] = useState(false);
  const catalog = useQuery({ queryKey: usersKeys.catalog('rewards'), queryFn: fetchRewardCatalog, enabled: pickerOpen, staleTime: 60_000 });
  const [rewardId, setRewardId] = useState('');
  const selected = catalog.data?.items.find((r) => r.id === rewardId);

  return (
    <SectionCard
      title="Ödüller"
      icon={<Gift />}
      description="Hediye ödül stoktan düşer; pasif, arşivli ya da tükenmiş ödül verilemez."
      actions={
        !locked ? (
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen}>
            <Plus className="h-4 w-4" aria-hidden />
            Ödül ver
          </Button>
        ) : undefined
      }
    >
      {pickerOpen ? (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-subtle bg-surface-2 p-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FormField htmlFor={`${id}-r`} label="Ödül">
              <Select value={rewardId} onValueChange={setRewardId} disabled={catalog.isLoading}>
                <SelectTrigger id={`${id}-r`} className="min-h-11">
                  <SelectValue placeholder={catalog.isLoading ? 'Yükleniyor…' : catalog.isError ? 'Katalog yüklenemedi' : catalog.data?.items.length ? 'Seçin' : 'Verilebilir ödül yok'} />
                </SelectTrigger>
                <SelectContent>
                  {(catalog.data?.items ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.icon} {r.name} · {r.stock < 0 ? 'sınırsız' : `${fmtNumber(r.stock)} stok`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <ConfirmAction
            tone="brand"
            trigger={
              <Button className="min-h-11" disabled={!selected}>
                Ver
              </Button>
            }
            title={`“${selected?.name ?? ''}” hediye edilsin mi?`}
            description="Kullanıcının puanından düşmez. Ödül stoktan bir adet eksilir ve kullanıcı bilgilendirilir."
            impact={selected ? [{ label: 'Kalan stok', value: selected.stock < 0 ? 'Sınırsız' : `${fmtNumber(selected.stock)} → ${fmtNumber(selected.stock - 1)}` }] : undefined}
            confirmLabel="Hediye et"
            onConfirm={async () => {
              const r = await grantReward(userId, rewardId);
              toast.success(`“${r.rewardName}” verildi${r.hasCode ? '; kupon kodu kullanıcının cüzdanında.' : '.'}`);
              setRewardId('');
              setPickerOpen(false);
              onChanged();
              await qc.invalidateQueries({ queryKey: ['admin-users', 'detail', userId, 'rewards'] });
              await qc.invalidateQueries({ queryKey: usersKeys.catalog('rewards') });
            }}
          />
        </div>
      ) : null}
      <QueryState query={q} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: 'Henüz ödül yok', compact: true }}>
        {(d) => (
          <>
            <ul className="divide-y divide-subtle" aria-label="Kullanıcının ödülleri">
              {d.items.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <span aria-hidden className="text-lg">
                    {r.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{r.rewardName}</p>
                    <p className="text-xs text-fg-muted">
                      {fmtDate(r.redeemedAt)}
                      {r.codeTail ? ` · kod …${r.codeTail}` : ''}
                    </p>
                  </div>
                  <StatusBadge size="sm" tone={r.claimedAt ? 'success' : 'neutral'} label={r.claimedAt ? 'Kullanıldı' : 'Bekliyor'} />
                </li>
              ))}
            </ul>
            <Pager page={d.page} pageCount={d.pageCount} total={d.total} onPage={setPage} label="Ödüller" />
          </>
        )}
      </QueryState>
    </SectionCard>
  );
}

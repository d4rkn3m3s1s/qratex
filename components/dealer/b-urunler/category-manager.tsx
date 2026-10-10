'use client';

import { useId, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmAction } from '@/components/states';
import { IconButton, announce } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { CATEGORY_ICONS, CATEGORY_NAME_MAX } from '@/lib/dealer/catalog/schemas';
import type { CatalogCategoryDto } from '@/lib/dealer/catalog/types';
import { catalogApi, useInvalidateCatalog } from './api';

function errorText(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Simge seçimi: radyo grubu (← → ile gezilir, seçim yalnız renkle değil çerçeve + okunur adla). */
function IconPicker({ value, onChange, labelId }: { value: string; onChange: (v: string) => void; labelId: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-8 gap-1.5">
      {CATEGORY_ICONS.map((icon, i) => {
        const checked = value === icon;
        return (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`Simge ${i + 1}`}
            tabIndex={checked || (!CATEGORY_ICONS.includes(value as (typeof CATEGORY_ICONS)[number]) && i === 0) ? 0 : -1}
            onClick={() => onChange(icon)}
            onKeyDown={(e) => {
              const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
              if (!delta) return;
              e.preventDefault();
              const next = CATEGORY_ICONS[(i + delta + CATEGORY_ICONS.length) % CATEGORY_ICONS.length];
              onChange(next);
              const sib = (e.currentTarget.parentElement?.children[(i + delta + CATEGORY_ICONS.length) % CATEGORY_ICONS.length] as HTMLElement | undefined);
              sib?.focus();
            }}
            className={`flex h-11 items-center justify-center rounded-control border text-xl transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              checked ? 'border-brand bg-brand-subtle' : 'border-subtle hover:bg-surface-3'
            }`}
          >
            <span aria-hidden>{icon}</span>
          </button>
        );
      })}
    </div>
  );
}

function CategoryRow({
  c,
  index,
  count,
  others,
  onMove,
  busy,
}: {
  c: CatalogCategoryDto;
  index: number;
  count: number;
  others: CatalogCategoryDto[];
  onMove: (from: number, to: number) => void;
  busy: boolean;
}) {
  const invalidate = useInvalidateCatalog();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [icon, setIcon] = useState(c.icon);
  const [saving, setSaving] = useState(false);
  const [moveTo, setMoveTo] = useState<string>('');
  const labelId = useId();

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await catalogApi.updateCategory(c.id, { ...(name.trim() !== c.name ? { name: name.trim() } : {}), ...(icon !== c.icon ? { icon } : {}) });
      toast.success('Kategori güncellendi.');
      setEditing(false);
      invalidate();
    } catch (err) {
      toast.error(errorText(err, 'Kategori güncellenemedi.'));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <li className="rounded-control border border-strong bg-surface-1 p-3">
        <form onSubmit={save} className="space-y-3">
          <label className="qx-small block font-medium text-fg" htmlFor={`cat-name-${c.id}`}>
            Kategori adı
          </label>
          <Input id={`cat-name-${c.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={CATEGORY_NAME_MAX} required className="min-h-11" autoFocus />
          <p id={labelId} className="qx-small font-medium text-fg">
            Simge
          </p>
          <IconPicker value={icon} onChange={setIcon} labelId={labelId} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setEditing(false)}>
              <X className="mr-1.5 h-4 w-4" aria-hidden /> Vazgeç
            </Button>
            <Button type="submit" className="min-h-11" disabled={saving || !name.trim() || (name.trim() === c.name && icon === c.icon)}>
              <Check className="mr-1.5 h-4 w-4" aria-hidden /> Kaydet
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 rounded-control border border-subtle bg-surface-1 p-2 pl-3">
      <span className="text-xl" aria-hidden>
        {c.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="qx-small truncate font-medium text-fg">{c.name}</p>
        <p className="qx-caption text-fg-muted">{c.activeCount} aktif ürün</p>
      </div>
      {c.isGlobal ? (
        <StatusBadge label="Sistem" tone="info" size="sm" icon={null} />
      ) : (
        <div className="flex items-center">
          <IconButton aria-label={`${c.name} yukarı taşı`} icon={<ArrowUp />} size="sm" disabled={busy || index === 0} onClick={() => onMove(index, index - 1)} />
          <IconButton aria-label={`${c.name} aşağı taşı`} icon={<ArrowDown />} size="sm" disabled={busy || index === count - 1} onClick={() => onMove(index, index + 1)} />
          <IconButton aria-label={`${c.name} düzenle`} icon={<Pencil />} size="sm" onClick={() => setEditing(true)} />
          <ConfirmAction
            trigger={<IconButton aria-label={`${c.name} arşivle`} icon={<Archive />} size="sm" variant="danger" />}
            title={`“${c.name}” arşivlensin mi?`}
            tone="warning"
            irreversibleNote={false}
            description={
              c.activeCount > 0 ? (
                <div className="space-y-3">
                  <p>Bu kategoride {c.activeCount} aktif ürün var. Ürünler seçtiğiniz kategoriye taşınacak; tüketim geçmişi korunur.</p>
                  <Select value={moveTo} onValueChange={setMoveTo}>
                    <SelectTrigger className="min-h-11" aria-label="Ürünlerin taşınacağı kategori">
                      <SelectValue placeholder="Taşınacak kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.icon} {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                'Kategori listeden kalkar, Arşiv bölümünden geri yükleyebilirsiniz.'
              )
            }
            confirmLabel="Arşivle"
            onConfirm={async () => {
              if (c.activeCount > 0 && !moveTo) {
                toast.error('Önce ürünlerin taşınacağı kategoriyi seçin.');
                throw new Error('hedef yok');
              }
              try {
                const r = await catalogApi.archiveCategory(c.id, c.activeCount > 0 ? moveTo : null);
                toast.success(r.moved > 0 ? `Kategori arşivlendi, ${r.moved} ürün taşındı.` : 'Kategori arşivlendi.');
                invalidate();
              } catch (err) {
                toast.error(errorText(err, 'Kategori arşivlenemedi.'));
                throw err;
              }
            }}
          />
        </div>
      )}
    </li>
  );
}

/**
 * Kategori yönetimi (envanter #29, Bulgu 6): oluştur (aynı ad 409), yeniden adlandır, simge,
 * sırala (↑/↓ — klavye ve dokunmatikte çalışır; Kart Tara da bu sırayı kullanır), arşivle
 * (ürünleri taşıyarak), geri yükle. Sistem kategorileri salt-okunur ve rozetli.
 */
export function CategoryManager({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CatalogCategoryDto[];
}) {
  const invalidate = useInvalidateCatalog();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(CATEGORY_ICONS[0]);
  const [creating, setCreating] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const iconLabel = useId();

  const own = useMemo(() => {
    const list = categories.filter((c) => c.isActive && !c.isGlobal);
    if (!localOrder) return list;
    const byId = new Map(list.map((c) => [c.id, c]));
    const ordered = localOrder.map((id) => byId.get(id)).filter((c): c is CatalogCategoryDto => !!c);
    return ordered.length === list.length ? ordered : list;
  }, [categories, localOrder]);
  const system = categories.filter((c) => c.isActive && c.isGlobal);
  const archived = categories.filter((c) => !c.isActive);
  const activeAll = categories.filter((c) => c.isActive);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await catalogApi.createCategory({ name: name.trim(), icon });
      toast.success('Kategori eklendi.');
      setName('');
      invalidate();
    } catch (err) {
      toast.error(errorText(err, 'Kategori eklenemedi.'));
    } finally {
      setCreating(false);
    }
  };

  const move = async (from: number, to: number) => {
    const ids = own.map((c) => c.id);
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    setLocalOrder(ids);
    setReordering(true);
    try {
      await catalogApi.reorderCategories(ids);
      announce(`${own[from].name} ${to + 1}. sıraya taşındı.`);
      invalidate();
    } catch (err) {
      setLocalOrder(null);
      toast.error(errorText(err, 'Sıralama kaydedilemedi.'));
    } finally {
      setReordering(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-subtle px-5 pb-4 pr-16 pt-5 text-left">
          <SheetTitle className="qx-h2 text-fg">Kategoriler</SheetTitle>
          <SheetDescription className="qx-small text-fg-muted">
            Sıra, Kart Tara ekranındaki kategori sırasını da belirler.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <form onSubmit={create} className="space-y-3 rounded-card border border-subtle bg-surface-2 p-4">
            <label htmlFor="new-cat-name" className="qx-small block font-medium text-fg">
              Yeni kategori adı
            </label>
            <Input
              id="new-cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={CATEGORY_NAME_MAX}
              placeholder="ör. Tatlılar"
              className="min-h-11"
              autoComplete="off"
            />
            <p id={iconLabel} className="qx-small font-medium text-fg">
              Simge
            </p>
            <IconPicker value={icon} onChange={setIcon} labelId={iconLabel} />
            <div className="flex justify-end">
              <Button type="submit" className="min-h-11" disabled={creating || !name.trim()}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Kategori ekle
              </Button>
            </div>
          </form>

          <section aria-labelledby="own-cats">
            <h3 id="own-cats" className="qx-overline mb-2 text-fg-muted">
              Kategorileriniz ({own.length})
            </h3>
            {own.length === 0 ? (
              <p className="qx-small text-fg-muted">Henüz kendi kategoriniz yok.</p>
            ) : (
              <ul className="space-y-2">
                {own.map((c, i) => (
                  <CategoryRow
                    key={c.id}
                    c={c}
                    index={i}
                    count={own.length}
                    others={activeAll.filter((o) => o.id !== c.id)}
                    onMove={(f, t) => void move(f, t)}
                    busy={reordering}
                  />
                ))}
              </ul>
            )}
          </section>

          {system.length > 0 ? (
            <section aria-labelledby="sys-cats">
              <h3 id="sys-cats" className="qx-overline mb-1 text-fg-muted">
                Sistem kategorileri ({system.length})
              </h3>
              <p className="qx-caption mb-2 text-fg-muted">Platformun hazır kategorileri; düzenlenemez, ürün ekleyebilirsiniz.</p>
              <ul className="space-y-2">
                {system.map((c, i) => (
                  <CategoryRow key={c.id} c={c} index={i} count={system.length} others={[]} onMove={() => undefined} busy />
                ))}
              </ul>
            </section>
          ) : null}

          {archived.length > 0 ? (
            <section aria-labelledby="arch-cats">
              <h3 id="arch-cats" className="qx-overline mb-2 text-fg-muted">
                Arşiv ({archived.length})
              </h3>
              <ul className="space-y-2">
                {archived.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-control border border-dashed border-subtle p-2 pl-3">
                    <span className="text-xl grayscale" aria-hidden>
                      {c.icon}
                    </span>
                    <p className="qx-small min-w-0 flex-1 truncate text-fg-muted">{c.name}</p>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={async () => {
                        try {
                          await catalogApi.restoreCategory(c.id);
                          toast.success('Kategori geri yüklendi.');
                          invalidate();
                        } catch (err) {
                          toast.error(errorText(err, 'Kategori geri yüklenemedi.'));
                        }
                      }}
                    >
                      <ArchiveRestore className="mr-1.5 h-4 w-4" aria-hidden /> Geri yükle
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

'use client';

/**
 * Akran grubu kartı (denetim #39, #10): bayi sektörünü kontrollü sözlükten kendisi seçer
 * (`PATCH /api/dealer/analytics/benchmark/segment`); şehir adresten türetilir. Ham slug ya da
 * akran hacmi gösterilmez; yalnız katkı veren işletme sayısı ve k-anonimlik durumu.
 */
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { PLACE_CATEGORIES, categoryLabel, type PlaceCategory } from '@/lib/places/categories';
import { cityLabel } from '@/lib/dealer-benchmark/city';
import type { BenchmarkData } from '@/lib/dealer-benchmark/types';
import { useBkCopy } from './copy';
import { useSaveCategory } from './use-bk';

export function SegmentCard({ data }: { data: BenchmarkData }) {
  const { copy, locale } = useBkCopy();
  const c = copy.bench.segment;
  const id = useId();
  const current = data.profile.categorySource === 'profile' ? data.profile.category : null;
  const [value, setValue] = useState<string>(current ?? '');
  useEffect(() => setValue(current ?? ''), [current]);
  const save = useSaveCategory();
  const dirty = (value || null) !== current;

  const submit = () => {
    save.mutate((value || null) as PlaceCategory | null, {
      onSuccess: () => toast.success(c.saved),
      onError: (e) => toast.error(e instanceof Error && e.message ? e.message : c.saveFailed),
    });
  };

  return (
    <SectionCard id="akran-grubu" title={c.title} description={c.desc} headingLevel="h2" className="scroll-mt-24">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor={`${id}-cat`} className="qx-small font-medium text-fg">
            {c.category}
          </label>
          <p className="qx-caption text-fg-muted">
            {data.profile.category ? (
              <>
                {categoryLabel(data.profile.category, locale)}
                {data.profile.categorySource && ` · ${c.categorySource[data.profile.categorySource]}`}
              </>
            ) : (
              c.categoryNone
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              id={`${id}-cat`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-11 min-w-[12rem] flex-1 rounded-control border border-subtle bg-surface-1 px-3 qx-small text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{c.choose}</option>
              {PLACE_CATEGORIES.map((cat) => (
                <option key={cat.slug} value={cat.slug}>
                  {categoryLabel(cat.slug, locale)}
                </option>
              ))}
            </select>
            <Button type="button" className="h-11" onClick={submit} disabled={!dirty || save.isPending} aria-busy={save.isPending || undefined}>
              {c.save}
            </Button>
          </div>
          <p className="qx-caption text-fg-subtle">{c.note}</p>
        </div>

        <div className="space-y-2">
          <p className="qx-small font-medium text-fg">{c.city}</p>
          <p className="qx-caption text-fg-muted">{data.profile.city ? `${cityLabel(data.profile.city)} · ${c.citySource}` : c.cityNone}</p>
          <Button asChild variant="outline" className="h-11">
            <Link href="/dealer/settings">{c.editAddress}</Link>
          </Button>
        </div>
      </div>

      <ul className="mt-6 grid gap-2 sm:grid-cols-3" aria-label={copy.bench.groupLabel}>
        {data.segments.map((s) => (
          <li key={s.group} className="rounded-control border border-subtle bg-surface-muted px-3 py-2">
            <p className="qx-small font-medium text-fg">{copy.bench.groups[s.group]}</p>
            <p className={s.reason === 'ok' ? 'qx-caption text-fg-muted' : 'qx-caption text-warning'}>
              {s.reason === 'ok'
                ? copy.bench.groupReason.ok(s.contributors)
                : s.reason === 'too_few'
                  ? copy.bench.groupReason.too_few(s.contributors)
                  : copy.bench.groupReason.not_set[s.group]}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

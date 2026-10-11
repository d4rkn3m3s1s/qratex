'use client';

/**
 * Kişisel veri envanteri — `PII_REGISTRY`'nin kendisi (elle yazılmış ikinci liste yok).
 * Dışa aktarma, silme, saklama ve yasal metinler aynı kayıttan çalışır; burada görünen satır
 * birebir uygulanan kuraldır. Şemaya yeni kullanıcı ilişkisi eklenip buraya yazılmazsa
 * `__tests__/lib/pii-registry.test.ts` kırmızıya düşer (sürüklenme koruması).
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ds/page';
import { EmptyState, TONE_CHIP } from '@/components/states';
import { cn } from '@/lib/utils';
import { PII_CATEGORY_LABELS, PII_REGISTRY, registryKey, type PiiCategory, type PiiSubject } from '@/lib/pii-registry';
import { ERASE_LABELS, LEGAL_CATEGORY_ORDER, retentionText } from '@/lib/legal/inventory-view';

const SUBJECT_LABELS: Record<PiiSubject, string> = {
  self: 'Kişinin kendi verisi',
  business: 'İşletme kaydı',
  actor: 'Kişi yalnız aktör',
};

type SubjectFilter = PiiSubject | 'all';

export function InventoryTab() {
  const [subject, setSubject] = useState<SubjectFilter>('self');
  const [category, setCategory] = useState<PiiCategory | ''>('');
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const c = { self: 0, business: 0, actor: 0, exported: 0, erased: 0, auto: 0 };
    for (const e of PII_REGISTRY) {
      c[e.subject] += 1;
      if (e.subject === 'self' && e.export) c.exported += 1;
      if (e.subject === 'self' && (e.erase === 'delete' || e.erase === 'redact')) c.erased += 1;
      if (e.retentionField) c.auto += 1;
    }
    return c;
  }, []);

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return PII_REGISTRY.filter(
      (e) =>
        (subject === 'all' || e.subject === subject) &&
        (!category || e.categories.includes(category)) &&
        (!needle ||
          e.model.toLocaleLowerCase('tr-TR').includes(needle) ||
          e.piiFields.some((f) => f.toLocaleLowerCase('tr-TR').includes(needle)))
    );
  }, [subject, category, q]);

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Kişisel veri ilişkisi', value: counts.self },
          { label: 'Dışa aktarımda verilen', value: counts.exported },
          { label: 'Silmede temizlenen', value: counts.erased },
          { label: 'Süresi otomatik uygulanan', value: counts.auto },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface-1 p-4">
            <dt className="text-xs text-fg-muted">{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-fg">{s.value}</dd>
          </div>
        ))}
      </dl>

      <SectionCard
        title="Kişisel veri envanteri"
        description="Bu tablo uygulanan kuralın kendisidir: dışa aktarma, silme, saklama ve aydınlatma metni aynı kayıttan üretilir. Yeni bir kullanıcı ilişkisi envantere yazılmadan yayına çıkamaz (otomatik test)."
        density="flush"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
              <Input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Model ya da alan ara"
                aria-label="Envanterde model ya da alan ara"
                className="h-11 pl-8 sm:h-9 sm:w-52"
              />
            </div>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectFilter)}
              aria-label="Veri sahibiyle ilişki"
              className="h-11 rounded-md border border-border bg-background px-2 text-sm text-fg sm:h-9"
            >
              <option value="self">{SUBJECT_LABELS.self} ({counts.self})</option>
              <option value="business">{SUBJECT_LABELS.business} ({counts.business})</option>
              <option value="actor">{SUBJECT_LABELS.actor} ({counts.actor})</option>
              <option value="all">Tümü ({PII_REGISTRY.length})</option>
            </select>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PiiCategory | '')}
              aria-label="Veri kategorisi"
              className="h-11 rounded-md border border-border bg-background px-2 text-sm text-fg sm:h-9"
            >
              <option value="">Tüm kategoriler</option>
              {LEGAL_CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {PII_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <p className="px-4 pb-2 text-xs text-fg-muted" aria-live="polite">
          {rows.length} kayıt gösteriliyor
        </p>
        {rows.length === 0 ? (
          <EmptyState compact title="Bu filtrede kayıt yok" description="Filtreleri değiştirin ya da aramayı temizleyin." />
        ) : (
          <>
            {/* Masaüstü: tablo */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Kişisel veri envanteri</caption>
                <thead className="border-y border-border bg-surface-muted/50 text-left text-xs text-fg-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">Kayıt</th>
                    <th scope="col" className="px-4 py-2 font-medium">Kategori</th>
                    <th scope="col" className="px-4 py-2 font-medium">Kişisel alanlar</th>
                    <th scope="col" className="px-4 py-2 font-medium">Dışa aktarım</th>
                    <th scope="col" className="px-4 py-2 font-medium">Silme talebinde</th>
                    <th scope="col" className="px-4 py-2 font-medium">Saklama</th>
                    <th scope="col" className="px-4 py-2 font-medium">Hukuki sebep</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((e) => (
                    <tr key={registryKey(e)} className="align-top">
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <code className="font-mono text-xs text-fg">{e.model}</code>
                        <span className="block font-mono text-[11px] text-fg-subtle">.{e.relation}</span>
                      </th>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {e.categories.map((c) => (
                            <span key={c} className={cn('rounded-full px-2 py-0.5 text-xs', TONE_CHIP.neutral)}>
                              {PII_CATEGORY_LABELS[c]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="max-w-[16rem] px-4 py-3 text-xs text-fg-muted">
                        {e.piiFields.length ? e.piiFields.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">{e.export ? <span className="text-fg">{e.export.section}</span> : <span className="text-fg-muted">Verilmez</span>}</td>
                      <td className="px-4 py-3 text-xs text-fg">{ERASE_LABELS[e.erase]}</td>
                      <td className="px-4 py-3 text-xs text-fg">
                        {retentionText(e)}
                        {e.retentionField ? <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[11px]', TONE_CHIP.success)}>otomatik</span> : null}
                      </td>
                      <td className="max-w-[14rem] px-4 py-3 text-xs text-fg-muted">
                        {e.legalBasis}
                        {e.note ? <span className="mt-1 block text-fg-subtle">{e.note}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobil: kartlar */}
            <ul className="divide-y divide-border md:hidden">
              {rows.map((e) => (
                <li key={registryKey(e)} className="space-y-2 px-4 py-3">
                  <p className="font-mono text-xs text-fg">
                    {e.model}
                    <span className="text-fg-subtle">.{e.relation}</span>
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {e.categories.map((c) => (
                      <span key={c} className={cn('rounded-full px-2 py-0.5 text-xs', TONE_CHIP.neutral)}>
                        {PII_CATEGORY_LABELS[c]}
                      </span>
                    ))}
                  </div>
                  <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-fg-muted">Alanlar</dt>
                    <dd className="text-fg">{e.piiFields.length ? e.piiFields.join(', ') : '—'}</dd>
                    <dt className="text-fg-muted">Silmede</dt>
                    <dd className="text-fg">{ERASE_LABELS[e.erase]}</dd>
                    <dt className="text-fg-muted">Saklama</dt>
                    <dd className="text-fg">{retentionText(e)}</dd>
                    <dt className="text-fg-muted">Dayanak</dt>
                    <dd className="text-fg">{e.legalBasis}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>
    </div>
  );
}

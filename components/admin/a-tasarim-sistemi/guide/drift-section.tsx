'use client';

import { useState } from 'react';
import { SectionCard, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import type { DriftArea, DriftReport } from '@/lib/design-system/drift-scan';
import { useDesignSystemCopy } from '../copy';

const AREA_LABEL: Record<DriftArea, string> = {
  admin: 'Yönetim paneli',
  dealer: 'Bayi paneli',
  customer: 'Müşteri paneli',
  staff: 'Personel',
  public: 'Herkese açık sayfalar',
  components: 'Paylaşılan bileşenler',
};

const fmt = (n: number) => n.toLocaleString('tr-TR');
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Uyum raporu: koddan çıkarılan anlık görüntü (lib/data/design-drift.json). Tarih açıkça yazılır;
 * canlı değil, ölçüm anının fotoğrafıdır.
 */
export function DriftSection({ report }: { report: DriftReport | null }) {
  const dx = useDesignSystemCopy();
  const [showAll, setShowAll] = useState(false);
  if (!report || report.totals.files === 0) {
    return (
      <SectionCard title="Uyum raporu" description="Kural dışı renk ve küçük metin kullanımının koddan sayımı.">
        <EmptyState
          compact
          variant="first-use"
          title="Henüz ölçüm yok"
          description="Rapor, depo kökünde UPDATE_DESIGN_DRIFT=1 npx jest __tests__/admin/a-tasarim-sistemi/drift.test.ts komutuyla üretilir."
        />
      </SectionCard>
    );
  }
  const { totals, areas, top } = report;
  const rows = showAll ? top : top.slice(0, 10);

  return (
    <SectionCard
      title="Uyum raporu"
      description={`Ölçüm: ${formatDate(report.generatedAt)} · app/ ve components/ altındaki ${fmt(totals.files)} .tsx dosyası. Sezgisel sayımdır; meşru istisnalar dosyaya “design-drift-ignore” yorumu eklenerek dışarıda bırakılır.`}
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { k: 'Kurala uyan dosya', v: `%${pct(totals.clean, totals.files)}`, sub: `${fmt(totals.clean)} / ${fmt(totals.files)}` },
            { k: 'Sabit hex renk', v: fmt(totals.hex), sub: 'token yerine #rrggbb' },
            { k: 'Ham palet sınıfı', v: fmt(totals.palette), sub: 'ör. text-red-500' },
            { k: '12px altı metin', v: fmt(totals.tinyText), sub: 'text-[10px] vb.' },
          ].map((m) => (
            <div key={m.k} className="rounded-card border bg-surface-1 p-3">
              <dt className="qx-caption text-fg-muted">{m.k}</dt>
              <dd className="qx-h3 qx-num mt-1 text-fg">{m.v}</dd>
              <dd className="qx-caption text-fg-subtle">{m.sub}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-2">
          <h3 className="qx-overline text-fg-muted">{dx.areaCompliance}</h3>
          <ul className="space-y-2.5">
            {areas.map((a) => {
              const p = pct(a.clean, a.files);
              return (
                <li key={a.area} className="grid gap-1 sm:grid-cols-[12rem_1fr_auto] sm:items-center sm:gap-3">
                  <span className="qx-small font-medium text-fg">{AREA_LABEL[a.area]}</span>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={p}
                    aria-label={`${AREA_LABEL[a.area]} uyum yüzdesi`}
                  >
                    <div className="h-full rounded-full bg-brand" style={{ width: `${p}%` }} />
                  </div>
                  <span className="qx-caption qx-num text-fg-muted">
                    %{p} · {fmt(a.clean)}/{fmt(a.files)} dosya · {fmt(a.hex + a.palette + a.tinyText)} ihlal
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="qx-overline text-fg-muted">{dx.topViolations}</h3>
          {top.length === 0 ? (
            <p className="qx-small text-success">{dx.noViolations}</p>
          ) : (
            <div className="overflow-x-auto rounded-control border">
              <table className="w-full min-w-[36rem] text-left">
                <caption className="sr-only">{dx.perFileCaption}</caption>
                <thead className="bg-surface-muted">
                  <tr className="qx-caption text-fg-muted">
                    <th scope="col" className="px-3 py-2 font-medium">{dx.file}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Hex</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{dx.palette}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{dx.smallText}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{dx.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.file} className="border-t">
                      <th scope="row" className="qx-caption max-w-[28rem] truncate px-3 py-2 font-mono font-normal text-fg" title={r.file}>
                        {r.file}
                      </th>
                      <td className="qx-small qx-num px-3 py-2 text-right text-fg-muted">{r.hex}</td>
                      <td className="qx-small qx-num px-3 py-2 text-right text-fg-muted">{r.palette}</td>
                      <td className="qx-small qx-num px-3 py-2 text-right text-fg-muted">{r.tinyText}</td>
                      <td className="qx-small qx-num px-3 py-2 text-right font-semibold text-fg">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {top.length > 10 && (
            <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? 'İlk 10 dosyayı göster' : `Tümünü göster (${top.length})`}
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

'use client';

import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, MinusCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { CSV_MAX_BYTES, EXPORT_HEADER, IMPORT_MAX_ROWS, toCsv } from '@/lib/dealer/catalog/csv';
import type { ImportReportDto, ImportRowStatus } from '@/lib/dealer/catalog/types';
import { catalogApi, useInvalidateCatalog } from './api';
import { priceLabel } from './format';

const STATUS: Record<ImportRowStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  create: { label: 'Eklenecek', cls: 'text-success', Icon: CheckCircle2 },
  update: { label: 'Güncellenecek', cls: 'text-info', Icon: RefreshCw },
  skip: { label: 'Atlanacak (zaten var)', cls: 'text-fg-muted', Icon: MinusCircle },
  error: { label: 'Hatalı', cls: 'text-danger', Icon: AlertTriangle },
};

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * CSV içe aktarma (envanter #34): dosya → sunucu ÖNİZLEME (satır satır doğrulama, yazma yok)
 * → onay → aynı karar tek işlemde yazılır. Türkçe Excel (`;`, BOM, "1.234,50") desteklenir;
 * yinelenen ürün için atla/güncelle seçilir. Şablon ve dışa aktarma aynı sütunları kullanır.
 */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const invalidate = useInvalidateCatalog();
  const inputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'update'>('skip');
  const [report, setReport] = useState<ImportReportDto | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dupLabel = useId();

  const reset = () => {
    setCsv(null);
    setFileName('');
    setReport(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const preview = async (text: string, dup: 'skip' | 'update') => {
    setBusy('preview');
    setError(null);
    try {
      setReport(await catalogApi.importCsv(text, dup, false));
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : 'Dosya doğrulanamadı.');
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > CSV_MAX_BYTES) {
      setError('Dosya en fazla 512 KB olabilir.');
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    await preview(text, onDuplicate);
  };

  const commit = async () => {
    if (!csv) return;
    setBusy('commit');
    try {
      const r = await catalogApi.importCsv(csv, onDuplicate, true);
      const done = r.summary.create + r.summary.update;
      toast.success(`${done} ürün içe aktarıldı${r.summary.newCategories.length ? `, ${r.summary.newCategories.length} yeni kategori oluşturuldu` : ''}.`);
      invalidate();
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İçe aktarma tamamlanamadı.');
    } finally {
      setBusy(null);
    }
  };

  const writable = report ? report.summary.create + report.summary.update : 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-subtle px-5 pb-4 pr-16 pt-5 text-left">
          <SheetTitle className="qx-h2 text-fg">Ürünleri içe aktar</SheetTitle>
          <SheetDescription className="qx-small text-fg-muted">
            CSV dosyası (Excel’de “CSV UTF-8” olarak kaydedin). En fazla {IMPORT_MAX_ROWS} satır. Önce önizleme gösterilir, onaylamadan hiçbir şey kaydedilmez.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => downloadText('urun-sablonu.csv', toCsv([[...EXPORT_HEADER], ['Türk kahvesi', 'Kahveler', '85,00', 'Közde, lokumla']]))}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden /> Şablonu indir
            </Button>
            <Button type="button" className="min-h-11" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
              <FileUp className="mr-1.5 h-4 w-4" aria-hidden /> {fileName ? 'Başka dosya seç' : 'CSV dosyası seç'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              aria-label="CSV dosyası"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>
          <p className="qx-caption text-fg-muted">
            Sütunlar: <strong>Ürün adı</strong>, <strong>Kategori</strong> (zorunlu), Fiyat, Açıklama. Olmayan kategoriler oluşturulur. Fiyat “45”, “45,50”, “1.234,50 ₺” biçiminde olabilir.
          </p>

          <div>
            <p id={dupLabel} className="qx-small mb-2 font-medium text-fg">
              Aynı adla ürününüz varsa
            </p>
            <ChoiceChips<'skip' | 'update'>
              aria-labelledby={dupLabel}
              value={onDuplicate}
              onChange={(v) => {
                if (!v) return;
                setOnDuplicate(v);
                if (csv) void preview(csv, v);
              }}
              options={[
                { value: 'skip', label: 'Atla' },
                { value: 'update', label: 'Fiyat ve açıklamayı güncelle' },
              ]}
            />
          </div>

          {error ? <InlineError variant="banner">{error}</InlineError> : null}

          {busy === 'preview' ? (
            <p className="qx-small flex items-center gap-2 text-fg-muted" role="status">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Dosya doğrulanıyor…
            </p>
          ) : null}

          {report?.fileError ? <InlineError variant="banner">{report.fileError}</InlineError> : null}

          {report && !report.fileError ? (
            <section aria-labelledby="imp-sum" className="space-y-3">
              <h3 id="imp-sum" className="qx-h3 text-fg">
                Önizleme · {fileName}
              </h3>
              <ul className="qx-small flex flex-wrap gap-x-4 gap-y-1" aria-live="polite">
                {(Object.keys(STATUS) as ImportRowStatus[]).map((k) => {
                  const S = STATUS[k];
                  return (
                    <li key={k} className={`flex items-center gap-1 ${S.cls}`}>
                      <S.Icon className="h-4 w-4" aria-hidden /> {S.label}: <span className="qx-num font-semibold">{report.summary[k]}</span>
                    </li>
                  );
                })}
              </ul>
              {report.summary.newCategories.length > 0 ? (
                <p className="qx-caption text-fg-muted">Oluşturulacak kategoriler: {report.summary.newCategories.join(', ')}</p>
              ) : null}
              <div className="max-h-[45vh] overflow-auto rounded-control border border-subtle">
                <table className="qx-small w-full min-w-[36rem] text-left">
                  <caption className="sr-only">Satır satır içe aktarma önizlemesi</caption>
                  <thead className="sticky top-0 bg-surface-2">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium text-fg-muted">Satır</th>
                      <th scope="col" className="px-3 py-2 font-medium text-fg-muted">Ürün</th>
                      <th scope="col" className="px-3 py-2 font-medium text-fg-muted">Kategori</th>
                      <th scope="col" className="px-3 py-2 font-medium text-fg-muted">Fiyat</th>
                      <th scope="col" className="px-3 py-2 font-medium text-fg-muted">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => {
                      const S = STATUS[r.status];
                      return (
                        <tr key={r.line} className="border-t border-subtle align-top">
                          <td className="qx-num px-3 py-2 text-fg-muted">{r.line}</td>
                          <td className="px-3 py-2 text-fg">{r.name || '—'}</td>
                          <td className="px-3 py-2 text-fg">
                            {r.categoryName || '—'}
                            {r.newCategory ? <span className="qx-caption text-fg-muted"> (yeni)</span> : null}
                          </td>
                          <td className="qx-num px-3 py-2 text-fg">{r.status === 'error' && r.priceMinor === null ? '—' : priceLabel(r.priceMinor)}</td>
                          <td className={`px-3 py-2 ${S.cls}`}>
                            <span className="flex items-center gap-1">
                              <S.Icon className="h-4 w-4 shrink-0" aria-hidden /> {S.label}
                            </span>
                            {r.errors.length > 0 ? (
                              <ul className="qx-caption mt-1 list-disc pl-4 text-danger">
                                {r.errors.map((e) => (
                                  <li key={e}>{e}</li>
                                ))}
                              </ul>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-subtle px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button type="button" className="min-h-11" disabled={!report || !!report.fileError || writable === 0 || busy !== null} onClick={() => void commit()}>
            {busy === 'commit' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {writable > 0 ? `${writable} ürünü içe aktar` : 'İçe aktarılacak satır yok'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

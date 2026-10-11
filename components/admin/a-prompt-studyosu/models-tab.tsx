'use client';

import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Cpu, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { EmptyState, InlineError, QueryState } from '@/components/states';
import { MODEL_SLOTS, MODEL_SLOT_META, type ModelSlot, type ModelsState } from '@/lib/ai-studio/contract';
import { errorText, fetchModels, isConflict, saveModels, studioKeys } from './api';
import { fmtNumber, percent } from './format';
import { ReasonInput, reasonOk } from './parts';
import { usePromptStudioCopy } from './copy';

const DEFAULT = '__default__';
const SOURCE_LABEL = { override: 'Yönetici seçimi', env: 'Ortam değişkeni', default: 'Kod varsayılanı', none: 'Sağlayıcı yok' } as const;

/**
 * Modeller: görev sınıfı başına model seçimi (katalog denetimli, en geç 60 sn'de tüm örneklere yansır)
 * ve son 7 günün gerçek kullanımı (AIUsageLog).
 */
export default function ModelsTab({ initial }: { initial?: ModelsState | null }) {
  const query = useQuery({ queryKey: studioKeys.models(), queryFn: fetchModels, initialData: initial ?? undefined, staleTime: 15_000 });
  return (
    <QueryState query={query} skeleton="detail" error={{ title: 'Model bilgisi yüklenemedi' }}>
      {(s) => <ModelsBody s={s} />}
    </QueryState>
  );
}

function ModelsBody({ s }: { s: ModelsState }) {
  const px = usePromptStudioCopy();
  const qc = useQueryClient();
  const baseId = useId();
  const initialSel = () => Object.fromEntries(s.slots.map((x) => [x.slot, x.override && !x.overrideIgnored ? x.override : DEFAULT])) as Record<ModelSlot, string>;
  const [sel, setSel] = useState<Record<ModelSlot, string>>(initialSel);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSel(initialSel()), [s.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const orig = initialSel();
  const changed = MODEL_SLOTS.filter((k) => sel[k] !== orig[k]);
  const save = useMutation({
    mutationFn: () =>
      saveModels({
        routing: Object.fromEntries(changed.map((k) => [k, sel[k] === DEFAULT ? null : sel[k]])),
        reason,
        baseVersion: s.version,
      }),
    onSuccess: (next) => {
      qc.setQueryData(studioKeys.models(), next);
      setReason('');
      setError(null);
      toast.success('Model seçimi kaydedildi; en geç 1 dakikada tüm sunuculara yansır.');
    },
    onError: (e) => {
      if (isConflict(e)) {
        setError('Model seçimi başka bir oturumda değişti; güncel hâl yüklendi.');
        qc.invalidateQueries({ queryKey: studioKeys.models() });
        return;
      }
      setError(errorText(e));
    },
  });

  if (s.provider === 'none') {
    return <EmptyState title="AI sağlayıcısı yapılandırılmamış" description="GROQ_API_KEY ya da OPENAI_API_KEY tanımlı değil; hiçbir LLM çağrısı yapılmıyor ve model seçilemez." />;
  }

  const totalCalls = s.usage7d.reduce((a, b) => a + b.calls, 0);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Model seçimi"
        description={`Etkin sağlayıcı: ${s.provider === 'groq' ? 'Groq' : 'OpenAI'}. Yalnız bu sağlayıcının katalogdaki modelleri seçilebilir; “Varsayılan” ortam değişkeni ya da kod varsayılanını kullanır.`}
        icon={<Cpu />}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!changed.length) return setError('Değişiklik yok.');
            if (!reasonOk(reason)) return setError('Gerekçe en az 3 karakter olmalı.');
            save.mutate();
          }}
        >
          <ul className="space-y-4">
            {s.slots.map((slot) => {
              const id = `${baseId}-${slot.slot}`;
              const meta = MODEL_SLOT_META[slot.slot];
              return (
                <li key={slot.slot} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
                  <div className="space-y-1">
                    <Label htmlFor={id} className="font-medium">
                      {meta.title}
                    </Label>
                    <p className="qx-small text-fg-muted">{meta.description}</p>
                    <p className="qx-small flex flex-wrap items-center gap-2">
                      <span className="text-fg-muted">{px.current}</span>
                      <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">{slot.effective ?? '—'}</code>
                      <StatusBadge size="sm" tone={slot.source === 'override' ? 'brand' : 'neutral'} label={SOURCE_LABEL[slot.source]} icon={null} />
                    </p>
                    {slot.overrideIgnored ? (
                      <InlineError variant="field" tone="warning">
                        Kayıtlı seçim ({slot.override}) etkin sağlayıcının kataloğunda yok; yok sayılıyor.
                      </InlineError>
                    ) : null}
                  </div>
                  <Select value={sel[slot.slot]} onValueChange={(v) => setSel((p) => ({ ...p, [slot.slot]: v }))}>
                    <SelectTrigger id={id} className="min-h-11 sm:min-h-10" aria-label={`${meta.title} modeli`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT}>Varsayılan ({slot.envDefault ?? '—'})</SelectItem>
                      {s.catalog.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
          <details>
            <summary className="qx-small min-h-11 cursor-pointer content-center text-brand">{px.catalogNotes}</summary>
            <ul className="mt-1 space-y-1 text-sm">
              {s.catalog.map((m) => (
                <li key={m.id}>
                  <code className="text-xs">{m.id}</code> — {m.note}
                </li>
              ))}
            </ul>
          </details>
          <ReasonInput value={reason} onChange={setReason} />
          {error ? <InlineError variant="banner">{error}</InlineError> : null}
          <Button type="submit" className="min-h-11 sm:min-h-10" disabled={save.isPending || !changed.length}>
            {save.isPending ? 'Kaydediliyor…' : changed.length ? `${changed.length} seçimi kaydet` : 'Değişiklik yok'}
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Son 7 gün kullanım" description="AIUsageLog'dan; başarısız çağrılar dahil. Token sayısı sağlayıcının bildirdiği değerdir." icon={<Gauge />} density="flush">
        {s.usage7d.length === 0 ? (
          <EmptyState compact title="Son 7 günde AI çağrısı yok" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{px.usageCaption}</caption>
              <thead className="border-b border-border text-left text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Model</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{px.calls}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Pay</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Hata</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{px.tokens}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Ort. gecikme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.usage7d.map((u) => (
                  <tr key={u.model}>
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      <code className="text-xs">{u.model}</code>
                    </th>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtNumber(u.calls)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{percent(u.calls, totalCalls)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtNumber(u.failures)} <span className="text-fg-muted">({percent(u.failures, u.calls)})</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtNumber(u.inputTokens)} / {fmtNumber(u.outputTokens)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{u.avgLatencyMs != null ? `${fmtNumber(u.avgLatencyMs)} ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

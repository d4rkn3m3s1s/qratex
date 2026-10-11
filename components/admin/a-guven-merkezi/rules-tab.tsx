'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ChoiceChips } from '@/components/ds/a11y';
import { QueryState, SectionCard } from '@/components/states';
import {
  CASE_SEVERITIES,
  RULE_KEYS,
  RULE_LABEL,
  SEVERITY_LABEL,
  TrustRulesSchema,
  type CaseSeverity,
  type RuleKey,
  type RulesState,
  type TrustRules,
} from '@/lib/admin-trust/contract';
import { fetchRules, saveRules, trustKeys } from './api';
import { fmtAbs, fmtNum } from './format';
import { ReasonDialog } from './reason-dialog';

const SEVERITY_CHOICES = CASE_SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }));

type NumField = { key: string; label: string; unit: string; min: number; max: number };
const FIELDS: Record<RuleKey, { help: string; fields: NumField[] }> = {
  velocity: {
    help: 'Bir hesabın pencere içinde kazandığı puan (tüm kaynaklar, points_credited) eşiği aşarsa vaka açılır. Eşiğin 3 katı kritik sayılır.',
    fields: [
      { key: 'points', label: 'Eşik', unit: 'puan', min: 50, max: 1_000_000 },
      { key: 'windowHours', label: 'Pencere', unit: 'saat', min: 1, max: 168 },
    ],
  },
  rapidConsumption: {
    help: 'Bir müşterinin kartı pencere içinde eşik kadar okutulursa (tüm işletmeler) vaka açılır.',
    fields: [
      { key: 'count', label: 'Eşik', unit: 'tüketim', min: 2, max: 500 },
      { key: 'windowMinutes', label: 'Pencere', unit: 'dakika', min: 1, max: 1440 },
    ],
  },
  sharedIp: {
    help: 'Aynı genel IP adresinden pencere içinde eşik kadar farklı müşteri hesabı işlem yaparsa vaka açılır. Yerel/özel ağ adresleri sayılmaz.',
    fields: [
      { key: 'accounts', label: 'Eşik', unit: 'hesap', min: 2, max: 100 },
      { key: 'windowDays', label: 'Pencere', unit: 'gün', min: 1, max: 90 },
    ],
  },
};

/**
 * Tespit kuralları — eşikler sunucuda (Settings `trust.rules.v1`), varsayılan sunucudan.
 * Kurallar yalnız vaka AÇAR; hesap durumuna otomatik dokunmaz (karar operatörün).
 */
export function RulesTab() {
  const q = useQuery({ queryKey: trustKeys.rules(), queryFn: ({ signal }) => fetchRules(signal), staleTime: 30_000 });
  return (
    <QueryState query={q} skeleton="form" onRetry={() => q.refetch()}>
      {(state) => <RulesEditor state={state} />}
    </QueryState>
  );
}

function RulesEditor({ state }: { state: RulesState }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<TrustRules>(state.rules);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setDraft(state.rules), [state.rules]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(state.rules);
  const parsed = TrustRulesSchema.safeParse(draft);

  const patch = <K extends RuleKey>(k: K, v: Partial<TrustRules[K]>) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...v } }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {state.isDefault ? 'Sunucu varsayılan eşikleri kullanılıyor.' : `Son değişiklik: ${fmtAbs(state.version)}.`} Kurallar "Sinyalleri tara" ile çalışır ve yalnız vaka açar;
        aynı özne için açık vaka varsa ya da sinyal pencere içinde yanlış alarm olarak kapatıldıysa tekrar açmaz.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {RULE_KEYS.map((k) => (
          <RuleCard key={k} ruleKey={k} rule={draft[k] as TrustRules[RuleKey] & Record<string, unknown>} stats={state.stats[k]} onChange={(v) => patch(k, v)} />
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="min-h-11 sm:min-h-10" disabled={!dirty} onClick={() => setDraft(state.rules)}>
          <Undo2 className="h-4 w-4" aria-hidden />
          Değişiklikleri geri al
        </Button>
        <Button className="min-h-11 sm:min-h-10" disabled={!dirty || !parsed.success} onClick={() => setConfirm(true)}>
          <Save className="h-4 w-4" aria-hidden />
          Kuralları kaydet
        </Button>
      </div>
      {!parsed.success && dirty ? <p className="text-sm text-danger" role="alert">Bazı değerler izin verilen aralığın dışında.</p> : null}
      <ReasonDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Tespit kuralları güncellensin mi?"
        description="Yeni eşikler bir sonraki taramada geçerli olur. Önceki değerler denetim günlüğünde saklanır."
        confirmLabel="Kaydet"
        onConfirm={async ({ note }) => {
          if (!parsed.success) return;
          const next = await saveRules({ rules: parsed.data, baseVersion: state.version, reason: note });
          qc.setQueryData(trustKeys.rules(), next);
          void qc.invalidateQueries({ queryKey: trustKeys.overview() });
          toast.success('Kurallar kaydedildi.');
        }}
      />
    </div>
  );
}

function RuleCard({
  ruleKey,
  rule,
  stats,
  onChange,
}: {
  ruleKey: RuleKey;
  rule: TrustRules[RuleKey] & Record<string, unknown>;
  stats: RulesState['stats'][RuleKey];
  onChange: (v: Record<string, unknown>) => void;
}) {
  const id = useId();
  const meta = FIELDS[ruleKey];
  const fpRate = stats.resolved30d > 0 ? Math.round((stats.falsePositive30d / stats.resolved30d) * 100) : null;
  return (
    <SectionCard
      title={RULE_LABEL[ruleKey]}
      density="compact"
      tone={rule.enabled ? 'brand' : 'neutral'}
      stripe
      actions={
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-on`} className="text-sm">{rule.enabled ? 'Etkin' : 'Kapalı'}</Label>
          <Switch id={`${id}-on`} checked={rule.enabled} onCheckedChange={(v) => onChange({ enabled: v })} aria-label={`${RULE_LABEL[ruleKey]} kuralı`} />
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-fg-muted">{meta.help}</p>
        <div className="grid grid-cols-2 gap-3">
          {meta.fields.map((f) => {
            const v = rule[f.key] as number;
            const invalid = !Number.isInteger(v) || v < f.min || v > f.max;
            return (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`${id}-${f.key}`}>
                  {f.label} <span className="text-fg-muted">({f.unit})</span>
                </Label>
                <Input
                  id={`${id}-${f.key}`}
                  inputMode="numeric"
                  value={Number.isFinite(v) ? String(v) : ''}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, ''));
                    onChange({ [f.key]: Number.isFinite(n) ? n : 0 });
                  }}
                  disabled={!rule.enabled}
                  aria-invalid={invalid}
                  aria-describedby={`${id}-${f.key}-r`}
                  className="min-h-11 sm:min-h-10"
                />
                <p id={`${id}-${f.key}-r`} className={`text-xs ${invalid ? 'text-danger' : 'text-fg-muted'}`}>
                  {fmtNum(f.min)}–{fmtNum(f.max)}
                </p>
              </div>
            );
          })}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-fg" id={`${id}-sev`}>Açılan vakanın önemi</p>
          <ChoiceChips<CaseSeverity>
            aria-labelledby={`${id}-sev`}
            size="sm"
            options={SEVERITY_CHOICES}
            value={rule.severity}
            onChange={(v) => v && onChange({ severity: v })}
            disabled={!rule.enabled}
          />
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <div>
            <dt className="text-xs text-fg-muted">30 günde</dt>
            <dd className="font-semibold tabular-nums text-fg">{fmtNum(stats.triggered30d)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Açık</dt>
            <dd className="font-semibold tabular-nums text-fg">{fmtNum(stats.open)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Yanlış alarm</dt>
            <dd className="font-semibold tabular-nums text-fg" title={`${fmtNum(stats.falsePositive30d)} / ${fmtNum(stats.resolved30d)} çözülen`}>
              {fpRate === null ? '—' : `%${fpRate}`}
            </dd>
          </div>
        </dl>
      </div>
    </SectionCard>
  );
}

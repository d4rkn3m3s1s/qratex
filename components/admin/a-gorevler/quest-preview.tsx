'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import { ChoiceChips } from '@/components/ds/a11y';
import { QuestRow } from '@/components/customer/m-gorevler/quest-row';
import { useQuestCopy } from '@/components/customer/m-gorevler/copy';
import type { QuestDTO, QuestIcon } from '@/lib/quests/board-types';
import { MECHANIC_META, CADENCE_LABEL, type QuestCadence, type QuestMechanic } from '@/lib/admin-quests/contract';

function iconOf(raw: string): QuestIcon {
  const v = raw.trim();
  if (!v) return { kind: 'none' };
  if (v.startsWith('/')) return { kind: 'image', src: v };
  return v.length <= 16 ? { kind: 'emoji', value: v } : { kind: 'none' };
}

export type PreviewState = 'in_progress' | 'done';

/**
 * Müşteri görev satırının CANLI önizlemesi — müşteri panosunun gerçek bileşeni (QuestRow) ile
 * çizilir; admin'in gördüğü, müşterinin göreceğiyle aynıdır. Etkileşim yok (yalnız görünüm).
 */
export function QuestPreview({
  name,
  description,
  icon,
  cadence,
  mechanic,
  target,
  points,
  xp,
  expiresAt,
}: {
  name: string;
  description: string;
  icon: string;
  cadence: QuestCadence;
  mechanic: QuestMechanic;
  target: number;
  points: number;
  xp: number;
  expiresAt: string | null;
}) {
  const { copy, locale } = useQuestCopy();
  const [state, setState] = useState<PreviewState>('in_progress');
  const meta = MECHANIC_META[mechanic];
  const safeTarget = Number.isFinite(target) && target > 0 ? Math.floor(target) : 1;
  const auto = meta.autoReward;
  const dto: QuestDTO = {
    id: 'preview',
    name: name.trim() || 'Görev adı',
    description: description.trim(),
    icon: iconOf(icon),
    group: cadence === 'special' ? 'season' : cadence,
    period: cadence === 'special' ? 'once' : cadence,
    mechanic,
    tracking: meta.tracking,
    rewardMode: auto ? 'auto' : 'claim',
    progress: state === 'done' ? safeTarget : Math.floor(safeTarget / 2),
    target: safeTarget,
    reward: { points: Math.max(0, points || 0), xp: Math.max(0, xp || 0) },
    state: state === 'done' ? (auto ? 'auto_rewarded' : 'claimable') : 'in_progress',
    endsAt: expiresAt,
    claimDeadline: null,
    rewardedAt: null,
    cta: null,
  };

  return (
    <section aria-labelledby="quest-preview-title" className="space-y-3 rounded-card border border-subtle bg-surface-0 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="quest-preview-title" className="qx-small inline-flex items-center gap-1.5 font-semibold text-fg">
          <Eye className="h-4 w-4 text-fg-muted" aria-hidden />
          Müşteri önizlemesi
        </h3>
        <ChoiceChips
          aria-label="Önizleme durumu"
          size="sm"
          options={[
            { value: 'in_progress', label: 'İlerlerken' },
            { value: 'done', label: auto ? 'Tamamlanınca' : 'Ödül hazır' },
          ]}
          value={state}
          onChange={(v) => v && setState(v as PreviewState)}
        />
      </div>
      {/* inert: önizleme gerçek bileşen ama tıklanmaz/odaklanmaz. */}
      <div inert className="pointer-events-none select-none">
        <ul className="list-none">
          <QuestRow quest={dto} index={0} copy={copy} locale={locale} claiming={false} claimDisabled onOpen={() => undefined} onClaim={() => undefined} />
        </ul>
      </div>
      <p className="qx-caption text-fg-muted">
        {CADENCE_LABEL[cadence]} · {meta.label}
        {auto ? ' · ödül tamamlanınca otomatik' : meta.tracking === 'manual' ? ' · yalnız onayladığınız kullanıcıya görünür' : ' · müşteri “Ödülü al” der'}
      </p>
    </section>
  );
}

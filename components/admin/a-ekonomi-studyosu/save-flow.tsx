'use client';

import * as React from 'react';
import { DirtyBar } from '@/components/ds/form';
import { ConfirmAction, type ImpactPreview } from '@/components/states';
import { toast } from '@/lib/admin-toast';
import { diffJson } from '@/lib/admin-economy/contract';
import { ChangeList } from './parts';
import type { EditableResource } from './use-editable-resource';
import { AdminEkonomiStudyosuText } from './copy';

/**
 * "İncele ve yayınla" akışı: kirli çubuk → fark + etki önizlemeli onay diyaloğu → sürümlü
 * kaydetme. 409'da çubuk çakışma moduna geçer (güncel hâli yükle / bilerek üzerine yaz).
 * Doğrulama hatası varken diyalog açılmaz; ilk hata çubukta gösterilir.
 */
export function StudioSaveBar<D, M>({
  resource,
  title,
  validationErrors,
  labelOf,
  loadImpact,
  successMessage,
  confirmTone = 'warning',
}: {
  resource: EditableResource<D, M>;
  title: string;
  validationErrors: string[];
  labelOf?: (path: string) => string;
  loadImpact?: (draft: D) => Promise<ImpactPreview>;
  successMessage: string;
  confirmTone?: 'warning' | 'brand';
}) {
  const [open, setOpen] = React.useState(false);
  const changes = React.useMemo(
    () => (resource.dirty ? diffJson(resource.baseline, resource.draft) : []),
    [resource.dirty, resource.baseline, resource.draft]
  );
  const invalid = validationErrors.length > 0;

  if (resource.status !== 'ready') return null;

  return (
    <>
      <DirtyBar
        dirty={resource.dirty}
        saving={resource.saving}
        warnOnLeave={false}
        onSave={() => {
          if (invalid) {
            toast.error(validationErrors[0]);
            return;
          }
          setOpen(true);
        }}
        onDiscard={resource.discard}
        saveLabel="İncele ve yayınla"
        discardLabel="Değişiklikleri at"
        message={
          invalid
            ? `${validationErrors.length} alan düzeltilmeli: ${validationErrors[0]}`
            : `${title}: ${changes.length} alan değişti — henüz canlı değil`
        }
        error={resource.saveError ?? undefined}
        conflict={
          resource.conflict
            ? {
                message: resource.conflict.message,
                onReload: () => resource.reload(),
                onOverwrite: async () => {
                  if ((await resource.save({ overwrite: true })) === 'ok') toast.success(successMessage);
                },
              }
            : null
        }
      />
      <ConfirmAction
        open={open}
        onOpenChange={setOpen}
        tone={confirmTone}
        title={`${title} canlıya alınsın mı?`}
        description={
          <span className="block space-y-2">
            <span className="block"><AdminEkonomiStudyosuText k="saveWarning" /></span>
            <span className="block max-h-56 overflow-y-auto rounded-control border border-subtle p-2">
              <ChangeList changes={changes} labelOf={labelOf} max={20} />
            </span>
          </span>
        }
        loadImpact={loadImpact && resource.draft !== null ? () => loadImpact(resource.draft as D) : undefined}
        irreversibleNote={false}
        confirmLabel="Yayınla"
        onConfirm={async () => {
          const outcome = await resource.save();
          if (outcome === 'ok') {
            toast.success(successMessage);
            return;
          }
          // Çakışma: diyalog kapanır, çubuk çakışma moduna geçer. Diğer hata: diyalog açık kalır.
          if (outcome === 'error') throw new Error('Kaydedilemedi. Ayrıntı alttaki çubukta; tekrar deneyin.');
        }}
      />
    </>
  );
}

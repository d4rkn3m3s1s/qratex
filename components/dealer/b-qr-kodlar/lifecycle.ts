import type { ImpactItem } from '@/components/states';
import type { QrLifecycleAction } from '@/lib/dealer/qr-codes/rules';
import { fmtInt } from './format';
import type { QrCopy } from './copy';

export interface LifecycleCopy {
  title: string;
  description: string;
  confirm: string;
  tone: 'danger' | 'warning' | 'brand';
  done: string;
}

/** Onay metinleri — sonuç açıkça söylenir (rapor Bulgu 1: "yorumlar da gider" söylenmiyordu). */
const TONE: Record<QrLifecycleAction, LifecycleCopy['tone']> = { revoke: 'danger', unrevoke: 'brand', archive: 'warning', restore: 'brand', rotate: 'warning' };

export function lifecycleCopy(action: QrLifecycleAction, name: string, copy?: QrCopy): LifecycleCopy {
  if (copy) {
    const c = copy.lifecycle[action];
    return { title: c.title(name), description: c.description, confirm: c.confirm, tone: TONE[action], done: c.done };
  }
  switch (action) {
    case 'revoke':
      return {
        title: `“${name}” iptal edilsin mi?`,
        description: 'Basılı kod artık geri bildirim formunu açmaz. Geçmiş yorumlar korunur ve kod kotanızdan düşer. İptali sonradan geri alabilirsiniz.',
        confirm: 'İptal et',
        tone: 'danger',
        done: 'Kod iptal edildi',
      };
    case 'unrevoke':
      return {
        title: `“${name}” yeniden açılsın mı?`,
        description: 'Kod yeniden tarama kabul eder ve etkin kod kotanızdan bir hak kullanır.',
        confirm: 'İptali geri al',
        tone: 'brand',
        done: 'Kod yeniden açıldı',
      };
    case 'archive':
      return {
        title: `“${name}” arşivlensin mi?`,
        description: 'Kod listeden kalkar ve tarama almaz; yorumlar, analizler ve telafiler silinmez. Arşiv filtresinden geri alabilirsiniz.',
        confirm: 'Arşivle',
        tone: 'warning',
        done: 'Kod arşivlendi',
      };
    case 'restore':
      return {
        title: `“${name}” arşivden geri alınsın mı?`,
        description: 'Kod yeniden listede görünür. Arşivlenirken iptal edildiyse yeniden açılır ve kota hakkı kullanır.',
        confirm: 'Geri al',
        tone: 'brand',
        done: 'Kod arşivden geri alındı',
      };
    case 'rotate':
      return {
        title: `“${name}” için yeni kod üretilsin mi?`,
        description:
          'Kod çalındıysa ya da kopyalandıysa kullanın. Aynı ayarlarla yeni bir kod oluşur, eskisi iptal edilir; eski basılı kartlar artık çalışmaz, yenilerini basmanız gerekir. Kotanız değişmez.',
        confirm: 'Yeni kod üret',
        tone: 'warning',
        done: 'Yeni kod üretildi — basılı kartları yenileyin',
      };
  }
}

export function lifecycleImpact(action: QrLifecycleAction, feedbackTotal: number, copy?: QrCopy): ImpactItem[] {
  const t = copy?.impact;
  const items: ImpactItem[] = [{ label: t?.linked ?? 'Bağlı yorumlar', value: t ? t.kept(fmtInt(feedbackTotal)) : `${fmtInt(feedbackTotal)} — korunur` }];
  if (action === 'revoke' || action === 'rotate') items.push({ label: t?.printed ?? 'Basılı kartlar', value: t?.stopsWorking ?? 'Çalışmaz hâle gelir', emphasis: true });
  if (action === 'unrevoke' || action === 'restore') items.push({ label: t?.quota ?? 'Kota', value: t?.usesQuota ?? '1 etkin kod hakkı kullanılır' });
  return items;
}

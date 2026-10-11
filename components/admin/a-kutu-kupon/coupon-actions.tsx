'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Power, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/states';
import type { CouponListItem } from '@/lib/admin-coupons/contract';
import { couponKeys, updateCoupon } from './api';
import { fmtNumber } from './format';

/** Pasifleştir / yeniden etkinleştir — sürüm kontrollü PATCH, etki önizlemeli onay. */
export function CouponActions({ coupon, compact = false }: { coupon: CouponListItem; compact?: boolean }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: couponKeys.all });

  if (!coupon.isActive) {
    return (
      <ConfirmAction
        tone="brand"
        trigger={
          <Button variant="outline" size={compact ? 'sm' : 'default'} className="min-h-11 sm:min-h-9" aria-label={`${coupon.code} kuponunu yeniden etkinleştir`}>
            <Power className="h-4 w-4" aria-hidden />
            {compact ? null : 'Etkinleştir'}
          </Button>
        }
        title={`${coupon.code} yeniden etkinleştirilsin mi?`}
        description="Kod yeniden kullanılabilir olur; süresi dolmuşsa ya da limiti dolmuşsa yine kullanılamaz."
        impact={[{ label: 'Şimdiye kadar kullanım', value: fmtNumber(coupon.usedCount) }]}
        confirmLabel="Etkinleştir"
        irreversibleNote={false}
        onConfirm={async () => {
          await updateCoupon(coupon.id, { baseVersion: coupon.updatedAt, isActive: true });
          toast.success(`${coupon.code} etkinleştirildi.`);
          await refresh();
        }}
      />
    );
  }
  return (
    <ConfirmAction
      tone="warning"
      trigger={
        <Button variant="outline" size={compact ? 'sm' : 'default'} className="min-h-11 sm:min-h-9" aria-label={`${coupon.code} kuponunu pasifleştir`}>
          <PowerOff className="h-4 w-4" aria-hidden />
          {compact ? null : 'Pasifleştir'}
        </Button>
      }
      title={`${coupon.code} pasifleştirilsin mi?`}
      description="Kod artık kullanılamaz. Kullanım geçmişi korunur; istediğiniz zaman yeniden etkinleştirebilirsiniz."
      impact={[
        { label: 'Şimdiye kadar kullanım', value: fmtNumber(coupon.usedCount) },
        { label: 'Kalan hak', value: coupon.maxUses == null ? 'Sınırsız' : fmtNumber(Math.max(0, coupon.maxUses - coupon.usedCount)), emphasis: true },
      ]}
      confirmLabel="Pasifleştir"
      irreversibleNote={false}
      onConfirm={async () => {
        await updateCoupon(coupon.id, { baseVersion: coupon.updatedAt, isActive: false });
        toast.success(`${coupon.code} pasifleştirildi.`);
        await refresh();
      }}
    />
  );
}

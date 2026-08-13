'use client';

import { useState } from 'react';
import { Ticket, Loader2, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/admin-toast';
import { track } from '@/lib/analytics';

/**
 * Müşteri kupon kullanım kartı. /api/customer/redeem-coupon'a bağlı.
 * Müşteri kodu girer → atomik kullanım + tek-kullanım kontrolü backend'de.
 */
export function CouponRedeemCard({ labels }: { labels?: { title?: string; placeholder?: string; button?: string } }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  const title = labels?.title ?? 'Kupon kodu';
  const placeholder = labels?.placeholder ?? 'Kodu girin (ör. YAZ2026)';
  const button = labels?.button ?? 'Kullan';

  const redeem = async () => {
    const c = code.trim();
    if (c.length < 3) {
      toast.error('Geçerli bir kod girin');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/customer/redeem-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kupon kullanılamadı');
      track('reward_redeemed', { code: data.coupon?.code ?? c.toUpperCase() });
      toast.success(data.message || 'Kupon tanımlandı');
      setApplied(data.coupon?.code ?? c.toUpperCase());
      setCode('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kupon kullanılamadı');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label className="flex items-center gap-1.5 text-sm font-medium">
            <Ticket className="h-4 w-4" />
            {title}
          </label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && redeem()}
            placeholder={placeholder}
            disabled={loading}
            className="uppercase"
          />
        </div>
        <Button onClick={redeem} disabled={loading || code.trim().length < 3}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : applied ? <Check className="h-4 w-4" /> : <Ticket className="h-4 w-4" />}
          {button}
        </Button>
      </CardContent>
      {applied && (
        <CardContent className="pt-0">
          <p className="text-xs text-green-600">✓ {applied} kuponu hesabınıza tanımlandı.</p>
        </CardContent>
      )}
    </Card>
  );
}

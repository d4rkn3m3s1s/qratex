'use client';

import { useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type BootstrapAction =
  | 'quests_defaults'
  | 'assign_ab_cohorts'
  | 'ensure_ai_settings'
  | 'synthesize_ai_signals'
  | 'seed_insights_categories'
  | 'seed_suspicious_activities'
  | 'seed_ai_quality_samples'
  | 'clear_insights_categories'
  | 'clear_suspicious_activities'
  | 'clear_ai_quality_samples';

type BootstrapActionButtonProps = {
  action: BootstrapAction;
  label: string;
  onDone?: () => void | Promise<void>;
  reloadOnDone?: boolean;
  variant?: 'default' | 'outline' | 'secondary' | 'destructive';
  size?: 'default' | 'sm';
};

export function BootstrapActionButton({
  action,
  label,
  onDone,
  reloadOnDone = false,
  variant = 'outline',
  size = 'sm',
}: BootstrapActionButtonProps) {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'İşlem başarısız');
      }
      const parts: string[] = [];
      if (typeof data.created === 'number') parts.push(`oluşturulan: ${data.created}`);
      if (typeof data.cleared === 'number') parts.push(`silinen: ${data.cleared}`);
      if (typeof data.updated === 'number') parts.push(`güncellenen: ${data.updated}`);
      if (typeof data.assigned === 'number') parts.push(`atanan: ${data.assigned}`);
      if (typeof data.usersReset === 'number') parts.push(`resetlenen kullanıcı: ${data.usersReset}`);
      if (typeof data.scanned === 'number') parts.push(`taranan: ${data.scanned}`);
      const message = parts.length > 0 ? parts.join(' • ') : data.message || 'İşlem tamamlandı';
      toast.success(message);
      await onDone?.();
      if (reloadOnDone) {
        window.location.reload();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'İşlem başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={run} disabled={loading} className="gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
      {label}
    </Button>
  );
}

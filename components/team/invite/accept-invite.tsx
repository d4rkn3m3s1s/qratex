'use client';

/** Ekip davetini kabul ekranı (müşteri + admin paneli ortak). Token URL'den gelir, sunucuda doğrulanır. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AcceptTeamInvite({ token, nextHref }: { token: string; nextHref: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(token ? null : 'Davet bağlantısı eksik ya da bozuk.');

  const accept = async () => {
    setState('busy');
    setError(null);
    try {
      const res = await fetch('/api/admin/team/invitations/accept', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(json?.message || 'Davet kabul edilemedi.');
      setState('done');
      router.replace(nextHref);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Davet kabul edilemedi.');
      setState('idle');
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-xl border border-subtle bg-surface p-6 text-center">
      <Users className="mx-auto h-8 w-8 text-brand" aria-hidden />
      <h1 className="text-xl font-semibold">Ekip daveti</h1>
      <p className="text-sm text-fg-muted">
        QRATEX iç ekibine davet edildiniz. Kabul ettiğinizde ekip çalışma alanı hesabınıza açılır.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {state === 'done' ? (
        <p className="text-sm text-success">Ekibe katıldınız, yönlendiriliyorsunuz…</p>
      ) : (
        <Button className="min-h-11 w-full" onClick={() => void accept()} disabled={!token || state === 'busy'}>
          {state === 'busy' ? 'Kabul ediliyor…' : 'Daveti kabul et'}
        </Button>
      )}
    </div>
  );
}

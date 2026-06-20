'use client';

import { useEffect, useState } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Check, X, Send, Users } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type Proposal = {
  id: string;
  segmentKey: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
  dealer: { id: string; businessName: string | null; name: string | null; email: string | null };
};

export default function AdminSegmentProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchList = () => {
    setLoading(true);
    fetch('/api/admin/innovation/segment-proposals')
      .then((r) => r.json())
      .then((d) => setProposals(Array.isArray(d.proposals) ? d.proposals : []))
      .catch(() => toast.error('Öneriler yüklenemedi'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const decide = (id: string, status: 'APPROVED' | 'REJECTED' | 'SENT') => {
    setBusy(id);
    fetch(`/api/admin/innovation/segment-proposals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        toast.success(
          status === 'APPROVED' ? 'Onaylandı' : status === 'REJECTED' ? 'Reddedildi' : 'Gönderildi olarak işaretlendi'
        );
        // Onay kuyruğu yalnızca PENDING gösterir → kararı verilen listeden düşer.
        setProposals((prev) => prev.filter((p) => p.id !== id));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'İşlem başarısız'))
      .finally(() => setBusy(null));
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <AdminPremiumHero
        title="Segment Kampanya Önerileri"
        description="Bayilerin önerdiği segment kampanyalarını onaylayın veya reddedin"
        icon={<Users className="text-white" />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Onay kuyruğu</CardTitle>
          <CardDescription>Yalnızca beklemedeki (PENDING) öneriler listelenir.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bekleyen öneri yok.</p>
          ) : (
            <ul className="space-y-3">
              {proposals.map((p) => (
                <li key={p.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.dealer.businessName || p.dealer.name || p.dealer.email || p.dealer.id} ·{' '}
                        <span className="rounded bg-muted px-1.5 py-0.5">{p.segmentKey}</span> ·{' '}
                        {new Date(p.createdAt).toLocaleDateString('tr-TR')}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.message}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => decide(p.id, 'APPROVED')}>
                        {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Onayla
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => decide(p.id, 'REJECTED')}>
                        <X className="h-4 w-4 text-destructive" />
                        Reddet
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => decide(p.id, 'SENT')} title="Gönderildi olarak işaretle">
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Layers, Beaker, Target, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';

type Playbook = {
  id: string;
  title: string;
  summary: string;
  segmentHint: string;
  triggers: string[];
  dealerActions: string[];
  customerIdeas: string[];
  metricsToWatch: string[];
};

export default function AdminPlaybooksPage() {
  const [list, setList] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealers, setDealers] = useState<{ id: string; label: string }[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyPbId, setApplyPbId] = useState<string | null>(null);
  const [dealerId, setDealerId] = useState<string>('');
  const [createQuest, setCreateQuest] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/playbooks');
        const data = await res.json();
        if (!cancelled && data.success) setList(data.playbooks ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/users?role=DEALER&pageSize=60');
        const j = await r.json();
        const items = (j.items ?? []) as { id: string; businessName: string | null; name: string | null }[];
        if (!cancelled) {
          setDealers(
            items.map((u) => ({
              id: u.id,
              label: u.businessName || u.name || u.id.slice(0, 8),
            }))
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6 pb-8 w-full">
      <AdminPremiumHero
        eyebrow="Büyüme"
        title="Playbook kütüphanesi"
        description="Segment ve deney fikirleri için hazır şablonlar. Segment, A/B test ve görev akışlarıyla birlikte kullanın."
        icon={<BookOpen className="text-white" />}
        chips={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
              <Link href="/admin/segments">
                <Layers className="h-4 w-4 mr-2" />
                Segmentler
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
              <Link href="/admin/ab-testing">
                <Beaker className="h-4 w-4 mr-2" />
                A/B testleri
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
              <Link href="/admin/quests">
                <Target className="h-4 w-4 mr-2" />
                Görevler
              </Link>
            </Button>
          </div>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Yükleniyor…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((pb) => (
            <Card key={pb.id} className="border-border/70 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg break-words">{pb.title}</CardTitle>
                  <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                    {pb.id}
                  </Badge>
                </div>
                <CardDescription>{pb.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Segment ipucu</p>
                  <p className="mt-1 font-mono text-xs bg-muted/50 rounded-md p-2 border border-border/50 break-all">{pb.segmentHint}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Tetikleyiciler</p>
                  <ul className="mt-1 list-disc list-inside text-muted-foreground space-y-0.5">
                    {pb.triggers.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Bayi aksiyonları</p>
                  <ul className="mt-1 list-disc list-inside space-y-0.5">
                    {pb.dealerActions.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-sky-600 dark:text-sky-400">Müşteri deneyimi</p>
                  <ul className="mt-1 list-disc list-inside space-y-0.5">
                    {pb.customerIdeas.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">İzlenecek metrikler</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pb.metricsToWatch.join(' · ')}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setApplyPbId(pb.id);
                    setApplyOpen(true);
                  }}
                >
                  <Send className="h-3.5 w-3.5 mr-2" />
                  Bayiye taslak oluştur
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Playbook → kampanya taslağı</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Bayi</Label>
              <Select value={dealerId} onValueChange={setDealerId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Bayi seçin" />
                </SelectTrigger>
                <SelectContent>
                  {dealers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={createQuest}
                onChange={(e) => setCreateQuest(e.target.checked)}
                className="rounded border"
              />
              Global haftalık görev taslağı da oluştur
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setApplyOpen(false)}>
              Vazgeç
            </Button>
            <Button
              disabled={!dealerId || !applyPbId || applying}
              onClick={async () => {
                if (!applyPbId || !dealerId) return;
                setApplying(true);
                try {
                  const r = await fetch('/api/admin/playbooks/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      playbookId: applyPbId,
                      dealerId,
                      createCampaign: true,
                      createQuest,
                    }),
                  });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error || 'Uygulanamadı');
                  toast.success(
                    `Kampanya taslağı${j.questId ? ' ve görev' : ''} oluşturuldu. Bayi: Kampanyalar sayfasında \"Taslak\" olarak görünür (Kampanya ID: ${j.campaignId ?? '—'}).`
                  );
                  setApplyOpen(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Hata');
                } finally {
                  setApplying(false);
                }
              }}
            >
              Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
